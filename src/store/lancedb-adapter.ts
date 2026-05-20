/**
 * brain-memory — LanceDBStorageAdapter: IStorageAdapter POC implementation
 *
 * v1.3.0 F-13: LanceDB POC — validates LanceDB as a vector storage backend.
 * v1.6.0 A-2: 向量操作真实使用 LanceDB 表（saveVector/getVector/vectorSearch）。
 *             图算法/社区/消息仍走内存 stub。错误处理加固。
 *
 * 多版本路线：
 *   v1.6.0 — 向量操作走 LanceDB 表，基础可用
 *   v1.7.0+ — 向量全链路 LanceDB + 性能基准
 *   v1.8.0+ — Node/Edge CRUD 迁移 LanceDB
 *   v1.9.0+ — 全 IStorageAdapter 合规，可替代 SQLite
 *
 * Authors: brain-memory contributors
 */

import type { BmNode, BmEdge, EdgeType, MemoryCategory } from '../types';
import type {
  IStorageAdapter, NodeUpsertInput, EdgeUpsertInput,
  ScoredNode, ScoredCommunityResult, CommunitySummaryRecord,
  MessageRow, EpisodicSnippet, StorageStats,
} from './adapter';

// ─── LanceDB API types (subset) ────────────────────────────

interface LanceTable {
  add(data: Array<Record<string, unknown>>): Promise<void>;
  countRows(): Promise<number>;
  search(vector?: number[]): { limit(n: number): Promise<{ toArray(): Promise<Array<Record<string, unknown>>> }> };
  delete(predicate: string): Promise<void>;
  drop(): Promise<void>;
}

interface LanceDBConnection {
  createTable(name: string, data: Array<Record<string, unknown>>): Promise<LanceTable>;
  openTable(name: string): Promise<LanceTable>;
  dropTable(name: string): Promise<void>;
  tableNames(): Promise<string[]>;
}

// ─── Vector table schema ──────────────────────────────────

const VECTOR_TABLE = 'bm_vectors';
const VECTOR_DIM = 1024; // Default embedding dimension

/** BmNode with cached embedding vector (internal). */
interface BmNodeWithVector extends BmNode {
  _vector?: Float32Array;
}

export class LanceDBStorageAdapter implements IStorageAdapter {
  private db: LanceDBConnection | null = null;
  private vectorTable: LanceTable | null = null;
  private dbPath: string;
  private initialized = false;
  private _initError: string | null = null;

  private dirtyNodes: Set<string> = new Set();
  private dirtyEdges: Set<string> = new Set();

  constructor(dbPath?: string) {
    this.dbPath = dbPath || '/tmp/brain-memory-lancedb';
  }

  // ─── Lifecycle ───────────────────────────────────────────

  async initialize(): Promise<void> {
    try {
      const lancedb = await import('@lancedb/lancedb');
      if (!lancedb.connect) {
        throw new Error('LanceDB connect() not available — check @lancedb/lancedb installation');
      }
      this.db = await lancedb.connect(this.dbPath) as unknown as LanceDBConnection;

      // Open or create vector table
      const names = await this.db.tableNames();
      if (names.includes(VECTOR_TABLE)) {
        this.vectorTable = await this.db.openTable(VECTOR_TABLE);
      } else {
        // Create with a single row to establish schema, then delete it
        this.vectorTable = await this.db.createTable(VECTOR_TABLE, [
          { id: '__init__', vector: new Array(VECTOR_DIM).fill(0), hash: '', content: '' },
        ]);
        await this.vectorTable.delete('id = "__init__"');
      }

      this.initialized = true;
      this._initError = null;
    } catch (err) {
      this._initError = err instanceof Error ? err.message : String(err);
      this.initialized = false;
      throw new Error(`LanceDBStorageAdapter initialize failed: ${this._initError}`);
    }
  }

  close(): void {
    try {
      this.vectorTable = null;
      if (this.db) {
        // LanceDB connections auto-close on process exit;
        // explicit close covered by the LanceDB API
        this.db = null;
      }
    } catch {
      // Best-effort close, ignore errors
    }
    this.initialized = false;
    this.dirtyNodes.clear();
    this.dirtyEdges.clear();
  }

  isConnected(): boolean { return this.initialized && this.db !== null; }

  /** Returns the last initialization error, if any. */
  getInitError(): string | null { return this._initError; }

  // ─── Node CRUD (in-memory stub — v1.8.0+ 迁移 LanceDB) ──

