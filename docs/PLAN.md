# brain-memory 推进计划

> 三层架构，分步实施。先做实基础层，再往上叠。

---

## 一、阶段零：紧急修复（1-2 天）

> ✅ 完成时间：2026-04-19

**目标：** 修复已知 6 个高严重度 + 关键中严重度 bug，让已有代码模块无高严重度问题

| # | 任务 | 对应问题 | 工作量 | 详情 | 状态 |
|---|------|----------|--------|------|------|
| 0.1 | 删除 store.ts 冗余的 `getCommunityPeers` | 6.1 | 5min | store.ts 和 community.ts 有同名函数，recall.ts 从 community.ts 导入。删除 store.ts 副本。 | ✅ |
| 0.2 | 修复 `toNode` 的 category 回退 | 2.1 | 10min | `r.category \|\| "events"` 改为按 type 推导（TASK→tasks, SKILL→skills, EVENT→events），NULL 不再全部回退到 events | ✅ |
| 0.3 | 修复 `saveVector` 的向量转换 | 2.2 | 10min | `new Uint8Array(new Float32Array(vec).buffer)` 改为 `new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength)` | ✅ |
| 0.4 | 修复 `llm.ts` 的 isAnthropic 判断 | 3.1 | 10min | 没配 apiKey 且没显式配 baseURL 时才 fallback 到 Anthropic | ✅ |
| 0.5 | 提取器支持 8 类 + 设置 category | 5.1, 5.2 | 1h | 扩展 EXTRACT_SYS prompt 支持 8 类；ExtractionResult.nodes 增加 category 字段 | ✅ |
| 0.6 | 提取器集成噪声过滤 | 5.3 | 20min | 提取前调用 `isNoise()` 过滤低质量消息 | ✅ |
| 0.7 | 提取器集成时间分类 | 5.5 | 1h | 移植 memory-lancedb-pro 的 temporal-classifier，提取时标记 static/dynamic | ✅ |
| 0.8 | 衰减集成到召回排序 | 11.1, 6.2 | 30min | recaller.recall() 中结合 `scoreDecay()` 对 PPR 分数做衰减加权 | ✅ |
| 0.9 | Recaller 调用 updateAccess | 6.3 | 10min | recall() 返回结果时自动调用 updateAccess 更新访问计数 | ✅ |

**产出：**
- ✅ 所有已有代码模块无高严重度 bug
- ✅ 衰减和噪声过滤真正生效
- ✅ 提取支持 8 类记忆分类
- ✅ 删除重复代码（normalizeName、getCommunityPeers）

---

## 二、阶段一：重写 ContextEngine（Graph Mode MVP，3-5 天）

> ✅ 完成时间：2026-04-19

**目标：** 将 brain-memory 注册为 ContextEngine，在 `engine: "graph"` + `storage: "sqlite"` 模式下完全可用

| # | 任务 | 来源参考 | 工作量 | 详情 | 状态 |
|---|------|----------|--------|------|------|
| 1.1 | **实现 bootstrap** | graph-memory | 15min | 初始化 DB，返回 bootstrapped 状态 | ✅ |
| 1.2 | **实现 ingest** | graph-memory | 30min | 消息入库，维护 turn 计数器（从 DB 读取最大 turn_index），不调用噪声过滤（已在阶段零 0.6 处理） | ✅ |
| 1.3 | **实现 assemble** | graph-memory | 2h | 上下文组装：召回 → XML 格式化（按社区分组） → 情景追溯（Top 3 节点原始对话） → Token 预算管理 → systemPromptAddition | ✅ |
| 1.4 | **实现 compact** | graph-memory | 30min | 批量处理未提取消息的兜底机制 | ✅ |
| 1.5 | **实现 afterTurn** | graph-memory | 2h | 每轮提取：新消息提取 → 节点入库 → 边入库 → 嵌入同步。同 session 串行化（Promise chain），不同 session 并行 | ✅ |
| 1.6 | **实现 session_end** | graph-memory | 1h | EVENT→SKILL 晋升 + 补充遗漏关系 + 维护流水线（去重→PPR→社区检测→摘要） | ✅ |
| 1.7 | **注册为 ContextEngine** | graph-memory | 30min | 在 openclaw.plugin.json 中声明 contextEngine，配置 `plugins.slots.contextEngine` | ✅ |
| 1.8 | **保留 4 个工具** | 已有 | 30min | bm_search, bm_record, bm_stats, bm_maintain（适配 ContextEngine 模式） | ✅ |
| 1.9 | **删除事件钩子代码** | 清理 | 15min | 删除旧的 before_prompt_build / message_received / session_end 钩子，全部迁移到 ContextEngine 生命周期 | ✅ |

