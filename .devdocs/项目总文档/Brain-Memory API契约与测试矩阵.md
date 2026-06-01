# Brain-Memory API 契约 + 测试覆盖矩阵

> 骨架地图 #3 — 契约维度（对外承诺 + 验证）
>
> 交叉引用：[模块总览](./Brain-Memory%20项目功能模块总览.md) | [数据流文档](./Brain-Memory 数据流通道梳理.md) | [演进记录](./Brain-Memory 演进记录.md) | [边界与运行](./Brain-Memory 边界与运行.md)
>
> 关联项目文档：[docs/api-reference.md](../../docs/api-reference.md) | [docs/api.md](../../docs/api.md)

---

## 第一部分：公开 API 契约

### 1.1 ContextEngine — 编程接口

`ContextEngine` 是 `brain-memory` 的唯一编程入口。所有外部消费者（插件、脚本、测试）通过它访问记忆系统。

#### 1.1.1 构造函数

```typescript
new ContextEngine(config: BmConfig)
```

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `config` | `BmConfig` | ✓ | 完整配置对象，至少需 `dbPath` 和 `storage` |

**契约**：
- 创建即初始化 SQLite 数据库 + 运行迁移
- 若 LLM/Embedding 未配置，引擎进入降级模式（`llmEnabled=false`），提取回退启发式
- 若 DB 路径不可写 → `throw StorageError`

**测试覆盖**：`integration/context-engine.test.ts` · `integration/context-engine-integration.test.ts` · `integration/graceful-degrade.test.ts`

---

#### 1.1.2 processTurn() — 对话轮次处理

```typescript
async processTurn(params: ProcessTurnParams): Promise<ProcessTurnResult>
```

| 参数字段 | 类型 | 必需 | 语义 |
|---------|------|------|------|
| `sessionId` | `string` | ✓ | 会话唯一标识 |
| `agentId` | `string` | ✓ | Agent 标识（写入 scope_agent） |
| `workspaceId` | `string` | ✓ | 工作空间标识 |
| `platform` | `string?` | — | 平台标识（discord/telegram/webchat…） |
| `userId` | `string?` | — | 用户标识（写入 scope_user） |
| `chatId` | `string?` | — | 频道/群组标识（写入 scope_chat） |
| `threadId` | `string?` | — | 子话题标识（写入 scope_thread） |
| `messages` | `Array<{role?, content}>` | ✓ | 本轮对话消息 |

| 返回值字段 | 类型 | 语义 |
|-----------|------|------|
| `extractedNodes` | `BmNode[]` | 本轮提取/更新的节点 |
| `extractedEdges` | `BmEdge[]` | 本轮创建的关系边 |
| `reflections` | `ReflectionInsight[]` | 轮次反思洞察（仅 `turnReflection=true` 时非空） |
| `workingMemory` | `WorkingMemoryState` | 更新后的工作记忆状态 |

**契约**：
- LLM 不可用时 → 仅执行启发式提取（Tier 1），返回 `ExtractionResult` 但不含 LLM 生成内容
- 噪声消息（如"好的"、"嗯"）→ 按 `noiseFilter` 配置过滤
- 每个 upserted node 会自动触发 embedding 批处理
- 边仅在两端的节点均存在时才创建

**错误语义**：
- `throw`：DB 写入失败 / 致命硬件错误
- 不 throw：单个节点/边的 upsert 失败 → 日志错误 + 继续处理

**测试覆盖**：`integration/extractor.test.ts` · `integration/context-engine-integration.test.ts` · `integration/mock-openclaw-integration.test.ts` · `integration/plugin-core.test.ts` · `e2e/full-lifecycle.test.ts`

---

#### 1.1.3 recall() — 记忆召回

```typescript
async recall(query: string, scope?: MemoryScopeV2): Promise<RecallResult>
```

| 参数 | 类型 | 必需 | 语义 |
|------|------|------|------|
| `query` | `string` | ✓ | 查询文本 |
| `scope` | `MemoryScopeV2?` | — | 六层 scope 过滤（platform/workspace/agent/user/chat/thread） |

| 返回值字段 | 类型 | 语义 |
|-----------|------|------|
| `nodes` | `BmNode[]` | 按 PPR + 衰减 + 多路径加权排序的节点 |
| `edges` | `BmEdge[]` | 选中节点间的边 |
| `tokenEstimate` | `number` | 选中节点的预估 Token 数 |

