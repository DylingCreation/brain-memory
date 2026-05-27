# check-health.cjs — 工程卫生检查脚本

| 字段 | 内容 |
|------|------|
| **日期** | 2026-05-18 |
| **文件** | `scripts/check-health.cjs` |
| **Git 提交** | fffaa1c |

## 背景

v1.6.0 摸底时发现 3 项工程卫生缺陷：
1. 覆盖率盲区无自动热力图（#6）
2. lint warnings 无趋势追踪（#5）
3. deprecated 依赖无监控指标（#7）

手动检查耗时且易漏，需自动化工具。

## 功能

```
node scripts/check-health.cjs

📊 Coverage Blind Spot Heatmap    — 读取 coverage-summary.json，按 80%/60% 分色
📋 Lint Warning Triage            — 自动分类：接口契约/POC 桩 vs 其他
📦 Deprecated & Outdated Deps     — npm outdated，major 版本差距标注
🔒 Security Audit                 — npm audit，按 severity 统计
📋 Decision Support Summary       — 🟢🟡🔴 一目了然
```

## 关键设计

| 设计点 | 说明 |
|--------|------|
| lint 分类 | 按文件路径自动归类（adapter→接口契约, hooks/core→POC 桩） |
| 趋势追踪 | 每次运行保存基线到 `.devdocs/lint-baseline.json`，对比 delta |
| 依赖 major 差距 | 手动计算 curMajor vs latestMajor，npm outdated 本身不分 |
| coverage 依赖 | 需先跑 `npx vitest run --coverage` 生成 coverage-summary.json |
| CJS 格式 | 项目 `"type": "module"`，脚本必须用 `.cjs` 后缀 |

## 使用场景

- v1.6.0 每次摸底：全跑
- 月度 lint 分诊：只关注 lint + deps
- CI（未来）：fail on errors / major dep gap > threshold

## 验收

- `node scripts/check-health.cjs` 运行成功 ✅
- lint 分类准确（122 warnings，107 接口/POC，15 其他）✅
- 依赖检测出 9 outdated（6 major）✅
- audit 显示 0 vulnerabilities ✅

---

*代码助手 · 2026-05-18*