**产出：**
- ✅ brain-memory 可作为 ContextEngine 被 OpenClaw 使用
- ✅ 每轮对话后自动提取知识
- ✅ 上下文组装带 token 预算、情景追溯、最后一轮完整对话
- ✅ 消息入库可靠（turn 计数器不依赖 event.turnIndex）
- ✅ 可直接替代 graph-memory 使用

### 1.10 阶段一测试

| # | 任务 | 工作量 | 详情 | 状态 |
|---|------|--------|------|------|
| 1.10.1 | store 测试 | 1h | CRUD、FTS5 搜索、向量搜索、社区操作 | ✅ |
| 1.10.2 | extractor 测试 | 1h | 8 类提取、边约束、名称标准化、JSON 解析 | ✅ |
| 1.10.3 | recaller 测试 | 1h | 精确路径、泛化路径、PPR 排序、衰减加权 | ✅ |
| 1.10.4 | decay 测试 | 30min | Weibull 衰减、分层计算、综合评分 | ✅ |
| 1.10.5 | noise 测试 | 30min | 各种噪声类型识别 | ✅ |
| 1.10.6 | 集成测试 | 2h | 完整生命周期：ingest → afterTurn → assemble → session_end → maintain | ✅ |

---

## 三、阶段二：向量引擎（Vector Mode，3-5 天）

> ✅ 完成时间：2026-04-19

**目标：** 支持 `engine: "vector"` 模式，纯向量+FTS5召回，不需要图结构也能高效检索

| # | 任务 | 来源参考 | 工作量 | 详情 | 状态 |
|---|------|----------|--------|------|------|
| 2.1 | **RRF 融合检索** | memory-lancedb-pro | 2h | 向量搜索 + FTS5 全文检索，用 RRF（Reciprocal Rank Fusion）融合结果 | ✅ |
| 2.2 | **向量召回器** | 新 | 2h | 新建 vector-recall.ts，不依赖图结构，纯向量+全文检索 | ✅ |
| 2.3 | **交叉编码器重排** | memory-lancedb-pro | 2h | 召回后调用 reranker API（Jina/SiliconFlow/Voyage 等）精排 | ✅ |
| 2.4 | **准入控制** | memory-lancedb-pro | 2h | 限制写入频率，防止重复和低质量记忆涌入 | ✅ |
| 2.5 | **意图分析** | memory-lancedb-pro | 2h | 分析查询意图，按意图调整召回策略 | ✅ |
| 2.6 | **查询扩展** | memory-lancedb-pro | 1h | FTS5 召回前做同义词扩展，提高召回率 | ✅ |

**产出：**
- ✅ 纯向量模式可用
- ✅ 混合检索（向量+全文）+ RRF 融合
- ✅ 交叉编码器精排
- ✅ 意图驱动召回
- ✅ 写入质量管控

---

## 四、阶段三：双引擎融合（Hybrid Mode，5-7 天）

> ✅ 完成时间：2026-04-19

**目标：** 支持 `engine: "hybrid"` 模式，图+向量协同工作

| # | 任务 | 工作量 | 详情 | 状态 |
|---|------|--------|------|------|
| 3.1 | **双召回合并** | 2h | 图召回 + 向量召回结果去重 + 融合排序 | ✅ |
| 3.2 | **偏好槽位** | 2h | 结构化提取用户偏好（语言、工具、代码风格等） | ✅ |
| 3.3 | **多 Scope 隔离** | 3h | 按 session/agent/workspace 隔离记忆，支持跨 scope 检索 | ✅ |
| 3.4 | **会话压缩** | 3h | 长会话价值评估 + 压缩，保留关键决策和结论 | ✅ |
| 3.5 | **LanceDB 后端（可选）** | 3h | 支持 `storage: "lancedb"`，面向大规模场景（向量量级 > 10K） | ⏸️ 跳过 |

**产出：**
- ✅ 图+向量双引擎协同
- ✅ 偏好管理
- ✅ 多租户隔离
- ✅ 长会话治理
- ✅ 可选 LanceDB 后端

---

## 五、阶段四：认知层（2026-04-19 开始）

