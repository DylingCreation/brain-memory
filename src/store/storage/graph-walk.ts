import { type DatabaseSyncInstance } from '@photostructure/sqlite';
import type { BmNode, BmEdge } from '../../types';
import { toNode, toEdge, type SqlRow } from './_helpers';

// ─── Graph walk (recursive CTE) ────────────────────────────────

/** Traverse the graph from seed nodes up to maxDepth hops using a recursive CTE. Returns all reachable nodes and the edges connecting them. */
/** 图谱遍历(递归 CTE):从种子节点出发,最多 maxDepth 跳。返回可达节点和连接边。 */
export function graphWalk(
  db: DatabaseSyncInstance, seedIds: string[], maxDepth: number,
): { nodes: BmNode[]; edges: BmEdge[] } {
  if (!seedIds.length) return { nodes: [], edges: [] };
  const ph = seedIds.map(() => '?').join(',');

  const walkRows = db.prepare(`
    WITH RECURSIVE walk(node_id, depth) AS (
      SELECT id, 0 FROM bm_nodes WHERE id IN (${ph}) AND status='active'
      UNION
      SELECT CASE WHEN e.from_id = w.node_id THEN e.to_id ELSE e.from_id END, w.depth + 1
      FROM walk w JOIN bm_edges e ON (e.from_id = w.node_id OR e.to_id = w.node_id)
      WHERE w.depth < ?
    ) SELECT DISTINCT node_id FROM walk
  `).all(...seedIds, maxDepth) as SqlRow[];

  const nodeIds = walkRows.map((r: SqlRow) => r.node_id);
  if (!nodeIds.length) return { nodes: [], edges: [] };

  const np = nodeIds.map(() => '?').join(',');
  const nodes = (db.prepare(`SELECT * FROM bm_nodes WHERE id IN (${np}) AND status='active'`)
    .all(...nodeIds) as SqlRow[]).map(toNode);
  const edges = (db.prepare(`SELECT * FROM bm_edges WHERE from_id IN (${np}) AND to_id IN (${np})`)
    .all(...nodeIds, ...nodeIds) as SqlRow[]).map(toEdge);
  return { nodes, edges };
}

// ─── Community vector search ───────────────────────────────────

/** 带相似度分数的社区搜索结果。 */
export type ScoredCommunity = { id: string; summary: string; score: number; nodeCount: number };

/** Search communities by cosine similarity of their stored embedding vectors. Returns communities above minScore, sorted by score descending. */
/** 社区向量搜索(余弦相似度)。返回分数高于 minScore 的社区。 */
export function communityVectorSearch(db: DatabaseSyncInstance, queryVec: number[], minScore = 0.15): ScoredCommunity[] {
  const rows = db.prepare('SELECT id, summary, node_count, embedding FROM bm_communities WHERE embedding IS NOT NULL').all() as SqlRow[];
  if (!rows.length) return [];

  const q = new Float32Array(queryVec);
  const qNorm = Math.sqrt(q.reduce((s, x) => s + x * x, 0));
  if (qNorm === 0) return [];

  return rows.map(r => {
    const raw = r.embedding as Uint8Array;
    const v = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
    let dot = 0, vNorm = 0;
    const len = Math.min(v.length, q.length);
    for (let i = 0; i < len; i++) { dot += v[i] * q[i]; vNorm += v[i] * v[i]; }
    return { id: r.id as string, summary: r.summary as string, score: dot / (Math.sqrt(vNorm) * qNorm + 1e-9), nodeCount: r.node_count as number };
  }).filter(s => s.score > minScore).sort((a, b) => b.score - a.score);
}

/** Return up to perCommunity active nodes per given community, ordered by updated_at descending. */
/** 按社区 ID 获取成员节点。每个社区返回 up to perCommunity 个。 */
export function nodesByCommunityIds(db: DatabaseSyncInstance, communityIds: string[], perCommunity = 3): BmNode[] {
  if (!communityIds.length) return [];
  const ph = communityIds.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT * FROM bm_nodes WHERE community_id IN (${ph}) AND status='active'
    ORDER BY community_id, updated_at DESC`).all(...communityIds) as SqlRow[];

  const byCommunity = new Map<string, BmNode[]>();
  for (const r of rows) {
    const node = toNode(r);
    const cid = r.community_id as string;
    if (!byCommunity.has(cid)) byCommunity.set(cid, []);
    const list = byCommunity.get(cid)!;
    if (list.length < perCommunity) list.push(node);
  }

  const result: BmNode[] = [];
  for (const cid of communityIds) { const m = byCommunity.get(cid); if (m) result.push(...m); }
  return result;
}


