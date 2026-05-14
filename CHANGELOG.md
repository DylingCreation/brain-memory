# Changelog

All notable changes to the brain-memory project.

> **Package name:** `memory-likehuman-pro` (npm)  
> **Repository:** https://github.com/DylingCreation/brain-memory

---

## [Unreleased]

## [1.3.0] — 2026-05-14

> **版本主题**：探索 + 收尾  
> **Commit**: 5016967

### Added

#### LanceDB POC (F-13)
- LanceDBStorageAdapter 实现 IStorageAdapter 接口（~300 行）
- POC 验证脚本 + 4 个测试用例
- 图算法（PageRank/LPA）改为内存执行

#### 工程收尾 (F-14/F-15)
- .gitignore 精简：61 → 41 行
- npm pack 排除 docs/api/

#### 性能验证 (F-16)
- 1k 节点 PageRank：增量 4.4x 快于全量
- 1k 节点 LPA：增量 2.1x 快于全量

### Changed
- package.json 版本号 1.0.0 → 1.3.0

### Tests
- 含 LLM：623 passed / 58 files / 14 timeout
- 不含 LLM：597 passed / 55 files / 18 skipped
- 覆盖率：71.88%（Statements）

## [1.2.0] — 2026-05-14

> **版本主题**：开发者体验 + 质量打磨  
> **Commit**: 86c5c50

### Added

#### 开发者 Hook (F-7)
- 6 种 Hook 类型（before/after extract/recall/fusion），ContextEngine 集成
- Hook 错误不中断主流程，FIFO 执行顺序

#### 质量打磨
- **JSDoc 补全 (F-8)** — 12.7% → 86.4%，全部 42 个源文件
- **覆盖率补全 (F-9)** — +31 测试用例，5 模块覆盖率提升
- **启发式质量验证 (F-10)** — 启发式 vs LLM 对比测试
- **Reranker 降级测试 (F-11)** — 7 个降级场景边界测试

#### CI 文档 (F-12)
- typedoc 配置 + `npm run docs` 生成 120 个 API 文档文件

### Tests
- 全量 **619 passed / 57 files**（+48 用例）

---

## [1.1.0] — 2026-05-14

> **版本主题**：性能基座 — 解耦存储与算法，实现增量图维护  
> **Commit**: d185e6d

### Added

#### 存储抽象 (F-1)
- **IStorageAdapter 接口** — 6 大类操作（生命周期、节点 CRUD、边 CRUD、搜索、向量、社区、消息、统计），~240 行
- **SQLiteStorageAdapter 实现** — 委托现有 store.ts，~300 行
- `ContextEngine.getDb()` 桥接方法 — 保留遗留代码兼容性

#### 增量图维护 (F-3)
- **脏标记基础设施** — processTurn 每次 upsert 后 markDirty，_expandDirtyMarks() 扩散到 1-hop 邻居
- **增量 PageRank** — `runIncrementalPageRank()`：子图 PR + 边界固定，脏节点重置初始值
- **增量 LPA** — `runIncrementalCommunities()`：冻结 + 局部传播，脏节点重置标签

#### 智能触发 (F-4)
- **双路径分流** — runMaintenance 内部 if/else：脏比例 < 10% 走增量，≥ 10% 走全量
- **阈值可配置** — `DEFAULT_DIRTY_THRESHOLD = 0.10`

### Changed
- **12 个源文件** 从 `DatabaseSyncInstance` → `IStorageAdapter`
- **16 个测试文件** 从 `createTestDb()` → `createTestStorage()`
- **LLM 集成测试环境** — .env 配置（qwen3.6-plus + Ollama bge-m3），5 个 skipped 文件全部跑通

### Tests
- 全量 **571 passed / 51 files / 0 failed / 0 errors**（+40 用例）
- 新增 4 个测试文件（增量维护 + 性能基准）

### Performance
- 200 节点 5% 脏比例：增量 ~2.7x 快于全量
- 10x 目标适用于 10k+ 节点规模

---

## [1.0.0] — 2026-05-13

> **版本主题**：从「功能完整」走向「核心架构完备 + 工程扎实」  
> **Commit**: 55d2455 · 本地 4 个提交领先 origin

### Added

