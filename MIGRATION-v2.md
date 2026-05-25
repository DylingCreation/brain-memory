# brain-memory v1.x → v2.0.0 迁移指南

> 版本: v2.0.0 | 日期: 2026-05-25

v2.0.0 是 breaking 大版本，核心变化是 Scope 从三层升级到六层。本指南涵盖所有迁移要点。

---

## 一、Scope: 三层 → 六层

```
v1.x                              v2.0.0
────                              ──────
session / agent / workspace       platform / workspace / agent / user / chat / thread
```

| v1 字段 | v2 字段 | 映射 |
|---------|---------|------|
| `scopeSession` | `scopeChat` | session → chat（自动迁移） |
| `scopeAgent` | `scopeAgent` | 保持不变 |
| `scopeWorkspace` | `scopeWorkspace` | 保持不变 |
| — | `scopePlatform` | 新字段（discord / telegram / webchat / ...） |
| — | `scopeUser` | 新字段（消息发送者 ID） |
| — | `scopeThread` | 新字段（子话题/线程 ID） |
| — | `scopeId` | 新字段（sha256 哈希，快速匹配） |

### 对用户的影响

- **数据库自动迁移** — 首次启动 v2.0.0 时自动执行，幂等，无需手动操作
- **旧 scope 字段保留** — `scopeSession` 等字段仍存在于 `BmNode` 中，标记 `@deprecated`
- **兼容适配器** — `adaptScopeV1toV2()` / `adaptScopeV2toV1()` 可用于新旧 API 互转
- **召回行为变化** — 现在按 platform + user + chat 维度精确隔离，不会再"串台"

### 前缀匹配语义

v2.0.0 使用前缀匹配：父 scope 可见子 scope。

```
chat 级别查询 → 可以看到 thread 级别的记忆 ✅
platform 级别查询 → 可以看到该 platform 下所有记忆 ✅
跨 platform 查询 → 需要显式 allowCrossScope ❌
```

---

## 二、配置变化

### configSchema 补全

v2.0.0 的 `openclaw.plugin.json` configSchema 已 100% 对齐 `DEFAULT_CONFIG`。新增字段：

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `mode` | `"full"` | 运行模式: full / lite / small |
| `llm.maxTokens` | 4096 | LLM 最大输出 token 数 |
| `recallCacheSize` | 100 | 召回缓存容量 |
| `recallCacheTtlMs` | 300000 | 缓存 TTL（5 分钟） |
| `memoryInjection.*` | 4 个子字段 | 记忆注入格式配置 |
| `memorySharing.*` | 4 个子字段 | 多 Agent 记忆共享 |

### 不再需要的字段

| 字段 | 说明 |
|------|------|
| 无 | 所有 v1 配置项继续有效 |

---

## 三、API 变化

### 类型变更

| v1 类型 | v2 类型 | 说明 |
|---------|---------|------|
| `MemoryScope` | `MemoryScopeV2` | 三层 → 六层 |
| `ScopeFilter` | `ScopeFilterV2` | 对应升级 |
| `BmNode.scopeSession` | `BmNode.scopeChat` + 新增 6 字段 | deprecated 但保留 |
| — | `MemoryExport` | 新增：记忆导出格式 |
| — | `ExportOptions` | 新增：导出过滤选项 |

### 新增 API

| 方法 | 说明 |
|------|------|
| `engine.export(options?)` | 导出记忆为 JSON |
| `engine.import(data)` | 从 JSON 导入记忆 |
| `engine.setSearchIndex(idx)` | 设置 LanceDB 伴随语义索引 |
| `engine.getStorage()` | 获取底层 IStorageAdapter |

### 废弃 API

| 方法 | 替代 |
|------|------|
| `engine.getDb()` | 已删除。用 `engine.getStorage()` 替代 |

---

## 四、数据库迁移

### 自动执行

首次启动 v2.0.0 时，`migrate.ts` 会自动执行以下操作：

```sql
-- 1. 新增五列
ALTER TABLE bm_nodes ADD COLUMN scope_platform TEXT;
ALTER TABLE bm_nodes ADD COLUMN scope_user TEXT;
ALTER TABLE bm_nodes ADD COLUMN scope_chat TEXT;
ALTER TABLE bm_nodes ADD COLUMN scope_thread TEXT;
ALTER TABLE bm_nodes ADD COLUMN scope_id TEXT;

-- 2. 旧数据映射
UPDATE bm_nodes SET scope_chat = scope_session
  WHERE scope_chat IS NULL AND scope_session IS NOT NULL;

-- 3. 生成 scope_id
UPDATE bm_nodes SET scope_id = hex(substr(sha256(...), 1, 8));

-- 4. 创建索引
CREATE INDEX idx_nodes_scope_platform ON bm_nodes(scope_platform);
CREATE INDEX idx_nodes_scope_chat ON bm_nodes(scope_chat);
```

### 特性

- **幂等** — 重复执行不报错
- **非破坏** — 旧列保留，不删除数据
- **可回滚** — 通过 `scope_chat → scope_session` 逆向映射

---

## 五、回滚方案

如需回退到 v1.x：

1. **数据**：`scope_chat` 字段已从 `scope_session` 迁移。v1.x 仍可读取 `scope_session`（该列未被删除）
2. **API**：使用 `adaptScopeV2toV1()` 将六层 scope 压缩回三层
3. **配置**：v1 配置完全兼容，无需修改
4. **新功能**：`export()` 导出的 JSON 可在 v1.x 中通过手动脚本导入

---

## 六、性能说明

| 维度 | v1.x | v2.0.0 |
|------|------|--------|
| 召回 | 双路径（精确+泛化） | 四路径（+语义+外部） |
| 存储 | SQLite 单引擎 | SQLite(真值) + LanceDB(索引) |
| 管线 | 大函数 | 可组合管线 |
| Scope 匹配 | 三层 AND | scope_id 单列索引 O(log n) |
| 类型安全 | strict:false | strict:true |

---

*迁移有疑问？查看完整提案: `docs/proposals/scope-upgrade-v2.md`*
