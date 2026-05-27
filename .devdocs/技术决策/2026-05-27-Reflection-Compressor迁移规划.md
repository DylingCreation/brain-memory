# Reflection/Compressor 迁移到 IStorageAdapter — 深度调研与执行规划

> **调研日期**: 2026-05-27  
> **调研人**: AI  
> **来源**: M5-P1-2, M3-架构-A2  
> **状态**: ⏳ 规划完成，待执行

---

## 一、架构全景

### 当前状态

```
ContextEngine.processTurn()
  ├── extractor.extract()           ✅ 知识提取
  ├── storage.upsertNode/upsertEdge  ✅ 持久化（通过 IStorageAdapter）
  ├── recaller.batchSyncEmbed()     ✅ 向量同步
  ├── reflectOnTurn() [extractor]   ✅ 轮次反思（LLM → 返回 TurnBoost[]）
  │     └── storeReflectionInsights  ❌ 未调用！insights 返回给调用者但从未持久化
  │     └── applyTurnBoosts         ❌ 未调用！
  └── updateWorkingMemory()         ✅ 工作记忆

ContextEngine.reflectOnSession()
  ├── reflectOnSession() [extractor] ✅ 会话反思（LLM → 返回 ReflectionInsight[]）
  │     └── storeReflectionInsights  ❌ 未调用！insights 返回给调用者但从未持久化
  └── 直接返回给调用者

MaintenancePipeline.run()
  ├── dedup                         ✅ 去重
  ├── pagerank                      ✅ PageRank
  ├── communityDetection            ✅ 社区检测
  └── runDecayArchiving [pipeline]  ✅ Weibull 衰减 → deprecateNode（节点级）
        └── evaluateSessionValue    ❌ 未调用！会话级评估从未触发
        └── compressSession         ❌ 未调用！会话压缩从未触发
```

**核心发现**：`reflection/store.ts` 和 `session/compressor.ts` 是两段"已实现但未接入"的代码。它们使用 `DatabaseSyncInstance` 直接操作 SQLite，绕过 `IStorageAdapter` 抽象层。这不仅违反架构设计，而且在 LanceDB 后端下会崩溃。

### 为什么它们未被接入？

推测的开发时序：
1. v1.0: `reflection/store.ts` + `session/compressor.ts` 基于 `DatabaseSyncInstance` 开发
2. v1.1.0 F-1: 引入 `IStorageAdapter` 抽象层，重构了 ContextEngine
3. 迁移时遗漏了这两个模块——它们依赖的 `DatabaseSyncInstance` API 与 `IStorageAdapter` 不兼容
4. 两个模块的部分功能通过 `extractor.ts` 中的独立实现被替代，但持久化链路断裂

### 两套并行的实现

| 功能域 | extractor.ts（已接入） | store.ts（未接入） |
|--------|----------------------|-------------------|
| 轮次反思 | `reflectOnTurn()` — LLM 调用 | `storeReflectionInsights()` — 将 insights 持久化为图谱节点 |
| 轮次反思 | — | `applyTurnBoosts()` — 对已有节点做重要性加权 |

`extractor.ts` 负责 LLM 调用生成 insights，`store.ts` 负责持久化。两者是**上下游关系**，不是重复实现。

---

## 二、IStorageAdapter 接口缺口分析

### 迁移需要的新方法

#### 2.1 `updateNodeImportance(id: string, importance: number): void`

**需要者**: `reflection/store.ts` (3 处)
- `storeReflectionInsights`: 提升已有节点重要性 (`SET importance=?`)
- `storeReflectionInsights`: 为新节点设置初始重要性
- `applyTurnBoosts`: 应用轮次反射的重要性增量

**实现难度**: ⭐ 低 — SQLite 直接 `UPDATE bm_nodes SET importance=? WHERE id=?`

#### 2.2 `countMessagesBySession(sessionId: string): number`

