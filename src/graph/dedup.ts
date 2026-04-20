/**
 * brain-memory — Vector cosine dedup
 *
 * Finds and merges semantically duplicate nodes.
 * Authors: adoresever (graph-memory), brain-memory contributors
 */

import { type DatabaseSyncInstance } from "@photostructure/sqlite";
import type { BmConfig } from "../types";
import { findById, mergeNodes, getAllVectors } from "../store/store";

export interface DedupResult {
  pairs: Array<{ nodeA: string; nodeB: string; nameA: string; nameB: string; similarity: number }>;
  merged: number;
}

function cosineSim(a: Float32Array, b: Float32Array): number {
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

/**
 * LSH-style bucketing using sign-based random projections.
 * Groups similar vectors into the same bucket, reducing pairwise
 * comparisons from O(n²) to O(n × bucket_size).
 */
function buildLshBuckets(
  vectors: Array<{ nodeId: string; embedding: Float32Array }>,
  numBits: number = 8,
): Map<string, number[]> {
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < vectors.length; i++) {
    const v = vectors[i].embedding;
    let sig = "";
    for (let b = 0; b < numBits; b++) {
      // Deterministic pseudo-random index from vector components
      const idx = ((b * 131 + 7) * 3) % v.length;
      sig += v[idx] !== undefined && v[idx] >= 0 ? "1" : "0";
    }
    if (!buckets.has(sig)) buckets.set(sig, []);
    buckets.get(sig)!.push(i);
  }
  return buckets;
}

export function detectDuplicates(db: DatabaseSyncInstance, cfg: BmConfig): DedupResult["pairs"] {
  const vectors = getAllVectors(db);
  if (vectors.length < 2) return [];
  const threshold = cfg.dedupThreshold;
  const pairs: DedupResult["pairs"] = [];

  // LSH bucketing: only compare vectors in the same bucket
  const buckets = buildLshBuckets(vectors);
  const compared = new Set<string>();

  for (const [, members] of buckets) {
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const aIdx = members[i], bIdx = members[j];
        if (aIdx === undefined || bIdx === undefined) continue;
        const key = aIdx < bIdx ? `${aIdx}-${bIdx}` : `${bIdx}-${aIdx}`;
        if (compared.has(key)) continue;
        compared.add(key);

        const vecA = vectors[aIdx]?.embedding;
        const vecB = vectors[bIdx]?.embedding;
        if (!vecA || !vecB) continue;
        const sim = cosineSim(vecA, vecB);
        if (sim >= threshold) {
          const nodeIdA = vectors[aIdx]?.nodeId;
          const nodeIdB = vectors[bIdx]?.nodeId;
          if (!nodeIdA || !nodeIdB) continue;
          const nodeA = findById(db, nodeIdA);
          const nodeB = findById(db, nodeIdB);
          if (nodeA && nodeB) {
            pairs.push({ nodeA: nodeA.id, nodeB: nodeB.id, nameA: nodeA.name || '', nameB: nodeB.name || '', similarity: sim });
          }
        }
      }
    }
  }
  return pairs.sort((a, b) => b.similarity - a.similarity);
}

export function dedup(db: DatabaseSyncInstance, cfg: BmConfig): DedupResult {
  const pairs = detectDuplicates(db, cfg);
  let merged = 0;
  const consumed = new Set<string>();
  for (const pair of pairs) {
    if (consumed.has(pair.nodeA) || consumed.has(pair.nodeB)) continue;
    const a = findById(db, pair.nodeA);
    const b = findById(db, pair.nodeB);
    if (!a || !b || a?.type !== b?.type) continue;
    const keepId = a.validatedCount >= b.validatedCount ? a.id : b.id;
    const mergeId = keepId === a.id ? b.id : a.id;
    mergeNodes(db, keepId, mergeId);
    consumed.add(mergeId);
    merged++;
  }
  return { pairs, merged };
}
