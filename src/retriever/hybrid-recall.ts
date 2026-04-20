/**
 * brain-memory — Hybrid recall engine (Graph + Vector fusion)
 *
 * Combines graph-based recall (PPR + community) with vector-based recall (RRF).
 * Deduplicates by node ID and fuses scores for final ranking.
 */

import { type DatabaseSyncInstance } from "@photostructure/sqlite";
import type { BmConfig, BmNode, BmEdge } from "../types.ts";
import type { EmbedFn } from "../engine/embed.ts";
import { Recaller } from "../recaller/recall.ts";
import { VectorRecaller } from "./vector-recall.ts";

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

  constructor(db: DatabaseSyncInstance, cfg: BmConfig) {
    this.graphRecaller = new Recaller(db, cfg);
    this.vectorRecaller = new VectorRecaller(db, cfg);
  }

  setEmbedFn(fn: EmbedFn): void {
    this.graphRecaller.setEmbedFn(fn);
    this.vectorRecaller.setEmbedFn(fn);
  }

  async recall(query: string): Promise<HybridRecallResult> {
    // Run both recallers in parallel
    const [graphResult, vectorResult] = await Promise.allSettled([
      this.graphRecaller.recall(query),
      this.vectorRecaller.recall(query),
    ]);

    const graphNodes = graphResult.status === "fulfilled" ? graphResult.value.nodes : [];
    const graphEdges = graphResult.status === "fulfilled" ? graphResult.value.edges : [];
    const vectorNodes = vectorResult.status === "fulfilled" ? vectorResult.value.nodes : [];

    // Normalize scores to [0, 1] range for fair fusion
    const graphScores = this.normalizeScores(graphNodes, "pagerank");
    const vectorScores = this.normalizeScores(vectorNodes, "fused");

    // Merge by node ID
    const nodeMap = new Map<string, ScoredItem>();

    for (const node of graphNodes) {
      nodeMap.set(node.id, {
        node,
        graphScore: graphScores.get(node.id) ?? 0,
        vectorScore: 0,
        fusedScore: 0,
      });
    }

    let overlapCount = 0;
    for (const node of vectorNodes) {
      const vScore = vectorScores.get(node.id) ?? 0;
      if (nodeMap.has(node.id)) {
        overlapCount++;
        const existing = nodeMap.get(node.id)!;
        // Average fusion: both sources agree → higher confidence
        existing.vectorScore = vScore;
        existing.fusedScore = (existing.graphScore + vScore) / 2;
      } else {
        nodeMap.set(node.id, {
          node,
          graphScore: 0,
          vectorScore: vScore,
          fusedScore: vScore * 0.6, // Vector-only gets 60% weight
        });
      }
    }

    // Boost graph-only nodes slightly (graph edges add context value)
    for (const [id, item] of nodeMap) {
      if (item.vectorScore === 0 && item.graphScore > 0) {
        item.fusedScore = item.graphScore * 0.7;
      }
    }

    // Sort by fused score descending
    const sorted = Array.from(nodeMap.values())
      .sort((a, b) => b.fusedScore - a.fusedScore);

    const limit = graphResult.status === "fulfilled"
      ? (graphResult.value as any).length ?? 10
      : 10;

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

  /** Normalize scores to [0, 1] using min-max scaling */
  private normalizeScores(nodes: BmNode[], scoreKey: "pagerank" | "fused"): Map<string, number> {
    if (nodes.length === 0) return new Map();

    // Use validatedCount + pagerank as proxy for graph score
    const rawScores = nodes.map(n => {
      if (scoreKey === "pagerank") return n.pagerank;
      return 0.5; // fallback for vector scores (already normalized in VectorRecaller)
    });

    const min = Math.min(...rawScores);
    const max = Math.max(...rawScores);
    const range = max - min || 1;

    const scores = new Map<string, number>();
    nodes.forEach((n, i) => {
      scores.set(n.id, (rawScores[i] - min) / range);
    });

    return scores;
  }

  private estimateTokens(nodes: BmNode[]): number {
    return Math.ceil(nodes.reduce((s, n) => s + n.content.length + n.description.length, 0) / 3);
  }
}