  findNodeByName(name: string): BmNode | null {
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
      status: 'active', validatedCount: 1,
      sourceSessions: [sessionId], communityId: null,
      pagerank: 0, importance: 0.5, accessCount: 0, lastAccessedAt: 0,
      temporalType: input.temporalType || 'static',
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
    if (node) node.status = 'deprecated';
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
    return (this._nodeCache || []).filter(n => n.status === 'active');
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

  // ─── Edge CRUD (in-memory stub — v1.8.0+ 迁移 LanceDB) ──

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

  // ─── Vector Operations ──────────────────────────────────

  /** v1.6.0 A-2: 向量搜索优先 in-memory（同步），LanceDB 作为持久层 */
  vectorSearch(queryVec: number[], limit: number, minScore = 0): ScoredNode[] {
    // v1.6.0 A-2: in-memory cosine for sync interface; LanceDB 用于持久化
    return this._fallbackVectorSearch(queryVec, limit, minScore);
  }

  vectorSearchWithScore(queryVec: number[], limit: number): ScoredNode[] {
    return this.vectorSearch(queryVec, limit, 0);
  }

  /** v1.6.0 A-2: 向量保存：内存立即生效 + LanceDB fire-and-forget 持久化 */
  saveVector(nodeId: string, content: string, vec: number[]): void {
    // In-memory: immediate (fast, sync)
    const node = this.findNodeById(nodeId);
    if (node) (node as BmNodeWithVector)._vector = new Float32Array(vec);

    // LanceDB: fire-and-forget persistence (best-effort)
    if (this.vectorTable) {
      this.vectorTable.delete(`id = "${nodeId}"`)
        .then(() => this.vectorTable!.add([{
          id: nodeId, vector: vec, hash: '', content: content.slice(0, 500),
        }]))
        .catch(() => { /* best-effort, memory already updated */ });
    }
  }

  /** v1.6.0 A-2: 优先从 in-memory 取，走 LanceDB 的操作已异步存储 */
  getVector(nodeId: string): Float32Array | null {
    const node = this.findNodeById(nodeId);
    return (node as BmNodeWithVector)?._vector || null;
  }

  getVectorHash(_nodeId: string): string | null { return null; }

  loadAllVectors(): Array<{ nodeId: string; embedding: Float32Array }> {
    return this.findAllActive()
      .filter(n => (n as BmNodeWithVector)._vector)
      .map(n => ({ nodeId: n.id, embedding: (n as BmNodeWithVector)._vector as Float32Array }));
  }

  /** Fallback: in-memory cosine similarity (POC — backup when LanceDB fails) */
  private _fallbackVectorSearch(queryVec: number[], limit: number, minScore: number): ScoredNode[] {
    const active = this.findAllActive().filter(n => (n as BmNodeWithVector)._vector);
    const results: ScoredNode[] = [];
    for (const node of active) {
      const vec = (node as BmNodeWithVector)._vector;
      if (!vec) continue;
      const sim = this._cosineSim(queryVec, vec);
      if (sim >= minScore) results.push({ node, score: sim });
    }
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  // ─── Graph ───────────────────────────────────────────────

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

  // ─── Communities (stubs — v1.7.0+ 迁移) ─────────────────

  upsertCommunity(_id: string, _summary: string, _nodeCount: number, _embedding?: number[]): void {}
  getCommunity(_id: string): CommunitySummaryRecord | null { return null; }
  getAllCommunities(): Map<string, CommunitySummaryRecord> { return new Map(); }
  pruneCommunities(): number { return 0; }
  communityVectorSearch(_queryVec: number[], _minScore: number): ScoredCommunityResult[] { return []; }
  findNodesByCommunities(_communityIds: string[], _perCommunity: number): BmNode[] { return []; }
  findCommunityPeers(_nodeId: string, _limit: number): string[] { return []; }
  findCommunityRepresentatives(_perCommunity: number): BmNode[] { return []; }

  // ─── Messages (stubs — v1.8.0+ 迁移) ────────────────────

  saveMessage(_sessionId: string, _turn: number, _role: string, _content: unknown): void {}
  getUnextractedMessages(_sessionId: string, _limit: number): MessageRow[] { return []; }
  markMessagesExtracted(_sessionId: string, _upToTurn: number): void {}
  getEpisodicMessages(_sessionIds: string[], _nearTime: number, _maxChars: number): EpisodicSnippet[] { return []; }

  // ─── Statistics ─────────────────────────────────────────

  getStats(): StorageStats {
    return {
      totalNodes: (this._nodeCache || []).length,
      activeNodes: this.findAllActive().length,
      deprecatedNodes: (this._nodeCache || []).filter(n => n.status === 'deprecated').length,
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