#### 核心架构修复 (A 批次)
- **图 Schema 补全（A-1）** — 新增 6 种边类型（HAS_PREFERENCE、BELONGS_TO、LEARNED_FROM、EXEMPLIFIES、RELATED_TO、OBSERVED_IN），EDGE_TO_CONSTRAINT 不再全指向 SKILL，8 类节点都能建立/查询关系
- **启发式提取（A-2）** — 三级提取架构：①启发式（8 类正则+关键词+语义模板）②LLM 校验 ③多轮合并。无 LLM 时仍能产出有效节点，有 LLM 时调用次数降低 50-70%
- **OpenClaw 插件真实集成（A-3）** — `api.registerHook()` 规范注册，Handler 签名适配，5 钩子名全匹配，`setup-openclaw.js` 实际注入配置

#### 核心体验改进 (B 批次)
- **记忆注入格式 overhaul（B-1）** — `assembleContext` 接入 + `memoryInjection` 配置，summary/full/adaptive 三策略 + token 预算控制
- **多 Agent 记忆共享（B-2）** — `sharingMode` 三模式（isolated/mixed/shared）+ `sharedCategories` 过滤
- **遗忘曲线默认开启（B-3）** — `decay.enabled` 默认 true + 维护衰减归档
- **retriever/ 6 文件完整集成（B-4）** — intent-analyzer、hybrid-recall、query-expander、reranker、admission-control、vector-recall 接入 recall 主流程

#### 工程质量补债 (B 批次)
- **测试覆盖率 57% → 83.2%（B-5/B-7）** — 新增 7 个测试文件 + 扩展 reranker 测试，446 → 529 用例
- **JSDoc 24.1% → 50.7%（B-6）** — store.ts + analyzer.ts 核心文件全量注释

#### 工程清理 (C 批次)
- **.gitignore 清理（C-1）** — 删除 400+ 行 AI 批量生成的无效规则，490 行 → 61 行
- **.npmignore 完善（C-2）** — 新增屏蔽 19 项开发文件，移除 docs/ 误屏蔽
- **测试目录统一（C-3）** — 删除旧 `tests/` 21 个遗留文件，vitest 配置统一为 `test/` 单根
- **INDEX.md 自动生成（C-4）** — `scripts/generate-index.js` 扫描 .devdocs/ 目录树
- **doctor.js npm audit（C-5）** — 新增 checkSecurity() 模块，按 critical/high/moderate/low 分级报告
- **getStats() byCategory（C-6）** — 8 类节点分项统计
- **核心召回基线（C-7）** — 首次测量：avg 0.44ms / p95 0.50ms（200 节点）

#### 运行时适配 (v1.0.0 远程提交)
- **Ollama Embedding 适配** — `embed.ts` 检测端口 11434，端点路由 `/api/embed` vs 标准 `/embeddings`
- **Qwen thinking 优化** — `isThinkingModel()` 检测，对 qwen3 自动注入 `"thinking": { "type": "disabled" }`，延迟 4s → 1s
- **OpenClaw 插件增强** — Session 消息缓冲（Map 每 session 100 条）、Windows HOME/USERPROFILE 降级、AI 回复提取 Promise.race + 5s 超时
- **Windows 兼容** — `wrapper.ts` 增加 HOME/USERPROFILE 降级，`rimraf` 跨平台清理
- **环境变量统一** — `DASHSCOPE_*` → `TEST_LLM_*` / `TEST_EMBEDDING_*`
- **构建修复** — `tsconfig.build.json` 改用 `src/**/*.ts` 通配符，修复新模块被遗漏的 bug

### Changed
- **测试目录结构** — `test/` + `tests/` 并存 → 统一为 `test/` 单根目录
- **环境变量命名** — `DASHSCOPE_*` 废弃，统一为 `TEST_LLM_*` / `TEST_EMBEDDING_*` 前缀
- **vitest 配置** — 精简 include/exclude/alias，移除 `tests/` 相关路径
- **package.json clean** — `rm -rf dist coverage` → `npx rimraf dist coverage`（Windows 兼容）

