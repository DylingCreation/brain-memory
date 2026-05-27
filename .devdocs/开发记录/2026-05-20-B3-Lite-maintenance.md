# B-3 Lite 模式 runMaintenance 补全 — 开发记录

| 字段 | 内容 |
|------|------|
| **日期** | 2026-05-20 |
| **记录人** | 代码助手 |
| **关联版本** | v1.6.0 |
| **对应计划** | `.devdocs/版本规划/v1.6.0.md` 批次 ⑨ B-3 |

## 1. 开发内容

Lite 模式下 `runMaintenance` 执行精简维护：仅去重 + PageRank + 衰减，跳过社区检测和 LLM 摘要。

### 改进前

```
mode='lite' → context.ts 仍然调用 runMaintenance()
            → 但 maintenance.ts 无条件执行社区检测
            → 社区检测在 Lite 模式下无意义（无 LLM，无法生成摘要）
            → 返回空社区结果
```

### 改进后

```
mode='lite' → runLiteMaintenancePath()
             → 1. 去重（dedup）
             → 2. PageRank（computeGlobalPageRank）
             → 3. 衰减归档（scoreDecay）
             → 跳过社区检测和 LLM 摘要
             → 返回 lite:true 标志
```

### 修改文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/graph/maintenance.ts` | 修改 | 导入 RunMode；新增 `runLiteMaintenancePath()`；runMaintenance() 路由 Lite 分支 |
| `test/lite-maintenance.test.ts` | 新增 | 8 测试 |

## 2. 测试

```
Lite maintenance：8/8 passed
全量回归：      728 passed / 18 skipped / 2 flaky
tsc：           零报错
lint：          0/0
```

## 3. 验收确认

| 验收标准 | 状态 |
|----------|------|
| Lite 模式跳过社区检测 | ✅ community.count=0 |
| Lite 模式跳过 LLM 摘要 | ✅ communitySummaries=0 |
| Lite 模式执行去重 | ✅ dedup 正常 |
| Lite 模式执行 PageRank | ✅ pagerank 正常 |
| Lite 模式执行衰减 | ✅ |
| 返回 lite:true 标志 | ✅ |
| 向后兼容（full 不变） | ✅ |
| 零回归 | ✅ 728 passed |

---

*B-3 开发记录 · v1.6.0 · 2026-05-20 · 代码助手*
