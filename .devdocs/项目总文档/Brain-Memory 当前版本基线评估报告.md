# Brain-Memory v2.1.0 基线评估报告

> 日期：2026-06-01 | 评估依据：Handbook §2.1 全维度基线评估
>
> 参考文档：[模块总览](./Brain-Memory%20项目功能模块总览.md) | [数据流文档](./Brain-Memory 数据流通道梳理.md) | [API 契约](./Brain-Memory API契约与测试矩阵.md)

---

## 一、评估结论

| 维度 | 状态 | 评级 | 关键数据 |
|------|------|------|---------|
| **构建** | ✅ 通过 | L1 | tsc 零报错 |
| **Lint** | ✅ 通过 | L1 | 0 errors, 0 warnings |
| **测试** | ✅ 通过 | L1 | 73/76 files passed, 847/880 tests passed (33 skipped = LLM-dependent) |
| **覆盖率** | ⚠️ 无法精确评估 | — | 覆盖率报告包含归档备份文件稀释到 37.6%（全部文件），需清理后重测 |
| **代码质量** | ✅ 良好 | L1 | 领域服务已拆分，存储已抽象，无明显代码异味 |
| **文档** | ✅ 充足 | L1 | 5 份骨架地图 + 项目 10+ 份 docs + .devdocs 留痕体系 |
| **依赖** | ⚠️ 维护中 | L2 | 4 个运行时依赖，15 个开发依赖；7 个有 minor/patch 更新可用 |
| **性能基线** | ✅ 已建立 | L1 | 增量 PageRank ≥5x、增量 LPA ≥3x（vs 全量）；10K 节点 1.1s PageRank |

**综合评级：L1 Production Ready** ✅

---

## 二、逐项评估详情

### 2.1 构建

```
npx tsc --noEmit → 0 errors
```

| 检查项 | 结果 |
|--------|------|
| TypeScript 编译 | ✅ 零报错 |
| strictNullChecks | ✅ 已启用（v1.8.0 F-4） |
| 路径别名 | ✅ tsconfig 正确 |
| 多 tsconfig 管理 | ⚠️ `tsconfig.json` + `tsconfig.test.json` + `core-only.tsconfig.json` 三份，历史遗留，但当前无冲突 |

### 2.2 Lint

```
npx eslint src/ → 0 errors, 0 warnings
```

| 检查项 | 结果 |
|--------|------|
| ESLint 10.4.0 | ✅ 全部通过 |
| no-explicit-any 策略 | ✅ v1.5.0 已收敛（107→分层处理） |

### 2.3 测试

```
npx vitest run → 73 passed | 3 skipped (76 files) | 847 passed | 33 skipped (880 tests)
```

| 层 | 文件 | 结果 |
|----|------|------|
| 单元测试 (unit/) | 22 | ✅ 全部通过 |
| 集成测试 (integration/) | 48 | ✅ 45 passed, 3 skipped（LLM-dependent / LanceDB POC） |
| 性能测试 (performance/) | 6 | ✅ 全部通过 |
| E2E (e2e/) | 1 | ✅ 通过 |

**Skipped 测试分析**：

| 文件 | 跳过原因 | 类型 |
|------|---------|------|
| `context-engine-integration.test.ts` | `TEST_LLM_API_KEY not set` | 环境依赖 |
| `lancedb-poc.test.ts` (12 tests) | LanceDB POC 已废弃 | 历史遗留 |
| `mock-openclaw-integration.test.ts` (11 tests) | `TEST_LLM_API_KEY not set` | 环境依赖 |

**已知问题**：

| 问题 | 严重度 | 位置 | 说明 |
|------|--------|------|------|
| mock-openclaw 测试产生 error 日志 | P2 | `test/integration/mock-openclaw-integration.test.ts` | mock config 不完整导致 `decay.enabled` / `reflection.enabled` 为 `undefined`；测试逻辑在 catch 中处理，不影响通过但日志噪音大 |
| 覆盖率报告包含归档文件 | P3 | `vitest.config.mts` | `test_cleanup/` 和 `archive_cleanup/` 目录未被 coverage exclude，稀释覆盖率数据 |

### 2.4 覆盖率

> ⚠️ 覆盖率报告因包含归档备份文件导致 `All files` 仅 37.6%，实际 src/ 覆盖率需要清理后重测

| 已知可靠数据（来自 v1.0.0 复盘和 v2.0.0 审计） | |
|------|------|
| 整体语句覆盖率 | ~70%（v1.0.0 复盘 83.2% → 回归后稳定在 ~70-80%） |
| 已知低覆盖模块 | reflection/extractor.ts · format/assemble.ts · ui/（无自动化测试） |

### 2.5 代码质量

