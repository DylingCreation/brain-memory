# brain-memory 工程协作手册（项目专属版）

> **本手册基于《工程协作手册 v1.0》适配，通用规则以原手册为准，本文档仅补充 brain-memory 项目特有内容。**
>
> **项目**：brain-memory
> **技术栈**：TypeScript · Vitest · SQLite (@photostructure/sqlite) · OpenClaw 插件体系
> **当前位置**：v2.1.0 基线评估完成 · 测试 847 用例 · lint 0 errors · 骨架地图 7 份文档完成
> **文档性质**：内部开发文件，存放于 `.devdocs/`，不进入 git 仓库
> **最后更新**：2026-06-01 (v2.1.0 基线评估 + 骨架地图完成)

---

## 0. 引用声明

本文档是《工程协作手册 v1.0》在 brain-memory 项目上的落地适配。所有通用规则（迭代流程、人机协作、风险管控、调研验证、留痕规范等）均以通用手册为准，本文档仅补充以下内容：

- 项目上下文与技术栈
- 通用红线的具体落地命令和阈值
- 量化指标基线数据
- 专属风险清单
- 项目特有的技术规则
- 预填了项目信息的留痕模板

**新成员建议阅读顺序**：先通读《工程协作手册 v1.0》第0章~第三章了解工作模式 → 回到本文档查阅具体命令、模板、基线。

---

## 1. 项目上下文

### 1.1 项目定位

brain-memory 是一个 TypeScript 记忆引擎项目，为 OpenClaw 提供长期记忆、知识图谱、语义召回等能力。

### 1.2 核心能力

| 能力 | 说明 |
|------|------|
| 8 类记忆 | profile / preferences / entities / events / tasks / skills / cases / patterns |
| 知识图谱 | 节点-边结构的语义网络，支持 PageRank + LPA 社区检测 |
| 向量召回 | 嵌入向量 + 余弦相似度检索 |
| 混合召回 | 图 + 向量双路径 + RRF 融合 |
| 反思引擎 | Turn/Session 双级反思生成摘要和洞察 |
| 知识融合 | 两阶段去重（名称重叠 + 向量相似度）+ LLM 决策 |
| 推理引擎 | 4 类型推理（路径/隐含/模式/矛盾） |
| 衰减系统 | Weibull 模型，3 层 (core/working/peripheral) 差异衰减 |
| 范围隔离 | 多 Scope 参数化查询（当前 v1: session/agent/workspace，v2 planned） |
| 工作记忆 | 零 LLM 开销，追踪当前任务/决策/约束/关注点 |

### 1.3 技术栈

| 组件 | 选型 | 备注 |
|------|------|------|
| 语言 | TypeScript 5.9 | `strict: false` → v1.8.0 开启 `strictNullChecks` |
| 运行时 | Node.js ≥ 18 | ESM |
| 测试 | Vitest 3.2 + @vitest/coverage-v8 | `pool: forks` (SQLite 不支持 threads) |
| 数据库 | SQLite — `@photostructure/sqlite` 1.2.1 | 非 better-sqlite3（已更正） |
| LLM 端点 | 多端路由: DashScope / Ollama (原生+OpenAI兼容) / OpenAI / Anthropic | v1.8.0 F-1 |
| 文档生成 | typedoc | |
| 构建 | tsc | |
| 包管理 | npm | |
| 宿主框架 | OpenClaw 插件体系 | 5 个生命周期 hook |
| **npm 包名** | `memory-likehuman-pro` | |

### 1.4 版本脉络

