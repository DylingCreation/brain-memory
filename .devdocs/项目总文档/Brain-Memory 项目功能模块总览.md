# 📊 Brain-Memory 项目功能模块总览

`brain-memory` 是一个 **统一记忆引擎**，用于 AI Agent 的知识存储与检索。它融合了 **知识图谱 (Graph)** 和 **向量检索 (Vector)** 两种技术路径，提供完整的"提取 → 存储 → 召回 → 维护 → 推理" 全生命周期。

---

## 一、核心架构层次

```
                         ┌─── HTTP/WS ───┐
                         ▼                │
┌─────────────────────────────────────────┼──────────────┐
│              Plugin Core (plugin/core.ts)               │  ← OpenClaw 插件入口
├─────────────────────────────────────────────────────────┤
│          ContextEngine (engine/context.ts)              │  ← 统一编排引擎
├─────────────────────────────────────────────────────────┤
│  提取服务      召回服务     融合服务    反思服务  推理服务  │  ← 领域服务层
│  Extraction   Recall      Fusion    Reflection Reasoning│
├─────────────────────────────────────────────────────────┤
│  Extractor    Recaller    Fusion    Reflection  Reasoning│  ← 核心算法层
├─────────────────────────────────────────────────────────┤
│  Graph (PageRank/Community/Dedup)  │  Vector (Embedding)│  ← 算法层
├─────────────────────────────────────────────────────────┼──────────────┐
│              IStorageAdapter (store/)                   │  UIServer    │
│              ◄────────── 直接读写 ───────────────────────│  (侧门)      │
├─────────────────────────────────────────────────────────┼──────────────┤
│  SQLite (bm_nodes/.../bm_messages)  │  Web UI / REST /  │              │
│  Filesystem (~/.openclaw/)          │  WebSocket/Canvas │              │
└─────────────────────────────────────────────────────────┴──────────────┘
```

> **关键架构事实**：UI Server 是唯一绕过所有 Domain Service、直接操作 IStorageAdapter 的消费者。

---

## 二、功能模块清单（按目录分组）

### 🧠 1. 引擎层 (`src/engine/`) — 核心编排

| 模块 | 文件 | 功能 |
|------|------|------|
| **ContextEngine** | `context.ts` | 主编排器，持有所有 domain service，提供 `processTurn()` / `recall()` / `runMaintenance()` / `export()` / `import()` 等统一 API |
| **ExtractionService** | `extraction-service.ts` | 对话轮次处理：提取 → 写入 → 嵌入 → 轮次反思 → 工作记忆更新 |
| **RecallService** | `recall-service.ts` | 构建 Scope 过滤 → 两轮召回（受限→开放回退）→ Hook 生命周期 |
| **MaintenanceService** | `maintenance-service.ts` | 图维护编排：去重 → PageRank → 社区检测 → 衰减归档 |
| **FusionService** | `fusion-service.ts` | 知识融合：发现重复/相关节点，LLM 决策 merge/link/none |
| **ReflectionService** | `reflection-service.ts` | 会话级反思：从全量对话中提炼用户画像、Agent 教训、经验、决策 |
| **ReasoningService** | `reasoning-service.ts` | 图级推理：从召回的子图推导新结论（路径/隐含/模式/矛盾） |
| **HealthService** | `health-service.ts` | 引擎统计 + 健康检查（DB/LLM/Embedding 状态） |
| **LLM 客户端** | `llm.ts` | 统一 LLM 调用（OpenAI/Ollama/DashScope/Anthropic），指数退避重试，thinking 关闭 |
| **Embedding 引擎** | `embed.ts` | 统一 Embedding 调用（OpenAI/Ollama），LRU 缓存 + TTL，批量嵌入 API |

### 📝 2. 提取模块 (`src/extractor/`)

| 模块 | 文件 | 功能 |
|------|------|------|
| **Extractor** | `extract.ts` | 三级提取系统：启发式(Tier1) → LLM(Tier2) → 容错(Tier3) |
| **Heuristic** | `heuristic.ts` | 无 LLM 的规则提取：代码块、命令、8类正则匹配。LLM 不可用时回退 |
| **边类型校验** | `extract.ts` | `correctEdgeType()` — 根据 from/to 节点类型自动修正 11 种边类型 |

### 🎯 3. 召回模块 (`src/recaller/` + `src/retriever/`)