**契约**：
- 低信息量查询（"好的""嗯"等）→ 返回 `{ nodes:[], edges:[], tokenEstimate:0 }`
- scope 为空或不指定 → 跨域开放召回
- scope 指定 → 先精确匹配 scope → 无结果则开放回退
- 多路径命中的节点得分 ×1.2
- 时间敏感查询额外加权 recency

**错误语义**：不 throw → 失败时返回空结果

**测试覆盖**：`integration/recaller.test.ts` · `integration/recaller-extended.test.ts` · `integration/hybrid-recall.test.ts` · `integration/vector-recall.test.ts` · `integration/fusion.test.ts` · `performance/c7-recall-baseline.test.ts`

---

#### 1.1.4 runMaintenance() — 图维护

```typescript
async runMaintenance(): Promise<void>
```

**契约**：
- 执行顺序：去重 → PageRank → 社区检测 → 衰减归档
- `dirtyRatio < 10%` → 增量路径（仅重组脏节点子图）
- `dirtyRatio ≥ 10%` 或首次 → 全量路径
- `mode === 'lite'` → 跳过社区检测

**测试覆盖**：`integration/maintenance.test.ts` · `integration/maintenance-coverage.test.ts` · `integration/incremental-maintenance.test.ts` · `integration/lite-maintenance.test.ts`

---

#### 1.1.5 其他公开方法

| 方法 | 签名 | 契约要点 | 测试 |
|------|------|---------|------|
| `getStats()` | `() => EngineStats` | 包含完整 15+ 维度统计 + embedding cache stats | `integration/engine-stats.test.ts` |
| `healthCheck()` | `() => HealthStatus` | healthy/degraded/unhealthy 三级判定 | `integration/health-check.test.ts` |
| `getAllActiveNodes()` | `() => BmNode[]` | 返回所有 status='active' 节点 | — |
| `searchNodes()` | `(query, limit?) => BmNode[]` | 文本搜索（FTS5 → LIKE 回退） | — |
| `getStorage()` | `() => IStorageAdapter` | 获取存储适配器引用（UI Server 用） | — |
| `setSearchIndex()` | `(idx: ISearchIndex) => void` | 注入 LanceDB 伴生语义索引 | `integration/lancedb-mvp.test.ts` · `integration/lancedb-poc.test.ts` |
| `performFusion()` | `(sessionId?) => FusionResult` | 知识融合——需手动触发，非自动调用 | `integration/fusion.test.ts` |
| `reflectOnSession()` | `(sessionId, messages) => ReflectionInsight[]` | 会话反思——lite 模式跳过 | `integration/reflection.test.ts` · `integration/reflection-extractor.test.ts` · `integration/reflection-store.test.ts` |
| `performReasoning()` | `(query?) => ReasoningConclusion[]` | 图推理——需 minRecallNodes≥3 | `integration/reasoning.test.ts` · `integration/reasoning-coverage.test.ts` · `integration/reasoning-coverage-enhanced.test.ts` |
| `getWorkingMemoryContext()` | `() => string \| null` | 获取格式化的工作记忆 XML | `integration/working-memory.test.ts` |
| `export()` | `(options?) => MemoryExport` | 导出 JSON（支持 scope 过滤） | — |
| `import()` | `(data: MemoryExport) => {imported, skipped}` | 导入 JSON（已有节点按 name 跳过） | — |
| `close()` | `() => void` | 关闭数据库连接 | — |

---

### 1.2 BrainMemoryPluginCore — 插件接口

#### 1.2.1 Message 类型

```typescript
interface Message {
  sessionId: string;
  agentId?: string;
  workspaceId?: string;
  content: string;
  role?: string;
  platform?: string;
  userId?: string;
  chatId?: string;
  threadId?: string;
  // 由 getMemoryContext/beforeMessageSend 附加
  memoryContext?: string;
  formattedMemory?: {
    xml: string;
    systemPrompt: string;
    episodicXml: string;
    tokenCount?: number;
  };
}
```

#### 1.2.2 生命周期回调

