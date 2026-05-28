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

import { createHash } from 'crypto';
import type { BmConfig, RecallResult, BmNode, ScopeFilterV2 } from '../types';
import type { EmbedFn, BatchEmbedFn } from '../engine/embed';
import type { ISearchIndex } from '../store/search/index';
import type { IStorageAdapter, StorageFilter } from '../store/adapter';
import { personalizedPageRank } from '../graph/pagerank';
import { applyTimeDecay } from '../decay/engine';
import { estimateNodeTokens } from '../utils/tokens';
import { logger } from '../utils/logger';
import { scopeMatchV2 } from '../scope/isolation';
// B-4: retriever module integration
import { analyzeIntent } from '../retriever/intent-analyzer';
import { expandQuery } from '../retriever/query-expander';
import { RecallCache } from './cache';

/** Convert ScopeFilterV2 to StorageFilter for adapter calls */
function toStorageFilterV2(filter?: ScopeFilterV2): StorageFilter | undefined {
  if (!filter) return undefined;
  return {
    includeScopesV2: filter.includeScopes,
    excludeScopesV2: filter.excludeScopes,
    sharingMode: filter.sharingMode,
    sharedCategories: filter.sharedCategories,
    currentAgentId: filter.currentAgentId,
    allowedAgents: filter.allowedAgents,
  };
}

/** 双路径召回引擎：精确路径（向量/FTS5） + 泛化路径（社区向量匹配），统一 PPR 排序。 */
export class Recaller {
  private embed: EmbedFn | null = null;
  private batchEmbed: BatchEmbedFn | null = null;
  private searchIndex: ISearchIndex | null = null;
  private cache: RecallCache;

  constructor(private storage: IStorageAdapter, private cfg: BmConfig, searchIndex?: ISearchIndex) {
    this.cache = new RecallCache(cfg.recallCacheSize ?? 100, cfg.recallCacheTtlMs ?? 5 * 60 * 1000);
    this.searchIndex = searchIndex ?? null;
  }

  setEmbedFn(fn: EmbedFn): void { this.embed = fn; }
  setBatchEmbedFn(fn: BatchEmbedFn): void { this.batchEmbed = fn; }
  setSearchIndex(idx: ISearchIndex): void { this.searchIndex = idx; }

  async recall(query: string, scopeFilter?: ScopeFilterV2, sourceFilter?: 'user' | 'assistant' | 'both', externalNodes?: BmNode[]): Promise<RecallResult> {
    const limit = this.cfg.recallMaxNodes;

    // A-1: 查询缓存 — 图无变更时复用上一次相同查询的结果
    if (this.cache.isValid(this.storage)) {
      const cached = this.cache.get(query, scopeFilter, sourceFilter);
      if (cached) {
        logger.debug('recall', `cache hit for query="${query.slice(0, 30)}"`);
        return cached;
      }
    }

    // B-4: Intent analysis for diagnostics
    const intent = analyzeIntent(query);
    logger.debug('recall', `intent=${intent.intent} scores=${JSON.stringify(intent.scores)}`);

    // B-4: Query expansion for FTS5 seed acquisition
    const expandedQuery = expandQuery(query);
    if (expandedQuery !== query) {
      logger.debug('recall', `query expanded: "${query}" → "${expandedQuery}"`);
    }

    // Phase 2: Get seeds from both paths
    const preciseSeeds = await this.getPreciseSeeds(expandedQuery, limit, scopeFilter, sourceFilter);
    const generalizedSeeds = await this.getGeneralizedSeeds(query, limit, scopeFilter, sourceFilter);

    // v2.0.0 S-2: Semantic search via LanceDB companion index
    const semanticSeeds = await this._getSemanticSeeds(query, limit, scopeFilter);

    // v2.0.0 S-2: External long-term memory (Agent USER/MEMORY)
    const externalSeedIds = (externalNodes || []).map(n => n.id);

    if (!preciseSeeds.length && !generalizedSeeds.length && !semanticSeeds.length && !externalSeedIds.length) {
      return { nodes: [], edges: [], tokenEstimate: 0 };
    }

    // Unified seed set — deduplicate across all four paths, track origin
    const pathOrigin = new Map<string, number>(); // bitmap: 1=precise, 2=generalized, 4=semantic, 8=external
    const unifiedSeeds: string[] = [];
    const seen = new Set<string>();

    for (const id of preciseSeeds) {
      if (!seen.has(id)) { unifiedSeeds.push(id); seen.add(id); }
      pathOrigin.set(id, (pathOrigin.get(id) || 0) | 1);
    }
    for (const id of generalizedSeeds) {
      if (!seen.has(id)) { unifiedSeeds.push(id); seen.add(id); }
      pathOrigin.set(id, (pathOrigin.get(id) || 0) | 2);
    }
    for (const id of semanticSeeds) {
      if (!seen.has(id)) { unifiedSeeds.push(id); seen.add(id); }
      pathOrigin.set(id, (pathOrigin.get(id) || 0) | 4);
    }
    for (const id of externalSeedIds) {
      if (!seen.has(id)) { unifiedSeeds.push(id); seen.add(id); }
      pathOrigin.set(id, (pathOrigin.get(id) || 0) | 8);
    }

    // Single graphWalk from unified seeds
    const { nodes, edges } = this.storage.graphWalk(unifiedSeeds, this.cfg.recallMaxDepth);
    if (!nodes.length) return { nodes: [], edges: [], tokenEstimate: 0 };

    // Single PPR over merged candidate set
    const candidateIds = nodes.map(n => n.id);
    const { scores: pprScores } = personalizedPageRank(this.storage, unifiedSeeds, candidateIds, this.cfg);

    // Sort by unified PPR + time decay + validatedCount + updatedAt
    // D9: Path-aware fusion — nodes hit by multiple recall paths get a boost (×1.2)
    // D10: Time-sensitive boost — when query contains time-sensitive keywords,
    //      recency (updatedAt normalized) gets extra weight in sorting
    const MULTI_PATH_BOOST = 1.2;
    const isTimeSensitive = intent.intent === 'time_sensitive';
    const now = Date.now();
    const TIME_SENSITIVE_RECENCY_WEIGHT = 0.3;

    let filtered = nodes
      .map(n => {
        const baseScore = this.cfg.decay.enabled
          ? applyTimeDecay(pprScores.get(n.id) || 0, n, this.cfg.decay)
          : (pprScores.get(n.id) || 0);
        const originBits = pathOrigin.get(n.id) || 0;
        // Count how many distinct paths hit this node (bitcount)
        const pathCount = [1, 2, 4, 8].filter(b => (originBits & b) !== 0).length;
        let finalScore = pathCount >= 2 ? baseScore * MULTI_PATH_BOOST : baseScore;
        // D10: Boost recency for time-sensitive queries
        if (isTimeSensitive) {
          const ageDays = Math.max(0, (now - n.updatedAt) / 86_400_000);
          const recencyBoost = 1 / (1 + ageDays); // fresher → higher boost
          finalScore += TIME_SENSITIVE_RECENCY_WEIGHT * recencyBoost;
        }
        return { node: n, score: finalScore };
      })
      .sort((a, b) => {
        return b.score - a.score || b.node.validatedCount - a.node.validatedCount || b.node.updatedAt - a.node.updatedAt;
      })
      .slice(0, limit)
      .map(x => x.node);

    // Apply source filter after sorting
    if (sourceFilter && sourceFilter !== 'both') {
      filtered = filtered.filter(n => n.source === sourceFilter);
    }

    // Update access counts for decay tracking
    if (this.cfg.decay.enabled) {
      for (const node of filtered) this.storage.updateAccess(node.id);
    }

    const ids = new Set(filtered.map(n => n.id));

    logger.debug('recall', `preciseSeeds=${preciseSeeds.length}, generalizedSeeds=${generalizedSeeds.length} → unifiedSeeds=${unifiedSeeds.length} → final=${filtered.length} nodes, ${new Set(filtered.map(n => n.communityId).filter(Boolean)).size} communities`);

    const result: RecallResult = {
      nodes: filtered,
      edges: edges.filter(e => ids.has(e.fromId) && ids.has(e.toId)),
      tokenEstimate: this.estimateTokens(filtered),
    };

    // A-1: 存入缓存（仅在无脏节点时有效）
    if (this.cache.isValid(this.storage)) {
      this.cache.set(query, result, scopeFilter, sourceFilter);
    }

    return result;
  }

