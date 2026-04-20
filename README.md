# brain-memory

> 让 AI 拥有像人类一样的记忆
>
> Unified AI Memory Engine for OpenClaw — 知识图谱 + 向量检索 + 智能衰减 + 认知推理

---

## 一句话介绍

brain-memory 是 OpenClaw 的 AI 记忆引擎插件，把对话历史变成**结构化知识图谱**，自动提取、召回、遗忘、反思，让 Agent 真正"记住"你。

---

## 设计灵感：人脑记忆系统

| 人类记忆类型 | 功能 | brain-memory 对应 |
|-------------|------|------------------|
| 情景记忆 | 具体场景和经历 | 情景追溯（episodic traces） |
| 语义记忆 | 抽象知识和概念 | 知识图谱节点 + 向量记忆 |
| 程序记忆 | 技能和操作模式 | SKILL 节点 + 反思提炼 |
| 工作记忆 | 当前关注点，短期缓存 | WorkingMemory 管理器 |

**核心理念：**
- 🔹 **遗忘是功能** — 不重要的记忆自然衰减，重要的记忆持久保留
- 🔹 **关系比内容重要** — 图谱的价值不在节点本身，在于节点之间的关系
- 🔹 **反思是主动理解** — 不只是记住对话，而是理解对话的意义

---

## 三层架构

```
┌──────────────────────────────────────────────────┐
│               认知层（Cognitive）                  │
│  反思系统 → 工作记忆 → 知识融合 → 推理检索          │
│  ← 区分"记忆库"和"大脑"的关键                      │
├──────────────────────────────────────────────────┤
│               管理层（Governance）                 │
│  衰减 / 噪声过滤 / 准入控制 / 意图分析             │
│  时间分类 / 偏好槽位 / Scope 隔离 / 会话压缩       │
├──────────────────────────────────────────────────┤
│               基础层（Foundation）                 │
│  图谱 + 向量 + 提取 + 召回 + 组装 + 维护           │
└──────────────────────────────────────────────────┘
```

---

## 快速开始

### 1. 安装

```bash
cd ~/.openclaw/codinghelper/brain-memory   # 或你的项目目录
npm install
```

### 2. 首次配置（30 秒）

运行配置向导，只需提供 **一次** API Key，自动生成完整配置：

```bash
node scripts/setup.js
```

支持 4 种预设方案：

| 方案 | BaseURL | LLM | Embedding |
|------|---------|-----|-----------|
| **DashScope（通义千问）** | `dashscope.aliyuncs.com` | qwen3.6-plus | text-embedding-v3 |
| OpenAI | `api.openai.com` | gpt-4o-mini | text-embedding-3-small |
| SiliconFlow | `api.siliconflow.cn` | Qwen2.5-72B | BAAI/bge-m3 |
| 自定义 | 手动填写 | 手动填写 | 手动填写 |

向导会：
1. 选择 API 提供商 → 填入 API Key
2. 自动生成 LLM + Embedding 完整配置
3. 写入 `~/.openclaw/openclaw.json`（写入前自动备份）
4. 提示重启 OpenClaw

> 也可手动配置，详见 [SETUP.md](SETUP.md)

### 3. 重启生效

```bash
openclaw gateway restart
```

### 4. 验证

重启后查看日志确认状态：

```
brain-memory: ready | db=~/.openclaw/brain-memory.db | engine=graph | storage=sqlite | llm=yes | embed=yes
```

- `llm=yes` → LLM 已配置，知识提取等功能可用
- `embed=yes` → Embedding 已配置，向量语义搜索可用

---

## 核心功能

### 🧠 知识提取

每轮对话自动从对话中提取结构化知识，支持 **8 类记忆体系**：

| 类别 | 说明 | 示例 |
|------|------|------|
| `profile` | 用户画像 | "用户是 Python 开发者" |
| `preferences` | 用户偏好 | "不喜欢多余的空行" |
| `entities` | 实体信息 | "项目使用 Flask 框架" |
| `events` | 报错/异常 | "Docker 端口冲突解决" |
| `tasks` | 完成的任务 | "实现了用户登录功能" |
| `skills` | 可复用技能 | "Git 分支管理规范" |
| `cases` | 案例经验 | "数据库迁移踩坑记录" |
| `patterns` | 模式规律 | "Flask 项目部署最佳实践" |