| 回调 | 签名 | 时机 | 测试 |
|------|------|------|------|
| `init()` | `() => Promise<void>` | 插件激活，必须先调用 | `integration/plugin-core.test.ts` |
| `onSessionStart()` | `(event: SessionEvent) => Promise<void>` | 会话创建 | — |
| `handleMessage()` | `(msg: Message) => Promise<Message \| null>` | 每条用户消息 → L3-1 processTurn | `integration/plugin-core.test.ts` |
| `getMemoryContext()` | `(msg: Message) => Promise<MemoryContextResult \| null>` | 需要记忆上下文 → L3-2 recall + L1-12 assemble | `integration/plugin-core.test.ts` |
| `beforeMessageSend()` | `(msg: Message) => Promise<Message>` | 消息发送前 → 注入 memoryContext | `integration/plugin-core.test.ts` |
| `onSessionEnd()` | `(event: SessionEvent) => Promise<void>` | 会话结束 → L3-5 reflection + L3-3 maintenance | — |
| `getStatus()` | `() => Promise<Record<string, unknown>>` | 运行时查询 | — |
| `shutdown()` | `() => Promise<void>` | 插件卸载 | — |

**测试覆盖**：`integration/plugin-core.test.ts` · `integration/mock-openclaw-integration.test.ts`

---

### 1.3 Hook 注册契约

```typescript
interface HookRegistry {
  beforeExtract: BeforeExtractHook[];
  afterExtract: AfterExtractHook[];
  beforeRecall: BeforeRecallHook[];
  afterRecall: AfterRecallHook[];
  beforeFusion: BeforeFusionHook[];
  afterFusion: AfterFusionHook[];
}
```

| Hook | 触发节点 | 输入类型 | 可修改性 | 错误处理 |
|------|---------|---------|---------|---------|
| `beforeExtract` | `processTurn()` 调 Extractor 前 | `{messages, existingNames}` | ✓ 可修改 | catch → warn → 继续 |
| `afterExtract` | `processTurn()` 提取完成后 | `ExtractionResult` | ✓ 可观察 | catch → warn → 继续 |
| `beforeRecall` | `recall()` 调 Recaller 前 | `{query, scopeFilter}` | ✓ 可修改 query | catch → warn → 继续 |
| `afterRecall` | `recall()` 返回结果后 | `RecallResult` | ✓ 可观察 | catch → warn → 继续 |
| `beforeFusion` | `performFusion()` 融合前 | `FusionCandidate[]` | ✓ 可修改 | catch → warn → 继续 |
| `afterFusion` | `performFusion()` 融合后 | `{merged, linked}` | ✓ 可观察 | catch → warn → 继续 |

**关键契约**：Hook 抛出的异常**不会中断主流程**，所有 hook 错误被 catch 并记录日志。

**测试覆盖**：`unit/hooks.test.ts`

---

### 1.4 数据格式契约

#### 1.4.1 Export JSON Schema

```typescript
interface MemoryExport {
  version: string;          // 固定 "2.0.0"
  exportedAt: number;       // Date.now()
  nodeCount: number;
  edgeCount: number;
  communityCount: number;
  nodes: BmNode[];
  edges: BmEdge[];
  communities: Array<{
    id: string;
    summary: string;
    nodeCount: number;
  }>;
}
```

#### 1.4.2 Import 行为

- 按 `name`（归一化后）判断重复 → 已存在的节点跳过
- 边的 `fromId`/`toId` 不做验证 → 可能导入悬空边
- 不触发 embedding、reflection 等副作用

---

### 1.5 Web Control UI API

> 详见 [数据流文档 L1-17](./Brain-Memory 数据流通道梳理.md) 中的完整端点协议。

| 端点 | 认证 | 说明 |
|------|------|------|
| REST API (11 endpoints) | Bearer Token / Query Token | 仅 API 路由受保护，静态文件公开 |
| WebSocket `/ws` | Query Token (`?token=`) | 共享 HTTP Server 端口 |
| `/embed/dashboard` | 无 | Canvas 嵌入视图 |

---

## 第二部分：测试覆盖矩阵

### 按模块映射

