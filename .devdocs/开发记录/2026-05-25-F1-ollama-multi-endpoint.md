# F-1 Ollama 多端兼容性修复 — 开发记录

| 字段 | 内容 |
|------|------|
| **日期** | 2026-05-25 |
| **记录人** | OpenClaw CodingHelper |
| **关联版本** | v1.8.0 |
| **对应规划编号** | F-1 |

## 一、开发内容

**涉及文件**:
- `src/engine/llm.ts` — 重写（+120 / -50 行）
- `src/types.ts` — `BmConfig.llm` 新增 `maxTokens?: number` 字段

**核心设计思路**:

将旧版单一 OpenAI-compatible 端点硬编码 + 模型名判断 thinking 关闭 → 替换为**多端路由架构**:

```
createCompleteFn()
    │
    └→ detectEndpointType(baseURL)  ← 按 baseURL 判断端点类型
          │
          ├─ 'ollama'     → ollamaNativeComplete()    /api/chat, think:false
          ├─ 'dashscope'  → dashscopeComplete()       thinking:{type:'disabled'}
          ├─ 'anthropic'  → anthropicComplete()
          └─ 'openai'     → openaiComplete()           /chat/completions
```

**4 项关键修复**:

| 修复 | 旧行为 | 新行为 |
|------|--------|--------|
| thinking 关闭 | `isThinkingModel()` 以模型名判断 → DashScope 格式 `{type:'disabled'}` → Ollama 上静默失效 | `detectEndpointType()` 以 baseURL 判断 → Ollama 用 `think:false`，DashScope 用 `{type:'disabled'}` |
| Ollama 端点路由 | 全部走 `/v1/chat/completions` (OpenAI 兼容) | Ollama 自动路由 `/api/chat` 原生端点 (stream/options/num_predict) |
| maxTokens 可配置 | `max_tokens: 4096` 硬编码在 llm.ts 中 | `LlmConfig.maxTokens` 可选，默认 4096，Ollama 映射到 `options.num_predict` |
| API Key 验证 | 无 apiKey 一律 return null | Ollama 豁免 apiKey 检查 (localhost 不需要) |

**新增导出**: `detectEndpointType()` 和 `LlmEndpointType` 类型公开导出，供测试和外部使用。

## 二、测试

| 验证项 | 结果 |
|--------|------|
| `npm run build` (tsc) | ✅ 零报错 |
| `npm test` 全量 | ✅ 729 pass, 1 fail (预存 perf flake), 0 回归 |
| llm.test.ts | ✅ 4/4 通过 |
| graceful-degrade.test.ts | ✅ 全通过 |
| health-check.test.ts | ✅ 全通过 |
| lite-mode.test.ts | ✅ 全通过 |

## 三、验收确认

| 验收标准 | 状态 |
|---------|------|
| `detectEndpointType()` 覆盖 DashScope + Ollama + OpenAI + Anthropic | ✅ |
| Ollama 场景发送 `think: false` (非 DashScope 格式) | ✅ |
| Ollama 自动路由 `/api/chat` 原生端点 | ✅ |
| `llm.maxTokens` 可配置，默认 4096 | ✅ |
| 非 Ollama 端点行为不变 (OpenAI/DashScope/Anthropic) | ✅ |
| `npm test` 无回归 | ✅ |

## 四、使用示例

```typescript
import { createCompleteFn, detectEndpointType } from 'memory-likehuman-pro';

// Ollama 本地 (localhost:11434) — 无需 apiKey
const ollamaFn = createCompleteFn({
  baseURL: 'http://localhost:11434/v1',
  model: 'qwen3.5:9b',
  maxTokens: 2048,  // v1.8.0 新增: 可配置
});
// → 自动检测为 ollama 端点，使用 /api/chat + think: false

// DashScope 云端
const dsFn = createCompleteFn({
  apiKey: 'sk-xxx',
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  model: 'qwen3.6-plus',
});
// → 自动注入 thinking: { type: 'disabled' }
```

## 五、后续扩展 / 已知限制

- Ollama 端点检测基于 `baseURL.includes('11434') || includes('ollama')`。如果用户 Ollama 部署在非标准端口且无 "ollama" 关键词的域名，会被误判为 OpenAI 兼容端点（仍可工作，但不会获得 `think:false` 加速）
- Ollama 原生 `/api/chat` 响应体有 trailing bytes 问题，已用 `tolerantJsonParse()` 处理
- SiliconFlow/Voyage/TEI/Pinecone 等其他端点的 thinking 优化待用户反馈后扩展
