/**
 * brain-memory — Personalized PageRank
 *
 * 同一个图谱，不同查询得到不同排序。
 * 计算时机：recall 时实时算（不存数据库），每次查询都是新鲜的。
 * 全局 PageRank 作为基线，只在 session_end / bm_maintain 时写入。
 *
 * Authors: adoresever (graph-memory), brain-memory contributors
 */

import { type DatabaseSyncInstance } from "@photostructure/sqlite";
import type { BmConfig } from "../types";
import { updatePageranks } from "../store/store";

interface GraphStructure {
  nodeIds: Set<string>;
  adj: Map<string, string[]>;
  N: number;
  cachedAt: number;
}

let _cached: GraphStructure | null = null;
const CACHE_TTL = 30_000;

function loadGraph(db: DatabaseSyncInstance): GraphStructure {
  if (_cached && Date.now() - _cached.cachedAt < CACHE_TTL) return _cached;

  const nodeRows = db.prepare("SELECT id FROM bm_nodes WHERE status='active'").all() as any[];
  const nodeIds = new Set(nodeRows.map((r: any) => r.id));
  const edgeRows = db.prepare("SELECT from_id, to_id FROM bm_edges").all() as any[];
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) adj.set(id, []);

  for (const e of edgeRows) {
    if (!nodeIds.has(e.from_id) || !nodeIds.has(e.to_id)) continue;
    adj.get(e.from_id)!.push(e.to_id);
    adj.get(e.to_id)!.push(e.from_id);
  }

  _cached = { nodeIds, adj, N: nodeIds.size, cachedAt: Date.now() };
  return _cached;
}

export function invalidateGraphCache(): void { _cached = null; }

export interface PPRResult {
  scores: Map<string, number>;
}

export function personalizedPageRank(
  db: DatabaseSyncInstance, seedIds: string[], candidateIds: string[], cfg: BmConfig,
): PPRResult {
  const graph = loadGraph(db);
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

export function computeGlobalPageRank(db: DatabaseSyncInstance, cfg: BmConfig): GlobalPageRankResult {
  // Clear cache first to avoid stale graph data (ISSUE 8.1)
  invalidateGraphCache();
  const graph = loadGraph(db);
  const { nodeIds, adj, N } = graph;
  if (N === 0) return { scores: new Map(), topK: [] };

  const nameRows = db.prepare("SELECT id, name FROM bm_nodes WHERE status='active'").all() as any[];
  const nameMap = new Map<string, string>();
  nameRows.forEach(r => nameMap.set(r.id, r.name));

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

  updatePageranks(db, rank);
  const sorted = Array.from(rank.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20)
    .map(([id, score]) => ({ id, name: nameMap.get(id) || id, score }));
  return { scores: rank, topK: sorted };
}