  // ─── Seed Acquisition ───────────────────────────────────────

  /** Get precise path seeds: vector/FTS5 → community expansion */
  private async getPreciseSeeds(query: string, limit: number, scopeFilter?: ScopeFilterV2, sourceFilter?: 'user' | 'assistant' | 'both'): Promise<string[]> {
    let seeds: BmNode[] = [];
    const sf = toStorageFilterV2(scopeFilter);

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
  private async getGeneralizedSeeds(query: string, limit: number, scopeFilter?: ScopeFilterV2, sourceFilter?: 'user' | 'assistant' | 'both'): Promise<string[]> {
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
    if (sourceFilter && sourceFilter !== 'both') {
      seeds = seeds.filter(n => n.source === sourceFilter);
    }

    return seeds.map(n => n.id);
  }

  // ─── Semantic Search (v2.0.0 S-2) ───────────────────────────

  /** ③ LanceDB 语义搜索路径 */
  private async _getSemanticSeeds(query: string, limit: number, scopeFilter?: ScopeFilterV2): Promise<string[]> {
    if (!this.searchIndex || !this.embed) return [];
    try {
      const vec = await this.embed(query);
      const scored = await this.searchIndex.semanticSearch(vec, limit, scopeFilter);
      return scored.map(s => s.nodeId);
    } catch {
      logger.debug('recall', 'semantic search unavailable');
      return [];
    }
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
      const hash = createHash('md5').update(node.content).digest('hex');
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
    const hash = createHash('md5').update(node.content).digest('hex');
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
  private searchNodesWithSourceFilter(query: string, limit: number, scopeFilter?: ScopeFilterV2, sourceFilter?: 'user' | 'assistant' | 'both'): BmNode[] {
    const nodes = this.storage.searchNodes(query, limit, toStorageFilterV2(scopeFilter));
    if (sourceFilter && sourceFilter !== 'both') {
      return nodes.filter(n => n.source === sourceFilter);
    }
    return nodes;
  }
}

function matchesScope(node: BmNode, filter: ScopeFilterV2): boolean {
  const memScope = {
    platform: node.scopePlatform,
    workspace: node.scopeWorkspace,
    agent: node.scopeAgent,
    user: node.scopeUser,
    chat: node.scopeChat,
    thread: node.scopeThread,
  };
  for (const ex of filter.excludeScopes) {
    if (scopeMatchV2(memScope, ex)) return false;
  }
  if (filter.includeScopes.length > 0) {
    return filter.includeScopes.some(inc => scopeMatchV2(memScope, inc));
  }
  return true;
}
