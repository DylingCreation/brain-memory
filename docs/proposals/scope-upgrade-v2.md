# brain-memory Scope 升级方案 v2.0

> 版本: v1.0-draft | 日期: 2026-05-24 | 作者: brain-memory contributors
> 
> 目标：将 scope 隔离从三层扩展到六层，解决记忆"串台"问题；
> 同期将 LanceDB 从 POC 提升为可独立运行的 MVP。

---

## 目录

1. [问题定义](#1-问题定义)
2. [Scope 模型设计](#2-scope-模型设计)
3. [Schema 迁移](#3-schema-迁移)
4. [匹配算法](#4-匹配算法)
5. [API 层变更](#5-api-层变更)
6. [LanceDB POC → MVP](#6-lancedb-poc--mvp)
7. [迁移计划与回滚](#7-迁移计划与回滚)
8. [测试策略](#8-测试策略)
9. [风险与影响评估](#9-风险与影响评估)

---

## 1. 问题定义

### 1.1 现状

当前 brain-memory v1.6.2 的 scope 模型只有三层：

```
MemoryScope {
  sessionId?:   string;   // 会话 ID
  agentId?:     string;   // Agent ID
  workspaceId?: string;   // 工作空间路径
}
```

这三层无法区分以下场景：
- **跨平台串台**：同一个 Agent 在 QQ 群和 Discord 服务器里的记忆会互串
- **跨用户串台**：群聊里不同用户的对话被混在一起召回
- **跨话题串台**：同一个群里不同话题的记忆互相污染
- **跨线程串台**：子话题/引用线程里的记忆溢出到主话题

### 1.2 目标

将 scope 扩展为**六层**，实现精确的作用域隔离：

```
platform    → 平台标识（discord / telegram / qqbot / webchat / slack / ...）
workspace   → 工作空间路径
agent       → Agent 标识
user        → 用户/对话者标识
chat        → 会话/频道/群组标识
thread      → 子话题/线程标识（可选，最细粒度）
```

**核心原则**：
- 一个记忆只属于创建它的 scope
- 只有 scope 匹配的记忆才能被召回
- 子 scope 继承父 scope 的可见性（chat 可见于 thread 查询）

---

## 2. Scope 模型设计

### 2.1 六层定义

```typescript
/**
 * v2.0 六层 MemoryScope。
 * 每一层可选；NULL = "未限定"，匹配任意值。
 */
export interface MemoryScopeV2 {
  /** 平台标识：discord | telegram | qqbot | webchat | slack | signal | ... */
  platform?: string | null;

  /** 工作空间路径 */
  workspace?: string | null;

  /** Agent 标识符 */
  agent?: string | null;

  /** 用户/对话者标识符 */
  user?: string | null;

  /** 会话/频道/群组标识符 */
  chat?: string | null;

  /** 子话题/线程标识符（最细粒度） */
  thread?: string | null;
}
```

### 2.2 scope_id（快速等值匹配）

```typescript
import { createHash } from 'crypto';

/**
 * 根据六层 scope 生成唯一 scope_id。
 * 排序键确保 platform|workspace|agent|user|chat|thread → 确定性 hash
 */
export function computeScopeId(scope: MemoryScopeV2): string {
  const parts = [
    scope.platform ?? '*',
    scope.workspace ?? '*',
    scope.agent ?? '*',
    scope.user ?? '*',
    scope.chat ?? '*',
    scope.thread ?? '*',
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);
}
```

**为什么同时保留独立字段和 scope_id？**

| 用途 | 字段 |
|------|------|
| 按维度过滤（"所有 platform=qqbot 的记忆"） | `scope_platform`, `scope_agent`, ... |
| 精确 scope 匹配（"scope 完全等于 X 的记忆"） | `scope_id`（单列 hash，索引极快） |
| 前缀匹配（"chat 可见于 thread"） | 六层独立字段 + SQL AND 组合 |

### 2.3 层级前缀匹配语义

```
实际记忆 scope:  { platform:'qqbot', agent:'main', user:'u1', chat:'c1', thread:'t1' }

查询 scope A:    { platform:'qqbot', agent:'main', user:'u1', chat:'c1' }
  → 查询 scope 是实际记忆 scope 的前缀（缺少 thread 层）
  → ✅ 匹配！chat 级别的查询可以看到 thread 级别的记忆

查询 scope B:    { platform:'qqbot', agent:'main', user:'u1', chat:'c2' }
  → chat 不同
  → ❌ 不匹配

查询 scope C:    { platform:'qqbot', agent:'main', user:'u1', chat:'c1', thread:'t2' }
  → thread 不同
  → ❌ 不匹配（thread 层要求精确匹配）

查询 scope D:    { platform:'discord', agent:'main' }
  → platform 不同
  → ❌ 不匹配
```

**核心规则**：
1. 从 platform → thread，逐层比较
2. 查询 scope 中非空的层，记忆 scope 必须匹配（或为 NULL）
3. 记忆 scope 中有而查询 scope 中没有的层 → 视为"记忆更精细，查询可覆盖"→ 放行
4. **唯一例外**：thread 层。如果记忆有 thread 而查询无 thread → 仍然放行（thread 是最精细层，父级自然可见）

### 2.4 NULL 语义

```
记忆 scope_chat = NULL
  → 这条记忆没有限定 chat，任何 chat 查询都能看到它
  → 用于"全局记忆"（如通用技能、平台级配置）

记忆 scope_thread = NULL
  → 这条记忆没有限定 thread，任何 thread 查询都能看到它
  → 大多数记忆都应该是这个状态
```

---

## 3. Schema 迁移

### 3.1 目标 Schema

```sql
-- 升级 bm_nodes 表：新增 scope 六层字段
ALTER TABLE bm_nodes ADD COLUMN scope_platform  TEXT;
ALTER TABLE bm_nodes ADD COLUMN scope_user      TEXT;
ALTER TABLE bm_nodes ADD COLUMN scope_chat      TEXT;
ALTER TABLE bm_nodes ADD COLUMN scope_thread    TEXT;
ALTER TABLE bm_nodes ADD COLUMN scope_id        TEXT;

-- 重映射旧字段：
-- scope_session   → 语义上等于 scope_chat（旧版"会话"就是新版"聊天"）
-- scope_agent     → 保持不变
-- scope_workspace → 保持不变
-- 新增字段默认为 NULL

-- 索引
CREATE INDEX IF NOT EXISTS idx_nodes_scope_id        ON bm_nodes(scope_id);
CREATE INDEX IF NOT EXISTS idx_nodes_scope_platform   ON bm_nodes(scope_platform);
CREATE INDEX IF NOT EXISTS idx_nodes_scope_chat       ON bm_nodes(scope_chat);
CREATE INDEX IF NOT EXISTS idx_nodes_scope_user       ON bm_nodes(scope_user);
CREATE INDEX IF NOT EXISTS idx_nodes_scope_agent      ON bm_nodes(scope_agent);
```

### 3.2 迁移脚本设计

**原则**：
- 幂等（可重复执行）
- 非破坏（旧数据不丢）
- 可回滚（备份旧 schema）

```typescript
// src/store/migrate.ts 中新增 v2 迁移

const MIGRATION_V2_SCOPE = {
  version: 2,
  name: 'v2-scope-upgrade',
  
  up(db: DatabaseSyncInstance): void {
    // 1. 新增六层字段（IF NOT EXISTS 风格——SQLite 不支持，用 try-catch）
    const newColumns = [
      'scope_platform TEXT',
      'scope_user TEXT',
      'scope_chat TEXT',
      'scope_thread TEXT',
      'scope_id TEXT',
    ];
    for (const col of newColumns) {
      try { db.exec(`ALTER TABLE bm_nodes ADD COLUMN ${col}`); } catch { /* 已存在 */ }
    }

    // 2. 从旧字段迁移数据
    // scope_session → scope_chat
    db.exec(`UPDATE bm_nodes SET scope_chat = scope_session WHERE scope_chat IS NULL AND scope_session IS NOT NULL`);

    // 3. 为已有数据计算 scope_id
    // 使用简单的拼接（SQLite 内完成，避免回表）
    db.exec(`
      UPDATE bm_nodes SET scope_id = hex(substr(
        sha256(
          COALESCE(scope_platform,'*') || '|' ||
          COALESCE(scope_workspace,'*') || '|' ||
          COALESCE(scope_agent,'*') || '|' ||
          COALESCE(scope_user,'*') || '|' ||
          COALESCE(scope_chat,'*') || '|' ||
          COALESCE(scope_thread,'*')
        ), 1, 8
      ))
      WHERE scope_id IS NULL
    `);

    // 4. 建索引
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_nodes_scope_id ON bm_nodes(scope_id)',
      'CREATE INDEX IF NOT EXISTS idx_nodes_scope_platform ON bm_nodes(scope_platform)',
      'CREATE INDEX IF NOT EXISTS idx_nodes_scope_chat ON bm_nodes(scope_chat)',
      'CREATE INDEX IF NOT EXISTS idx_nodes_scope_user ON bm_nodes(scope_user)',
    ];
    for (const idx of indexes) db.exec(idx);
  },

  down(db: DatabaseSyncInstance): void {
    // 回滚：scope_chat → scope_session 逆向映射
    db.exec(`UPDATE bm_nodes SET scope_session = scope_chat WHERE scope_session IS NULL AND scope_chat IS NOT NULL`);
    // 注意：SQLite 不支持 DROP COLUMN（3.35.0+ 才支持），旧字段不删除，保留
  },
};
```

### 3.3 BmNode 类型变更

```typescript
export interface BmNode {
  // ... 现有字段 ...
  
  // v1.x 旧字段（保留兼容，标记 @deprecated）
  /** @deprecated v2.0: 使用 scope_chat 替代 */
  scopeSession: string | null;
  
  // v2.0 新六层 scope
  scopePlatform: string | null;
  scopeWorkspace: string | null;  // 从旧 scope_workspace 重命名
  scopeAgent: string | null;      // 从旧 scope_agent 重命名
  scopeUser: string | null;
  scopeChat: string | null;       // 从旧 scope_session 语义映射
  scopeThread: string | null;
  scopeId: string | null;
}
```

---

## 4. 匹配算法

### 4.1 核心函数

```typescript
// src/scope/isolation.ts

/**
 * v2.0：判断查询 scope 是否匹配记忆 scope。
 *
 * 规则：查询 scope 是记忆 scope 的前缀 → 匹配。
 * thread 层特殊处理：记忆有 thread 但查询无 thread → 仍然放行。
 */
export function scopeMatchV2(memoryScope: MemoryScopeV2, queryScope: MemoryScopeV2): boolean {
  // 逐层比较：查询中非空的层，记忆必须匹配（或记忆该层为 NULL）
  if (queryScope.platform && memoryScope.platform && queryScope.platform !== memoryScope.platform) return false;
  if (queryScope.workspace && memoryScope.workspace && queryScope.workspace !== memoryScope.workspace) return false;
  if (queryScope.agent && memoryScope.agent && queryScope.agent !== memoryScope.agent) return false;
  if (queryScope.user && memoryScope.user && queryScope.user !== memoryScope.user) return false;
  if (queryScope.chat && memoryScope.chat && queryScope.chat !== memoryScope.chat) return false;
  
  // thread 层特殊处理：查询无 thread → 放行（父可见子）
  // 查询有 thread → 必须精确匹配（或记忆为 NULL）
  if (queryScope.thread && memoryScope.thread && queryScope.thread !== memoryScope.thread) return false;
  
  return true;
}
```

### 4.2 SQL WHERE 生成

```typescript
/**
 * v2.0：生成参数化 SQL WHERE 子句。
 * 
 * 对于 includeScopes，生成 OR 连接的匹配条件。
 * 每个 includeScope 产生一条 (scope_platform = ? OR scope_platform IS NULL) AND ... 链。
 */
export function buildScopeFilterClauseV2(filter: ScopeFilterV2): { clause: string; params: (string | null)[] } {
  const conditions: string[] = [];
  const params: (string | null)[] = [];

  // — Include scopes —
  if (filter.includeScopes.length > 0) {
    const includeGroups = filter.includeScopes.map(s => {
      const parts: string[] = [];
      if (s.platform)  { parts.push('(scope_platform = ? OR scope_platform IS NULL)'); params.push(s.platform); }
      if (s.workspace) { parts.push('(scope_workspace = ? OR scope_workspace IS NULL)'); params.push(s.workspace); }
      if (s.agent)     { parts.push('(scope_agent = ? OR scope_agent IS NULL)'); params.push(s.agent); }
      if (s.user)      { parts.push('(scope_user = ? OR scope_user IS NULL)'); params.push(s.user); }
      if (s.chat)      { parts.push('(scope_chat = ? OR scope_chat IS NULL)'); params.push(s.chat); }
      if (s.thread)    { parts.push('(scope_thread = ? OR scope_thread IS NULL)'); params.push(s.thread); }
      return parts.length > 0 ? `(${parts.join(' AND ')})` : '1=1';
    });
    conditions.push(`(${includeGroups.join(' OR ')})`);
  }

  // — Exclude scopes —
  if (filter.excludeScopes.length > 0) {
    const excludeGroups = filter.excludeScopes.map(s => {
      const parts: string[] = [];
      if (s.platform)  { parts.push('(scope_platform != ? OR scope_platform IS NULL)'); params.push(s.platform); }
      if (s.workspace) { parts.push('(scope_workspace != ? OR scope_workspace IS NULL)'); params.push(s.workspace); }
      if (s.agent)     { parts.push('(scope_agent != ? OR scope_agent IS NULL)'); params.push(s.agent); }
      if (s.user)      { parts.push('(scope_user != ? OR scope_user IS NULL)'); params.push(s.user); }
      if (s.chat)      { parts.push('(scope_chat != ? OR scope_chat IS NULL)'); params.push(s.chat); }
      if (s.thread)    { parts.push('(scope_thread != ? OR scope_thread IS NULL)'); params.push(s.thread); }
      return parts.length > 0 ? `(${parts.join(' OR ')})` : '1=1';
    });
    conditions.push(excludeGroups.join(' AND '));
  }

  // — Cross-scope sharing (移植 v1.0 B-2) —
  if (filter.allowCrossScope && filter.sharingMode && filter.sharingMode !== 'isolated') {
    if (filter.sharingMode === 'shared') {
      // 完全共享：不追加额外限制
    } else if (filter.sharingMode === 'mixed' && filter.sharedCategories?.length) {
      const ph = filter.sharedCategories.map(() => '?').join(', ');
      filter.sharedCategories.forEach(c => params.push(c));
      conditions.push(`(category IN (${ph}))`);
    }
  }

  if (conditions.length === 0) return { clause: '', params: [] };
  return { clause: ` AND ${conditions.join(' AND ')}`, params };
}
```

### 4.3 简化版 scope_id 快速匹配

对于"精确查询某一完整 scope"的场景（最常用），直接用 scope_id：

```sql
-- 快速路径：两个 scope 完全一致
SELECT * FROM bm_nodes WHERE scope_id = ? AND status = 'active'
```

这比六层 AND 快得多——单列索引 O(log n)。

---

## 5. API 层变更

### 5.1 类型变更汇总

| 类型 | 变更 |
|------|------|
| `MemoryScope` → `MemoryScopeV2` | 三层 → 六层 |
| `ScopeFilter` → `ScopeFilterV2` | 对应升级 |
| `BmNode` | 新增 6 个 scope 字段 + scopeId |
| `NodeUpsertInput` | 新增 scope 六层参数 |
| `StorageFilter` | 对应升级 |
| `BmConfig` | 无变更（scope 是运行时行为，非配置项） |

### 5.2 向后兼容适配器

```typescript
/**
 * 将旧版三层 MemoryScope 适配为新版六层。
 * 缺失字段 → NULL。
 */
export function adaptScopeV1toV2(v1: MemoryScope): MemoryScopeV2 {
  return {
    platform: null,                        // 旧数据无 platform
    workspace: v1.workspaceId ?? null,
    agent: v1.agentId ?? null,
    user: null,                            // 旧数据无 user
    chat: v1.sessionId ?? null,            // session → chat
    thread: null,                          // 旧数据无 thread
  };
}

/**
 * 将新版六层压缩回旧版三层（用于向下兼容的 API 调用）。
 */
export function adaptScopeV2toV1(v2: MemoryScopeV2): MemoryScope {
  return {
    sessionId: v2.chat ?? undefined,
    agentId: v2.agent ?? undefined,
    workspaceId: v2.workspace ?? undefined,
  };
}
```

### 5.3 OpenClaw 插件层适配

当前从 OpenClaw hook 收到的消息结构大致为：

```typescript
interface Message {
  sessionId: string;
  agentId?: string;
  workspaceId?: string;
  // v2.0 新增提取（从 channel metadata 中拿）
  platform?: string;   // 由 Gateway 注入
  userId?: string;      // 由 Gateway 注入
  chatId?: string;      // 由 Gateway 注入
  threadId?: string;    // 由 Gateway 注入（可选）
}
```

插件 `message_received` hook 中构建 scope：

```typescript
function buildScopeFromMessage(msg: Message): MemoryScopeV2 {
  return {
    platform: msg.platform ?? null,
    workspace: msg.workspaceId ?? null,
    agent: msg.agentId ?? null,
    user: msg.userId ?? null,
    chat: msg.chatId ?? msg.sessionId ?? null,
    thread: msg.threadId ?? null,
  };
}
```

> **依赖说明**：此功能需要 OpenClaw Gateway 在消息中注入 `platform`、`userId`、`chatId`、`threadId` 字段。
> 若 Gateway 尚未支持，brain-memory 使用 `sessionId` 作为 `chat` 的 fallback，其余字段留 NULL——功能降级但不崩溃。

---

## 6. LanceDB POC → MVP

### 6.1 当前状态审计

| 能力 | SQLiteStorageAdapter | LanceDBStorageAdapter | 差距 |
|------|---------------------|-----------------------|------|
| Node CRUD | ✅ 完整 | ❌ 内存 Map | **必须补** |
| Edge CRUD | ✅ 完整 | ❌ 内存 Map | 建议补 |
| 向量存储/搜索 | ✅ SQLite BLOB | ✅ LanceDB 真实表 | **已就绪** |
| FTS5 全文搜索 | ✅ | ❌ 无 | 可选 |
| graphWalk | ✅ 完整 | ❌ 内存 stub | 建议补 |
| loadGraphStructure | ✅ 完整 | ❌ 内存 stub | 建议补 |
| Communities | ✅ 完整 | ❌ 内存 Map | 可选 |
| Messages | ✅ 完整 | ❌ 内存 Map | 可选 |
| Stats | ✅ 完整 | ❌ 硬编码 0 | 必须补 |

**结论**：LanceDB adapter 当前**不可独立运行**——除了向量操作，所有 CRUD 都是假的。

### 6.2 MVP 目标

LanceDB MVP **不追求**取代 SQLite，而是成为一个**可独立工作的向量存储后端**：

| 优先级 | 能力 | 说明 |
|--------|------|------|
| P0 | Node CRUD 真实化 | upsertNode / findNodeById / findNodeByName / deprecateNode / findAllActive |
| P0 | 向量全链路 | saveVector / getVector / vectorSearch 已就绪，验证通过 |
| P0 | Stats 真实化 | getStats 返回实际数据 |
| P1 | Edge CRUD 真实化 | upsertEdge / findEdgesFrom / findEdgesTo |
| P1 | loadGraphStructure | 加载全量图结构（PageRank + Community 依赖） |
| P1 | graphWalk | 图遍历（召回依赖） |
| P2 | Communities | 社区摘要 CRUD |
| P2 | Messages | 消息历史 CRUD |

### 6.3 LanceDB Schema 设计

```typescript
// LanceDB bm_nodes 表 schema
const NODE_SCHEMA = {
  id:             'string',   // primary
  type:           'string',   // TASK | SKILL | EVENT
  category:       'string',   // 八类记忆
  name:           'string',
  description:    'string',
  content:        'string',
  status:         'string',   // active | deprecated
  validatedCount: 'int64',
  sourceSessions: 'string',   // JSON array
  communityId:    'string',
  pagerank:       'float64',
  importance:     'float64',
  accessCount:    'int64',
  lastAccessedAt: 'int64',
  temporalType:   'string',
  source:         'string',   // user | assistant | manual
  // v2.0 scope
  scopePlatform:  'string',
  scopeWorkspace: 'string',
  scopeAgent:     'string',
  scopeUser:      'string',
  scopeChat:      'string',
  scopeThread:    'string',
  scopeId:        'string',
  createdAt:      'int64',
  updatedAt:      'int64',
  // LanceDB 向量列（独立管理，不在此表）
};
```

### 6.4 双写模式（核心决策）

scope 升级后，引入**双写模式**作为新的默认存储架构：

```
用户选择 storage: 'sqlite'
  → SQLiteStorageAdapter（现状，完整功能）
  → LanceDB 仅用于向量搜索加速（伴随索引）

用户选择 storage: 'lancedb'
  → LanceDBStorageAdapter（MVP 目标，可独立运行）
  → 所有 CRUD 走 LanceDB，向量搜索原生支持
```

**暂不引入 HybridStorageAdapter**。双写模式通过 `ContextEngine` 层串联两个 adapter 实现，不新增接口抽象。

```typescript
// ContextEngine 中的双写逻辑
async function writeMemory(input: NodeUpsertInput, sessionId: string) {
  // 1. 主存储写入
  const result = await this.primaryStorage.upsertNode(input, sessionId);
  
  // 2. 如果配置了伴随向量索引，同步写向量
  if (this.vectorStorage && input.content) {
    const vec = await this.embedFn(input.content);
    await this.vectorStorage.saveVector(result.node.id, input.content, vec);
  }
  
  return result;
}
```

### 6.5 MVP 验收标准

| # | 标准 | 验证方式 |
|---|------|---------|
| 1 | `storage: 'lancedb'` 启动不报错 | 集成测试 |
| 2 | 100 条节点写入 + 查询 + 删除通过 | 集成测试 |
| 3 | 向量搜索返回正确结果（与 SQLite 交叉验证） | 对比测试 |
| 4 | PageRank + Community 计算通过（图算法依赖） | 单元测试 |
| 5 | 性能不退化于 SQLite（向量搜索更快，CRUD 可比） | 基准测试 |
| 6 | scope 六层字段正确存储和过滤 | 集成测试 |

---

## 7. 迁移计划与回滚

### 7.1 迁移阶段

```
Phase A: 代码变更（不部署）
├── A1: types.ts 新增 MemoryScopeV2 + BmNode 字段
├── A2: isolation.ts 重写匹配算法 + buildScopeFilterClauseV2
├── A3: store.ts / adapter.ts 支持新 scope 字段
├── A4: migrate.ts 新增 v2 迁移脚本
├── A5: 插件层适配（buildScopeFromMessage）
├── A6: 所有测试用例更新
└── A7: 代码审查

Phase B: 迁移执行（自动）
├── B1: 插件 init() 检测 schema version < 2
├── B2: 自动执行 MIGRATION_V2_SCOPE.up()
├── B3: 更新 schema_version = 2
└── B4: 日志记录迁移结果

Phase C: 验证（自动）
├── C1: 现有数据完整性检查（节点数不变）
├── C2: scope 字段不为空的记录验证
└── C3: 召回功能回归测试
```

### 7.2 回滚方案

```
紧急回滚（数据损坏）：
  1. 停止 Gateway
  2. 恢复 .bak 数据库文件
  3. 回退代码到 v1.6.x
  4. 重启 Gateway

温和回滚（功能降级）：
  1. 保持新 schema（列已加，不影响旧查询）
  2. 代码回退到 v1.6.x
  3. 旧代码忽略新列，正常运作
```

**关键保证**：迁移只加列不删列，旧代码可忽略新列继续运行。

---

## 8. 测试策略

### 8.1 单元测试

| 测试 | 覆盖内容 |
|------|---------|
| `scopeMatchV2` 全组合 | 六层 2^6 = 64 种 NULL/非NULL 组合的匹配矩阵 |
| `buildScopeFilterClauseV2` | SQL 生成正确性 + 参数顺序 |
| `computeScopeId` | 确定性（同输入→同输出）+ 碰撞检测 |
| `adaptScopeV1toV2` / `adaptScopeV2toV1` | 往返转换一致性 |

### 8.2 集成测试

| 测试 | 覆盖内容 |
|------|---------|
| scope 隔离召回 | chat_A 只能看到 chat_A 的记忆，看不到 chat_B |
| 前缀匹配 | chat 级查询能看到 thread 级记忆 |
| 跨平台隔离 | qqbot 看不到 discord 的记忆 |
| 旧数据兼容 | 迁移前数据（scope 字段 NULL）正常召回 |
| LanceDB MVP 基础 | 写入/读取/向量搜索/scope 过滤 |

### 8.3 回归测试

| 测试 | 覆盖内容 |
|------|---------|
| 全量 370 测试 | 零退化 |
| 召回质量 | 相同查询，迁移前后召回结果一致 |
| 性能基准 | 向量搜索 < 10ms，节点写入 < 5ms |

---

## 9. 风险与影响评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 迁移脚本执行失败 | 低 | 中 | 幂等设计 + try-catch + 预检 |
| 旧 scope 数据映射错误 | 中 | 中 | session→chat 映射 + 兼容适配器 |
| Gateway 元数据字段缺位 | 中 | 低 | NULL fallback + 功能降级 |
| 召回结果变少（scope 过滤过严） | 中 | 中 | NULL 默认通配 + 宽松前缀匹配 |
| LanceDB MVP CRUD bug | 中 | 中 | 交叉验证 + 灰度开关 |
| 性能退化 | 低 | 低 | 索引覆盖 + 基准测试前置 |

---

## 附录 A：文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/types.ts` | 修改 | 新增 MemoryScopeV2 / BmNode 加字段 |
| `src/scope/isolation.ts` | 重写 | scopeMatchV2 + buildScopeFilterClauseV2 + 适配器 |
| `src/store/store.ts` | 修改 | upsertNode/searchNodes/allActiveNodes 使用新 scope |
| `src/store/adapter.ts` | 修改 | NodeUpsertInput/StorageFilter 升级 |
| `src/store/db.ts` | 修改 | 新 SCHEMA + scope 索引 |
| `src/store/migrate.ts` | 修改 | 新增 v2 迁移 |
| `src/store/sqlite-adapter.ts` | 修改 | 适配新 scope 字段 |
| `src/store/lancedb-adapter.ts` | 重写 | POC → MVP Node CRUD + 新 scope |
| `src/recaller/recall.ts` | 修改 | 使用新 scope filter |
| `src/engine/context.ts` | 修改 | 传递六层 scope |
| `src/plugin/core.ts` | 修改 | buildScopeFromMessage |
| `openclaw-wrapper.ts` | 修改 | 从消息提取 scope |
| `test/` | 新增+修改 | scope 隔离测试 + LanceDB MVP 测试 |
