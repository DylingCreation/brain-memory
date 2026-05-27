# ISearchIndex 伴随索引 — 技术调研

| 字段 | 内容 |
|------|------|
| **日期** | 2026-05-25 |
| **调研人** | OpenClaw CodingHelper |
| **调研目的** | 为 v2.0.0 LanceDB Companion Index 架构设计 ISearchIndex 接口及三路召回方案 |
| **前置条件** | 老板指定：SQLite=真值，LanceDB=伴随索引（可重建），写法 SQLite 先 → LanceDB 同步 |
| **关联提案** | scope-upgrade-v2.md · web-ui-design.md |

---

## 一、现状调研 — 当前召回链路

### 1.1 双路径召回（当前）

```
query
  │
  ├→ 精确路径 (getPreciseSeeds)
  │     ├─ embed(query) → vectorSearchWithScore → 向量种子
  │     ├─ FTS5 searchNodes → 关键词种子
  │     └─ findCommunityPeers → 社区扩展
  │
  ├→ 泛化路径 (getGeneralizedSeeds)
  │     ├─ embed(query) → communityVectorSearch → 匹配社区
  │     └─ findNodesByCommunities → 社区成员
  │
  └→ unifiedSeeds → graphWalk → PPR → decay → sort → slice(limit) → Result
```

**关键观察**：
- 向量搜索和 FTS5 都走 SQLite（`bm_vectors` 表存 BLOB embedding）
- LanceDB 仅用于 `vectorSearchWithScore`（当 adapter 是 LanceDB 时），但当前生产用 SQLite
- 当前没有"三路融合"——精确+泛化是串联的（先精确种子 → 泛化补漏），不是并行三路

### 1.2 向量写路径（当前）

```
processTurn → batchSyncEmbed(nodes)
  → 对每个 node: MD5(content) → 与已有 hash 比较 → embed → saveVector
  → saveVector → SQLite bm_vectors 表 (BLOB)
```

LanceDB adapter 的 `saveVector` 写 LanceDB 表，但 Node CRUD 是内存 Map（POC）。

---

## 二、目标架构 — v2.0.0 三路召回

### 2.1 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    读路径（三路召回 + 融合）                    │
│                                                             │
│  query                                                      │
│    │                                                        │
│    ├── ① SQLite 关键词                                       │
│    │     FTS5 searchNodes → scored by BM25                   │
│    │                                                        │
│    ├── ② LanceDB 语义                                        │
│    │     embed(query) → semanticSearch → scored by cosine   │
│    │                                                        │
│    ├── ③ 长期记忆 (Agent USER/MEMORY 文件)                    │
│    │     人工沉淀的 profile/preferences → exact match        │
│    │                                                        │
│    └──→ merge → dedup → score → recency boost → budget     │
│              → RecallResult                                  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    写路径（真值优先）                          │
│                                                             │
│  processTurn / 手动添加                                       │
│    │                                                        │
│    ├── ① SQLite: upsertNode (真值)                           │
│    │        + saveVector (embed BLOB，兼容旧逻辑)              │
│    │                                                        │
│    └── ② LanceDB: indexNode (异步，fire-and-forget)           │
│            失败不影响主流程，下次可从 SQLite 重建                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    索引恢复/重建                              │
│                                                             │
│  searchIndex.rebuild()                                       │
│    → findAllActive() from SQLite                             │
│    → batchEmbed(nodes)                                       │
│    → bulkIndex(nodesWithVectors) into LanceDB                │
│    → 可用于: Embedding 模型切换 / 索引损坏恢复 / 全新部署      │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 与旧架构的关键区别

| 维度 | 旧（v1.x） | 新（v2.0.0） |
|------|-----------|-------------|
| LanceDB 角色 | 可选的 IStorageAdapter 实现 | 固定的 ISearchIndex 伴随索引 |
| 写路径 | SQLite OR LanceDB 二选一 | SQLite 先写 → LanceDB 异步同步 |
| 读路径 | 双路径（精确+泛化串联） | 三路并行（关键词+语义+长期记忆） |
| 索引恢复 | 不支持 | `rebuild()` 全量重建 |
| Embedding 迁移 | 不支持 | 从 SQLite 批量 re-embed 重建 |