### 🔍 智能召回

三种召回策略，按查询动态排序：

- **精确路径** — 向量/FTS5 → 社区扩展 → 图遍历 → PPR 排名
- **泛化路径** — 社区向量匹配 → 成员扩展 → 图遍历 → PPR 排名
- **混合路径** — 图召回 + 向量召回融合（Hybrid 模式）

### ⏳ 智能衰减

Weibull 分层衰减模型，按重要性、访问频率、时间综合计算：

- **Core 层**（importance > 0.7）— 衰减慢，持久保留
- **Working 层**（importance > 0.4）— 中等衰减
- **Peripheral 层**（importance < 0.4）— 衰减快，自然遗忘

动态信息（如版本号）衰减速度是静态信息的 3 倍。

### 🤔 反思系统

两类触发机制，结果存为图谱节点：

- **轮次反思**（轻量）— 每轮对话后快速扫描，规则打分（零 LLM 成本）
- **会话反思**（重量）— 会话结束时 LLM 全量分析，提取 4 类洞察：
  - 用户画像变化（preferences/profile）
  - Agent 行为教训（cases）
  - 失败/成功经验（cases/patterns）
  - 持久决策（events/tasks）

### 📋 工作记忆

每轮自动维护当前关注点，注入上下文顶部：
- 当前任务目标
- 最近决策和承诺
- 约束条件和偏好
- 当前关注点

### 🔗 知识融合

发现跨时期的重复/关联知识，自动合并碎片化记忆：
- 名称相似度分析（Jaccard）
- 向量相似度分析（Cosine）
- LLM 决策（merge / link / none）
- 自动添加跨社区关联边

### 🔬 推理检索

对召回结果做图遍历推理，多跳结论合成：
- 路径推导（A→B→C 间接关系）
- 隐含关系（共享邻居发现）
- 模式泛化（多节点相似 → 通用规律）
- 矛盾检测（内容冲突 → 提醒用户）

---

## 引擎模式

| 模式 | 说明 | 适用场景 |
|------|------|---------|
| `graph`（默认） | 知识图谱 + PPR + 社区检测 | 需要关系推理的场景 |
| `vector` | 纯向量 + FTS5 + RRF 融合 | 大规模纯检索场景 |
| `hybrid` | 图 + 向量双引擎融合 | 两者兼有，最佳召回效果 |

---

## 工具列表

| 工具 | 功能 |
|------|------|
| `bm_search` | 搜索知识图谱（PPR + 向量 + 社区扩展） |
| `bm_record` | 手动记录知识节点 |
| `bm_stats` | 查看统计（节点/边/社区/衰减层级） |
| `bm_maintain` | 触发维护（去重 → PPR → 社区检测 → 摘要 → 融合） |
| `bm_reflect` | 手动触发会话反思 |
| `bm_fuse` | 手动触发知识融合 |

> `compact` 是 ContextEngine 生命周期方法（批量处理未提取消息的兜底），不是独立工具。

---

## 配置说明

### 必填项

| 配置 | 说明 |
|------|------|
| `llm.apiKey` | LLM API Key |
| `llm.baseURL` | LLM API 端点（OpenAI 兼容格式） |

### 推荐配置项

| 配置 | 默认值 | 说明 |
|------|--------|------|
| `llm.model` | 见预设方案 | LLM 模型名 |
| `embedding.apiKey` | 同 `llm.apiKey` | Embedding API Key（不配则降级为 FTS5） |
| `engine` | `graph` | 引擎模式：graph / vector / hybrid |
| `recallMaxNodes` | 6 | 召回最大节点数 |

完整配置说明和个性化调整示例见 [SETUP.md](SETUP.md)。

---

## 源码结构

