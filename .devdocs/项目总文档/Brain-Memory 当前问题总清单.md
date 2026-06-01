# Brain-Memory 当前问题总清单

> 整理日期：2026-06-01 | 核实日期：2026-06-01
>
> 基于：8 份骨架文档 + .devdocs/ 全部留痕 + 代码扫描 + 基线评估实测 + 逐项多维核实

---

## 一、确认存在的问题（14 项）

### P2 · 应在下个补丁版本处理（5 项）

| # | 问题 | 核实方式 | 说明 |
|---|------|---------|------|
| **E-1** | `plugin-core.test.ts` onSessionEnd 测试产生 `Cannot read properties of undefined (reading 'enabled')` 错误日志 | 实测复现：`npx vitest run test/integration/plugin-core.test.ts` | `makePluginConfig` 中 `decay` 和 `reflection` 字段存在，但 `onSessionEnd` 链路中嵌套字段传递或 `deepMergePluginConfig` 合并存在缺失，需进一步调试根因 | ✅ **v2.1.1 已修复** (F-2) |
| **E-2** | 覆盖率 `All files 37.6%` 被非源码文件稀释 | 实测确认：`_backup/src_before_unused_cleanup/` (504KB) + `openclaw-wrapper.ts` (27KB) + `test-engine.ts` 在 coverage 范围内 | vitest coverage.exclude 需增加 `_backup/**` 和根目录非源码 TS 文件 |
| **S-1** | `src/ui/` 6 个源文件 0 自动化测试 | 文件确认：`test/` 中 0 个 `*ui*` / `*server*` / `*controller*` 文件 | E2E `full-lifecycle.test.ts` 已存在但不覆盖 UI controllers |
| **S-2** | `format/assemble.ts` Token 预算截断 0 独立测试 | 文件确认：`test/` 中 0 个 `*format*` / `*assemble*` 文件 | 超预算截断行为仅通过集成测试间接覆盖 |
| **S-3** | `reflection/extractor.ts` 安全过滤 (`sanitizeReflectionText`) 0 单元测试 | 文件确认：`test/unit/` 中 0 个 `*reflection*` 文件 | 6 种 prompt injection 正则仅集成覆盖 |

### P3 · 后续版本考虑（9 项）

| # | 问题 | 核实方式 | 说明 |
|---|------|---------|------|
| **E-3** | `lancedb-poc.test.ts` 12 个永远 skip 的测试残留 | 代码确认：214 行，6 处 skip/skipIf | 死测试代码，每次运行都 skip |
| **S-4** | `export/import` 路径 0 专门测试 | 文件确认：`test/` 中 0 个 `*export*` / `*import*` 文件 | 导出/导入循环可能丢失数据 |
| **S-5** | Small 模式提示词 token 数 (≤180) 未纳入自动化验证 | 代码检查：`small-mode.test.ts` 含 token 相关断言但未找到显式 180 阈值检查 | 可能随 LLM 升级漂移 |
| **S-6** | 三份 tsconfig 共存 | 文件确认：`tsconfig.json` + `tsconfig.test.json` + `core-only.tsconfig.json` | `core-only.tsconfig.json` 含 22 个源文件白名单，维护负担 |
| **C-1** | `scopeSession` @deprecated 标记未清理 | 代码确认：`types.ts:198` + `adapter.ts:33/35/37` 共 4 处 | v2.0 后使用 scopeChat 替代 |
| **C-2** | `includeScopes/excludeScopes` @deprecated 标记未清理 | 代码确认：`adapter.ts:62/64` 共 2 处 | v2.0 后使用 includeScopesV2/excludeScopesV2 |
| **C-3** | `LanceDBStorageAdapter` @deprecated 但文件仍在源码树中 | 代码确认：`lancedb-adapter.ts:74` (310行) + `adapter.ts:8` | D7 已闭合（标记废弃 + ContextEngine 移除分支），文件 0 调用方引用 |
| **C-4** | LPA 社区 ID 不稳定性 | 代码确认：`community.ts:6` ISSUE 7.2 | 节点删除/合并后同一主题组可能获得不同 ID，标记为已知限制 |
| **L-2** | LLM 测试稳定性（mock-openclaw 42s 历史超时） | 当前状态：11 个测试全部因 `TEST_LLM_API_KEY not set` 跳过，未触发 | v1.2.0 复盘中标记，当前环境不可复现 |

---

## 二、核实中撤回的项

| 原标记 | 撤回原因 |
|--------|---------|
| L-1 (LanceDB 生产级) | LanceDB 角色已在 v2.0.0 D7 纠正为 ISearchIndex 伴随索引，当前实现与设计一致 |
| L-3 (架构审计制度化) | 方法论层面的流程建议，不是代码级缺陷 |
| L-4 (POC 生命周期管理落地) | 已提炼为 METHODOLOGY.md §5.20，代码级无相关项 |
| L-5 (性能基准 CI flaky) | 本次 6 文件 33 测试全部通过 (6.03s)，不可复现 |
| L-6 (BmConfig 拆分) | 类型已分组（EngineCoreConfig/RecallParamsConfig/MaintenanceParamsConfig），实例拆分属长期架构演进 |
| C-5 (ISSUE 7.3 单节点社区过滤) | 设计行为，非问题 |
| C-6 (ISSUE 8.1 PR 缓存清除) | 已修复的设计行为标记 |

---

## 三、统计

| 级别 | 数量 | 编号 |
|------|------|------|
| P2 | **5** | E-1, E-2, S-1, S-2, S-3 |
| P3 | **9** | E-3, S-4, S-5, S-6, C-1~C-4, L-2 |
| **合计** | **14** | — |

---

## 四、处理建议

### 立即可修（30 分钟内）

1. **E-2** — vitest.config.mts coverage.exclude 加 `_backup/**` + `openclaw-wrapper.ts` + `test-engine.ts`
2. **E-3** — 删除 `lancedb-poc.test.ts`

### 下个 patch (v2.1.1)

3. **E-1** — 排查 `plugin-core.test.ts` onSessionEnd config 传递链路
4. **S-6** — 评估 core-only.tsconfig.json 是否可以合并或删除

### 下个版本评估

5. **S-1/S-2/S-3** — UI + format + reflection 测试补齐
6. **S-4/S-5** — export/import + small mode 测试
7. **C-1~C-3** — @deprecated 清理时机评估
8. **C-4** — LPA ID 稳定性（如不影响功能则维持已知限制）
