/**
 * brain-memory — Hybrid recall engine (Graph + Vector fusion)
 *
 * Combines graph-based recall (PPR + community) with vector-based recall (RRF).
 * Deduplicates by node ID and fuses scores for final ranking.
 */

import { type DatabaseSyncInstance } from "@photostructure/sqlite";
import type { BmConfig, BmNode, BmEdge } from "../types";
import type { EmbedFn } from "../engine/embed";
import type { ScopeFilter } from "../scope/isolation";
import { Recaller } from "../recaller/recall";
import { VectorRecaller } from "./vector-recall"

export interface HybridRecallResult {
  nodes: BmNode[];
  edges: BmEdge[];
  tokenEstimate: number;
  diagnostics?: {
    graphCount: number;
    vectorCount: number;
    overlapCount: number;
    fusedCount: number;
  };
}

interface ScoredItem {
  node: BmNode;
  graphScore: number;
  vectorScore: number;
  fusedScore: number;
}

export class HybridRecaller {
  private graphRecaller: Recaller;
  private vectorRecaller: VectorRecaller;

  constructor(private db: DatabaseSyncInstance, private cfg: BmConfig) {
    this.graphRecaller = new Recaller(db, cfg);
    this.vectorRecaller = new VectorRecaller(db, cfg);
  }

  setEmbedFn(fn: EmbedFn): void {
    this.graphRecaller.setEmbedFn(fn);
    this.vectorRecaller.setEmbedFn(fn);
  }

  async recall(query: string, scopeFilter?: ScopeFilter): Promise<HybridRecallResult> {
    // Run both recallers in parallel
    const [graphResult, vectorResult] = await Promise.allSettled([
      this.graphRecaller.recall(query, scopeFilter),
      this.vectorRecaller.recall(query, scopeFilter),
    ]);

    const graphNodes = graphResult.status === "fulfilled" ? graphResult.value.nodes : [];
    const graphEdges = graphResult.status === "fulfilled" ? graphResult.value.edges : [];
    const vectorNodes = vectorResult.status === "fulfilled" ? vectorResult.value.nodes : [];

    // Compute RRF-based scores for vector results (rank position → score)
    const vectorRRFScores = this.computeRRFScores(vectorNodes);

    // Normalize scores to [0,1] range before fusion — PPR and RRF are on
    // different scales, so direct averaging is unfair.
    const { graphNorm, vectorNorm } = this.computeNormalization(
      graphNodes.map(n => n?.pagerank ?? 0),
      vectorNodes.map(n => vectorRRFScores.get(n?.id) ?? 0),
    );

    // Merge by node ID
    const nodeMap = new Map<string, ScoredItem>();

    for (const node of graphNodes) {
      if (node && node.id) {
        nodeMap.set(node.id, {
          node,
          graphScore: graphNorm(node.pagerank),
          vectorScore: 0,
          fusedScore: 0,
        });
      }
    }

    let overlapCount = 0;
    for (const node of vectorNodes) {
      if (!node || !node.id) continue;
      const vScore = vectorNorm(vectorRRFScores.get(node.id) ?? 0);
      if (nodeMap.has(node.id)) {
        overlapCount++;
        const existing = nodeMap.get(node.id)!;
        existing.vectorScore = vScore;
        // RRF fusion for overlapping nodes (both sources agree)
        existing.fusedScore = existing.graphScore + vScore;
      } else {
        nodeMap.set(node.id, {
          node,
          graphScore: 0,
          vectorScore: vScore,
          // Vector-only nodes get a discount (no graph edges to add context)
          fusedScore: vScore * 0.8,
        });
      }
    }

    // Graph-only nodes: edges add context value, but slightly less than overlap
    for (const [id, item] of nodeMap) {
      if (item.vectorScore === 0 && item.graphScore > 0) {
        item.fusedScore = item.graphScore * 0.8;
      }
    }

    // Sort by fused score descending
    const sorted = Array.from(nodeMap.values())
      .sort((a, b) => b.fusedScore - a.fusedScore);

    const limit = this.cfg.recallMaxNodes;

    const finalNodes = sorted.slice(0, limit).map(s => s.node);
    const ids = new Set(finalNodes.map(n => n.id));

    // Collect edges that connect final nodes
    const finalEdges = graphEdges.filter(e => ids.has(e.fromId) && ids.has(e.toId));

    return {
      nodes: finalNodes,
      edges: finalEdges,
      tokenEstimate: this.estimateTokens(finalNodes),
      diagnostics: {
        graphCount: graphNodes.length,
        vectorCount: vectorNodes.length,
        overlapCount,
        fusedCount: nodeMap.size,
      },
    };
  }

  /** Compute RRF-based scores from rank position (K=60) */
  private computeRRFScores(nodes: BmNode[]): Map<string, number> {
    const K = 60;
    const scores = new Map<string, number>();
    for (let i = 0; i < nodes.length; i++) {
      scores.set(nodes[i].id, 1 / (K + i + 1));
    }
    return scores;
  }

  /**
   * Compute min-max normalizers for graph and vector scores.
   * Returns functions that map raw scores to [0,1] range,
   * enabling fair fusion across different score scales.
   */
  private computeNormalization(
    graphScores: number[],
    vectorScores: number[],
  ): { graphNorm: (s: number) => number; vectorNorm: (s: number) => number } {
    const norm = (scores: number[]): ((s: number) => number) => {
      if (scores.length === 0) return (s: number) => 0;
      let min = scores[0], max = scores[0];
      for (const s of scores) {
        if (s < min) min = s;
        if (s > max) max = s;
      }
      if (min === undefined || max === undefined) return (s: number) => 0;
      const range = max - min;
      if (range < 1e-9) return (s: number) => 1; // all same score → equal weight
      return (s: number) => (s - min) / range;
    };
    return { graphNorm: norm(graphScores), vectorNorm: norm(vectorScores) };
  }

  private estimateTokens(nodes: BmNode[]): number {
    return Math.ceil(nodes.reduce((s, n) => s + n.content.length + n.description.length, 0) / 3);
  }
}
