/**
 * brain-memory — Knowledge Fusion Analyzer
 *
 * Finds potentially duplicate/related node pairs using:
 *  1. Name token overlap (Jaccard similarity)
 *  2. Content vector similarity (cosine similarity on embeddings)
 *  3. Community co-membership bonus
 *
 * Two-phase: cheap heuristics first, then LLM decision for candidates above threshold.
 * Only runs when graph is large enough (minNodes, minCommunities).
 */

import { type DatabaseSyncInstance } from "@photostructure/sqlite";
import type { BmConfig, BmNode } from "../types";
import type { CompleteFn } from "../engine/llm";
import type { EmbedFn } from "../engine/embed";
import { allActiveNodes, getVector, mergeNodes, upsertEdge, normalizeName } from "../store/store";
import { FUSION_DECIDE_SYS } from "./prompts"
// Define cosineSimilarityF32 locally to avoid importing the problematic file
function cosineSimilarityF32(a: Float32Array, b: Float32Array): number {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < len; i++) {
    if (a && b && a[i] !== undefined && b[i] !== undefined) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-9);
}
import { tokenize, jaccardSimilarity } from "../utils/text";

export interface FusionCandidate {
  nodeA: BmNode;
  nodeB: BmNode;
  nameScore: number;
  vectorScore: number;
  combinedScore: number;
  decision: "merge" | "link" | "none";
  reason: string;
}

export interface FusionResult {
  candidates: FusionCandidate[];
  merged: number;
  linked: number;
  durationMs: number;
}

// ─── Threshold Check ──────────────────────────────────────────

export function shouldRunFusion(
  db: DatabaseSyncInstance,
  cfg: BmConfig,
): boolean {
  const nodeCount = db.prepare("SELECT COUNT(*) as c FROM bm_nodes WHERE status='active'").get() as any;
  const communityCount = db.prepare("SELECT COUNT(DISTINCT community_id) as c FROM bm_nodes WHERE community_id IS NOT NULL").get() as any;

  const minNodes = (cfg as any).fusion?.minNodes ?? 20;
  const minCommunities = (cfg as any).fusion?.minCommunities ?? 3;

  return nodeCount.c >= minNodes && communityCount.c >= minCommunities;
}

// ─── Candidate Discovery ──────────────────────────────────────

export function findFusionCandidates(
  db: DatabaseSyncInstance,
  cfg: BmConfig,
  embedFn?: EmbedFn | null,
): FusionCandidate[] {
  const nodes = allActiveNodes(db);
  if (nodes.length < 10) return []; // Need enough nodes for meaningful pairs

  const threshold = cfg.fusion?.similarityThreshold ?? 0.75;
  const namePreFilter = cfg.fusion?.namePreFilterThreshold ?? 0.2;  // #25
  const nameWeight = cfg.fusion?.nameWeight ?? 0.6;                  // #25
  const vectorWeight = cfg.fusion?.vectorWeight ?? 0.4;              // #25
  const candidates: FusionCandidate[] = [];

  // Phase 1: Name token overlap (cheap, no LLM)
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];

      if (!a || !b) continue;

      // Skip same-type check — different types shouldn't merge
      if (a.type !== b.type) continue;

      const nameScore = computeNameSimilarity(a?.name ?? "", b?.name ?? "");
      if (nameScore < namePreFilter) continue; // #25 configurable pre-filter

      // Phase 2: Vector similarity (if embeddings available)
      let vectorScore = 0;
      if (embedFn) {
        const vecA = getVector(db, a.id);
        const vecB = getVector(db, b.id);
        if (vecA && vecB) {
          vectorScore = cosineSimilarityF32(vecA, vecB);
        }
      }

      // Combined score: configurable weights (#25)
      const combinedScore = vectorScore > 0
        ? nameScore * nameWeight + vectorScore * vectorWeight
        : nameScore; // Fallback to name-only if no vectors

      if (combinedScore >= threshold) {
        candidates.push({
          nodeA: a,
          nodeB: b,
          nameScore,
          vectorScore,
          combinedScore,
          decision: "none" as const,
          reason: "",
        });
      }
    }
  }

  return candidates.sort((a, b) => b.combinedScore - a.combinedScore);
}

// ─── LLM Decision ─────────────────────────────────────────────

