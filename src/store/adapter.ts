/**
 * brain-memory — IStorageAdapter: storage layer abstraction
 *
 * v1.1.0 F-1: Decouples storage from algorithms.
 * All CRUD, graph queries, vector search, and message operations go through this interface.
 *
 * Implementations: SQLiteStorageAdapter (v1.1.0), LanceDBStorageAdapter (v1.3.0 POC).
 *
 * Authors: brain-memory contributors
 */

import type {
  BmNode, BmEdge, EdgeType, MemoryCategory, GraphNodeType,
  NodeStatus, SharingMode, MemoryCategory as MC,
} from "../types";
import type { MemoryScope } from "../scope/isolation";

// ─── Input / Output Types ──────────────────────────────────────

/** Node insert/update input */
/** 节点插入或更新的输入参数。 */
export interface NodeUpsertInput {
  type: GraphNodeType;
  category: MemoryCategory;
  name: string;
  description: string;
  content: string;
  source: "user" | "assistant";
  temporalType?: "static" | "dynamic";
  scopeSession?: string | null;
  scopeAgent?: string | null;
  scopeWorkspace?: string | null;
}

/** Edge insert/update input */
/** 边插入或更新的输入参数。 */
export interface EdgeUpsertInput {
  fromId: string;
  toId: string;
  type: EdgeType;
  instruction: string;
  condition?: string;
  sessionId: string;
}

/** Storage-layer query filter (replaces direct ScopeFilter usage in storage) */
/** 存储层查询过滤器（替代 ScopeFilter 的直接使用）。 */
export interface StorageFilter {
  includeScopes?: MemoryScope[];
  excludeScopes?: MemoryScope[];
  sharingMode?: SharingMode;
  sharedCategories?: MemoryCategory[];
  currentAgentId?: string;
  allowedAgents?: string[];
}

/** Scored node (for vector search results) */
/** 带相似度分数的节点（向量搜索结果）。 */
export interface ScoredNode {
  node: BmNode;
  score: number;
}

/** Scored community (for community vector search) */
/** 带相似度分数的社区搜索结果。 */
export interface ScoredCommunityResult {
  id: string;
  summary: string;
  score: number;
  nodeCount: number;
}

/** Community summary record */
/** 社区摘要记录。 */
export interface CommunitySummaryRecord {
  id: string;
  summary: string;
  nodeCount: number;
  createdAt: number;
  updatedAt: number;
}

/** Message row (for extractor) */
/** 消息行记录（用于提取器）。 */
export interface MessageRow {
  id: string;
  sessionId: string;
  turnIndex: number;
  role: string;
  content: unknown;
  extracted: number;
  createdAt: number;
}

/** Episodic snippet (for recall context) */
/** 对话片段（用于情景回忆）。 */
export interface EpisodicSnippet {
  sessionId: string;
  role: string;
  text: string;
}

/** Storage statistics */
/** 存储统计信息。包含节点、边、类别分布、社区、向量等完整统计。 */
export interface StorageStats {
  totalNodes: number;
  activeNodes: number;
  deprecatedNodes: number;
  totalEdges: number;
  nodesByCategory: Record<MemoryCategory, number>;
  edgeTypes: Record<EdgeType, number>;
  vectorCount: number;
  communityCount: number;
  schemaVersion: number;
}

// ─── IStorageAdapter Interface ─────────────────────────────────

/**
 * Storage abstraction for brain-memory.
 *
 * All database operations (CRUD, graph queries, vector search, messages)
 * go through this interface. Callers (ContextEngine, Recaller, maintenance)
 * depend on the interface, not on SQLite.
 */
export interface IStorageAdapter {
  // ─── Lifecycle ───────────────────────────────────────────

  /** Initialize storage: create tables, indexes, run migrations. Maps to initDb(). */
  initialize(): void;

  /** Close storage, release resources. */
  close(): void;

  /** Check if storage connection is alive. */
  isConnected(): boolean;

  // ─── Node CRUD ───────────────────────────────────────────

  /** Look up a node by its normalized name. Returns null if not found. */
  findNodeByName(name: string): BmNode | null;

  /** Look up a node by its unique ID. Returns null if not found. */
  findNodeById(id: string): BmNode | null;

  /**
   * Insert a new node or update an existing one by name.
   * Merges content, description, and source_sessions from both versions.
   * Returns the node and whether it was newly created.
   */
  upsertNode(input: NodeUpsertInput, sessionId: string): { node: BmNode; isNew: boolean };

  /** Mark a node as deprecated (soft delete). */
  deprecateNode(nodeId: string): void;

  /**
   * Merge two nodes: keep the higher-validatedCount one, combine source_sessions
   * and validated_count, repoint edges, and deprecate the merged node.
   */
  mergeNodes(keepId: string, mergeId: string): void;

  /** Return all active nodes, optionally filtered by scope. */
  findAllActive(filter?: StorageFilter): BmNode[];

  /** Return all edges in the graph. */
  findAllEdges(): BmEdge[];

  /** Batch-update pagerank scores for multiple nodes in a single transaction. */
  updatePageranks(scores: Map<string, number>): void;

  /** Batch-update community_id labels for multiple nodes in a single transaction. */
  updateCommunities(labels: Map<string, string>): void;