| 模块 | 文件 | 功能 |
|------|------|------|
| **Recaller（图路径）** | `recaller/recall.ts` | 双路径召回：精确路径（向量/FTS5 → 社区扩展）+ 泛化路径（社区向量匹配）+ 语义路径（LanceDB），统一 PPR 排序 |
| **RecallCache** | `recaller/cache.ts` | LRU 查询缓存，内容级 hash 失效，TTL 过期 |
| **VectorRecaller** | `retriever/vector-recall.ts` | 纯向量召回：向量搜索 + FTS5 搜索 → RRF 融合（无需图依赖） |
| **HybridRecaller** | `retriever/hybrid-recall.ts` | 混合召回：Graph PPR + Vector RRF 并行，RRF 分数融合 |
| **IntentAnalyzer** | `retriever/intent-analyzer.ts` | 查询意图分类（technical/preference/factual/task/time_sensitive） |
| **QueryExpander** | `retriever/query-expander.ts` | 中英双语同义词扩展（15 组预设），改进 BM25 召回 |
| **Reranker** | `retriever/reranker.ts` | 重排序（Jina/SiliconFlow/Voyage API 或余弦相似度回退） |
| **AdmissionControl** | `retriever/admission-control.ts` | 写入准入控制：去重检测、长度过滤、类别先验、向量相似度 |

### 📊 4. 图算法模块 (`src/graph/`)

| 模块 | 文件 | 功能 |
|------|------|------|
| **MaintenancePipeline** | `pipeline.ts` | 可组合维护管线：去重 → PageRank → 社区检测 → 社区摘要 → 衰减归档 |
| **PageRank** | `pagerank.ts` | 个性化 PageRank（召回用）+ 全局 PageRank（维护用）+ 增量 PageRank |
| **Community** | `community.ts` | LPA 社区检测 + 增量社区检测 + LLM 生成社区摘要 |
| **Dedup** | `dedup.ts` | LSH 桶 + 余弦相似度去重，合并重复节点并重连边 |

### 💭 5. 反思与推理 (`src/reflection/` + `src/reasoning/`)

| 模块 | 文件 | 功能 |
|------|------|------|
| **Turn Reflection** | `reflection/extractor.ts` | 轮次反思：扫描每轮提取结果，找出需提升 importance 的节点 |
| **Session Reflection** | `reflection/extractor.ts` | 会话反思：LLM 全量分析，生成 user-model/agent-model/lesson/decision 四种洞察 |
| **Reflection Store** | `reflection/store.ts` | 洞察存储：映射为图节点（用户画像→profile、教训→cases 等），相关节点 importance 提升 |
| **Reasoning Engine** | `reasoning/engine.ts` | 图推理：从召回子图推导 path/implicit/pattern/contradiction 四类结论 |

### 🔀 6. 知识融合 (`src/fusion/`)

| 模块 | 文件 | 功能 |
|------|------|------|
| **Fusion Analyzer** | `fusion/analyzer.ts` | 候选发现（名称 Jaccard + 向量余弦）→ LLM 决策（merge/link/none）→ 执行 |

### 🧩 7. 存储层 (`src/store/`)

| 模块 | 文件 | 功能 |
|------|------|------|
| **IStorageAdapter** | `adapter.ts` | 存储抽象接口：~40 个方法覆盖全部 CRUD、图遍历、向量搜索、消息操作 |
| **SQLiteStorageAdapter** | `sqlite-adapter.ts` | SQLite 实现（唯一 IStorageAdapter 实现） |
| **DB 初始化** | `db.ts` | SQLite Schema：6 张表 + FTS5 全文索引 + 触发器 |
| **Migration** | `migrate.ts` | 数据库迁移系统（v0→v1→v2 scope 升级） |
| **Search Index** | `store/search/` | ISearchIndex 接口 + LanceDB 实现（伴生语义索引） |
| **Barrel** | `store/store.ts` | 统一导出，消费者无感知子模块拆分 |

### 🛡️ 8. 辅助模块

