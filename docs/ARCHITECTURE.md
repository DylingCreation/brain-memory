# brain-memory 架构设计

> 三层架构：基础层 + 管理层 + 认知层

---

## 一、系统总览

```
                    ┌─────────────────────────────────────┐
                    │         OpenClaw Agent              │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │       ContextEngine 接口             │
                    │  bootstrap / ingest / assemble       │
                    │  compact / afterTurn                 │
                    └──────────────┬──────────────────────┘
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        │                          │                          │
   ┌────▼─────┐            ┌──────▼──────┐            ┌──────▼──────┐
   │ 提取管道  │            │ 召回管道     │            │ 维护管道     │
   │ (after   │            │ (assemble)  │            │ (session_   │
   │  Turn)   │            │             │            │   end)      │
   └────┬─────┘            └──────┬──────┘            └──────┬──────┘
        │                         │                          │
        ▼                         ▼                          ▼
   ┌─────────┐             ┌──────────┐               ┌──────────┐
   │ Extract │             │ Recaller │               │Maintainer│
   │  (LLM)  │             │ (PPR+Vec)│               │ (Dedup+  │
   └────┬────┘             └────┬─────┘               │  PR+Comm)│
        │                       │                     └────┬──────┘
        ▼                       ▼                          │
   ┌─────────────────────────────────────┐                │
   │           存储层 (Store)             │◄───────────────┘
   │  SQLite: nodes / edges / vectors    │                │
   │  FTS5: 全文索引                      │                ▼
   └─────────────────────────────────────┘           ┌──────────┐
                                                     │ Reflect  │
                                                     │  (LLM)   │
                                                     └────┬─────┘
                                                          │
                                                          ▼
                                                   反思节点（带边连接）
```

**新增数据流（阶段四）：**
- `session_end` → 反思系统：LLM 全量分析整个会话，提取洞察存为图谱节点
- `afterTurn` → 工作记忆：每轮更新当前任务目标和关注点
- `assemble` → 推理检索：对召回结果做图遍历推理，多跳结论合成
- 反思节点参与 PPR 排名、社区检测、衰减治理

---

## 二、基础层（Foundation）

### 2.1 数据模型

#### 统一 8 类记忆体系

```
MEMORY_CATEGORIES = [
  "profile",      // 用户画像 — 你是谁、做什么的
  "preferences",  // 用户偏好 — 你喜欢什么、讨厌什么
  "entities",     // 实体信息 — 项目、工具、环境的客观事实
  "events",       // 报错/异常 — 发生过的问题和解决方案
  "tasks",        // 完成任务 — 做过什么、讨论过什么
  "skills",       // 可复用技能 — 怎么做事
  "cases",        // 案例经验 — 具体场景的成功/失败案例
  "patterns",     // 模式规律 — 跨案例的抽象规律
]
```

#### 知识图谱节点（3 种图节点类型）

```
GraphNodeType = "TASK" | "SKILL" | "EVENT"
```

每个节点同时属于一个图节点类型和一个记忆类别：
- TASK 节点 → tasks 类别
- SKILL 节点 → skills 类别
- EVENT 节点 → events 类别
- 反思结果也存为图谱节点（带边连接）

#### 边（5 种关系类型）

```
EdgeType = "USED_SKILL" | "SOLVED_BY" | "REQUIRES" | "PATCHES" | "CONFLICTS_WITH"
```

带有方向约束：
| 边类型 | 源节点 | 目标节点 |
|--------|--------|----------|
| USED_SKILL | TASK | SKILL |
| SOLVED_BY | EVENT 或 SKILL | SKILL |
| REQUIRES | SKILL | SKILL |
| PATCHES | SKILL（新）| SKILL（旧）|
| CONFLICTS_WITH | SKILL | SKILL |

### 2.2 存储层

```
SQLite:
├── bm_nodes          # 节点表（8类 + 衰减字段 + 社区ID + PPR分数 + Scope字段）
├── bm_edges          # 边表（5种关系）
├── bm_vectors        # 向量表（用于语义搜索和去重）
├── bm_messages       # 原始对话消息
├── bm_communities    # 社区摘要
└── bm_nodes_fts      # FTS5 全文索引
```

### 2.3 提取引擎

**职责：** 从对话中提取结构化知识

