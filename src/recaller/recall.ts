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
 * Authors: adoresever (graph-memory), brain-memory contributors
 */

import { type DatabaseSyncInstance } from "@photostructure/sqlite";
import { createHash } from "crypto";
import type { BmConfig, RecallResult, BmNode, BmEdge } from "../types";
import type { EmbedFn, BatchEmbedFn } from "../engine/embed";
import type { ScopeFilter } from "../scope/isolation";
import {
  searchNodes, vectorSearchWithScore, graphWalk,
  communityVectorSearch, nodesByCommunityIds, saveVector, getVectorHash,
  updateAccess,
} from "../store/store";
import { getCommunityPeers, communityRepresentatives } from "../graph/community";
import { personalizedPageRank } from "../graph/pagerank";
import { applyTimeDecay } from "../decay/engine";
import { estimateNodeTokens } from "../utils/tokens";
import { logger } from "../utils/logger";

interface RecallPathResult {
  seeds: string[];
  nodes: BmNode[];
  edges: BmEdge[];
}

export class Recaller {
  private embed: EmbedFn | null = null;
  private batchEmbed: BatchEmbedFn | null = null;

  constructor(private db: DatabaseSyncInstance, private cfg: BmConfig) {}

  setEmbedFn(fn: EmbedFn): void { this.embed = fn; }
  setBatchEmbedFn(fn: BatchEmbedFn): void { this.batchEmbed = fn; }

  async recall(query: string, scopeFilter?: ScopeFilter, sourceFilter?: "user" | "assistant" | "both"): Promise<RecallResult> {
    const limit = this.cfg.recallMaxNodes;

    // Phase 2 (#6 fix): Get seeds from both paths, but defer graphWalk + PPR
    const preciseSeeds = await this.getPreciseSeeds(query, limit, scopeFilter, sourceFilter);
    const generalizedSeeds = await this.getGeneralizedSeeds(query, limit, scopeFilter, sourceFilter);

    if (!preciseSeeds.length && !generalizedSeeds.length) {
      return { nodes: [], edges: [], tokenEstimate: 0 };
    }

    // Phase 2 (#6 fix): Unified seed set — deduplicate across paths
    const unifiedSeeds = [...preciseSeeds];
    const preciseSeedSet = new Set(preciseSeeds);
    for (const id of generalizedSeeds) {
      if (!preciseSeedSet.has(id)) unifiedSeeds.push(id);
    }

    // Phase 2 (#6 fix): Single graphWalk from unified seeds
    // Use max depth from precise path (generalized always uses depth 1, which is ≤ maxDepth)
    const { nodes, edges } = graphWalk(this.db, unifiedSeeds, this.cfg.recallMaxDepth);
    if (!nodes.length) return { nodes: [], edges: [], tokenEstimate: 0 };

    // Phase 2 (#13 fix): Single PPR over merged candidate set
    // Unified seeds from both paths → comparable PPR scores
    const candidateIds = nodes.map(n => n.id);
    const { scores: pprScores } = personalizedPageRank(this.db, unifiedSeeds, candidateIds, this.cfg);

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
      for (const node of filtered) updateAccess(this.db, node.id);
    }

    const ids = new Set(filtered.map(n => n.id));

    logger.debug("recall", `preciseSeeds=${preciseSeeds.length}, generalizedSeeds=${generalizedSeeds.length} → unifiedSeeds=${unifiedSeeds.length} → final=${filtered.length} nodes, ${new Set(filtered.map(n => n.communityId).filter(Boolean)).size} communities`);

