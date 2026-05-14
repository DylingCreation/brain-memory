/**
 * brain-memory — SQLite CRUD operations
 *
 * Merged from graph-memory store.ts + memory-lancedb-pro store patterns.
 * Authors: adoresever, win4r, brain-memory contributors
 */

import { type DatabaseSyncInstance } from "@photostructure/sqlite";
import { createHash } from "crypto";
import type { BmNode, BmEdge, EdgeType, GraphNodeType, MemoryCategory } from "../types";
import type { ScopeFilter } from "../scope/isolation";
import { buildScopeFilterClause } from "../scope/isolation";

// ─── Helpers ───────────────────────────────────────────────────

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function toNode(r: any): BmNode {
  return {
    id: r.id, type: r.type as GraphNodeType, category: ((r.category || typeToCategory(r.type)) as MemoryCategory),
    name: r.name, description: r.description ?? "", content: r.content,
    status: r.status, validatedCount: r.validated_count,
    sourceSessions: JSON.parse(r.source_sessions ?? "[]"),
    communityId: r.community_id ?? null, pagerank: r.pagerank ?? 0,
    importance: r.importance ?? 0.5, accessCount: r.access_count ?? 0,
    lastAccessedAt: r.last_accessed ?? 0,
    temporalType: (r.temporal_type ?? "static") as "static" | "dynamic",
    source: r.source as "user" | "assistant",
    scopeSession: r.scope_session ?? null,
    scopeAgent: r.scope_agent ?? null,
    scopeWorkspace: r.scope_workspace ?? null,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

function typeToCategory(type: string): MemoryCategory {
  if (type === "TASK") return "tasks";
  if (type === "SKILL") return "skills";
  return "events"; // EVENT fallback
}

function toEdge(r: any): BmEdge {
  return {
    id: r.id, fromId: r.from_id, toId: r.to_id, type: r.type as EdgeType,
    instruction: r.instruction, condition: r.condition ?? undefined,
    sessionId: r.session_id, createdAt: r.created_at,
  };
}

/** 标准化节点名：去空格、去特殊字符、统一小写，用于防重复匹配。 */
export function normalizeName(name: string): string {
  const normalized = name.trim().toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fff\-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
  // Prevent empty string after normalization (e.g. input "!!!" or "   ")
  if (!normalized) return name.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, "") || "unnamed";
  return normalized;
}

// ─── Node CRUD ─────────────────────────────────────────────────

/** Look up a node by its normalized name. Returns null if not found. */
/** 按标准化名查找节点。返回 null 若不存在。 */
export function findByName(db: DatabaseSyncInstance, name: string): BmNode | null {
  const r = db.prepare("SELECT * FROM bm_nodes WHERE name = ?").get(normalizeName(name)) as any;
  return r ? toNode(r) : null;
}

/** Look up a node by its unique ID. Returns null if not found. */
/** 按唯一 ID 查找节点。返回 null 若不存在。 */
export function findById(db: DatabaseSyncInstance, id: string): BmNode | null {
  const r = db.prepare("SELECT * FROM bm_nodes WHERE id = ?").get(id) as any;
  return r ? toNode(r) : null;
}

/** Return all active nodes, optionally filtered by scope (agent/workspace/session). */
/** 查询所有活跃节点，可选范围过滤。 */
export function allActiveNodes(db: DatabaseSyncInstance, scopeFilter?: ScopeFilter): BmNode[] {
  const { clause, params } = scopeFilter ? buildScopeFilterClause(scopeFilter) : { clause: "", params: [] };
  return (db.prepare(`SELECT * FROM bm_nodes WHERE status='active'${clause}`)
    .all(...params) as any[]).map(toNode);
}

/** Return all edges in the graph. */
/** 查询所有边。 */
export function allEdges(db: DatabaseSyncInstance): BmEdge[] {
  return (db.prepare("SELECT * FROM bm_edges").all() as any[]).map(toEdge);
}

/** Insert a new node or update an existing one by name. Merges content, description, and source_sessions from both versions. Returns the node and whether it was newly created. */
/** 插入或更新节点（按名称匹配）。合并 content、description 和 source_sessions。返回节点和是否新建。 */
export function upsertNode(
  db: DatabaseSyncInstance,
  c: { type: GraphNodeType; category: MemoryCategory; name: string; description: string; content: string; source: "user" | "assistant"; temporalType?: "static" | "dynamic"; scopeSession?: string | null; scopeAgent?: string | null; scopeWorkspace?: string | null },
  sessionId: string,
): { node: BmNode; isNew: boolean } {
  const name = normalizeName(c.name);
  const temporalType = c.temporalType ?? "static";
  const source = c.source ?? "user";
  const scopeSession = c.scopeSession ?? sessionId;
  const scopeAgent = c.scopeAgent ?? null;
  const scopeWorkspace = c.scopeWorkspace ?? null;
  const ex = findByName(db, name);

  if (ex) {
    const sessions = JSON.stringify(Array.from(new Set([...ex.sourceSessions, sessionId])));
    const content = c.content.length > ex.content.length ? c.content : ex.content;
    const desc = c.description.length > ex.description.length ? c.description : ex.description;
    const count = ex.validatedCount + 1;
    db.prepare(`UPDATE bm_nodes SET content=?, description=?, validated_count=?,
      source_sessions=?, updated_at=?, category=?, temporal_type=?, source=?, scope_session=?, scope_agent=?, scope_workspace=? WHERE id=?`)
      .run(content, desc, count, sessions, Date.now(), c.category, temporalType, source, scopeSession, scopeAgent, scopeWorkspace, ex.id);
    return { node: { ...ex, content, description: desc, validatedCount: count, category: c.category, temporalType, source, scopeSession, scopeAgent, scopeWorkspace }, isNew: false };
  }

  const id = uid("n");
  const now = Date.now();
  db.prepare(`INSERT INTO bm_nodes
    (id, type, category, name, description, content, status, validated_count,
     source_sessions, pagerank, importance, access_count, last_accessed,
     temporal_type, source, scope_session, scope_agent, scope_workspace, created_at, updated_at)
    VALUES (?,?,?,?,?,?,'active',1,?,0,0.5,0,0,?,?,?,?,?,?,?)`)
    .run(id, c.type, c.category, name, c.description, c.content,
         JSON.stringify([sessionId]), temporalType, source, scopeSession, scopeAgent, scopeWorkspace, now, now);
  return { node: findByName(db, name)!, isNew: true };
}

/** Mark a node as deprecated (soft delete). */
/** 软删除节点（标记为 deprecated）。 */
export function deprecate(db: DatabaseSyncInstance, nodeId: string): void {
  db.prepare("UPDATE bm_nodes SET status='deprecated', updated_at=? WHERE id=?")
    .run(Date.now(), nodeId);
}

/** Merge two nodes: keep the higher-validatedCount one, combine source_sessions and validated_count, repoint edges, and deprecate the merged node. */
/** 合并两个节点：保留 validatedCount 高的，合并 session 和边，废弃被合并节点。 */
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

  db.prepare("UPDATE bm_edges SET from_id=? WHERE from_id=?").run(keepId, mergeId);
  db.prepare("UPDATE bm_edges SET to_id=? WHERE to_id=?").run(keepId, mergeId);
  db.prepare("DELETE FROM bm_edges WHERE from_id = to_id").run();
  db.prepare(`DELETE FROM bm_edges WHERE id NOT IN (
    SELECT MIN(id) FROM bm_edges GROUP BY from_id, to_id, type)`).run();
  deprecate(db, mergeId);
}