| 版本 | 状态 | 关键内容 |
|------|------|---------|
| v0.1.x | 已发布 | 核心记忆引擎、基础 API |
| v0.1.9 | 已发布 | 8 类记忆、知识图谱、向量召回、反思引擎等核心能力 |
| v0.2.0 | 已发布 | 大规模架构改造、日志系统替换、测试目录统一 |
| v0.3.0 | 合并入 v1.0.0 | 补覆盖率、补 JSDoc、性能优化、范围隔离增强 |
| v1.0.0 | 已发布 | 批次 1~7 完成：启发式提取架构、Ollama 适配、Qwen 优化、OpenClaw 插件增强、补测 (531 用例, 83.2%) |
| v1.1.0 | 已发布 | 存储抽象 IStorageAdapter、增量图维护、智能触发 |
| v1.2.0 | 已发布 | 开发者 Hook、JSDoc 86.4%、覆盖率补全 +31 用例 |
| v1.3.0 | 已发布 | LanceDB POC、.gitignore 精简、npm 包优化、性能基准验证 |
| v1.4.0 | 已发布 | CI GitHub Actions、跨平台路径修复、LPA 阈值放宽 |
| v1.5.0 | 已发布 | Lite 模式、README 全面更新、开源治理 |
| v1.6.0 | 已发布 | 工程夯实: 依赖升级、覆盖率补盲、查询缓存、Small 模式、JSON 解析增强、四级性能基准 (748 用例) |
| v1.6.2 | 当前发布 | 质量维护：测试稳定性修复 + Lint 收敛 + 依赖补丁升级 |
| **v2.0.0** | **已发布** | **Scope 六层升级 + 认知金字塔审计闭环 + Web Control UI + Export/Import + 847/847 测试通过** |
| **v2.1.0** | **当前** | **领域服务拆分完成 (7 Service) + 骨架地图完成 (7份) + v2.1.0基线评估 L1通过** |

### 1.5 关键架构边界

- **插件接口**：遵循 OpenClaw 插件 API 规范，使用 `api.on()` 标准 API
- **数据层**：通过 `IStorageAdapter` 接口访问，当前实现为 SQLite（`SQLiteStorageAdapter`），LanceDB adapter 为 POC
- **LLM 依赖**：所有 LLM 调用通过 `createCompleteFn()` 统一入口，支持多端点路由，必须支持优雅降级
- **npm 包发布**：产物为 `dist/` 目录，`files` 含 `openclaw.plugin.json`

---

## 2. 专属质量红线

通用手册第四章定义的红线在 brain-memory 中的具体落地方式：

| 通用红线 | brain-memory 落地命令/检查 | 阈值 |
|----------|---------------------------|------|
| 测试通过 | `npm test` | 0 failed（已知 1 个 perf flake 除外） |
| 构建可用 | `npm run build` | 零报错，`dist/` 产出完整 |
| 类型安全 | `npm run build` + `tsc --strictNullChecks --noEmit` | 零报错（v1.8.0 起） |
| 向后兼容 | API 签名对比 + 集成测试 | 非大版本不破坏现有接口 |
| 安全无漏洞 | `npm audit` + 代码审查 | 0 critical, 0 high |
| 资源零残留 | 测试后 `find . -name '*.db-wal' -o -name '*.db-shm'` | 无输出 |
| 覆盖率 | `vitest run --coverage` | 新增模块 ≥ 80%；整体暂记录基线 |
| 性能不回归 | `vitest run test/performance` | 不劣于基线数据（见 §3） |
| 文档可用 | `npm run docs` + 人工审查 | JSDoc 覆盖率 ≥ 80% ✅ 已达标 |

> [^1]: 覆盖率红线自 v0.3.0 起生效。当前仅记录基线不设硬性门禁。

### 发布检查清单（brain-memory 专用）

