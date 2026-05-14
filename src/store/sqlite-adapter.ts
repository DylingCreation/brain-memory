/**
 * brain-memory — SQLiteStorageAdapter: IStorageAdapter implementation for SQLite
 *
 * v1.1.0 F-1: Wraps existing store/store.ts functions behind the IStorageAdapter interface.
 * Pure delegation — no logic changes.
 *
 * Authors: brain-memory contributors
 */

import { type DatabaseSyncInstance } from "@photostructure/sqlite";
import type { BmNode, BmEdge, EdgeType, MemoryCategory, GraphNodeType } from "../types";
import type { ScopeFilter } from "../scope/isolation";
import { buildScopeFilterClause } from "../scope/isolation";
import { initDb, getDbPath } from "./db";
import { migrate, getSchemaVersion } from "./migrate";
import {
  findByName, findById, upsertNode, deprecate, mergeNodes,
  allActiveNodes, allEdges, updatePageranks, updateCommunities, updateAccess,
  upsertEdge, edgesFrom, edgesTo,
  searchNodes, topNodes, vectorSearchWithScore, graphWalk,
  saveVector, getVector, getVectorHash, getAllVectors,
  upsertCommunitySummary, getCommunitySummary, getAllCommunitySummaries,
  pruneCommunitySummaries, communityVectorSearch, nodesByCommunityIds,
  saveMessage, getUnextracted, markExtracted, getEpisodicMessages as getEpisodicMessagesStore,
  type CommunitySummary as StoreCommunitySummary,
} from "./store";
import type {
  IStorageAdapter, NodeUpsertInput, EdgeUpsertInput, StorageFilter,
  ScoredNode, ScoredCommunityResult, CommunitySummaryRecord,
  MessageRow, EpisodicSnippet, StorageStats,
} from "./adapter";

/** Convert internal ScopeFilter to StorageFilter-compatible format. */
function scopeFilterToStorageFilter(filter?: StorageFilter): ScopeFilter | undefined {
  if (!filter) return undefined;
  return {
    includeScopes: filter.includeScopes ?? [],
    excludeScopes: filter.excludeScopes ?? [],
    allowCrossScope: !!filter.sharingMode && filter.sharingMode !== "isolated",
    sharingMode: filter.sharingMode,
    sharedCategories: filter.sharedCategories,
    currentAgentId: filter.currentAgentId,
    allowedAgents: filter.allowedAgents,
  };
}

/** Convert raw DB row to BmNode (copied from store.ts to avoid circular import). */
function toNodeFromRaw(r: any): BmNode {
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
  return "events";
}

/**
 * SQLite-backed implementation of IStorageAdapter.
 */
export class SQLiteStorageAdapter implements IStorageAdapter {
  private db: DatabaseSyncInstance | null = null;
  private dbPath: string;
  private initialized = false;

  // Dirty tracking for incremental graph maintenance (in-memory)
  private dirtyNodes: Set<string> = new Set();
  private dirtyEdges: Set<string> = new Set();

  constructor(dbPath?: string) {
    this.dbPath = dbPath ? getDbPath(dbPath) : getDbPath();
  }

  // ─── Lifecycle ───────────────────────────────────────────

  initialize(): void {
    this.db = initDb(this.dbPath);
    this.initialized = true;
  }

  close(): void {
    if (this.db) {
      try { this.db.close(); } catch { /* ignore */ }
      this.db = null;
    }
    this.initialized = false;
    this.dirtyNodes.clear();
    this.dirtyEdges.clear();
  }

  isConnected(): boolean {
    return this.initialized && this.db !== null;
  }

  /** Expose the raw DatabaseSyncInstance for legacy/internal use. */
  getDb(): DatabaseSyncInstance {
    if (!this.db) throw new Error("Storage not initialized");
    return this.db;
  }

  // ─── Node CRUD ───────────────────────────────────────────

  findNodeByName(name: string): BmNode | null {
    return findByName(this.assertDb(), name);
  }

  findNodeById(id: string): BmNode | null {
    return findById(this.assertDb(), id);
  }

  upsertNode(input: NodeUpsertInput, sessionId: string): { node: BmNode; isNew: boolean } {
    return upsertNode(this.assertDb(), input, sessionId);
  }

  deprecateNode(nodeId: string): void {
    deprecate(this.assertDb(), nodeId);
  }

  mergeNodes(keepId: string, mergeId: string): void {
    mergeNodes(this.assertDb(), keepId, mergeId);
  }

  findAllActive(filter?: StorageFilter): BmNode[] {
    return allActiveNodes(this.assertDb(), scopeFilterToStorageFilter(filter));
  }

  findAllEdges(): BmEdge[] {
    return allEdges(this.assertDb());
  }

  updatePageranks(scores: Map<string, number>): void {
    updatePageranks(this.assertDb(), scores);
  }