**目标：** 从"记忆库"升级为"大脑"

**开发顺序：** 4.1 → 4.4 → 4.2 → 4.3（串行，CLI 和文档延后到阶段五）

### 4.1 反思系统（Reflection System）

| # | 任务 | 来源参考 | 工作量 | 详情 | 状态 |
|---|------|----------|--------|------|------|
| 4.1.1 | **类型扩展** | 新 | 30min | `types.ts` 增加 ReflectionItem 类型定义（invariant/derived/decay 参数） | ✅ |
| 4.1.2 | **反射提取 Prompt** | memory-lancedb-pro | 1h | 新建 `src/reflection/prompts.ts`，设计 4 维度 Prompt（user-model deltas / agent-model deltas / lessons & pitfalls / durable decisions） | ✅ |
| 4.1.3 | **反射提取器** | memory-lancedb-pro | 3h | 新建 `src/reflection/extractor.ts`，从对话/提取结果中解析反射切片，带注入安全过滤 | ✅ |
| 4.1.4 | **反射存储** | 新 | 2h | 新建 `src/reflection/store.ts`，反射项持久化到 SQLite（logistic 衰减：invariant 半衰 45 天，derived 半衰 7 天） | ✅ |
| 4.1.5 | **反射集成** | 新 | 2h | 在 `afterTurn`（轻量轮次反思）和 `session_end`（重量会话反思）触发，结果存为图谱节点 | ✅ |
| 4.1.6 | **测试** | 新 | 1h | 反射提取、存储、衰减、集成测试 | ✅ |

**产出：**
- 反思结果存为图谱节点（带边连接），不是扁平文本
- 两类触发：轮次轻量 + 会话重量
- 安全过滤防止 prompt injection
- 反射结果参与 PPR 排名、社区检测、衰减治理

### 4.4 工作记忆（Working Memory）

| # | 任务 | 工作量 | 详情 | 状态 |
|---|------|--------|------|------|
| 4.4.1 | **类型扩展** | 30min | `types.ts` 增加 WorkingMemory 类型（currentTask/recentDecisions/constraints/attention） | ✅ |
| 4.4.2 | **工作记忆管理器** | 2h | 新建 `src/working-memory/manager.ts`，每轮提取时同步更新工作记忆 | ✅ |
| 4.4.3 | **集成到 assemble** | 1h | 工作记忆注入到上下文顶部（最高优先级） | ✅ |
| 4.4.4 | **集成到 afterTurn** | 1h | 从每轮对话自动提取/更新工作记忆 | ✅ |
| 4.4.5 | **测试** | 1h | 工作记忆管理器测试 | ✅ |

**产出：**
- 实时维护当前任务目标和关注点
- 注入上下文顶部，Agent 始终看到最新关注点

### 4.2 知识融合（Knowledge Fusion）

| # | 任务 | 工作量 | 详情 | 状态 |
|---|------|--------|------|------|
| 4.2.1 | **相似度分析** | 2h | 新建 `src/fusion/analyzer.ts`，基于向量相似度 + 文本语义相似度发现潜在关联节点对 | ✅ |
| 4.2.2 | **融合 Prompt** | 1h | 新建 `src/fusion/prompts.ts`，LLM 判断两节点是否应融合/关联 | ✅ |
| 4.2.3 | **融合执行** | 2h | 融合节点合并（复用 mergeNodes）、自动添加跨社区关联边 | ✅ |
| 4.2.4 | **集成到维护流水线** | 1h | `session_end` 中融合步骤（去重之后，维护之前）+ bm_fuse 工具 | ✅ |
| 4.2.5 | **测试** | 1h | 融合分析器、融合执行器测试 | ✅ |

**产出：**
- 发现不同时期类似问题的本质关联
- 合并碎片化知识
- 自动添加跨社区关联边

### 4.3 推理检索（Reasoning Retrieval）

| # | 任务 | 工作量 | 详情 | 状态 |
|---|------|--------|------|------|
| 4.3.1 | **类型扩展** | 30min | `types.ts` 增加 ReasoningConfig 类型（已在 4.2 类型扩展中完成） | ✅ |
| 4.3.2 | **推理引擎** | 3h | 新建 `src/reasoning/engine.ts`，对召回结果做图遍历推理（路径分析、隐含关系推导、多跳结论合成） | ✅ |
| 4.3.3 | **推理 Prompt** | 1h | 新建 `src/reasoning/prompts.ts`，LLM 从相关节点推理出新结论 | ✅ |
| 4.3.4 | **集成到组装** | 1h | assemble 时如果有推理结果，追加推理结论到上下文 | ✅ |
| 4.3.5 | **测试** | 1h | 推理引擎测试 | ✅ |