---

## 三、ISearchIndex 接口设计

### 3.1 接口定义

```typescript
// src/store/search-index.ts

import type { BmNode } from '../types';
import type { MemoryScopeV2, ScopeFilterV2 } from '../scope/isolation';

/**
 * SearchIndex — 伴随语义索引。
 * 
 * 非真值存储（真值在 SQLite），可随时从 SQLite 全量重建。
 * 当前实现：LanceDB。未来可扩展到 Pinecone、Weaviate 等。
 */
export interface ISearchIndex {
  // ─── 索引写（异步，不阻塞） ───

  /** 索引单个节点。node.content 已完整，embedding 由调用方计算。 */
  indexNode(node: BmNode, embedding: number[]): Promise<void>;

  /** 批量索引。优化：单次 LanceDB add() 比逐条快 10-50x。 */
  indexNodes(nodes: Array<{ node: BmNode; embedding: number[] }>): Promise<void>;

  /** 从索引中删除节点。 */
  removeNode(nodeId: string): Promise<void>;

  // ─── 索引读 ───

  /** 语义搜索。返回按 cosine 相似度排序的节点 ID + 分数。 */
  semanticSearch(queryVec: number[], limit: number, filter?: ScopeFilterV2): Promise<ScoredNodeId[]>;

  // ─── 生命周期 ───

  /** 从 SQLite 真值源全量重建索引。删除旧索引 → embed 全量 → 批量写入。 */
  rebuild(sourceNodes: BmNode[], embedFn: (text: string) => Promise<number[]>): Promise<void>;

  /** 返回索引中的节点数。用于健康检查验证 SQLite 节点数 = 索引节点数。 */
  count(): Promise<number>;
}

/** 语义搜索结果：节点 ID + cosine 相似度分数 [0, 1]。 */
export interface ScoredNodeId {
  nodeId: string;
  score: number;  // cosine similarity, [0, 1]
}
```

### 3.2 为什么返回 nodeId 而非 BmNode

- ISearchIndex 不持有真值，只持有 embedding → nodeId 映射
- 调用方用 `nodeId` 从 `IStorageAdapter` 查真值
- 这保证了 SQLite 始终是权威数据源

### 3.3 LanceDB 实现预估

```typescript
// src/store/lancedb-search-index.ts

export class LanceDBSearchIndex implements ISearchIndex {
  private table: LanceTable;

  async indexNode(node: BmNode, embedding: number[]): Promise<void> {
    await this.table.add([{
      node_id: node.id,
      vector: embedding,
      scope_platform: node.scopePlatform,
      scope_chat: node.scopeChat,
      scope_user: node.scopeUser,
      // ... 其他 scope 字段用于过滤
    }]);
  }

  async semanticSearch(queryVec: number[], limit: number, filter?: ScopeFilterV2): Promise<ScoredNodeId[]> {
    let q = this.table.search(queryVec).limit(limit);
    // 如果 LanceDB 支持 pre-filtering，加 scope 过滤
    if (filter) {
      // q = q.where(buildScopeFilter(filter));
    }
    const results = await q.toArray();
    return results.map(r => ({
      nodeId: r.node_id as string,
      score: r._distance ? 1 - (r._distance as number) : 0,
    }));
  }

  async rebuild(sourceNodes: BmNode[], embedFn: (text: string) => Promise<number[]>): Promise<void> {
    await this.table.drop();
    // 新创建表
    const batched: Array<{ node: BmNode; embedding: number[] }> = [];
    for (const node of sourceNodes) {
      const vec = await embedFn(node.content);
      batched.push({ node, embedding: vec });
    }
    await this.indexNodes(batched);
  }
}
```

---

## 四、三路召回的合并/去重/打分算法

### 4.1 召回三路

