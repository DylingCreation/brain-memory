/**
 * brain-memory — Similarity utilities
 *
 * Shared similarity functions used across dedup, fusion, and reranking.
 */

export type SimilarityFn = (a: number[], b: number[]) => number;

/** Cosine similarity for number[] vectors (used by reranker) */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;
  const len = Math.min(a.length, b.length);
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < len; i++) {
    if (a[i] !== undefined && b[i] !== undefined) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-9);
}

/** Cosine similarity for Float32Array vectors (used by fusion/dedup) */
export function cosineSimilarityF32(a: Float32Array, b: Float32Array): number {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < len; i++) {
    if (a[i] !== undefined && b[i] !== undefined) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-9);
}