```
.
├── index.ts                    # 插件入口，ContextEngine 生命周期实现
├── openclaw.plugin.json        # OpenClaw 插件声明
├── package.json                # 项目依赖与脚本
├── tsconfig.json               # TypeScript 配置
├── vitest.config.ts            # Vitest 测试配置
├── README.md                   # 项目说明（本文件）
├── SETUP.md                    # 安装与配置指南
├── src/
│   ├── types.ts                # 统一类型定义（8 类 + 图节点 + 边 + 配置）
│   ├── store/                  # 数据库 Schema + CRUD（SQLite + FTS5）
│   │   ├── db.ts               # Schema 定义与初始化
│   │   └── store.ts            # 节点/边/向量操作
│   ├── engine/                 # LLM + Embedding 调用
│   │   ├── llm.ts              # LLM 调用封装（OpenAI 兼容）
│   │   └── embed.ts            # Embedding 调用封装
│   ├── extractor/              # 知识提取（8 类 + 噪声过滤 + 时间分类）
│   │   └── extract.ts          # 提取器主类 + JSON 解析
│   ├── recaller/               # 图召回（PPR + 社区扩展 + 衰减加权）
│   │   └── recall.ts           # 双路径召回
│   ├── retriever/              # 向量/混合召回 + 意图分析 + 查询扩展
│   │   ├── vector-recall.ts    # 纯向量召回（RRF 融合）
│   │   ├── hybrid-recall.ts    # 图+向量混合召回
│   │   ├── reranker.ts         # 交叉编码器重排
│   │   ├── query-expander.ts   # 同义词查询扩展
│   │   ├── intent-analyzer.ts  # 查询意图分类
│   │   └── admission-control.ts# 写入准入控制
│   ├── format/                 # 上下文组装（Token 预算 + 情景追溯）
│   │   └── assemble.ts         # 组装引擎可用上下文
│   ├── graph/                  # PageRank + 社区检测 + 去重 + 维护
│   │   ├── pagerank.ts         # 个性化 PageRank
│   │   ├── community.ts        # 社区检测（Label Propagation）+ 摘要
│   │   ├── dedup.ts            # 向量去重（余弦相似度）
│   │   └── maintenance.ts      # 维护流水线编排
│   ├── decay/                  # Weibull 分层衰减
│   │   └── engine.ts           # 衰减计算引擎
│   ├── noise/                  # 多语言噪声过滤
│   │   └── filter.ts           # 问候语/确认语/短消息过滤
│   ├── temporal/               # 时间分类（static vs dynamic）
│   │   └── classifier.ts       # 自动判断节点时间类型
│   ├── preferences/            # 偏好槽位
│   │   └── slots.ts            # 规则引擎提取偏好
│   ├── scope/                  # 多租户隔离
│   │   └── isolation.ts        # session/agent/workspace 隔离
│   ├── session/                # 会话压缩
│   │   └── compressor.ts       # 长会话价值评估 + 压缩
│   ├── reflection/             # 反思系统
│   │   ├── prompts.ts          # 反思 Prompt 定义
│   │   ├── extractor.ts        # 轮次/会话反思 + 安全过滤
│   │   └── store.ts            # 反思结果存储 + 衰减
│   ├── working-memory/         # 工作记忆
│   │   └── manager.ts          # 零 LLM 提取 + 上下文注入
│   ├── fusion/                 # 知识融合
│   │   ├── prompts.ts          # 融合决策 Prompt
│   │   └── analyzer.ts         # 相似度分析 + LLM 决策 + 融合执行
│   └── reasoning/              # 推理检索
│       ├── prompts.ts          # 推理 Prompt 定义
│       └── engine.ts           # 多跳结论合成
│
├── scripts/
│   └── setup.js                # 首次配置向导
│
└── test/                       # 测试文件（20 个，233 个测试）
    ├── helpers.ts              # 测试工具函数
    ├── store.test.ts
    ├── extractor.test.ts
    ├── recaller.test.ts
    ├── decay.test.ts
    ├── noise.test.ts
    ├── graph.test.ts
    ├── hybrid-recall.test.ts
    ├── integration.test.ts
    ├── llm-integration.test.ts
    ├── vector-recall.test.ts
    ├── intent-analyzer.test.ts
    ├── query-expander.test.ts
    ├── temporal.test.ts
    ├── reflection.test.ts
    ├── working-memory.test.ts
    ├── fusion.test.ts
    └── reasoning.test.ts
```

---

## 技术栈

- **运行环境：** Node.js 22+，OpenClaw 插件
- **数据库：** SQLite + FTS5 全文检索
- **LLM 兼容：** OpenAI、Anthropic、DashScope、SiliconFlow 等
- **测试：** Vitest 226+ 单元测试 + 7 LLM 集成测试

---

## 许可证

MIT
