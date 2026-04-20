/**
 * brain-memory — SQLite CRUD operations
 *
 * Merged from graph-memory store.ts + memory-lancedb-pro store patterns.
 * Authors: adoresever, win4r, brain-memory contributors
 */

import { type DatabaseSyncInstance } from "@photostructure/sqlite";
import { createHash } from "crypto";
import type { BmNode, BmEdge, EdgeType, GraphNodeType, MemoryCategory } from "../types.ts";

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

export function normalizeName(name: string): string {
  return name.trim().toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fff\-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

// ─── Node CRUD ─────────────────────────────────────────────────

export function findByName(db: DatabaseSyncInstance, name: string): BmNode | null {
  const r = db.prepare("SELECT * FROM bm_nodes WHERE name = ?").get(normalizeName(name)) as any;
  return r ? toNode(r) : null;
}

export function findById(db: DatabaseSyncInstance, id: string): BmNode | null {
  const r = db.prepare("SELECT * FROM bm_nodes WHERE id = ?").get(id) as any;
  return r ? toNode(r) : null;
}

export function allActiveNodes(db: DatabaseSyncInstance): BmNode[] {
  return (db.prepare("SELECT * FROM bm_nodes WHERE status='active'").all() as any[]).map(toNode);
}

export function allEdges(db: DatabaseSyncInstance): BmEdge[] {
  return (db.prepare("SELECT * FROM bm_edges").all() as any[]).map(toEdge);
}

export function upsertNode(
  db: DatabaseSyncInstance,
  c: { type: GraphNodeType; category: MemoryCategory; name: string; description: string; content: string; temporalType?: "static" | "dynamic"; scopeSession?: string | null; scopeAgent?: string | null; scopeWorkspace?: string | null },
  sessionId: string,
): { node: BmNode; isNew: boolean } {
  const name = normalizeName(c.name);
  const temporalType = c.temporalType ?? "static";
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
      source_sessions=?, updated_at=?, category=?, temporal_type=?, scope_session=?, scope_agent=?, scope_workspace=? WHERE id=?`)
      .run(content, desc, count, sessions, Date.now(), c.category, temporalType, scopeSession, scopeAgent, scopeWorkspace, ex.id);
    return { node: { ...ex, content, description: desc, validatedCount: count, category: c.category, temporalType, scopeSession, scopeAgent, scopeWorkspace }, isNew: false };
  }

  const id = uid("n");
  const now = Date.now();
  db.prepare(`INSERT INTO bm_nodes
    (id, type, category, name, description, content, status, validated_count,
     source_sessions, pagerank, importance, access_count, last_accessed,
     temporal_type, scope_session, scope_agent, scope_workspace, created_at, updated_at)
    VALUES (?,?,?,?,?,?,'active',1,?,0,0.5,0,0,?,?,?,?,?,?)`)
    .run(id, c.type, c.category, name, c.description, c.content,
         JSON.stringify([sessionId]), temporalType, scopeSession, scopeAgent, scopeWorkspace, now, now);
  return { node: findByName(db, name)!, isNew: true };
}

export function deprecate(db: DatabaseSyncInstance, nodeId: string): void {
  db.prepare("UPDATE bm_nodes SET status='deprecated', updated_at=? WHERE id=?")
    .run(Date.now(), nodeId);
}

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

export function updatePageranks(db: DatabaseSyncInstance, scores: Map<string, number>): void {
  const stmt = db.prepare("UPDATE bm_nodes SET pagerank=? WHERE id=?");
  db.exec("BEGIN");
  try {
    for (const [id, score] of scores) stmt.run(score, id);
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
}

export function updateCommunities(db: DatabaseSyncInstance, labels: Map<string, string>): void {
  const stmt = db.prepare("UPDATE bm_nodes SET community_id=? WHERE id=?");
  db.exec("BEGIN");
  try {
    for (const [id, cid] of labels) stmt.run(cid, id);
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
}

export function updateAccess(db: DatabaseSyncInstance, nodeId: string): void {
  db.prepare("UPDATE bm_nodes SET access_count=access_count+1, last_accessed=? WHERE id=?")
    .run(Date.now(), nodeId);
}

// ─── Edge CRUD ─────────────────────────────────────────────────

export function upsertEdge(
  db: DatabaseSyncInstance,
  e: { fromId: string; toId: string; type: EdgeType; instruction: string; condition?: string; sessionId: string },
): void {
  const ex = db.prepare("SELECT id FROM bm_edges WHERE from_id=? AND to_id=? AND type=?")
    .get(e.fromId, e.toId, e.type) as any;
  if (ex) {
    db.prepare("UPDATE bm_edges SET instruction=? WHERE id=?").run(e.instruction, ex.id);
    return;
  }
  db.prepare(`INSERT INTO bm_edges (id, from_id, to_id, type, instruction, condition, session_id, created_at)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run(uid("e"), e.fromId, e.toId, e.type, e.instruction, e.condition ?? null, e.sessionId, Date.now());
}

export function edgesFrom(db: DatabaseSyncInstance, id: string): BmEdge[] {
  return (db.prepare("SELECT * FROM bm_edges WHERE from_id=?").all(id) as any[]).map(toEdge);
}

export function edgesTo(db: DatabaseSyncInstance, id: string): BmEdge[] {
  return (db.prepare("SELECT * FROM bm_edges WHERE to_id=?").all(id) as any[]).map(toEdge);
}

// ─── FTS5 Search ───────────────────────────────────────────────

export function searchNodes(db: DatabaseSyncInstance, query: string, limit = 6): BmNode[] {
  const terms = query.trim().split(/\s+/).filter(Boolean).slice(0, 8);
  if (!terms.length) return topNodes(db, limit);

  try {
    const ftsQuery = terms.map(t => `"${t.replace(/"/g, "")}"`).join(" OR ");
    const rows = db.prepare(`
      SELECT n.*, rank FROM bm_nodes_fts fts
      JOIN bm_nodes n ON n.rowid = fts.rowid
      WHERE bm_nodes_fts MATCH ? AND n.status = 'active'
      ORDER BY rank LIMIT ?
    `).all(ftsQuery, limit) as any[];
    if (rows.length > 0) return rows.map(toNode);
  } catch { /* fallback */ }

  const where = terms.map(() => "(name LIKE ? OR description LIKE ? OR content LIKE ?)").join(" OR ");
  const likes = terms.flatMap(t => [`%${t}%`, `%${t}%`, `%${t}%`]);
  return (db.prepare(`
    SELECT * FROM bm_nodes WHERE status='active' AND (${where})
    ORDER BY pagerank DESC, validated_count DESC, updated_at DESC LIMIT ?
  `).all(...likes, limit) as any[]).map(toNode);
}

export function topNodes(db: DatabaseSyncInstance, limit = 6): BmNode[] {
  return (db.prepare(`
    SELECT * FROM bm_nodes WHERE status='active'
    ORDER BY pagerank DESC, validated_count DESC, updated_at DESC LIMIT ?
  `).all(limit) as any[]).map(toNode);
}

export function vectorSearchWithScore(db: DatabaseSyncInstance, vec: number[], limit: number): Array<{ node: BmNode; score: number }> {
  const rows = db.prepare("SELECT node_id, embedding FROM bm_vectors").all() as any[];
  if (!rows.length) return [];
  const q = new Float32Array(vec);
  const qNorm = Math.sqrt(q.reduce((s, x) => s + x * x, 0)) || 1e-9;
  const scored: Array<{ node: BmNode; score: number }> = [];
  for (const r of rows) {
    const raw = r.embedding as Uint8Array;
    const v = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
    let dot = 0, vNorm = 0;
    const len = Math.min(v.length, q.length);
    for (let i = 0; i < len; i++) { dot += v[i] * q[i]; vNorm += v[i] * v[i]; }
    const score = dot / (Math.sqrt(vNorm) * qNorm + 1e-9);
    const node = findById(db, r.node_id);
    if (node && node.status === 'active') scored.push({ node, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

// ─── Vector ops ────────────────────────────────────────────────

export function saveVector(db: DatabaseSyncInstance, nodeId: string, content: string, vec: number[]): void {
  const hash = createHash("md5").update(content).digest("hex");
  const f32 = vec instanceof Float32Array ? vec : new Float32Array(vec);
  const blob = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
  db.prepare("INSERT OR REPLACE INTO bm_vectors(node_id, embedding, hash) VALUES (?,?,?)")
    .run(nodeId, blob, hash);
}

export function getVector(db: DatabaseSyncInstance, nodeId: string): Float32Array | null {
  const r = db.prepare("SELECT embedding FROM bm_vectors WHERE node_id=?").get(nodeId) as any;
  if (!r?.embedding) return null;
  const raw = r.embedding as Uint8Array;
  return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
}

export function getVectorHash(db: DatabaseSyncInstance, nodeId: string): string | null {
  const r = db.prepare("SELECT hash FROM bm_vectors WHERE node_id=?").get(nodeId) as any;
  return r?.hash ?? null;
}

export function getAllVectors(db: DatabaseSyncInstance): Array<{ nodeId: string; embedding: Float32Array }> {
  const rows = db.prepare("SELECT node_id, embedding FROM bm_vectors").all() as any[];
  return rows.map(r => {
    const raw = r.embedding as Uint8Array;
    return { nodeId: r.node_id, embedding: new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4) };
  });
}

// ─── Community summaries ───────────────────────────────────────

export interface CommunitySummary {
  id: string; summary: string; nodeCount: number;
  createdAt: number; updatedAt: number;
}

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

export function getCommunitySummary(db: DatabaseSyncInstance, id: string): CommunitySummary | null {
  const r = db.prepare("SELECT * FROM bm_communities WHERE id=?").get(id) as any;
  if (!r) return null;
  return { id: r.id, summary: r.summary, nodeCount: r.node_count, createdAt: r.created_at, updatedAt: r.updated_at };
}

export function pruneCommunitySummaries(db: DatabaseSyncInstance): number {
  const result = db.prepare(`
    DELETE FROM bm_communities WHERE id NOT IN (
      SELECT DISTINCT community_id FROM bm_nodes WHERE community_id IS NOT NULL AND status='active'
    )`).run();
  return result.changes;
}

// ─── Message CRUD ──────────────────────────────────────────────

export function saveMessage(
  db: DatabaseSyncInstance, sid: string, turn: number, role: string, content: unknown
): void {
  db.prepare(`INSERT OR IGNORE INTO bm_messages (id, session_id, turn_index, role, content, extracted, created_at)
    VALUES (?,?,?,?,?,0,?)`)
    .run(uid("m"), sid, turn, role, JSON.stringify(content), Date.now());
}

export function getUnextracted(db: DatabaseSyncInstance, sid: string, limit: number): any[] {
  return db.prepare("SELECT * FROM bm_messages WHERE session_id=? AND extracted=0 ORDER BY turn_index LIMIT ?")
    .all(sid, limit) as any[];
}

export function markExtracted(db: DatabaseSyncInstance, sid: string, upToTurn: number): void {
  db.prepare("UPDATE bm_messages SET extracted=1 WHERE session_id=? AND turn_index<=?")
    .run(sid, upToTurn);
}

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

export type ScoredCommunity = { id: string; summary: string; score: number; nodeCount: number };

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