```
输入：对话消息列表 + 已有节点名称列表
      │
      ▼
   ┌──────────────┐
   │  噪声过滤     │  ← 过滤问候语、确认语等
   └──────┬───────┘
          │
          ▼
   ┌──────────────┐
   │  时间分类     │  ← 标记 static vs dynamic
   └──────┬───────┘
          │
          ▼
   ┌──────────────┐
   │  LLM 提取     │  ← 8类节点 + 5种边
   └──────┬───────┘
          │
          ▼
   ┌──────────────┐
   │  类型校验     │  ← 边约束检查 + 名称标准化
   └──────┬───────┘
          │
          ▼
   输出：ExtractionResult (nodes + edges)
```

**状态：** ✅ 阶段零完成——8 类 + 噪声过滤 + 时间分类

### 2.4 召回引擎

**双路径召回：**

```
                    用户查询
                       │
           ┌───────────┼───────────┐
           │                       │
    ┌──────▼──────┐         ┌──────▼──────┐
    │  精确路径    │         │  泛化路径    │
    │             │         │             │
    │ 向量/FTS5   │         │ 社区向量匹配 │
    │ 种子节点    │         │ → 社区成员   │
    │ 社区扩展    │         │ → 图遍历(1跳)│
    │ 图遍历(N跳) │         │             │
    │ PPR 排名    │         │ PPR 排名    │
    └──────┬──────┘         └──────┬──────┘
           │                       │
           └───────────┬───────────┘
                       │
                ┌──────▼──────┐
                │  合并 + 去重 │
                └──────┬──────┘
                       │
                ┌──────▼──────┐
                │ 衰减加权     │  ← 按 scoreDecay() 调整排名
                └──────┬──────┘
                       │
                       ▼
                最终召回结果
```

**状态：** ✅ 阶段零完成——衰减已集成到召回排序，updateAccess 自动调用

### 2.5 组装引擎

**职责：** 把召回的记忆组装成 Agent 可用的上下文

```
输入：召回的节点 + 边 + 工作记忆
      │
      ▼
   ┌──────────────────────┐
   │  工作记忆注入         │  ← 上下文顶部（最高优先级）
   └──────┬───────────────┘
          │
          ▼
   ┌──────────────────────┐
   │  XML 格式化           │  ← 按社区分组
   └──────┬───────────────┘
          │
          ▼
   ┌──────────────────────┐
   │  情景追溯             │  ← Top 3 节点的原始对话片段
   └──────┬───────────────┘
          │
          ▼
   ┌──────────────────────┐
   │  推理结论（可选）     │  ← 多跳结论合成
   └──────┬───────────────┘
          │
          ▼
   ┌──────────────────────┐
   │  Token 预算管理       │  ← 控制在预算内
   └──────┬───────────────┘
          │
          ▼
   输出：systemPromptAddition + episodicXml + reasoningXml
```

### 2.6 维护引擎

**触发时机：** session_end 或手动调用 `bm_maintain`

```
维护流水线：
  1. 清除缓存 (invalidateGraphCache)
  2. 向量去重 (dedup)  ← 余弦相似度 > 阈值则合并
  3. 知识融合 (fuseKnowledge)  ← 发现跨时期关联（阶段四新增）
  4. 全局 PageRank (computeGlobalPageRank)
  5. 社区检测 (detectCommunities)  ← Label Propagation
  6. 社区摘要 (summarizeCommunities)  ← LLM 生成 + 嵌入
  7. 会话反思 (reflectSession)  ← LLM 全量分析，提取洞察（阶段四新增）
```

### 2.7 ContextEngine 生命周期

```
bootstrap  →  初始化，返回配置
    │
    ▼
ingest  →  消息入库（同步，零 LLM）
    │
    ▼
assemble  →  召回 + 组装上下文（工作记忆 + 记忆 XML + 情景追溯 + 推理结论 + 最后一轮对话）
    │
    ▼
afterTurn  →  每轮提取（LLM 提取三元组 → 入库） + 更新工作记忆 + 可选轮次反思
    │
    ▼
compact  →  批量处理未提取消息（兜底）
    │
    ▼
session_end  →  最终化 + 维护（EVENT→SKILL 晋升 + 融合 + 维护流水线 + 会话反思）
```

---

