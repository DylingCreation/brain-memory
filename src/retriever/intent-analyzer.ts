/**
 * brain-memory — Lightweight query intent classification
 *
 * Classifies a query into intent categories to guide recall strategy.
 * Rule-based: fast, no LLM needed.
 */

/** 查询意图类型。 */
export type IntentType =
  | "technical"    // how-to, error, skill — prefer SKILL/EVENT nodes
  | "preference"   // user likes/dislikes — prefer preferences/profile
  | "factual"      // entity, fact — prefer entities/profile
  | "task"         // specific task/project — prefer tasks
  | "general";     // fallback — use all categories

interface IntentRule {
  pattern: RegExp;
  intent: IntentType;
  weight: number;
}

// No \b word boundaries — they don't work with Chinese characters
const INTENT_RULES: IntentRule[] = [
  // Technical: how-to, errors, skills
  { pattern: /(怎么|如何|how to|how do|can you|步骤|方法|教程|用法|用法说明)/i, intent: "technical", weight: 1.0 },
  { pattern: /(报错|错误|error|exception|fail|bug|问题|异常|解决|fix|crash)/i, intent: "technical", weight: 1.0 },
  { pattern: /(配置|设置|config|setup|install|安装|部署|deploy)/i, intent: "technical", weight: 0.8 },
  { pattern: /(技能|skill|操作|命令|command|script|脚本)/i, intent: "technical", weight: 0.8 },

  // Preference
  { pattern: /(喜欢|偏好|prefer|习惯|讨厌|hate|不想|不要|推荐)/i, intent: "preference", weight: 1.0 },
  { pattern: /(风格|style|习惯用法|惯例|convention|最佳实践)/i, intent: "preference", weight: 0.8 },

  // Factual
  { pattern: /(是谁|是什么|who is|what is|定义|definition|概念)/i, intent: "factual", weight: 1.0 },
  { pattern: /(项目|project|环境|environment|工具|tool|服务|service)/i, intent: "factual", weight: 0.8 },

  // Task
  { pattern: /(任务|task|进度|status|进展)/i, intent: "task", weight: 1.0 },
];

/** 意图分析结果：包含识别出的意图和分类分数。 */
export interface IntentResult {
  intent: IntentType;
  scores: Record<IntentType, number>;
}

/** 分析查询意图：识别问题类型（how-to/debug/explain/compare）。 */
export function analyzeIntent(query: string): IntentResult {
  const scores: Record<IntentType, number> = {
    technical: 0,
    preference: 0,
    factual: 0,
    task: 0,
    general: 0,
  };

  for (const rule of INTENT_RULES) {
    if (rule.pattern.test(query)) {
      scores[rule.intent] += rule.weight;
    }
  }

  // If no rules match, default to general
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  if (total === 0) {
    scores.general = 1;
  }

  const intent = (Object.entries(scores) as [IntentType, number][])
    .sort((a, b) => b[1] - a[1])[0][0];

  return { intent, scores };
}
