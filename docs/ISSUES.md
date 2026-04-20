# brain-memory 问题记录本

> 创建时间：2026-04-18 23:30
> 代码审查验证：2026-04-19 21:05（LLM 集成测试完成，187 个测试全部通过）
> 阶段零修复：2026-04-19（所有 9 个任务完成 ✅）
> 阶段一修复：2026-04-19（10 个任务完成 ✅）
> 阶段二完成：2026-04-19（6 个任务完成 ✅，新增功能无 bug 修复）
> 阶段三完成：2026-04-19（4/5 任务完成 ✅，LanceDB 跳过）
> 配置修复：2026-04-20（LLM/Embedding 默认值清空 + 启动检测 + 运行时提醒）
> 验证范围：所有已完成模块的代码级审查

---

## 一、模块逐一验证结果

### 1. `src/store/db.ts` — 数据库 Schema

**状态：基本正确**

| # | 问题 | 严重度 | 说明 |
|---|------|--------|------|
| 1.1 | FTS5 `content_rowid='rowid'` 隐式依赖 | 低 | ~~`bm_nodes` 的 PK 是 `TEXT`，SQLite 会创建隐式 rowid~~ ✅ 已在 db.ts 添加注释说明隐式 rowid 行为（SQLite 对无 INTEGER PK 的表自动提供 rowid） |

### 2. `src/store/store.ts` — CRUD 操作

**状态：✅ 阶段零已修复（2.1, 2.2）**

| # | 问题 | 严重度 | 说明 |
|---|------|--------|------|
| 2.1 | `toNode` 的 `category` 回退值硬编码为 `"events"` | 中 | `toNode` 函数中 `category: (r.category \|\| "events")` 回退到 `"events"`，但 8 类体系中回退到单一类型不合理。NULL 值应该报错或返回 null 而非静默回退。 |
| 2.2 | `saveVector` 的 Float32Array → Uint8Array 转换脆弱 | 中 | `new Uint8Array(new Float32Array(vec).buffer)` 依赖 Float32Array 的 ArrayBuffer 从 0 偏移。当前 `new Float32Array(vec)` 创建新 buffer 所以能工作，但如果 vec 本身是带偏移的 TypedArray 视图就会出错。应显式指定 offset 和 length：`new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength)`。 |

### 3. `src/engine/llm.ts` — LLM 调用

**状态：✅ 阶段零已修复（3.1）**

| # | 问题 | 严重度 | 说明 |
|---|------|--------|------|
| 3.1 | `isAnthropic` 判断逻辑不完整 | 中 | `const isAnthropic = baseURL.includes("anthropic") \|\| !cfg?.apiKey;` 当配置了 `baseURL` 但没配置 `apiKey` 时不会走 Anthropic fallback（因为 `isAnthropic` 为 false），而是用空 key 调 OpenAI 端点。正确逻辑应该是：如果没配 `apiKey` 且没有显式 `baseURL` 才 fallback 到 Anthropic。 |

### 4. `src/engine/embed.ts` — Embedding 调用

**状态：正确 ✅**

无明显问题。fetch 实现、API key 检查、dimensions 处理都正确。

### 5. `src/extractor/extract.ts` — 知识提取

**状态：✅ 阶段零已修复（5.1-5.5）**

| # | 问题 | 严重度 | 说明 |
|---|------|--------|------|
| 5.1 | 提取 prompt 只定义了 3 类节点，未覆盖 8 类体系 | **高** | `EXTRACT_SYS` prompt 只定义了 TASK/SKILL/EVENT 三种节点类型，没有提及 profile、preferences、entities、cases、patterns 这 5 类。LLM 不会提取这些类别的记忆。 |
| 5.2 | 提取结果缺少 `category` 字段 | **高** | `ExtractionResult.nodes` 没有 `category` 字段，extractor 也不设置 category。依赖 `index.ts` 的硬编码映射（TASK→tasks, SKILL→skills, EVENT→events），但这只覆盖了 3 类，其余 5 类永远无法通过提取获得。 |
| 5.3 | 无噪声过滤 | 中 | 提取前没有调用 `isNoise()` 过滤低质量内容（问候语、确认语等），可能导致垃圾内容被提取到知识图谱中。 |
| 5.4 | `normalizeName` 重复定义 | 低 | ~~extract.ts 定义了独立的 normalizeName~~ ✅ 已从 store.ts 导入 normalizeName，不再重复 |
| 5.5 | 无时间分类集成 | 低 | 提取时没有调用时间分类器来设置 `temporalType`（static vs dynamic），所有节点默认都是 `static`。 |

