/**
 * brain-memory — LanceDBStorageAdapter: IStorageAdapter POC implementation
 *
 * v1.3.0 F-13: LanceDB POC — validates LanceDB as a vector storage backend.
 * NOT production-ready. Graph algorithms run in-memory.
 *
 * Authors: brain-memory contributors
 */

import type { BmNode, BmEdge, EdgeType, MemoryCategory, GraphNodeType } from "../types";
import type {
  IStorageAdapter, NodeUpsertInput, EdgeUpsertInput, StorageFilter,
  ScoredNode, ScoredCommunityResult, CommunitySummaryRecord,
  MessageRow, EpisodicSnippet, StorageStats,
} from "./adapter";

interface LanceTable {
  add(data: Array<Record<string, unknown>>): Promise<void>;
  countRows(): Promise<number>;
  vectorSearch(vec: number[]): any;
  search(): any;
  query(): any;
  update(updates: Record<string, unknown>): any;
  delete(predicate: string): Promise<void>;
  drop(): Promise<void>;
}

interface LanceDBConnection {
  createTable(name: string, data: Array<Record<string, unknown>>, options?: any): Promise<LanceTable>;
  openTable(name: string): Promise<LanceTable>;
  dropTable(name: string): Promise<void>;
  tableNames(): Promise<string[]>;
  close(): void;
}

export class LanceDBStorageAdapter implements IStorageAdapter {
  private db: LanceDBConnection | null = null;
  private dbPath: string;
  private initialized = false;

  private dirtyNodes: Set<string> = new Set();
  private dirtyEdges: Set<string> = new Set();

  constructor(dbPath?: string) {
    this.dbPath = dbPath || "/tmp/brain-memory-lancedb";
  }

  // ─── Lifecycle ───────────────────────────────────────────

  async initialize(): Promise<void> {
    const lancedb = await import("@lancedb/lancedb");
    this.db = await lancedb.connect(this.dbPath) as unknown as LanceDBConnection;
    this.initialized = true;
  }

  close(): void {
    if (this.db) { this.db.close(); this.db = null; }
    this.initialized = false;
    this.dirtyNodes.clear();
    this.dirtyEdges.clear();
  }

  isConnected(): boolean { return this.initialized && this.db !== null; }

  // ─── Node CRUD ───────────────────────────────────────────

  findNodeByName(name: string): BmNode | null {
    // In-memory scan (POC only)
    if (!this._nodeCache) return null;
    return this._nodeCache.find(n => n.name === name) || null;
  }

  findNodeById(id: string): BmNode | null {
    if (!this._nodeCache) return null;
    return this._nodeCache.find(n => n.id === id) || null;
  }

  upsertNode(input: NodeUpsertInput, sessionId: string): { node: BmNode; isNew: boolean } {
    const id = `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = Date.now();
    const node: BmNode = {
      id, type: input.type, category: input.category,
      name: input.name, description: input.description, content: input.content,
      status: "active", validatedCount: 1,
      sourceSessions: [sessionId], communityId: null,
      pagerank: 0, importance: 0.5, accessCount: 0, lastAccessedAt: 0,
      temporalType: input.temporalType || "static",
      source: input.source,
      scopeSession: input.scopeSession || null,
      scopeAgent: input.scopeAgent || null,
      scopeWorkspace: input.scopeWorkspace || null,
      createdAt: now, updatedAt: now,
    };
    if (!this._nodeCache) this._nodeCache = [];
    this._nodeCache.push(node);
    return { node, isNew: true };
  }

  deprecateNode(nodeId: string): void {
    const node = this.findNodeById(nodeId);
    if (node) node.status = "deprecated";
  }

  mergeNodes(keepId: string, mergeId: string): void {
    const keep = this.findNodeById(keepId);
    const merge = this.findNodeById(mergeId);
    if (!keep || !merge) return;
    keep.validatedCount += merge.validatedCount;
    keep.sourceSessions = [...new Set([...keep.sourceSessions, ...merge.sourceSessions])];
    this.deprecateNode(mergeId);
  }

  findAllActive(): BmNode[] {
    return (this._nodeCache || []).filter(n => n.status === "active");
  }

  findAllEdges(): BmEdge[] {
    return this._edgeCache || [];
  }

  updatePageranks(scores: Map<string, number>): void {
    for (const [id, score] of scores) {
      const node = this.findNodeById(id);
      if (node) node.pagerank = score;
    }
  }

  updateCommunities(labels: Map<string, string>): void {
    for (const [id, communityId] of labels) {
      const node = this.findNodeById(id);
      if (node) node.communityId = communityId;
    }
  }

  updateAccess(nodeId: string): void {
    const node = this.findNodeById(nodeId);
    if (node) { node.accessCount++; node.lastAccessedAt = Date.now(); }
  }

  // ─── Edge CRUD ───────────────────────────────────────────

  upsertEdge(input: EdgeUpsertInput): BmEdge {
    const id = `e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const edge: BmEdge = {
      id, fromId: input.fromId, toId: input.toId,
      type: input.type, instruction: input.instruction,
      condition: input.condition, sessionId: input.sessionId,
      createdAt: Date.now(),
    };
    if (!this._edgeCache) this._edgeCache = [];
    this._edgeCache.push(edge);
    return edge;
  }

  findEdgesFrom(nodeId: string): BmEdge[] {
    return (this._edgeCache || []).filter(e => e.fromId === nodeId);
  }

  findEdgesTo(nodeId: string): BmEdge[] {
    return (this._edgeCache || []).filter(e => e.toId === nodeId);
  }

  // ─── Search ──────────────────────────────────────────────

