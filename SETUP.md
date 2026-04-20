# brain-memory 安装与配置指南

---

## 一、快速安装

```bash
cd ~/.openclaw/codinghelper/brain-memory
npm install
```

---

## 二、首次配置（30 秒搞定）

运行配置向导，只需提供 **一次** API Key：

```bash
node scripts/setup.js
```

向导会引导你选择 API 提供商 → 填入 API Key → 自动生成完整配置并写入 `~/.openclaw/openclaw.json`。

> 如果不想自动写入，可加 `--dry` 参数仅预览：
> ```bash
> node scripts/setup.js --dry
> ```

**支持的预设方案：**

| 选项 | BaseURL | LLM 模型 | Embedding 模型 | 适用场景 |
|------|---------|----------|---------------|---------|
| 1. DashScope | `dashscope.aliyuncs.com` | qwen3.6-plus | text-embedding-v3 | 国内用户，性价比最高 |
| 2. OpenAI | `api.openai.com` | gpt-4o-mini | text-embedding-3-small | OpenAI 用户 |
| 3. SiliconFlow | `api.siliconflow.cn` | Qwen/Qwen2.5-72B-Instruct | BAAI/bge-m3 | 国内开源模型 |
| 4. 自定义 | 手动填写 | 手动填写 | 手动填写 | 其他兼容 OpenAI API 的服务 |

---

## 三、手动配置

如果你不想用向导，可以直接复制下面的模板，填入你的 API Key，添加到 `~/.openclaw/openclaw.json` 的 `plugins.entries` 中：

### DashScope（通义千问）

```json
{
  "brain-memory": {
    "enabled": true,
    "config": {
      "llm": {
        "apiKey": "sk-your-dashscope-key",
        "baseURL": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "model": "qwen3.6-plus"
      },
      "embedding": {
        "apiKey": "sk-your-dashscope-key",
        "baseURL": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "model": "text-embedding-v3",
        "dimensions": 512
      }
    }
  }
}
```

### OpenAI

```json
{
  "brain-memory": {
    "enabled": true,
    "config": {
      "llm": {
        "apiKey": "sk-your-openai-key",
        "baseURL": "https://api.openai.com/v1",
        "model": "gpt-4o-mini"
      },
      "embedding": {
        "apiKey": "sk-your-openai-key",
        "baseURL": "https://api.openai.com/v1",
        "model": "text-embedding-3-small",
        "dimensions": 1536
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
| `engine` | `graph` | 引擎模式：graph / vector / hybrid |
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

### 关闭衰减（默认关闭）

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

> 注意：`decay.enabled` 在代码默认配置中为 `false`。
> setup.js 向导会主动设为 `true`，手动配置需自行决定是否开启。

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

### 切换 Embedding 提供商

LLM 和 Embedding 可以使用不同的 API：

```json
{
  "brain-memory": {
    "enabled": true,
    "config": {
      "llm": {
        "apiKey": "sk-dashscope-key",
        "baseURL": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "model": "qwen3.6-plus"
      },
      "embedding": {
        "apiKey": "sk-openai-key",
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
brain-memory: ready | db=~/.openclaw/brain-memory.db | engine=graph | storage=sqlite | llm=yes | embed=yes
```

- `llm=yes` → LLM 配置成功
- `embed=yes` → Embedding 配置成功
- `llm=no` → 未配置 LLM，知识提取等功能将被禁用

---

## 七、常见问题

**Q: 可以不配 Embedding 吗？**
A: 可以。不配 Embedding 会自动降级为 FTS5 全文检索，语义搜索和向量去重将不可用。

**Q: LLM 和 Embedding 可以用不同的 API Key 吗？**
A: 可以。分别配置即可。

**Q: 支持 Anthropic Claude 吗？**
A: 支持。设置 `llm.baseURL` 包含 `anthropic` 即可自动切换。

**Q: 怎么知道我的配置是否生效？**
A: 重启后查看日志中的 `llm=yes/no` 和 `embed=yes/no` 状态。

**Q: 配置文件在哪里？**
A: `~/.openclaw/openclaw.json`（JSON 格式）。setup.js 会自动写入此文件。