    return {
      nodes: filtered,
      edges: edges.filter(e => ids.has(e.fromId) && ids.has(e.toId)),
      tokenEstimate: this.estimateTokens(filtered),
    };
  }

  // ─── Seed Acquisition (no graphWalk here) ─────────────────────

  /** Get precise path seeds: vector/FTS5 → community expansion */
  private async getPreciseSeeds(query: string, limit: number, scopeFilter?: ScopeFilter, sourceFilter?: "user" | "assistant" | "both"): Promise<string[]> {
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

    if (!seeds.length) return [];

    // Community expansion
    const expandedIds = new Set<string>(seeds.map(n => n.id));
    for (const seed of seeds) {
      const peers = getCommunityPeers(this.db, seed.id, 2);
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
        const scoredCommunities = communityVectorSearch(this.db, vec);
        if (scoredCommunities.length > 0) {
          const communityIds = scoredCommunities.map(c => c.id);
          seeds = nodesByCommunityIds(this.db, communityIds, 3);
        }
      } catch { /* fallback */ }
    }

    if (!seeds.length) seeds = communityRepresentatives(this.db, 2);

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

  // #21 fix: use language-aware token estimation
  private estimateTokens(nodes: BmNode[]): number {
    return nodes.reduce((s, n) => s + estimateNodeTokens(n), 0);
  }

  /** #12/#14: Batch embed multiple nodes at once (reduces API calls) */
  async batchSyncEmbed(nodes: BmNode[]): Promise<void> {
    if (!this.embed || nodes.length === 0) return;
    
    // Filter nodes that need embedding
    const needEmbed: BmNode[] = [];
    for (const node of nodes) {
      const hash = createHash("md5").update(node.content).digest("hex");
      if (getVectorHash(this.db, node.id) !== hash) needEmbed.push(node);
    }
    if (needEmbed.length === 0) return;
    
    try {
      // #14: chunk all texts, then batch embed
      const allChunks: string[] = [];
      const nodeChunkMap: Map<string, number[]> = new Map(); // nodeId -> chunk indices
      
      for (const node of needEmbed) {
        const text = this.buildEmbeddingText(node);
        const chunks = this.chunkText(text, 400);
        const startIdx = allChunks.length;
        nodeChunkMap.set(node.id, chunks.map((_, i) => startIdx + i));
        allChunks.push(...chunks);
      }
      
      // Batch embed all chunks
      const vectors = this.batchEmbed
        ? await this.batchEmbed(allChunks)
        : await Promise.all(allChunks.map(c => this.embed!(c)));
      
      // Aggregate per-node vectors and save
      for (const node of needEmbed) {
        const indices = nodeChunkMap.get(node.id)!;
        const nodeVectors = indices.map(i => vectors[i]).filter(v => v && v.length > 0);
        if (nodeVectors.length > 0) {
          const vec = nodeVectors.length === 1 ? nodeVectors[0] : this.meanAggregate(nodeVectors);
          saveVector(this.db, node.id, node.content, vec);
        }
      }
    } catch { /* 不影响主流程 */ }
  }

  /** 异步同步 embedding，不阻塞主流程 (#14: chunked embedding) */
  async syncEmbed(node: BmNode): Promise<void> {
    if (!this.embed) return;
    const hash = createHash("md5").update(node.content).digest("hex");
    if (getVectorHash(this.db, node.id) === hash) return;
    try {
      const text = this.buildEmbeddingText(node);
      const chunks = this.chunkText(text, 400); // #14: chunk at 400 chars instead of hard 500
      
      let vec: number[];
      if (chunks.length === 1) {
        // Short content — direct embed
        vec = await this.embed(chunks[0]);
      } else if (this.batchEmbed) {
        // #12 + #14: batch embed chunks then mean-aggregate
        const vectors = await this.batchEmbed(chunks);
        vec = this.meanAggregate(vectors);
      } else {
        // Fallback: embed chunks sequentially and aggregate
        const vectors: number[][] = [];
        for (const chunk of chunks) {
          const v = await this.embed(chunk);
          if (v.length) vectors.push(v);
        }
        vec = vectors.length > 0 ? this.meanAggregate(vectors) : [];
      }
      
      if (vec.length) saveVector(this.db, node.id, node.content, vec);
    } catch { /* 不影响主流程 */ }
  }

  /** #14: Build embedding text with smart truncation instead of hard slice */
  private buildEmbeddingText(node: BmNode): string {
    const header = `${node.name}: ${node.description}\n`;
    const maxContentLen = 1200; // Increased from 500, with chunking handles longer content
    const content = node.content;
    if (content.length <= maxContentLen) return header + content;
    
    // Smart truncate at paragraph/sentence boundary
    let cutPoint = maxContentLen;
    const paragraphBreak = content.lastIndexOf('\n\n', cutPoint);
    if (paragraphBreak > cutPoint * 0.6) {
      cutPoint = paragraphBreak + 2;
    } else {
      // Find sentence boundary by searching backwards from cutPoint
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

  /** #14: Chunk text at natural boundaries */
  private chunkText(text: string, maxChunkSize: number): string[] {
    if (text.length <= maxChunkSize) return [text];
    
    const chunks: string[] = [];
    let pos = 0;
    while (pos < text.length) {
      let end = Math.min(pos + maxChunkSize, text.length);
      if (end < text.length) {
        // Try to split at paragraph boundary
        const paragraphBreak = text.lastIndexOf('\n\n', end);
        if (paragraphBreak > pos + maxChunkSize * 0.5) {
          end = paragraphBreak + 2;
        } else {
          // Try sentence boundary by scanning backwards
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

  /** #12/#14: Mean-aggregate multiple vectors */
  private meanAggregate(vectors: number[][]): number[] {
    if (vectors.length === 0) return [];
    if (vectors.length === 1) return vectors[0];
    const dim = vectors[0].length;
    const sum = new Float64Array(dim);
    for (const vec of vectors) {
      for (let i = 0; i < dim; i++) sum[i] += vec[i];
    }
    const avg = Array.from(sum).map(v => v / vectors.length);
    // L2 normalize
    const norm = Math.sqrt(avg.reduce((s, v) => s + v * v, 0)) || 1;
    return avg.map(v => v / norm);
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
