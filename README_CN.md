<p align="center">
  <h1 align="center">🧠 brain-memory</h1>
  <p align="center">为 AI Agent 打造的大脑级记忆系统</p>
  <p align="center"><em>让 Agent 像人一样记住 · 遗忘 · 反思 · 推理</em></p>
</p>

<p align="center">
  <a href="#-特性总览">特性</a> •
  <a href="#-架构设计">架构</a> •
  <a href="#-安装方式">安装</a> •
  <a href="#-快速开始">快速开始</a> •
  <a href="#-记忆分类体系">记忆分类</a> •
  <a href="#-召回策略">召回策略</a> •
  <a href="#-api">API</a> •
  <a href="#-许可证">许可证</a>
</p>

<p align="center">
  <strong>统一知识图谱 + 向量记忆系统，专为 AI Agent 设计</strong><br>
  融合 graph-memory（知识图谱）与 memory-lancedb-pro（向量记忆），打造具备智能遗忘与反思能力的 8 类记忆系统。
</p>

---

## 🧠 核心理念

brain-memory 模拟人脑记忆机制，让 AI Agent 拥有真正的"记忆力"：

| 🧬 人脑机制 | ⚡ 代码实现 |
|:---:|:---|
| **短期记忆 → 长期记忆** | 工作记忆 → 知识图谱持久化 |
| **遗忘曲线** | Weibull 衰减模型（三层分层 + 动态加速） |
| **知识关联** | 个性化 PageRank + 社区检测 |
| **反思总结** | 轮次反思（轻量）+ 会话反思（深度） |
| **归纳推理** | 四类型推理引擎（路径 / 隐含 / 模式 / 矛盾） |

---

## ✨ 特性总览

<details>
<summary><b>📦 记忆系统</b> — 八大分类 · 双向提取 · 图结构 · 时间衰减</summary>

- **八大记忆分类** — `profile`（用户画像）/ `preferences`（偏好）/ `entities`（实体）/ `events`（报错）/ `tasks`（任务）/ `skills`（技能）/ `cases`（案例）/ `patterns`（模式规律）
- **双向知识提取** — 同时提取用户消息和 AI 回复中的关键信息（建议、承诺、代码、工具推荐）
- **图节点 + 边关系** — 3 种节点类型（TASK / SKILL / EVENT）× 11 种边类型，带严格方向约束
- **时间衰减** — Weibull 模型，静态 / 动态信息差异化衰减

</details>

<details>
<summary><b>🔍 召回引擎</b> — 双路径 · 混合融合 · 意图分析 · 查询扩展 · 重排序</summary>

- **双路径召回** — 精确路径（向量 → 社区扩展 → 图遍历 → PPR）+ 泛化路径（社区匹配 → 图遍历 → PPR）
- **混合召回** — 图召回与向量召回并行，Min-Max 归一化 + RRF 融合
- **纯向量模式** — 向量搜索 + BM25 全文检索 + RRF 融合，无需图依赖
- **意图分析** — 5 类意图分类（technical / preference / factual / task / general），指导召回策略
- **查询扩展** — 14 组中英双语同义词映射，口语 → 正式化自动转换
- **交叉编码器重排序** — 支持 Jina / SiliconFlow / Voyage / DashScope / TEI / Pinecone

</details>

<details>
<summary><b>🕸️ 知识图谱</b> — 社区检测 · PageRank · 知识融合 · 图遍历</summary>

- **社区检测** — Label Propagation Algorithm (LPA)，自组织聚类，LLM 生成社区摘要
- **个性化 PageRank** — 基于种子节点的查询相关排序，不同查询得到不同排名
- **知识融合** — 两阶段去重（名称重叠 + 向量相似度），LLM 决策 merge / link / none
- **图遍历** — 递归 CTE 从种子节点向外扩展，构建关联子图

</details>

<details>
<summary><b>🔄 智能维护</b> — 反思 · 压缩 · 流水线维护</summary>

- **会话结束反思** — LLM 全量分析，提取 4 类洞察（用户模型 / Agent 教训 / 经验 / 决策）
- **轮次反思** — 轻量评估本轮提取节点价值，动态提升 importance
- **图维护流水线** — 去重 → PageRank → 社区检测 → 社区摘要
- **会话压缩** — 知识密度评估，低价值会话自动摘要归档

</details>

<details>
<summary><b>🛡️ 工程特性</b> — 范围隔离 · 工作记忆 · 噪声过滤 · 安全防护</summary>