```typescript
async function threeWayRecall(
  query: string,
  storage: IStorageAdapter,
  searchIndex: ISearchIndex,
  longTermMemories: BmNode[],  // 从 Agent 文件读入
  embedFn: EmbedFn,
  scopeFilter: ScopeFilterV2,
  limit: number,
): Promise<RecallResult> {

  // 并行三路
  const [keywordResults, semanticResults] = await Promise.all([
    // ① SQLite 关键词 (FTS5)
    storage.searchNodes(query, limit * 2, scopeFilter),
    // ② LanceDB 语义
    (async () => {
      const vec = await embedFn(query);
      const scored = await searchIndex.semanticSearch(vec, limit * 2, scopeFilter);
      // 从 SQLite 查真值
      return scored.map(s => ({
        node: storage.findNodeById(s.nodeId)!,
        score: s.score,
      }));
    })(),
  ]);

  // ③ 长期记忆 (已有 BmNode 对象，无需向量搜索)
  const longTermResults = longTermMemories as ScoredNode[];

  // ... 合并去重打分 ...
}
```

### 4.2 去重策略

```
以 node.id 为主键去重。
同名但不同 id 的节点（如两个 "TypeScript" 节点）：
  — 当前不做去重（由 fusion 周期性处理）
  — 召回阶段保留两者，让 PPR + 社区结构决定排名
```

```typescript
function dedupByNodeId(items: ScoredNode[]): ScoredNode[] {
  const seen = new Set<string>();
  return items.filter(n => {
    if (seen.has(n.node.id)) return false;
    seen.add(n.node.id);
    return true;
  });
}
```

### 4.3 打分融合（三路 → 单分数）

```typescript
/**
 * 三路分数融合。
 * 策略：Min-Max 归一化各路分数 → 加权求和 → recency boost → 排序。
 */
function fuseScores(
  keywordItems: ScoredNode[],
  semanticItems: ScoredNode[],
  longTermItems: ScoredNode[],
): ScoredNode[] {

  // Step 1: 各路独立 Min-Max 归一化到 [0, 1]
  const normKeyword = minMaxNormalize(keywordItems);
  const normSemantic = minMaxNormalize(semanticItems);
  const normLongTerm = minMaxNormalize(longTermItems);  // 长期记忆默认 score=1.0

  // Step 2: 合并为 Map<nodeId, { keywordScore, semanticScore, longTermScore }>
  const fused = new Map<string, {
    node: BmNode;
    keywordScore: number;
    semanticScore: number;
    longTermScore: number;
  }>();

  for (const n of normKeyword) {
    fused.set(n.node.id, { node: n.node, keywordScore: n.score, semanticScore: 0, longTermScore: 0 });
  }
  for (const n of normSemantic) {
    const existing = fused.get(n.node.id);
    if (existing) {
      // 两路都命中 → 加权融合
      existing.semanticScore = n.score;
    } else {
      fused.set(n.node.id, { node: n.node, keywordScore: 0, semanticScore: n.score, longTermScore: 0 });
    }
  }
  for (const n of normLongTerm) {
    const existing = fused.get(n.node.id);
    if (existing) {
      existing.longTermScore = n.score;
    } else {
      fused.set(n.node.id, { node: n.node, keywordScore: 0, semanticScore: 0, longTermScore: n.score });
    }
  }

  // Step 3: 加权融合
  // 两路命中 > 单路命中；三路命中最高
  // keyword 精准度高 → 权重 0.5
  // semantic 覆盖面大 → 权重 0.4
  // longTerm 用户明确记录的 → 权重 0.6
  const KEYWORD_WEIGHT = 0.5;
  const SEMANTIC_WEIGHT = 0.4;
  const LONGTERM_WEIGHT = 0.6;

  const result = Array.from(fused.values()).map(f => ({
    node: f.node,
    score:
      f.keywordScore * KEYWORD_WEIGHT +
      f.semanticScore * SEMANTIC_WEIGHT +
      f.longTermScore * LONGTERM_WEIGHT,
  }));

  // Step 4: 显著性奖励（多路命中）
  const paths = (f: typeof result[0]) =>
    (f.keywordScore > 0 ? 1 : 0) +
    (f.semanticScore > 0 ? 1 : 0) +
    (f.longTermScore > 0 ? 1 : 0);

  return result.map(r => ({
    ...r,
    score: r.score * (1 + 0.2 * (paths(r as any) - 1)),  // +20% per extra path
  }));
}
```

