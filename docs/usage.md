# Usage Guide

> 面向开发者的编程指南 — 如何在代码中使用 brain-memory。

---

## 环境要求

- Node.js >= 18.0.0
- npm 包管理器

---

## 安装

### 方式一：npm 安装

```bash
npm install memory-likehuman-pro
```

### 方式二：Git 克隆

```bash
git clone https://github.com/DylingCreation/brain-memory.git
cd brain-memory
npm install
npm run build
```

---

## 快速开始

### 基础使用

```typescript
import { ContextEngine, DEFAULT_CONFIG } from 'memory-likehuman-pro';

// 配置 LLM 和 Embedding（必填）
const config = {
  ...DEFAULT_CONFIG,
  dbPath: '~/.openclaw/brain-memory.db',
  llm: {
    apiKey: 'your-api-key-here',
    baseURL: 'https://your-ll-api-endpoint/v1',
    model: 'your-model-name'
  },
  embedding: {
    apiKey: 'your-api-key-here',
    baseURL: 'https://your-embedding-api-endpoint/v1',
    model: 'your-embedding-model'
  }
};

// 初始化引擎
const engine = new ContextEngine(config);
```

> **注意：** `llm.apiKey` 是必填项。未配置时知识提取等功能将被禁用。`embedding` 不配置则自动降级为 FTS5 全文检索。

### 处理对话轮次

```typescript
const result = await engine.processTurn({
  sessionId: 'session-1',
  agentId: 'agent-1',
  workspaceId: 'workspace-1',
  messages: [
    {
      role: 'user',
      content: '如何用 Docker 部署 Flask 应用？',
      turn_index: 1
    },
    {
      role: 'assistant',
      content: '你可以使用 Docker 容器进行部署。创建 Dockerfile 和 docker-compose.yml。',
      turn_index: 2
    }
  ]
});

console.log('提取节点数:', result.extractedNodes.length);
console.log('提取边数:', result.extractedEdges.length);
console.log('反思洞察数:', result.reflections.length);
```

**返回结果结构：**

```typescript
{
  extractedNodes: BmNode[],    // 本次提取的记忆节点
  extractedEdges: BmEdge[],    // 本次提取的关系边
  reflections: ReflectionInsight[],  // 反思洞察（如开启）
  workingMemory: WorkingMemoryState  // 工作记忆状态
}
```

### 召回相关记忆

```typescript
const recallResult = await engine.recall(
  'Docker 部署',      // 查询文本
  'session-1',        // sessionId（可选）
  'agent-1',          // agentId（可选）
  'workspace-1'       // workspaceId（可选）
);

console.log('召回节点数:', recallResult.nodes.length);
console.log('召回边数:', recallResult.edges.length);
console.log('预估 Token 数:', recallResult.tokenEstimate);

// 访问单个节点
recallResult.nodes.forEach(node => {
  console.log(`[${node.type}] ${node.name} — ${node.description}`);
});
```

**返回结果结构：**

```typescript
{
  nodes: BmNode[],         // 召回的记忆节点
  edges: BmEdge[],         // 节点之间的关系边
  tokenEstimate: number    // 预估 Token 数量（用于上下文预算控制）
}
```

---

## 进阶功能

### 知识融合（去重合并）

检测并合并语义重复的节点：

```typescript
const fusionResult = await engine.performFusion('session-1');

console.log('合并节点数:', fusionResult.merged);
console.log('新增连接数:', fusionResult.linked);
```

> 知识融合需要图谱达到一定规模才会触发（默认：节点数 ≥ 20 且社区数 ≥ 3）。

### 会话反思

在会话结束时提取深度洞察：

```typescript
const messages = [
  { role: 'user', content: '我想学 Rust' },
  { role: 'assistant', content: '建议从官方文档开始...' }
];

const insights = await engine.reflectOnSession('session-1', messages);

insights.forEach(insight => {
  console.log(`[${insight.kind}] ${insight.text} (置信度: ${insight.confidence})`);
});
```

**洞察类型：**

