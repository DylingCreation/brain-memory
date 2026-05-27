import { type DatabaseSyncInstance } from '@photostructure/sqlite';
import type { BmNode, BmEdge, GraphNodeType, MemoryCategory, ScopeFilterV2 } from '../../types';
import type { ScopeFilter } from '../../scope/isolation';
import { buildScopeFilterClause, buildScopeFilterClauseV2 } from '../../scope/isolation';
import { uid, toNode, toEdge, normalizeName, type SqlRow } from './_helpers';

// ─── Node CRUD ─────────────────────────────────────────────────

/** Look up a node by its normalized name. Returns null if not found. */
/** 按标准化名查找节点。返回 null 若不存在。 */
export function findByName(db: DatabaseSyncInstance, name: string): BmNode | null {
  const r = db.prepare('SELECT * FROM bm_nodes WHERE name = ?').get(normalizeName(name)) as SqlRow;
  return r ? toNode(r) : null;
}

/** Look up a node by its unique ID. Returns null if not found. */
/** 按唯一 ID 查找节点。返回 null 若不存在。 */
export function findById(db: DatabaseSyncInstance, id: string): BmNode | null {
  const r = db.prepare('SELECT * FROM bm_nodes WHERE id = ?').get(id) as SqlRow;
  return r ? toNode(r) : null;
}

/** Return all active nodes, optionally filtered by scope (agent/workspace/session). */
/** 查询所有活跃节点,可选范围过滤。 */
export function allActiveNodes(db: DatabaseSyncInstance, scopeFilter?: ScopeFilter, scopeFilterV2?: ScopeFilterV2): BmNode[] {
  const { clause, params } = scopeFilterV2
    ? buildScopeFilterClauseV2(scopeFilterV2)
    : scopeFilter
      ? buildScopeFilterClause(scopeFilter)
      : { clause: '', params: [] };
  return (db.prepare(`SELECT * FROM bm_nodes WHERE status='active'${clause}`)
    .all(...params) as SqlRow[]).map(toNode);
}

/** Return all edges in the graph. */
/** 查询所有边。 */
export function allEdges(db: DatabaseSyncInstance): BmEdge[] {
  return (db.prepare('SELECT * FROM bm_edges').all() as SqlRow[]).map(toEdge);
}

/** Insert a new node or update an existing one by name. Merges content, description, and source_sessions from both versions. Returns the node and whether it was newly created. */
/** 插入或更新节点(按名称匹配)。合并 content、description 和 source_sessions。返回节点和是否新建。 */
export function upsertNode(
  db: DatabaseSyncInstance,
  c: {
    type: GraphNodeType; category: MemoryCategory; name: string; description: string; content: string;
    source: 'user' | 'assistant' | 'manual'; temporalType?: 'static' | 'dynamic';
    // v1.x 旧 scope 字段
    scopeSession?: string | null; scopeAgent?: string | null; scopeWorkspace?: string | null;
    // v2.0 新 scope 字段（可选，兼容旧调用）
    scopePlatform?: string | null; scopeUser?: string | null; scopeChat?: string | null;
    scopeThread?: string | null; scopeId?: string | null;
  },
  sessionId: string,
): { node: BmNode; isNew: boolean } {
  const name = normalizeName(c.name);
  const temporalType = c.temporalType ?? 'static';
  const source = c.source ?? 'user';
  const scopeSession = c.scopeSession ?? sessionId;
  const scopeAgent = c.scopeAgent ?? null;
  const scopeWorkspace = c.scopeWorkspace ?? null;
  // v2.0 新 scope 字段
  const scopePlatform = c.scopePlatform ?? null;
  const scopeUser = c.scopeUser ?? null;
  const scopeChat = c.scopeChat ?? c.scopeSession ?? sessionId;
  const scopeThread = c.scopeThread ?? null;
  const scopeId = c.scopeId ?? null;
  const ex = findByName(db, name);

  if (ex) {
    const sessions = JSON.stringify(Array.from(new Set([...ex.sourceSessions, sessionId])));
    const content = c.content.length > ex.content.length ? c.content : ex.content;
    const desc = c.description.length > ex.description.length ? c.description : ex.description;
    const count = ex.validatedCount + 1;
    db.prepare(`UPDATE bm_nodes SET content=?, description=?, validated_count=?,
      source_sessions=?, updated_at=?, category=?, temporal_type=?, source=?, scope_session=?, scope_agent=?, scope_workspace=?,
      scope_platform=?, scope_user=?, scope_chat=?, scope_thread=?, scope_id=? WHERE id=?`)
      .run(content, desc, count, sessions, Date.now(), c.category, temporalType, source,
        scopeSession, scopeAgent, scopeWorkspace,
        scopePlatform, scopeUser, scopeChat, scopeThread, scopeId,
        ex.id);
    return { node: { ...ex, content, description: desc, validatedCount: count, category: c.category, temporalType, source, scopeSession, scopeAgent, scopeWorkspace }, isNew: false };
  }

  const id = uid('n');
  const now = Date.now();
  db.prepare(`INSERT INTO bm_nodes
    (id, type, category, name, description, content, status, validated_count,
     source_sessions, pagerank, importance, access_count, last_accessed,
     temporal_type, source, scope_session, scope_agent, scope_workspace,
     scope_platform, scope_user, scope_chat, scope_thread, scope_id,
     created_at, updated_at)
    VALUES (?,?,?,?,?,?,'active',1,?,0,0.5,0,0,?,?,?,?,?,
            ?,?,?,?,?,
            ?,?)`)
    .run(id, c.type, c.category, name, c.description, c.content,
      JSON.stringify([sessionId]), temporalType, source, scopeSession, scopeAgent, scopeWorkspace,
      scopePlatform, scopeUser, scopeChat, scopeThread, scopeId,
      now, now);
  return { node: findByName(db, name)!, isNew: true };
}