```markdown
## 发布检查清单（vX.Y.Z）

### 质量检查
- [ ] `npm test` 全部通过（0 failed，已知 perf flake 除外）
- [ ] `npm run build` 零报错
- [ ] `tsc --strictNullChecks --noEmit` 零报错（v1.8.0 起）
- [ ] `npm run lint` 通过
- [ ] `npm audit` 无 critical/high 漏洞

### 残留检查
- [ ] 测试后无 `.db-wal` / `.db-shm` 文件残留

### 兼容性检查
- [ ] API 无破坏性变更（或已标注 breaking changes）
- [ ] 配置无破坏性变更
- [ ] 如有破坏性变更，CHANGELOG 已标注 + 迁移指南已编写

### 文档检查
- [ ] CHANGELOG.md 已更新
- [ ] README.md 已更新（如有新功能/变更）
- [ ] API 文档已更新（`npm run docs`）
- [ ] 版本号已更新（package.json）
- [ ] `.devdocs/项目总文档/` 骨架地图 7 份文档已同步更新（含模块总览、数据流、API契约、演进记录、边界运行、知识地图、基线评估）

### 发布
- [ ] git tag vX.Y.Z
- [ ] npm publish
- [ ] `npm view memory-likehuman-pro version` 版本号匹配
- [ ] GitHub Release 已创建

### 回归检查
- [ ] vitest pool 配置无回归（`forks`，见 §5.13）
- [ ] 新模式/feature 已过边界验证矩阵（§5.12）
- [ ] 已知约束无回归（§5.13）
```

---

## 3. 量化指标基线

> 测量命令见 §2。每次版本摸底后更新当前值。

| 指标 | v1.6.2 基线 | v2.1.0 当前 | 目标 | 测量方式 |
|------|------------|------------|------|----------|
| 测试通过率 | 833 pass / 8 fail / 35 skip | **847 pass / 0 fail / 33 skip (76 files)** | 100% (0 fail) | `npm test` |
| 测试用例数 | 876 (75 文件) | **880 (76 文件: 22u+48i+6p)** | 持续增长 | `npm test -- --reporter=verbose` |
| 整体测试覆盖率 | 62.9% (vitest v8) | 37.6%（被归档文件稀释）<br>实际 src/ ~70% | ≥ 80% | `vitest run --coverage` |
| 核心模块覆盖率 | reasoning 97% / recaller 93% / community 96% | 同左 | 各 ≥ 80% ✅ | 同上 |
| 低覆盖模块 | fusion 64.7% / maintenance 74.6% / ui 0% | 同左 + format/assemble 未独立测 | 各 ≥ 80% | 同上 |
| JSDoc 覆盖率 | 84.5% | 同左 | ≥ 80% ✅ | 脚本统计 |
| lint error | 0 | **0** | 0 | `npm run lint` |
| deprecated 依赖 | 0 | 0 | 0 | `npm outdated` |
| 增量 PageRank 加速比 | ≥5x (1k 节点) | **≥5x (10k 节点验证通过)** | 不劣于基线 | perf tests |
| 增量 LPA 加速比 | ≥3x (1k 节点) | **≥3x (10k 节点验证通过)** | 不劣于基线 | perf tests |

> 指标退化需在版本复盘中说明原因。指标设计原则见通用手册第八章。

---

## 4. 专属风险清单

> 风险分级定义见通用手册 §6.1。每个风险必须标注状态和处理版本。