### 6. `src/recaller/recall.ts` — 双路径召回

**状态：✅ 阶段零已修复（6.1-6.4）**

| # | 问题 | 严重度 | 说明 |
|---|------|--------|------|
| 6.1 | `getCommunityPeers` 导入来源错误 | **高** | `recall.ts` 第 19 行从 `../graph/community.ts` 导入 `getCommunityPeers`，但 `store.ts` 也有同名函数。两处实现完全相同（都是查询 community_id 相同的节点），但 `community.ts` 的版本是正确的，store.ts 的是冗余副本。 |
| 6.2 | 召回结果未应用衰减评分 | 中 | 召回排序只用 PPR 分数（`pprScores.get(b.id)`），没有结合 `scoreDecay()` 计算的时间衰减。`cfg.decay` 配置了但完全没用到。 |
| 6.3 | 召回不更新访问计数 | 中 | recall 函数本身不调用 `updateAccess()`，依赖 `index.ts` 的 before_prompt_build 钩子来更新。如果通过 `bm_search` 工具调用召回，访问计数不会更新，衰减数据不准确。 |
| 6.4 | 泛化召回在无社区时退化为获取代表节点 | 低 | ~~`recallGeneralized` 中如果社区向量搜索失败~~ ✅ 已确认代码正确处理空种子场景：`if (!seeds.length) return { nodes: [], edges: [], tokenEstimate: 0 }`，空图谱时返回空结果，无 crash |

### 7. `src/graph/community.ts` — 社区检测与摘要

**状态：基本正确**

| # | 问题 | 严重度 | 说明 |
|---|------|--------|------|
| 7.1 | `getCommunityPeers` 与 store.ts 重复 | 低 | ~~与问题 6.1 相同~~ ✅ 阶段零已修复：store.ts 副本已删除，仅 community.ts 保留 |
| 7.2 | 社区重命名可能不一致 | 低 | ~~社区检测后按大小重命名~~ ✅ 已在 community.ts 添加注释说明：LPA + 大小重命名是固有限制，社区 ID 在节点变化后可能不同 |
| 7.3 | 单节点社区处理 | 低 | ~~Label Propagation 对孤立节点~~ ✅ 已修复：detectCommunities 中过滤掉单节点社区（multi-node only），除非所有社区都是单节点 |

### 8. `src/graph/pagerank.ts` — PageRank

**状态：基本正确（8.1 保留，低严重度）**

| # | 问题 | 严重度 | 说明 |
|---|------|--------|------|
| 8.1 | `computeGlobalPageRank` 未先清除缓存 | 低 | ~~`computeGlobalPageRank` 直接调用 `loadGraph()`~~ ✅ 已修复：函数开头调用 `invalidateGraphCache()` 清除缓存 |

### 9. `src/graph/dedup.ts` — 向量去重

**状态：正确 ✅**

无明显问题。余弦相似度计算、去重逻辑、节点合并都正确。

### 10. `src/graph/maintenance.ts` — 维护编排

**状态：正确 ✅**

流水线编排（去重 → PPR → 社区检测 → 摘要）逻辑正确，异常处理得当。

### 11. `src/decay/engine.ts` — Weibull 衰减引擎

**状态：✅ 阶段零已修复（11.1）**

| # | 问题 | 严重度 | 说明 |
|---|------|--------|------|
| 11.1 | 衰减引擎存在但未被调用 | **高** | `scoreDecay()` 和 `applyTimeDecay()` 函数实现正确，但没有任何代码调用它们。召回排序、维护流程、节点查询都没有使用衰减评分。衰减模型完全未集成。 |