  updateCommunities(labels: Map<string, string>): void {
    updateCommunities(this.assertDb(), labels);
  }

  updateAccess(nodeId: string): void {
    updateAccess(this.assertDb(), nodeId);
  }

  // ─── Edge CRUD ───────────────────────────────────────────

  upsertEdge(input: EdgeUpsertInput): BmEdge {
    return upsertEdge(this.assertDb(), input);
  }

  findEdgesFrom(nodeId: string): BmEdge[] {
    return edgesFrom(this.assertDb(), nodeId);
  }

  findEdgesTo(nodeId: string): BmEdge[] {
    return edgesTo(this.assertDb(), nodeId);
  }

  // ─── Search ──────────────────────────────────────────────

  searchNodes(query: string, limit: number, filter?: StorageFilter): BmNode[] {
    return searchNodes(this.assertDb(), query, limit, scopeFilterToStorageFilter(filter));
  }

  findTopNodes(limit: number, filter?: StorageFilter): BmNode[] {
    return topNodes(this.assertDb(), limit, scopeFilterToStorageFilter(filter));
  }

  vectorSearch(queryVec: number[], limit: number, minScore = 0, filter?: StorageFilter): ScoredNode[] {
    const scored = vectorSearchWithScore(this.assertDb(), queryVec, limit, scopeFilterToStorageFilter(filter));
    return scored.filter(s => s.score >= minScore);
  }

  vectorSearchWithScore(queryVec: number[], limit: number, filter?: StorageFilter): ScoredNode[] {
    return vectorSearchWithScore(this.assertDb(), queryVec, limit, scopeFilterToStorageFilter(filter));
  }

  graphWalk(seedIds: string[], maxDepth: number): { nodes: BmNode[]; edges: BmEdge[] } {
    return graphWalk(this.assertDb(), seedIds, maxDepth);
  }

  loadGraphStructure(): { nodeIds: string[]; edges: Array<{ fromId: string; toId: string }> } {
    const db = this.assertDb();
    const nodeRows = db.prepare("SELECT id FROM bm_nodes WHERE status='active'").all() as any[];
    const nodeIds = nodeRows.map((r: any) => r.id);
    const edgeRows = db.prepare("SELECT from_id, to_id FROM bm_edges").all() as any[];
    const edges = edgeRows.map((e: any) => ({ fromId: e.from_id, toId: e.to_id }));
    return { nodeIds, edges };
  }

  // ─── Vector Operations ───────────────────────────────────

  saveVector(nodeId: string, content: string, vec: number[]): void {
    saveVector(this.assertDb(), nodeId, content, vec);
  }

  getVector(nodeId: string): Float32Array | null {
    return getVector(this.assertDb(), nodeId);
  }

  getVectorHash(nodeId: string): string | null {
    return getVectorHash(this.assertDb(), nodeId);
  }

  loadAllVectors(): Array<{ nodeId: string; embedding: Float32Array }> {
    return getAllVectors(this.assertDb());
  }

  // ─── Communities ─────────────────────────────────────────

  upsertCommunity(id: string, summary: string, nodeCount: number, embedding?: number[]): void {
    upsertCommunitySummary(this.assertDb(), id, summary, nodeCount, embedding);
  }

  getCommunity(id: string): CommunitySummaryRecord | null {
    const s = getCommunitySummary(this.assertDb(), id);
    return s ? { id: s.id, summary: s.summary, nodeCount: s.nodeCount, createdAt: s.createdAt, updatedAt: s.updatedAt } : null;
  }

  getAllCommunities(): Map<string, CommunitySummaryRecord> {
    const raw = getAllCommunitySummaries(this.assertDb());
    const out = new Map<string, CommunitySummaryRecord>();
    for (const [k, v] of raw) {
      out.set(k, { id: v.id, summary: v.summary, nodeCount: v.nodeCount, createdAt: v.createdAt, updatedAt: v.updatedAt });
    }
    return out;
  }

  pruneCommunities(): number {
    return pruneCommunitySummaries(this.assertDb());
  }

  communityVectorSearch(queryVec: number[], minScore: number): ScoredCommunityResult[] {
    return communityVectorSearch(this.assertDb(), queryVec, minScore);
  }

  findNodesByCommunities(communityIds: string[], perCommunity: number): BmNode[] {
    return nodesByCommunityIds(this.assertDb(), communityIds, perCommunity);
  }

  findCommunityPeers(nodeId: string, limit: number): string[] {
    const db = this.assertDb();
    const row = db.prepare("SELECT community_id FROM bm_nodes WHERE id=? AND status='active'").get(nodeId) as any;
    if (!row?.community_id) return [];
    return (db.prepare(`
      SELECT id FROM bm_nodes WHERE community_id=? AND id!=? AND status='active'
      ORDER BY validated_count DESC, updated_at DESC LIMIT ?
    `).all(row.community_id, nodeId, limit) as any[]).map((r: any) => r.id);
  }

