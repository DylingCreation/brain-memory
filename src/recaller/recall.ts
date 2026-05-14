/**
 * brain-memory — Dual-path recall with unified PPR ranking
 *
 * Phase 2 (#6 + #13 fix):
 *  - Single graphWalk from unified seeds (no duplicate computation)
 *  - Single PPR over merged candidate set (unified, comparable scores)
 *  - Proper merge sorting of precise + generalized results
 *
 * Precise path seeds: vector/FTS5 → community expansion
 * Generalized path seeds: community vector match → members
 *
 * v1.1.0 F-2: Uses IStorageAdapter instead of DatabaseSyncInstance.
 *
 * Authors: adoresever (graph-memory), brain-memory contributors
 */

import { createHash } from "crypto";
import type { BmConfig, RecallResult, BmNode, BmEdge } from "../types";
import type { EmbedFn, BatchEmbedFn } from "../engine/embed";
import type { ScopeFilter } from "../scope/isolation";
import type { IStorageAdapter, StorageFilter } from "../store/adapter";
import { personalizedPageRank } from "../graph/pagerank";
import { applyTimeDecay } from "../decay/engine";
import { estimateNodeTokens } from "../utils/tokens";
import { logger } from "../utils/logger";
// B-4: retriever module integration
import { analyzeIntent } from "../retriever/intent-analyzer";
import { expandQuery } from "../retriever/query-expander";

/** Convert ScopeFilter to StorageFilter for adapter calls */
function toStorageFilter(filter?: ScopeFilter): StorageFilter | undefined {
  if (!filter) return undefined;
  return {
    includeScopes: filter.includeScopes,
    excludeScopes: filter.excludeScopes,
    sharingMode: filter.sharingMode,
    sharedCategories: filter.sharedCategories,
    currentAgentId: filter.currentAgentId,
    allowedAgents: filter.allowedAgents,
  };
}

interface RecallPathResult {
  seeds: string[];
  nodes: BmNode[];
  edges: BmEdge[];
}

/** 双路径召回引擎：精确路径（向量/FTS5） + 泛化路径（社区向量匹配），统一 PPR 排序。 */
export class Recaller {
  private embed: EmbedFn | null = null;
  private batchEmbed: BatchEmbedFn | null = null;

  constructor(private storage: IStorageAdapter, private cfg: BmConfig) {}

  setEmbedFn(fn: EmbedFn): void { this.embed = fn; }
  setBatchEmbedFn(fn: BatchEmbedFn): void { this.batchEmbed = fn; }

  async recall(query: string, scopeFilter?: ScopeFilter, sourceFilter?: "user" | "assistant" | "both"): Promise<RecallResult> {
    const limit = this.cfg.recallMaxNodes;

    // B-4: Intent analysis for diagnostics
    const intent = analyzeIntent(query);
    logger.debug("recall", `intent=${intent.intent} scores=${JSON.stringify(intent.scores)}`);

    // B-4: Query expansion for FTS5 seed acquisition
    const expandedQuery = expandQuery(query);
    if (expandedQuery !== query) {
      logger.debug("recall", `query expanded: "${query}" → "${expandedQuery}"`);
    }

    // Phase 2: Get seeds from both paths
    const preciseSeeds = await this.getPreciseSeeds(expandedQuery, limit, scopeFilter, sourceFilter);
    const generalizedSeeds = await this.getGeneralizedSeeds(query, limit, scopeFilter, sourceFilter);

    if (!preciseSeeds.length && !generalizedSeeds.length) {
      return { nodes: [], edges: [], tokenEstimate: 0 };
    }

    // Unified seed set — deduplicate across paths
    const unifiedSeeds = [...preciseSeeds];
    const preciseSeedSet = new Set(preciseSeeds);
    for (const id of generalizedSeeds) {
      if (!preciseSeedSet.has(id)) unifiedSeeds.push(id);
    }

    // Single graphWalk from unified seeds
    const { nodes, edges } = this.storage.graphWalk(unifiedSeeds, this.cfg.recallMaxDepth);
    if (!nodes.length) return { nodes: [], edges: [], tokenEstimate: 0 };

    // Single PPR over merged candidate set
    const candidateIds = nodes.map(n => n.id);
    const { scores: pprScores } = personalizedPageRank(this.storage, unifiedSeeds, candidateIds, this.cfg);

    // Sort by unified PPR + time decay + validatedCount + updatedAt
    let filtered = nodes
      .sort((a, b) => {
        const scoreA = this.cfg.decay.enabled ? applyTimeDecay(pprScores.get(a.id) || 0, a, this.cfg.decay) : (pprScores.get(a.id) || 0);
        const scoreB = this.cfg.decay.enabled ? applyTimeDecay(pprScores.get(b.id) || 0, b, this.cfg.decay) : (pprScores.get(b.id) || 0);
        return scoreB - scoreA || b.validatedCount - a.validatedCount || b.updatedAt - a.updatedAt;
      })
      .slice(0, limit);

    // Apply source filter after sorting
    if (sourceFilter && sourceFilter !== "both") {
      filtered = filtered.filter(n => n.source === sourceFilter);
    }

    // Update access counts for decay tracking
    if (this.cfg.decay.enabled) {
      for (const node of filtered) this.storage.updateAccess(node.id);
    }

    const ids = new Set(filtered.map(n => n.id));

    logger.debug("recall", `preciseSeeds=${preciseSeeds.length}, generalizedSeeds=${generalizedSeeds.length} → unifiedSeeds=${unifiedSeeds.length} → final=${filtered.length} nodes, ${new Set(filtered.map(n => n.communityId).filter(Boolean)).size} communities`);

    return {
      nodes: filtered,
      edges: edges.filter(e => ids.has(e.fromId) && ids.has(e.toId)),
      tokenEstimate: this.estimateTokens(filtered),
    };
  }

