# User Guide

> 面向 OpenClaw 终端用户的操作指南 — 如何配置、使用和排障 brain-memory。

---

## 一、什么是 brain-memory

brain-memory 是为 AI Agent 打造的**大脑级记忆系统**，让 Agent 像人一样：

| 🧬 人脑能力 | ⚡ brain-memory 实现 |
|:---:|:---|
| 记住重要信息 | 8 类记忆分类 + 知识图谱持久化 |
| 遗忘不重要的 | Weibull 衰减模型，低价值记忆自然淡化 |
| 关联知识 | 个性化 PageRank + 社区检测 |
| 反思总结 | 会话结束自动提取洞察 |
| 推理归纳 | 基于已有知识推导新结论 |

---

## 二、安装

### 方式一：npm 安装

```bash
npm install memory-likehuman-pro
```

### 方式二：Git 克隆（推荐，含配置脚本）

```bash
git clone https://github.com/DylingCreation/brain-memory.git
cd brain-memory
npm install
```

### 方式三：下载 ZIP

1. 访问 [GitHub 仓库](https://github.com/DylingCreation/brain-memory)
2. 点击 **Code → Download ZIP**
3. 解压后安装依赖

---

## 三、快速配置

### 交互式配置（推荐）

运行配置向导，只需提供一次 API Key：

```bash
node scripts/setup.js
```

> 脚本会自动生成完整的 brain-memory 配置并写入 `~/.openclaw/openclaw.json`。
> 只需预览不写入，可加 `--dry` 参数：`node scripts/setup.js --dry`

**支持的预设方案：**

| 预设 | BaseURL | LLM 模型 | Embedding 模型 | 适用场景 |
|------|---------|----------|---------------|---------|
| DashScope | `dashscope.aliyuncs.com` | qwen3.6-plus | text-embedding-v3 | 国内用户，性价比最高 |
| OpenAI | `api.openai.com` | gpt-4o-mini | text-embedding-3-small | OpenAI 用户 |
| SiliconFlow | `api.siliconflow.cn` | Qwen/Qwen2.5-72B-Instruct | BAAI/bge-m3 | 国内开源模型 |
| 自定义 | 手动填写 | 手动填写 | 手动填写 | 其他兼容服务 |

### 手动配置

在 `~/.openclaw/openclaw.json` 中添加：

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
            "apiKey": "your-api-key-here",
            "baseURL": "https://your-embedding-api-endpoint/v1",
            "model": "your-embedding-model"
          }
        }
      }
    }
  }
}
```

> 更多配置模板和高级参数请参考 [SETUP.md](../SETUP.md)。

---

## 四、功能说明

### 1. 知识提取

每次对话后，brain-memory 自动从对话中提取结构化知识：

| 来源 | 提取内容 | 存储类型 |
|------|---------|---------|
| 用户消息 | 意图、问题、偏好、项目信息 | TASK / SKILL / EVENT |
| AI 回复 | 建议、推荐、解决方案、代码 | TASK / SKILL / EVENT |

> AI 回复小于 50 字符的会被自动跳过（如"好的"、"收到"等）。

### 2. 记忆分类

提取的知识按 8 类分类自动归档：

| 分类 | 含义 | 示例 |
|------|------|------|
| **profile** | 用户画像 | "用户是全栈工程师" |
| **preferences** | 用户偏好 | "用户偏好简短回复" |
| **entities** | 实体信息 | "项目使用 SQLite" |
| **events** | 报错/异常 | "Docker 端口冲突" |
| **tasks** | 完成任务 | "实现记忆系统" |
| **skills** | 可复用技能 | "npm install 命令" |
| **cases** | 案例经验 | "先检查端口再部署" |
| **patterns** | 模式规律 | "部署前检查端口是通用规律" |

### 3. 记忆召回

当 Agent 处理新对话时，brain-memory 自动检索相关记忆并注入上下文：

```
用户提问 → 召回相关记忆 → 注入系统提示词 → Agent 基于记忆回答
```

召回策略支持三种模式：

| 模式 | 说明 | 适用 |
|------|------|------|
| `graph`（默认） | 知识图谱 + 社区 + PPR | 需要关系上下文 |
| `vector` | 纯向量 + 全文检索 | 轻量部署 |
| `hybrid` | 图 + 向量并行融合 | 最优召回质量 |

### 4. 工作记忆

brain-memory 自动跟踪当前对话的焦点信息：

- **Current Tasks** — 当前正在处理的任务
- **Recent Decisions** — 最近做出的决策
- **Constraints** — 需要注意的约束条件（如用户偏好）
- **Current Focus** — 当前关注点（用户最新消息摘要）

这些信息会自动注入到 Agent 的系统提示词中。

### 5. 会话反思

会话结束时，brain-memory 自动进行深度分析，提取 4 类洞察：

| 洞察类型 | 含义 | 示例 |
|---------|------|------|
| **user-model** | 关于用户的发现 | "用户讨厌写测试" |
| **agent-model** | 关于 Agent 行为的教训 | "用户纠正了代码格式" |
| **lesson** | 失败/成功经验 | "Docker 部署前必须检查端口" |
| **decision** | 持久决策 | "项目采用 SQLite 而非 LanceDB" |

### 6. 知识融合

自动检测语义重复的节点并合并，保持图谱整洁：

- 名称相似度 + 向量余弦相似度双重检测
- LLM 判断是否应该合并
- 合并时保留验证次数更多的节点

### 7. 推理引擎

基于已有知识推导新结论（4 种推理类型）：

| 类型 | 说明 | 示例 |
|------|------|------|
| **路径推导** | A→B→C 间接关系 | A 用 Docker，Docker 需要端口映射 → A 需要配置端口 |
| **隐含关系** | 共享邻居暗示连接 | A 和 B 都用同一个工具 → 可能相关 |
| **模式泛化** | 多个案例的通用规律 | 多个部署都先检查端口 → 部署前检查端口是通用规律 |
| **矛盾检测** | 内容冲突告警 | 之前说"用 A 方案"，现在说"用 B 方案" |

---

## 五、日常操作

### 查看记忆状态

重启 OpenClaw 后查看日志：

```
[brain-memory] Plugin initialized successfully
[brain-memory] ContextEngine initialized with 42 existing nodes
```

- `42 existing nodes` 表示当前图谱已有 42 个记忆节点
- 无报错说明配置正确

### 调整召回节点数

编辑 `~/.openclaw/openclaw.json`，在 `brain-memory.config` 中添加：

```json
{
  "brain-memory": {
    "enabled": true,
    "config": {
      "recallMaxNodes": 10
    }
  }
}
```

默认值为 `6`，增加可召回更多记忆，但会消耗更多 Token。

### 关闭衰减功能

```json
{
  "brain-memory": {
    "enabled": true,
    "config": {
      "decay": {
        "enabled": false
      }
    }
  }
}
```

> `setup.js` 脚本默认开启衰减（`enabled: true`）。如果不需要，需手动关闭。

### 开启轮次反思

```json
{
  "brain-memory": {
    "enabled": true,
    "config": {
      "reflection": {
        "turnReflection": true
      }
    }
  }
}
```

> ⚠️ 开启后会增加 LLM 调用次数，可能影响响应速度和 API 费用。

---

## 六、常见问题

**Q: 可以不配 Embedding 吗？**

A: 可以。不配 Embedding 会自动降级为 FTS5 全文检索。语义搜索和向量去重功能将不可用。

**Q: LLM 和 Embedding 可以用不同的 API 吗？**

A: 可以。分别配置 `llm.apiKey` / `llm.baseURL` 和 `embedding.apiKey` / `embedding.baseURL` 即可。

**Q: 支持 Anthropic Claude 吗？**

A: 支持。将 `llm.baseURL` 设置为包含 `anthropic` 的 URL（如 `https://api.anthropic.com`），系统会自动切换到 Anthropic API。

**Q: AI 回复的内容会被记住吗？**

A: 会。brain-memory 同时提取用户消息和 AI 回复中的关键信息。但简短回复（<50 字符）会被跳过。

**Q: 记忆会跨会话保留吗？**

A: 会。记忆属于 Agent/Workspace 级别，新会话自动复用历史记忆。

**Q: 怎么知道配置是否生效？**

A: 重启 OpenClaw 后查看日志，无报错即配置成功。日志中会显示已有节点数量。

**Q: 配置文件在哪里？**

A: `~/.openclaw/openclaw.json`（JSON 格式）。

**Q: 运行 setup.js 会覆盖已有配置吗？**

A: 不会。脚本会先备份原文件（`.bak.{时间戳}`），然后仅更新 `plugins.entries["brain-memory"]` 部分。

---

## 七、获取帮助

- 📖 更多配置参数：[SETUP.md](../SETUP.md)
- 📖 开发者编程指南：[docs/usage.md](usage.md)
- 📖 API 参考：[docs/api.md](api.md)
- 🐛 提交问题：[GitHub Issues](https://github.com/DylingCreation/brain-memory/issues)
