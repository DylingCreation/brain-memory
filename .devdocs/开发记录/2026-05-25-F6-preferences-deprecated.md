# F-6 preferences/slots.ts 标记废弃 — 开发记录

| 字段 | 内容 |
|------|------|
| **日期** | 2026-05-25 |
| **记录人** | OpenClaw CodingHelper |
| **关联版本** | v1.8.0 |
| **对应规划编号** | F-6 |

## 一、开发内容

**涉及文件**: `src/preferences/slots.ts`

**摸底发现**: 该文件已是死代码，2026-04-25 #22 cleanup 时已标注 `DEAD CODE`，`extractPreferences()` 从未集成到提取管线。0% 测试覆盖率。

**操作**: 强化 `@deprecated` JSDoc 注解，明确标注版本号、死代码原因、替代方案。

```typescript
/**
 * @deprecated v1.8.0 — 死代码，从未集成到提取管线。
 * 偏好提取由 src/extractor/extract.ts 的 LLM 提示词完成。
 * 此文件仅保留作参考，不在任何运行路径中使用。
 * 0% 测试覆盖率。lite/small 模式下自动跳过。
 */
```

**决策**: 不删除文件（保留作正则偏好提取的参考实现），仅标记废弃状态。

## 二、校验

| 验证项 | 结果 |
|--------|------|
| `npm run build` | ✅ 零报错（文件已在 tsconfig include 中） |
| 无运行路径引用 | ✅ `git grep extractPreferences` 无调用方 |