### 12. `src/noise/filter.ts` — 噪声过滤

**状态：正确 ✅**

实现正确，多语言问候/确认/短消息正则匹配都合理。

### 13. `index.ts` — 插件入口

**状态：✅ 阶段一已修复（13.1-13.5, 13.7）—— 重写为 ContextEngine 模式**

| # | 问题 | 严重度 | 说明 | 状态 |
|---|------|--------|------|------|
| 13.1 | 未实现 ContextEngine 接口 | **高** | ~~当前使用事件钩子~~ ✅ 已注册为 `brain-memory` ContextEngine，完整实现 bootstrap/ingest/assemble/compact/afterTurn 生命周期 | ✅ |
| 13.2 | 只在 session_end 提取，非每轮提取 | **高** | ~~session_end 时才调用~~ ✅ afterTurn 每轮直接提取，Promise chain 保证同 session 串行 | ✅ |
| 13.3 | `turnIndex` 硬编码为 0 | 中 | ~~event.turnIndex ?? 0~~ ✅ msgSeq 维护自增计数器，从 DB 读取最大值初始化，重启不重叠 | ✅ |
| 13.4 | 上下文组装过于简单 | 中 | ~~直接拼接 XML~~ ✅ 使用 assembleContext，token 预算、情景追溯、最后一轮完整对话、systemPromptAddition | ✅ |
| 13.5 | 衰减未集成到召回 | 中 | ~~before_prompt_build 中召回后调用了 updateAccess，但排序时没应用衰减~~ ✅ 阶段零已在 recaller 中集成 applyTimeDecay | ✅ |
| 13.6 | `bm_maintain` 工具未检查 LLM/embedFn 是否可用 | 低 | ~~bm_maintain 直接调用 runMaintenance~~ ✅ 已修复：bm_maintain 返回结果中增加 ⚠️ 提示，当 LLM/embedFn 未配置时告知用户 |
| 13.7 | 噪声过滤未在 ingest 中使用 | 低 | ~~before_prompt_build 中保存消息没有过噪声过滤~~ ✅ extractor.extract() 内部已调用 isNoise() 过滤 | ✅ |
| 13.8 | 无测试文件 | 中 | ~~整个项目没有 test/ 目录~~ ✅ 现有 17 个测试文件（2641 行），覆盖 store/extractor/recaller/decay/noise/graph/hybrid/intent/query-expander/temporal/vector-recall/reflection/working-memory/fusion/reasoning/integration + LLM 集成 | ✅ |

---

## 二、问题汇总统计

### 按严重度分布

> 阶段一修复后（2026-04-19）：阶段零修复了 2.1-3.1, 5.1-5.5, 6.1-6.4, 11.1；阶段一修复了 13.1-13.5, 13.7。低严重度 7 个也已修复：1.1（注释）、6.4（确认安全）、7.1-7.3（去重/注释/过滤）、8.1（缓存清除）、13.6（警告提示）。

| 严重度 | 剩余 | 已修 | 问题编号 |
|--------|------|------|----------|
| **高** | 0 | 5 | ~~5.1, 5.2, 11.1, 13.1, 13.2~~ 全部已修复 |
| **中** | 0 | 11 | ~~13.8（已修复：17 个测试文件，2641 行）~~；~~2.1, 2.2, 3.1, 5.3, 6.1, 6.2, 6.3, 13.3, 13.4, 13.5~~ 全部已修复 |
| **低** | 0 | 9 | ~~1.1（注释）~~；~~6.4（确认安全）~~；~~7.1-7.3（去重/注释/过滤）~~；~~8.1（缓存清除）~~；~~13.6（警告提示）~~；~~5.4（normalizeName 去重）~~ |

### 按模块分布