| 模块 | 文件 | 功能 |
|------|------|------|
| **Scope 隔离** | `scope/isolation.ts` | v2.0 六层 scope（platform/workspace/agent/user/chat/thread）+ SQL WHERE 构建 + cross-scope sharing |
| **Decay 引擎** | `decay/engine.ts` | Weibull 衰减模型：三级分层（core/working/peripheral），3×加速动态记忆衰减 |
| **Decay 预设** | `decay/presets.ts` | 四种预设（aggressive/balanced/conservative/episodic）+ 衰减曲线可视化 |
| **Working Memory** | `working-memory/manager.ts` | 工作记忆管理：追踪当前任务/决策/约束/关注点/承诺，无需 LLM |
| **Noise Filter** | `noise/filter.ts` | 噪声过滤：寒暄/短消息过滤 + 召回预过滤（跳过低信息量消息） |
| **Temporal Classifier** | `temporal/classifier.ts` | 时间分类：将节点分为 static（持久知识）或 dynamic（时效信息） |
| **Session Compressor** | `session/compressor.ts` | 会话价值评估 + LLM 会话压缩（提取关键决策/结论） |
| **Format Assemble** | `format/assemble.ts` | 上下文组装：将召回记忆格式化为 XML（含社区分组、情景回溯），Token 预算控制 |
| **Hook Registry** | `plugin/hooks.ts` | 6 类插件钩子（before/after extract, before/after recall, before/after fusion） |

### 🖥️ 9. UI 与控制 (`src/ui/`)

UI 子系统是唯一**直接持有 `IStorageAdapter` 引用**的消费者，绕过所有 Domain Service 层，提供了一个嵌入式 Web 控制台（REST API + WebSocket 实时推送）。

#### 9.1 架构层次

```
HTTP Request / WebSocket Upgrade
  → Hono route matching
  → auth middleware (Bearer Token / Query Token 校验)
  → Controller handler
  → IStorageAdapter (直连，不经 Domain Service)
  → JSON Response / WebSocket broadcast
```

#### 9.2 服务器 (`server.ts`)

| 组件 | 技术栈 | 说明 |
|------|--------|------|
| HTTP 框架 | Hono | 轻量路由，`app.route('/api', api)` 挂载 REST |
| 原生 HTTP Server | `node:http.createServer` | Hono `fetch` 适配，读取 `IncomingMessage` 转换 `Request` |
| WebSocket | `ws.WebSocketServer` | 共享同一 HTTP Server 的 upgrade 路径 |
| 事件总线 | `node:events.EventEmitter` | `stats:updated` / `node:created` / `node:updated` / `node:deprecated` / `config:changed` |
| 静态文件 | Hono `app.get('/')` + `/assets/*` | 从 `ui/dist/` 和 `ui/public/` 读取 |
| 绑定策略 | `loopback` (127.0.0.1) / `lan` (0.0.0.0) | 由 `config.bind` 控制 |
| 端口协商 | `port: 0` → 系统自动分配 | 启动时日志打印实际端口 |

#### 9.3 REST API（11 个端点）

| 方法 | 路径 | 控制器 | 说明 |
|------|------|--------|------|
| `GET` | `/api/stats` | `stats.ts` | 存储统计 + 衰减状态(core/working/peripheral分布) + DB文件大小 |
| `GET` | `/api/stats/decay` | `stats.ts` | 衰减概览(healthy/fading/forgotten) + 30天半衰期曲线 |
| `GET` | `/api/nodes` | `nodes.ts` | 节点列表(搜索+分类过滤+排序+分页, limit max 200) |
| `GET` | `/api/nodes/:id` | `nodes.ts` | 节点详情(完整content≤5000ch) + 关联边(with方向+名称) |
| `POST` | `/api/nodes` | `nodes.ts` | 手动创建节点(source='manual') → 触发 `node:created` 事件 |
| `PUT` | `/api/nodes/:id` | `nodes.ts` | 更新节点(仅更新传入字段) → 触发 `node:updated` 事件 |
| `DELETE` | `/api/nodes/:id` | `nodes.ts` | 弃用节点(deprecateNode) → 触发 `node:deprecated` 事件 |
| `POST` | `/api/nodes/merge` | `nodes.ts` | 合并节点(keepId+mergeId) → 触发 `stats:updated` 事件 |
| `GET` | `/api/graph` | `graph.ts` | 全量图谱数据(top-N pagerank节点+边+社区, maxNodes≤500) |
| `GET` | `/api/graph/community/:id` | `graph.ts` | 单个社区子图(节点+边) |
| `GET` | `/api/config` | `config.ts` | 读取 brain-memory 配置(从 openclaw.json) + JSON Schema |
| `PUT` | `/api/config` | `config.ts` | 保存配置(原子写 tmp→rename + .bak备份) → 触发 `config:changed` 事件 |

