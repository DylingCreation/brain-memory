/**
 * brain-memory — Text processing utilities
 *
 * Shared tokenization and similarity functions used across
 * fusion analyzer, reflection store, and admission control.
 */

/** Tokenize text into a set of normalized words */
export function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter(t => t.length > 1)
  );
}

/** Jaccard similarity between two token sets */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const item of a) { if (b.has(item)) intersection++; }
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}
