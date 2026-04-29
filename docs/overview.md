# brain-memory 项目概述

> 统一知识图谱 + 向量记忆系统，专为 AI Agent 设计

---

## v0.2.0 版本能力演进

v0.2.0 主题为**「从功能完整走向生产可靠」**，在 v0.1.9 功能完备的基础上，新增以下核心能力：

| 维度 | 能力 | 说明 |
|------|------|------|
| **可靠性** | 数据库迁移系统 | `migrate()` + `bm_meta` 表，支持旧版本平滑升级 |
| **可靠性** | 优雅降级机制 | LLM/Embedding 不可用时跳过依赖步骤，不崩溃、不产生无效数据 |
| **可观测性** | 健康检查 API | `healthCheck()` 返回结构化状态（整体/组件/统计/运行时长） |
| **可观测性** | 结构化日志 | `BM_LOG_LEVEL=error|warn|info|debug` 四级控制，统一输出格式 |
| **可观测性** | 统计指标增强 | `getStats()` 返回 16+ 字段（节点分类、缓存命中率等） |
| **可观测性** | CLI 诊断工具 | `npm run doctor` 一键检查环境/依赖/配置/DB 状态 |
| **安全性** | SQL 参数化审计 | 89 处 `.prepare()` + 8 处 `.exec()` 逐项审计，100% 安全 |

---

## 项目定位

brain-memory 是一个面向 AI Agent 的**长期记忆系统**，融合 graph-memory（知识图谱）与 memory-lancedb-pro（向量记忆）两大子系统，提供 8 类记忆分类、智能遗忘、知识融合、反思推理等能力。

**一句话概括：** 让 AI Agent 像人一样记住重要信息、遗忘不重要内容、从经验中反思学习。

---

## 核心理念

brain-memory 模拟人脑记忆机制：

| 🧬 人脑机制 | ⚡ 代码实现 |
|:---:|:---|
| 短期记忆 → 长期记忆 | 工作记忆 → 知识图谱持久化 |
| 遗忘曲线 | Weibull 衰减模型（三层分层 + 动态加速） |
| 知识关联 | 个性化 PageRank + 社区检测 |
| 反思总结 | 轮次反思（轻量）+ 会话反思（深度） |
| 归纳推理 | 四类型推理引擎（路径 / 隐含 / 模式 / 矛盾） |

---

## 记忆分类体系

brain-memory 将记忆分为 **8 类**，覆盖对话中所有有价值的信息：

| 分类 | 含义 | 示例 |
|------|------|------|
| **profile** | 用户画像（身份 / 角色 / 背景） | "用户是全栈工程师" |
| **preferences** | 用户偏好（喜欢 / 讨厌 / 习惯） | "用户偏好简短回复" |
| **entities** | 实体信息（项目 / 工具 / 环境） | "项目使用 SQLite" |
| **events** | 报错 / 异常（发生过的问题） | "Docker 端口冲突" |
| **tasks** | 完成任务 / 讨论主题 | "实现记忆系统" |
| **skills** | 可复用技能（怎么做） | "npm install 命令" |
| **cases** | 案例经验（成功 / 失败案例） | "先检查端口再部署" |
| **patterns** | 模式规律（跨案例抽象） | "部署前检查端口是通用规律" |

---

## 图结构

记忆节点之间通过 **边（Edge）** 建立关系，形成知识图谱。

### 3 种图节点类型

| 类型 | 含义 |
|------|------|
| **TASK** | 具体任务或讨论主题 |
| **SKILL** | 可复用操作技能（含工具 / 命令 / API） |
| **EVENT** | 报错或异常事件 |

### 5 种关系类型（严格方向约束）

| 边类型 | 方向 | 含义 |
|--------|------|------|
| **USED_SKILL** | TASK → SKILL | 任务使用了某技能 |
| **SOLVED_BY** | EVENT → SKILL | 异常被某技能解决 |
| **REQUIRES** | SKILL → SKILL | 技能依赖另一技能 |
| **PATCHES** | SKILL → SKILL | 新技能替代旧技能 |
| **CONFLICTS_WITH** | SKILL ↔ SKILL | 两个技能冲突 |

> 边类型的方向受到严格约束，不符合约束的边不会被提取。详见源码：[src/types.ts — EDGE_FROM_CONSTRAINT](../src/types.ts)

---

## 架构概览

brain-memory 采用四层架构：

