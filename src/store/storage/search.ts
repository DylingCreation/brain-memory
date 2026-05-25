import { type DatabaseSyncInstance } from '@photostructure/sqlite';
import type { BmNode, BmEdge, ScopeFilterV2 } from '../../types';
import type { ScopeFilter } from '../../scope/isolation';
import { buildScopeFilterClause, buildScopeFilterClauseV2 } from '../../scope/isolation';
import { toNode, type SqlRow } from './_helpers';

// ─── FTS5 Search ───────────────────────────────────────────────

/** Search active nodes by text. Tries FTS5 first (fast for English), falls back to LIKE search (better for Chinese). Returns top-N by rank or pagerank. Supports optional scope filtering. */
/** 文本搜索节点(FTS5 → LIKE 回退)。返回 top-N 按 rank 或 PageRank 排序,支持范围过滤。 */
export function searchNodes(db: DatabaseSyncInstance, query: string, limit = 6, scopeFilter?: ScopeFilter, scopeFilterV2?: ScopeFilterV2): BmNode[] {
  const terms = query.trim().split(/\s+/).filter(Boolean).slice(0, 8);
  if (!terms.length) return topNodes(db, limit, scopeFilter);

  const { clause, params: scopeParams } = scopeFilterV2
    ? buildScopeFilterClauseV2(scopeFilterV2)
    : scopeFilter
      ? buildScopeFilterClause(scopeFilter)
      : { clause: '', params: [] };

  // Try FTS5 search first
  try {
    const ftsQuery = terms.map(t => `"${t.replace(/"/g, '')}"`).join(' OR ');
    const rows = db.prepare(`
      SELECT n.*, rank FROM bm_nodes_fts fts
      JOIN bm_nodes n ON n.rowid = fts.rowid
      WHERE bm_nodes_fts MATCH ? AND n.status = 'active'${clause}
      ORDER BY rank LIMIT ?
    `).all(ftsQuery, ...scopeParams, limit) as SqlRow[];

    // If FTS5 returns results, return them; otherwise, fall back to LIKE search
    // This is especially important for Chinese text which FTS5 doesn't handle well
    if (rows.length > 0) return rows.map(toNode);
  } catch { /* fallback to LIKE search */ }

  // Fallback to LIKE search (works better for Chinese characters)
  const where = terms.map(() => '(name LIKE ? OR description LIKE ? OR content LIKE ?)').join(' OR ');
  const likes = terms.flatMap(t => [`%${t}%`, `%${t}%`, `%${t}%`]);
  return (db.prepare(`
    SELECT * FROM bm_nodes WHERE status='active' AND (${where})${clause}
    ORDER BY pagerank DESC, validated_count DESC, updated_at DESC LIMIT ?
  `).all(...likes, ...scopeParams, limit) as SqlRow[]).map(toNode);
}

/** Return the top-N active nodes sorted by pagerank, validated_count, and updated_at. Supports optional scope filtering. */
/** 返回 top-N 活跃节点,按 PageRank 降序。 */
export function topNodes(db: DatabaseSyncInstance, limit = 6, scopeFilter?: ScopeFilter, scopeFilterV2?: ScopeFilterV2): BmNode[] {
  const { clause, params } = scopeFilterV2
    ? buildScopeFilterClauseV2(scopeFilterV2)
    : scopeFilter
      ? buildScopeFilterClause(scopeFilter)
      : { clause: '', params: [] };
  return (db.prepare(`
    SELECT * FROM bm_nodes WHERE status='active'${clause}
    ORDER BY pagerank DESC, validated_count DESC, updated_at DESC LIMIT ?
  `).all(...params, limit) as SqlRow[]).map(toNode);
}

/** Cosine-similarity vector search. Returns nodes with their similarity scores, sorted descending. Applies scope filtering if provided. Only loads vectors for valid active nodes. */
/** 向量相似度搜索(余弦距离)。返回节点及相似度分数。 */
export function vectorSearchWithScore(db: DatabaseSyncInstance, vec: number[], limit: number, scopeFilter?: ScopeFilter, scopeFilterV2?: ScopeFilterV2): Array<{ node: BmNode; score: number }> {
  // First get all active nodes with scope filtering applied
  const { clause, params } = scopeFilterV2
    ? buildScopeFilterClauseV2(scopeFilterV2)
    : scopeFilter
      ? buildScopeFilterClause(scopeFilter)
      : { clause: '', params: [] };
  const nodes = db.prepare(`SELECT * FROM bm_nodes WHERE status='active'${clause}`).all(...params) as SqlRow[];

  if (!nodes.length) return [];

  // Load only vectors for valid nodes
  const placeholders = nodes.map(() => '?').join(',');
  const vectorRows = db.prepare(`SELECT node_id, embedding FROM bm_vectors WHERE node_id IN (${placeholders})`).all(...nodes.map(n => n.id as string)) as SqlRow[];

  if (!vectorRows.length) return [];

  const q = new Float32Array(vec);
  const qNorm = Math.sqrt(q.reduce((s, x) => s + x * x, 0)) || 1e-9;

  // Pre-compute nodes to avoid repeated DB calls
  const nodeMap = new Map<string, BmNode>();
  for (const node of nodes) {
    nodeMap.set(node.id as string, toNode(node));
  }

  const scored: Array<{ node: BmNode; score: number }> = [];
  for (const r of vectorRows) {
    const raw = r.embedding as Uint8Array;
    const v = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
    let dot = 0, vNorm = 0;
    const len = Math.min(v.length, q.length);
    for (let i = 0; i < len; i++) { dot += v[i] * q[i]; vNorm += v[i] * v[i]; }
    const score = dot / (Math.sqrt(vNorm) * qNorm + 1e-9);
    const node = nodeMap.get(r.node_id as string);
    if (node) scored.push({ node, score });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