### Fixed
- **测试用例数丢失** — B-5 批次的 5 个测试文件（115 用例）从未提交到 git，已重写并提交
- **plugin/core.ts 覆盖率 0%** — 测试文件缺失，重写后恢复至 75.53%
- **config.js 误屏蔽** — .gitignore 中移除 config.js（内容为模板，与 config.template.js 相同）
- **.env.example 误屏蔽** — .gitignore 中移除 .env.example（模板文件应入库）

### Quality
- **测试**：531 passed / 0 failed / 18 skipped（48 文件）
- **覆盖率**：83.2%（Statements）
- **JSDoc**：50.7%（103/203 导出项）
- **性能**：向量搜索 7.21ms / 节点插入 24,759 ops/s / 核心召回 0.44ms avg
- **安全**：0 critical / 0 high / 5 moderate（esbuild→vite→vitest 链）
- **SQL 安全**：100% 参数化，0 注入漏洞

---

## [0.2.0] — 2026-04-29

> **版本主题**：从「功能完整」走向「生产可靠」

### Added
- **数据库迁移系统（F-1）** — `src/store/migrate.ts`，`migrate()` 函数 + `bm_meta` 元数据表 + `getSchemaVersion()`，支持从旧版本平滑升级，幂等操作
- **健康检查 API（F-2）** — `healthCheck()` 方法，返回结构化 `HealthStatus` 对象（overall status / component status / stats / uptime / schema version），6 个新类型定义 + 7 个测试
- **优雅降级机制（F-3）** — 移除 mock LLM，引入 `llmEnabled` 标志，LLM/Embedding 不可用时跳过依赖步骤而非崩溃或产生无效数据，Fusion 降级为启发式规则，12 个降级测试
- **结构化日志（F-4）** — `src/utils/logger.ts`，支持 `BM_LOG_LEVEL=error|warn|info|debug` 四级日志控制，统一输出格式 `[brain-memory][时间][级别][模块]`，替换 10 个文件 50+ 处 `console.*`
- **统计指标查询增强（F-5）** — `getStats()` 返回全维度统计（节点按类型/时态/来源分类、社区、向量、缓存命中率、查询耗时等 16+ 字段），向后兼容旧 API
- **CLI 诊断工具（F-6）** — `npm run doctor` / `npx brain-memory-doctor`，一键检查环境/依赖/配置/数据库状态，输出诊断报告（✓/⚠/✗）
- **SQL 参数化审计（F-7）** — 逐项审计 89 处 `.prepare()` + 8 处 `.exec()`，确认 100% 参数化，无 SQL 注入漏洞
- **Embedding 缓存命中率统计** — `getEmbedCacheStats()` 返回 hits/misses/hitRate

### Changed
- **`ContextEngine` 构造函数** — LLM/Embedding 未配置时不再抛异常，改为 `console.warn` + 继续初始化
- **`Extractor` 构造函数** — 接受 `null` LLM 参数，LLM 不可用时返回空结果而非崩溃
- **`runFusion` 函数** — 接受 `null` LLM 参数，无 LLM 时降级为启发式合并/链接
- **日志输出** — 全部替换为结构化 logger，兼容 `BM_LOG_LLM` 环境变量，`BM_DEBUG` 功能合并到 `BM_LOG_LEVEL=debug`

### Deprecated
- **`BM_DEBUG` 环境变量** — 功能已合并到 `BM_LOG_LEVEL=debug`，将在未来版本移除

### Security
- **SQL 参数化 100% 审计通过** — 所有 CRUD 查询路径使用 `?` 占位符，动态 SQL（scope 子句、IN 列表、FTS5 MATCH）均安全

---

## [0.1.9] — 2026-04-25

### Added
- **JSON 容错解析器（#2）** — `src/utils/json.ts` 新增 `tryFixJson()` + `extractJsonTolerant()`，自动修复尾随逗号、无引号键、单引号、缺失括号，最多 4 层防护（重试 → 修复 → 容错提取 → 空结果降级）
- **智能截断工具** — `src/utils/truncate.ts` 段落/句子/代码块/单词边界智能截断，替代硬截断（Phase 2）
- **语言感知 Token 估算** — `src/utils/tokens.ts` 中文 1.8ch/token、英文 2.5ch/token，替代固定 /3（Phase 2）
- **衰减预设配置** — `src/decay/presets.ts` 4 套预设（快速衰减、标准、持久、自定义）（Phase 3）
- **批量 Embedding API** — `createBatchEmbedFn()` 支持 text[] → number[][]，单节点逐条调用 → 批量一次调用（Phase 2）
- **社区摘要批量查询（#10）** — `getAllCommunitySummaries()` 单次查询替代 N+1 单查（Phase 4）