- **多范围隔离** — 按 session / agent / workspace 隔离记忆，参数化查询防 SQL 注入
- **工作记忆** — 零 LLM 开销，跟踪当前任务 / 决策 / 约束 / 关注点
- **噪声过滤** — 多语言问候 / 感谢 / 噪音正则过滤，支持 英 / 中 / 日 / 韩 / 法 / 西 / 德 / 意
- **Prompt Injection 防护** — 6 类安全规则过滤反思内容

</details>

---

## 🏗️ 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                        🌐 API 层                                │
│              ContextEngine (统一门面接口)                          │
│     processTurn │ recall │ performFusion │ reflectOnSession      │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────────────────┐
│                     🎛️ 控制层                                   │
│  ┌──────────┐ ┌──────────┐ ┌────────┐ ┌──────────┐ ┌─────────┐ │
│  │ 提取器   │ │ 召回器   │ │ 融合器 │ │ 反思系统 │ │ 推理引擎│ │
│  └──────────┘ └──────────┘ └────────┘ └──────────┘ └─────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌────────┐ ┌──────────┐ ┌─────────┐ │
│  │ 混合召回 │ │ 向量召回 │ │ 重排序 │ │ 准入控制 │ │ 工作记忆│ │
│  └──────────┘ └──────────┘ └────────┘ └──────────┘ └─────────┘ │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────────────────┐
│                    ⚙️ 算法层                                    │
│  ┌────────────┐ ┌──────────────┐ ┌───────────┐ ┌────────────┐  │
│  │  PageRank  │ │  社区检测    │ │  LSH去重  │ │  时序分类  │  │
│  │  (PPR)     │ │  (LPA)       │ │           │ │            │  │
│  └────────────┘ └──────────────┘ └───────────┘ └────────────┘  │
│  ┌────────────┐ ┌──────────────┐ ┌───────────┐                 │
│  │   衰减     │ │  意图分析    │ │  查询扩展 │                 │
│  │  (Weibull) │ │              │ │           │                 │
│  └────────────┘ └──────────────┘ └───────────┘                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────────────────┐
│                     💾 存储层                                   │
│    SQLite: 6 张表 + FTS5 全文索引 + 触发器 + 8 个索引            │
│    bm_nodes │ bm_edges │ bm_vectors │ bm_messages               │
│    bm_communities │ bm_nodes_fts                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📦 安装方式

### 方式一：npm 安装（已发布包）

```bash
npm install memory-likehuman-pro
```

> **注意：** npm 发布的包仅包含编译后的 `dist/` 目录，不包含源码文件（`src/`、`test/` 等）。

### 方式二：Git 克隆（完整源码）

```bash
git clone https://github.com/DylingCreation/brain-memory.git
cd brain-memory
npm install
```

### 方式三：下载 ZIP 压缩包

