# F-8 log/ 反馈遗漏项补全 — 开发记录

| 字段 | 内容 |
|------|------|
| **日期** | 2026-05-25 |
| **记录人** | OpenClaw CodingHelper |
| **关联版本** | v1.8.0 |
| **对应规划编号** | F-8 (批次 3 补充) |

## 一、开发内容

**涉及文件**:
- `package.json` — 新增 `openclaw` 字段 + `files` 含 `openclaw.plugin.json`
- `openclaw.plugin.json` — 重写：contracts + activation + configSchema 100%
- `openclaw-wrapper.ts` — normalizeHookArgs 删除 InternalHookEvent 分支 + 修正字段映射

### 修复的 5 项遗漏

| # | log/ 来源 | 问题 | 修复 |
|---|----------|------|------|
| 1 | 审查 #1 | `package.json` 缺 `openclaw` 字段 | 新增 `extensions` + `compat` |
| 2 | 审查 #4 | `openclaw.plugin.json` 缺 `contracts.hooks` + `activation.onStartup` | 新增 contracts + activation |
| 3 | 审查 #5 | npm `files` 不含 `openclaw.plugin.json` | `files` 追加 |
| 4 | 审查 #10 | `configSchema` 缺 `mode` 字段 | 新增 mode + recallCacheSize/Ttl + memoryInjection + memorySharing + llm.maxTokens |
| 5 | 部署 C | `normalizeHookArgs` InternalHookEvent 分支路径歧义 + sessionId 读错字段 | 删除歧义分支，修正为 `event?.sessionKey` |

### configSchema 补全清单

| 新增字段 | 对齐 |
|---------|------|
| `mode` (full/lite/small) | ✅ 之前 0%，现 100% |
| `recallCacheSize` / `recallCacheTtlMs` | ✅ |
| `memoryInjection` (4 子字段) | ✅ |
| `memorySharing` (4 子字段) | ✅ |
| `llm.maxTokens` | ✅ |
| `decay.enabled` default false→true | ✅ |

### 移除的非标准字段

| 字段 | 原因 |
|------|------|
| `entry` (顶层) | OpenClaw 从 `package.json.openclaw.extensions` 读取，不从此处 |
| `hooks` (顶层数组) | 自创格式，OpenClaw 使用 `contracts.hooks` |

## 二、测试

| 验证项 | 结果 |
|--------|------|
| `npm run build` | ✅ 零报错 |
| `strictNullChecks` | ✅ 零报错 |
| `npm test` | ✅ 729 pass, 1 flake, 0 回归 |

## 三、验收确认

| 验收标准 | 状态 |
|---------|------|
| `package.json.openclaw` 字段存在 | ✅ |
| `files` 含 `openclaw.plugin.json` | ✅ |
| `openclaw.plugin.json` 有 contracts.hooks | ✅ |
| `openclaw.plugin.json` 有 activation.onStartup | ✅ |
| `configSchema` 含 `mode` 字段 | ✅ |
| `normalizeHookArgs` 无 InternalHookEvent 分支 | ✅ |
| `sessionId` 读 `event.sessionKey` | ✅ |