| L1 模块 | 单元测试 | 集成测试 | 性能测试 | E2E |
|---------|---------|---------|---------|-----|
| **extractor/** | `unit/heuristic.test.ts` | `integration/extractor.test.ts` · `integration/heuristic-llm-compare.test.ts` | — | ✓ |
| **recaller/** | `unit/recall-cache.test.ts` | `integration/recaller.test.ts` · `integration/recaller-extended.test.ts` · `integration/hybrid-recall.test.ts` · `integration/vector-recall.test.ts` | `performance/c7-recall-baseline.test.ts` | ✓ |
| **retriever/** | `unit/intent-analyzer.test.ts` · `unit/query-expander.test.ts` · `unit/reranker.test.ts` | `integration/admission-control.test.ts` · `integration/admission-control-enhanced.test.ts` · `integration/b4-retriever-integration.test.ts` · `integration/reranker-degrade.test.ts` | — | — |
| **graph/** | `unit/pagerank.test.ts` · `unit/community.test.ts` · `unit/dedup.test.ts` · `unit/pipeline.test.ts` | `integration/graph.test.ts` · `integration/incremental-pagerank.test.ts` · `integration/incremental-maintenance.test.ts` · `integration/maintenance.test.ts` · `integration/maintenance-coverage.test.ts` | — | ✓ |
| **reflection/** | — | `integration/reflection.test.ts` · `integration/reflection-extractor.test.ts` · `integration/reflection-store.test.ts` | — | — |
| **fusion/** | — | `integration/fusion.test.ts` | — | — |
| **reasoning/** | — | `integration/reasoning.test.ts` · `integration/reasoning-coverage.test.ts` · `integration/reasoning-coverage-enhanced.test.ts` | — | — |
| **decay/** | `unit/decay.test.ts` · `unit/decay-presets.test.ts` | — | — | — |
| **noise/** | `unit/noise.test.ts` | — | — | — |
| **temporal/** | `unit/temporal.test.ts` | — | — | — |
| **working-memory/** | — | `integration/working-memory.test.ts` | — | — |
| **format/** | `unit/truncate.test.ts` | — | — | — |
| **scope/** | `unit/scope-isolation.test.ts` · `unit/scope-v2.test.ts` · `unit/scope-supplement.test.ts` | `integration/scope-migration.test.ts` | — | — |
| **session/** | — | `integration/compressor.test.ts` · `integration/compressor-coverage.test.ts` | — | — |
| **plugin/** | `unit/hooks.test.ts` | `integration/plugin-core.test.ts` · `integration/mock-openclaw-integration.test.ts` | — | — |
| **store/** | `unit/sqlite-adapter.test.ts` | `integration/store.test.ts` · `integration/migrate.test.ts` · `integration/lancedb-mvp.test.ts` · `integration/lancedb-poc.test.ts` | — | ✓ |
| **engine/** | `unit/utils.test.ts` | `integration/llm.test.ts` · `integration/llm-integration.test.ts` · `integration/llm-integration-real.test.ts` · `integration/embed.test.ts` · `integration/embedding-integration.test.ts` · `integration/context-engine.test.ts` · `integration/context-engine-integration.test.ts` · `integration/engine-stats.test.ts` · `integration/health-check.test.ts` · `integration/graceful-degrade.test.ts` | `performance/perf-1k-benchmark.test.ts` · `performance/perf-content-benchmark.test.ts` · `performance/performance-benchmark.test.ts` · `performance/performance-incremental.test.ts` · `performance/perf-tiered-benchmark.test.ts` | ✓ |
| **utils/** | `unit/utils.test.ts` · `unit/json-enhanced.test.ts` · `unit/json-extended.test.ts` | `integration/lite-mode.test.ts` · `integration/small-mode.test.ts` · `integration/coverage-batch2.test.ts` · `integration/integration.test.ts` | — | — |

### 按测试层统计

| 层 | 文件数 | 覆盖重点 |
|----|--------|---------|
| `unit/` | 22 | 纯逻辑：算法、工具函数、规则匹配 |
| `integration/` | 48 | 跨模块协作：Service ↔ Adapter ↔ LLM |
| `performance/` | 6 | 召回基线 + 1K 规模压测 + 增量维护性能 |
| `e2e/` | 1 | 完整生命周期（init → turn → maintain → export） |

### 覆盖缺口

| 模块/功能 | 缺口 | 风险 |
|----------|------|------|
| `reflection/extractor.ts` | 无单元测试——仅集成测试 | 安全过滤逻辑变更可能漏检 |
| `format/assemble.ts` | 无直接的 token 预算截断测试 | 超预算行为可能异常 |
| `export/import` | 无专门测试 | 导出/导入循环可能丢失数据 |
| `UI controllers` | 无自动化测试 | 仅通过 manual CLI 验证 |
| `small 模式提示词` | `small-mode.test.ts` 存在但 prompt token 数可能随版本漂移 | 不验证 <=180 tokens |

---

## 第三部分：错误模型

`utils/errors.ts` 定义了 7 层继承的错误类型体系：

```
BrainMemoryError { code, message, name }
  ├─ ConfigError       code: 'CONFIG_ERROR'        — 配置无效或缺失
  ├─ StorageError      code: 'STORAGE_ERROR'       — 数据库连接/Schema/IO 失败
  ├─ LLMError          code: 'LLM_ERROR'           — LLM 调用失败/限流/无效响应
  ├─ EmbeddingError    code: 'EMBED_ERROR'         — Embedding 服务失败
  ├─ ValidationError   code: 'VALIDATION_ERROR'    — 输入数据或类型约束无效
  └─ RuntimeError      code: 'RUNTIME_ERROR'       — 意外的内部失败
```

### 各方法的错误语义

| 方法 | 可能抛出的错误 | 不抛出的情况 |
|------|-------------|------------|
| `new ContextEngine(config)` | `StorageError`（DB 不可写） | — |
| `processTurn()` | `StorageError`（写入失败） | 单节点/边 upsert 失败 → 日志 + 继续 |
| `recall()` | — | 全部错误静默处理，返回空结果 |
| `runMaintenance()` | `Error`（维护失败） | 子步骤失败 → 日志 + 继续下一子步骤 |
| `performFusion()` | `Error`（融合失败） | 无 LLM → 启发式回退 |
| `reflectOnSession()` | `Error`（LLM 调用失败） | mode=lite / LLM 未配置 → 返回 [] |
| `performReasoning()` | `Error`（推理失败） | 节点不足 → 返回 [] |
| `export()` | — | 总是返回 MemoryExport |
| `import()` | — | 无效节点/边 → skip（计数+1） |
| `close()` | `Error`（关闭失败） | catch → 日志 |

---

## 第四部分：扩展接口

### 1.7 ISearchIndex — 伴生语义索引注入接口

> 详见 [src/store/search/index.ts](../../src/store/search/index.ts)

```typescript
interface ISearchIndex {
  indexNode(node: BmNode, embedding: number[]): Promise<void>;
  indexNodes(items: Array<{ node: BmNode; embedding: number[] }>): Promise<void>;
  removeNode(nodeId: string): Promise<void>;
  semanticSearch(queryVec: number[], limit: number, filter?: ScopeFilterV2): Promise<ScoredNodeId[]>;
  rebuild(sourceNodes: BmNode[], embedFn: (text: string) => Promise<number[]>): Promise<void>;
  count(): Promise<number>;
  close(): Promise<void>;
}
```

**注入方式**：`engine.setSearchIndex(idx: ISearchIndex)`

**语义**：
- 非真值存储 — 真值在 SQLite / IStorageAdapter
- 可随时从 SQLite 全量 `rebuild()`
- 当前实现: LanceDB（`store/search/lancedb.ts`）
- 未来可扩展到 Pinecone、Weaviate 等

### 1.8 IStorageAdapter — 存储后端替换接口

> 详见 [src/store/adapter.ts](../../src/store/adapter.ts)

~40 方法的完整接口。当前唯一实现为 `SQLiteStorageAdapter`。LanceDB 不再作为 IStorageAdapter 实现（仅通过 ISearchIndex 注入）。

### 1.9 配置 Schema

> 完整 JSON Schema 定义在 [openclaw.plugin.json](../../openclaw.plugin.json)（204 行）

所有嵌套配置组（decay/reflection/workingMemory/fusion/reasoning/memoryInjection/memorySharing/noiseFilter/rerank/embedding/llm）的字段约束均在其中定义。

---

## 交叉引用

| 引用目标 | 链接 |
|---------|------|
| API 端点的完整数据流（每个方法经历的模块） | [数据流文档 L1-L3](./Brain-Memory 数据流通道梳理.md) |
| 各模块的算法级细节 | [模块总览](./Brain-Memory%20项目功能模块总览.md) |
| LLM/Embedding 不可用时的降级行为 | [边界与运行 §降级矩阵](./Brain-Memory 边界与运行.md) |
| API 演进的版本历史 | [演进记录](./Brain-Memory 演进记录.md) |
| 项目已有 API 文档 | [docs/api-reference.md](../../docs/api-reference.md) |
| 项目已有架构文档 | [docs/architecture.md](../../docs/architecture.md) |
