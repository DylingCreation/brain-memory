/**
 * brain-memory — Token estimation utility
 *
 * Phase 3 (#21 fix): Replaces all hardcoded chars/3 estimations.
 * Uses language-aware ratios for more accurate token estimates.
 */

/**
 * Estimate token count for a text string.
 * Ratios are based on empirical measurements:
 *   Chinese: ~1.8 chars/token
 *   Mixed:   ~2.5 chars/token
 *   English: ~3.5 chars/token (conservative)
 */
/** 估算 token 数量（中英文感知）。 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const chineseRatio = (text.match(/[\u4e00-\u9fff]/g) || []).length / text.length;
  if (chineseRatio > 0.5) return Math.ceil(text.length / 1.8);
  if (chineseRatio > 0.2) return Math.ceil(text.length / 2.5);
  return Math.ceil(text.length / 3.5);
}

/**
 * Estimate token count for a node (name + description + content + XML overhead).
 */
/** 估算节点的 token 数量。 */
export function estimateNodeTokens(node: { name: string; description: string; content: string }): number {
  const text = node.name + node.description + node.content;
  return estimateTokens(text) + 20; // ~20 tokens for XML tags
}
