# Security Guide

> brain-memory 安全特性和最佳实践文档。

---

## 安全架构

brain-memory 采用多层防御设计：

| 层级 | 机制 | 实现位置 |
|------|------|---------|
| **数据库层** | 参数化 SQL 查询（防注入） | [src/store/store.ts](../src/store/store.ts) |
| **数据隔离层** | 多范围隔离（session / agent / workspace） | [src/scope/isolation.ts](../src/scope/isolation.ts) |
| **输入验证层** | 节点类型 / 边类型 / 记忆分类严格校验 | [src/extractor/extract.ts](../src/extractor/extract.ts) |
| **安全过滤层** | Prompt Injection 防护（6 类规则） | [src/reflection/extractor.ts](../src/reflection/extractor.ts) |
| **外部通信层** | HTTPS API 调用 | [src/engine/llm.ts](../src/engine/llm.ts) |

---

## 参数化 SQL 查询（防 SQL 注入）

所有数据库操作使用 `?` 占位符，不使用字符串拼接。

**安全示例（源码）：**

```typescript
// src/store/store.ts — 安全：参数化查询
db.prepare("SELECT * FROM bm_nodes WHERE name = ?").get(normalizeName(name));
```

**危险示例（绝对不要这样做）：**

```typescript
// ❌ 危险：字符串拼接
db.prepare(`SELECT * FROM bm_nodes WHERE name = '${name}'`).get();
```

### 参数化查询覆盖范围

| 操作 | 参数化 | 源码位置 |
|------|:---:|---------|
| 节点查询（`findByName` / `findById`） | ✅ | store.ts |
| 节点插入 / 更新（`upsertNode`） | ✅ | store.ts |
| 边插入 / 更新（`upsertEdge`） | ✅ | store.ts |
| FTS5 全文检索（`searchNodes`） | ✅ | store.ts |
| 向量检索（`vectorSearchWithScore`） | ✅ | store.ts |
| 图遍历（`graphWalk`） | ✅ | store.ts |
| 范围过滤（`buildScopeFilterClause`） | ✅ | scope/isolation.ts |

---

## 多范围隔离

brain-memory 支持三级数据隔离：

```typescript
interface MemoryScope {
  sessionId?: string;      // 会话级隔离
  agentId?: string;        // Agent 级隔离
  workspaceId?: string;    // 工作空间级隔离
}
```

**实现位置：** [src/scope/isolation.ts](../src/scope/isolation.ts)

### 隔离规则

| 规则 | 说明 |
|------|------|
| **匹配逻辑** | 所有非 null 字段必须相等，null 字段表示"任意"（通配符） |
| **包含过滤（includeScopes）** | 多个 scope 之间是 OR 关系，任一匹配即可 |
| **排除过滤（excludeScopes）** | 多个 scope 之间是 AND 关系，必须全部排除 |
| **跨范围检索** | 通过 `allowCrossScope` 控制是否允许跨范围检索 |

### 数据库字段

节点表包含三个隔离字段：

| 字段 | 说明 |
|------|------|
| `scope_session` | 会话范围 |
| `scope_agent` | Agent 范围 |
| `scope_workspace` | 工作空间范围 |

### 查询构建

范围过滤通过参数化查询构建，防止 SQL 注入：

```typescript
// src/scope/isolation.ts — buildScopeFilterClause 返回 { clause, params }
const { clause, params } = buildScopeFilterClause(scopeFilter);
db.prepare(`SELECT * FROM bm_nodes WHERE status='active'${clause}`).all(...params);
```

---

## Prompt Injection 防护

brain-memory 在反思系统中实现了 6 类 Prompt Injection 防护规则。

**实现位置：** [src/reflection/extractor.ts](../src/reflection/extractor.ts) — `sanitizeReflectionText()` 函数

### 6 类防护规则

| 规则 | 匹配模式 | 防护目标 |
|------|---------|---------|
| **1. 忽略指令** | `ignore/disregard/forget/override/bypass previous instructions` | 防止攻击者要求忽略之前的系统指令 |
| **2. 泄露密钥** | `reveal/print/dump/show system prompt / api keys / secrets` | 防止攻击者要求泄露系统提示或 API 密钥 |
| **3. 角色切换** | `you are now / act as / pretend to be developer/admin/root/god` | 防止攻击者要求切换角色权限 |
| **4. HTML 注入** | `<system> / <developer> / <inherited-rules>` 等标签 | 防止攻击者通过 HTML 标签注入指令 |
| **5. 角色前缀** | `system: / assistant: / user: / developer: / tool:` 行首前缀 | 防止攻击者伪造角色身份 |
| **6. 禁用安全** | `disable/turn off/skip/bypass safety/security/filter` | 防止攻击者要求关闭安全防护 |

### 过滤行为

```typescript
export function sanitizeReflectionText(text: string, enabled: boolean): string {
  if (!enabled) return text;  // 关闭时直接返回

  // 清理 markdown 格式
  const trimmed = text.trim()
    .replace(/\*\*/g, "")
    .replace(/^\s*[-*]\s*/, "");

  // 6 类规则检测 — 命中任何一条返回空字符串
  for (const pattern of UNSAFE_PATTERNS) {
    if (pattern.test(trimmed)) return "";
  }

  // 过滤空内容/占位符
  const normalized = trimmed.toLowerCase().trim();
  if (!normalized || normalized.length < 4) return "";
  if (/^(none|n\/a|no|not\s+applicable|unknown|\(empty\))$/i.test(normalized)) return "";

  return trimmed;
}
```