/** Batch-update pagerank scores for multiple nodes in a single transaction. Rolls back on error. */
/** 批量更新节点 PageRank 分数（单个事务）。 */
export function updatePageranks(db: DatabaseSyncInstance, scores: Map<string, number>): void {
  const stmt = db.prepare("UPDATE bm_nodes SET pagerank=? WHERE id=?");
  db.exec("BEGIN");
  try {
    for (const [id, score] of scores) stmt.run(score, id);
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
}

/** Batch-update community_id labels for multiple nodes in a single transaction. Rolls back on error. */
/** 批量更新节点 community_id 标签（单个事务）。 */
export function updateCommunities(db: DatabaseSyncInstance, labels: Map<string, string>): void {
  const stmt = db.prepare("UPDATE bm_nodes SET community_id=? WHERE id=?");
  db.exec("BEGIN");
  try {
    for (const [id, cid] of labels) stmt.run(cid, id);
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
}

/** Increment access_count and update last_accessed timestamp for a node. */
/** 增加节点访问计数并更新最后访问时间。 */
export function updateAccess(db: DatabaseSyncInstance, nodeId: string): void {
  db.prepare("UPDATE bm_nodes SET access_count=access_count+1, last_accessed=? WHERE id=?")
    .run(Date.now(), nodeId);
}

// ─── Edge CRUD ─────────────────────────────────────────────────

/** Insert a new edge or update an existing one (matched by from_id + to_id + type). Returns the edge object. */
/** 插入或更新边（按 fromId + toId + type 匹配）。返回边对象。 */
export function upsertEdge(
  db: DatabaseSyncInstance,
  e: { fromId: string; toId: string; type: EdgeType; instruction: string; condition?: string; sessionId: string },
): BmEdge {
  const ex = db.prepare("SELECT id FROM bm_edges WHERE from_id=? AND to_id=? AND type=?")
    .get(e.fromId, e.toId, e.type) as any;
  const now = Date.now();
  if (ex) {
    db.prepare("UPDATE bm_edges SET instruction=? WHERE id=?").run(e.instruction, ex.id);
    return { ...toEdge(db.prepare("SELECT * FROM bm_edges WHERE id=?").get(ex.id) as any), isNew: false } as any;
  }
  const id = uid("e");
  db.prepare(`INSERT INTO bm_edges (id, from_id, to_id, type, instruction, condition, session_id, created_at)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run(id, e.fromId, e.toId, e.type, e.instruction, e.condition ?? null, e.sessionId, now);
  // Construct edge from known data — no SELECT roundtrip needed
  return { id, fromId: e.fromId, toId: e.toId, type: e.type, instruction: e.instruction, condition: e.condition, sessionId: e.sessionId, createdAt: now } as BmEdge;
}

/** Return all outgoing edges from the given node. */
/** 查询节点的所有出边。 */
export function edgesFrom(db: DatabaseSyncInstance, id: string): BmEdge[] {
  return (db.prepare("SELECT * FROM bm_edges WHERE from_id=?").all(id) as any[]).map(toEdge);
}

/** Return all incoming edges to the given node. */
/** 查询节点的所有入边。 */
export function edgesTo(db: DatabaseSyncInstance, id: string): BmEdge[] {
  return (db.prepare("SELECT * FROM bm_edges WHERE to_id=?").all(id) as any[]).map(toEdge);
}

// ─── FTS5 Search ───────────────────────────────────────────────

/** Search active nodes by text. Tries FTS5 first (fast for English), falls back to LIKE search (better for Chinese). Returns top-N by rank or pagerank. Supports optional scope filtering. */
/** 文本搜索节点（FTS5 → LIKE 回退）。返回 top-N 按 rank 或 PageRank 排序，支持范围过滤。 */
export function searchNodes(db: DatabaseSyncInstance, query: string, limit = 6, scopeFilter?: ScopeFilter): BmNode[] {
  const terms = query.trim().split(/\s+/).filter(Boolean).slice(0, 8);
  if (!terms.length) return topNodes(db, limit, scopeFilter);

  const { clause, params: scopeParams } = scopeFilter ? buildScopeFilterClause(scopeFilter) : { clause: "", params: [] };

  // Try FTS5 search first
  try {
    const ftsQuery = terms.map(t => `"${t.replace(/"/g, "")}"`).join(" OR ");
    const rows = db.prepare(`
      SELECT n.*, rank FROM bm_nodes_fts fts
      JOIN bm_nodes n ON n.rowid = fts.rowid
      WHERE bm_nodes_fts MATCH ? AND n.status = 'active'${clause}
      ORDER BY rank LIMIT ?
    `).all(ftsQuery, ...scopeParams, limit) as any[];
    
    // If FTS5 returns results, return them; otherwise, fall back to LIKE search
    // This is especially important for Chinese text which FTS5 doesn't handle well
    if (rows.length > 0) return rows.map(toNode);
  } catch { /* fallback to LIKE search */ }

  // Fallback to LIKE search (works better for Chinese characters)
  const where = terms.map(() => "(name LIKE ? OR description LIKE ? OR content LIKE ?)").join(" OR ");
  const likes = terms.flatMap(t => [`%${t}%`, `%${t}%`, `%${t}%`]);
  return (db.prepare(`
    SELECT * FROM bm_nodes WHERE status='active' AND (${where})${clause}
    ORDER BY pagerank DESC, validated_count DESC, updated_at DESC LIMIT ?
  `).all(...likes, ...scopeParams, limit) as any[]).map(toNode);
}