| 模块 | 问题数 | 核心问题 | 状态 |
|------|--------|----------|------|
| **index.ts** | 8 | 未实现 ContextEngine，只在 session_end 提取 | ✅ 阶段一已修复 |
| **extractor/extract.ts** | 4 | 只支持 3 类节点，无 category，无噪声过滤 | ✅ 阶段零已修复（5.4 也已修复：normalizeName 从 store.ts 导入，不再重复） |
| **recaller/recall.ts** | 4 | 衰减未集成，访问计数不完整 | ✅ 阶段零已修复 |
| **store/store.ts** | 2 | category 回退不合理，向量转换脆弱 | ✅ 阶段零已修复 |
| **engine/llm.ts** | 1 | Anthropic fallback 判断不完整 | ✅ 阶段零已修复 |
| **decay/engine.ts** | 1 | 存在但未被调用 | ✅ 阶段零已修复 |
| 其他 | 9 | 重复代码、边缘情况 | ⚠️ 保留为低严重度（13.7 噪声过滤已在提取器中集成，标记为已修） |

---

## 三、综合分析结论

### 3.1 整体评估

brain-memory 的骨架搭得扎实。经过三个阶段：
- ✅ graph-memory 的核心能力（图谱存储、PPR、社区检测、双路径召回、维护流水线）成功移植
- ✅ memory-lancedb-pro 的关键模块（Weibull 衰减、噪声过滤）已搬来且**真正集成**
- ✅ ContextEngine 模式替代了事件钩子，生命周期完整
- ✅ **向量引擎（Phase 2）完成**：RRF 融合、意图分析、查询扩展、准入控制、交叉编码器重排
- ✅ **双引擎融合（Phase 3）完成**：HybridRecaller、偏好槽位、Scope 隔离、会话压缩

**所有问题已全部修复（22 个）：** 5 高 + 11 中 + 6 低全部关闭。
低严重度修复汇总：1.1（FTS5 rowid 注释）、6.4（确认空种子安全返回）、7.1（去重）、7.2（LPA 重命名注释）、7.3（过滤单节点社区）、8.1（PageRank 缓存清除）、13.6（bm_maintain 警告提示）。

**阶段三新增模块质量：** 4 个新文件（hybrid-recall、slots、isolation、compressor）+ 数据库 Schema 扩展 + 测试覆盖。
**阶段四新增模块质量：** 8 个新文件（reflection/×3、working-memory、fusion/×2、reasoning/×2）+ 60 个单元测试 + 7 个 LLM 集成测试。
**总测试覆盖：** 17 个测试文件，2641 行，180 个单元测试通过 + **7 个 LLM 集成测试全部通过**（2026-04-19 23:18，DashScope qwen3.6-plus）。

**LanceDB 后端跳过：** SQLite 对当前规模足够，LanceDB 作为可选后端待后续评估。

### 3.2 ~~最关键的问题链~~ ✅ 已修复

ContextEngine 重写解决了全部问题：
- ✅ `index.ts` 已注册为 `brain-memory` ContextEngine（13.1）
- ✅ `afterTurn` 每轮提取，Promise chain 保证不跳过（13.2）
- ✅ `ingest` 维护自增 turn 计数器，重启不丢失（13.3）
- ✅ `assemble` 使用完整上下文组装：token 预算 + 情景追溯 + 最后一轮完整对话（13.4）
- ✅ 衰减已在阶段零集成到 recaller 召回排序（13.5）

### 3.3 ~~8 类体系是空的~~ ✅ 阶段零已修复

`types.ts` 定义了 8 类记忆，阶段零已修复：
- ~~提取器只识别 3 类~~ ✅ EXTRACT_SYS 已支持 8 类 + LLM 可输出 category
- ~~插入映射只覆盖 3 类~~ ✅ extractor 设置 category，index.ts 直接使用
- ✅ profile、preferences、entities、cases、patterns 现在可通过自动提取获得

### 3.4 ~~衰减模型是摆设~~ ✅ 阶段零已修复

Weibull 衰减引擎阶段零已集成：
- ✅ 召回排序使用 `applyTimeDecay()` 对 PPR 分数做衰减加权
- ✅ 召回返回时自动调用 `updateAccess()` 更新访问计数
- ⚠️ 但 `decay.enabled` 默认配置为 `false`，需用户手动开启
