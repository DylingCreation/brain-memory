# brain-memory 安装与配置指南

> 面向 **OpenClaw** 平台用户的快速部署指南。

---

## 一、安装

### 方式一：npm 安装

```bash
npm install memory-likehuman-pro
```

> npm 发布的包仅包含编译后的 `dist/` 目录，不包含源码。

### 方式二：Git 克隆（推荐，含源码和脚本）

```bash
git clone https://github.com/DylingCreation/brain-memory.git
cd brain-memory
npm install
```

### 方式三：下载 ZIP

1. 访问 [https://github.com/DylingCreation/brain-memory](https://github.com/DylingCreation/brain-memory)
2. 点击 **Code → Download ZIP**
3. 解压后安装依赖：

```bash
cd brain-memory
npm install
```

---

## 二、交互式配置（推荐）

运行配置向导，只需提供 **一次** API Key，脚本自动生成完整的 brain-memory 配置并写入 `~/.openclaw/openclaw.json`：

```bash
node scripts/setup.js
```

如果只想预览配置、不写入文件，可加 `--dry` 参数：

```bash
node scripts/setup.js --dry
```

### 支持的预设方案

| 选项 | BaseURL | LLM 模型 | Embedding 模型 | 维度 | 适用场景 |
|------|---------|----------|---------------|:---:|---------|
| 1. DashScope | `dashscope.aliyuncs.com` | qwen3.6-plus | text-embedding-v3 | 512 | 国内用户，性价比最高 |
| 2. OpenAI | `api.openai.com` | gpt-4o-mini | text-embedding-3-small | 1536 | OpenAI 用户 |
| 3. SiliconFlow | `api.siliconflow.cn` | Qwen/Qwen2.5-72B-Instruct | BAAI/bge-m3 | 1024 | 国内开源模型 |
| 4. 自定义 | 手动填写 | 手动填写 | 手动填写 | 512 | 其他兼容 OpenAI API 的服务 |

### 交互流程

```
1. 选择预设方案（1-4）
2. 输入 API Key
3. 确认/修改 BaseURL（预设方案已预填）
4. 确认/修改 LLM 模型名（可选）
5. 确认/修改 Embedding 模型名（可选）
6. 预览生成的完整配置
7. 确认写入 ~/.openclaw/openclaw.json
```

> 写入前会自动备份原配置文件（`.bak.{时间戳}`）。

### 脚本生成的完整配置包含

`setup.js` 不仅配置 API 凭证，还会生成 brain-memory 的 **全部功能配置**：

| 配置模块 | 脚本默认值 |
|---------|-----------|
| `engine` | `"graph"` |
| `storage` | `"sqlite"` |
| `llm` | apiKey + baseURL + model（用户提供） |
| `embedding` | apiKey + baseURL + model + dimensions（基于预设） |
| `decay.enabled` | `true` |
| `decay.recencyHalfLifeDays` | `30` |
| `decay.timeDecayHalfLifeDays` | `60` |
| `noiseFilter.enabled` | `true` |
| `noiseFilter.minContentLength` | `10` |
| `reflection.enabled` | `true` |
| `reflection.turnReflection` | `false` |
| `reflection.sessionReflection` | `true` |
| `reflection.safetyFilter` | `true` |
| `reflection.maxInsights` | `8` |
| `reflection.importanceBoost` | `0.15` |
| `reflection.minConfidence` | `0.6` |
| `workingMemory.enabled` | `true` |
| `workingMemory.maxTasks` | `3` |
| `workingMemory.maxDecisions` | `5` |
| `workingMemory.maxConstraints` | `5` |
| `fusion.enabled` | `true` |
| `fusion.similarityThreshold` | `0.75` |
| `fusion.minNodes` | `20` |
| `fusion.minCommunities` | `3` |
| `reasoning.enabled` | `true` |
| `reasoning.maxHops` | `2` |
| `reasoning.maxConclusions` | `3` |
| `reasoning.minRecallNodes` | `3` |

---

## 三、手动配置

如果不想用交互式脚本，可以直接复制以下模板，填入你的 API Key，添加到 `~/.openclaw/openclaw.json` 的 `plugins.entries` 中：

### DashScope（通义千问）

```json
{
  "plugins": {
    "entries": {
      "brain-memory": {
        "enabled": true,
        "config": {
          "engine": "graph",
          "storage": "sqlite",
          "llm": {
            "apiKey": "your-api-key-here",
            "baseURL": "https://dashscope.aliyuncs.com/compatible-mode/v1",
            "model": "qwen3.6-plus"
          },
          "embedding": {
            "apiKey": "your-api-key-here",
            "baseURL": "https://dashscope.aliyuncs.com/compatible-mode/v1",
            "model": "text-embedding-v3",
            "dimensions": 512
          }
        }
      }
    }
  }
}
```

### OpenAI

```json
{
  "plugins": {
    "entries": {
      "brain-memory": {
        "enabled": true,
        "config": {
          "engine": "graph",
          "storage": "sqlite",
          "llm": {
            "apiKey": "your-api-key-here",
            "baseURL": "https://api.openai.com/v1",
            "model": "gpt-4o-mini"
          },
          "embedding": {
            "apiKey": "your-api-key-here",
            "baseURL": "https://api.openai.com/v1",
            "model": "text-embedding-3-small",
            "dimensions": 1536
          }
        }
      }
    }
  }
}
```

---

## 四、配置项说明

### 必填项

| 配置 | 说明 |
|------|------|
| `llm.apiKey` | LLM API Key（必填） |
| `llm.baseURL` | LLM API 端点（OpenAI 兼容格式） |

### 可选项（有合理默认值）

| 配置 | 默认值 | 说明 |
|------|--------|------|
| `llm.model` | 见预设方案 | LLM 模型名 |
| `embedding.apiKey` | 同 `llm.apiKey` | Embedding API Key（不配则降级为 FTS5） |
| `embedding.baseURL` | 同 `llm.baseURL` | Embedding API 端点 |
| `embedding.model` | 见预设方案 | Embedding 模型名 |
| `embedding.dimensions` | 512 | 向量维度 |
| `engine` | `"graph"` | 引擎模式：`graph` / `vector` / `hybrid` |
| `recallMaxNodes` | 6 | 召回最大节点数 |
| `recallMaxDepth` | 2 | 图遍历深度 |

---

## 五、个性化调整示例

以下示例直接修改 `openclaw.json` 中 `plugins.entries["brain-memory"].config` 内的字段。

### 调整召回策略

```json
{
  "brain-memory": {
    "enabled": true,
    "config": {
      "recallMaxNodes": 10,
      "recallMaxDepth": 3,
      "recallStrategy": "adaptive"
    }
  }
}
```

### 关闭衰减

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

> 注意：`setup.js` 脚本默认将 `decay.enabled` 设为 `true`。如果不需要衰减功能，需手动关闭。

### 开启轮次反思

```json
{
  "brain-memory": {
    "enabled": true,
    "config": {
      "reflection": {
        "turnReflection": true,
        "maxInsights": 12,
        "minConfidence": 0.7
      }
    }
  }
}
```

> 开启轮次反思会增加 LLM 调用次数。

### 切换 Embedding 提供商

LLM 和 Embedding 可以使用不同的 API：

```json
{
  "brain-memory": {
    "enabled": true,
    "config": {
      "llm": {
        "apiKey": "your-dashscope-key-here",
        "baseURL": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "model": "qwen3.6-plus"
      },
      "embedding": {
        "apiKey": "your-openai-key-here",
        "baseURL": "https://api.openai.com/v1",
        "model": "text-embedding-3-small",
        "dimensions": 1536
      }
    }
  }
}
```

### 关闭某个功能

```json
{
  "brain-memory": {
    "enabled": true,
    "config": {
      "fusion": { "enabled": false },
      "reasoning": { "enabled": false },
      "reflection": { "sessionReflection": false }
    }
  }
}
```

### 调整噪声过滤

```json
{
  "brain-memory": {
    "enabled": true,
    "config": {
      "noiseFilter": {
        "enabled": true,
        "minContentLength": 20
      }
    }
  }
}
```

---

## 六、验证配置

重启 OpenClaw 后，查看日志确认 brain-memory 启动状态：

```
[brain-memory] Plugin initialized successfully
[brain-memory] ContextEngine initialized with N existing nodes
```

- 无报错信息 → LLM 和 Embedding 配置成功
- 出现 `LLM not configured` 警告 → LLM 未配置，知识提取等功能将被禁用
- 出现 `Embedding` 相关错误 → Embedding 未配置，将降级为 FTS5 全文检索

---

## 七、常见问题

**Q: 可以不配 Embedding 吗？**

A: 可以。不配 Embedding 会自动降级为 FTS5 全文检索，语义搜索和向量去重将不可用。

**Q: LLM 和 Embedding 可以用不同的 API Key 吗？**

A: 可以。分别配置 `llm.apiKey` 和 `embedding.apiKey` 即可。

**Q: 支持 Anthropic Claude 吗？**

A: 支持。设置 `llm.baseURL` 包含 `anthropic` 即可自动切换到 Anthropic API。

**Q: 怎么知道我的配置是否生效？**

A: 重启 OpenClaw 后查看日志，无报错即配置成功。

**Q: 配置文件在哪里？**

A: `~/.openclaw/openclaw.json`（JSON 格式）。`setup.js` 会自动写入此文件。

**Q: 运行 setup.js 会覆盖已有配置吗？**

A: 不会。脚本会先备份原文件（`.bak.{时间戳}`），然后更新 `plugins.entries["brain-memory"]` 部分，不影响其他插件配置。

**Q: 交互式配置（setup.js）和 configure.js 有什么区别？**

A: `setup.js` 是面向 OpenClaw 用户的完整配置工具 — 生成 brain-memory 全部功能配置并写入 `openclaw.json`。`configure.js` 是通用配置工具 — 仅生成 `config.js`、`.env`、`llm_client.js` 三个文件，不写入 OpenClaw 配置。推荐使用 `setup.js`。