  findCommunityRepresentatives(perCommunity: number): BmNode[] {
    const rows = this.assertDb().prepare(`
      SELECT * FROM bm_nodes WHERE status='active' AND community_id IS NOT NULL
      ORDER BY community_id, validated_count DESC, updated_at DESC
    `).all() as any[];
    const byCommunity = new Map<string, any[]>();
    for (const r of rows) {
      const cid = r.community_id;
      if (!byCommunity.has(cid)) byCommunity.set(cid, []);
      if (byCommunity.get(cid)!.length < perCommunity) byCommunity.get(cid)!.push(r);
    }
    return Array.from(byCommunity.values()).flat().map(toNodeFromRaw);
  }

  // ─── Messages ────────────────────────────────────────────

  saveMessage(sessionId: string, turn: number, role: string, content: unknown): void {
    saveMessage(this.assertDb(), sessionId, turn, role, content as string);
  }

  getUnextractedMessages(sessionId: string, limit: number): MessageRow[] {
    return getUnextracted(this.assertDb(), sessionId, limit);
  }

  markMessagesExtracted(sessionId: string, upToTurn: number): void {
    markExtracted(this.assertDb(), sessionId, upToTurn);
  }

  getEpisodicMessages(sessionIds: string[], nearTime: number, maxChars: number): EpisodicSnippet[] {
    return getEpisodicMessagesStore(this.assertDb(), sessionIds, nearTime, maxChars);
  }

  // ─── Statistics & Metadata ───────────────────────────────

  getStats(): StorageStats {
    const db = this.assertDb();
    const totalNodes = db.prepare("SELECT COUNT(*) as c FROM bm_nodes").get()["c"] as number;
    const activeNodes = db.prepare("SELECT COUNT(*) as c FROM bm_nodes WHERE status='active'").get()["c"] as number;
    const deprecatedNodes = db.prepare("SELECT COUNT(*) as c FROM bm_nodes WHERE status='deprecated'").get()["c"] as number;
    const totalEdges = db.prepare("SELECT COUNT(*) as c FROM bm_edges").get()["c"] as number;
    const vectorCount = db.prepare("SELECT COUNT(*) as c FROM bm_vectors").get()["c"] as number;
    const communityCount = db.prepare("SELECT COUNT(*) as c FROM bm_communities").get()["c"] as number;

    const categories = ["profile", "preferences", "entities", "events", "tasks", "skills", "cases", "patterns"] as MemoryCategory[];
    const nodesByCategory = {} as Record<MemoryCategory, number>;
    for (const cat of categories) {
      nodesByCategory[cat] = db.prepare("SELECT COUNT(*) as c FROM bm_nodes WHERE category=?").get(cat)["c"] as number;
    }

    const edgeTypesList = ["USED_SKILL", "SOLVED_BY", "REQUIRES", "PATCHES", "CONFLICTS_WITH", "HAS_PREFERENCE", "BELONGS_TO", "LEARNED_FROM", "EXEMPLIFIES", "RELATED_TO", "OBSERVED_IN"] as EdgeType[];
    const edgeTypes = {} as Record<EdgeType, number>;
    for (const et of edgeTypesList) {
      edgeTypes[et] = db.prepare("SELECT COUNT(*) as c FROM bm_edges WHERE type=?").get(et)["c"] as number;
    }

    return {
      totalNodes, activeNodes, deprecatedNodes, totalEdges,
      nodesByCategory, edgeTypes,
      vectorCount, communityCount,
      schemaVersion: getSchemaVersion(db),
    };
  }

  getSchemaVersion(): number {
    return getSchemaVersion(this.assertDb());
  }

  // ─── Incremental Graph Maintenance (v1.1.0 F-3 reserved) ─

  getDirtyNodes(): Set<string> {
    return new Set(this.dirtyNodes);
  }

  markDirty(nodeIds: string[]): void {
    for (const id of nodeIds) this.dirtyNodes.add(id);
  }

  markDirtyEdges(edgeIds: string[]): void {
    for (const id of edgeIds) this.dirtyEdges.add(id);
  }

  clearDirty(): void {
    this.dirtyNodes.clear();
    this.dirtyEdges.clear();
  }

  getAffectedSubgraph(maxDepth: number): { nodes: BmNode[]; edges: BmEdge[] } {
    if (this.dirtyNodes.size === 0) return { nodes: [], edges: [] };
    return graphWalk(this.assertDb(), Array.from(this.dirtyNodes), maxDepth);
  }

  // ─── Helpers ─────────────────────────────────────────────

  private assertDb(): DatabaseSyncInstance {
    if (!this.db) throw new Error("Storage not initialized. Call initialize() first.");
    return this.db;
  }
}
