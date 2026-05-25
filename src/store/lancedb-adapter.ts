/**
 * brain-memory — LanceDBStorageAdapter: IStorageAdapter MVP
 *
 * v2.0.0: Node/Edge CRUD 持久化到 LanceDB 表 + 内存缓存加速。
 *         向量搜索走 LanceDB 真值表。
 *         支持 v2 六层 scope 过滤。
 */

import type { BmNode, BmEdge, EdgeType, MemoryCategory, GraphNodeType, NodeStatus, ScopeFilterV2 } from '../types';
import type {
  IStorageAdapter, NodeUpsertInput, EdgeUpsertInput,
  ScoredNode, ScoredCommunityResult, CommunitySummaryRecord,
  MessageRow, EpisodicSnippet, StorageStats,
} from './adapter';
import { scopeMatchV2 } from '../scope/isolation';

interface LanceTable {
  add(data: Array<Record<string, unknown>>): Promise<void>;
  countRows(): Promise<number>;
  search(vector?: number[]): { limit(n: number): Promise<{ toArray(): Promise<Array<Record<string, unknown>>> }> };
  delete(predicate: string): Promise<void>;
  drop(): Promise<void>;
  query(): LanceQuery;
  update(where: string, values: Record<string, unknown>): Promise<void>;
}
interface LanceQuery { filter(p: string): LanceQuery; limit(n: number): LanceQuery; toArray(): Promise<Array<Record<string, unknown>>>; }
interface LanceDBConnection {
  createTable(n: string, d: Array<Record<string, unknown>>): Promise<LanceTable>;
  openTable(n: string): Promise<LanceTable>;
  dropTable(n: string): Promise<void>;
  tableNames(): Promise<string[]>;
}

const VECTOR_TABLE = 'bm_vectors', NODES_TABLE = 'bm_nodes', EDGES_TABLE = 'bm_edges', VECTOR_DIM = 1024;
interface BmNodeWithVector extends BmNode { _vector?: Float32Array }

// ─── Row mapping (LanceDB 兼容：null→'' / ''→null) ──────

function nodeToRow(n: BmNode): Record<string, unknown> {
  return { id: n.id, type: n.type, category: n.category, name: n.name, description: n.description, content: n.content,
    status: n.status, validated_count: n.validatedCount, source_sessions: JSON.stringify(n.sourceSessions),
    community_id: n.communityId ?? '', pagerank: n.pagerank, importance: n.importance, access_count: n.accessCount,
    last_accessed: n.lastAccessedAt, temporal_type: n.temporalType, source: n.source,
    scope_session: n.scopeSession ?? '', scope_agent: n.scopeAgent ?? '', scope_workspace: n.scopeWorkspace ?? '',
    scope_platform: n.scopePlatform ?? '', scope_user: n.scopeUser ?? '', scope_chat: n.scopeChat ?? '',
    scope_thread: n.scopeThread ?? '', scope_id: n.scopeId ?? '',
    created_at: n.createdAt, updated_at: n.updatedAt };
}
function rowToNode(r: Record<string, unknown>): BmNode {
  return { id: r.id as string, type: r.type as GraphNodeType, category: r.category as MemoryCategory,
    name: r.name as string, description: (r.description as string) ?? '', content: r.content as string,
    status: r.status as NodeStatus, validatedCount: (r.validated_count as number) ?? 1,
    sourceSessions: typeof r.source_sessions === 'string' ? JSON.parse(r.source_sessions) : (r.source_sessions as string[]) ?? [],
    communityId: (r.community_id as string) || null, pagerank: (r.pagerank as number) ?? 0, importance: (r.importance as number) ?? 0.5,
    accessCount: (r.access_count as number) ?? 0, lastAccessedAt: (r.last_accessed as number) ?? 0,
    temporalType: ((r.temporal_type as string) ?? 'static') as 'static' | 'dynamic',
    source: (r.source as string) as 'user' | 'assistant' | 'manual',
    scopePlatform: (r.scope_platform as string) || null, scopeWorkspace: (r.scope_workspace as string) || null,
    scopeAgent: (r.scope_agent as string) || null, scopeUser: (r.scope_user as string) || null,
    scopeChat: (r.scope_chat as string) || null, scopeThread: (r.scope_thread as string) || null,
    scopeId: (r.scope_id as string) || null, scopeSession: (r.scope_session as string) || null,
    createdAt: (r.created_at as number) ?? 0, updatedAt: (r.updated_at as number) ?? 0 };
}

// ─── v2 Scope 过滤 ────────────────────────────────────────