### Fixed
- **🔴 `performReasoning` 传入空 edges（#1）** — 推理引擎 75% 功能失效，改为查询真实边数据（Phase 1）
- **🔴 LLM JSON 解析失败无重试（#2）** — 解析失败静默返回空结果导致知识永久丢失，新增 2 次重试 + 容错解析器 + 降级提取（Phase 4）
- **🔴 无请求日志（#3）** — LLM 调用无日志难以排查，新增 `BM_LOG_LLM` 环境变量全链路日志（Phase 1）
- **🔴 网络波动无重试（#4）** — LLM 请求失败直接崩溃，新增指数退避重试（最多 3 次）（Phase 1）
- **🔴 XML 未转义特殊字符（#5）** — 上下文注入时 `<>&'"` 未转义，新增 `escapeXml()` 全面转义（Phase 1）
- **🟠 graphWalk 重复计算（#6）** — 精确+泛化召回都调用 graphWalk，改为统一种子单次调用（Phase 2）
- **🟠 边插入 SELECT 回查（#7）** — INSERT 后再 SELECT 回查，改为直接构造返回（Phase 2）
- **🟠 同步钩子 + 延迟初始化冲突（#8）** — `pluginInstance` 赋值早于 `init()` 完成，存在竞态窗口，改为先 `await init()` 再赋值，消除竞态（Phase 4）
- **🟠 缓存无过期策略（#9）** — Embedding LRU 缓存无 TTL，新增 24 小时 TTL + 懒淘汰；会话缓存无上限，新增 200 条限制（Phase 4）
- **🟠 向量嵌入无缓存（#11）** — 每次调用 Embedding API，新增 LRU 缓存（500 条）（Phase 2）
- **🟠 向量嵌入无批量支持（#12）** — 逐条调用 API，新增批量函数 + 分块嵌入 + 均值聚合（Phase 2）
- **🟡 mergeResults 没有重新排序（#13）** — 精确+泛化结果合并后未排序，改为按 PPR 统一排序（Phase 2）
- **🟡 syncEmbed 截断 500 字符（#14）** — 硬截断丢失语义，改为分块截断（400ch）+ 自然边界（Phase 2）
- **🟡 消息切片 800 字符（#15）** — 提取截断过短，改为 1200 字符 + 句子边界（Phase 3）
- **🟡 会话压缩 8000 字符（#16）** — 头部固定 8000 字符，改为头 30% + 尾 70%（12000 字符）（Phase 3）
- **🟡 attention 截断 200 字符（#17）** — 硬截断丢失用户意图，改为 500 字符 + 句子边界 + 保留 code 后文字（Phase 3）
- **🟡 includeScopes OR 过于宽松（#18）** — scope 隔离使用 OR 导致跨域泄漏，改为 AND（Phase 3）
- **🟡 Anthropic apiKey 只读环境变量（#19）** — `process.env.ANTHROPIC_API_KEY` 只读，改为参数传递（Phase 3）
- **🟡 Decisions 包含所有节点（#20）** — 工作记忆 decisions 含 EVENT/preference 噪声，改为仅 TASK + SKILL（Phase 3）
- **🟢 Token 估算粗糙（#21）** — 固定 /3 高估中文 50-100%，改为语言感知（中文 1.8/英文 2.5）（Phase 3）
- **🟢 偏好正则覆盖有限（#22）** — 正则偏好提取死代码，清理约 60 行未使用代码（Phase 4）
- **🟢 相似度阈值硬编码（#25）** — fusion 阈值全硬编码，改为 4 个可配置参数（Phase 3）
- **🟢 衰减参数未校准（#26）** — 固定默认值，写入 4 套预设配置（Phase 4）
- **🟢 情景记忆仅 top 3（#30）** — 硬截断 200 字符，改为 400 字符 + 句子边界（Phase 3）