/** Return the top-N active nodes sorted by pagerank, validated_count, and updated_at. Supports optional scope filtering. */
/** 返回 top-N 活跃节点，按 PageRank 降序。 */
export function topNodes(db: DatabaseSyncInstance, limit = 6, scopeFilter?: ScopeFilter): BmNode[] {
  const { clause, params } = scopeFilter ? buildScopeFilterClause(scopeFilter) : { clause: "", params: [] };
  return (db.prepare(`
    SELECT * FROM bm_nodes WHERE status='active'${clause}
    ORDER BY pagerank DESC, validated_count DESC, updated_at DESC LIMIT ?
  `).all(...params, limit) as any[]).map(toNode);
}

/** Cosine-similarity vector search. Returns nodes with their similarity scores, sorted descending. Applies scope filtering if provided. Only loads vectors for valid active nodes. */
/** 向量相似度搜索（余弦距离）。返回节点及相似度分数。 */
export function vectorSearchWithScore(db: DatabaseSyncInstance, vec: number[], limit: number, scopeFilter?: ScopeFilter): Array<{ node: BmNode; score: number }> {
  // First get all active nodes with scope filtering applied
  const { clause, params } = scopeFilter ? buildScopeFilterClause(scopeFilter) : { clause: "", params: [] };
  const nodes = db.prepare(`SELECT * FROM bm_nodes WHERE status='active'${clause}`).all(...params) as any[];
  
  if (!nodes.length) return [];
  
  // Create a set of valid node IDs for faster lookup
  const validNodeIds = new Set(nodes.map(n => n.id));
  
  // Load only vectors for valid nodes
  const placeholders = nodes.map(() => "?").join(",");
  const vectorRows = db.prepare(`SELECT node_id, embedding FROM bm_vectors WHERE node_id IN (${placeholders})`).all(...nodes.map(n => n.id)) as any[];
  
  if (!vectorRows.length) return [];
  
  const q = new Float32Array(vec);
  const qNorm = Math.sqrt(q.reduce((s, x) => s + x * x, 0)) || 1e-9;
  
  // Pre-compute nodes to avoid repeated DB calls
  const nodeMap = new Map<string, BmNode>();
  for (const node of nodes) {
    nodeMap.set(node.id, toNode(node));
  }
  
  const scored: Array<{ node: BmNode; score: number }> = [];
  for (const r of vectorRows) {
    const raw = r.embedding as Uint8Array;
    const v = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
    let dot = 0, vNorm = 0;
    const len = Math.min(v.length, q.length);
    for (let i = 0; i < len; i++) { dot += v[i] * q[i]; vNorm += v[i] * v[i]; }
    const score = dot / (Math.sqrt(vNorm) * qNorm + 1e-9);
    const node = nodeMap.get(r.node_id);
    if (node) scored.push({ node, score });
  }
  
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

function matchesScopeFilter(node: BmNode, scopeFilter?: ScopeFilter): boolean {
  if (!scopeFilter) return true;

  // Check exclude scopes — reject if node matches ANY excluded scope
  for (const ex of scopeFilter.excludeScopes) {
    if (
      (!ex.sessionId || node.scopeSession === ex.sessionId) &&
      (!ex.agentId || node.scopeAgent === ex.agentId) &&
      (!ex.workspaceId || node.scopeWorkspace === ex.workspaceId)
    ) return false;
  }

  // Check include scopes — if non-empty, node must match at least one
  if (scopeFilter.includeScopes.length > 0) {
    return scopeFilter.includeScopes.some(
      inc =>
        (!inc.sessionId || node.scopeSession === inc.sessionId) &&
        (!inc.agentId || node.scopeAgent === inc.agentId) &&
        (!inc.workspaceId || node.scopeWorkspace === inc.workspaceId),
    );
  }

  return true;
}

// ─── Vector ops ────────────────────────────────────────────────

/** Store or replace an embedding vector for a node. Content hash is saved for cache-hit detection. */
/** 存储或替换节点的嵌入向量。 */
export function saveVector(db: DatabaseSyncInstance, nodeId: string, content: string, vec: number[]): void {
  const hash = createHash("md5").update(content).digest("hex");
  const f32 = vec instanceof Float32Array ? vec : new Float32Array(vec);
  const blob = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
  db.prepare("INSERT OR REPLACE INTO bm_vectors(node_id, embedding, hash) VALUES (?,?,?)")
    .run(nodeId, blob, hash);
}

/** Retrieve the stored embedding vector for a node. Returns null if not found. */
/** 获取节点的嵌入向量（Float32Array）。返回 null 若不存在。 */
export function getVector(db: DatabaseSyncInstance, nodeId: string): Float32Array | null {
  const r = db.prepare("SELECT embedding FROM bm_vectors WHERE node_id=?").get(nodeId) as any;
  if (!r?.embedding) return null;
  const raw = r.embedding as Uint8Array;
  return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
}

/** Retrieve the MD5 content hash stored alongside a node's embedding vector. Returns null if not found. */
/** 获取节点向量的内容哈希（用于缓存检测）。 */
export function getVectorHash(db: DatabaseSyncInstance, nodeId: string): string | null {
  const r = db.prepare("SELECT hash FROM bm_vectors WHERE node_id=?").get(nodeId) as any;
  return r?.hash ?? null;
}

/** Load all stored node-embedding pairs. Returns Float32Array embeddings for in-memory operations (e.g., cosine similarity). */
/** 加载所有节点的嵌入向量对。用于去重检测。 */
export function getAllVectors(db: DatabaseSyncInstance): Array<{ nodeId: string; embedding: Float32Array }> {
  const rows = db.prepare("SELECT node_id, embedding FROM bm_vectors").all() as any[];
  return rows.map(r => {
    const raw = r.embedding as Uint8Array;
    return { nodeId: r?.node_id, embedding: new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4) };
  });
}