**产出：**
- 不只是找最匹配的节点，而是用相关记忆推理出新结论
- 多跳结论合成

### 4.5 CLI 工具（延后到阶段五）

**目标：** 记忆管理命令行工具。

| # | 任务 | 详情 |
|---|------|------|
| 4.5.1 | CLI 框架 | `src/cli/index.ts`，支持子命令模式 |
| 4.5.2 | `bm stats` | 统计：节点数、边数、社区数、向量数 |
| 4.5.3 | `bm list` | 列出节点/边/社区（带过滤） |
| 4.5.4 | `bm search` | 搜索记忆（FTS5/向量） |
| 4.5.5 | `bm inspect` | 查看单个节点详情（含边连接） |
| 4.5.6 | `bm maintain` | 触发维护流水线 |
| 4.5.7 | `bm reflect` | 触发反思 |
| 4.5.8 | `bm clear` | 清空数据库 |

### 4.6 完整文档（延后到阶段五）

| # | 任务 | 详情 |
|---|------|------|
| 4.6.1 | README.md | 项目介绍、快速开始、配置说明 |
| 4.6.2 | API 文档 | 每个模块的接口说明 |
| 4.6.3 | 架构说明更新 | ARCHITECTURE.md 补充认知层 |
| 4.6.4 | 配置指南 | 所有配置项的完整说明 |

---

## 六、总体时间线

```
阶段零 ────── 1-2 天 ────┐  ✅ 2026-04-19 完成（实际 ~2h）
                          │
阶段一 ────── 3-5 天 ─────┤  ✅ 2026-04-19 完成（实际 ~3h）
                          │
阶段二 ────── 3-5 天 ─────┤  ✅ 2026-04-19 完成（实际 ~2h）
                          │
阶段三 ────── 5-7 天 ─────┤  ✅ 2026-04-19 完成（实际 ~1h，3.5 LanceDB 跳过）
                          │
                          ├─── 实际用时：约 8h ─── 阶段零~三全部完成
                          │
阶段四 ────── 2-4 周 ─────┤  ✅ 2026-04-19 完成
  4.1 反思系统 ──→         │     4.1 → 4.4 → 4.2 → 4.3 串行完成
  4.4 工作记忆 ──→         │
  4.2 知识融合 ──→         │
  4.3 推理检索 ──→         │
  集成测试 ────────────    │  52 个新测试（extractor 30 + integration 22）
  低严重度修复 ────────    │  7 个 bug 修复
  LLM 集成测试 ────────    │  7/7 通过（DashScope qwen3.6-plus）
                          │
阶段五 ────── 待定 ───────┘  ⏳ 待开始 ─── CLI 工具 + 完整文档
```

> 注：实际开发速度远超预估，因为所有模块设计清晰、参考代码完整、测试驱动开发减少了返工。
> 阶段三跳过 LanceDB 后端（3.5），SQLite 对当前规模足够，后续评估。
> 阶段四串行推进（4.1 → 4.4 → 4.2 → 4.3），减少隐式依赖导致的返工。
> 4.5 CLI 和 4.6 文档延后到阶段五（不影响核心功能）。
> 认知层 LLM 成本控制：轮次反思默认规则版（零成本），融合/推理阈值触发，避免小图谱浪费 LLM 调用。

---

## 七、关键设计决策

| # | 决策 | 选项 | 结论 |
|---|------|------|------|
| 1 | 8 类分类是否调整 | 精简/合并/保持 | ✅ 保持 8 类，提取器扩展即可 |
| 2 | 边约束是否保留 | 保留/取消 | ✅ 保留，保证图谱质量 |
| 3 | LanceDB 后端必要性 | 需要/不需要 | ✅ 阶段三不引入，SQLite 够用（2026-04-19） |
| 4 | ContextEngine 注册方式 | 沿用 graph-memory / 新设计 | ✅ 沿用 `plugins.slots.contextEngine` |
| 5 | 反思结果存储方式 | 扁平文本 / 图谱节点 | ✅ 存为图谱节点，利用图结构优势 |
| 6 | 阶段四开发节奏 | 并行 / 串行 | ✅ 串行（4.1 → 4.4 → 4.2 → 4.3），减少返工 |
| 7 | 轮次反思实现方式 | LLM / 规则 | ✅ 默认规则版（零 LLM 成本），LLM 版可选 |
| 8 | 认知层 LLM 成本控制 | 全开 / 阈值触发 | ✅ 规则优先 + 阈值触发（融合需 20+ 节点，推理需 3+ 召回节点） |