### Changed
- **`extract()` 提取流程重构** — 从 try/catch 改为重试循环（最多 3 次），解析失败时提示 LLM 修正格式（Phase 4）
- **`openclaw-wrapper.ts` 初始化重构** — 消除竞态窗口（先 init 后赋值），所有异步钩子统一 `initPromise` 守卫，`before_message_write` 新增 `initComplete` 守卫（Phase 4）
- **截断策略全面升级** — extract 800→1200ch，attention 200→500ch，episodic 200→400ch，compressor 8000→12000ch，syncEmbed 500→1200ch + 分块（Phase 2-3）
- **Embedding 系统升级** — 新增 LRU 缓存 + 批量 API + 分块截断 + 均值聚合，吞吐量大幅提升（Phase 2）
- **召回链路重构** — 统一种子集 → 单次 graphWalk → 单次 PPR → 统一排序（Phase 2）

### Removed
- **死代码清理（#22）** — `preferences/slots.ts` 中约 60 行未引用的正则偏好提取逻辑（Phase 4）
- **`npm start` 命令** — OpenClaw 插件无需独立运行，保留 `npm run dev`（0.1.8）

---

## [0.1.8] — 2026-04-24

### Changed
- **美化 `scripts/configure.js` 交互式配置向导** — 新增分步进度提示（Step 1/3）、4 种 LLM 预设（DashScope/OpenAI/Ollama/自定义）、彩色终端输出、配置预览卡片（API Key 脱敏）、写入前确认流程

### Removed
- **移除 `npm start` 命令** — OpenClaw 插件无需独立运行，保留 `npm run dev` 用于开发调试

### Fixed
- **`scripts/setup-openclaw.js`** — embedding 配置中 `baseUrl` → `baseURL`

---

## [0.1.7] — 2026-04-22

### Fixed
- **🔴 Critical: `init(config)` uses raw `config` instead of merged defaults** — `init()` 直接使用 OpenClaw 传入的 `config` 参数，而不与 `storedConfig` 或 `FULL_DEFAULT_CONFIG` 合并。如果 OpenClaw 的 configSchema 不完整，传入的 config 缺少 `decay`、`reflection`、`workingMemory` 等嵌套字段，导致初始化崩溃。修复：`init()` 现在将传入的 config 与 `FULL_DEFAULT_CONFIG` 合并，并优先使用 `register()` 阶段已合并的 `storedConfig` (`openclaw-wrapper.ts`)
- **🔴 Critical: `DEFAULT_CONFIG` mismatch causing first-load crash** — `openclaw-wrapper.ts` 使用了只有 7 个扁平字段的本地 `DEFAULT_CONFIG`，而 `ContextEngine` 需要完整的嵌套结构。修复：改为从 `src/types.ts` import 完整 `DEFAULT_CONFIG` (`openclaw-wrapper.ts`)
- **🔴 Critical: `baseUrl` vs `baseURL` field name inconsistency** — 配置文件使用 `baseUrl`（小写），但 `src/engine/llm.ts` 和 `src/engine/embed.ts` 读取 `baseURL`（大写），导致 LLM 请求永远 fallback 到 `api.openai.com`。修复：所有配置文件统一使用 `baseURL` (`config.js`, `config.template.js`, `llm_client.template.js`, `scripts/configure.js`)
- **🟡 `openclaw.plugin.json` configSchema incomplete** — 缺少 `workingMemory`、`fusion`、`reasoning`、`noiseFilter`、`recallMaxNodes` 等字段的默认值。修复：补全 configSchema (`openclaw.plugin.json`)
- **🟡 `maxRecallNodes` vs `recallMaxNodes` field name mismatch** — 修复字段名不一致 (`openclaw-wrapper.ts`)
- **🟡 Lazy-init race condition** — 4 个 hook 各自独立创建 `pluginInstance`，存在并发创建多个 `ContextEngine` 实例的风险。修复：新增 `initPromise` 守卫和 `ensurePluginInitialized()` (`openclaw-wrapper.ts`)
- **🟡 `BrainMemoryPluginConfig` extends `BmConfig` but received partial config** — 随 `DEFAULT_CONFIG` 统一一并修复 (`openclaw-wrapper.ts`)