| 编号 | 风险 | 等级 | 状态 | 处理版本 | 缓解措施 |
|------|------|------|------|---------|---------|
| TR-01 | LLM API 调用失败导致提取/反思/融合降级 | 高 | ✅ 已修复 | v1.0.0 | 三级提取架构 + 优雅降级矩阵 (§5.1) |
| TR-02 | SQLite 数据量增长后的性能瓶颈 | 中 | ⚠️ 监控中 | 后续版本 | 定期性能基准测试，必要时分页/索引优化 |
| **TR-16** | **.gitignore 排除关键文档** | **低** | **✅ 已修复 (v2.1.0)** | **v2.1.0** | **移除 METHODOLOGY.md/.devdocs/_backup 条目** |
| **TR-17** | **性能基准 flaky 无法获取** | **中** | **⚠️ 监控中** | **后续版本** | **重新设计性能基准测试** |
| **TR-18** | **npm 发布版本落后 (线上 1.5.0 vs 本地 2.x)** | **中** | **⚠️ 待发布** | **v2.1.0** | **发布前运行 check:versions + npm view** |
| TR-03 | npm 包依赖版本冲突 | 高 | ✅ 已修复 | v1.0.0 | 环境变量统一 + npm audit 门控 |
| TR-04 | OpenClaw 插件接口变更导致不兼容 | 中 | ✅ 已修复 | v1.0.0 | `api.on()` 标准 API + hook 名匹配 |
| TR-05 | 向量嵌入维度变更导致索引失效 | 中 | ✅ 已修复 | v0.2.x | 配置变更时自动重建索引 |
| TR-06 | 多范围隔离的参数化查询有遗漏 | 高 | ✅ 已修复 | v0.2.1 | 代码审查专项检查 + 单元测试覆盖 |
| TR-07 | 整体测试覆盖率低 | 高 | ✅ 已修复 | v1.0.0 | 补测后核心模块 > 90% |
| TR-08 | JSDoc 覆盖率低 | 中 | ✅ 已修复 | v1.2.0 | 提升至 84.5%，已达 80% 目标 |
| TR-09 | 测试目录结构混乱 | 低 | ✅ 已修复 | v0.2.x | 统一为 `test/` 单根目录 |
| TR-10 | 启发式提取质量验证不足 | 中 | ✅ 已修复 | v1.2.0 | F-10 对比测试完成 |
| TR-11 | Reranker 降级路径测试不足 | 中 | ✅ 已修复 | v1.2.0 | F-11 7 个降级场景覆盖 |
| TR-12 | ESLint 配置损坏 | 中 | ✅ 已修复 | v1.6.2 | parser/plugin 修复 + auto-fix |
| TR-13 | LLM 测试依赖过期 API Key | 中 | ✅ 已修复 | v1.6.2 | BM_LLM_TEST=0 门控生效 |
| **TR-14** | **Ollama 端点兼容性: thinking 参数格式错误** | **高** | **✅ 已修复** | **v1.8.0** | **detectEndpointType() 多端路由 (§5.17)** |
| **TR-15** | **tsconfig.strict = false，类型安全无保障** | **高** | **⚠️ 修复中** | **v1.8.0** | **F-4: 开启 strictNullChecks** |
| **ER-01** | **Ollama 原生端点适配引入新 bug** | **中** | **✅ 已缓解** | **v1.8.0** | **log/ 诊断脚本回归 + 保留 OpenAI/DashScope 原路径** |
| **ER-02** | **mock-openclaw 测试 config 不完整产生 error 日志噪音** | **低** | **⚠️ 待修复** | **v2.1.x** | **补全 mock config nested 字段** |
| **ER-03** | **覆盖率报告被归档备份目录稀释** | **低** | **⚠️ 待修复** | **v2.1.x** | **更新 vitest coverage.exclude** |
| **ER-04** | **UI 子系统无自动化测试** | **中** | **⚠️ 待覆盖** | **后续版本** | **引入 UI 集成测试框架** |

*新增 TR-14/TR-15/ER-01 为 v1.8.0 摸底发现。*

---

## 5. 适配补充规则

### 5.1 降级设计规范

| 子功能 | 正常状态 | 降级状态（LLM API 不可用） |
|--------|---------|--------------------------|
| 提取记忆 | 调用 LLM 提取 + 分类 | 跳过提取，输出 warn 日志 |
| 反思引擎 | 调用 LLM 生成摘要/推断 | 跳过反思，输出 warn 日志 |
| 融合记忆 | 调用 LLM 融合冲突 | 跳过融合，保留双方记录 |
| 召回 | 向量 + 图谱混合召回 | 仅向量召回，保持可用 |
| 向量嵌入 | Embedding API 调用 | 回退到 FTS5 + BM25 全文检索 |
| 工作记忆 | 上下文管理 | 正常（不依赖 LLM） |
| 统计记忆 | 统计分析 | 正常（不依赖 LLM） |