1. 访问 [https://github.com/DylingCreation/brain-memory](https://github.com/DylingCreation/brain-memory)
2. 点击 **Code → Download ZIP**
3. 解压后安装依赖：

```bash
cd brain-memory
npm install
```

---

## 🚀 快速开始

### 💻 作为独立库使用

```typescript
import { ContextEngine, DEFAULT_CONFIG } from 'memory-likehuman-pro';

const config = {
  ...DEFAULT_CONFIG,
  dbPath: '~/.openclaw/brain-memory.db',
  llm: {
    apiKey: process.env.LLM_API_KEY,
    baseURL: 'https://your-ll-api-endpoint/v1',
    model: 'your-model-name'
  },
  embedding: {
    apiKey: process.env.EMBEDDING_API_KEY,
    baseURL: 'https://your-embedding-api-endpoint/v1',
    model: 'your-embedding-model'
  }
};

const engine = new ContextEngine(config);

// 📝 处理对话轮次，提取知识
const result = await engine.processTurn({
  sessionId: 'session-1',
  agentId: 'agent-1',
  workspaceId: 'workspace-1',
  messages: [{
    role: 'user',
    content: '我需要用 TypeScript 实现一个记忆系统'
  }]
});

console.log(`提取了 ${result.extractedNodes.length} 个节点, ${result.extractedEdges.length} 条边`);

// 🔍 召回相关记忆
const recall = await engine.recall('TypeScript 记忆系统', 'session-1', 'agent-1', 'workspace-1');
console.log(`召回了 ${recall.nodes.length} 条相关记忆`);
```

### 🔌 作为 OpenClaw 插件使用

brain-memory 是为 **OpenClaw** 平台设计的插件。在 OpenClaw 配置文件（默认 `~/.openclaw/openclaw.json`）中添加：

```json
{
  "plugins": {
    "entries": {
      "brain-memory": {
        "enabled": true,
        "config": {
          "llm": {
            "apiKey": "your-api-key-here",
            "baseURL": "https://your-ll-api-endpoint/v1",
            "model": "your-model-name"
          },
          "embedding": {
            "apiKey": "your-embedding-api-key",
            "baseURL": "https://your-embedding-api-endpoint/v1",
            "model": "your-embedding-model"
          },
          "engine": "hybrid",
          "storage": "sqlite",
          "dbPath": "~/.openclaw/brain-memory.db"
        }
      }
    }
  }
}
```

**插件自动注册的钩子：**

| 🔗 钩子 | ⏰ 触发时机 | 🎯 功能 |
|:---|:---|:---|
| `message_received` | 用户发送消息后 | 提取用户消息中的知识 |
| `message_sent` ✨ | AI 回复发送后 | 提取 AI 回复中的建议 / 代码 / 承诺 |
| `before_message_write` | AI 回复发送前 | 注入相关记忆到上下文 |
| `session_start` | 新会话开始 | 预热记忆缓存 |
| `session_end` | 会话结束 | 执行反思 + 图维护 |

### 🛠️ 交互式配置（可选）

项目提供两个交互式配置脚本，均为**通用配置工具**（不绑定特定平台），用于生成基础的 LLM / Embedding API 凭证配置文件：

```bash
# 交互式配置 — 生成 config.js、.env、llm_client.js
npm run configure

# OpenClaw 集成 — 将配置写入 ~/.openclaw/openclaw.json
npm run setup-openclaw
```

> **重要提示：** 交互式配置脚本仅设置 **核心 API 凭证**（LLM 端点、API Key、模型名称、Embedding 设置），**不配置** brain-memory 的高级功能参数，例如衰减参数、反思设置、融合阈值、工作记忆限制等。这些高级参数需要手动在 OpenClaw 配置文件中设置，或通过代码中的 `BmConfig` 接口进行编程配置。

### 🩺 CLI 诊断工具（v0.2.0 新增）

一键检查环境、依赖、配置、数据库状态：

```bash
npm run doctor
# 或：npx brain-memory-doctor
```

检查项：Node.js 版本、依赖安装状态、LLM/Embedding 配置、数据库文件/schema 版本/表统计、WAL/SHM 残留文件。

---

## 📋 记忆分类体系

brain-memory 使用 **8 类记忆分类**，覆盖对话中所有有价值的信息：

| 🏷️ 分类 | 📖 含义 | 💡 示例 |
|:---|:---|:---|
| **`profile`** | 用户画像（身份 / 角色 / 背景） | "用户是全栈工程师" |
| **`preferences`** | 用户偏好（喜欢 / 讨厌 / 习惯） | "用户偏好简短回复" |
| **`entities`** | 实体信息（项目 / 工具 / 环境） | "项目使用 SQLite" |
| **`events`** | 报错 / 异常（发生过的问题） | "Docker 端口冲突" |
| **`tasks`** | 完成任务 / 讨论主题 | "实现记忆系统" |
| **`skills`** | 可复用技能（怎么做） | "npm install 命令" |
| **`cases`** | 案例经验（成功 / 失败案例） | "先检查端口再部署" |
| **`patterns`** | 模式规律（跨案例抽象） | "部署前检查端口是通用规律" |

---

## 🔍 召回策略

### 三种引擎模式

| 🚀 模式 | 📝 说明 | 🎯 适用场景 |
|:---|:---|:---|
| **`graph`** *(默认)* | 知识图谱 + 社区 + PPR | 需要关系上下文 |
| **`vector`** | 纯向量 + BM25 + RRF | 轻量部署，无图依赖 |
| **`hybrid`** | 图召回 + 向量召回并行融合 | 最优召回质量 |

### 召回流程详解

**🎯 精确路径**（graph 模式）：

```
查询 → 向量检索 / FTS5 → 社区扩展(距离2) → 图遍历(maxDepth层) → PPR排序 → 时间衰减 → 返回Top N
```

**🌐 泛化路径**（graph 模式）：

```
查询 → 社区向量匹配 → 社区成员 → 图遍历(1层) → PPR排序 → 与精确路径合并
```

**🔀 混合召回融合**：

```
图召回(PPR分数) ──┐
                    ├→ Min-Max归一化 → RRF融合 → 排序 → 返回
向量召回(RRF分数) ──┘
```

---

## ⚙️ 配置参考

### 完整配置项

<details>
<summary>📋 点击展开完整配置参考</summary>

```typescript
interface BmConfig {
  // 🚀 引擎模式: graph(默认) | vector | hybrid
  engine: 'graph' | 'vector' | 'hybrid';

  // 💾 存储后端: sqlite(默认) | lancedb
  storage: 'sqlite' | 'lancedb';

  // 📁 数据库路径
  dbPath: string;

  // 🗜️ 会话压缩轮数
  compactTurnCount: number;

  // 🔍 召回配置
  recallMaxNodes: number;     // 默认 6
  recallMaxDepth: number;     // 默认 2
  recallStrategy: 'full' | 'summary' | 'adaptive' | 'off';

  // 🤖 LLM 配置
  llm: {
    apiKey?: string;
    baseURL?: string;
    model?: string;
  };

  // 🔢 Embedding 配置
  embedding: {
    apiKey?: string;
    baseURL?: string;
    model?: string;
    dimensions?: number;
  };

  // 🔄 去重阈值
  dedupThreshold: number;     // 默认 0.90

  // 📊 PageRank 配置
  pagerankDamping: number;    // 默认 0.85
  pagerankIterations: number; // 默认 20

  // ⏳ 衰减配置
  decay: {
    enabled: boolean;                    // 默认 false
    recencyHalfLifeDays: number;         // 默认 30
    recencyWeight: number;               // 默认 0.4
    frequencyWeight: number;             // 默认 0.3
    intrinsicWeight: number;             // 默认 0.3
    timeDecayHalfLifeDays: number;       // 默认 60
    // 三层衰减参数
    betaCore: number; betaWorking: number; betaPeripheral: number;
    coreDecayFloor: number; workingDecayFloor: number; peripheralDecayFloor: number;
  };

  // 🔇 噪声过滤
  noiseFilter: {
    enabled: boolean;       // 默认 true
    minContentLength: number; // 默认 10
  };

  // 💭 反思系统
  reflection: {
    enabled: boolean;          // 默认 true
    turnReflection: boolean;   // 默认 false
    sessionReflection: boolean; // 默认 true
    safetyFilter: boolean;     // 默认 true
    maxInsights: number;       // 默认 8
    importanceBoost: number;   // 默认 0.15
    minConfidence: number;     // 默认 0.6
  };

  // 🧠 工作记忆
  workingMemory: {
    enabled: boolean;     // 默认 true
    maxTasks: number;     // 默认 3
    maxDecisions: number; // 默认 5
    maxConstraints: number; // 默认 5
  };

  // 🔗 知识融合
  fusion: {
    enabled: boolean;            // 默认 true
    similarityThreshold: number; // 默认 0.75
    minNodes: number;            // 默认 20
    minCommunities: number;      // 默认 3
  };

  // 🧩 推理
  reasoning: {
    enabled: boolean;         // 默认 true
    maxHops: number;          // 默认 2
    maxConclusions: number;   // 默认 3
    minRecallNodes: number;   // 默认 3
  };
}
```

</details>

---

## 🧩 核心 API

### ContextEngine

统一上下文引擎，所有功能的入口点。

```typescript
class ContextEngine {
  // 📝 处理对话轮次，提取知识
  processTurn(params: {
    sessionId: string; agentId: string; workspaceId: string;
    messages: Array<{ role: string; content: string }>;
  }): Promise<{
    extractedNodes: BmNode[]; extractedEdges: BmEdge[];
    reflections: ReflectionInsight[]; workingMemory: WorkingMemoryState;
  }>;

  // 🔍 召回相关记忆
  recall(query: string, sessionId?: string, agentId?: string, workspaceId?: string): Promise<RecallResult>;

  // 🔗 知识融合（合并重复节点）
  performFusion(sessionId?: string): Promise<FusionResult>;

  // 💭 会话反思
  reflectOnSession(sessionId: string, messages: Array<{ role: string; content: string }>): Promise<ReflectionInsight[]>;

  // 🧩 推理引擎
  performReasoning(query?: string): Promise<ReasoningConclusion[]>;

  // 🔄 维护任务（去重 + PageRank + 社区检测）
  runMaintenance(): Promise<void>;

  // 🧠 工作记忆上下文
  getWorkingMemoryContext(): string | null;

  // 🔎 节点搜索
  searchNodes(query: string, limit?: number): BmNode[];

  // 📊 统计信息（v0.2.0 增强）
  getStats(): EngineStats; // 节点按类型/状态/来源分类、社区、向量、dbSizeBytes、schemaVersion、uptimeMs、embedCache、queryTimeMs

  // 🩺 健康检查（v0.2.0 新增）
  healthCheck(): HealthStatus; // 整体状态、组件状态(db/llm/embedding)、统计、运行时长、schemaVersion

  // ❌ 关闭数据库
  close(): void;
}
```

---

## 📊 数据库结构

brain-memory 使用 **SQLite** 存储，包含 **6 张表 + FTS5 全文索引**：

| 📋 表名 | 📝 用途 | 🔑 关键字段 |
|:---|:---|:---|
| **`bm_nodes`** | 记忆节点 | id, type, category, name, content, pagerank, importance, scope_* |
| **`bm_edges`** | 知识边 | from_id, to_id, type, instruction, condition |
| **`bm_vectors`** | 向量嵌入 | node_id(FK), embedding(BLOB), hash |
| **`bm_messages`** | 对话消息 | session_id, turn_index, role, content, extracted |
| **`bm_communities`** | 社区摘要 | id, summary, node_count, embedding |
| **`bm_nodes_fts`** | FTS5 索引 | name, description, content *(通过触发器自动同步)* |

---

## 🔐 安全特性

| 🛡️ 特性 | 📝 说明 |
|:---|:---|
| **参数化 SQL 查询** | 所有数据库操作使用 `?` 占位符，防止 SQL 注入 |
| **范围隔离** | 按 session / agent / workspace 隔离记忆，支持跨范围授权检索 |
| **Prompt Injection 防护** | 6 类安全规则过滤反思内容（忽略指令 / 泄露密钥 / 角色切换 / HTML注入 / 角色前缀 / 禁用安全） |
| **输入验证** | 节点类型 / 边类型 / 记忆分类严格校验 |

---

## 🧪 测试

```bash
npm test
```

项目测试覆盖（v1.0.0）：
- ✅ **531 用例 / 48 文件 / 零失败**
- ✅ **83.2% 代码覆盖率** — 核心模块（recall, llm, embed, plugin）> 90%
- ✅ **单元测试** — 各独立组件
- ✅ **集成测试** — 完整工作流
- ✅ **性能基准测试** — 召回 0.44ms avg, 向量搜索 7.21ms
- ✅ **错误处理验证** — 优雅降级，异常场景覆盖

---

## 🛠️ 构建命令

```bash
# 构建项目
npm run build

# 清理构建产物
npm run clean

# 运行代码检查
npm run lint

# 生成 API 文档
npm run docs
```

---

## 📁 目录结构

<details>
<summary>📂 点击展开目录结构</summary>

```
brain-memory/
├── src/                 # 源代码
│   ├── store/          # 数据库操作（CRUD + FTS5 + 向量）
│   ├── extractor/      # 知识提取（LLM 节点/边提取）
│   ├── recaller/       # 双路径召回引擎
│   ├── retriever/      # 混合召回 / 向量召回 / 重排序 / 准入控制
│   ├── reasoning/      # 推理引擎
│   ├── reflection/     # 反思系统
│   ├── fusion/         # 知识融合与去重
│   ├── decay/          # Weibull 遗忘算法
│   ├── scope/          # 多范围隔离
│   ├── temporal/       # 时序分类（静态/动态）
│   ├── noise/          # 噪声过滤
│   ├── working-memory/ # 工作记忆管理
│   ├── format/         # 上下文格式化组装
│   ├── engine/         # 核心引擎（LLM + Embedding + ContextEngine）
│   ├── graph/          # 图算法（PageRank / 社区检测 / 去重 / 维护）
│   ├── preferences/    # 偏好槽位提取
│   ├── session/        # 会话压缩
│   ├── plugin/         # OpenClaw 插件接口
│   └── utils/          # 工具函数（JSON / 相似度 / 文本 / XML）
│
├── test/               # 测试文件
│   ├── *.test.ts       # 单元测试
│   └── integration/    # 集成测试
│
├── docs/               # 文档
├── scripts/            # 配置脚本
├── openclaw-*.ts       # OpenClaw 插件入口
└── index.ts            # 模块导出入口
```

</details>

---

## 📝 更新日志

### 🆕 最新版本

| 更新 | 说明 |
|:---:|:---|
| ✨ | **双向知识提取** — 新增 `message_sent` 钩子，同时提取用户消息和 AI 回复 |
| 🎯 | **AI 回复智能过滤** — 跳过 <50 字符的简短回复，专注有价值内容 |
| 🔄 | **角色区分处理** — 用户消息提取意图/偏好，AI 回复提取建议/代码/工具推荐 |
| 🌐 | **跨会话记忆共享** — Agent 级缓存，新会话自动复用历史记忆 |
| 🔥 | **会话预热** — 新会话启动时预加载相关记忆 |

---

## 📄 许可证

[MIT](LICENSE) · Made with ❤️ for AI Agents