### 4.4 Recency Boost（时间新鲜度）

```typescript
/**
 * 时间衰减加权：越新的记忆分数越高。
 * Weibull decay 已经内建了时间衰减，此处额外追加 recency boost。
 * 仅当 query 包含时间敏感词时触发。
 */
function applyRecencyBoost(items: ScoredNode[], query: string): ScoredNode[] {
  const TIME_SENSITIVE_QUERIES = /最新|最近|当前|今天|现在|new|latest|current|recent|today|now/i;
  if (!TIME_SENSITIVE_QUERIES.test(query)) return items;

  const now = Date.now();
  const RECENCY_WINDOW = 7 * 24 * 3600 * 1000; // 7 天

  return items.map(item => {
    const ageMs = now - item.node.updatedAt;
    const recencyFactor = Math.max(0.5, 1 - ageMs / RECENCY_WINDOW);
    return { ...item, score: item.score * recencyFactor };
  });
}
```

---

## 五、LanceDB 写同步策略

### 5.1 实时同步 vs 定期重建

| 策略 | 优点 | 缺点 | 推荐 |
|------|------|------|------|
| **实时同步** 每次写入后 fire-and-forget | 索引始终最新 | 潜在的不一致窗口 | ✅ 生产默认 |
| **定期全量重建** 每小时/每天从 SQLite 重建 | 一致性强 | 有延迟 | 备份/恢复时用 |
| **混合** 实时增量 + 定期全量校验 | 兼顾两者 | 复杂度高 | v2.1.0 考虑 |

**推荐：实时同步（fire-and-forget）**。原因：
- LanceDB 是索引，不是真值——短暂不一致可接受
- 同步失败不影响主流程（下次索引会覆盖）
- `rebuild()` 作为安全网，任何不一致都可以修复

### 5.2 写入流程

```typescript
// ContextEngine.processTurn() 或手动添加

async function writeWithIndex(
  storage: IStorageAdapter,
  searchIndex: ISearchIndex,
  input: NodeUpsertInput,
  sessionId: string,
  embedFn: EmbedFn,
): Promise<BmNode> {
  // ① 写 SQLite 真值（同步）
  const { node } = storage.upsertNode(input, sessionId);

  // ② 计算 embedding
  let vec: number[];
  try {
    vec = await embedFn(node.content);
  } catch {
    return node;  // embedding 失败 → 不影响真值写入
  }

  // ③ 写 SQLite bm_vectors（兼容旧逻辑）
  try { storage.saveVector(node.id, node.content, vec); } catch { /* ignore */ }

  // ④ 写 LanceDB 索引（fire-and-forget，不 await）
  searchIndex.indexNode(node, vec).catch(err => {
    logger.warn('search-index', `indexNode failed for ${node.id}: ${err}`);
  });

  return node;
}
```

### 5.3 同步失败处理

```
LanceDB 写入失败
  → warn 日志（记录 nodeId + 错误原因）
  → 不影响 SQLite 真值
  → 不影响后续操作
  → 下次 rebuild() 时自动修复

查询时缺失
  → 三路召回中 LanceDB 路可能漏掉该节点
  → SQLite 关键词路仍然可以召回
  → 用户体验无损
```

---

## 六、索引恢复/重建流程

### 6.1 触发场景

| 场景 | 触发方式 |
|------|---------|
| 新 Embedding 模型切换 | `rebuild(sourceNodes, newEmbedFn)` |
| 索引损坏 | 自动检测 + `rebuild()` |
| 全新部署 | 首次启动时 `rebuild()` |
| 周期性校验 | `searchIndex.count() !== storage.getStats().activeNodes` |

### 6.2 重建流程