/** Mark a node as deprecated (soft delete). */
/** 软删除节点(标记为 deprecated)。 */
export function deprecate(db: DatabaseSyncInstance, nodeId: string): void {
  db.prepare('UPDATE bm_nodes SET status=\'deprecated\', updated_at=? WHERE id=?')
    .run(Date.now(), nodeId);
}

/** Merge two nodes: keep the higher-validatedCount one, combine source_sessions and validated_count, repoint edges, and deprecate the merged node. */
/** 合并两个节点:保留 validatedCount 高的,合并 session 和边,废弃被合并节点。 */
export function mergeNodes(db: DatabaseSyncInstance, keepId: string, mergeId: string): void {
  const keep = findById(db, keepId);
  const merge = findById(db, mergeId);
  if (!keep || !merge) return;

  const sessions = JSON.stringify(
    Array.from(new Set([...keep.sourceSessions, ...merge.sourceSessions]))
  );
  const count = keep.validatedCount + merge.validatedCount;
  const content = keep.content.length >= merge.content.length ? keep.content : merge.content;
  const desc = keep.description.length >= merge.description.length ? keep.description : merge.description;

  db.prepare(`UPDATE bm_nodes SET content=?, description=?, validated_count=?,
    source_sessions=?, updated_at=? WHERE id=?`)
    .run(content, desc, count, sessions, Date.now(), keepId);

  db.prepare('UPDATE bm_edges SET from_id=? WHERE from_id=?').run(keepId, mergeId);
  db.prepare('UPDATE bm_edges SET to_id=? WHERE to_id=?').run(keepId, mergeId);
  db.prepare('DELETE FROM bm_edges WHERE from_id = to_id').run();
  db.prepare(`DELETE FROM bm_edges WHERE id NOT IN (
    SELECT MIN(id) FROM bm_edges GROUP BY from_id, to_id, type)`).run();
  deprecate(db, mergeId);
}

/** Batch-update pagerank scores for multiple nodes in a single transaction. Rolls back on error. */
/** 批量更新节点 PageRank 分数(单个事务)。 */
export function updatePageranks(db: DatabaseSyncInstance, scores: Map<string, number>): void {
  const stmt = db.prepare('UPDATE bm_nodes SET pagerank=? WHERE id=?');
  db.exec('BEGIN');
  try {
    for (const [id, score] of scores) stmt.run(score, id);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

/** Batch-update community_id labels for multiple nodes in a single transaction. Rolls back on error. */
/** 批量更新节点 community_id 标签(单个事务)。 */
export function updateCommunities(db: DatabaseSyncInstance, labels: Map<string, string>): void {
  const stmt = db.prepare('UPDATE bm_nodes SET community_id=? WHERE id=?');
  db.exec('BEGIN');
  try {
    for (const [id, cid] of labels) stmt.run(cid, id);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

/** Increment access_count and update last_accessed timestamp for a node. */
/** 增加节点访问计数并更新最后访问时间。 */
export function updateAccess(db: DatabaseSyncInstance, nodeId: string): void {
  db.prepare('UPDATE bm_nodes SET access_count=access_count+1, last_accessed=? WHERE id=?')
    .run(Date.now(), nodeId);
}