**防护触发条件：**

| 条件 | 行为 |
|------|------|
| 命中 6 类规则之一 | 返回空字符串 `""`（不存储该反思） |
| 内容为空或 <4 字符 | 返回空字符串 |
| 内容为占位符（none/n/a 等） | 返回空字符串 |
| 通过所有检查 | 返回清理后的文本 |

---

## 输入验证

### 节点类型校验

提取结果中的节点类型严格限制为 3 种：

```typescript
// src/extractor/extract.ts
const VALID_NODE_TYPES = new Set(["TASK", "SKILL", "EVENT"]);
```

### 边类型校验

边类型严格限制为 5 种：

```typescript
const VALID_EDGE_TYPES = new Set([
  "USED_SKILL", "SOLVED_BY", "REQUIRES", "PATCHES", "CONFLICTS_WITH"
]);
```

### 边方向约束

每种边类型的 from/to 节点类型受到严格约束：

```typescript
const EDGE_FROM_CONSTRAINT: Record<EdgeType, Set<GraphNodeType>> = {
  USED_SKILL:     new Set(["TASK"]),
  SOLVED_BY:      new Set(["EVENT", "SKILL"]),
  REQUIRES:       new Set(["SKILL"]),
  PATCHES:        new Set(["SKILL"]),
  CONFLICTS_WITH: new Set(["SKILL"]),
};

const EDGE_TO_CONSTRAINT: Record<EdgeType, Set<GraphNodeType>> = {
  USED_SKILL:     new Set(["SKILL"]),
  SOLVED_BY:      new Set(["SKILL"]),
  REQUIRES:       new Set(["SKILL"]),
  PATCHES:        new Set(["SKILL"]),
  CONFLICTS_WITH: new Set(["SKILL"]),
};
```

**校验行为：** 不符合约束的边在解析时被直接丢弃（返回 null）。

### 记忆分类校验

```typescript
const VALID_CATEGORIES = new Set([
  "profile", "preferences", "entities", "events",
  "tasks", "skills", "cases", "patterns"
]);
```

### 名称标准化

节点名称通过 `normalizeName()` 标准化，防止恶意命名：

```typescript
export function normalizeName(name: string): string {
  const normalized = name.trim().toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fff\-]/g, "")  // 仅保留字母、数字、中文、连字符
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
  if (!normalized) return "unnamed";  // 防止空名称
  return normalized;
}
```

---

## XML 转义

上下文组装时对节点内容进行 XML 转义，防止注入：

**实现位置：** [src/utils/xml.ts](../src/utils/xml.ts)

```typescript
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
```

**覆盖范围：**
- 节点 description 属性
- 节点 content 内容
- 边的 instruction 内容
- 边的 condition 属性
- 推理结论的 text 内容

---

## 用户责任

brain-memory 在代码层面提供了上述安全机制，但以下安全事项**由用户负责**：

| 事项 | 说明 |
|------|------|
| **API Key 保管** | 使用环境变量或密钥管理器存储，不要硬编码 |
| **数据库文件加密** | SQLite 文件本身不加密，用户需自行实现文件级加密或文件系统加密 |
| **数据库文件权限** | 限制读取权限（如 `chmod 600 brain-memory.db`） |
| **HTTPS 端点** | LLM / Embedding API 端点需使用 HTTPS |
| **网络隔离** | 生产环境中限制数据库文件访问范围 |
| **依赖更新** | 定期更新 npm 依赖以获取安全补丁 |

---

## 安全最佳实践

### 管理员

| 实践 | 操作 |
|------|------|
| 安全存储 API Key | 使用环境变量：`process.env.OPENAI_API_KEY` |
| 保护数据库文件 | `chmod 600 ~/.openclaw/brain-memory.db` |
| 定期备份 | 备份 `brain-memory.db` 文件 |
| 监控日志 | 查看 OpenClaw 日志中的异常信息 |

### 开发者

| 实践 | 操作 |
|------|------|
| 不要硬编码密钥 | 永远不要将 API Key 写入代码或配置文件 |
| 使用参数化查询 | 所有数据库操作使用 `?` 占位符 |
| 验证输入 | 对用户输入进行基本验证 |
| 不暴露内部细节 | 错误消息中不包含堆栈跟踪或数据库结构 |

### 用户

| 实践 | 操作 |
|------|------|
| 使用范围隔离 | 通过 `agentId` / `workspaceId` 隔离不同用户的记忆 |
| 审查配置 | 确认 `reflection.safetyFilter` 为 `true`（默认开启） |
| 限制 LLM 权限 | 使用专用的 API Key，不要使用管理员级别的 Key |

---

## 已知安全限制

| 限制 | 说明 |
|------|------|
| **数据库文件未加密** | SQLite 文件以明文存储，需用户自行加密 |
| **内存中数据未加密** | 运行中的记忆数据在内存中以明文存在 |
| **无审计日志** | 系统不记录访问日志或操作审计 |
| **无反 replay 攻击防护** | 无请求签名或时间戳验证 |
| **LLM 输出未完全信任** | Prompt Injection 防护覆盖反思内容，但不覆盖所有 LLM 输出路径 |
