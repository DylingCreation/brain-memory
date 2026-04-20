/**
 * brain-memory — Vector cosine dedup
 *
 * Finds and merges semantically duplicate nodes.
 * Authors: adoresever (graph-memory), brain-memory contributors
 */

import { type DatabaseSyncInstance } from "@photostructure/sqlite";
import type { BmConfig } from "../types.ts";
import { findById, mergeNodes, getAllVectors } from "../store/store.ts";

export interface DedupResult {
  pairs: Array<{ nodeA: string; nodeB: string; nameA: string; nameB: string; similarity: number }>;
  merged: number;
}

function cosineSim(a: Float32Array, b: Float32Array): number {
  const len = Math.min(a.length, b.length);
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-9);
}

export function detectDuplicates(db: DatabaseSyncInstance, cfg: BmConfig): DedupResult["pairs"] {
  const vectors = getAllVectors(db);
  if (vectors.length < 2) return [];
  const threshold = cfg.dedupThreshold;
  const pairs: DedupResult["pairs"] = [];
  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) {
      const sim = cosineSim(vectors[i].embedding, vectors[j].embedding);
      if (sim >= threshold) {
        const nodeA = findById(db, vectors[i].nodeId);
        const nodeB = findById(db, vectors[j].nodeId);
        if (nodeA && nodeB) {
          pairs.push({ nodeA: nodeA.id, nodeB: nodeB.id, nameA: nodeA.name, nameB: nodeB.name, similarity: sim });
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
    if (!a || !b || a.type !== b.type) continue;
    const keepId = a.validatedCount >= b.validatedCount ? a.id : b.id;
    const mergeId = keepId === a.id ? b.id : a.id;
    mergeNodes(db, keepId, mergeId);
    consumed.add(mergeId);
    merged++;
  }
  return { pairs, merged };
}