### Changed
- **`openclaw-wrapper.ts` 初始化重构** — 移除冗余的 7 字段 `DEFAULT_CONFIG`，改用 `src/types.ts` 的完整版本；`init()` 增加 config 合并逻辑；4 个 hook 的懒初始化统一收口到 `ensurePluginInitialized()` 函数
- **`openclaw.plugin.json` configSchema 补全** — 新增 `workingMemory`、`fusion`、`reasoning`、`noiseFilter`、`recallMaxNodes`、`recallMaxDepth`、`recallStrategy`、`dedupThreshold`、`pagerankDamping`、`pagerankIterations`、`compactTurnCount`、`rerank` 等字段的默认值定义

### Removed
- **`src/plugin/handler.ts`** — 190 行死代码，没有任何模块引用，删除
- **`src/graph/community.ts.bak`** — 149 行备份文件，删除
- **`src/engine/context.ts.backup`** — 513 行备份文件，删除

### Security
- **Hardcoded API key removed from `config.js`** — `apiKey` 从真实值替换为占位符 `YOUR_API_KEY_HERE`

---

## [0.1.6] — 2026-04-22

### Fixed
- **🔴 Critical: `DEFAULT_CONFIG` mismatch** — 首次加载崩溃，修复 register 阶段默认配置不完整
- **🔴 Critical: `baseUrl` vs `baseURL`** — 配置文件字段名与读取端不一致
- **🟡 `maxRecallNodes` vs `recallMaxNodes`** — 字段名不一致
- **🟡 Lazy-init race condition** — 多 hook 并发初始化竞态
- **🟡 Partial config type mismatch** — 类型继承与实际传入不一致

### Changed
- **`openclaw-wrapper.ts` 初始化重构** — 使用完整 `DEFAULT_CONFIG`，新增 `initPromise` 守卫

### Removed
- **死代码和备份文件** — `handler.ts` (190行)、`community.ts.bak` (149行)、`context.ts.backup` (513行)

### Security
- **Hardcoded API key removed** — `config.js` 中的真实 API Key 替换为占位符

---

## [0.1.3] — 2026-04-21

### Added
- **OpenClaw plugin compatibility** — full plugin entry design with register/activate lifecycle
- **Plugin hooks** — `message_received`, `before_message_write`, `session_start`, `session_end`
- **Plugin exports** — all OpenClaw plugin functions exported from `index.ts`
- **Build config** — `tsconfig.plugin.json`

### Changed
- Plugin entry redesigned for OpenClaw compatibility
- Plugin hooks updated to match OpenClaw `api.on()` event system

### Fixed
- Critical OpenClaw plugin integration issues
- Cross-session memory recall broken for new sessions
- Memory caching mechanism

---

## [0.1.2] — 2026-04-21

### Changed
- Package renamed to `memory-likehuman-pro` v0.1.0

---

## [0.1.1] — 2026-04-21

### Added
- Interactive configuration script
- OpenClaw integration script
- Comprehensive documentation
- Performance benchmarking suite

### Changed
- Configuration system with better defaults
- Memory decay and forgetting mechanisms refined

### Fixed
- TypeScript compilation errors
- Critical syntax errors in ContextEngine class
- Vector search performance issues

---

## [0.1.0] — 2026-04-20

### Added
- Initial release of brain-memory unified knowledge system
- 8-Category Memory System
- Dual-Path Recall
- Memory Decay
- Scope Isolation
- Knowledge Fusion
- Reflection System
- Working Memory
- Community Detection
- Personalized PageRank

---

[Unreleased]: https://github.com/DylingCreation/brain-memory/compare/v0.1.9...HEAD
[0.1.9]: https://github.com/DylingCreation/brain-memory/compare/v0.1.8...v0.1.9
[0.1.8]: https://github.com/DylingCreation/brain-memory/compare/v0.1.7...v0.1.8
[0.1.7]: https://github.com/DylingCreation/brain-memory/compare/v0.1.6...v0.1.7
[0.1.6]: https://github.com/DylingCreation/brain-memory/compare/v0.1.5...v0.1.6
[0.1.3]: https://github.com/DylingCreation/brain-memory/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/DylingCreation/brain-memory/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/DylingCreation/brain-memory/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/DylingCreation/brain-memory/releases/tag/v0.1.0
