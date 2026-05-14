/**
 * brain-memory — Hybrid recall engine (Graph + Vector fusion)
 *
 * Combines graph-based recall (PPR + community) with vector-based recall (RRF).
 * Deduplicates by node ID and fuses scores for final ranking.
 *
 * v1.1.0 F-2: Uses IStorageAdapter.
 */

import type { BmConfig, BmNode, BmEdge } from "../types";
import type { EmbedFn } from "../engine/embed";
import type { ScopeFilter } from "../scope/isolation";
import type { IStorageAdapter } from "../store/adapter";
import { Recaller } from "../recaller/recall";
import { VectorRecaller } from "./vector-recall";

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

  constructor(private storage: IStorageAdapter, private cfg: BmConfig) {
    this.graphRecaller = new Recaller(storage, cfg);
    this.vectorRecaller = new VectorRecaller(storage, cfg);
  }

  setEmbedFn(fn: EmbedFn): void {
    this.graphRecaller.setEmbedFn(fn);
    this.vectorRecaller.setEmbedFn(fn);
  }

  async recall(query: string, scopeFilter?: ScopeFilter): Promise<HybridRecallResult> {
    const [graphResult, vectorResult] = await Promise.allSettled([
      this.graphRecaller.recall(query, scopeFilter),
      this.vectorRecaller.recall(query, scopeFilter),
    ]);

    const graph = graphResult.status === "fulfilled" ? graphResult.value : { nodes: [] as BmNode[], edges: [] as BmEdge[], tokenEstimate: 0 };
    const vector = vectorResult.status === "fulfilled" ? vectorResult.value : { nodes: [] as BmNode[], edges: [] as BmEdge[], tokenEstimate: 0 };

    // Fuse using Reciprocal Rank Fusion (RRF)
    const nodeMap = new Map<string, ScoredItem>();

    for (let i = 0; i < graph.nodes.length; i++) {
      const node = graph.nodes[i];
      const rank = i + 1;
      const graphScore = 1 / (60 + rank); // RRF constant k=60
      if (!nodeMap.has(node.id)) {
        nodeMap.set(node.id, { node, graphScore, vectorScore: 0, fusedScore: graphScore });
      } else {
        const item = nodeMap.get(node.id)!;
        item.graphScore += graphScore;
        item.fusedScore = item.graphScore + item.vectorScore;
      }
    }

    for (let i = 0; i < vector.nodes.length; i++) {
      const node = vector.nodes[i];
      const rank = i + 1;
      const vectorScore = 1 / (60 + rank);
      if (!nodeMap.has(node.id)) {
        nodeMap.set(node.id, { node, graphScore: 0, vectorScore, fusedScore: vectorScore });
      } else {
        const item = nodeMap.get(node.id)!;
        item.vectorScore += vectorScore;
        item.fusedScore = item.graphScore + item.vectorScore;
      }
    }

    const fused = Array.from(nodeMap.values())
      .sort((a, b) => b.fusedScore - a.fusedScore)
      .slice(0, this.cfg.recallMaxNodes);

    const fusedIds = new Set(fused.map(f => f.node.id));
    const graphEdgeIds = new Set(graph.edges.map(e => e.id));

    const overlapCount = graph.nodes.filter(n => fusedIds.has(n.id)).length;

    return {
      nodes: fused.map(f => f.node),
      edges: graph.edges.filter(e => fusedIds.has(e.fromId) && fusedIds.has(e.toId)),
      tokenEstimate: fused.reduce((s, f) => s + (f.node.content?.length || 0), 0),
      diagnostics: {
        graphCount: graph.nodes.length,
        vectorCount: vector.nodes.length,
        overlapCount,
        fusedCount: fused.length,
      },
    };
  }
}