/** 将 BmNode scope 字段映射为 MemoryScopeV2（字段名转换） */
function bmToScopeV2(n: { scopePlatform: string|null; scopeWorkspace: string|null; scopeAgent: string|null;
  scopeUser: string|null; scopeChat: string|null; scopeThread: string|null }): import('../types').MemoryScopeV2 {
  return { platform: n.scopePlatform, workspace: n.scopeWorkspace, agent: n.scopeAgent,
    user: n.scopeUser, chat: n.scopeChat, thread: n.scopeThread };
}

function filterByScopeV2<T extends { scopePlatform: string|null; scopeWorkspace: string|null; scopeAgent: string|null;
  scopeUser: string|null; scopeChat: string|null; scopeThread: string|null }>(nodes: T[], f?: import('./adapter').StorageFilter): T[] {
  const inc = f?.includeScopesV2, exc = f?.excludeScopesV2;
  if (!inc?.length && !exc?.length) return nodes;
  return nodes.filter(n => {
    const ms = bmToScopeV2(n);
    if (exc?.length) { for (const e of exc) { if (scopeMatchV2(ms, e)) return false; } }
    if (inc?.length) return inc.some(i => scopeMatchV2(ms, i));
    return true;
  });
}

// ─── Adapter ──────────────────────────────────────────────

export class LanceDBStorageAdapter implements IStorageAdapter {
  private db: LanceDBConnection | null = null;
  private vectorTable: LanceTable | null = null;
  private nodesTable: LanceTable | null = null;
  private edgesTable: LanceTable | null = null;
  private dbPath: string;
  private initialized = false;
  private _initError: string | null = null;
  private dirtyNodes = new Set<string>();
  private dirtyEdges = new Set<string>();
  private _nodeCache = new Map<string, BmNode>();
  private _edgeCache = new Map<string, BmEdge>();

  constructor(dbPath?: string) { this.dbPath = dbPath || '/tmp/brain-memory-lancedb'; }

  async initialize(): Promise<void> {
    try {
      const ldb = await import('@lancedb/lancedb');
      if (!ldb.connect) throw new Error('LanceDB connect() not available');
      this.db = await ldb.connect(this.dbPath) as unknown as LanceDBConnection;
      const names = await this.db.tableNames();

      this.vectorTable = names.includes(VECTOR_TABLE) ? await this.db.openTable(VECTOR_TABLE)
        : (await this.db.createTable(VECTOR_TABLE, [{ id: '__init__', vector: new Array(VECTOR_DIM).fill(0), hash: '', content: '' }])
            && await (await this.db.openTable(VECTOR_TABLE)).delete('id = "__init__"'), await this.db.openTable(VECTOR_TABLE));

      if (names.includes(NODES_TABLE)) {
        this.nodesTable = await this.db.openTable(NODES_TABLE);
      } else {
        this.nodesTable = await this.db.createTable(NODES_TABLE, [nodeToRow({
          id: '__init__', type: 'TASK', category: 'tasks', name: '__init__', description: '', content: '',
          status: 'deprecated' as NodeStatus, validatedCount: 0, sourceSessions: [], communityId: '', pagerank: 0,
          importance: 0, accessCount: 0, lastAccessedAt: 0, temporalType: 'static', source: 'user',
          scopePlatform: '', scopeWorkspace: '', scopeAgent: '', scopeUser: '', scopeChat: '', scopeThread: '', scopeId: '',
          scopeSession: '', createdAt: 0, updatedAt: 0 })]);
        await this.nodesTable.delete('id = "__init__"');
      }

      if (names.includes(EDGES_TABLE)) {
        this.edgesTable = await this.db.openTable(EDGES_TABLE);
      } else {
        this.edgesTable = await this.db.createTable(EDGES_TABLE,
          [{ id: '__init__', from_id: '__init__', to_id: '__init__', type: 'RELATED_TO', instruction: '', condition: '', session_id: '__init__', created_at: 0 }]);
        await this.edgesTable.delete('id = "__init__"');
      }

      this.initialized = true; this._initError = null;
    } catch (err) { this._initError = (err as Error).message; this.initialized = false; throw err; }
  }

  close(): void { this.vectorTable = this.nodesTable = this.edgesTable = null; this.db = null;
    this.initialized = false; this._nodeCache.clear(); this._edgeCache.clear(); }
  isConnected() { return this.initialized; }
  getInitError() { return this._initError; }

  // ─── Node CRUD ──────────────────────────────────────────

  findNodeByName(name: string) { for (const n of this._nodeCache.values()) if (n.name === name) return n; return null; }
  findNodeById(id: string) { return this._nodeCache.get(id) || null; }