#### 9.4 WebSocket 事件协议

| 事件名 | payload | 触发时机 |
|--------|---------|---------|
| `connected` | `{timestamp: number}` | 客户端初次连接 |
| `stats:updated` | `StorageStats` | 节点创建/更新/弃用/合并后 |
| `node:created` | `{node: BmNode}` | POST /api/nodes |
| `node:updated` | `{node: BmNode, changes: string[]}` | PUT /api/nodes/:id |
| `node:deprecated` | `{nodeId: string}` | DELETE /api/nodes/:id |
| `config:changed` | `{diff: string[], requiresRestart: true}` | PUT /api/config |

#### 9.5 认证 (`middleware/auth.ts`)

- 从 Gateway 配置读取 `authToken`（通过 `config._gatewayToken` 透传）
- 未配置 token → 所有请求放行（localhost 开发模式）
- 已配置 token → 校验 `Authorization: Bearer <token>` 或 `?token=<token>` query 参数
- WebSocket 同样校验 `?token=` 参数，失败返回 `4001 Unauthorized`
- 静态文件 `/` 和 `/assets/*` **不受认证保护**（公开访问）

#### 9.6 Canvas 嵌入视图

- `GET /embed/dashboard` → 从 `ui/public/embed-dashboard.html` 读取
- 用于 OpenClaw Canvas 系统中的内嵌仪表盘

### 🧰 10. 工具函数 (`src/utils/`)

| 模块 | 功能 |
|------|------|
| `text.ts` | 分词、Jaccard 相似度 |
| `similarity.ts` | 余弦相似度（Float64Array + Float32Array） |
| `tokens.ts` | 中英文 Token 估算 |
| `truncate.ts` | 智能截断（段落/句子边界） |
| `json.ts` | JSON 提取（正则 + 容错解析） |
| `xml.ts` | XML 转义 |
| `logger.ts` | 统一日志 |
| `errors.ts` | 错误类型 |

### 📜 11. 提示词

#### 11.1 提示词文件分布

| 文件 | 包含的提示词 | 说明 |
|------|------------|------|
| `prompts/small.ts` | `EXTRACT_SYS_SMALL` / `REFLECTION_SYS_SMALL` / `FUSION_DECIDE_SYS_SMALL` / `REASONING_SYS_SMALL` | 所有 Small 模式变体集中管理 |
| `extractor/extract.ts` | `EXTRACT_SYS` / `FINALIZE_SYS`（内部常量） | 提取主提示词 + 会话结束审查 |
| `reflection/prompts.ts` | `TURN_REFLECTION_SYS` / `SESSION_REFLECTION_SYS` | 双模式反思提示词 |
| `fusion/prompts.ts` | `FUSION_DECIDE_SYS` | 融合决策提示词 |
| `reasoning/prompts.ts` | `REASONING_SYS` | 推理分析提示词 |
| `graph/community.ts` | `COMMUNITY_SUMMARY_SYS`（内部常量） | 社区摘要提示词 |

#### 11.2 提示词策略

| 提示词 | Full 模式 (~tokens) | Small 模式 (~tokens) | 压缩率 | 选择逻辑 |
|--------|-------------------|---------------------|--------|---------|
| 知识提取 | ~1200 | ~180 | 6.7x | `mode==='small'` → `EXTRACT_SYS_SMALL` |
| 轮次反思 | ~500 | ~150（合并） | 3.3x | `mode==='small'` → `REFLECTION_SYS_SMALL` |
| 会话反思 | ~2500 | ~150（合并） | 16.7x | `mode==='small'` → `REFLECTION_SYS_SMALL` |
| 融合决策 | ~400 | ~120 | 3.3x | `mode==='small'` → `FUSION_DECIDE_SYS_SMALL` |
| 推理分析 | ~400 | ~140 | 2.9x | `mode==='small'` → `REASONING_SYS_SMALL` |
| 社区摘要 | ~200 | — | — | 仅 full 模式，lite 跳过 |

> **路由规则**：提示词选择在调用方（Extractor / ReflectionService / FusionService / ReasoningService）内部根据 `config.mode` 判断，非集中路由。Small 模式提示词统一存放在 `prompts/small.ts`，避免散落各处。

### 🛠️ 12. 运维工具 (`scripts/`)

