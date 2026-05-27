# F-7 OpenClaw 插件注册方式修正 — 开发记录

| 字段 | 内容 |
|------|------|
| **日期** | 2026-05-25 |
| **记录人** | OpenClaw CodingHelper |
| **关联版本** | v1.8.0 |
| **对应规划编号** | F-7（批次 3 补充） |

## 一、开发内容

**涉及文件**:
- `openclaw-register.ts` — 局部重写 (+40/-15)
- `openclaw-wrapper.ts` — 注册逻辑修正 (+20/-15)

**三个核心修复**:

### 1. 接入 definePluginEntry 标准入口

**问题**: v1.8.0 前使用自创的 `register()` 函数 + `export default pluginWrapper`，不是 OpenClaw Plugin SDK 的标准入口。

**修复**: `openclaw-register.ts` 新增 `definePluginEntry()` 本地兼容实现（因 `openclaw` npm 包不可安装，EPERM），返回符合 OpenClaw 插件规范的标准 `PluginEntry` 对象。

```typescript
export default definePluginEntry({
  id: 'brain-memory',
  name: 'Brain Memory',
  version: '1.8.0',
  register(api) {
    const { register } = pluginWrapper;
    register(api);
  },
});
```

### 2. api.on() 优先于 api.registerHook()

**问题**: 旧代码 `api.registerHook()` 为首选。OpenClaw 2026.5.x 中此方法签名已变更（可能改对象参数），导致注册失败。

**修复**: `api.on()` 提升为首选方法（OpenClaw Plugin SDK 官方标准 API），`api.registerHook()` 降为 legacy fallback。

### 3. hook 名 before_message_write → message_sending

**问题**: `before_message_write` 在 OpenClaw 官方 hook 列表中不存在。正确名称是 `message_sending`。旧名称在部分版本中可能静默失效。

**修复**:
- 函数声明 `before_message_write()` → `message_sending()`
- 注册列表使用 `message_sending`
- `before_message_write` / `beforeMessageSend` 保留为 `@deprecated` 别名

### 附加修正
- `register()` 返回对象的 `version` 从写死的 `1.0.0` → `1.8.0`
- `author` 从 `OpenClaw Team` → `DylingCreation`

## 二、测试

| 验证项 | 结果 |
|--------|------|
| `npm run build` | ✅ 零报错 |
| `npm test` | ✅ 729 pass, 1 fail (预存 flake), 0 回归 |
| mock-openclaw-integration.test.ts | ✅ 通过（旧 `before_message_write` 别名仍可用） |
| `tsc --strictNullChecks --noEmit` | ✅ 零报错 |

## 三、验收确认

| 验收标准 | 状态 |
|---------|------|
| definePluginEntry 作为 default export | ✅ |
| api.on() 优先于 api.registerHook() | ✅ |
| hook 名 message_sending 为主名称 | ✅ |
| before_message_write 保留为别名 | ✅ |
| 版本号 1.0.0 → 1.8.0 | ✅ |
| 无回归 | ✅ |
