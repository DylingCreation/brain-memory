# brain-memory 架构设计

> 面向开发者和系统设计者的技术架构详解。

---

## 整体架构

brain-memory 采用四层架构，从 API 门面到 SQLite 存储逐层解耦：

```
┌─────────────────────────────────────────────────────────────────┐
│                        🌐 API 层                                │
│              ContextEngine (统一门面接口)                          │
│     processTurn │ recall │ performFusion │ reflectOnSession      │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────────────────┐
│                     🎛️ 控制层                                   │
│  ┌──────────┐ ┌──────────┐ ┌────────┐ ┌──────────┐ ┌─────────┐ │
│  │ 提取器   │ │ 召回器   │ │ 融合器 │ │ 反思系统 │ │ 推理引擎│ │
│  │extractor │ │recaller  │ │ fusion │ │reflection│ │reasoning│ │
│  └──────────┘ └──────────┘ └────────┘ └──────────┘ └─────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌────────┐ ┌──────────┐ ┌─────────┐ │
│  │ 混合召回 │ │ 向量召回 │ │ 重排序 │ │ 准入控制 │ │ 工作记忆│ │
│  │hybrid-rc │ │vector-rc │ │reranker│ │admission │ │wk-mem   │ │
│  └──────────┘ └──────────┘ └────────┘ └──────────┘ └─────────┘ │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────────────────┐
│                    ⚙️ 算法层                                    │
│  ┌────────────┐ ┌──────────────┐ ┌───────────┐ ┌────────────┐  │
│  │  PageRank  │ │  社区检测    │ │  LSH去重  │ │  时序分类  │  │
│  │  (PPR)     │ │  (LPA)       │ │           │ │            │  │
│  └────────────┘ └──────────────┘ └───────────┘ └────────────┘  │
│  ┌────────────┐ ┌──────────────┐ ┌───────────┐                 │
│  │   衰减     │ │  意图分析    │ │  查询扩展 │                 │
│  │  (Weibull) │ │              │ │           │                 │
│  └────────────┘ └──────────────┘ └───────────┘                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────────────────┐
│                     💾 存储层                                   │
│    SQLite: 6 张表 + FTS5 全文索引 + 触发器 + 8 个索引            │
│    bm_nodes │ bm_edges │ bm_vectors │ bm_messages               │
│    bm_communities │ bm_nodes_fts                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 核心组件

### API 层

#### ContextEngine — 统一门面

| 项目 | 内容 |
|------|------|
| **源码** | [src/engine/context.ts](../src/engine/context.ts) |
| **输入** | 对话消息数组（sessionId / agentId / workspaceId / messages） |
| **输出** | 提取结果（节点/边/反思/工作记忆）、召回结果（节点/边/Token 估算） |
| **依赖** | Extractor、Recaller、LLM、Embedding、WorkingMemory、Migrate、Logger |
| **关键方法** | `processTurn` / `recall` / `performFusion` / `reflectOnSession` / `performReasoning` / `runMaintenance` / `getStats` / `healthCheck` |

**职责：** 初始化数据库 → 运行迁移（确保 schema 版本对齐）→ 初始化 LLM 客户端（未配置时优雅降级）→ 初始化 Embedding 客户端（未配置时降级）→ 编排完整流程 → 提供健康检查和统计查询。

---

### 控制层

#### Extractor — 知识提取器

| 项目 | 内容 |
|------|------|
| **源码** | [src/extractor/extract.ts](../src/extractor/extract.ts) |
| **输入** | 对话消息（含角色标签 [USER] / [ASSISTANT]） |
| **输出** | ExtractionResult（节点数组 + 边数组） |
| **依赖** | LLM、NoiseFilter、TemporalClassifier |
| **关键算法** | LLM 提示词提取（EXTRACT_SYS + FINALIZE_SYS）、边类型自动修正 |

**职责：** 噪声过滤 → 消息格式化（每消息最大 800 字符）→ LLM 调用 → JSON 解析 → 节点/边类型验证 → 时序分类（static/dynamic）→ 边方向约束校验。

**角色区分：**
- [USER] 消息 → 提取用户意图、问题、偏好、项目信息
- [ASSISTANT] 消息 → 提取 AI 建议、推荐、解决方案、代码示例、工具推荐

#### Recaller — 双路径召回引擎

| 项目 | 内容 |
|------|------|
| **源码** | [src/recaller/recall.ts](../src/recaller/recall.ts) |
| **输入** | 查询文本、ScopeFilter |
| **输出** | RecallResult（召回节点 + 边 + Token 估算） |
| **依赖** | VectorSearch、FTS5、GraphWalk、PPR、DecayEngine |
| **关键算法** | 精确路径 + 泛化路径 + 结果合并 |

**精确路径：** 向量检索 → 社区扩展（距离 2）→ 图遍历（maxDepth 层）→ 个性化 PageRank → 时间衰减

**泛化路径：** 社区向量匹配 → 社区成员 → 图遍历（1 层）→ 个性化 PageRank

#### HybridRecaller — 混合召回融合

| 项目 | 内容 |
|------|------|
| **源码** | [src/retriever/hybrid-recall.ts](../src/retriever/hybrid-recall.ts) |
| **输入** | 查询文本、ScopeFilter |
| **输出** | HybridRecallResult（融合后节点 + 边 + 诊断信息） |
| **依赖** | GraphRecaller、VectorRecaller |
| **关键算法** | Min-Max 归一化 + RRF 融合（K=60） |

**融合策略：**
| 节点来源 | 融合分数 |
|----------|----------|
| 双路径重叠 | graphScore + vectorScore |
| 仅向量命中 | vectorScore × 0.8 |
| 仅图命中 | graphScore × 0.8 |

#### VectorRecaller — 纯向量召回

| 项目 | 内容 |
|------|------|
| **源码** | [src/retriever/vector-recall.ts](../src/retriever/vector-recall.ts) |
| **输入** | 查询文本、ScopeFilter |
| **输出** | VectorRecallResult（节点 + 边 + 诊断信息） |
| **依赖** | Embedding、FTS5、IntentAnalyzer、QueryExpander、Reranker |
| **关键算法** | 向量搜索 + BM25 + RRF 融合 |

#### Reranker — 交叉编码器重排序

| 项目 | 内容 |
|------|------|
| **源码** | [src/retriever/reranker.ts](../src/retriever/reranker.ts) |
| **输入** | 候选节点列表、查询向量 |
| **输出** | RerankResult（重排序后节点 + 分数映射） |
| **关键算法** | 交叉编码器 API → 余弦相似度降级 |
| **支持提供商** | Jina / SiliconFlow / Voyage / DashScope / TEI / Pinecone |

#### AdmissionController — 准入控制器

| 项目 | 内容 |
|------|------|
| **源码** | [src/retriever/admission-control.ts](../src/retriever/admission-control.ts) |
| **输入** | 候选节点（name / content / category / vector） |
| **输出** | AdmissionResult（accept/reject + 原因 + 相似度） |
| **关键算法** | 内容长度过滤 → 类型优先级过滤 → Jaccard 内容重叠 → 向量相似度 |

---

### 算法层

#### PageRank — 个性化 PageRank

| 项目 | 内容 |
|------|------|
| **源码** | [src/graph/pagerank.ts](../src/graph/pagerank.ts) |
| **算法** | 个性化 PageRank（PPR）+ 全局 PageRank |
| **参数** | 阻尼 0.85 / 迭代 20 次 / 图缓存 TTL 30 秒 |
| **关键特性** | 悬挂节点处理、种子节点 Teleport、无向图邻接表 |

#### Community Detection — 社区检测

| 项目 | 内容 |
|------|------|
| **源码** | [src/graph/community.ts](../src/graph/community.ts) |
| **算法** | Label Propagation Algorithm (LPA) |
| **参数** | 最大迭代 50 次 / 过滤单节点社区 |
| **关键特性** | 随机打乱顺序、按大小重命名（c-1, c-2...）、LLM 社区摘要生成 |

#### LSH Dedup — LSH 去重

| 项目 | 内容 |
|------|------|
| **源码** | [src/graph/dedup.ts](../src/graph/dedup.ts) |
| **算法** | LSH 桶化（8 位签名）+ 余弦相似度 |
| **参数** | 默认阈值 0.90 |
| **关键特性** | 将 O(n²) 比较降为 O(n × bucket_size)、确定性签名 |

#### Decay — Weibull 衰减引擎

| 项目 | 内容 |
|------|------|
| **源码** | [src/decay/engine.ts](../src/decay/engine.ts) |
| **算法** | Weibull 衰减模型 |
| **三层分层** | Core（importance > 0.7）/ Working（0.4~0.7）/ Peripheral（< 0.4） |
| **关键特性** | 动态信息 3 倍速衰减、检索分数乘法惩罚（最低保留 50%） |

#### Intent Analyzer — 意图分析器

| 项目 | 内容 |
|------|------|
| **源码** | [src/retriever/intent-analyzer.ts](../src/retriever/intent-analyzer.ts) |
| **算法** | 正则规则匹配（10 条规则，5 类意图） |
| **意图类型** | technical / preference / factual / task / general |
| **关键特性** | 中英文双语、无 LLM 开销 |

#### Query Expander — 查询扩展器

| 项目 | 内容 |
|------|------|
| **源码** | [src/retriever/query-expander.ts](../src/retriever/query-expander.ts) |
| **算法** | 同义词表映射（14 组中英双语） |
| **关键特性** | 口语→正式化自动转换、最大扩展词数 5 |

---

### 存储层

#### 数据库 Schema

| 项目 | 内容 |
|------|------|
| **源码** | [src/store/db.ts](../src/store/db.ts) |
| **引擎** | SQLite（@photostructure/sqlite） |
| **配置** | WAL 模式 + 外键约束 |

**6 张表：**

| 表名 | 用途 | 关键字段 |
|------|------|----------|
| `bm_nodes` | 记忆节点主表 | id, type, category, name, content, pagerank, importance, scope_* |
| `bm_edges` | 知识边表 | from_id, to_id, type, instruction, condition |
| `bm_vectors` | 向量嵌入表 | node_id(FK), embedding(BLOB), hash |
| `bm_messages` | 对话消息表 | session_id, turn_index, role, content, extracted |
| `bm_communities` | 社区摘要表 | id, summary, node_count, embedding |
| `bm_nodes_fts` | FTS5 全文索引 | name, description, content（触发器自动同步） |

**8 个索引：** 节点（name / type / community_id / status）+ 边（from_id / to_id / type）+ 消息（session_id + turn_index 复合）

#### CRUD 操作层

| 项目 | 内容 |
|------|------|
| **源码** | [src/store/store.ts](../src/store/store.ts) |
| **关键操作** | upsertNode / upsertEdge / mergeNodes / searchNodes / graphWalk |
| **关键特性** | 名称标准化去重、事务保护、FTS5 + LIKE 双策略检索 |

#### 数据库迁移系统（v0.2.0 新增）

| 项目 | 内容 |
|------|------|
| **源码** | [src/store/migrate.ts](../src/store/migrate.ts) |
| **关键组件** | `migrate()` / `getSchemaVersion()` / `CURRENT_SCHEMA_VERSION` |
| **元数据表** | `bm_meta`（key TEXT PRIMARY KEY, value TEXT NOT NULL） |
| **关键特性** | 幂等迁移、旧 DB 自动标记当前版本、预留增量迁移扩展模板 |

**迁移流程：** `initDb()` 创建表结构 → `migrate()` 创建 `bm_meta` 表 → 读取当前版本 → 版本为 0 时初始化为当前版本 → 按版本号递进执行增量迁移。

#### 结构化日志模块（v0.2.0 新增）

| 项目 | 内容 |
|------|------|
| **源码** | [src/utils/logger.ts](../src/utils/logger.ts) |
| **日志级别** | `error` / `warn` / `info`（默认） / `debug` |
| **控制方式** | `BM_LOG_LEVEL` 环境变量 |
| **输出格式** | `[brain-memory][时间][级别][模块] 消息` |

---

## 数据流

### 写入流程（Input → Storage）

```
┌──────────────────────────────────────────────────────────────────┐
│ 1. 输入处理                                                       │
│    对话消息 → 噪声过滤(noise/filter.ts) → 消息格式化              │
│         ↓                                                         │
│ 2. 知识提取                                                       │
│    LLM 调用(extractor/extract.ts) → JSON 解析 → 节点/边验证       │
│    → 时序分类(temporal/classifier.ts)                             │
│         ↓                                                         │
│ 3. 知识存储                                                       │
│    节点 upsert(store/store.ts) → 向量嵌入生成(engine/embed.ts)    │
│    → 边 upsert → 访问计数更新                                     │
│         ↓                                                         │
│ 4. 索引更新                                                       │
│    FTS5 触发器自动同步 → 社区检测维护时更新                        │
└──────────────────────────────────────────────────────────────────┘
```

### 召回流程（Query → Output）

```
┌──────────────────────────────────────────────────────────────────┐
│ 1. 查询预处理                                                      │
│    查询文本 → 意图分析(retriever/intent-analyzer.ts)              │
│    → 查询扩展(retriever/query-expander.ts)                        │
│         ↓                                                         │
│ 2. 双路径搜索                                                      │
│    精确路径: 向量/FTS5 → 社区扩展 → 图遍历 → PPR                  │
│    泛化路径: 社区向量匹配 → 社区成员 → 图遍历 → PPR               │
│         ↓                                                         │
│ 3. 结果融合                                                        │
│    合并去重 → Min-Max 归一化 → RRF 融合 → 排序                    │
│         ↓                                                         │
│ 4. 重排序（可选）                                                  │
│    交叉编码器 API → 余弦相似度降级                                │
│         ↓                                                         │
│ 5. 输出组装                                                       │
│    上下文格式化(format/assemble.ts) → XML/Markdown → 注入 Prompt  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 性能优化

