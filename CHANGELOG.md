# Changelog

All notable changes to the brain-memory project.

> **Package name:** `memory-likehuman-pro` (npm)  
> **Repository:** https://github.com/DylingCreation/brain-memory

---

## [Unreleased]

### Fixed
- **🔴 Critical: `DEFAULT_CONFIG` mismatch causing first-load crash** — `openclaw-wrapper.ts` 使用了只有 7 个扁平字段的本地 `DEFAULT_CONFIG`，而 `ContextEngine` 需要完整的嵌套结构（`decay`、`reflection`、`workingMemory`、`fusion`、`reasoning`）。修复：改为从 `src/types.ts` import 完整 `DEFAULT_CONFIG`，确保所有嵌套字段在初始化时可用 (`openclaw-wrapper.ts`)
- **🔴 Critical: `baseUrl` vs `baseURL` field name inconsistency** — `config.js` 和 `config.template.js` 使用 `baseUrl`（小写 url），但 `src/engine/llm.ts` 和 `src/engine/embed.ts` 读取 `baseURL`（大写 URL），导致 LLM 请求永远 fallback 到 `api.openai.com`。修复：所有配置文件统一使用 `baseURL` (`config.js`, `config.template.js`, `llm_client.template.js`)
- **🟡 `maxRecallNodes` vs `recallMaxNodes` field name mismatch** — `openclaw-wrapper.ts` 的本地 `DEFAULT_CONFIG` 使用 `maxRecallNodes`，但 `BmConfig` 类型和 `Recaller` 使用 `recallMaxNodes`。修复：随 `DEFAULT_CONFIG` 统一一并修复 (`openclaw-wrapper.ts`)
- **🟡 Lazy-init race condition across multiple hooks** — `message_received`、`message_sent`、`session_start`、`get_status` 四个 hook 各自独立创建 `pluginInstance`，存在并发创建多个 `ContextEngine` 实例的竞态风险。修复：新增 `initPromise` 守卫和 `ensurePluginInitialized()` 函数，确保全局只初始化一次 (`openclaw-wrapper.ts`)
- **🟡 `BrainMemoryPluginConfig` extends `BmConfig` but received partial config** — 类型继承承诺包含完整 `BmConfig` 字段，但实际传入的是缩水版对象。修复：随 `DEFAULT_CONFIG` 统一一并修复 (`openclaw-wrapper.ts`)

### Changed
- **`openclaw-wrapper.ts` 初始化重构** — 移除冗余的 7 字段 `DEFAULT_CONFIG`，改用 `src/types.ts` 的完整版本；4 个 hook 的懒初始化统一收口到 `ensurePluginInitialized()` 函数

### Removed
- **`src/plugin/handler.ts`** — 190 行死代码，没有任何模块引用，删除 (`src/plugin/handler.ts`)
- **`src/graph/community.ts.bak`** — 149 行备份文件，不应存在于源码目录 (`src/graph/community.ts.bak`)
- **`src/engine/context.ts.backup`** — 513 行备份文件，不应存在于源码目录 (`src/engine/context.ts.backup`)

### Security
- **Hardcoded API key removed from `config.js`** — `apiKey` 从真实值 `sk-sp-876d...` 替换为占位符 `YOUR_API_KEY_HERE`，防止密钥泄露 (`config.js`)

### Added
- **Bidirectional knowledge extraction** — new `message_sent` hook extracts knowledge from AI replies alongside user messages (`openclaw-wrapper.ts`)
- **AI reply smart filtering** — skips AI replies under 50 characters to focus on valuable content
- **Role-differentiated processing** — user messages extract intent/preferences, AI replies extract suggestions/code/tools (`src/extractor/extract.ts`)
- **Cross-session memory sharing** — agent-level cache allows new sessions to reuse historical memory (`openclaw-wrapper.ts`)
- **Session warm-up** — preloads relevant memories on session start

---