---

## 八、当前状态快照

> 更新时间：2026-04-19 23:20（LLM 集成测试验证通过，187 个测试全部通过）

| 模块 | 文件 | 状态 | 备注 |
|------|------|------|------|
| 类型定义 | `src/types.ts` | ✅ | 8 类体系 + 图节点 + 边 + 衰减字段 + Scope 字段 |
| 数据库 Schema | `src/store/db.ts` | ✅ | SQLite + FTS5 + 触发器 + Scope 列 |
| CRUD 操作 | `src/store/store.ts` | ✅ | 所有阶段零/阶段三修复完成 |
| LLM 引擎 | `src/engine/llm.ts` | ✅ | 阶段零修复完成 |
| Embedding 引擎 | `src/engine/embed.ts` | ✅ | 无问题 |
| 提取器 | `src/extractor/extract.ts` | ✅ | 8 类 + 噪声过滤 + 时间分类 |
| 召回器（图） | `src/recaller/recall.ts` | ✅ | 衰减集成 + updateAccess |
| 召回器（向量） | `src/retriever/vector-recall.ts` | ✅ | RRF 融合 |
| 召回器（混合） | `src/retriever/hybrid-recall.ts` | ✅ | 图+向量融合 |
| 组装器 | `src/format/assemble.ts` | ✅ | 无问题 |
| PageRank | `src/graph/pagerank.ts` | ✅ | 无问题 |
| 社区检测 | `src/graph/community.ts` | ✅ | 无问题 |
| 去重 | `src/graph/dedup.ts` | ✅ | 无问题 |
| 维护流水线 | `src/graph/maintenance.ts` | ✅ | 无问题 |
| 衰减引擎 | `src/decay/engine.ts` | ✅ | 已集成到召回 |
| 噪声过滤 | `src/noise/filter.ts` | ✅ | 无问题 |
| 查询扩展 | `src/retriever/query-expander.ts` | ✅ | 14 组同义词 |
| 意图分析 | `src/retriever/intent-analyzer.ts` | ✅ | 5 种意图 |
| 重排器 | `src/retriever/reranker.ts` | ✅ | 6 种 provider |
| 准入控制 | `src/retriever/admission-control.ts` | ✅ | 防重复写入 |
| 偏好槽位 | `src/preferences/slots.ts` | ✅ | 规则引擎 |
| Scope 隔离 | `src/scope/isolation.ts` | ✅ | 多租户隔离 |
| 会话压缩 | `src/session/compressor.ts` | ✅ | 价值评估 + 压缩 |
| ContextEngine | `index.ts` | ✅ | 支持 graph/vector/hybrid 三种模式 + 反思集成 + 工作记忆集成 |
| 反思系统 | `src/reflection/` | ✅ | 4.1 完成：规则版轮次反思 + LLM 会话反思 + 安全过滤 + bm_reflect 工具 |
| 工作记忆 | `src/working-memory/` | ✅ | 4.4 完成：零 LLM 提取 + 上下文注入 + 12 个测试 |
| 知识融合 | `src/fusion/` | ✅ | 4.2 完成：相似度分析 + LLM 决策 + 融合执行 + bm_fuse 工具 + 19 个测试 |
| 推理检索 | `src/reasoning/` | ✅ | 4.3 完成：LLM 推理引擎 + 4 类结论 + 阈值触发 + 14 个测试 |
| LLM 集成测试 | `test/llm-integration.test.ts` | ✅ | 7 个测试全部通过（2026-04-19 23:18，DashScope qwen3.6-plus，耗时 ~116s）：连通性/反思/推理/融合 |
| 提取器测试 | `test/extractor.test.ts` | ✅ | 30 个测试：JSON 解析 / 8 类支持 / 边约束 / 名称标准化 / 噪声过滤 / 时间分类 / finalize |
| 集成测试 | `test/integration.test.ts` | ✅ | 22 个测试：完整生命周期 ingest→extract→recall→assemble→maintain + 衰减集成 + 噪声集成 |
