<p align="center">
  <h1 align="center">🧠 brain-memory</h1>
  <p align="center"><strong>让 AI 像人一样记忆——不仅记住，还会遗忘、反思、推理、融合知识</strong></p>
</p>

<p align="center">
  <a href="#-一句话">一句话</a> •
  <a href="#-四种能力">四种能力</a> •
  <a href="#-三条管道">三条管道</a> •
  <a href="#-一分钟集成">一分钟集成</a> •
  <a href="#-API">API</a> •
  <a href="#-设计理念">设计理念</a>
</p>

---

## 💬 一句话

Brain-Memory 是一个 TypeScript 记忆引擎。它让 AI Agent 拥有长期记忆——记住你的偏好、学到的技能、踩过的坑、做出的决策，而不是每次对话从零开始。

---

## 🧠 四种能力

```
       👤 人类记忆                    🤖 Brain-Memory
  ┌─────────────────┐         ┌──────────────────┐
  │ 记住重要的事      │   ←→    │ 8 类记忆自动分类存储 │
  │ 遗忘不重要的事    │   ←→    │ Weibull 衰减模型    │
  │ 事后反思总结      │   ←→    │ 双级反思引擎        │
  │ 举一反三推理      │   ←→    │ 知识图谱推理引擎     │
  └─────────────────┘         └──────────────────┘
```

### 记住——8 类记忆自动分类

从对话中自动提取，无需手动整理：

| 类别 | 记住什么 | 例 |
|------|---------|-----|
| 👤 用户画像 | 身份、角色、背景 | "我是一个 Python 后端开发者" |
| 🎯 偏好习惯 | 喜欢/讨厌什么 | "我更喜欢用 pnpm 而非 npm" |
| 📦 实体信息 | 项目、工具、环境的客观事实 | "项目部署在阿里云 ECS 上" |
| ⚡ 事件/报错 | 发生过的问题和异常 | "上次 Docker 构建因内存不足失败" |
| ✅ 完成的任务 | 做过什么、讨论过什么 | "上周完成了 API 限流模块" |
| 🔧 可复用技能 | 怎么做事的具体方法 | "docker-compose up -d 启动服务" |
| 📋 案例经验 | 具体场景的成功/失败案例 | "上次用 Redis 做缓存层解决了查询瓶颈" |
| 🔮 模式规律 | 跨案例的抽象规律 | "部署前跑集成测试能避免 80% 的问题" |

### 遗忘——该记住的不会丢，该忘的自然消失

**Weibull 生存函数**模拟的三层衰减，不是简单的时间过期：

```
核心知识 (importance > 0.7)  → 几乎永久保留（如"用户的编程语言偏好"）
工作知识 (importance > 0.4)  → 长期不用才淡化（如"三个月前临时用的脚本"）
边缘知识 (importance ≤ 0.4)  → 自动清理（如"某次无关的闲聊"）
```

动态记忆（如"当前版本号"）比稳定知识遗忘速度快 **3 倍**。

### 反思——对话结束后自动总结洞察

每次会话结束时，系统自动提炼：

- "用户对 TypeScript 类型安全要求很高" → 更新用户画像
- "今天推荐的 Docker 方案在 NVIDIA 环境下不兼容" → 记录 Agent 教训
- "GPU 部署需额外检查 nvidia-docker 驱动" → 提炼经验规律

反思结果也被存为知识节点，参与后续搜索和推理。

### 推理——从已知推到未知

| 类型 | 行为 | 示例 |
|------|------|------|
| 路径推导 | 发现间接关联 A→B→C | Docker → GPU → nvidia-docker |
| 隐含关系 | 共享邻居暗示隐藏连接 | A 和 B 都用了 Redis → 可能存在共享需求 |
| 模式泛化 | 多次失败总结规律 | 连续 3 次部署超时 → 流程存在系统性问题 |
| 矛盾检测 | 发现冲突信息 | A 说用 MySQL，B 说用 PostgreSQL |

---

## ⚙️ 三条管道

### 学习 (processTurn)

```
用户消息 → 噪声过滤 → 三级提取:
  Tier 1: 规则引擎（代码块/命令/正则）← 零 LLM，<10ms
  Tier 2: LLM 深度理解              ← 有 LLM 配置时
  Tier 3: 容错解析                  ← LLM 输出异常时自动修复
→ 生成向量嵌入 → 存入 SQLite → 更新图谱边关系 → 更新工作记忆
```