| 优化 | 实现位置 | 说明 |
|------|---------|------|
| **图缓存** | [pagerank.ts](../src/graph/pagerank.ts) | 图结构缓存 30 秒 TTL，避免重复加载 |
| **LSH 桶化** | [dedup.ts](../src/graph/dedup.ts) | 将 O(n²) 去重比较降为 O(n × bucket_size) |
| **异步嵌入** | [recaller/recall.ts](../src/recaller/recall.ts) | syncEmbed 不阻塞主流程 |
| **向量按需加载** | [store/store.ts](../src/store/store.ts) | 先过滤节点再加载向量，减少内存 |
| **双层缓存** | [openclaw-wrapper.ts](../openclaw-wrapper.ts) | Agent 级 + Session 级记忆缓存 |
| **事务批量更新** | [store/store.ts](../src/store/store.ts) | PageRank / 社区 ID 批量更新使用 BEGIN/COMMIT |

---

## 安全设计

| 安全机制 | 实现位置 | 说明 |
|---------|---------|------|
| **参数化 SQL** | [store/store.ts](../src/store/store.ts) | 所有数据库操作使用 `?` 占位符 |
| **范围隔离** | [scope/isolation.ts](../src/scope/isolation.ts) | session / agent / workspace 三级隔离 |
| **Prompt Injection 防护** | [reflection/extractor.ts](../src/reflection/extractor.ts) | 6 类规则过滤反思内容 |
| **输入验证** | [extractor/extract.ts](../src/extractor/extract.ts) | 节点类型 / 边类型 / 记忆分类严格校验 |
| **边方向约束** | [types.ts](../src/types.ts) | EDGE_FROM_CONSTRAINT / EDGE_TO_CONSTRAINT |

---

## 扩展点

| 扩展点 | 方式 | 说明 |
|--------|------|------|
| **LLM 提供商** | [engine/llm.ts](../src/engine/llm.ts) | 支持任何 OpenAI 兼容 API + Anthropic 原生 API |
| **Embedding 提供商** | [engine/embed.ts](../src/engine/embed.ts) | 支持 OpenAI / Azure / DashScope / MiniMax / Ollama 等 |
| **重排序提供商** | [retriever/reranker.ts](../src/retriever/reranker.ts) | 支持 Jina / SiliconFlow / Voyage / DashScope / TEI / Pinecone |
| **存储后端** | [types.ts](../src/types.ts) | `StorageBackend` 类型预留 sqlite / lancedb 切换 |
| **自定义提示词** | [extractor/extract.ts](../src/extractor/extract.ts) | EXTRACT_SYS / FINALIZE_SYS 可定制提取规则 |
