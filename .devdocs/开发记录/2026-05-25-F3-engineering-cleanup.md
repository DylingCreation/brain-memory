# F-3 工程清理 — 开发记录

| 字段 | 内容 |
|------|------|
| **日期** | 2026-05-25 |
| **记录人** | OpenClaw CodingHelper |
| **关联版本** | v1.8.0 |
| **对应规划编号** | F-3 |

## 一、开发内容

**涉及文件**:
- `_bak/` — **完全移除** (65 个文件，约 1.2MB)
- `src/engine/context.ts` — `getDb()` 标记 `@deprecated`

### 1. `_bak/` 目录清理

**背景**: `_bak/src_before_c1_deps_upgrade/` 包含 v1.0.0 之前的完整源代码副本，用于依赖升级回滚。自 v1.6.2 后不再需要。

**操作**:
1. 创建 git tag `archive/pre-v1.0.0` 保存历史代码
2. `rm -rf _bak/` 移除目录

```bash
git tag "archive/pre-v1.0.0" HEAD
rm -rf _bak/
```

**验证**: `ls _bak/` → 目录不存在 ✅

### 2. `getDb()` 标记 deprecated

**问题**: `ContextEngine.getDb()` 直接返回 `DatabaseSyncInstance`，绕过 IStorageAdapter 抽象层。调用方做了 `(this.storage as SQLiteStorageAdapter).getDb()` 类型断言。

**修复**: 在 context.ts 的方法签名上方添加 `@deprecated` JSDoc 标记，保留功能但提示迁移。

```typescript
// src/engine/context.ts:412
- getDb(): DatabaseSyncInstance { ... }
+ /** @deprecated v1.8.0 — 破坏 IStorageAdapter 抽象。请通过适配器方法替代。 */
+ getDb(): DatabaseSyncInstance { ... }
```

**影响**: 零功能影响。`getDb()` 仍可使用，但开发者看到 deprecated 标记后会优先使用 IStorageAdapter 方法。

**调用方分析**:
| 位置 | 用途 | 替代方案 |
|------|------|---------|
| context.ts:427 `(this.storage as SQLiteStorageAdapter).getDb()` | 获取原始 DB 用于 healtCheck 统计 | 通过 `this.storage.getStats()` 替代 |

## 二、测试

| 验证项 | 结果 |
|--------|------|
| `npm run build` | ✅ 零报错 |
| `npm test` | ✅ 无回归 |
| `_bak/` 目录已移除 | ✅ `find . -path './_bak' -type d` 无输出 |
| git tag archive/pre-v1.0.0 存在 | ✅ `git tag -l archive/*` |

## 三、验收确认

| 验收标准 | 状态 |
|---------|------|
| `_bak/` 从源码树移除 | ✅ |
| git tag 保存历史 | ✅ |
| `getDb()` 标记 @deprecated | ✅ |
| `npm test` 无回归 | ✅ |