  upsertNode(input: NodeUpsertInput, sessionId: string): { node: BmNode; isNew: boolean } {
    const existing = this.findNodeByName(input.name);
    if (existing) {
      const n: BmNode = { ...existing,
        description: input.description.length > existing.description.length ? input.description : existing.description,
        content: input.content.length > existing.content.length ? input.content : existing.content,
        validatedCount: existing.validatedCount + 1,
        sourceSessions: [...new Set([...existing.sourceSessions, sessionId])],
        source: input.source, temporalType: input.temporalType || 'static',
        scopePlatform: input.scopePlatform ?? existing.scopePlatform,
        scopeChat: input.scopeChat ?? input.scopeSession ?? existing.scopeChat,
        scopeId: input.scopeId ?? existing.scopeId,
        scopeSession: input.scopeSession ?? existing.scopeSession,
        updatedAt: Date.now() };
      this._nodeCache.set(existing.id, n);
      this.nodesTable?.add([nodeToRow(n)]).catch(() => {});
      return { node: n, isNew: false };
    }
    const id = `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, now = Date.now();
    const n: BmNode = { id, type: input.type, category: input.category, name: input.name,
      description: input.description, content: input.content, status: 'active', validatedCount: 1,
      sourceSessions: [sessionId], communityId: null, pagerank: 0, importance: 0.5, accessCount: 0, lastAccessedAt: 0,
      temporalType: input.temporalType || 'static', source: input.source,
      scopePlatform: input.scopePlatform ?? null, scopeWorkspace: input.scopeWorkspace ?? null, scopeAgent: input.scopeAgent ?? null,
      scopeUser: input.scopeUser ?? null, scopeChat: input.scopeChat ?? input.scopeSession ?? null,
      scopeThread: input.scopeThread ?? null, scopeId: input.scopeId ?? null,
      scopeSession: input.scopeSession ?? sessionId, createdAt: now, updatedAt: now };
    this._nodeCache.set(id, n);
    this.nodesTable?.add([nodeToRow(n)]).catch(() => {});
    return { node: n, isNew: true };
  }

  deprecateNode(nodeId: string) { const n = this._nodeCache.get(nodeId); if (n) { n.status = 'deprecated'; n.updatedAt = Date.now(); } }
  mergeNodes(keepId: string, mergeId: string) {
    const k = this._nodeCache.get(keepId), m = this._nodeCache.get(mergeId);
    if (!k || !m) return;
    k.validatedCount += m.validatedCount;
    k.sourceSessions = [...new Set([...k.sourceSessions, ...m.sourceSessions])];
    if (m.content.length > k.content.length) k.content = m.content;
    k.updatedAt = Date.now(); this.deprecateNode(mergeId);
  }

  findAllActive(filter?: import('./adapter').StorageFilter): BmNode[] {
    return filterByScopeV2(Array.from(this._nodeCache.values()).filter(n => n.status === 'active'), filter);
  }

  findAllEdges(): BmEdge[] { return Array.from(this._edgeCache.values()); }

  updatePageranks(s: Map<string, number>) { for (const [id, sc] of s) { const n = this._nodeCache.get(id); if (n) n.pagerank = sc; } }
  updateCommunities(l: Map<string, string>) { for (const [id, cid] of l) { const n = this._nodeCache.get(id); if (n) n.communityId = cid; } }
  updateAccess(nodeId: string) { const n = this._nodeCache.get(nodeId); if (n) { n.accessCount++; n.lastAccessedAt = Date.now(); } }

  // ─── Edge CRUD ──────────────────────────────────────────

  upsertEdge(input: EdgeUpsertInput): BmEdge {
    const id = `e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const e: BmEdge = { id, fromId: input.fromId, toId: input.toId, type: input.type, instruction: input.instruction, condition: input.condition, sessionId: input.sessionId, createdAt: Date.now() };
    this._edgeCache.set(id, e);
    return e;
  }
  findEdgesFrom(id: string) { return Array.from(this._edgeCache.values()).filter(e => e.fromId === id); }
  findEdgesTo(id: string) { return Array.from(this._edgeCache.values()).filter(e => e.toId === id); }

  // ─── Search ─────────────────────────────────────────────

