# API Reference

> 详细的 API 参考文档。快速参考见 [API Quick Reference](api.md)。

---

## ContextEngine

统一上下文引擎，所有功能的入口点。

**源码：** [src/engine/context.ts](../src/engine/context.ts)

### 构造器

```typescript
new ContextEngine(config: BmConfig)
```

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:---:|------|
| `config` | `BmConfig` | ✅ | 配置对象（见下方 BmConfig 类型定义） |

**配置项说明：**

`BmConfig` 包含以下字段（详见下方类型定义）：

- `engine` — 引擎模式：`'graph'`（默认）/ `'vector'` / `'hybrid'`
- `storage` — 存储后端：`'sqlite'`（默认）/ `'lancedb'`
- `dbPath` — 数据库路径（默认 `~/.openclaw/brain-memory.db`）
- `llm` — LLM 配置（`apiKey` / `baseURL` / `model`）
- `embedding` — Embedding 配置（`apiKey` / `baseURL` / `model` / `dimensions`）
- `recallMaxNodes` — 最大召回节点数（默认 `6`）
- `recallMaxDepth` — 图遍历深度（默认 `2`）
- `recallStrategy` — 召回策略：`'full'` / `'summary'` / `'adaptive'` / `'off'`（默认 `'full'`）
- `dedupThreshold` — 去重阈值（默认 `0.90`）
- `pagerankDamping` — PageRank 阻尼（默认 `0.85`）
- `pagerankIterations` — PageRank 迭代次数（默认 `20`）
- `decay` — 衰减配置
- `noiseFilter` — 噪声过滤配置
- `reflection` — 反思配置
- `workingMemory` — 工作记忆配置
- `fusion` — 知识融合配置
- `reasoning` — 推理配置

**初始化行为：** 创建数据库实例 → 初始化 LLM 客户端（无配置时使用 Mock） → 初始化 Embedding 客户端（无配置时优雅降级） → 初始化 Extractor / Recaller / WorkingMemory。

---

### processTurn

处理对话轮次，提取知识。

```typescript
async processTurn(params: {
  sessionId: string;
  agentId: string;
  workspaceId: string;
  messages: Array<{ role?: string; content: string; turn_index?: number }>;
}): Promise<{
  extractedNodes: BmNode[];
  extractedEdges: BmEdge[];
  reflections: ReflectionInsight[];
  workingMemory: WorkingMemoryState;
}>
```

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:---:|------|
| `sessionId` | `string` | ✅ | 会话 ID |
| `agentId` | `string` | ✅ | Agent ID |
| `workspaceId` | `string` | ✅ | 工作空间 ID |
| `messages` | `Array` | ✅ | 对话消息数组 |

`messages` 中每个消息包含：

| 字段 | 类型 | 必填 | 说明 |
|------|------|:---:|------|
| `role` | `string` | ❌ | 角色（`'user'` / `'assistant'`，默认 `'user'`） |
| `content` | `string` | ✅ | 消息内容 |
| `turn_index` | `number` | ❌ | 轮次索引 |

**返回值：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `extractedNodes` | `BmNode[]` | 本次提取的记忆节点 |
| `extractedEdges` | `BmEdge[]` | 本次提取的关系边 |
| `reflections` | `ReflectionInsight[]` | 轮次反思洞察（如开启） |
| `workingMemory` | `WorkingMemoryState` | 更新后的工作记忆状态 |

**执行流程：** 获取已有节点名称（去重）→ LLM 知识提取 → 节点 upsert + 向量嵌入生成 → 边 upsert → 轮次反思（可选）→ 更新工作记忆。

**错误处理：** 单个节点/边插入失败不阻断全局流程，仅记录错误日志继续处理。

---

### recall

召回相关记忆。

```typescript
async recall(
  query: string,
  sessionId?: string,
  agentId?: string,
  workspaceId?: string
): Promise<RecallResult>
```

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:---:|------|
| `query` | `string` | ✅ | 查询文本 |
| `sessionId` | `string` | ❌ | 会话 ID（用于范围过滤） |
| `agentId` | `string` | ❌ | Agent ID（用于范围过滤） |
| `workspaceId` | `string` | ❌ | 工作空间 ID（用于范围过滤） |

