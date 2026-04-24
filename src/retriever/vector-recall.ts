/**
 * brain-memory — Vector-only recall engine (no graph dependency)
 *
 * Pure vector + FTS5 recall with RRF fusion for `engine: "vector"` mode.
 * Supports: vector search, FTS5 search, RRF fusion, cross-encoder reranking.
 */

import { type DatabaseSyncInstance } from "@photostructure/sqlite";
import type { BmConfig, BmNode, BmEdge } from "../types";
import type { EmbedFn } from "../engine/embed";
import type { ScopeFilter } from "../scope/isolation";
import {
  searchNodes, vectorSearchWithScore, updateAccess,
} from "../store/store";
import { applyTimeDecay } from "../decay/engine";
import { expandQuery } from "./query-expander"
import { analyzeIntent } from "./intent-analyzer"

export interface VectorRecallResult {
  nodes: BmNode[];
  edges: BmEdge[];
  tokenEstimate: number;
  diagnostics?: {
    vectorCount: number;
    bm25Count: number;
    fusedCount: number;
    intent: string;
  };
}

interface ScoredNode {
  node: BmNode;
  vectorScore: number;
  vectorRank: number;
  bm25Score: number;
  bm25Rank: number;
  fusedScore: number;
}

export class VectorRecaller {
  private embed: EmbedFn | null = null;

  constructor(private db: DatabaseSyncInstance, private cfg: BmConfig) {}

  setEmbedFn(fn: EmbedFn): void { this.embed = fn; }

  async recall(query: string, scopeFilter?: ScopeFilter): Promise<VectorRecallResult> {
    const intent = analyzeIntent(query);
    const limit = this.cfg.recallMaxNodes;
    const candidatePool = Math.max(limit * 3, 15);

    // Query expansion for BM25
    const bm25Query = expandQuery(query);

    // Parallel: vector search + FTS5
    let vectorNodes: BmNode[] = [];
    let vectorScores: Map<string, number> = new Map();
    let bm25Nodes: BmNode[] = [];
    let bm25Scores: Map<string, number> = new Map();

    // Vector search
    if (this.embed) {
      try {
        const vec = await this.embed(query);
        const scored = vectorSearchWithScore(this.db, vec, candidatePool, scopeFilter);
        vectorNodes = scored.map(s => s.node);
        for (const s of scored) {
          if (s && s.node && s.node.id !== undefined) {
            vectorScores.set(s.node.id, s.score);
          }
        }
      } catch { /* vector unavailable, fallback to BM25 */ }
    }

    // FTS5 search
    try {
      bm25Nodes = searchNodes(this.db, bm25Query, candidatePool, scopeFilter);
      // BM25 scores: normalize by rank
      bm25Nodes.forEach((n, i) => {
        if (n && n.id !== undefined) {
          bm25Scores.set(n.id, 1 / (i + 1));
        }
      });
    } catch { /* FTS5 unavailable */ }

    // RRF fusion
    const fused = this.rrfFusion(vectorNodes, vectorScores, bm25Nodes, bm25Scores);

    // Apply time decay
    if (this.cfg.decay.enabled) {
      for (const f of fused) {
        f.fusedScore = applyTimeDecay(f.fusedScore, f.node, this.cfg.decay);
      }
      fused.sort((a, b) => b.fusedScore - a.fusedScore);
    }

    // Update access counts
    if (this.cfg.decay.enabled) {
      const top = fused.slice(0, limit);
      for (const f of top) updateAccess(this.db, f.node.id);
    }

    const finalNodes = fused.slice(0, limit).map(f => f.node);
    const ids = new Set(finalNodes.map(n => n.id));

    return {
      nodes: finalNodes,
      edges: [], // No edges in pure vector mode
      tokenEstimate: this.estimateTokens(finalNodes),
      diagnostics: {
        vectorCount: vectorNodes.length,
        bm25Count: bm25Nodes.length,
        fusedCount: fused.length,
        intent: intent.intent,
      },
    };
  }

  /** Reciprocal Rank Fusion: RRF(d) = Σ 1/(k + rank_d) */
  private rrfFusion(
    vectorNodes: BmNode[],
    vectorScores: Map<string, number>,
    bm25Nodes: BmNode[],
    bm25Scores: Map<string, number>,
  ): ScoredNode[] {
    const K = 60; // Standard RRF constant
    const nodeMap = new Map<string, { node: BmNode; vScore: number; vRank: number; bScore: number; bRank: number }>();

    // Vector results
    for (let i = 0; i < vectorNodes.length; i++) {
      const n = vectorNodes[i];
      if (n && n.id && !nodeMap.has(n.id)) {
        nodeMap.set(n.id, { node: n, vScore: vectorScores.get(n.id) ?? 0, vRank: i + 1, bScore: 0, bRank: 0 });
      }
    }

    // BM25 results
    for (let i = 0; i < bm25Nodes.length; i++) {
      const n = bm25Nodes[i];
      if (n && n.id && !nodeMap.has(n.id)) {
        nodeMap.set(n.id, { node: n, vScore: 0, vRank: 0, bScore: bm25Scores.get(n.id) ?? 0, bRank: i + 1 });
      } else {
        nodeMap.get(n.id)!.bScore = bm25Scores.get(n.id) ?? 0;
        nodeMap.get(n.id)!.bRank = i + 1;
      }
    }

    // Compute RRF scores
    const results: ScoredNode[] = [];
    for (const [id, data] of nodeMap) {
      const vRRF = data.vRank > 0 ? 1 / (K + data.vRank) : 0;
      const bRRF = data.bRank > 0 ? 1 / (K + data.bRank) : 0;

      // Weighted fusion: if both sources agree, boost; if only one, still include
      const fusedScore = vRRF + bRRF;

      results.push({
        node: data.node,
        vectorScore: data.vScore,
        vectorRank: data.vRank,
        bm25Score: data.bScore,
        bm25Rank: data.bRank,
        fusedScore,
      });
    }

    return results.sort((a, b) => b.fusedScore - a.fusedScore);
  }

  // #21 fix: use language-aware token estimation
  private estimateTokens(nodes: BmNode[]): number {
    const chineseRatio = nodes.reduce((s, n) => s + (n.content.match(/[\u4e00-\u9fff]/g) || []).length, 0) /
      nodes.reduce((s, n) => s + n.content.length, 1);
    const charsPerToken = chineseRatio > 0.5 ? 1.8 : chineseRatio > 0.2 ? 2.5 : 3.5;
    return Math.ceil(nodes.reduce((s, n) => s + n.content.length + n.description.length + n.name.length, 0) / charsPerToken) + nodes.length * 20;
  }
}