## 三、管理层（Governance）

### 3.1 衰减模型

**Weibull 分层衰减：**

```
重要性 → 分层：
  > 0.7 → Core 层（beta 小，衰减慢，地板高）
  > 0.4 → Working 层（中等衰减）
  < 0.4 → Peripheral 层（beta 大，衰减快，地板低）

综合分数 = recencyWeight × recency
         + frequencyWeight × frequency
         + intrinsicWeight × intrinsic

dynamic 信息衰减速度 = static 信息 × 3
```

**集成点：** 召回排序时，用衰减分数对 PPR 分数做乘法加权

### 3.2 噪声过滤

```
过滤规则：
  - 长度 < minContentLength → 过滤
  - 以问候语开头 → 过滤（hi/hello/你好/嘿...）
  - 以感谢语开头 → 过滤（thanks/谢谢/多谢...）
  - 短确认语且 < 50 字符 → 过滤（ok/yes/好的/收到...）
```

**集成点：** 消息入库前（ingest）和提取前（extract）

### 3.3 准入控制（✅ 已移植，阶段二 2.4）

```
功能：
  - 限制单位时间内的记忆写入频率
  - 防止相似内容重复写入
  - 记录拒绝审计日志

文件：src/retriever/admission-control.ts
```

### 3.4 意图分析（✅ 已移植，阶段二 2.5）

```
功能：
  - 分析用户查询意图类型
  - 按意图调整召回策略
    - 技术问题 → 侧重 SKILL 和 EVENT
    - 偏好问题 → 侧重 preferences
    - 事实查询 → 侧重 entities 和 profile

文件：src/retriever/intent-analyzer.ts
```

### 3.5 时间分类（✅ 已移植，阶段零 0.7）

```
功能：
  - 分类：static（持久事实）vs dynamic（可能变化）
  - 影响：dynamic 信息衰减速度更快
  - 推断：根据内容特征自动判断

文件：src/temporal/classifier.ts
集成：extractor.extract() 中对每个节点调用 classifyTemporal()
```

### 3.6 偏好槽位（✅ 已移植，阶段三 3.2）

```
功能：
  - 从对话中提取结构化偏好
  - 如：语言偏好、工具偏好、代码风格偏好
  - 独立于图谱的槽位存储

文件：src/preferences/slots.ts
```

### 3.7 Scope 隔离（✅ 已移植，阶段三 3.3）

```
功能：
  - 按 session / agent / workspace 隔离记忆
  - 控制不同 scope 的读写权限
  - 支持跨 scope 检索（需授权）

文件：src/scope/isolation.ts
```

### 3.8 会话压缩（✅ 已移植，阶段三 3.4）

```
功能：
  - 评估长会话的价值
  - 压缩低价值部分
  - 保留关键决策和结论

文件：src/session/compressor.ts
```

---

## 四、认知层（Cognitive）

### 4.1 反思系统（阶段四核心）

**设计理念：** 反思结果存为图谱节点（不是扁平文本），利用图结构优势。

```
触发时机：
  ├── 轮次反思（轻量）— afterTurn 结束时
  │     规则版（默认）：基于节点类型/分类/验证次数做确定性打分
  │       - category in [profile, preferences, cases] → +importance
  │       - validatedCount >= 3 → +importance
  │     LLM 版（可选）：开启 reflection.llmTurnReflection 时使用
  │     设计考量：轮次反思的输入已是结构化元数据，规则判断足够，
  │              LLM 无法带来增量价值反而增加调用成本
  │
  └── 会话反思（重量）— session_end 时
        LLM 全量分析整个会话，提取 4 类洞察：
        ├── user-model deltas（关于用户的发现 → preferences/profile 节点）
        ├── agent-model deltas（关于 Agent 行为的教训 → cases 节点）
        ├── lessons & pitfalls（失败/成功经验 → cases/patterns 节点）
        └── durable decisions（持久决策 → events/tasks 节点）

反射结果处理：
  - 存为图谱节点（带 type + category + 边连接）
  - 参与 PPR 排名、社区检测、衰减治理
  - 安全过滤（sanitizeInjectableReflectionLines）防止 prompt injection
  - 初始 importance 较低（0.3-0.5），需多次验证后才提升

安全机制：
  - 过滤 unsafe injectable 内容（prompt injection 防护）
  - 过滤占位符/空内容
  - 反思节点带 sourceReflectionPath 标记来源

新增文件：src/reflection/prompts.ts, src/reflection/extractor.ts, src/reflection/store.ts
```

