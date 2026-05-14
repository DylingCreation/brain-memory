/**
 * brain-memory — Temporal classifier (static vs dynamic)
 *
 * Classifies extracted knowledge as:
 *   - "static": persistent facts, concepts, skills that rarely change
 *   - "dynamic": time-sensitive info that may become stale
 *
 * Dynamic info decays 3x faster than static.
 * Ported from memory-lancedb-pro temporal-classifier concept.
 */

export type TemporalType = "static" | "dynamic";

// Patterns indicating time-sensitive / dynamic content
const DYNAMIC_PATTERNS = [
  // Time-relative expressions
  /\b(now|currently|right now|at the moment|today|this week|this month|recently|lately)\b/i,
  // Version numbers (change over time)
  /\bversion\s+\d|v\d+\.\d+|release\s+\d/i,
  // Status indicators
  /\b(broken|failing|deprecated|outdated|changed|moved|renamed)\b/i,
  // Temporary states
  /\b(temporary|temporary fix|workaround|hotfix|patch|quick fix)\b/i,
  // Specific dates / deadlines
  /\b(deadline|due date|by \w+ \d+|until \w+)\b/i,
  // Current config / state that may change
  /\b(current setup|current config|current user|current environment)\b/i,
];

// Patterns indicating stable / static content
const STATIC_PATTERNS = [
  // Definitions and concepts
  /\b(definition|concept|principle|rule|pattern|algorithm)\b/i,
  // Permanent skills and procedures
  /\b(how to|steps? to|procedure|method|technique|approach)\b/i,
  // General facts
  /\b(fact|property|characteristic|feature|attribute)\b/i,
  // User identity / stable preferences
  /\b(always|never|prefer|like to|hate|dislike|must|should)\b/i,
];

/** 时间分类：将节点分为静态或动态类型。 */
export function classifyTemporal(text: string, description: string = ""): TemporalType {
  const combined = `${text} ${description}`;

  // Check static patterns first (they get priority)
  for (const pattern of STATIC_PATTERNS) {
    if (pattern.test(combined)) return "static";
  }

  // Check dynamic patterns
  for (const pattern of DYNAMIC_PATTERNS) {
    if (pattern.test(combined)) return "dynamic";
  }

  // Default: static (conservative — only mark dynamic when confident)
  return "static";
}