  // ─── Seed Acquisition ───────────────────────────────────────

  /** Get precise path seeds: vector/FTS5 → community expansion */
  private async getPreciseSeeds(query: string, limit: number, scopeFilter?: ScopeFilter, sourceFilter?: "user" | "assistant" | "both"): Promise<string[]> {
    let seeds: BmNode[] = [];
    const sf = toStorageFilter(scopeFilter);

    if (this.embed) {
      try {
        const vec = await this.embed(query);
        const scored = this.storage.vectorSearchWithScore(vec, Math.ceil(limit / 2), sf);
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

    if (!seeds.length) return [];

    // Community expansion
    const expandedIds = new Set<string>(seeds.map(n => n.id));
    for (const seed of seeds) {
      const peers = this.storage.findCommunityPeers(seed.id, 2);
      for (const p of peers) expandedIds.add(p);
    }

    return Array.from(expandedIds);
  }

  /** Get generalized path seeds: community vector match → members */
  private async getGeneralizedSeeds(query: string, limit: number, scopeFilter?: ScopeFilter, sourceFilter?: "user" | "assistant" | "both"): Promise<string[]> {
    let seeds: BmNode[] = [];

    if (this.embed) {
      try {
        const vec = await this.embed(query);
        const scoredCommunities = this.storage.communityVectorSearch(vec, 0.15);
        if (scoredCommunities.length > 0) {
          const communityIds = scoredCommunities.map(c => c.id);
          seeds = this.storage.findNodesByCommunities(communityIds, 3);
        }
      } catch { /* fallback */ }
    }

    if (!seeds.length) seeds = this.storage.findCommunityRepresentatives(2);

    // Filter by scope and source
    if (scopeFilter) {
      seeds = seeds.filter(n => matchesScope(n, scopeFilter));
    }
    if (sourceFilter && sourceFilter !== "both") {
      seeds = seeds.filter(n => n.source === sourceFilter);
    }

    return seeds.map(n => n.id);
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private estimateTokens(nodes: BmNode[]): number {
    return nodes.reduce((s, n) => s + estimateNodeTokens(n), 0);
  }

  /** #12/#14: Batch embed multiple nodes at once */
  async batchSyncEmbed(nodes: BmNode[]): Promise<void> {
    if (!this.embed || nodes.length === 0) return;

    const needEmbed: BmNode[] = [];
    for (const node of nodes) {
      const hash = createHash("md5").update(node.content).digest("hex");
      if (this.storage.getVectorHash(node.id) !== hash) needEmbed.push(node);
    }
    if (needEmbed.length === 0) return;

    try {
      const allChunks: string[] = [];
      const nodeChunkMap: Map<string, number[]> = new Map();

      for (const node of needEmbed) {
        const text = this.buildEmbeddingText(node);
        const chunks = this.chunkText(text, 400);
        const startIdx = allChunks.length;
        nodeChunkMap.set(node.id, chunks.map((_, i) => startIdx + i));
        allChunks.push(...chunks);
      }

      const vectors = this.batchEmbed
        ? await this.batchEmbed(allChunks)
        : await Promise.all(allChunks.map(c => this.embed!(c)));

      for (const node of needEmbed) {
        const indices = nodeChunkMap.get(node.id)!;
        const nodeVectors = indices.map(i => vectors[i]).filter(v => v && v.length > 0);
        if (nodeVectors.length > 0) {
          const vec = nodeVectors.length === 1 ? nodeVectors[0] : this.meanAggregate(nodeVectors);
          this.storage.saveVector(node.id, node.content, vec);
        }
      }
    } catch { /* 不影响主流程 */ }
  }

  /** Async sync embedding, doesn't block main flow */
  async syncEmbed(node: BmNode): Promise<void> {
    if (!this.embed) return;
    const hash = createHash("md5").update(node.content).digest("hex");
    if (this.storage.getVectorHash(node.id) === hash) return;
    try {
      const text = this.buildEmbeddingText(node);
      const chunks = this.chunkText(text, 400);

      let vec: number[];
      if (chunks.length === 1) {
        vec = await this.embed(chunks[0]);
      } else if (this.batchEmbed) {
        const vectors = await this.batchEmbed(chunks);
        vec = this.meanAggregate(vectors);
      } else {
        const vectors: number[][] = [];
        for (const chunk of chunks) {
          const v = await this.embed(chunk);
          if (v.length) vectors.push(v);
        }
        vec = vectors.length > 0 ? this.meanAggregate(vectors) : [];
      }

      if (vec.length) this.storage.saveVector(node.id, node.content, vec);
    } catch { /* 不影响主流程 */ }
  }

  /** Build embedding text with smart truncation */
  private buildEmbeddingText(node: BmNode): string {
    const header = `${node.name}: ${node.description}\n`;
    const maxContentLen = 1200;
    const content = node.content;
    if (content.length <= maxContentLen) return header + content;

    let cutPoint = maxContentLen;
    const paragraphBreak = content.lastIndexOf('\n\n', cutPoint);
    if (paragraphBreak > cutPoint * 0.6) {
      cutPoint = paragraphBreak + 2;
    } else {
      let sentenceBreak = -1;
      for (let i = cutPoint; i > cutPoint * 0.5; i--) {
        if (/[.!?。！？]/.test(content[i]) && (i + 1 >= content.length || /\s/.test(content[i + 1]))) {
          sentenceBreak = i + 1;
          break;
        }
      }
      if (sentenceBreak > cutPoint * 0.7) cutPoint = sentenceBreak;
    }
    return header + content.slice(0, cutPoint);
  }

  /** Chunk text at natural boundaries */
  private chunkText(text: string, maxChunkSize: number): string[] {
    if (text.length <= maxChunkSize) return [text];

    const chunks: string[] = [];
    let pos = 0;
    while (pos < text.length) {
      let end = Math.min(pos + maxChunkSize, text.length);
      if (end < text.length) {
        const paragraphBreak = text.lastIndexOf('\n\n', end);
        if (paragraphBreak > pos + maxChunkSize * 0.5) {
          end = paragraphBreak + 2;
        } else {
          let sentenceBreak = -1;
          for (let i = end; i > pos + maxChunkSize * 0.5; i--) {
            if (/[.!?。！？]/.test(text[i]) && (i + 1 >= text.length || /\s/.test(text[i + 1]))) {
              sentenceBreak = i + 1;
              break;
            }
          }
          if (sentenceBreak > 0) end = sentenceBreak;
        }
      }
      chunks.push(text.slice(pos, end));
      pos = end;
    }
    return chunks;
  }

  /** Mean-aggregate multiple vectors */
  private meanAggregate(vectors: number[][]): number[] {
    if (vectors.length === 0) return [];
    if (vectors.length === 1) return vectors[0];
    const dim = vectors[0].length;
    const sum = new Float64Array(dim);
    for (const vec of vectors) {
      for (let i = 0; i < dim; i++) sum[i] += vec[i];
    }
    const avg = Array.from(sum).map(v => v / vectors.length);
    const norm = Math.sqrt(avg.reduce((s, v) => s + v * v, 0)) || 1;
    return avg.map(v => v / norm);
  }

  /** Helper: search nodes with source filter */
  private searchNodesWithSourceFilter(query: string, limit: number, scopeFilter?: ScopeFilter, sourceFilter?: "user" | "assistant" | "both"): BmNode[] {
    const nodes = this.storage.searchNodes(query, limit, toStorageFilter(scopeFilter));
    if (sourceFilter && sourceFilter !== "both") {
      return nodes.filter(n => n.source === sourceFilter);
    }
    return nodes;
  }
}

function matchesScope(node: BmNode, filter: ScopeFilter): boolean {
  for (const ex of filter.excludeScopes) {
    if (
      (!ex.sessionId || node.scopeSession === ex.sessionId) &&
      (!ex.agentId || node.scopeAgent === ex.agentId) &&
      (!ex.workspaceId || node.scopeWorkspace === ex.workspaceId)
    ) return false;
  }
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