**规则**：
- 降级必须输出明确的 warn 日志（说明跳过了什么），而非静默失败
- 核心非依赖功能（召回、工作记忆、统计）在降级后必须保持可用
- 测试必须覆盖降级场景

### 5.2 SQLite 测试资源清理

```typescript
afterEach(() => {
  try { engine.close(); } catch { /* ignore */ }
  cleanupDbFiles(dbPath);
});

function cleanupDbFiles(dbPath: string): void {
  const files = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
  for (const f of files) {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* ignore */ }
  }
}
```

**硬性规则**：
- **禁止 `:memory:file:`**：会产生真实文件，改用可控的临时路径
- **beforeEach 清理**：防上次测试失败导致残留
- **afterEach 清理**：先 `close()` 再删除文件（包括 `.db-wal` / `.db-shm`）

### 5.3 LLM 依赖测试拆分

```typescript
// 纯逻辑测试 — 始终运行
describe('MemoryEngine - core logic', () => {
  it('should insert and retrieve a node', () => { ... });
});

// LLM 集成测试 — 外部服务可用时才运行
describe.skipIf(!process.env.LLM_ENABLED, 'MemoryEngine - LLM features', () => {
  it('should extract memory via LLM', () => { ... });
});
```

### 5.4 大规模改造策略

后续大规模改造遵循通用手册 §6.3：**先加后删 → 兼容过渡期 → 分批验证**。

### 5.5 多端 LLM 兼容性规范（v1.8.0 新增）

> 本节替代旧版 §5.5 "Qwen thinking 优化规则"。v1.8.0 前该规则仅对 DashScope 生效，
> Ollama 上静默失效导致大量 token 浪费。现已建立完整的多端路由体系。

#### 端点检测函数

```typescript
// src/engine/llm.ts
export function detectEndpointType(baseURL: string): LlmEndpointType {
  if (baseURL.includes('dashscope') || baseURL.includes('aliyuncs.com')) return 'dashscope';
  if (baseURL.includes('11434') || baseURL.includes('ollama')) return 'ollama';
  if (baseURL.includes('anthropic')) return 'anthropic';
  return 'openai';
}
```

#### 各端点的差异

| 维度 | DashScope | Ollama | OpenAI 兼容 | Anthropic |
|------|-----------|--------|------------|-----------|
| 端点路径 | `/chat/completions` | `/api/chat` (原生) | `/chat/completions` | `/v1/messages` |
| thinking 关闭 | `thinking: { type: 'disabled' }` | `think: false` | 不设置 | 不设置 |
| body 格式 | OpenAI 标准 | Ollama 原生 (`stream/options`) | OpenAI 标准 | Anthropic 标准 |
| 响应解析 | `choices[0].message.content` | `message.content` + tolerant parse | `choices[0].message.content` | `content[0].text` |
| API Key 要求 | 必须 | 不需要 | 必须 | 必须 |
| maxTokens 字段 | `max_tokens` | `options.num_predict` | `max_tokens` | `max_tokens` |

#### 新增端点时必须验证

- [ ] `detectEndpointType()` 覆盖新 baseURL 模式
- [ ] body 格式与端点原生文档一致（不假设 OpenAI 兼容）
- [ ] 响应解析使用 tolerant JSON parse（处理 trailing bytes）
- [ ] 在真实端点环境上跑 `log/` 中的诊断脚本验证

### 5.6 环境变量命名规范

- 已废弃 `DASHSCOPE_*` 前缀
- 统一为 `TEST_LLM_*` / `TEST_EMBEDDING_*` 前缀
- `BM_LOG_LEVEL` = `debug` / `info` — 控制日志级别
- `BM_LOG_LLM` = `1` — 开启 LLM 调用详细日志
- `BM_LLM_TEST=0` — 门控跳过 LLM 依赖测试

### 5.7 TypeScript `any` 收敛模式