| 类型 | 含义 |
|------|------|
| `user-model` | 关于用户的发现（身份、偏好、习惯） |
| `agent-model` | 关于 Agent 行为的教训 |
| `lesson` | 失败/成功经验 |
| `decision` | 持久决策 |

### 推理引擎

基于已有知识推导新结论：

```typescript
const conclusions = await engine.performReasoning('如何优化部署流程？');

conclusions.forEach(c => {
  console.log(`[${c.type}] ${c.text} (置信度: ${c.confidence})`);
});
```

**推理类型：**

| 类型 | 含义 |
|------|------|
| `path` | 路径推导（A→B→C 间接关系） |
| `implicit` | 隐含关系（共享邻居暗示连接） |
| `pattern` | 模式泛化（多节点相似模式→通用规律） |
| `contradiction` | 矛盾检测（内容冲突告警） |

### 图维护

运行完整的图维护流水线（去重 → PageRank → 社区检测 → 社区摘要）：

```typescript
await engine.runMaintenance();
```

> 建议在低峰期定期运行，或在 `session_end` 钩子中自动触发。

### 工作记忆上下文

获取当前对话焦点，用于注入系统提示词：

```typescript
const workingMemory = engine.getWorkingMemoryContext();

if (workingMemory) {
  console.log(workingMemory);
  // 输出示例：
  // <working_memory>
  // ## Current Tasks
  // - docker部署
  // - 学习Rust
  //
  // ## Recent Decisions
  // - 采用SQLite存储
  //
  // ## Current Focus
  // 如何优化部署流程
  // </working_memory>
}
```

### 节点搜索

直接搜索记忆节点：

```typescript
const nodes = engine.searchNodes('Docker 部署', 10);

nodes.forEach(node => {
  console.log(`[${node.category}] ${node.name}: ${node.content}`);
});
```

### 统计信息

```typescript
const stats = engine.getStats();

console.log('节点总数:', stats.nodeCount);
console.log('边总数:', stats.edgeCount);
console.log('会话数:', stats.sessionCount);
```

---

## 配置详解

### 引擎模式

| 模式 | 说明 | 适用场景 |
|------|------|---------|
| `graph`（默认） | 知识图谱 + 社区 + PPR | 需要关系上下文 |
| `vector` | 纯向量 + BM25 + RRF | 轻量部署，无图依赖 |
| `hybrid` | 图召回 + 向量召回并行融合 | 最优召回质量 |

```typescript
const config = {
  ...DEFAULT_CONFIG,
  engine: 'hybrid'  // 使用混合召回引擎
};
```

### 存储后端

| 后端 | 说明 |
|------|------|
| `sqlite`（默认） | 轻量本地存储 |
| `lancedb` | 向量数据库（需额外配置） |

### 召回策略

| 策略 | 行为 |
|------|------|
| `full`（默认） | 注入完整 XML（name + desc + content） |
| `summary` | 仅注入 name + desc（节省 Token） |
| `adaptive` | ≤6 节点用 full，>6 用 summary |
| `off` | 跳过注入 |

### 衰减配置

```typescript
const config = {
  ...DEFAULT_CONFIG,
  decay: {
    enabled: true,              // 默认 false
    recencyHalfLifeDays: 30,    // 近因半衰期（天）
    recencyWeight: 0.4,         // 近因权重
    frequencyWeight: 0.3,       // 频率权重
    intrinsicWeight: 0.3,       // 内在重要性权重
    timeDecayHalfLifeDays: 60,  // 时间衰减半衰期
    // 三层衰减参数
    betaCore: 0.8,              // 核心记忆衰减形状
    betaWorking: 1.0,           // 工作记忆衰减形状
    betaPeripheral: 1.3,        // 外围记忆衰减形状
    coreDecayFloor: 0.9,        // 核心记忆衰减下限
    workingDecayFloor: 0.7,     // 工作记忆衰减下限
    peripheralDecayFloor: 0.5   // 外围记忆衰减下限
  }
};
```

### 反思配置

