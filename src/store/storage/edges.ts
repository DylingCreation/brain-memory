import { type DatabaseSyncInstance } from '@photostructure/sqlite';
import type { BmEdge, EdgeType } from '../../types';
import { uid, toEdge, type SqlRow } from './_helpers';

// allEdges was line 106-107 in original store.ts
export function allEdges(db: DatabaseSyncInstance): BmEdge[] {
  return (db.prepare('SELECT * FROM bm_edges').all() as SqlRow[]).map(toEdge);
}

// ─── Edge CRUD ─────────────────────────────────────────────────

/** Insert a new edge or update an existing one (matched by from_id + to_id + type). Returns the edge object. */
/** 插入或更新边(按 fromId + toId + type 匹配)。返回边对象。 */
export function upsertEdge(
  db: DatabaseSyncInstance,
  e: { fromId: string; toId: string; type: EdgeType; instruction: string; condition?: string; sessionId: string },
): BmEdge {
  const ex = db.prepare('SELECT id FROM bm_edges WHERE from_id=? AND to_id=? AND type=?')
    .get(e.fromId, e.toId, e.type) as SqlRow;
  const now = Date.now();
  if (ex) {
    db.prepare('UPDATE bm_edges SET instruction=? WHERE id=?').run(e.instruction, ex.id);
    return toEdge(db.prepare('SELECT * FROM bm_edges WHERE id=?').get(ex.id as string) as SqlRow);
  }
  const id = uid('e');
  db.prepare(`INSERT INTO bm_edges (id, from_id, to_id, type, instruction, condition, session_id, created_at)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run(id, e.fromId, e.toId, e.type, e.instruction, e.condition ?? null, e.sessionId, now);
  // Construct edge from known data - no SELECT roundtrip needed
  return { id, fromId: e.fromId, toId: e.toId, type: e.type, instruction: e.instruction, condition: e.condition, sessionId: e.sessionId, createdAt: now } as BmEdge;
}

/** Return all outgoing edges from the given node. */
/** 查询节点的所有出边。 */
export function edgesFrom(db: DatabaseSyncInstance, id: string): BmEdge[] {
  return (db.prepare('SELECT * FROM bm_edges WHERE from_id=?').all(id) as SqlRow[]).map(toEdge);
}

/** Return all incoming edges to the given node. */
/** 查询节点的所有入边。 */
export function edgesTo(db: DatabaseSyncInstance, id: string): BmEdge[] {
  return (db.prepare('SELECT * FROM bm_edges WHERE to_id=?').all(id) as SqlRow[]).map(toEdge);
}

