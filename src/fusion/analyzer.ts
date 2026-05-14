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
 *
 * v1.1.0 F-2: Uses IStorageAdapter instead of DatabaseSyncInstance.
 */

import type { BmConfig, BmNode } from "../types";
import type { IStorageAdapter } from "../store/adapter";
import type { CompleteFn } from "../engine/llm";
import type { EmbedFn } from "../engine/embed";
import { FUSION_DECIDE_SYS } from "./prompts";
import { tokenize, jaccardSimilarity } from "../utils/text";
import { normalizeName } from "../store/store";

function cosineSimilarityF32(a: Float32Array, b: Float32Array): number {
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

/** A pair of nodes flagged as potentially duplicate or related */
export interface FusionCandidate {
  nodeA: BmNode;
  nodeB: BmNode;
  nameScore: number;
  vectorScore: number;
  combinedScore: number;
  decision: "merge" | "link" | "none";
  reason: string;
}

/** The outcome of a full fusion pipeline run */
export interface FusionResult {
  candidates: FusionCandidate[];
  merged: number;
  linked: number;
  durationMs: number;
}

// ─── Threshold Check ──────────────────────────────────────────

/** 判断是否应执行知识融合（节点数和社区数达到阈值）。 */
export function shouldRunFusion(storage: IStorageAdapter, cfg: BmConfig): boolean {
  const stats = storage.getStats();
  const minNodes = cfg.fusion?.minNodes ?? 20;
  const minCommunities = cfg.fusion?.minCommunities ?? 3;
  return stats.activeNodes >= minNodes && stats.communityCount >= minCommunities;
}

// ─── Candidate Discovery ──────────────────────────────────────

/** 查找候选融合节点对：名标 Jaccard 相似度 + 向量余弦相似度。 */
export function findFusionCandidates(
  storage: IStorageAdapter,
  cfg: BmConfig,
  embedFn?: EmbedFn | null,
): FusionCandidate[] {
  const nodes = storage.findAllActive();
  if (nodes.length < 10) return [];

  const threshold = cfg.fusion?.similarityThreshold ?? 0.75;
  const namePreFilter = cfg.fusion?.namePreFilterThreshold ?? 0.2;
  const nameWeight = cfg.fusion?.nameWeight ?? 0.6;
  const vectorWeight = cfg.fusion?.vectorWeight ?? 0.4;
  const candidates: FusionCandidate[] = [];

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      if (!a || !b) continue;
      if (a.type !== b.type) continue;

      const nameScore = computeNameSimilarity(a.name, b.name);
      if (nameScore < namePreFilter) continue;

      let vectorScore = 0;
      if (embedFn) {
        const vecA = storage.getVector(a.id);
        const vecB = storage.getVector(b.id);
        if (vecA && vecB) {
          vectorScore = cosineSimilarityF32(vecA, vecB);
        }
      }

      const combinedScore = vectorScore > 0
        ? nameScore * nameWeight + vectorScore * vectorWeight
        : nameScore;

      if (combinedScore >= threshold) {
        candidates.push({
          nodeA: a, nodeB: b,
          nameScore, vectorScore, combinedScore,
          decision: "none", reason: "",
        });
      }
    }
  }

  return candidates.sort((a, b) => b.combinedScore - a.combinedScore);
}

// ─── LLM Decision ─────────────────────────────────────────────

/** 使用 LLM 决策融合策略：对每一对候选节点决定 merge/link/none。 */
export async function decideFusion(
  llm: CompleteFn,
  candidates: FusionCandidate[],
  maxCandidates: number = 20,
  autoMergeThreshold: number = 0.9,
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
      candidate.decision = candidate.combinedScore > autoMergeThreshold ? "merge" : "none";
      candidate.reason = "LLM unavailable, heuristic fallback";
    }
  }

  return topCandidates;
}

// ─── Execute Fusion ───────────────────────────────────────────

/** 执行融合操作：合并节点或链接跨社区节点。 */
export function executeFusion(
  storage: IStorageAdapter,
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
      const keepId = candidate.nodeA.validatedCount >= candidate.nodeB.validatedCount
        ? candidate.nodeA.id : candidate.nodeB.id;
      const mergeId = keepId === candidate.nodeA.id ? candidate.nodeB.id : candidate.nodeA.id;
      storage.mergeNodes(keepId, mergeId);
      consumed.add(mergeId);
      merged++;
    } else if (candidate.decision === "link") {
      if (candidate.nodeA.communityId !== candidate.nodeB.communityId) {
        storage.upsertEdge({
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

/** 完整的知识融合流程：阈值检查 → 候选发现 → LLM 决策 → 执行。 */
export async function runFusion(
  storage: IStorageAdapter,
  cfg: BmConfig,
  llm: CompleteFn | null,
  embedFn?: EmbedFn | null,
  sessionId: string = "fusion",
): Promise<FusionResult> {
  const start = Date.now();

  if (!shouldRunFusion(storage, cfg)) {
    return { candidates: [], merged: 0, linked: 0, durationMs: Date.now() - start };
  }

  const candidates = findFusionCandidates(storage, cfg, embedFn);
  if (candidates.length === 0) {
    return { candidates: [], merged: 0, linked: 0, durationMs: Date.now() - start };
  }

  const autoMergeThreshold = cfg.fusion?.autoMergeThreshold ?? 0.9;

  let decided: FusionCandidate[];
  if (llm) {
    decided = await decideFusion(llm, candidates, 20, autoMergeThreshold);
  } else {
    decided = candidates.map(c => {
      if (c.combinedScore >= 0.95) return { ...c, decision: "merge" as const, reason: "Auto-merged (high confidence, no LLM)" };
      if (c.combinedScore >= 0.85) return { ...c, decision: "link" as const, reason: "Auto-linked (no LLM)" };
      return { ...c, decision: "none" as const, reason: "Below threshold (no LLM)" };
    });
  }

  const { merged, linked } = executeFusion(storage, decided, sessionId);
  return { candidates: decided, merged, linked, durationMs: Date.now() - start };
}

// ─── Helpers ──────────────────────────────────────────────────

/** 计算两个节点名称的相似度（Jaccard + 精确匹配）。 */
export function computeNameSimilarity(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  if (normalizeName(a) === normalizeName(b)) return 1.0;
  return jaccardSimilarity(tokensA, tokensB);
}

export { tokenize, jaccardSimilarity } from "../utils/text";
export { cosineSimilarityF32 as cosineSimilarity } from "../utils/similarity";

/** 解析 LLM 融合决策输出（提取 JSON 中的 decision 和 reason）。 */
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