LLM 不可用时自动降级到 Tier 1，仍然能提取粗粒度知识。

### 回忆 (recall)

```
用户提问 → 信息量判断 → 意图分析 → 查询扩展
→ 四路并行搜索:
  ① 关键词 + 向量搜索 → 社区扩展
  ② 社区语义匹配 → 成员召回
  ③ LanceDB 语义搜索（必需伴随索引）
  ④ 外部长期记忆
→ PageRank 排序 → 多路径增强(×1.2) → 时间衰减 → 返回 Top-N
```

### 维护 (maintenance)

```
定期触发 → 去重 → PageRank → 社区检测 → 社区摘要 → 衰减归档
```

少量节点变更时走增量路径，性能提升 **5 倍以上**。

---

## 📦 安装

```bash
npm install memory-likehuman-pro     # npm 包

# 或完整源码
git clone https://github.com/DylingCreation/brain-memory.git
cd brain-memory && npm install
```

---

## 🚀 快速开始

### 方式一：OpenClaw 插件

#### 第一步：安装

```bash
npm install -g memory-likehuman-pro
```

> 全局安装后，OpenClaw Gateway 解析 `package.json` 中的 `openclaw.extensions` 字段，加载入口文件 `openclaw-register.ts`。

#### 第二步：在 openclaw.json 中启用

编辑 `~/.openclaw/openclaw.json`，在 `plugins.entries` 中添加：

```json
{
  "plugins": {
    "entries": {
      "brain-memory": {
        "enabled": true,
        "config": {
          "mode": "full",
          "llm": { "apiKey": "***", "baseURL": "https://api.openai.com/v1", "model": "gpt-4o-mini" },
          "embedding": { "apiKey": "***", "model": "text-embedding-3-small" }
        }
      }
    }
  }
}
```

