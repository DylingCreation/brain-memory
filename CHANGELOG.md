# Changelog

All notable changes to the brain-memory project.

> **Package name:** `memory-likehuman-pro` (npm)  
> **Repository:** https://github.com/DylingCreation/brain-memory

---

## [Unreleased]

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

[Unreleased]: https://github.com/DylingCreation/brain-memory/compare/v0.1.7...HEAD
[0.1.7]: https://github.com/DylingCreation/brain-memory/compare/v0.1.6...v0.1.7
[0.1.6]: https://github.com/DylingCreation/brain-memory/compare/v0.1.5...v0.1.6
[0.1.3]: https://github.com/DylingCreation/brain-memory/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/DylingCreation/brain-memory/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/DylingCreation/brain-memory/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/DylingCreation/brain-memory/releases/tag/v0.1.0