> v1.0.0 已验证：107 处 `any` 已收敛至 6 处。三层自底向上模式仍适用。

| 层级 | 边界 | 策略 |
|------|------|------|
| 数据层 | SQL 查询结果 | `Record<string, unknown>` + mapper 函数集中断言 |
| API 层 | HTTP 响应 | `Record<string, unknown>` + 链式类型守卫 |
| Plugin 层 | 框架事件对象 | 扩展接口定义 |

### 5.8 Lint 分诊方法

见通用手册无对应条目，保留 brain-memory 专用六模式分类法：
死代码 / POC 桩 / 接口契约参数 / Lint 误报 / 重构残余 / 临时变量。

### 5.9 备份目录约定

⚠️ **已废弃**。v1.8.0: `_bak/` 目录已完全移除（通过 git tag `archive/pre-v1.0.0` 保存历史）。

批量文件操作前应使用 `git stash` 或创建临时分支，而非在源码树内存放备份目录。

### 5.10 自动生成工具的输出验证

`scripts/generate-index.js` 等工具输出必须定期人工抽查。已验证的常见 bug：嵌套表格破 Markdown、日期提取只读文件名、`|` 字符未转义。

### 5.11 5W1H 使用示例

见通用手册 §A-6。brain-memory 补充：好坏的对比示例见原手册。

### 5.12 运行模式边界验证矩阵

当新增 mode/flag 时，用「方法 × LLM 调用」矩阵逐项验证：

| 方法 | Full | Small | Lite |
|------|------|-------|------|
| `processTurn` (extract) | LLM 全量 prompt | LLM 精简 prompt | 仅 heuristic |
| `performFusion` | LLM | ❌ | ❌ |
| `reflectOnSession` | LLM | ❌ | ❌ |
| `performReasoning` | LLM | ❌ | ❌ |
| `runMaintenance` | 全量 | 全量 | 基础 |

### 5.13 已知约束登记

| 约束 | 原因 | 违反后果 |
|------|------|---------|
| vitest pool 必须用 `forks` | `@photostructure/sqlite` 不支持 threads | `SQLITE_BUSY` |
| 禁止 `:memory:file:` | 会产生真实磁盘文件 | DB 残留泄漏 |
| `processTurn` Lite 模式不调用 LLM | Lite = 无 LLM | Lite 用户遭遇超时 |
| Ollama 必须用 `think: false` | DashScope 格式在 Ollama 上静默失效 | 153s→17s 加速失效 (v1.8.0 修复) |
| `llm.maxTokens` 必须可配置 | 写死 4096 在 Ollama 上偏小 | reasoning 吃满/截断 (v1.8.0 修复) |

### 5.14 方向澄清协议

版本规划方向不清晰时：摸底现状 → 列出方向 (3~5 候选) → 排序提问 → 逐项追问 → 出草案。

### 5.15 定期 lint 分诊流程

频率：每次全维度摸底 + 每月一次全面清理。详见原手册。

### 5.16 废弃依赖监控与升级决策

频率：每次全维度摸底。工具：`node scripts/check-health.cjs`。不设硬性红线。

### 5.17 外部反馈合入流程（v1.8.0 新增）

> 源于 2026-05-21~22 外部部署反馈 18 项修复的处理经验。

收到外部部署反馈后：

1. **分级** — 按 P0/P1/P2 分级，对照风险清单
2. **复现** — 在相同环境 (OS/模型/端点) 上跑诊断脚本验证
3. **对照** — 逐项检查是否已在源码中修复，记录状态
4. **合入** — P0 项在下一个 minor/patch 版本合入
5. **沉淀** — 将通用解决方案提炼为 §5.x 规则

**追踪文件**：`.devdocs/UPSTREAM-BACKLOG.md` — 每个外部反馈项的状态跟踪。

### 5.18 认知金字塔审计模式（v2.0.0 提炼）

> 源于 v2.0.0 认知金字塔分析报告（281 行），是 brain-memory 项目中验证过的最系统的代码审查方法。

