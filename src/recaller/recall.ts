/**
 * brain-memory — Dual-path recall with PPR ranking
 *
 * Precise path: vector/FTS5 → community expansion → graph walk → PPR
 * Generalized path: community vector match → members → graph walk → PPR
 * Merge: deduplicate + sort by PPR
 *
 * Authors: adoresever (graph-memory), brain-memory contributors
 */

import { type DatabaseSyncInstance } from "@photostructure/sqlite";
import { createHash } from "crypto";
import type { BmConfig, RecallResult, BmNode, BmEdge } from "../types";
import type { EmbedFn } from "../engine/embed";
import type { ScopeFilter } from "../scope/isolation";
import {
  searchNodes, vectorSearchWithScore, graphWalk,
  communityVectorSearch, nodesByCommunityIds, saveVector, getVectorHash,
  updateAccess,
} from "../store/store";
import { getCommunityPeers, communityRepresentatives } from "../graph/community";
import { personalizedPageRank } from "../graph/pagerank";
import { applyTimeDecay } from "../decay/engine";

export class Recaller {
  private embed: EmbedFn | null = null;

  constructor(private db: DatabaseSyncInstance, private cfg: BmConfig) {}

  setEmbedFn(fn: EmbedFn): void { this.embed = fn; }

  async recall(query: string, scopeFilter?: ScopeFilter, sourceFilter?: "user" | "assistant" | "both"): Promise<RecallResult> {
    const limit = this.cfg.recallMaxNodes;
    const precise = await this.recallPrecise(query, limit, scopeFilter, sourceFilter);
    const generalized = await this.recallGeneralized(query, limit, scopeFilter, sourceFilter);
    const merged = this.mergeResults(precise, generalized);

    if (process.env.BM_DEBUG) {
      const communities = new Set(merged.nodes.map(n => n.communityId).filter(Boolean));
      console.log(`  [DEBUG] recall merged: precise=${precise.nodes.length}, generalized=${generalized.nodes.length} → final=${merged.nodes.length} nodes, ${communities.size} communities`);
    }

    return merged;
  }

  /** 精确召回：向量/FTS5 → 社区扩展 → 图遍历 → PPR 排序 */
  private async recallPrecise(query: string, limit: number, scopeFilter?: ScopeFilter, sourceFilter?: "user" | "assistant" | "both"): Promise<RecallResult> {
    let seeds: BmNode[] = [];

    if (this.embed) {
      try {
        const vec = await this.embed(query);
        const scored = vectorSearchWithScore(this.db, vec, Math.ceil(limit / 2), scopeFilter);
        seeds = scored.map(s => s.node);
        if (seeds.length < 2) {
          const fts = this.searchNodesWithSourceFilter(query, limit, scopeFilter, sourceFilter);
          const seen = new Set(seeds.map(n => n.id));
          seeds.push(...fts.filter(n => !seen.has(n.id)));
        }
      } catch { seeds = this.searchNodesWithSourceFilter(query, limit, scopeFilter, sourceFilter); }
    } else {
      seeds = this.searchNodesWithSourceFilter(query, limit, scopeFilter, sourceFilter);
    }

    if (!seeds.length) return { nodes: [], edges: [], tokenEstimate: 0 };

    const seedIds = seeds.map(n => n.id);
    const expandedIds = new Set(seedIds);
    for (const seed of seeds) {
      const peers = getCommunityPeers(this.db, seed.id, 2);
      for (const p of peers) expandedIds.add(p);
    }

    const { nodes, edges } = graphWalk(this.db, Array.from(expandedIds), this.cfg.recallMaxDepth);
    if (!nodes.length) return { nodes: [], edges: [], tokenEstimate: 0 };

    const candidateIds = nodes.map(n => n.id);
    const { scores: pprScores } = personalizedPageRank(this.db, seedIds, candidateIds, this.cfg);

    let filtered = nodes
      .sort((a, b) => {
        const scoreA = this.cfg.decay.enabled ? applyTimeDecay(pprScores.get(a.id) || 0, a, this.cfg.decay) : (pprScores.get(a.id) || 0);
        const scoreB = this.cfg.decay.enabled ? applyTimeDecay(pprScores.get(b.id) || 0, b, this.cfg.decay) : (pprScores.get(b.id) || 0);
        return scoreB - scoreA || b.validatedCount - a.validatedCount || b.updatedAt - a.updatedAt;
      })
      .slice(0, limit);
      
    // Apply source filter to the final results
    if (sourceFilter && sourceFilter !== "both") {
      filtered = filtered.filter(n => n.source === sourceFilter);
    }

    // Update access counts for decay tracking
    if (this.cfg.decay.enabled) {
      for (const node of filtered) updateAccess(this.db, node.id);
    }

    const ids = new Set(filtered.map(n => n.id));
    return {
      nodes: filtered,
      edges: edges.filter(e => ids.has(e.fromId) && ids.has(e.toId)),
      tokenEstimate: this.estimateTokens(filtered),
    };
  }