## [0.1.3] — 2026-04-21

### Added
- **OpenClaw plugin compatibility** — full plugin entry design with register/activate lifecycle (`openclaw-register.ts`, `openclaw-wrapper.ts`, `openclaw-plugin.ts`)
- **Plugin hooks** — `message_received`, `before_message_write`, `session_start`, `session_end` registered via `api.on()` (`openclaw-wrapper.ts`)
- **Plugin exports** — all OpenClaw plugin functions exported from `index.ts`
- **Build config** — `tsconfig.plugin.json` added for plugin-specific compilation

### Changed
- Plugin entry redesigned for OpenClaw compatibility — synchronous `register()` function required
- Plugin hooks updated to match OpenClaw `api.on()` event system requirements

### Fixed
- Critical OpenClaw plugin integration issues — config access in hook functions, vector embeddings, FTS5 search
- Config defaults and sync hook issues
- Cross-session memory recall broken for new sessions — fixed scope filter to use agent/workspace instead of session ID
- Memory caching mechanism for session-based retrieval

---

## [0.1.2] — 2026-04-21

### Changed
- Package renamed to `memory-likehuman-pro` v0.1.0 (`package.json`)
- README updated with correct package name and configuration instructions

---

## [0.1.1] — 2026-04-21

### Added
- Interactive configuration script (`scripts/configure.js`) — generates `config.js`, `.env`, `llm_client.js`
- OpenClaw integration script (`scripts/setup-openclaw.js`) — writes brain-memory config into `~/.openclaw/openclaw.json`
- Configuration npm scripts: `npm run configure`, `npm run setup-openclaw`
- Comprehensive documentation: `docs/architecture.md`, `docs/deployment.md`, `docs/security.md`, `docs/user-guide.md`, `docs/api-reference.md`
- Performance benchmarking suite for vector search optimization
- Test coverage for core modules

### Changed
- Configuration system with better defaults
- Memory decay and forgetting mechanisms refined
- Knowledge extraction and recall algorithms improved
- Database query efficiency enhanced with proper parameterization
- TypeScript type safety improved across all modules

### Fixed
- TypeScript compilation errors throughout the codebase
- Critical syntax errors in ContextEngine class
- Vector search performance issues with large datasets
- Database connection handling and resource management
- Import statement issues causing build failures
- Test configuration and dependency issues
- Error handling in LLM and embedding integrations
- PageRank implementation to properly handle config parameters
- Duplicate function declarations in multiple modules
- Undefined variable issues in several modules

### Security
- SQL injection prevention with parameterized queries
- Input validation and sanitization
- Scope-based data isolation
- Credential handling and storage improvements
- Hardcoded API key removed from LLM integration tests

---

## [0.1.0] — 2026-04-20

### Added
- Initial release of brain-memory unified knowledge system
- **8-Category Memory System**: Profile, Preferences, Entities, Events, Tasks, Skills, Cases, Patterns
- **Dual-Path Recall**: Combines graph traversal and vector similarity
- **Memory Decay**: Weibull model for intelligent forgetting
- **Scope Isolation**: Session/agent/workspace level data separation
- **Knowledge Fusion**: Automatic duplicate detection and merging
- **Reflection System**: Insight derivation from conversation history
- **Working Memory**: Short-term context management
- **Community Detection**: Label Propagation Algorithm for clustering
- **Personalized PageRank**: Context-aware node ranking
- Graph-based memory with 3 node types (TASK/SKILL/EVENT) and 5 edge types
- Vector-based semantic search capabilities
- Knowledge extraction from conversations with noise filtering

---

[Unreleased]: https://github.com/DylingCreation/brain-memory/compare/v0.1.3...HEAD
[0.1.3]: https://github.com/DylingCreation/brain-memory/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/DylingCreation/brain-memory/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/DylingCreation/brain-memory/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/DylingCreation/brain-memory/releases/tag/v0.1.0