// ─── Community summaries ───────────────────────────────────────

/** 社区摘要记录。包含 ID、摘要文本、节点数和时间戳。 */
export interface CommunitySummary {
  id: string; summary: string; nodeCount: number;
  createdAt: number; updatedAt: number;
}

/** 存储或更新社区摘要和嵌入向量。 */
export function upsertCommunitySummary(
  db: DatabaseSyncInstance, id: string, summary: string, nodeCount: number, embedding?: number[],
): void {
  const now = Date.now();
  const blob = embedding ? new Uint8Array(new Float32Array(embedding).buffer) : null;
  const ex = db.prepare("SELECT id FROM bm_communities WHERE id=?").get(id) as any;
  if (ex) {
    if (blob) {
      db.prepare("UPDATE bm_communities SET summary=?, node_count=?, embedding=?, updated_at=? WHERE id=?")
        .run(summary, nodeCount, blob, now, id);
    } else {
      db.prepare("UPDATE bm_communities SET summary=?, node_count=?, updated_at=? WHERE id=?")
        .run(summary, nodeCount, now, id);
    }
  } else {
    db.prepare("INSERT INTO bm_communities (id, summary, node_count, embedding, created_at, updated_at) VALUES (?,?,?,?,?,?)")
      .run(id, summary, nodeCount, blob, now, now);
  }
}