  /** 泛化召回：社区向量匹配 → 成员 → 图遍历 → PPR 排序 */
  private async recallGeneralized(query: string, limit: number, scopeFilter?: ScopeFilter, sourceFilter?: "user" | "assistant" | "both"): Promise<RecallResult> {
    let seeds: BmNode[] = [];

    if (this.embed) {
      try {
        const vec = await this.embed(query);
        const scoredCommunities = communityVectorSearch(this.db, vec);
        if (scoredCommunities.length > 0) {
          const communityIds = scoredCommunities.map(c => c.id);
          seeds = nodesByCommunityIds(this.db, communityIds, 3);
        }
      } catch { /* fallback */ }
    }

    if (!seeds.length) seeds = communityRepresentatives(this.db, 2);
    // Filter generalized seeds by scope and source if needed
    if (scopeFilter) {
      seeds = seeds.filter(n => matchesScope(n, scopeFilter));
    }
    if (sourceFilter && sourceFilter !== "both") {
      seeds = seeds.filter(n => n.source === sourceFilter);
    }
    if (!seeds.length) return { nodes: [], edges: [], tokenEstimate: 0 };

    const seedIds = seeds.map(n => n.id);
    const { nodes, edges } = graphWalk(this.db, seedIds, 1);
    if (!nodes.length) return { nodes: [], edges: [], tokenEstimate: 0 };

    const candidateIds = nodes.map(n => n.id);
    const { scores: pprScores } = personalizedPageRank(this.db, seedIds, candidateIds, this.cfg);

    const filtered = nodes
      .sort((a, b) => {
        const scoreA = this.cfg.decay.enabled ? applyTimeDecay(pprScores.get(a.id) || 0, a, this.cfg.decay) : (pprScores.get(a.id) || 0);
        const scoreB = this.cfg.decay.enabled ? applyTimeDecay(pprScores.get(b.id) || 0, b, this.cfg.decay) : (pprScores.get(b.id) || 0);
        return scoreB - scoreA || b.updatedAt - a.updatedAt || b.validatedCount - a.validatedCount;
      })
      .slice(0, limit);

    // Update access counts for decay tracking
    if (this.cfg.decay.enabled) {
      for (const node of filtered) updateAccess(this.db, node.id);
    }

    const ids = new Set(filtered.map(n => n.id));
    return {
      nodes: filtered,
      edges: edges.filter(e => ids.has(e.fromId) && ids.has(e.toId)),
      tokenEstimate: this.estimateTokens(filtered),
    };
  }

  /** 合并两条路径的结果 */
  private mergeResults(precise: RecallResult, generalized: RecallResult): RecallResult {
    const nodeMap = new Map<string, BmNode>();
    const edgeMap = new Map<string, BmEdge>();

    for (const n of precise.nodes) nodeMap.set(n.id, n);
    for (const e of precise.edges) edgeMap.set(e.id, e);
    for (const n of generalized.nodes) {
      if (!nodeMap.has(n.id)) nodeMap.set(n.id, n);
    }

    const finalIds = new Set(nodeMap.keys());
    for (const e of generalized.edges) {
      if (!edgeMap.has(e.id) && finalIds.has(e.fromId) && finalIds.has(e.toId)) {
        edgeMap.set(e.id, e);
      }
    }

    return {
      nodes: Array.from(nodeMap.values()),
      edges: Array.from(edgeMap.values()),
      tokenEstimate: this.estimateTokens(Array.from(nodeMap.values())),
    };
  }

  private estimateTokens(nodes: BmNode[]): number {
    return Math.ceil(nodes.reduce((s, n) => s + n.content.length + n.description.length, 0) / 3);
  }

  /** 异步同步 embedding，不阻塞主流程 */
  async syncEmbed(node: BmNode): Promise<void> {
    if (!this.embed) return;
    const hash = createHash("md5").update(node.content).digest("hex");
    if (getVectorHash(this.db, node.id) === hash) return;
    try {
      const text = `${node.name}: ${node.description}\n${node.content.slice(0, 500)}`;
      const vec = await this.embed(text);
      if (vec.length) saveVector(this.db, node.id, node.content, vec);
    } catch { /* 不影响主流程 */ }
  }
  
  /** Helper method to search nodes with source filter */
  private searchNodesWithSourceFilter(query: string, limit: number, scopeFilter?: ScopeFilter, sourceFilter?: "user" | "assistant" | "both"): BmNode[] {
    const nodes = searchNodes(this.db, query, limit, scopeFilter);
    if (sourceFilter && sourceFilter !== "both") {
      return nodes.filter(n => n.source === sourceFilter);
    }
    return nodes;
  }
}

function matchesScope(node: BmNode, filter: ScopeFilter): boolean {
  // exclude: node must NOT match any excluded scope
  for (const ex of filter.excludeScopes) {
    if (
      (!ex.sessionId || node.scopeSession === ex.sessionId) &&
      (!ex.agentId || node.scopeAgent === ex.agentId) &&
      (!ex.workspaceId || node.scopeWorkspace === ex.workspaceId)
    ) return false;
  }
  // include: if set, node must match at least one included scope
  if (filter.includeScopes.length > 0) {
    return filter.includeScopes.some(
      inc =>
        (!inc.sessionId || node.scopeSession === inc.sessionId) &&
        (!inc.agentId || node.scopeAgent === inc.agentId) &&
        (!inc.workspaceId || node.scopeWorkspace === inc.workspaceId),
    );
  }
  return true;
}