### 4.5 LLM 集成测试

```
文件：test/llm-integration.test.ts（7 个测试）
BaseURL：https://coding.dashscope.aliyuncs.com/v1
模型：qwen3.6-plus

覆盖范围：
  - LLM 连通性验证
  - 会话反思端到端测试
  - 推理检索端到端测试
  - 知识融合端到端测试（相似度分析 + LLM 决策）
```

### 4.2 知识融合

```
功能：
  - 基于向量相似度 + 文本语义相似度发现潜在关联节点对
  - LLM 判断两节点是否应融合/关联，输出融合决策
  - 融合节点合并（复用 mergeNodes）
  - 自动添加跨社区关联边

触发条件：图谱节点数 >= 20 且社区数 >= 3（避免小图谱浪费 LLM 调用）

集成点：runMaintenance 中增加融合步骤（去重之后，PPR 之前）

新增文件：src/fusion/analyzer.ts, src/fusion/prompts.ts
```

### 4.3 推理检索

```
功能：
  - 对召回结果做图遍历推理（路径分析、隐含关系推导、多跳结论合成）
  - LLM 从相关节点推理出新结论
  - 例如：
    "A 服务的 Dockerfile" + "B 服务也是 Python+Flask"
    → 推导出："B 可以参考 A 的 Dockerfile"

触发条件：召回节点数 >= 3（单节点无需推理）

集成点：assemble 时如果有推理结果，追加推理结论到上下文

新增文件：src/reasoning/engine.ts, src/reasoning/prompts.ts
```

### 4.4 工作记忆

```
功能：
  - 实时维护当前任务目标和关注点
  - 不是长期记忆，也不是短期缓存
  - 每轮对话自动提取/更新
  - 包括：
    - currentTask（当前任务目标）
    - recentDecisions（最近决策和承诺）
    - constraints（需要注意的约束条件）
    - attention（当前关注点）

集成点：
  - afterTurn 更新工作记忆
  - assemble 注入到上下文顶部（最高优先级）

新增文件：src/working-memory/manager.ts
```

---

## 五、配置模型

```json
{
  "engine": "graph" | "vector" | "hybrid",
  "storage": "sqlite" | "lancedb",
  "dbPath": "~/.openclaw/brain-memory.db",
  "compactTurnCount": 6,
  "recallMaxNodes": 6,
  "recallMaxDepth": 2,
  "recallStrategy": "full" | "summary" | "adaptive" | "off",
  "llm": {
    "apiKey": "...",
    "baseURL": "https://...",
    "model": "..."
  },
  "embedding": {
    "apiKey": "...",
    "baseURL": "https://...",
    "model": "...",
    "dimensions": 512
  },
  "decay": {
    "enabled": true,
    "recencyHalfLifeDays": 30,
    "recencyWeight": 0.4,
    "frequencyWeight": 0.3,
    "intrinsicWeight": 0.3,
    "timeDecayHalfLifeDays": 60,
    "betaCore": 0.8,
    "betaWorking": 1.0,
    "betaPeripheral": 1.3,
    "coreDecayFloor": 0.9,
    "workingDecayFloor": 0.7,
    "peripheralDecayFloor": 0.5
  },
  "noiseFilter": {
    "enabled": true,
    "minContentLength": 10
  },
  "reflection": {
    "enabled": true,
    "turnReflection": false,
    "llmTurnReflection": false,
    "sessionReflection": true,
    "safetyFilter": true,
    "maxInsights": 8,
    "importanceBoost": 0.15,
    "minConfidence": 0.6
  },
  "workingMemory": {
    "enabled": true,
    "maxTasks": 3,
    "maxDecisions": 5,
    "maxConstraints": 5
  },
  "fusion": {
    "enabled": true,
    "similarityThreshold": 0.75,
    "runInMaintenance": true,
    "minNodes": 20,
    "minCommunities": 3
  },
  "reasoning": {
    "enabled": true,
    "maxHops": 2,
    "maxConclusions": 3,
    "minRecallNodes": 3
  }
}
```