**五层结构**：

| 层 | 视角 | 检查内容 | 示例 |
|----|------|---------|------|
| L1 代码级 | 单文件/单函数 | 类型安全、边界条件、资源清理 | `source` 列缺失 → 测试失败 |
| L2 模块级 | 模块组内部 | 文件间数据流、函数调用链 | extractor/ 三级提取是否完整 |
| L3 数据流级 | 跨模块 | 数据类型在管道中的变形 | `ScopeFilterV2 ↔ StorageFilter` 适配 |
| L4 架构级 | 整体架构 | 分层合理性、依赖方向、抽象泄漏 | LanceDB 角色偏离设计构想 |
| L5 项目级 | 项目治理 | 文档完整性、依赖健康、工程质量 | .gitignore 排除关键文档 |

**与传统 code review 的对比**：

| 维度 | 传统模式 | 认知金字塔审计 |
|------|---------|---------------|
| 发现问题的方式 | 运行时错误 / 逐文件 review | 从设计构想出发，按 5 层结构化扫描 |
| 设计 vs 实现的差距 | 靠经验判断 | 逐条对照设计构想与代码 |
| 修复优先级 | 凭感觉 | P0/P1/P2/P3 四档分级 |
| 遗漏风险 | 高（只修看到的问题） | 低（全部偏差编号化追踪） |
| 文档产出 | commit message 为主 | 分析报告 + 审核清单 + 留痕文档 |

**触发时机**：每个大版本发布前 + 接手不熟悉的项目时。

### 5.19 "分析→校准→修复"三阶段流程（v2.0.0 提炼）

> 源于 v2.0.0 审计闭环的 12 小时全流程经验。

```
阶段一：分析（~3h）
  └→ 产生完整认知金字塔报告
  └→ 标注所有偏差（编号 D1..Dn）
  └→ 标注待确认项（"需与负责人核对"）
  └→ 标注风险项（编号 R1..Rn）

阶段二：校准（~1h）
  └→ 与项目负责人逐条确认偏差
  └→ 3 个误判被纠正（D1/D6/R1）← 避免无效修改的关键
  └→ 产出审核清单（15 项，编号 + 优先级 + 涉及文件）

阶段三：修复（~8h）
  └→ 按审核清单逐项执行
  └→ 每项修复后立即测试验证
  └→ 最终确认全部闭合
```

**规则**：
- 阶段一和阶段二不得跳过——跳过校准直接修复 = 会改不该改的东西
- 校准必须在动手修改代码之前完成
- 每个偏差标注"偏差/风险/待确认"三种性质，防止混淆

### 5.20 POC 代码生命周期管理（v2.0.0 提炼）

> 源于 LanceDBStorageAdapter 从 POC 演变为实际存在但偏离设计的类。

**POC 代码三阶段**：

| 阶段 | 状态 | 处置 |
|------|------|------|
| POC 开发 | 验证可行性 | 独立分支或独立文件，标记 `@poc` |
| POC 验证通过 | 决策是否正式化 | 正式化 → 合并入主分支；废弃 → 删除 POC 代码，仅保留调研报告 |
| 正式化 | 生产代码 | 移除 POC 标记，纳入完整测试和质量红线 |

**反模式**：POC 代码长期保留在源码树中、出现在 `ContextEngine` 构造函数中、被用户可能误选。

### 5.21 骨架地图知识体系（v2.1.0 新增）

> 源于本次基线评估中构建的 7 份骨架文档体系。

**五维骨架**：

| 维度 | 文档 | 回答的问题 |
|------|------|-----------|
| 结构 | 模块总览 | 有什么模块？在哪？做什么？ |
| 行为 | 数据流文档 | 数据怎么流转？谁调谁？ |
| 契约 | API 契约 + 测试矩阵 | 对外承诺什么？验证了没有？ |
| 演进 | 演进记录 | 为什么这样设计？欠了什么债？ |
| 边界 | 边界与运行 | 依赖什么？怎么部署？降级行为？ |