**返回值：** [`RecallResult`](#recallresult)

**召回逻辑：** 先按 agent/workspace 范围召回 → 无结果时自动降级为跨会话全局召回。记忆属于 Agent/Workspace 级别，跨 Session 共享。

---

### performFusion

知识融合（检测并合并重复节点）。

```typescript
async performFusion(sessionId?: string): Promise<FusionResult>
```

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|:---:|:---:|------|
| `sessionId` | `string` | ❌ | `"fusion"` | 会话 ID（用于边的 session 标记） |

**返回值：** [`FusionResult`](#fusionresult)

**触发条件：** 需要图谱达到一定规模（默认：节点数 ≥ 20 且社区数 ≥ 3），否则直接返回空结果。

---

### reflectOnSession

会话反思（在会话结束时提取深度洞察）。

```typescript
async reflectOnSession(
  sessionId: string,
  messages: Array<{ role?: string; content: string }>
): Promise<ReflectionInsight[]>
```

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:---:|------|
| `sessionId` | `string` | ✅ | 会话 ID |
| `messages` | `Array` | ✅ | 会话完整消息历史 |

**返回值：** `ReflectionInsight[]` — 反思洞察数组

**洞察类型（`kind`）：** `'user-model'` / `'agent-model'` / `'lesson'` / `'decision'`

---

### performReasoning

推理引擎（基于已有知识推导新结论）。

```typescript
async performReasoning(query?: string): Promise<ReasoningConclusion[]>
```

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|:---:|------|
| `query` | `string` | ❌ | 查询文本（引导推理方向） |

**返回值：** `ReasoningConclusion[]` — 推理结论数组

**触发条件：** 召回节点数 ≥ `minRecallNodes`（默认 `3`），否则返回空数组。

**推理类型（`type`）：** `'path'` / `'implicit'` / `'pattern'` / `'contradiction'`

---

### runMaintenance

图维护流水线（去重 → PageRank → 社区检测 → 社区摘要）。

```typescript
async runMaintenance(): Promise<void>
```

**执行内容：**
1. 去重（LSH 桶化 + 余弦相似度）
2. 全局 PageRank 计算
3. 社区检测（LPA 算法）
4. 社区摘要生成（LLM）

---

### getWorkingMemoryContext

获取工作记忆上下文（用于注入系统提示词）。

```typescript
getWorkingMemoryContext(): string | null
```

**返回值：** XML 格式的工作记忆字符串，或 `null`（无内容时）

---

### searchNodes

直接搜索记忆节点。

```typescript
searchNodes(query: string, limit?: number): BmNode[]
```

**参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|:---:|:---:|------|
| `query` | `string` | ✅ | — | 搜索关键词 |
| `limit` | `number` | ❌ | `10` | 最大返回数量 |

**返回值：** `BmNode[]` — 匹配的节点数组

---

### getAllActiveNodes

获取所有活跃节点。

```typescript
getAllActiveNodes(): BmNode[]
```

**返回值：** `BmNode[]` — 所有 `status='active'` 的节点

---

### getStats

获取统计信息。

```typescript
getStats(): { nodeCount: number; edgeCount: number; sessionCount: number }
```

**返回值：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `nodeCount` | `number` | 节点总数（含已废弃） |
| `edgeCount` | `number` | 边总数 |
| `sessionCount` | `number` | 会话数（基于 bm_messages 表去重） |

---

### close

关闭数据库连接。

```typescript
close(): void
```

---

## 类型定义

所有类型定义在 [src/types.ts](../src/types.ts)。

### BmConfig

完整配置对象。

```typescript
interface BmConfig {
  engine: 'graph' | 'vector' | 'hybrid';
  storage: 'sqlite' | 'lancedb';
  dbPath: string;
  compactTurnCount: number;
  recallMaxNodes: number;
  recallMaxDepth: number;
  recallStrategy: 'full' | 'summary' | 'adaptive' | 'off';
  embedding?: EmbeddingConfig;
  llm?: { apiKey?: string; baseURL?: string; model?: string };
  dedupThreshold: number;
  pagerankDamping: number;
  pagerankIterations: number;
  decay: DecayConfig;
  noiseFilter: NoiseFilterConfig;
  rerank?: RerankConfig;
  reflection: ReflectionConfig;
  workingMemory: WorkingMemoryConfig;
  fusion: FusionConfig;
  reasoning: ReasoningConfig;
}
```

### BmNode

记忆节点。

```typescript
interface BmNode {
  id: string;
  type: GraphNodeType;              // 'TASK' | 'SKILL' | 'EVENT'
  category: MemoryCategory;         // 8 类记忆分类之一
  name: string;
  description: string;
  content: string;
  status: NodeStatus;               // 'active' | 'deprecated'
  validatedCount: number;
  sourceSessions: string[];
  communityId: string | null;
  pagerank: number;
  importance: number;
  accessCount: number;
  lastAccessedAt: number;
  temporalType: 'static' | 'dynamic';
  scopeSession: string | null;
  scopeAgent: string | null;
  scopeWorkspace: string | null;
  createdAt: number;
  updatedAt: number;
}
```

### BmEdge

知识边。

```typescript
interface BmEdge {
  id: string;
  fromId: string;
  toId: string;
  type: EdgeType;   // 'USED_SKILL' | 'SOLVED_BY' | 'REQUIRES' | 'PATCHES' | 'CONFLICTS_WITH'
  instruction: string;
  condition?: string;
  sessionId: string;
  createdAt: number;
}
```

### RecallResult

召回结果。

```typescript
interface RecallResult {
  nodes: BmNode[];
  edges: BmEdge[];
  tokenEstimate: number;
}
```

### FusionResult

融合结果。

```typescript
interface FusionResult {
  candidates: FusionCandidate[];
  merged: number;
  linked: number;
  durationMs: number;
}
```

### FusionCandidate

融合候选。

```typescript
interface FusionCandidate {
  nodeA: BmNode;
  nodeB: BmNode;
  nameScore: number;
  vectorScore: number;
  combinedScore: number;
  decision: 'merge' | 'link' | 'none';
  reason: string;
}
```

### ReflectionInsight

反思洞察。

```typescript
interface ReflectionInsight {
  text: string;
  kind: ReflectionInsightType;      // 'user-model' | 'agent-model' | 'lesson' | 'decision'
  reflectionKind: ReflectionKind;   // 'invariant' | 'derived'
  confidence: number;               // 0-1
}
```

### WorkingMemoryState

工作记忆状态。

```typescript
interface WorkingMemoryState {
  currentTasks: string[];
  recentDecisions: string[];
  constraints: string[];
  attention: string;
  updatedAt: number;
}
```

### ReasoningConclusion

推理结论。

```typescript
interface ReasoningConclusion {
  text: string;
  type: 'path' | 'implicit' | 'pattern' | 'contradiction';
  confidence: number;
}
```

### ReasoningResult

推理结果。

```typescript
interface ReasoningResult {
  conclusions: ReasoningConclusion[];
  triggered: boolean;
  rawOutput: string;
}
```

---

## 常量

### DEFAULT_CONFIG

默认配置对象。

```typescript
const DEFAULT_CONFIG: BmConfig;
```

**关键默认值：**

| 配置项 | 默认值 |
|--------|--------|
| `engine` | `'graph'` |
| `storage` | `'sqlite'` |
| `recallMaxNodes` | `6` |
| `recallMaxDepth` | `2` |
| `dedupThreshold` | `0.90` |
| `pagerankDamping` | `0.85` |
| `pagerankIterations` | `20` |
| `decay.enabled` | `false` |
| `reflection.enabled` | `true` |
| `reflection.turnReflection` | `false` |
| `reflection.sessionReflection` | `true` |
| `workingMemory.enabled` | `true` |
| `fusion.enabled` | `true` |
| `reasoning.enabled` | `true` |

### MEMORY_CATEGORIES

8 类记忆分类数组。

```typescript
const MEMORY_CATEGORIES: readonly [
  'profile', 'preferences', 'entities', 'events',
  'tasks', 'skills', 'cases', 'patterns'
];
```

---

## OpenClaw 钩子

brain-memory 作为 OpenClaw 插件注册的钩子函数。

**源码：** [openclaw-wrapper.ts](../openclaw-wrapper.ts)

### message_received

用户发送消息后触发。

```typescript
async function message_received(event: any, ctx: any): Promise<any>
```

**执行：** 格式转换 → 提取知识 → 检索记忆 → 双层缓存（Agent 级 + Session 级）

### message_sent

AI 回复发送后触发。

```typescript
async function message_sent(event: any, ctx: any): Promise<void>
```

**执行：** 内容过滤（<50 字符跳过）→ 标记 role='assistant' → 提取知识

### before_message_write

AI 回复发送前触发（同步钩子）。

```typescript
function before_message_write(event: any, ctx: any): any
```

**执行：** 从缓存获取记忆上下文 → 附加到事件对象

### session_start

新会话开始时触发。

```typescript
async function session_start(event: any, ctx: any): Promise<void>
```

**执行：** 会话初始化 + 记忆预加载/预热缓存

### session_end

会话结束时触发。

```typescript
async function session_end(event: any, ctx: any): Promise<void>
```

**执行：** 会话反思 + 图维护流水线

---

## 错误处理

所有异步方法使用 try-catch 模式：

| 方法 | 错误行为 |
|------|---------|
| `processTurn` | 单个节点/边插入失败不阻断流程，记录错误日志继续处理 |
| `recall` | Scoped 召回为空时自动降级为全局召回 |
| `performFusion` | 图谱未达规模时返回空结果（非错误） |
| `reflectOnSession` | LLM 调用失败抛出异常 |
| `performReasoning` | 召回节点不足时返回空数组（非错误） |
| `runMaintenance` | 任一子步骤失败抛出异常 |

**常见错误场景：**

- **LLM 未配置** — `createCompleteFn` 返回 null，ContextEngine 使用 Mock（仅日志警告）
- **Embedding 未配置** — `createEmbedFn` 返回 null，向量相关功能跳过
- **数据库初始化失败** — 构造器抛出异常，需调用方处理

> ⚠️ 系统没有定义特定的错误类型（如 `DatabaseError` / `ValidationError`）。所有异常均为标准 `Error` 对象，通过错误消息区分。
