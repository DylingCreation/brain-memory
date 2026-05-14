/**
 * brain-memory — Personalized PageRank
 *
 * 同一个图谱，不同查询得到不同排序。
 * 计算时机：recall 时实时算（不存数据库），每次查询都是新鲜的。
 * 全局 PageRank 作为基线，只在 session_end / bm_maintain 时写入。
 *
 * v1.1.0 F-2: Uses IStorageAdapter instead of DatabaseSyncInstance.
 *
 * Authors: adoresever (graph-memory), brain-memory contributors
 */

import type { BmConfig } from "../types";
import type { IStorageAdapter } from "../store/adapter";

interface GraphStructure {
  nodeIds: Set<string>;
  adj: Map<string, string[]>;
  N: number;
  cachedAt: number;
}

let _cached: GraphStructure | null = null;
const CACHE_TTL = 30_000;

function loadGraph(storage: IStorageAdapter): GraphStructure {
  if (_cached && Date.now() - _cached.cachedAt < CACHE_TTL) return _cached;

  const { nodeIds: ids, edges } = storage.loadGraphStructure();
  const nodeIds = new Set(ids);
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) adj.set(id, []);

  for (const e of edges) {
    if (!nodeIds.has(e.fromId) || !nodeIds.has(e.toId)) continue;
    adj.get(e.fromId)!.push(e.toId);
    adj.get(e.toId)!.push(e.fromId);
  }

  _cached = { nodeIds, adj, N: nodeIds.size, cachedAt: Date.now() };
  return _cached;
}

export function invalidateGraphCache(): void { _cached = null; }

export interface PPRResult {
  scores: Map<string, number>;
}

export function personalizedPageRank(
  storage: IStorageAdapter, seedIds: string[], candidateIds: string[], cfg: BmConfig,
): PPRResult {
  const graph = loadGraph(storage);
  const { nodeIds, adj, N } = graph;
  const damping = cfg.pagerankDamping;
  const iterations = cfg.pagerankIterations;

  if (N === 0 || seedIds.length === 0) return { scores: new Map() };

  const validSeeds = seedIds.filter(id => nodeIds.has(id));
  if (validSeeds.length === 0) return { scores: new Map() };

  const teleportWeight = 1 / validSeeds.length;
  const seedSet = new Set(validSeeds);

  let rank = new Map<string, number>();
  for (const id of nodeIds) rank.set(id, seedSet.has(id) ? teleportWeight : 0);

  for (let i = 0; i < iterations; i++) {
    const newRank = new Map<string, number>();
    for (const id of nodeIds) {
      newRank.set(id, seedSet.has(id) ? (1 - damping) * teleportWeight : 0);
    }
    for (const [nodeId, neighbors] of adj) {
      if (neighbors.length === 0) continue;
      const contrib = (rank.get(nodeId) || 0) / neighbors.length;
      if (contrib === 0) continue;
      for (const nb of neighbors) newRank.set(nb, (newRank.get(nb) || 0) + damping * contrib);
    }
    let danglingSum = 0;
    for (const id of nodeIds) {
      if (!adj.get(id)?.length) danglingSum += rank.get(id) || 0;
    }
    if (danglingSum > 0) {
      const dc = damping * danglingSum * teleportWeight;
      for (const sid of validSeeds) newRank.set(sid, (newRank.get(sid) || 0) + dc);
    }
    rank = newRank;
  }

  const result = new Map<string, number>();
  for (const id of candidateIds) result.set(id, rank.get(id) || 0);
  return { scores: result };
}

export interface GlobalPageRankResult {
  scores: Map<string, number>;
  topK: Array<{ id: string; name: string; score: number }>;
}

export function computeGlobalPageRank(storage: IStorageAdapter, cfg: BmConfig): GlobalPageRankResult {
  // Clear cache first to avoid stale graph data (ISSUE 8.1)
  invalidateGraphCache();
  const graph = loadGraph(storage);
  const { nodeIds, adj, N } = graph;
  if (N === 0) return { scores: new Map(), topK: [] };

  // Get node names for topK output
  const allNodes = storage.findAllActive();
  const nameMap = new Map<string, string>();
  for (const n of allNodes) nameMap.set(n.id, n.name);

  const init = 1 / N;
  let rank = new Map<string, number>();
  for (const id of nodeIds) rank.set(id, init);

  for (let i = 0; i < cfg.pagerankIterations; i++) {
    const newRank = new Map<string, number>();
    const base = (1 - cfg.pagerankDamping) / N;
    for (const id of nodeIds) newRank.set(id, base);
    for (const [nodeId, neighbors] of adj) {
      if (neighbors.length === 0) continue;
      const contrib = (rank.get(nodeId) || 0) / neighbors.length;
      for (const nb of neighbors) newRank.set(nb, (newRank.get(nb) || base) + cfg.pagerankDamping * contrib);
    }
    let danglingSum = 0;
    for (const id of nodeIds) {
      if (!adj.get(id)?.length) danglingSum += rank.get(id) || 0;
    }
    if (danglingSum > 0) {
      const dc = cfg.pagerankDamping * danglingSum / N;
      for (const id of nodeIds) newRank.set(id, (newRank.get(id) || 0) + dc);
    }
    rank = newRank;
  }

  // Write back to storage
  storage.updatePageranks(rank);

  const sorted = Array.from(rank.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20)
    .map(([id, score]) => ({ id, name: nameMap.get(id) || id, score }));
  return { scores: rank, topK: sorted };
}

// ─── Incremental PageRank (v1.1.0 F-3) ───────────────────────

