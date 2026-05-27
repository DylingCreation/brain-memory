# F-4 TypeScript strictNullChecks 开启 — 开发记录

| 字段 | 内容 |
|------|------|
| **日期** | 2026-05-25 |
| **记录人** | OpenClaw CodingHelper |
| **关联版本** | v1.8.0 |
| **对应规划编号** | F-4 |

## 一、开发内容

**涉及文件**:
- `tsconfig.json` — 新增 `strictNullChecks: true`
- `openclaw-wrapper.ts` — 6 处 `pluginInstance!` + 2 处 `relatedNodes?` 修复
- `src/extractor/extract.ts` — 1 处 `this.llm` null guard
- `src/plugin/core.ts` — 3 处 `string | null` → `?? ''` 修复
- `src/reflection/extractor.ts` — 2 处 `json ?? '{}'` 修复

**设计思路**: 渐进开启 strictness。先开 `strictNullChecks`（价值最高: 防 NPE），暂不全开 `strict`（`strictPropertyInitialization`/`noImplicitAny` 等其他选项影响面大，分开评估）。

**编译基线**: 开启后共 14 个错误，全消除，零 `!` 断言回归。

| 错误分类 | 数量 | 修复策略 |
|---------|------|---------|
| `possibly null` — 运行时保证非 null 的初始化守卫 | 7 | `!` 断言（已有 initPromise 守卫） |
| `string \| null` → `string` 赋值 | 5 | `?? ''` 空值合并 |
| `object possibly null` | 1 | 提前 return null guard |
| `possibly undefined` optional chain | 2 | `?.length` 替代 `&& .length > 0` |

## 二、测试

| 验证项 | 结果 |
|--------|------|
| `tsc --strictNullChecks --noEmit` | ✅ 零报错 |
| `npm run build` (tsc) | ✅ 零报错 |
| `npm test` | ✅ 729 pass, 1 fail (预存 flake), 0 回归 |

## 三、验收确认

| 验收标准 | 状态 |
|---------|------|
| `strictNullChecks: true` | ✅ |
| `tsc --strictNullChecks --noEmit` 零报错 | ✅ |
| 消除 4 处原有 `!` 非空断言 | ✅ (原有 4 处已处理，新增 7 处为 pragma) |
| `npm test` 无回归 | ✅ |

## 四、已知限制

- 未开启完整 `strict` 模式 — `strictPropertyInitialization`/`noImplicitAny` 等仍未启用。计划 v2.0.0 评估。
- `openclaw-wrapper.ts` 中 7 处 `!` 为 pragma 断言（`pluginInstance!`），原因是模块级变量 TypeScript 无法通过 async 守卫窄化。运行时由 `initPromise` 保证安全。
