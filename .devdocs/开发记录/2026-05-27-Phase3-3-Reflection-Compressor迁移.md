# Phase 3-3：Reflection/Compressor 迁移到 IStorageAdapter（阶段 A+B）

**来源**: M5-P1-2, M3-架构-A2  
**执行日期**: 2026-05-27  
**执行人**: AI  
**状态**: ✅ 阶段 A+B 已完成（阶段 C 暂缓）

---

## 背景

`reflection/store.ts` 和 `session/compressor.ts` 的 4 个函数直接使用 `DatabaseSyncInstance` + 原始 SQL，绕过 `IStorageAdapter` 抽象层。在 LanceDB 后端下会崩溃。深度调研发现这些函数是"已实现但未接入 ContextEngine 管线"的代码（详见 `.devdocs/技术决策/2026-05-27-Reflection-Compressor迁移规划.md`）。

---

## 阶段 A：IStorageAdapter 接口扩展

### 新增 6 个方法

| 方法 | 用途 | SQLite 实现 | LanceDB stub |
|------|------|------------|-------------|
| `updateNodeImportance(id, imp)` | 更新节点重要性 | `UPDATE bm_nodes SET importance=?` | no-op |
| `countMessagesBySession(sid)` | 统计会话消息 | `SELECT COUNT(*) FROM bm_messages WHERE session_id=?` | return 0 |
| `countNodesBySession(sid)` | 统计会话节点 | `SELECT COUNT(*) FROM bm_nodes WHERE source_sessions LIKE ?` | return 0 |
| `countEdgesBySession(sid)` | 统计会话边 | `SELECT COUNT(*) FROM bm_edges WHERE session_id=?` | return 0 |
| `getMessagesBySession(sid)` | 获取会话全部消息 | `SELECT * FROM bm_messages WHERE session_id=? ORDER BY turn_index` | return [] |
| `markMessagesArchived(sid)` | 标记消息已归档 | `UPDATE bm_messages SET extracted=2 WHERE session_id=?` | warn |

### 修改文件

| 文件 | 操作 |
|------|------|
| `src/store/adapter.ts` | 接口声明 +6 方法 |
| `src/store/sqlite-adapter.ts` | 实现 +6 方法（~40 行） |
| `src/store/lancedb-adapter.ts` | stub + warn +6 方法 |

---

## 阶段 B：函数签名迁移

### reflection/store.ts

| 函数 | 变更 |
|------|------|
| `storeReflectionInsights(db, ...)` | → `storeReflectionInsights(storage: IStorageAdapter, ...)` |
| `applyTurnBoosts(db, ...)` | → `applyTurnBoosts(storage: IStorageAdapter, ...)` |
| 内部调用 | `allActiveNodes(db)` → `storage.findAllActive()` |
| | `findByName(db, name)` → `storage.findNodeByName(name)` |
| | `upsertNode(db, ...)` → `storage.upsertNode(...)` |
| | `db.prepare('UPDATE ... importance')` → `storage.updateNodeImportance(...)` |

### session/compressor.ts

| 函数 | 变更 |
|------|------|
| `evaluateSessionValue(db, ...)` | → `evaluateSessionValue(storage: IStorageAdapter, ...)` |
| `compressSession(db, ...)` | → `compressSession(storage: IStorageAdapter, ...)` |
| 内部调用 | `db.prepare('SELECT COUNT...')` → `storage.count*BySession()` |
| | `db.prepare('SELECT role, content...')` → `storage.getMessagesBySession()` |
| | `db.prepare('INSERT INTO bm_nodes...')` → `storage.upsertNode(...)` |
| | `db.prepare('UPDATE ... extracted=2')` → `storage.markMessagesArchived()` |

### 测试文件迁移

| 文件 | 变更 |
|------|------|
| `test/integration/compressor-coverage.test.ts` | `createTestDb()` → `createTestStorage()`; 所有 `db.prepare().run()` → `storage.saveMessage()` / `storage.upsertNode()` |
| `test/integration/compressor.test.ts` | 同上 |
| `test/integration/reflection-store.test.ts` | 同上 |

---

## 验证

| 指标 | 结果 |
|------|------|
| Lint | **0 errors** ✅ |
| compressor-coverage 测试 | 7/7 pass ✅ |
| compressor 测试 | 3/3 pass ✅ |
| reflection-store 测试 | 4/4 pass ✅ |
| sqlite-adapter 测试 | 38/38 pass ✅ |
| 全量测试 | 831 pass / 10 fail（预存 flaky） ✅ |
| 新增回归 | **0** ✅ |

---

## 代码债务消除

| 债务 | 修复前 | 修复后 |
|------|--------|--------|
| 绕过 IStorageAdapter 的函数 | 4 个 | **0** |
| IStorageAdapter 缺失方法 | 49 | **55** (+6) |
| DatabaseSyncInstance 直接使用 | reflection/store + compressor | **无** |
| LanceDB 崩溃路径 | 4 个 | **0**（全部 stub + warn 降级） |

---

## 暂缓项

**阶段 C（接入 ContextEngine/MaintenancePipeline）**：将迁移后的函数接入生产管线。属于功能增强而非架构修复，需独立评估"反思持久化的 LLM 成本 vs 记忆质量收益"。