export interface IncrementalPRResult {
  scores: Map<string, number>;
  dirtyCount: number;
  subgraphSize: number;
  skipped: boolean;
}

/**
 * Incremental PageRank: only recompute for dirty nodes.
 * Strategy: subgraph PageRank with fixed boundary.
 *
 * 1. Get dirty nodes from storage
 * 2. Extract affected subgraph (dirty + 2-hop neighbors)
 * 3. Run PageRank on subgraph with boundary nodes fixed
 * 4. Merge results — only dirty nodes get updated scores
 * 5. Write back
 *
 * Returns skipped=true if dirty ratio > threshold (caller should run full PR).
 */
export function runIncrementalPageRank(
  storage: IStorageAdapter,
  cfg: BmConfig,
  threshold: number = 0.10,
): IncrementalPRResult {
  const dirtyNodes = storage.getDirtyNodes();
  if (dirtyNodes.size === 0) return { scores: new Map(), dirtyCount: 0, subgraphSize: 0, skipped: false };

  // Check dirty ratio — if too high, fall back to full maintenance
  const allNodes = storage.findAllActive();
  const totalActive = allNodes.length;
  const dirtyRatio = dirtyNodes.size / Math.max(totalActive, 1);
  if (dirtyRatio > threshold) return { scores: new Map(), dirtyCount: dirtyNodes.size, subgraphSize: 0, skipped: true };

  // Get existing pagerank scores for boundary nodes
  const existingScores = new Map<string, number>();
  for (const n of allNodes) existingScores.set(n.id, n.pagerank);

  // Build subgraph: dirty nodes + 2-hop neighbors
  const subgraph = storage.getAffectedSubgraph(2);
  const subNodeIds = new Set(subgraph.nodes.map(n => n.id));
  const subNodeIdsArr = subgraph.nodes.map(n => n.id);
  const subAdj = new Map<string, string[]>();
  for (const id of subNodeIdsArr) subAdj.set(id, []);
  for (const e of subgraph.edges) {
    if (subNodeIds.has(e.fromId) && subNodeIds.has(e.toId)) {
      subAdj.get(e.fromId)!.push(e.toId);
      subAdj.get(e.toId)!.push(e.fromId);
    }
  }

  const N = subNodeIds.size;
  const dirtyCount = dirtyNodes.size;
  const damping = cfg.pagerankDamping;
  const iterations = cfg.pagerankIterations;

  // Initialize: dirty nodes get uniform score, boundary nodes keep existing scores
  let rank = new Map<string, number>();
  const dirtyInitScore = dirtyCount > 0 ? 1 / dirtyCount : 0;
  for (const id of subNodeIdsArr) {
    if (dirtyNodes.has(id)) {
      rank.set(id, dirtyInitScore);
    } else {
      rank.set(id, existingScores.get(id) || 0);
    }
  }

  // Run PageRank on subgraph with fixed boundary
  for (let i = 0; i < iterations; i++) {
    const newRank = new Map<string, number>();

    // Boundary nodes: keep existing scores (fixed)
    for (const id of subNodeIdsArr) {
      if (!dirtyNodes.has(id)) {
        newRank.set(id, existingScores.get(id) || 0);
        continue;
      }
      // Dirty nodes: compute new score from neighbors
      newRank.set(id, 0);
    }

    // Propagate from dirty nodes to neighbors
    for (const nodeId of subNodeIdsArr) {
      if (!dirtyNodes.has(nodeId)) continue;
      const neighbors = subAdj.get(nodeId) || [];
      if (neighbors.length === 0) continue;
      const currentScore = rank.get(nodeId) || 0;
      const contrib = damping * currentScore / neighbors.length;
      for (const nb of neighbors) {
        if (subNodeIds.has(nb)) {
          newRank.set(nb, (newRank.get(nb) || 0) + contrib);
        }
      }
    }

    // Handle dangling nodes (no neighbors in subgraph)
    for (const nodeId of subNodeIdsArr) {
      if (!dirtyNodes.has(nodeId)) continue;
      const neighbors = subAdj.get(nodeId) || [];
      if (neighbors.length === 0) {
        const currentScore = rank.get(nodeId) || 0;
        // Redistribute to other dirty nodes
        const otherDirty = subNodeIdsArr.filter(id => dirtyNodes.has(id) && id !== nodeId);
        if (otherDirty.length > 0) {
          const dc = damping * currentScore / otherDirty.length;
          for (const nb of otherDirty) newRank.set(nb, (newRank.get(nb) || 0) + dc);
        }
      }
    }

    // Normalize: ensure sum of dirty nodes = dirtyRatio of total (approximation)
    const dirtySum = Array.from(newRank.entries()).filter(([id]) => dirtyNodes.has(id)).reduce((s, [, v]) => s + v, 0);
    if (dirtySum > 0) {
      const targetSum = dirtyRatio; // dirty nodes should get ~dirtyRatio of total score
      const scale = targetSum / dirtySum;
      for (const [id, val] of newRank) {
        if (dirtyNodes.has(id)) newRank.set(id, val * scale);
      }
    }

    rank = newRank;
  }

  // Write back only dirty nodes' scores
  const dirtyScores = new Map<string, number>();
  for (const [id, score] of rank) {
    if (dirtyNodes.has(id)) dirtyScores.set(id, score);
  }
  if (dirtyScores.size > 0) storage.updatePageranks(dirtyScores);

  return { scores: dirtyScores, dirtyCount, subgraphSize: N, skipped: false };
}