```
rebuild(sourceNodes, embedFn)
  │
  ├─ ① batchEmbed(nodes) → vectors
  │     ├─ 分块嵌入（避免单次调用过大）
  │     └─ 失败重试 3 次
  │
  ├─ ② 删除旧 LanceDB 表
  │
  └─ ③ bulkIndex → LanceDB
        └─ 单次 add(vectors[]) → 比逐条快 10-50x
```

---

## 七、与 God Object 拆分（F-18）的交叠点

ISearchIndex 独立于 IStorageAdapter，但两者在 `store/` 下共存：

```
store/
├── storage/                  ← IStorageAdapter（真值存储）
│   ├── adapter.ts            ← 接口定义
│   ├── sqlite.ts             ← SQLiteStorageAdapter
│   └── nodes.ts / edges.ts  ← God Object 拆分后的子模块
│
├── search/                   ← ISearchIndex（伴随索引）
│   ├── index.ts              ← ISearchIndex 接口
│   ├── lancedb.ts            ← LanceDBSearchIndex 实现
│   └── rebuild.ts            ← rebuild 工具
│
└── store.ts                  ← 重构后变为 thin re-export
```

God Object 拆分时，`store.ts` 中的向量操作（`saveVector`/`getVector`/`vectorSearch`）**不需要移到 `search/`**——它们是对 SQLite `bm_vectors` 表的操作，属于真值存储层。`search/` 是独立的伴随索引层。

---

## 八、Scope v2 在 ISearchIndex 中的过滤

LanceDB 需要存储 scope 字段以支持前置过滤：

```typescript
// LanceDB 表 schema
{
  node_id: string,        // 主键
  vector: float32[1024],  // embedding
  scope_id: string,       // scope hash — 快速匹配
  scope_platform: string, // 用于维度过滤
  scope_chat: string,
  scope_user: string,
}
```

**过滤策略**：
- 有 `scope_id` 精确匹配时 → 单列快速过滤
- 有维度过滤（如 `platform='qqbot'`）→ 多列 AND
- 无 scope 过滤（跨 scope 查询）→ 不下推，返回后由调用方过滤
- LanceDB 的 pre-filtering 效率取决于其实现——如果不够快，改为 post-filter（返回后 JS 过滤）

---

## 九、风险与建议

| 风险 | 缓解 |
|------|------|
| LanceDB `semanticSearch` 的 scope pre-filter 性能未知 | 先实现 post-filter，验证后再优化为 pre-filter |
| 实时同步 + 定期重建可能产生重复写入 | LanceDB 的 add() 是 append-only，需在写入前 delete 旧 node_id |
| ISearchIndex 接口未来可能扩展到 Pinecone/Weaviate | 接口设计保持最小化（5 个方法），不绑定 LanceDB 特性 |
| 三路召回的评分融合权重需要调优 | 权重可配置化，不在代码中硬编码 |

---

## 十、结论

**ISearchIndex 设计可行，与 God Object 拆分无冲突。**

### 接口签名（5 个方法）

```typescript
export interface ISearchIndex {
  indexNode(node: BmNode, embedding: number[]): Promise<void>;
  indexNodes(items: Array<{ node: BmNode; embedding: number[] }>): Promise<void>;
  removeNode(nodeId: string): Promise<void>;
  semanticSearch(queryVec: number[], limit: number, filter?: ScopeFilterV2): Promise<ScoredNodeId[]>;
  rebuild(sourceNodes: BmNode[], embedFn: (text: string) => Promise<number[]>): Promise<void>;
}
```

### 注入位置

```
ContextEngine
  ├── storage: IStorageAdapter      ← SQLite 真值
  └── searchIndex: ISearchIndex     ← LanceDB 伴随索引（v2.0.0 新增）
```

### 下一步

调研结论准备就绪，可以进入 v2.0.0 正式规划阶段。建议将此调研作为 v2.0.0 规划文档的技术附录。

---

*调研依据: 当前 src/recaller/recall.ts + src/store/lancedb-adapter.ts + src/retriever/* + scope-upgrade-v2 提案 + 老板架构指定*