/** 按 ID 获取社区摘要。返回 null 若不存在。 */
export function getCommunitySummary(db: DatabaseSyncInstance, id: string): CommunitySummary | null {
  const r = db.prepare("SELECT * FROM bm_communities WHERE id=?").get(id) as any;
  if (!r) return null;
  return { id: r.id, summary: r.summary, nodeCount: r.node_count, createdAt: r.created_at, updatedAt: r.updated_at };
}

/** #10 fix: Batch fetch all community summaries in a single query */
/** 批量获取所有社区摘要（单次查询）。 */
export function getAllCommunitySummaries(db: DatabaseSyncInstance): Map<string, CommunitySummary> {
  const rows = db.prepare("SELECT * FROM bm_communities").all() as any[];
  const map = new Map<string, CommunitySummary>();
  for (const r of rows) {
    map.set(r.id, { id: r.id, summary: r.summary, nodeCount: r.node_count, createdAt: r.created_at, updatedAt: r.updated_at });
  }
  return map;
}

/** Delete orphaned community summaries whose community_id no longer references any active node. Returns the number of deleted rows. */
/** 删除不再存在的社区的摘要记录。 */
export function pruneCommunitySummaries(db: DatabaseSyncInstance): number {
  const result = db.prepare(`
    DELETE FROM bm_communities WHERE id NOT IN (
      SELECT DISTINCT community_id FROM bm_nodes WHERE community_id IS NOT NULL AND status='active'
    )`).run();
  return result.changes;
}