> 大量配置可直接放 `config` 内，等价于 `BmConfig`。完整字段见下方 [配置参考](#配置参考)。

#### 第三步：重启 Gateway

```bash
openclaw gateway restart
```

#### 插件注册原理

brain-memory 遵循 OpenClaw 标准插件协议，包含两个必需的元数据文件和入口注册：

| 文件 | 作用 |
|------|------|
| `package.json` | 含 `openclaw.extensions` 字段，声明入口文件 `openclaw-register.ts` |
| `openclaw.plugin.json` | 插件清单（manifest），声明 `id`、`contracts.hooks`（5 个钩子）、`activation.onStartup: true`、`configSchema`（204 行 JSON Schema） |

```typescript
// openclaw-register.ts
import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';

export default definePluginEntry({
  id: 'brain-memory',
  name: 'Brain Memory',
  version: '2.1.2',
  description: 'Unified knowledge graph + vector memory system for AI agents',
  register(api) {
    api.on('message_received',  handleMessage);      // 提取用户消息中的知识
    api.on('message_sent',     handleMessage);      // 提取 AI 回复中的建议/代码/承诺
    api.on('message_sending',  beforeMessageSend);   // 注入相关记忆到对话上下文
    api.on('session_start',    onSessionStart);     // 预热记忆缓存
    api.on('session_end',      onSessionEnd);       // 会话反思 + 图维护
  },
});
```

**插件生命周期钩子**：

| 钩子 | 触发时机 | 行为 |
|------|---------|------|
| `message_received` | 收到用户消息 | 提取知识节点 + 边关系 → 存入 SQLite |
| `message_sent` | AI 回复完成 | 提取 AI 回复中的建议/代码/承诺 |
| `message_sending` | AI 回复发出前 | 召回相关记忆 → 注入到对话上下文 |
| `session_start` | 新会话 | 预热记忆缓存 |
| `session_end` | 会话结束 | 会话反思 + 图维护（PageRank/社区/衰减） |

#### 手动排查：如果 Gateway 未加载插件

```bash
# 1. 确认包已全局安装
npm list -g memory-likehuman-pro

# 2. 确认包中存在清单文件
ls $(npm root -g)/memory-likehuman-pro/openclaw.plugin.json

# 3. 确认 openclaw.json 中 plugins.entries 包含 brain-memory 条目
cat ~/.openclaw/openclaw.json | grep brain-memory

# 4. 检查 Gateway 启动日志中的插件加载信息
openclaw gateway restart

# 5. 如仍无法加载，检查插件诊断信息
openclaw plugins inspect brain-memory
```

> **必要条件**：① `npm install -g` 全局安装 ② `openclaw.json` 中 `plugins.entries.brain-memory.enabled = true` ③ `openclaw.plugin.json` 清单文件存在于包根目录。三个条件全部满足后重启 Gateway 即可。

### 方式二：独立库

```typescript
import { ContextEngine, DEFAULT_CONFIG } from 'memory-likehuman-pro';

const engine = new ContextEngine({
  ...DEFAULT_CONFIG,
  dbPath: '~/.openclaw/brain-memory.db',
  mode: 'full',
  llm: { apiKey: '***', baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  embedding: { apiKey: '***', model: 'text-embedding-3-small' },
});

// 📝 提取知识
const result = await engine.processTurn({
  sessionId: 'demo', agentId: 'assistant', workspaceId: 'my-project',
  messages: [{ role: 'user', content: '我需要部署一个 Python Flask 应用到 Docker' }],
});
console.log(`提取了 ${result.extractedNodes.length} 个节点`);

// 🔍 召回记忆
const recall = await engine.recall('Docker 部署');
console.log(recall.nodes.map(n => n.name));
```

### 方式三：最小配置（零 LLM）

```json
{ "dbPath": "brain-memory.db", "storage": "sqlite", "mode": "lite" }
```

无需 LLM、无需 Embedding——提取用规则引擎，召回用文本搜索。SQLite + LanceDB 为必需依赖。

---

## 📖 使用指南

### OpenClaw 插件钩子

插件自动注册 5 个生命周期钩子，无需手动调用：

| 钩子 | 触发时机 | 功能 |
|------|---------|------|
| `message_received` | 用户发送消息后 | 提取消息中的知识节点和边关系 |
| `message_sent` | AI 回复发送后 | 提取 AI 回复中的建议/代码/承诺 |
| `before_message_write` | AI 回复发送前 | 注入相关记忆到对话上下文 |
| `session_start` | 新会话开始 | 预热记忆缓存 |
| `session_end` | 会话结束 | 执行会话反思 + 图维护 |

### CLI 诊断

```bash
npm run doctor            # 检查环境、依赖、配置、数据库状态
node scripts/check-health.cjs  # 工程卫生：lint + tsc + test 一键验证
```

### 构建与测试

```bash
npm run build             # tsc 编译
npm test                  # 运行全量测试 (847 用例, 70 files)
npm run lint              # ESLint 检查
npm run docs              # 生成 typedoc API 文档
```

### 配置参考

<details>
<summary>📋 完整配置项说明（点击展开）</summary>

#### 核心

| 字段 | 默认值 | 作用 |
|------|--------|------|
| `mode` | `full` | 运行模式。`full`=全部功能 / `lite`=跳过 LLM 反思/融合/推理 / `small`=精简提示词(适配本地小模型) |
| `engine` | `graph` | 召回引擎。`graph`=知识图谱+PPR / `vector`=纯向量+BM25 / `hybrid`=两者并行融合 |
| `storage` | `sqlite` | 存储后端。目前仅 SQLite（唯一 IStorageAdapter 实现） |
| `dbPath` | `~/.openclaw/brain-memory.db` | 数据库文件路径。支持 `~` 展开和 `:memory:` 内存模式 |

#### 召回

| 字段 | 默认值 | 作用 |
|------|--------|------|
| `recallMaxNodes` | 6 | 单次召回最多返回的节点数 |
| `recallMaxDepth` | 2 | 图遍历最大跳数。值越大召回越广但越慢 |
| `recallStrategy` | `full` | 记忆注入格式。`full`=完整内容 / `summary`=仅名称+描述 / `adaptive`=≤6节点用full,>6用summary / `off`=不注入 |
| `recallCacheSize` | 100 | LRU 查询缓存容量（0=禁用） |
| `recallCacheTtlMs` | 300000 | 缓存有效期（毫秒），默认 5 分钟 |

#### 图算法

| 字段 | 默认值 | 作用 |
|------|--------|------|
| `dedupThreshold` | 0.90 | 去重相似度阈值。越高越保守（不容易合并），0~1 |
| `pagerankDamping` | 0.85 | PageRank 阻尼系数。标准值 0.85 |
| `pagerankIterations` | 20 | PageRank 迭代次数。越多越精确但越慢 |
| `compactTurnCount` | 6 | 每 N 轮对话触发一次压缩维护 |

#### 衰减

| 字段 | 默认值 | 作用 |
|------|--------|------|
| `decay.enabled` | `true` | 是否启用心记忆衰减 |
| `decay.recencyHalfLifeDays` | 30 | 最近访问的半衰期（天） |
| `decay.timeDecayHalfLifeDays` | 60 | 时间衰减半衰期（天）。动态记忆 ×1/3 加速 |
| `decay.recencyWeight` | 0.4 | 复合分中新近度的权重（0~1） |
| `decay.frequencyWeight` | 0.3 | 复合分中访问频率的权重 |
| `decay.intrinsicWeight` | 0.3 | 复合分中内在重要性的权重 |
| `decay.betaCore` | 0.8 | 核心记忆(importance>0.7)的衰减曲线陡峭度。越小越平缓 |
| `decay.betaWorking` | 1.0 | 工作记忆(0.4~0.7)的衰减曲线陡峭度 |
| `decay.betaPeripheral` | 1.3 | 边缘记忆(≤0.4)的衰减曲线陡峭度。越大衰减越快 |
| `decay.coreDecayFloor` | 0.9 | 核心记忆最低保留比例 |
| `decay.workingDecayFloor` | 0.7 | 工作记忆最低保留比例 |
| `decay.peripheralDecayFloor` | 0.5 | 边缘记忆最低保留比例 |

#### 反思

| 字段 | 默认值 | 作用 |
|------|--------|------|
| `reflection.enabled` | `true` | 是否启用反思系统 |
| `reflection.turnReflection` | `false` | 是否启用轮次反思（每轮对话后轻量扫描）。`false`=仅会话级反思 |
| `reflection.sessionReflection` | `true` | 是否启用会话反思（会话结束后 LLM 全量分析） |
| `reflection.safetyFilter` | `true` | 是否过滤反思内容中的 prompt injection 攻击 |
| `reflection.maxInsights` | 8 | 单次反思最大洞察数 |
| `reflection.importanceBoost` | 0.15 | 反思确认后，相关节点 importance 提升值 |
| `reflection.minConfidence` | 0.6 | 洞察置信度最低阈值（0~1）。低于此值丢弃 |

#### 工作记忆

| 字段 | 默认值 | 作用 |
|------|--------|------|
| `workingMemory.enabled` | `true` | 是否启用工作记忆（追踪当前任务/决策/约束） |
| `workingMemory.maxTasks` | 3 | 最多追踪的当前任务数 |
| `workingMemory.maxDecisions` | 5 | 最多保留的最近决策数 |
| `workingMemory.maxConstraints` | 5 | 最多保留的约束/偏好数 |

#### 融合

| 字段 | 默认值 | 作用 |
|------|--------|------|
| `fusion.enabled` | `true` | 是否启用知识融合（自动合并重复/相关节点） |
| `fusion.similarityThreshold` | 0.75 | 融合候选最低相似度。越高越保守 |
| `fusion.minNodes` | 20 | 触发融合的最低节点数 |
| `fusion.minCommunities` | 3 | 触发融合的最低社区数 |
| `fusion.autoMergeThreshold` | 0.9 | LLM 不可用时自动合并的阈值。≥此值直接 merge |

#### 推理

| 字段 | 默认值 | 作用 |
|------|--------|------|
| `reasoning.enabled` | `true` | 是否启用推理引擎 |
| `reasoning.maxHops` | 2 | 最大推理跳数。A→B→C 为 2 跳 |
| `reasoning.maxConclusions` | 3 | 单次推理最大结论数 |
| `reasoning.minRecallNodes` | 3 | 触发推理的最低召回节点数 |

#### 噪声过滤

| 字段 | 默认值 | 作用 |
|------|--------|------|
| `noiseFilter.enabled` | `true` | 是否过滤寒暄/单字/纯表情等噪声消息 |
| `noiseFilter.minContentLength` | 10 | 最小有效消息长度（字符） |

#### 记忆注入

| 字段 | 默认值 | 作用 |
|------|--------|------|
| `memoryInjection.enabled` | `true` | 是否将召回的记忆注入到 LLM 对话上下文 |
| `memoryInjection.strategy` | `adaptive` | 注入策略。`full`/`summary`/`adaptive`/`off`（同 recallStrategy） |
| `memoryInjection.tokenBudget` | 6000 | 记忆注入的 Token 预算上限 |
| `memoryInjection.maxNodes` | 12 | 单次注入最大节点数（即使预算允许也不超此数） |
| `memoryInjection.includeEpisodic` | `true` | 是否附带原始对话片段（情景回溯） |

#### 多 Agent 共享

| 字段 | 默认值 | 作用 |
|------|--------|------|
| `memorySharing.enabled` | `true` | 是否启用多 Agent 记忆共享 |
| `memorySharing.mode` | `mixed` | 共享模式。`isolated`=完全隔离 / `mixed`=部分类别共享 / `shared`=完全共享 |
| `memorySharing.sharedCategories` | `["profile","preferences"]` | mixed 模式下允许跨 Agent 共享的记忆类别 |
| `memorySharing.allowedAgents` | `[]` | 允许共享的 Agent 列表（空=所有） |

</details>

### 数据库

6 张 SQLite 表 + FTS5 全文索引：

| 表 | 用途 |
|----|------|
| `bm_nodes` | 知识节点（含 8 类分类、六层 scope、PageRank、importance） |
| `bm_edges` | 图谱边（11 种类型，带方向约束） |
| `bm_vectors` | 嵌入向量（BLOB 存储） |
| `bm_messages` | 原始对话消息（三态：未提取/已提取/已归档） |
| `bm_communities` | 社区摘要（LLM 生成 + 嵌入向量） |
| `bm_nodes_fts` | FTS5 全文索引（触发器自动同步） |

### 安全

| 措施 | 说明 |
|------|------|
| SQL 参数化 | 全部查询使用 `?` 占位符，防注入 |
| Scope 隔离 | 六层 scope 参数化查询 + 跨域共享策略 |
| Prompt Injection 防护 | 反思内容经过 6 种不安全模式正则过滤 |
| API 认证 | UI Server 支持 Bearer Token / Query Token |

---

## 🧩 核心 API

```typescript
class ContextEngine {
  processTurn(params): Promise<ProcessTurnResult>    // 处理对话 → 提取知识
  recall(query, scope?): Promise<RecallResult>       // 召回相关记忆
  runMaintenance(): Promise<void>                     // 图维护
  performFusion(sessionId?): Promise<FusionResult>    // 知识融合
  reflectOnSession(id, msgs): Promise<Insight[]>      // 会话反思
  performReasoning(query?): Promise<Conclusion[]>     // 图推理
  getStats(): EngineStats                             // 15+ 维度统计
  healthCheck(): HealthStatus                         // 健康检查
  export(options?): MemoryExport                      // JSON 导出
  import(data): { imported, skipped }                 // JSON 导入
  close(): void                                       // 关闭数据库
}
```

---

## 🏗️ 技术栈

| 组件 | 选型 |
|------|------|
| 语言 | TypeScript 5.9 (strict) |
| 主存储 | SQLite — 唯一真值源 (IStorageAdapter) |
| 语义索引 | LanceDB — 必需伴随索引 (ISearchIndex)，可随时从 SQLite 重建 |
| LLM | OpenAI / DashScope / Ollama / Anthropic 多端自动路由 |
| Embedding | OpenAI-compatible / Ollama |
| 测试 | Vitest 3.2 — **847 用例** (70/72 files)，测试代码 > 源码 |

---

## 🎯 设计理念

| 原则 | 实现 |
|------|------|
| 像人一样记忆 | Weibull 衰减 + 反思 + 推理 |
| 渐进增强 | 三级提取 + 降级设计，零 LLM 仍可用 |
| 知识结构化 | 8 类节点 + 11 种边 + LPA 社区检测 |
| 关注点隔离 | 六层 Scope (platform/workspace/agent/user/chat/thread) |
| 自我维护 | 自动去重 + 融合 + 衰减归档 |
| 可观测 | 847 测试 + 详细日志 + Web 控制面板 |

---

## 📄 许可证

[MIT](LICENSE) · Made with ❤️ for AI Agents