  /** Increment access_count and update last_accessed timestamp for a node. */
  updateAccess(nodeId: string): void;

  // ─── Edge CRUD ───────────────────────────────────────────

  /**
   * Insert a new edge or update an existing one (matched by from_id + to_id + type).
   * Returns the edge object.
   */
  upsertEdge(input: EdgeUpsertInput): BmEdge;

  /** Return all outgoing edges from the given node. */
  findEdgesFrom(nodeId: string): BmEdge[];

  /** Return all incoming edges to the given node. */
  findEdgesTo(nodeId: string): BmEdge[];

  // ─── Search ──────────────────────────────────────────────

  /**
   * Search active nodes by text. Tries FTS5 first, falls back to LIKE search.
   * Returns top-N by rank or pagerank. Supports optional scope filtering.
   */
  searchNodes(query: string, limit: number, filter?: StorageFilter): BmNode[];

  /** Return top-N active nodes ordered by pagerank descending. */
  findTopNodes(limit: number, filter?: StorageFilter): BmNode[];

  /**
   * Vector similarity search. Returns nodes with cosine scores above minScore.
   * Supports optional scope filtering.
   */
  vectorSearch(queryVec: number[], limit: number, minScore?: number, filter?: StorageFilter): ScoredNode[];

  /**
   * Vector similarity search returning scored nodes (no minScore filter).
   * Used by Recaller for precise seed acquisition.
   */
  vectorSearchWithScore(queryVec: number[], limit: number, filter?: StorageFilter): ScoredNode[];

  /**
   * Load all active nodes and edges into memory for graph algorithms.
   * Used by PageRank and community detection.
   */
  loadGraphStructure(): { nodeIds: string[]; edges: Array<{ fromId: string; toId: string }> };

  /**
   * Traverse the graph from seed nodes up to maxDepth hops.
   * Returns all reachable nodes and the edges connecting them.
   */
  graphWalk(seedIds: string[], maxDepth: number): { nodes: BmNode[]; edges: BmEdge[] };

  // ─── Vector Operations ───────────────────────────────────

  /** Store or replace a node's embedding vector. */
  saveVector(nodeId: string, content: string, vec: number[]): void;

  /** Get a node's embedding vector. Returns null if not found. */
  getVector(nodeId: string): Float32Array | null;

  /** Get the content hash stored for a node's vector (for cache detection). */
  getVectorHash(nodeId: string): string | null;

  /** Load all node-vector pairs (for dedup). */
  loadAllVectors(): Array<{ nodeId: string; embedding: Float32Array }>;

  // ─── Communities ─────────────────────────────────────────

  /** Store or update a community summary. */
  upsertCommunity(id: string, summary: string, nodeCount: number, embedding?: number[]): void;

  /** Get a single community summary. Returns null if not found. */
  getCommunity(id: string): CommunitySummaryRecord | null;

  /** Get all community summaries. */
  getAllCommunities(): Map<string, CommunitySummaryRecord>;

  /** Prune orphan community summaries (communities that no longer exist). */
  pruneCommunities(): number;

  /** Search communities by cosine similarity of their stored embedding vectors. */
  communityVectorSearch(queryVec: number[], minScore: number): ScoredCommunityResult[];

  /** Return up to perCommunity active nodes per given community, ordered by updated_at desc. */
  findNodesByCommunities(communityIds: string[], perCommunity: number): BmNode[];

  /** Get other nodes in the same community as the given node. */
  findCommunityPeers(nodeId: string, limit: number): string[];

  /** Get representative nodes for each community (top-N by validated_count). */
  findCommunityRepresentatives(perCommunity: number): BmNode[];

  // ─── Messages ────────────────────────────────────────────

  /** Save a dialogue message. */
  saveMessage(sessionId: string, turn: number, role: string, content: unknown): void;

  /** Get unextracted messages for a session, up to limit, ordered by turn_index. */
  getUnextractedMessages(sessionId: string, limit: number): MessageRow[];

  /** Mark messages as extracted up to the given turn index. */
  markMessagesExtracted(sessionId: string, upToTurn: number): void;

  /** Get episodic message snippets near a timestamp, within a character budget. */
  getEpisodicMessages(sessionIds: string[], nearTime: number, maxChars: number): EpisodicSnippet[];

  // ─── Statistics & Metadata ───────────────────────────────

  /** Get storage statistics (node counts, edge counts, category distribution, etc.). */
  getStats(): StorageStats;

  /** Get the schema version number. */
  getSchemaVersion(): number;

  // ─── Incremental Graph Maintenance (v1.1.0 F-3 reserved) ─

  /** Get the set of dirty node IDs (marked by upper layer). */
  getDirtyNodes(): Set<string>;

  /** Mark nodes as dirty (call after graph mutations). */
  markDirty(nodeIds: string[]): void;

  /** Mark edges as dirty (call after graph mutations). */
  markDirtyEdges(edgeIds: string[]): void;

  /** Clear all dirty marks. */
  clearDirty(): void;

  /**
   * Get the local subgraph affected by dirty nodes.
   * Walk up to maxDepth hops from dirty nodes.
   * Used for incremental PageRank / community detection.
   */
  getAffectedSubgraph(maxDepth: number): { nodes: BmNode[]; edges: BmEdge[] };
}
