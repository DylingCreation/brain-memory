# Changelog

All notable changes to the brain-memory project.

> **Package name:** `memory-likehuman-pro` (npm)  
> **Repository:** https://github.com/DylingCreation/brain-memory

---

## [Unreleased]

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