**原则**：
- 骨架地图是"导航索引"，不是项目已有文档的替代品——细节始终指向原始文档
- 每个大版本发布前更新一次骨架地图
- 新成员上手第一件事：先读骨架地图，再读项目文档

---

## 6. 项目模板

### 6.1 版本规划模板

```markdown
# brain-memory vX.Y.Z 版本规划

| 字段 | 内容 |
|------|------|
| **日期** | YYYY-MM-DD |
| **规划人** | |
| **关联风险** | [引用 §4 风险清单编号] |

## 版本目标
- [核心目标 1]

## 全维度摸底结论
| 维度 | 状态 | 说明 |
|------|------|------|
| 构建 | | |
| 测试 | | |
| 覆盖率 | | |
| 代码质量 | | |
| 文档 | | |
| 依赖 | | |
| 性能基线 | | |

## 新增功能
| 编号 | 功能 | 优先级 | 目标等级 | 验收标准 |
|------|------|--------|---------|---------|

## 已知问题承接
| 编号 | 问题 | 来源 | 等级 | 修复方案 |
|------|------|------|------|---------|

## 向后兼容性评估
- [ ] API 无破坏性变更
- [ ] 配置无破坏性变更

## 风险项
| 风险 | 概率 | 影响 | 等级 | 缓解措施 |
|------|------|------|------|---------|

## 执行批次
| 批次 | 功能 | 说明 |
|------|------|------|
```

### 6.2 开发记录模板

```markdown
# [功能名称] — 开发记录

| 字段 | 内容 |
|------|------|
| **日期** | YYYY-MM-DD |
| **记录人** | |
| **关联版本** | vX.Y.Z |
| **对应规划编号** | F-XX |

## 一、开发内容
## 二、测试
## 三、验收确认
## 四、使用示例
## 五、后续扩展 / 已知限制
```

### 6.3 技术决策记录（ADR）

```markdown
# [决策标题]

| 字段 | 内容 |
|------|------|
| **日期** | YYYY-MM-DD |
| **状态** | 已采纳 / 已废弃 / 待确认 |
| **决策人** | |
| **关联版本** | vX.Y.Z |

## 背景
## 可选方案
| 方案 | 优点 | 缺点 |
|------|------|------|
## 决策
## 影响
```

---

## 附 A: 版本更新记录

| 手册版本 | 对应项目版本 | 日期 | 变更 |
|---------|-------------|------|------|
| v2.0 | v1.0.0 | 2026-05-12 | 初始版本（基于通用手册 v1.0） |
| v2.5 | v1.6.2 | 2026-05-20 | 补充 5.12~5.16 运行模式矩阵/约束登记/方向澄清等 |
| **v2.6** | **v1.8.0** | **2026-05-25** | **修正 8 处过时：技术栈/记忆分类/thinking 规则/基线数据/版本脉络；新增 5.5 多端 LLM 兼容性规范 + 5.17 外部反馈合入流程；废弃 5.9 备份目录约定；更新风险清单 TR-14/15 + ER-01** |
| **v3.0** | **v2.1.0** | **2026-05-27** | **代码审查修复完成：更新基线数据（876用例, 75文件）、版本脉络（v2.1.0）、风险清单（TR-02/16/17/18）、量化指标** |
| **v3.1** | **v2.1.0** | **2026-06-01** | **基线评估完成：更新基线数据（880用例, 76文件）、修复0失败；新增 §5.18 认知金字塔审计模式、§5.19 分析→校准→修复流程、§5.20 POC 代码生命周期、§5.21 骨架地图知识体系；新增风险 ER-02/03/04；更新量化指标** |

---

*手册维护: 每次版本发布后同步更新 §3 基线表、§1.4 版本脉络、§4 风险清单。*
*基于: 《工程协作手册 v1.0》+ brain-memory 项目实践*