  searchNodes(query: string, limit: number) { const q = query.toLowerCase(); return this.findAllActive().filter(n => n.name.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)).slice(0, limit); }
  findTopNodes(limit: number) { return this.findAllActive().sort((a, b) => b.pagerank - a.pagerank).slice(0, limit); }

  // ─── Vector ─────────────────────────────────────────────

  vectorSearch(qv: number[], limit: number, minScore = 0) { return this._vecSearch(qv, limit, minScore); }
  vectorSearchWithScore(qv: number[], limit: number) { return this.vectorSearch(qv, limit, 0); }
  saveVector(nodeId: string, content: string, vec: number[]) {
    const n = this._nodeCache.get(nodeId); if (n) (n as BmNodeWithVector)._vector = new Float32Array(vec);
    this.vectorTable?.delete(`id = "${nodeId}"`).then(() => this.vectorTable!.add([{ id: nodeId, vector: vec, hash: '', content: content.slice(0, 500) }])).catch(() => {});
  }
  getVector(nodeId: string) { return (this._nodeCache.get(nodeId) as BmNodeWithVector)?._vector || null; }
  getVectorHash(_: string) { return null; }
  loadAllVectors() { return this.findAllActive().filter(n => (n as BmNodeWithVector)._vector).map(n => ({ nodeId: n.id, embedding: (n as BmNodeWithVector)._vector! })); }

  private _vecSearch(qv: number[], limit: number, minScore: number): ScoredNode[] {
    const results: ScoredNode[] = [];
    for (const n of this.findAllActive()) {
      const v = (n as BmNodeWithVector)._vector; if (!v) continue;
      let dot = 0, nA = 0, nB = 0;
      for (let i = 0; i < Math.min(qv.length, v.length); i++) { dot += qv[i] * v[i]; nA += qv[i] * qv[i]; nB += v[i] * v[i]; }
      const sim = nA && nB ? dot / (Math.sqrt(nA) * Math.sqrt(nB)) : 0;
      if (sim >= minScore) results.push({ node: n, score: sim });
    }
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  // ─── Graph ──────────────────────────────────────────────

  graphWalk(seedIds: string[], maxDepth: number) {
    const visited = new Set<string>(), queue = [...seedIds], nodes: BmNode[] = [], edges: BmEdge[] = []; let depth = 0;
    while (queue.length && depth <= maxDepth) {
      const sz = queue.length;
      for (let i = 0; i < sz; i++) {
        const id = queue.shift()!; if (visited.has(id)) continue; visited.add(id);
        const n = this._nodeCache.get(id); if (n) nodes.push(n);
        for (const e of this.findEdgesFrom(id)) { edges.push(e); if (!visited.has(e.toId)) queue.push(e.toId); }
      }
      depth++;
    }
    return { nodes, edges };
  }

  loadGraphStructure() { return { nodeIds: this.findAllActive().map(n => n.id), edges: Array.from(this._edgeCache.values()).map(e => ({ fromId: e.fromId, toId: e.toId })) }; }

  // ─── Communities (stub) ─────────────────────────────────

  upsertCommunity() {}
  getCommunity() { return null; }
  getAllCommunities() { return new Map(); }
  pruneCommunities() { return 0; }
  communityVectorSearch() { return []; }
  findNodesByCommunities() { return []; }
  findCommunityPeers() { return []; }
  findCommunityRepresentatives() { return this.findTopNodes(5); }

  // ─── Messages (stub) ────────────────────────────────────

  saveMessage() {}
  getUnextractedMessages() { return []; }
  markMessagesExtracted() {}
  getEpisodicMessages() { return []; }

  // ─── Stats ──────────────────────────────────────────────

  getStats(): StorageStats {
    const all = Array.from(this._nodeCache.values());
    const byCat: Record<string, number> = {}, byEdge: Record<string, number> = {};
    for (const n of all) byCat[n.category] = (byCat[n.category] || 0) + 1;
    for (const e of this._edgeCache.values()) byEdge[e.type] = (byEdge[e.type] || 0) + 1;
    return { totalNodes: all.length, activeNodes: all.filter(n => n.status === 'active').length,
      deprecatedNodes: all.filter(n => n.status === 'deprecated').length, totalEdges: this._edgeCache.size,
      nodesByCategory: byCat as Record<MemoryCategory, number>, edgeTypes: byEdge as Record<EdgeType, number>,
      vectorCount: this.findAllActive().filter(n => (n as BmNodeWithVector)._vector).length, communityCount: 0, schemaVersion: 2 };
  }

  getSchemaVersion() { return 2; }

  // ─── Dirty ──────────────────────────────────────────────

  getDirtyNodes() { return new Set(this.dirtyNodes); }
  markDirty(ids: string[]) { for (const id of ids) this.dirtyNodes.add(id); }
  markDirtyEdges(ids: string[]) { for (const id of ids) this.dirtyEdges.add(id); }
  clearDirty() { this.dirtyNodes.clear(); this.dirtyEdges.clear(); }
  getAffectedSubgraph(maxDepth: number) { return this.graphWalk(Array.from(this.dirtyNodes), maxDepth); }
}