// ─── Message CRUD ──────────────────────────────────────────────

/** Save a conversation message. INSERT OR IGNORE — duplicate (same id) messages are silently skipped. */
/** 保存对话消息。 */
export function saveMessage(
  db: DatabaseSyncInstance, sid: string, turn: number, role: string, content: unknown
): void {
  db.prepare(`INSERT OR IGNORE INTO bm_messages (id, session_id, turn_index, role, content, extracted, created_at)
    VALUES (?,?,?,?,?,0,?)`)
    .run(uid("m"), sid, turn, role, JSON.stringify(content), Date.now());
}

/** Return messages that have not yet been processed for memory extraction, ordered by turn_index. */
/** 获取未提取的会话消息（按 turn_index 排序）。 */
export function getUnextracted(db: DatabaseSyncInstance, sid: string, limit: number): any[] {
  return db.prepare("SELECT * FROM bm_messages WHERE session_id=? AND extracted=0 ORDER BY turn_index LIMIT ?")
    .all(sid, limit) as any[];
}

/** Mark messages up to the given turn_index as extracted (processed for memory). */
/** 标记消息为已提取（截至指定轮次）。 */
export function markExtracted(db: DatabaseSyncInstance, sid: string, upToTurn: number): void {
  db.prepare("UPDATE bm_messages SET extracted=1 WHERE session_id=? AND turn_index<=?")
    .run(sid, upToTurn);
}

/** Retrieve episodic messages near a given timestamp across multiple sessions. Returns text snippets within maxChars budget, ordered by temporal proximity to nearTime. */
/** 获取指定时间附近的对话片段（用于场景回忆）。 */
export function getEpisodicMessages(
  db: DatabaseSyncInstance, sessionIds: string[], nearTime: number, maxChars = 1500,
): Array<{ sessionId: string; role: string; text: string }> {
  if (!sessionIds.length) return [];
  const results: Array<{ sessionId: string; role: string; text: string }> = [];
  let totalChars = 0;

  for (const sid of sessionIds) {
    const msgs = db.prepare(`
      SELECT role, content FROM bm_messages
      WHERE session_id=? AND role IN ('user','assistant')
      ORDER BY ABS(turn_index - (
        SELECT turn_index FROM bm_messages WHERE session_id=? AND role='user'
        ORDER BY ABS(created_at - ?) LIMIT 1
      )) LIMIT 10
    `).all(sid, sid, nearTime) as any[];

    for (const m of msgs) {
      const text = (() => { try { return JSON.parse(m.content); } catch { return m.content; } })();
      const s = typeof text === "string" ? text : JSON.stringify(text);
      if (totalChars + s.length > maxChars) break;
      results.push({ sessionId: sid, role: m.role, text: s });
      totalChars += s.length;
    }
    if (totalChars >= maxChars) break;
  }
  return results;
}