| 脚本 | 用途 | 类型 |
|------|------|------|
| `check-health.cjs` | 工程卫生检查（lint/tsc/test 一键验证） | 开发 |
| `doctor.js` | CLI 诊断工具 — 检查数据库状态、节点统计、健康度 | 运维 |
| `setup.js` | 一键安装依赖 + 初始化数据库 | 部署 |
| `configure.js` | 交互式配置向导 | 部署 |
| `setup-openclaw.js` | 向 OpenClaw Gateway 注册插件 | 部署 |
| `generate-index.js` | 自动生成 `.devdocs/INDEX.md` | 开发 |
| `scan-jsdoc-coverage.js` | JSDoc 注释覆盖率扫描 | 质量 |
| `release.sh` | 发布流程自动化（version bump + tag + push） | 发布 |
| `publish-npm.sh` | npm 发布脚本 | 发布 |
| `lancedb-poc.js` | LanceDB 概念验证脚本 | 实验 |
| `mock-openclaw-test.js` | Mock OpenClaw 集成测试辅助 | 测试 |

---

## 三、核心工作流程

```
1. 用户消息进入
   └→ NoiseFilter 噪声过滤
   └→ IntentAnalyzer 意图分析
   └→ RecallService 记忆召回（PPR + 向量 + 社区 + 语义 + 外部）
        ├→ Reranker 重排序
        └→ Decay 时间衰减

2. 对话轮次处理 (processTurn)
   └→ Heuristic Extract（规则提取，<10ms）
   └→ LLM Extract（AI 提取）
   └→ 合并去重
   └→ Upsert Nodes/Edges
   └→ Batch Embed（批量嵌入）
   └→ Turn Reflection（轮次反思）
   └→ Working Memory 更新

3. 会话结束 (onSessionEnd)
   └→ Session Reflection（LLM 剖析）
   └→ Fusion（知识融合）
   └→ Maintenance（PageRank + 社区检测 + 衰减归档）

4. 记忆注入 (beforeMessageSend)
   └→ assembleContext（XML 格式化）
   └→ 注入 System Prompt
```

---

## 四、关键设计决策

| 决策 | 说明 |
|------|------|
| **8 类记忆体系** | profile/preferences/entities/events/tasks/skills/cases/patterns |
| **3 种节点类型** | TASK / SKILL / EVENT |
| **11 种边类型** | USED_SKILL / SOLVED_BY / REQUIRES / PATCHES / CONFLICTS_WITH / HAS_PREFERENCE / BELONGS_TO / LEARNED_FROM / EXEMPLIFIES / RELATED_TO / OBSERVED_IN |
| **Weibull 衰减** | 三级分层（core/working/peripheral），动态记忆 3x 快速衰减 |
| **v2.0 六层 Scope** | platform > workspace > agent > user > chat > thread（前缀匹配） |
| **三引擎模式** | graph（图为主）/ vector（向量为主）/ hybrid（双引擎融合） |
| **三运行模式** | full（全部功能）/ lite（跳过 LLM 反思/融合）/ small（精简提示词） |
| **Tiered Extraction** | 启发式(T1) → LLM(T2) → 容错解析(T3)，LLM 不可用时自动降级 |
| **存储抽象** | IStorageAdapter 解耦算法与存储；LanceDB 作为 ISearchIndex 伴生语义索引 |
| **增量维护** | 脏节点比例 <10% 时走增量 PageRank/社区检测，否则全量重算 |

---

## 五、数据表结构

| 表名 | 说明 | 关键字段 |
|------|------|----------|
| `bm_nodes` | 知识图谱节点 | id, type(TASK/SKILL/EVENT), category(8类), name, description, content, status, pagerank, importance, scope_*(6层), source, temporal_type |
| `bm_edges` | 图谱边关系 | id, from_id, to_id, type(11种), instruction, condition, session_id |
| `bm_vectors` | 节点嵌入向量 | node_id, embedding(BLOB), hash |
| `bm_messages` | 对话消息 | id, session_id, turn_index, role, content, extracted |
| `bm_communities` | 社区摘要 | id, summary, node_count, embedding |
| `bm_nodes_fts` | FTS5 全文索引 | name, description, content（自动同步） |

---

**总计：11 个功能模块组，71 个 TypeScript 源文件，覆盖记忆提取、存储、检索、融合、反思、推理、注入和可视化全流程。**