export async function decideFusion(
  llm: CompleteFn,
  candidates: FusionCandidate[],
  maxCandidates: number = 20,
  autoMergeThreshold: number = 0.9,  // #25 configurable
): Promise<FusionCandidate[]> {
  const topCandidates = candidates.slice(0, maxCandidates);

  for (const candidate of topCandidates) {
    try {
      const { nodeA, nodeB } = candidate;
      const userPrompt = `节点A: [${nodeA.type}] ${nodeA.name}\n描述: ${nodeA.description}\n内容: ${nodeA.content.slice(0, 300)}\n\n节点B: [${nodeB.type}] ${nodeB.name}\n描述: ${nodeB.description}\n内容: ${nodeB.content.slice(0, 300)}\n\n相似度: ${candidate.combinedScore.toFixed(2)}`;

      const raw = await llm(FUSION_DECIDE_SYS, userPrompt);
      const decision = parseFusionDecision(raw);

      candidate.decision = decision.decision;
      candidate.reason = decision.reason;
    } catch {
      // If LLM fails, default to merge for high-similarity pairs (#25 configurable)
      candidate.decision = candidate.combinedScore > autoMergeThreshold ? "merge" : "none";
      candidate.reason = "LLM unavailable, heuristic fallback";
    }
  }

  return topCandidates;
}

// ─── Execute Fusion ───────────────────────────────────────────

export function executeFusion(
  db: DatabaseSyncInstance,
  candidates: FusionCandidate[],
  sessionId: string,
): { merged: number; linked: number } {
  let merged = 0;
  let linked = 0;
  const consumed = new Set<string>();

  for (const candidate of candidates) {
    if (candidate.decision === "none") continue;
    if (!candidate.nodeA || !candidate.nodeB || consumed.has(candidate.nodeA.id) || consumed.has(candidate.nodeB.id)) continue;

    if (candidate.decision === "merge") {
      // Merge: keep higher validatedCount node
      if (!candidate.nodeA || !candidate.nodeB) continue;
      const keepId = candidate.nodeA.validatedCount >= candidate.nodeB.validatedCount
        ? candidate.nodeA.id
        : candidate.nodeB.id;
      const mergeId = keepId === candidate.nodeA.id ? candidate.nodeB.id : candidate.nodeA.id;

      mergeNodes(db, keepId, mergeId);
      consumed.add(mergeId);
      merged++;
    } else if (candidate.decision === "link") {
      // Link: add cross-community edge if they're in different communities
      if (candidate.nodeA.communityId !== candidate.nodeB.communityId) {
        // Use REQUIRES edge for cross-community links
        upsertEdge(db, {
          fromId: candidate.nodeA.id,
          toId: candidate.nodeB.id,
          type: "REQUIRES",
          instruction: candidate.reason,
          sessionId,
        });
        linked++;
      }
    }
  }

  return { merged, linked };
}

// ─── Full Fusion Pipeline ─────────────────────────────────────

export async function runFusion(
  db: DatabaseSyncInstance,
  cfg: BmConfig,
  llm: CompleteFn,
  embedFn?: EmbedFn | null,
  sessionId: string = "fusion",
): Promise<FusionResult> {
  const start = Date.now();

  if (!shouldRunFusion(db, cfg)) {
    return { candidates: [], merged: 0, linked: 0, durationMs: Date.now() - start };
  }

  const candidates = findFusionCandidates(db, cfg, embedFn);
  if (candidates.length === 0) {
    return { candidates: [], merged: 0, linked: 0, durationMs: Date.now() - start };
  }

  const autoMergeThreshold = cfg.fusion?.autoMergeThreshold ?? 0.9;  // #25
  const decided = await decideFusion(llm, candidates, 20, autoMergeThreshold);
  const { merged, linked } = executeFusion(db, decided, sessionId);

  return { candidates: decided, merged, linked, durationMs: Date.now() - start };
}

// ─── Helpers ──────────────────────────────────────────────────

export function computeNameSimilarity(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);

  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  // Exact match after normalization
  if (normalizeName(a) === normalizeName(b)) return 1.0;

  return jaccardSimilarity(tokensA, tokensB);
}

// tokenize, jaccardSimilarity imported from ../utils/text.ts
// cosineSimilarityF32 imported from ../utils/similarity.ts

// Re-export for tests and external callers (backward compatible)
export { tokenize, jaccardSimilarity } from "../utils/text";
export { cosineSimilarityF32 as cosineSimilarity } from "../utils/similarity";

export function parseFusionDecision(raw: string): { decision: "merge" | "link" | "none"; reason: string } {
  try {
    let s = raw.trim();
    s = s.replace(/<think>[\s\S]*?<\/think>/gi, "");
    s = s.replace(/```(?:json)?\s*\n?/i, "").replace(/\n?\s*```\s*$/i, "");
    s = s.trim();
    const first = s.indexOf("{");
    const last = s.lastIndexOf("}");
    if (first !== -1 && last > first) s = s.slice(first, last + 1);

    const p = JSON.parse(s);
    const decision = (p.decision || "none").toLowerCase();
    if (["merge", "link", "none"].includes(decision)) {
      return { decision: decision as any, reason: p.reason || "" };
    }
  } catch { /* fallback */ }
  return { decision: "none", reason: "" };
}