**需要者**: `session/compressor.ts`
- `evaluateSessionValue`: 统计会话消息数 (`SELECT COUNT(*) FROM bm_messages WHERE session_id=?`)

**实现难度**: ⭐ 低 — 简单聚合查询

#### 2.3 `countNodesBySession(sessionId: string): number`

**需要者**: `session/compressor.ts`
- `evaluateSessionValue`: 统计会话产生的知识节点数 (`SELECT COUNT(*) FROM bm_nodes WHERE source_sessions LIKE ?`)

**实现难度**: ⭐ 低

#### 2.4 `countEdgesBySession(sessionId: string): number`

**需要者**: `session/compressor.ts`
- `evaluateSessionValue`: 统计会话产生的边数 (`SELECT COUNT(*) FROM bm_edges WHERE session_id=?`)

**实现难度**: ⭐ 低

#### 2.5 `getMessagesBySession(sessionId: string): MessageRow[]`

**需要者**: `session/compressor.ts`
- `compressSession`: 获取会话全部消息 (`SELECT role, content FROM bm_messages WHERE session_id=? ORDER BY turn_index`)
- 与现有 `getUnextractedMessages()` 不同：返回全部消息，不限于 extracted=0

**实现难度**: ⭐ 低 — 移除 extracted=0 过滤

#### 2.6 `markMessagesArchived(sessionId: string): void`

**需要者**: `session/compressor.ts`
- `compressSession`: 标记消息已归档 (`UPDATE bm_messages SET extracted=2 WHERE session_id=? AND extracted=1`)
- 与现有 `markMessagesExtracted()` 不同：设置为 extracted=2（归档）而非 extracted=1（已提取）

**实现难度**: ⭐ 低

### 方法汇总

| # | 新方法 | 需要者 | SQL 复杂度 | LanceDB stub |
|---|--------|--------|-----------|-------------|
| 1 | `updateNodeImportance` | reflection/store | UPDATE | warn |
| 2 | `countMessagesBySession` | compressor | SELECT COUNT | return 0 |
| 3 | `countNodesBySession` | compressor | SELECT COUNT LIKE | return 0 |
| 4 | `countEdgesBySession` | compressor | SELECT COUNT | return 0 |
| 5 | `getMessagesBySession` | compressor | SELECT | return [] |
| 6 | `markMessagesArchived` | compressor | UPDATE | warn |

---

## 三、函数迁移映射

### reflection/store.ts

| 原函数 | 原依赖 (DatabaseSyncInstance) | 新依赖 (IStorageAdapter) | 变更 |
|--------|------------------------------|--------------------------|------|
| `storeReflectionInsights` | `allActiveNodes(db)` | `storage.findAllActive()` | ✅ 已有 |
| | `findByName(db, name)` | `storage.findNodeByName(name)` | ✅ 已有 |
| | `upsertNode(db, input, sid)` | `storage.upsertNode(input, sid)` | ✅ 已有 |
| | `db.prepare('UPDATE ... importance')` | `storage.updateNodeImportance(id, imp)` | 🆕 新增 |
| `applyTurnBoosts` | `findByName(db, name)` | `storage.findNodeByName(name)` | ✅ 已有 |
| | `db.prepare('UPDATE ... importance')` | `storage.updateNodeImportance(id, imp)` | 🆕 新增 |
| `findRelatedNode` | — (纯函数，不依赖 DB) | — | ✅ 无需改 |

### session/compressor.ts