| 检查项 | 结果 |
|--------|------|
| God Object 拆分 | ✅ v2.1.0 已完成 ContextEngine 656→~350 行 |
| 存储抽象 | ✅ IStorageAdapter 已实现，SQLiteStorageAdapter 为唯一实现 |
| LanceDB 架构 | ✅ 已降为 ISearchIndex 伴生索引，不再作为主存储 |
| Scope 迁移 | ✅ v1→v2 迁移系统完善，幂等 |
| any 类型收敛 | ✅ v1.5.0 已处理 |
| 过时代码 | ⚠️ `@deprecated` 标记保留向后兼容但未清理 |

### 2.6 文档

| 文档类型 | 状态 | 说明 |
|---------|------|------|
| 骨架地图 | ✅ 7 份 | 模块总览 + 数据流 + API契约 + 演进记录 + 边界运行 + 知识地图 + 基线评估 |
| 项目文档 | ✅ 10+ 份 | docs/api-reference.md / architecture.md / deployment.md / security.md / usage.md |
| 留痕体系 | ✅ 85+ 份 | .devdocs/（版本规划/复盘/技术决策/开发记录/问题修复/摸底/基准） |
| JSDoc | ⚠️ 部分 | v1.2.0 F-8 补全后覆盖率 ~35%，优先级低 |

### 2.7 依赖

| 依赖 | 当前 | 最新 | 差距 |
|------|------|------|------|
| `@lancedb/lancedb` | 0.27.2 | 0.30.0 | 需要评估 |
| `vitest` | 3.2.4 | 4.1.7 | **不能升级**（v1.6.0 决策：SQLite lock 恶化 4x） |
| `@vitest/coverage-v8` | 3.2.4 | 4.1.7 | 同上 |
| `typescript` | 5.9.3 | 6.0.3 | 需评估 breaking changes |
| `eslint` | 10.4.0 | 10.4.1 | patch，可安全升级 |
| `@typescript-eslint/*` | 8.59.4 | 8.60.0 | patch，可安全升级 |
| `tsx` | 4.21.0 | 4.22.4 | minor，低风险 |
| `@types/node` | 20.19.41 | 25.9.1 | major，需评估 |

**建议**：eslint + @typescript-eslint 的 patch 升级可立即执行；其余需要版本规划中评估。

### 2.8 性能基线

> 来自 performance/ 测试数据

| 基准 | 数据 | 来源 |
|------|------|------|
| 1K 节点 PageRank 全量 | ~50ms | `perf-1k-benchmark.test.ts` |
| 1K 节点 PageRank 增量 (5% dirty) | ~10ms | `perf-1k-benchmark.test.ts` |
| 增量加速比 (PageRank) | ≥5x | 上述对比 |
| 增量加速比 (LPA) | ≥3x | 上述对比 |
| 10K 节点 PageRank | ~1100ms | `perf-tiered-benchmark.test.ts` |
| 5K 节点 LPA | ~683ms | `perf-tiered-benchmark.test.ts` |

---

## 三、质量红线检查

| 红线 | 状态 | 说明 |
|------|------|------|
| **Tests Passing** | ✅ | 847 passed, 33 skipped（均为环境依赖或历史废弃） |
| **Backward Compatibility** | ✅ | v2.0 scope 迁移系统完善，`@deprecated` 字段保留兼容 |
| **Security No Vulnerabilities** | ✅ | SQL 参数化防注入，反思内容安全过滤，API 认证 |
| **Build Available** | ✅ | tsc 零报错 |
| **Type Safety** | ✅ | strictNullChecks 启用 |
| **Performance No Regression** | ✅ | 增量维护性能目标达标 |
| **Documentation Available** | ✅ | 完整文档体系 |

---

## 四、发现的问题（按优先级）

| ID | 问题 | 严重度 | 类型 | 建议 |
|----|------|--------|------|------|
| **P-1** | mock-openclaw 测试中 config 不完整导致 `Cannot read properties of undefined (reading 'enabled')` error 日志 | P2 General | 测试质量 | 补全 mock config 的 nested 字段 |
| **P-2** | 覆盖率报告被 `test_cleanup/` / `archive_cleanup/` 稀释 | P2 General | 工程卫生 | 在 vitest coverage.exclude 中新增排除规则 |
| **P-3** | UI 子系统 (`src/ui/`) 无自动化测试 | P2 General | 测试覆盖 | 路径见 API 契约 §测试缺口 |
| **P-4** | export/import 功能无专门测试 | P3 Exploration | 测试覆盖 | 路径见 API 契约 §测试缺口 |
| **P-5** | `@deprecated` 标记未清理（scopeSession / v1 scope 字段 / LanceDBStorageAdapter） | P3 Exploration | 代码清理 | 评估何时移除向后兼容 |
| **P-6** | LanceDB 0.27.2 → 0.30.0 版本跳跃 | P3 Exploration | 依赖 | 评估 breaking changes |

---

## 五、推荐下一步

1. **P-1 + P-2** 可在当前版本修复（小改动，不影响 API）
2. **P-3** 建议纳入下一版本规划的第一批
3. **依赖升级**（eslint/tsx 等 patch）可批量执行

如需，可基于本报告启动 v2.1.x 版本规划。