// ─── Graph walk (recursive CTE) ────────────────────────────────

/** Traverse the graph from seed nodes up to maxDepth hops using a recursive CTE. Returns all reachable nodes and the edges connecting them. */
/** 图谱遍历（递归 CTE）：从种子节点出发，最多 maxDepth 跳。返回可达节点和连接边。 */
export function graphWalk(
  db: DatabaseSyncInstance, seedIds: string[], maxDepth: number,
): { nodes: BmNode[]; edges: BmEdge[] } {
  if (!seedIds.length) return { nodes: [], edges: [] };
  const ph = seedIds.map(() => "?").join(",");

  const walkRows = db.prepare(`
    WITH RECURSIVE walk(node_id, depth) AS (
      SELECT id, 0 FROM bm_nodes WHERE id IN (${ph}) AND status='active'
      UNION
      SELECT CASE WHEN e.from_id = w.node_id THEN e.to_id ELSE e.from_id END, w.depth + 1
      FROM walk w JOIN bm_edges e ON (e.from_id = w.node_id OR e.to_id = w.node_id)
      WHERE w.depth < ?
    ) SELECT DISTINCT node_id FROM walk
  `).all(...seedIds, maxDepth) as any[];

  const nodeIds = walkRows.map((r: any) => r.node_id);
  if (!nodeIds.length) return { nodes: [], edges: [] };

  const np = nodeIds.map(() => "?").join(",");
  const nodes = (db.prepare(`SELECT * FROM bm_nodes WHERE id IN (${np}) AND status='active'`)
    .all(...nodeIds) as any[]).map(toNode);
  const edges = (db.prepare(`SELECT * FROM bm_edges WHERE from_id IN (${np}) AND to_id IN (${np})`)
    .all(...nodeIds, ...nodeIds) as any[]).map(toEdge);
  return { nodes, edges };
}

// ─── Community vector search ───────────────────────────────────

/** 带相似度分数的社区搜索结果。 */
export type ScoredCommunity = { id: string; summary: string; score: number; nodeCount: number };

/** Search communities by cosine similarity of their stored embedding vectors. Returns communities above minScore, sorted by score descending. */
/** 社区向量搜索（余弦相似度）。返回分数高于 minScore 的社区。 */
export function communityVectorSearch(db: DatabaseSyncInstance, queryVec: number[], minScore = 0.15): ScoredCommunity[] {
  const rows = db.prepare("SELECT id, summary, node_count, embedding FROM bm_communities WHERE embedding IS NOT NULL").all() as any[];
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
    return { id: r.id, summary: r.summary, score: dot / (Math.sqrt(vNorm) * qNorm + 1e-9), nodeCount: r.node_count };
  }).filter(s => s.score > minScore).sort((a, b) => b.score - a.score);
}

/** Return up to perCommunity active nodes per given community, ordered by updated_at descending. */
/** 按社区 ID 获取成员节点。每个社区返回 up to perCommunity 个。 */
export function nodesByCommunityIds(db: DatabaseSyncInstance, communityIds: string[], perCommunity = 3): BmNode[] {
  if (!communityIds.length) return [];
  const ph = communityIds.map(() => "?").join(",");
  const rows = db.prepare(`
    SELECT * FROM bm_nodes WHERE community_id IN (${ph}) AND status='active'
    ORDER BY community_id, updated_at DESC`).all(...communityIds) as any[];

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


