# API Quick Reference

> 所有公开 API 的快速参考。详细参数说明见 [API Reference](api-reference.md)。

---

## ContextEngine

统一上下文引擎，所有功能的入口点。

**源码：** [src/engine/context.ts](../src/engine/context.ts)

### 构造器

```typescript
new ContextEngine(config: BmConfig)
```

### 方法速查

| 方法 | 签名 | 说明 |
|------|------|------|
| **processTurn** | `processTurn(params): Promise<{ extractedNodes, extractedEdges, reflections, workingMemory }>` | 处理对话轮次，提取知识 |
| **recall** | `recall(query, sessionId?, agentId?, workspaceId?): Promise<RecallResult>` | 召回相关记忆 |
| **performFusion** | `performFusion(sessionId?): Promise<FusionResult>` | 知识融合（合并重复节点） |
| **reflectOnSession** | `reflectOnSession(sessionId, messages): Promise<ReflectionInsight[]>` | 会话反思 |
| **performReasoning** | `performReasoning(query?): Promise<ReasoningConclusion[]>` | 推理引擎 |
| **runMaintenance** | `runMaintenance(): Promise<void>` | 图维护（去重 + PageRank + 社区检测） |
| **getWorkingMemoryContext** | `getWorkingMemoryContext(): string \| null` | 获取工作记忆上下文 |
| **searchNodes** | `searchNodes(query, limit?): BmNode[]` | 直接搜索节点 |
| **getAllActiveNodes** | `getAllActiveNodes(): BmNode[]` | 获取所有活跃节点 |
| **getStats** | `getStats(): EngineStats` | 获取全维度统计信息（16+ 字段） |
| **healthCheck** | `healthCheck(): HealthStatus` | 健康检查（整体/组件/统计/运行时长） |
| **close** | `close(): void` | 关闭数据库连接 |

---

## 工具函数

### JSON 提取

| 函数 | 签名 | 说明 |
|------|------|------|
| **extractJson** | `extractJson(raw: string): string` | 从 LLM 响应中提取首个 JSON 对象 |

**源码：** [src/utils/json.ts](../src/utils/json.ts)

### 相似度计算

| 函数 | 签名 | 说明 |
|------|------|------|
| **cosineSimilarity** | `cosineSimilarity(a: number[], b: number[]): number` | number[] 向量余弦相似度 |
| **cosineSimilarityF32** | `cosineSimilarityF32(a: Float32Array, b: Float32Array): number` | Float32Array 向量余弦相似度 |

**源码：** [src/utils/similarity.ts](../src/utils/similarity.ts)

### 文本处理

| 函数 | 签名 | 说明 |
|------|------|------|
| **tokenize** | `tokenize(text: string): Set<string>` | Unicode 感知分词（支持中文） |
| **jaccardSimilarity** | `jaccardSimilarity(a: Set<string>, b: Set<string>): number` | Jaccard 集合相似度 |

**源码：** [src/utils/text.ts](../src/utils/text.ts)

### XML 转义

| 函数 | 签名 | 说明 |
|------|------|------|
| **escapeXml** | `escapeXml(s: string): string` | 转义 `& < > "` 四个特殊字符 |

**源码：** [src/utils/xml.ts](../src/utils/xml.ts)

---

## 类型定义

### 核心类型

| 类型 | 说明 | 源码 |
|------|------|------|
| **BmConfig** | 完整配置对象 | [src/types.ts](../src/types.ts) |
| **BmNode** | 记忆节点 | [src/types.ts](../src/types.ts) |
| **BmEdge** | 知识边 | [src/types.ts](../src/types.ts) |
| **RecallResult** | 召回结果 | [src/types.ts](../src/types.ts) |
| **ExtractionResult** | 提取结果 | [src/types.ts](../src/types.ts) |
| **FusionResult** | 融合结果 | [src/types.ts](../src/types.ts) |
| **ReflectionInsight** | 反思洞察 | [src/types.ts](../src/types.ts) |
| **ReflectionResult** | 反思结果 | [src/types.ts](../src/types.ts) |
| **WorkingMemoryState** | 工作记忆状态 | [src/types.ts](../src/types.ts) |
| **ReasoningConclusion** | 推理结论 | [src/types.ts](../src/types.ts) |
| **ReasoningResult** | 推理结果 | [src/types.ts](../src/types.ts) |
| **ScopeFilter** | 范围过滤器 | [src/types.ts](../src/types.ts) |
| **HealthStatus** | 健康检查结果 | [src/engine/context.ts](../src/engine/context.ts) |
| **EngineStats** | 全维度统计信息 | [src/engine/context.ts](../src/engine/context.ts) |

### 枚举常量

| 常量 | 值 | 说明 |
|------|---|------|
| **MEMORY_CATEGORIES** | `['profile','preferences','entities','events','tasks','skills','cases','patterns']` | 8 类记忆分类 |
| **DEFAULT_CONFIG** | `BmConfig` | 默认配置对象 |

---

## OpenClaw 钩子

brain-memory 作为 OpenClaw 插件自动注册的钩子函数。

**源码：** [openclaw-wrapper.ts](../openclaw-wrapper.ts)

| 钩子 | 触发时机 | 说明 |
|------|---------|------|
| **message_received** | 用户发送消息后 | 提取用户消息中的知识 |
| **message_sent** | AI 回复发送后 | 提取 AI 回复中的建议/代码/承诺 |
| **before_message_write** | AI 回复发送前 | 注入相关记忆到上下文 |
| **session_start** | 新会话开始 | 预热记忆缓存 |
| **session_end** | 会话结束 | 执行反思 + 图维护 |

---

> 详细参数说明、返回值字段、使用示例请参考 [API Reference](api-reference.md)。
