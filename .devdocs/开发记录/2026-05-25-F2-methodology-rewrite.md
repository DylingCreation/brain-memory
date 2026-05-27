# F-2 METHODOLOGY.md 系统性重写 — 开发记录

| 字段 | 内容 |
|------|------|
| **日期** | 2026-05-25 |
| **记录人** | OpenClaw CodingHelper |
| **关联版本** | v1.8.0 |
| **对应规划编号** | F-2 |

## 一、开发内容

**涉及文件**: `METHODOLOGY.md` — 重写 (手册 v2.5 → v2.6)

**修正的 8 处过时声明**:

| # | 旧描述 | 新描述 | 依据 |
|---|--------|--------|------|
| 1 | §1.3 "TypeScript（strict 模式）" | "strict: false → v1.8.0 开启 strictNullChecks" | tsconfig.json 摸底 |
| 2 | §1.3 "SQLite（better-sqlite3）" | "SQLite — @photostructure/sqlite 1.2.1" | package.json 摸底 |
| 3 | §1.2 "8 类记忆: 工作记忆、事实记忆..." (不准确) | "profile / preferences / entities / events / tasks / skills / cases / patterns" | types.ts MEMORY_CATEGORIES |
| 4 | §5.5 "对 qwen3 自动注入 thinking: { type: 'disabled'}" | §5.5 重写为 "多端 LLM 兼容性规范"，端点路由替代模型名判断 | log/ 外部部署验证 |
| 5 | §2 "tsc --noEmit 零报错，无 any 逃逸" | "tsc --strictNullChecks --noEmit 零报错（v1.8.0 起）" | strict=false 下旧检查无意义 |
| 6 | §3 "核心模块 maintenance 76%" | 修正为实际值 74.6% | vitest coverage 报告 |
| 7 | §1.4 版本脉络停在 v1.6.2 | 新增 v1.6.2→v1.8.0→v2.0.0 dev | git log |
| 8 | §5.7 "107 处 any 全部消除" | 保留但标注验证时间戳 | src/ 中仅剩 6 处 |

**新增内容**:
- §5.5 多端 LLM 兼容性规范（替代旧版 Qwen thinking 规则）
- §5.17 外部反馈合入流程（基于 log/ 18 项修复经验）
- §5.9 备份目录约定 → 标记为已废弃
- §4 风险清单新增 TR-14/TR-15/ER-01
- §1.2 核心能力描述重写（对齐实际实现）
- §3 基线表更新至 v1.6.2 实际值
- §附A 版本更新记录

**废弃内容**:
- §5.9 备份目录约定 — _bak/ 目录已移除

## 二、测试

| 验证项 | 结果 |
|--------|------|
| 所有事实声明与代码实际一致 | ✅ 逐条核实 |
| 版本脉络与 git log 一致 | ✅ |
| 技术栈与 package.json 一致 | ✅ |
| thinking 规则与 llm.ts 一致 | ✅ |
| 基线数据与 vitest coverage 报告一致 | ✅ |

## 三、验收确认

| 验收标准 | 状态 |
|---------|------|
| 技术栈 (better-sqlite3 → @photostructure/sqlite) 修正 | ✅ |
| strict 声明修正 | ✅ |
| 记忆分类名修正 | ✅ |
| thinking 优化规则重写为多端路由 | ✅ |
| 版本脉络更新 | ✅ |
| 基线表刷新 | ✅ |
| 新增 §5.17 外部反馈合入流程 | ✅ |

## 四、后续维护

- 每次版本发布后更新 §1.4 版本脉络、§3 基线表
- 新增 §4 风险时同步追加到风险清单
- 新的端点兼容性知识沉淀到 §5.5