```
┌─────────────────────────────────────────────────────┐
│                    🌐 API 层                        │
│          ContextEngine（统一门面接口）                │
│  processTurn │ recall │ performFusion │ ...         │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────┐
│                  🎛️ 控制层                          │
│  提取器 │ 召回器 │ 融合器 │ 反思系统 │ 推理引擎       │
│  混合召回 │ 向量召回 │ 重排序 │ 准入控制 │ 工作记忆   │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────┐
│                  ⚙️ 算法层                          │
│  PageRank │ 社区检测(LPA) │ LSH去重 │ 时序分类      │
│  Weibull衰减 │ 意图分析 │ 查询扩展                  │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────┐
│                  💾 存储层                          │
│  SQLite: 6张表 + FTS5全文索引 + 触发器 + 8个索引     │
└─────────────────────────────────────────────────────┘
```

**详细架构图** → [docs/architecture.md](architecture.md)

---

## 核心能力速览

### 双向知识提取
同时从用户消息和 AI 回复中提取知识。AI 回复中的建议、代码、工具推荐都会被记录。

### 双路径召回
- **精确路径**：向量检索 → 社区扩展 → 图遍历 → PPR 排序
- **泛化路径**：社区向量匹配 → 社区成员 → 图遍历 → PPR 排序
- 两条路径并行执行，结果融合排序

### 意图分析
自动识别查询意图（technical / preference / factual / task / general），指导召回策略。

### 查询扩展
14 组中英双语同义词映射，自动将口语化表达转换为正式术语（如"炸了"→"OOM"）。

### 智能遗忘
Weibull 衰减模型，将记忆分为核心 / 工作 / 外围三层，动态信息以 3 倍速衰减。

### 会话反思
会话结束时 LLM 全量分析，提取 4 类洞察（用户模型 / Agent 教训 / 经验 / 决策）。

### 安全防护
6 类 Prompt Injection 防护规则，参数化 SQL 查询防注入，多范围隔离（session / agent / workspace）。

---

## 快速开始

### 安装

```bash
# npm 安装
npm install memory-likehuman-pro

# 或 Git 克隆
git clone https://github.com/DylingCreation/brain-memory.git
cd brain-memory && npm install
```

### 配置

运行交互式配置向导（面向 OpenClaw 用户）：

```bash
node scripts/setup.js
```

或手动编辑 `~/.openclaw/openclaw.json`，详见 [SETUP.md](../SETUP.md)。

### 使用

```typescript
import { ContextEngine, DEFAULT_CONFIG } from 'memory-likehuman-pro';

const engine = new ContextEngine({
  ...DEFAULT_CONFIG,
  llm: { apiKey: 'your-api-key-here', baseURL: 'https://your-endpoint/v1', model: 'your-model' },
  embedding: { apiKey: 'your-api-key-here', baseURL: 'https://your-endpoint/v1', model: 'your-model' }
});

// 处理对话，提取知识
const result = await engine.processTurn({
  sessionId: 'session-1', agentId: 'agent-1', workspaceId: 'workspace-1',
  messages: [{ role: 'user', content: '如何用 Docker 部署 Flask？' }]
});

// 召回相关记忆
const recall = await engine.recall('Docker 部署', 'session-1', 'agent-1', 'workspace-1');
```

详细用法 → [docs/usage.md](usage.md)

---

## 文档导航

| 文档 | 面向人群 | 内容 |
|------|---------|------|
| [README.md](../README.md) | 所有人 | 项目总览、特性、快速开始 |
| [SETUP.md](../SETUP.md) | OpenClaw 用户 | 安装、配置、个性化调整 |
| [docs/usage.md](usage.md) | 开发者 | 编程指南、API 使用、最佳实践 |
| [docs/user-guide.md](user-guide.md) | 终端用户 | 功能说明、日常操作、常见问题 |
| [docs/architecture.md](architecture.md) | 开发者 / 架构师 | 技术架构、数据流、算法详解 |
| [docs/api.md](api.md) | 开发者 | API 快速参考 |
| [docs/api-reference.md](api-reference.md) | 开发者 | API 详细参数说明 |
| [docs/deployment.md](deployment.md) | 运维人员 | 部署操作、日志排查 |
| [docs/security.md](security.md) | 安全人员 | 安全特性、最佳实践 |
| [CHANGELOG.md](../CHANGELOG.md) | 所有人 | 版本更新记录 |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | 贡献者 | 开发规范、提交流程 |
