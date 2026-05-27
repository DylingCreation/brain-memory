# Phase 3-2：CI 覆盖率门 + tsconfig 合并

**来源**: 综合报告 — M1 (配置碎片化) + M9 (CI 质量门)  
**执行日期**: 2026-05-27  
**执行人**: AI  
**状态**: ✅ 已完成（2 项任务）

---

## 包含任务

| # | 任务 | 来源 | 状态 |
|---|------|------|------|
| 3.1 | CI 补充覆盖率步骤 | M9 | ✅ |
| 3.4 | 合并 5 个 tsconfig → 3 个 | M1-P3-3 | ✅ |

---

## 任务 3.1：CI 补充覆盖率 ✅

### CI 工作流最终状态

`.github/workflows/test.yml` 现在包含 6 个步骤：

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
  - run: npm ci
  - name: Check version consistency      ← Phase 3-1 新增
    run: npm run check:versions
  - name: Lint (0 errors gate)           ← Phase 3-1 新增
    run: npm run lint
  - run: npm run build
  - run: npm test
    env: BM_LLM_TEST: "0"
  - name: Coverage (text summary only)   ← 本次新增
    run: npm run test:coverage
    env: BM_LLM_TEST: "0"
```

### 新增 package.json 脚本

```json
"test:coverage": "vitest run --coverage"
```

vitest.config.ts 已配置 `coverage.provider: 'v8'` + `reporter: ['text', 'html', 'lcov']`。

---

## 任务 3.4：合并 tsconfig ✅

### 实地调研发现

| tsconfig 文件 | 用途 | 实际使用 |
|--------------|------|----------|
| `tsconfig.json` | 主配置 | `tsc` (build 脚本) ✅ |
| `tsconfig.build.json` | 构建 | **从未被任何脚本引用** ❌ 死文件 |
| `tsconfig.plugin.json` | 插件构建 | `tsc -p tsconfig.plugin.json` (build:plugin) |
| `tsconfig.test.json` | 测试类型检查 | `tsc -p tsconfig.test.json` ✅ |
| `core-only.tsconfig.json` | 精简声明构建 | 独立用途 ✅ |

`tsconfig.plugin.json` 与 `tsconfig.json` 的 include/exclude/compilerOptions **完全相同**（逐字段比对确认）。`build:plugin` 与 `build` 产生完全相同的输出。

### 执行

| 操作 | 说明 |
|------|------|
| 删除 `tsconfig.build.json` | 死文件，从未被引用 |
| 删除 `tsconfig.plugin.json` | 与 tsconfig.json 完全重复 |
| 删除 `build:plugin` 脚本 | 与 build 重复 |
| 简化 `build:all` 脚本 | `clean + build:plugin` → `clean + build` |

### 最终状态

```
tsconfig.json          (主配置, 使用于 tsc)
tsconfig.test.json     (测试类型检查)
core-only.tsconfig.json (精简声明构建)
```

**5 → 3 个 tsconfig**

---

## 全量验证

| 指标 | 结果 |
|------|------|
| Lint | **0 errors** ✅ |
| Build | 成功 (exit 0) ✅ |
| Tests | 834 pass（无新增失败） ✅ |
