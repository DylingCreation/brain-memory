/**
 * brain-memory — Small 模式精简提示词
 * v1.6.0 B-1: 目标 ~200 tokens，适配小模型（qwen3.5:9b 等）
 *
 * 对比 Full 模式（提取~1900、反思~2500 tokens），Small 模式压缩率 8-12x。
 */

// ─── Extraction (~180 tokens) ──────────────────────────────

export const EXTRACT_SYS_SMALL = `从AI对话提取知识节点。返回JSON。

格式：{"nodes":[{"name":"知识点","type":"TASK|SKILL|EVENT","category":"tasks|skills|events","content":"描述","source":"user|assistant"}]}

规则：
- type: TASK(任务)/SKILL(技能)/EVENT(事件)
- content: 一句话描述
- 无意义对话跳过
- 最多5个节点`;

// ─── Reflection (~150 tokens) ──────────────────────────────

export const REFLECTION_SYS_SMALL = `总结对话关键发现。返回JSON。

格式：{"summary":"概述","insights":["发现1","发现2"],"actions":["待办1"]}
summary≤100字`;

// ─── Fusion (~120 tokens) ──────────────────────────────────

export const FUSION_DECIDE_SYS_SMALL = `判断两个知识节点是否应合并。返回JSON。

格式：{"decision":"merge|link|none","reason":"判断依据"}

rules: merge=高度重复, link=相关但独立, none=无关`;

// ─── Reasoning (~140 tokens) ────────────────────────────────

export const REASONING_SYS_SMALL = `从知识子图推理新结论。返回JSON。

格式：{"conclusions":[{"text":"结论","type":"path|implicit|pattern|contradiction","confidence":0-1}]}

- type: path(间接关联)/implicit(隐含)/pattern(模式)/contradiction(矛盾)`;