| 原函数 | 原依赖 (DatabaseSyncInstance) | 新依赖 (IStorageAdapter) | 变更 |
|--------|------------------------------|--------------------------|------|
| `evaluateSessionValue` | `db.prepare('SELECT COUNT ... messages')` | `storage.countMessagesBySession(sid)` | 🆕 |
| | `db.prepare('SELECT COUNT ... nodes')` | `storage.countNodesBySession(sid)` | 🆕 |
| | `db.prepare('SELECT COUNT ... edges')` | `storage.countEdgesBySession(sid)` | 🆕 |
| `compressSession` | `db.prepare('SELECT role, content ...')` | `storage.getMessagesBySession(sid)` | 🆕 |
| | `db.prepare('INSERT INTO bm_nodes ...')` | `storage.upsertNode(...)` | ✅ 已有 |
| | `db.prepare('UPDATE bm_messages SET extracted=2')` | `storage.markMessagesArchived(sid)` | 🆕 |

---

## 四、执行规划

### 阶段 A：IStorageAdapter 接口扩展（1-2h）

**A-1** 在 `src/store/adapter.ts` 中新增 6 个方法声明

**A-2** 在 `src/store/sqlite-adapter.ts` 中实现 6 个方法

**A-3** 在 `src/store/lancedb-adapter.ts` 中添加 6 个 stub + warn（全部返回空/0）

**A-4** 验证：sqlite-adapter 测试通过、lint 0 errors

### 阶段 B：函数签名迁移（2-3h）

**B-1** `reflection/store.ts`:
- 移除 `DatabaseSyncInstance` import
- `storeReflectionInsights(db, ...)` → `storeReflectionInsights(storage, ...)`
- `applyTurnBoosts(db, ...)` → `applyTurnBoosts(storage, ...)`
- 替换所有 `db.prepare(...)` 为 `storage.xxx(...)`

**B-2** `session/compressor.ts`:
- 移除 `DatabaseSyncInstance` import
- `evaluateSessionValue(db, ...)` → `evaluateSessionValue(storage, ...)`
- `compressSession(db, ...)` → `compressSession(storage, ...)`
- 替换所有 `db.prepare(...)` 为 `storage.xxx(...)`

**B-3** 更新测试文件：
- `test/integration/compressor-coverage.test.ts` — 从 `createTestDb()` → `createTestStorage()`
- `test/integration/compressor.test.ts` — 同上
- `test/integration/reflection-store.test.ts` — 同上

**B-4** 验证：compressor + reflection 测试通过

### 阶段 C：接入 ContextEngine（1-2h，可选）

**C-1** 在 `ContextEngine.processTurn()` 末尾接入 `storeReflectionInsights`

**C-2** 在 `ContextEngine.reflectOnSession()` 末尾接入 `storeReflectionInsights`

**C-3** 在 `MaintenancePipeline` 中接入 `evaluateSessionValue` + `compressSession`

**⚠️ 阶段 C 需单独评估**：接入会改变运行时行为（持久化新的图谱节点、触发 LLM 压缩调用），需要集成测试验证。

---

## 五、风险评估

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| 接口签名变更破坏调用者 | 🟡 中 | 阶段 A 新增方法，不修改现有方法 |
| LanceDB stub 返回空导致功能静默失效 | 🟢 低 | 6 个新 stub 全部添加 warn 日志 |
| 压缩测试从 createTestDb 迁移到 createTestStorage | 🟡 中 | createTestStorage 返回 SQLiteStorageAdapter，底层仍是 SQLite，行为不变 |
| 阶段 C 接入改变运行时行为 | 🔴 高 | 阶段 C 独立评估，不纳入本次执行 |

---

## 六、决策建议

**建议执行阶段 A + B**（3-5 小时），暂缓阶段 C。

理由：
1. 阶段 A+B 完成架构修复的核心目标：消除 `DatabaseSyncInstance` 绕过 `IStorageAdapter` 的抽象泄漏
2. 迁移后代码可在 LanceDB 后端下安全运行（stub + warn 降级）
3. 阶段 C（接入主线）是功能增强而非架构修复，应在独立迭代中评估
4. 阶段 C 需要回答"反思持久化对记忆质量的实际影响"这一产品问题，不应与技术债务清理捆绑

是否批准此执行规划？如批准，将按 A→B 顺序执行，完成后汇报。