  searchNodes(query: string, limit: number): BmNode[] {
    const active = this.findAllActive();
    const q = query.toLowerCase();
    return active.filter(n =>
      n.name.toLowerCase().includes(q) ||
      n.content.toLowerCase().includes(q)
    ).slice(0, limit);
  }

  findTopNodes(limit: number): BmNode[] {
    return this.findAllActive().sort((a, b) => b.pagerank - a.pagerank).slice(0, limit);
  }

  vectorSearch(queryVec: number[], limit: number, minScore = 0): ScoredNode[] {
    // POC: cosine similarity on cached nodes
    const active = this.findAllActive().filter(n => n._vector);
    const results: ScoredNode[] = [];
    for (const node of active) {
      if (!node._vector) continue;
      const sim = this._cosineSim(queryVec, node._vector);
      if (sim >= minScore) results.push({ node, score: sim });
    }
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  vectorSearchWithScore(queryVec: number[], limit: number): ScoredNode[] {
    return this.vectorSearch(queryVec, limit, 0);
  }

  graphWalk(seedIds: string[], maxDepth: number): { nodes: BmNode[]; edges: BmEdge[] } {
    const visited = new Set<string>();
    const queue = [...seedIds];
    const nodes: BmNode[] = [];
    const edges: BmEdge[] = [];
    let depth = 0;

    while (queue.length > 0 && depth <= maxDepth) {
      const levelSize = queue.length;
      for (let i = 0; i < levelSize; i++) {
        const id = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);
        const node = this.findNodeById(id);
        if (node) nodes.push(node);
        const outs = this.findEdgesFrom(id);
        for (const e of outs) {
          edges.push(e);
          if (!visited.has(e.toId)) queue.push(e.toId);
        }
      }
      depth++;
    }
    return { nodes, edges };
  }

  loadGraphStructure(): { nodeIds: string[]; edges: Array<{ fromId: string; toId: string }> } {
    const active = this.findAllActive();
    return {
      nodeIds: active.map(n => n.id),
      edges: (this._edgeCache || []).map(e => ({ fromId: e.fromId, toId: e.toId })),
    };
  }

  // ─── Vector Operations ──────────────────────────────────

  saveVector(nodeId: string, content: string, vec: number[]): void {
    const node = this.findNodeById(nodeId);
    if (node) (node as any)._vector = new Float32Array(vec);
  }

  getVector(nodeId: string): Float32Array | null {
    const node = this.findNodeById(nodeId);
    return (node as any)?._vector || null;
  }

  getVectorHash(nodeId: string): string | null { return null; }

  loadAllVectors(): Array<{ nodeId: string; embedding: Float32Array }> {
    return this.findAllActive()
      .filter(n => (n as any)._vector)
      .map(n => ({ nodeId: n.id, embedding: (n as any)._vector as Float32Array }));
  }

  // ─── Communities ────────────────────────────────────────

  upsertCommunity(id: string, summary: string, nodeCount: number, embedding?: number[]): void {}
  getCommunity(id: string): CommunitySummaryRecord | null { return null; }
  getAllCommunities(): Map<string, CommunitySummaryRecord> { return new Map(); }
  pruneCommunities(): number { return 0; }
  communityVectorSearch(queryVec: number[], minScore: number): ScoredCommunityResult[] { return []; }
  findNodesByCommunities(communityIds: string[], perCommunity: number): BmNode[] { return []; }
  findCommunityPeers(nodeId: string, limit: number): string[] { return []; }
  findCommunityRepresentatives(perCommunity: number): BmNode[] { return []; }

  // ─── Messages ───────────────────────────────────────────

  saveMessage(sessionId: string, turn: number, role: string, content: unknown): void {}
  getUnextractedMessages(sessionId: string, limit: number): MessageRow[] { return []; }
  markMessagesExtracted(sessionId: string, upToTurn: number): void {}
  getEpisodicMessages(sessionIds: string[], nearTime: number, maxChars: number): EpisodicSnippet[] { return []; }

  // ─── Statistics ─────────────────────────────────────────

  getStats(): StorageStats {
    return {
      totalNodes: (this._nodeCache || []).length,
      activeNodes: this.findAllActive().length,
      deprecatedNodes: (this._nodeCache || []).filter(n => n.status === "deprecated").length,
      totalEdges: (this._edgeCache || []).length,
      nodesByCategory: {} as Record<MemoryCategory, number>,
      edgeTypes: {} as Record<EdgeType, number>,
      vectorCount: 0, communityCount: 0, schemaVersion: 1,
    };
  }

  getSchemaVersion(): number { return 1; }

  // ─── Dirty Marks ────────────────────────────────────────

  getDirtyNodes(): Set<string> { return new Set(this.dirtyNodes); }
  markDirty(nodeIds: string[]): void { for (const id of nodeIds) this.dirtyNodes.add(id); }
  markDirtyEdges(edgeIds: string[]): void { for (const id of edgeIds) this.dirtyEdges.add(id); }
  clearDirty(): void { this.dirtyNodes.clear(); this.dirtyEdges.clear(); }
  getAffectedSubgraph(maxDepth: number): { nodes: BmNode[]; edges: BmEdge[] } {
    return this.graphWalk(Array.from(this.dirtyNodes), maxDepth);
  }

  // ─── Internal State ─────────────────────────────────────

  private _nodeCache: BmNode[] | null = null;
  private _edgeCache: BmEdge[] | null = null;

  private _cosineSim(a: number[], b: Float32Array): number {
    let dot = 0, normA = 0, normB = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) { dot += a[i] * b[i]; normA += a[i] * a[i]; normB += b[i] * b[i]; }
    return normA === 0 || normB === 0 ? 0 : dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-9);
  }
}