```typescript
const config = {
  ...DEFAULT_CONFIG,
  reflection: {
    enabled: true,
    turnReflection: false,      // 轮次反思（轻量，默认关闭）
    sessionReflection: true,    // 会话反思（深度，默认开启）
    safetyFilter: true,         // 安全过滤（防 Prompt Injection）
    maxInsights: 8,             // 单次最大洞察数
    importanceBoost: 0.15,      // 洞察节点重要性提升值
    minConfidence: 0.6          // 最低置信度阈值
  }
};
```

### 工作记忆配置

```typescript
const config = {
  ...DEFAULT_CONFIG,
  workingMemory: {
    enabled: true,
    maxTasks: 3,        // 最大跟踪任务数
    maxDecisions: 5,    // 最大跟踪决策数
    maxConstraints: 5   // 最大跟踪约束数
  }
};
```

### 知识融合配置

```typescript
const config = {
  ...DEFAULT_CONFIG,
  fusion: {
    enabled: true,
    similarityThreshold: 0.75,  // 相似度阈值
    minNodes: 20,               // 最小节点数（图谱太小不执行）
    minCommunities: 3           // 最小社区数
  }
};
```

### 推理配置

```typescript
const config = {
  ...DEFAULT_CONFIG,
  reasoning: {
    enabled: true,
    maxHops: 2,             // 最大跳数
    maxConclusions: 3,      // 最大结论数
    minRecallNodes: 3       // 最小召回节点数（不足不触发推理）
  }
};
```

---

## OpenClaw 插件模式

brain-memory 设计为 **OpenClaw** 插件。配置后自动注册以下钩子：

| 钩子 | 触发时机 | 功能 |
|------|---------|------|
| `message_received` | 用户发送消息后 | 提取用户消息中的知识 |
| `message_sent` | AI 回复发送后 | 提取 AI 回复中的建议 / 代码 / 承诺 |
| `before_message_write` | AI 回复发送前 | 注入相关记忆到上下文 |
| `session_start` | 新会话开始 | 预热记忆缓存 |
| `session_end` | 会话结束 | 执行反思 + 图维护 |

详细配置方法请参考 [SETUP.md](../SETUP.md)。

---

## 错误处理

```typescript
try {
  const result = await engine.processTurn({
    sessionId: 'session-1',
    agentId: 'agent-1',
    workspaceId: 'workspace-1',
    messages: [{ role: 'user', content: '你好' }]
  });
} catch (error) {
  console.error('处理失败:', error);
  // 根据错误类型实现重试或降级逻辑
}
```

**常见错误场景：**

| 场景 | 原因 | 处理方式 |
|------|------|---------|
| LLM API 超时 | 网络问题或模型响应慢 | 检查网络连接，确认 API 端点可用 |
| 数据库锁定 | 多个进程同时访问 | 等待后重试，确保单实例运行 |
| Embedding 失败 | Embedding 服务不可用 | 系统自动降级为 FTS5 全文检索 |
| 知识提取为空 | 消息内容过短或为寒暄 | 正常行为，噪声过滤会跳过低价值内容 |

---

## 最佳实践

### 会话管理

- 使用唯一的 `sessionId` 区分不同对话
- 通过 `agentId` 和 `workspaceId` 实现多租户隔离
- 记忆属于 Agent/Workspace 级别，跨 Session 共享

### 性能调优

| 参数 | 建议 | 说明 |
|------|------|------|
| `recallMaxNodes` | 6-10 | 值越大召回越多，但 Token 消耗越高 |
| `recallMaxDepth` | 2-3 | 图遍历深度，过大会增加计算量 |
| `recallStrategy` | `adaptive` | 自适应策略在节点少时用 full，多时用 summary |

### 维护建议

- 定期调用 `runMaintenance()` 保持图谱健康
- 开启 `decay.enabled` 让低价值记忆自然衰减
- 监控数据库文件大小，必要时进行备份

### 关闭不需要的功能

```typescript
const config = {
  ...DEFAULT_CONFIG,
  fusion: { enabled: false },           // 关闭知识融合
  reasoning: { enabled: false },        // 关闭推理
  reflection: { sessionReflection: false }  // 关闭会话反思
};
```

---

## 关闭数据库连接

```typescript
engine.close();
```

> 通常在应用退出时调用，确保数据库文件正确关闭。
