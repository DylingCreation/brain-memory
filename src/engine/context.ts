/**
 * brain-memory — Unified Context Engine
 *
 * Main orchestrator that integrates all components: extraction, recall, fusion,
 * reflection, reasoning, and working memory. Provides the primary API for the
 * brain-memory system.
 *
 * Authors: adoresever (graph-memory), win4r (memory-lancedb-pro), brain-memory contributors
 */

import { type DatabaseSyncInstance } from "@photostructure/sqlite";
import type {
  BmConfig,
  BmNode,
  BmEdge,
  ExtractionResult,
  RecallResult,
  ReflectionInsight,
  WorkingMemoryState,
} from "../types";
import type { FusionResult } from "../fusion/analyzer";
import { getEmbedCacheStats, type EmbedCacheStats } from "../engine/embed";
import { getSchemaVersion } from "../store/migrate";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { logger } from "../utils/logger";
import { initDb } from "../store/db";
import { Extractor } from "../extractor/extract";
import { Recaller } from "../recaller/recall";
import { createCompleteFn } from "./llm";
import { createEmbedFn, createBatchEmbedFn } from "./embed";
import { runFusion } from "../fusion/analyzer";
import { reflectOnTurn, reflectOnSession } from "../reflection/extractor";
import { createWorkingMemory, updateWorkingMemory, buildWorkingMemoryContext } from "../working-memory/manager";
import { upsertNode, upsertEdge, allActiveNodes, allEdges, searchNodes } from "../store/store";
import { detectCommunities } from "../graph/community";
import { computeGlobalPageRank } from "../graph/pagerank";
import { runReasoning } from "../reasoning/engine";
import { runMaintenance } from "../graph/maintenance";

export class ContextEngine {
  private db: DatabaseSyncInstance;
  private config: BmConfig;
  private extractor: Extractor;
  private recaller: Recaller;
  private workingMemory: WorkingMemoryState;
  /** Whether LLM is available for extraction, reflection, fusion, and reasoning. */
  private llmEnabled: boolean;
  /** Whether Embedding is available for vector operations. */
  private embedEnabled: boolean;
  /** Engine creation timestamp (for uptime tracking). */
  private readonly createdAt: number;

  constructor(config: BmConfig) {
    this.config = config;
    try {
      this.db = initDb(config.dbPath);
    } catch (error) {
      logger.error("context", `Failed to initialize database at ${config.dbPath}:`, error);
      throw new Error(`Database initialization failed: ${(error as Error).message}`);
    }

    // Initialize LLM client — gracefully accept unconfigured LLM
    const llm = createCompleteFn(config.llm);
    this.llmEnabled = llm !== null;
    if (!this.llmEnabled) {
      logger.warn("context", "LLM not configured — extraction, reflection, fusion, reasoning will be skipped. Recall and working memory remain functional.");
    }

    let embed: any;
    let batchEmbed: any;
    try {
      embed = createEmbedFn(config.embedding);
      batchEmbed = createBatchEmbedFn(config.embedding);  // #12: batch embedding
    } catch (error) {
      logger.error("context", "Failed to initialize embedding client:", error);
      embed = null;
      batchEmbed = null;
    }

    // Initialize components
    try {
      this.extractor = new Extractor(config, llm);
      this.recaller = new Recaller(this.db, config);
      if (embed) {
        this.recaller.setEmbedFn(embed);
        if (batchEmbed) this.recaller.setBatchEmbedFn(batchEmbed);  // #12
      }
    } catch (error) {
      logger.error("context", "Failed to initialize components:", error);
      throw new Error(`Component initialization failed: ${(error as Error).message}`);
    }

    this.embedEnabled = embed !== null;
    this.createdAt = Date.now();

    // Initialize working memory
    try {
      this.workingMemory = createWorkingMemory();
    } catch (error) {
      logger.error("context", "Failed to initialize working memory:", error);
      throw new Error(`Working memory initialization failed: ${(error as Error).message}`);
    }

    logger.info("context", `Initialized with ${this.getAllActiveNodes().length} existing nodes`);
  }

  /**
   * Process a conversation turn and extract knowledge
   */
  async processTurn(params: {
    sessionId: string;
    agentId: string;
    workspaceId: string;
    messages: Array<{ role?: string; content: string; turn_index?: number }>;  
  }): Promise<{
    extractedNodes: BmNode[];
    extractedEdges: BmEdge[];
    reflections: ReflectionInsight[];
    workingMemory: WorkingMemoryState;
  }> {
    try {
      // Get existing node names to avoid duplicates
      const existingNodes = allActiveNodes(this.db);
      const existingNames = existingNodes.map(n => n.name);

      // Extract knowledge from messages
      const normalizedMessages = params.messages.map(msg => ({
        role: msg.role || 'user',
        content: msg.content,
        ...(msg.turn_index !== undefined ? { turn_index: msg.turn_index } : {})
      }));
      
      const extractionResult = await this.extractor.extract({
        messages: normalizedMessages,
        existingNames: existingNames,
      });

      // Determine the source for the extracted nodes
      const userMessages = normalizedMessages.filter(m => m.role === 'user');
      const assistantMessages = normalizedMessages.filter(m => m.role === 'assistant');
      
      // Upsert extracted nodes and edges
      const upsertedNodes: BmNode[] = [];
      for (const nodeData of extractionResult.nodes) {
        try {
          // Determine source based on the messages that triggered this extraction
          // If there were user messages in this turn, nodes are likely from user input
          // If there were assistant messages, nodes are likely from AI response
          // Default to 'user' if both present or neither
          let source: "user" | "assistant" = "user";
          if (assistantMessages.length > 0 && userMessages.length === 0) {
            // Only assistant messages in this turn
            source = "assistant";
          } else if (userMessages.length > 0 && assistantMessages.length === 0) {
            // Only user messages in this turn
            source = "user";
          } else if (assistantMessages.length > 0 && userMessages.length > 0) {
            // Both present - determine based on which message triggered extraction
            // For now, default to user if both present
            source = "user";
          }
          
          upsertNode(this.db, {
            type: nodeData.type,
            category: nodeData.category,
            name: nodeData.name,
            description: nodeData.description,
            content: nodeData.content,
            source,
            temporalType: nodeData.temporalType || "static",
            scopeSession: params.sessionId,
            scopeAgent: params.agentId,
            scopeWorkspace: params.workspaceId,
          }, params.sessionId);
          // Get the node back from the DB after upsert
          const insertedNode = await this.db.prepare(
            "SELECT * FROM bm_nodes WHERE name = ? AND scope_session = ?"
          ).get(nodeData.name, params.sessionId) as BmNode | undefined;
          if (insertedNode) upsertedNodes.push(insertedNode);
          
          // Embeddings deferred — batch embed after all nodes are upserted (#12)
        } catch (error) {
          logger.error("context", `Failed to upsert node ${nodeData.name}:`, error);
          // Continue processing other nodes
        }
      }

      // #12: Batch embed all new nodes at once (reduces API calls)
      if (upsertedNodes.length > 0) {
        try {
          await this.recaller.batchSyncEmbed(upsertedNodes);
        } catch (embedError) {
          logger.warn("context", "Batch embedding failed:", embedError);
        }
      }

      const upsertedEdges: BmEdge[] = [];
      for (const edgeData of extractionResult.edges) {
        try {
          // Find nodes by name to get their IDs
          const fromNode = existingNodes.find(n => n.name === edgeData.from) || 
                          upsertedNodes.find(n => n.name === edgeData.from);
          const toNode = existingNodes.find(n => n.name === edgeData.to) || 
                        upsertedNodes.find(n => n.name === edgeData.to);
          
          if (fromNode && toNode) {
            // #7 fix: upsertEdge now returns the edge directly, no SELECT roundtrip needed
            const insertedEdge = upsertEdge(this.db, {
              fromId: fromNode.id,
              toId: toNode.id,
              type: edgeData.type,
              instruction: edgeData.instruction,
              sessionId: params.sessionId,
            });
            if (insertedEdge) upsertedEdges.push(insertedEdge);
          }
        } catch (error) {
          logger.error("context", `Failed to upsert edge from ${edgeData.from} to ${edgeData.to}:`, error);
          // Continue processing other edges
        }
      }

      // Perform turn reflection (LLM-dependent — skip gracefully if unavailable)
      let reflections: ReflectionInsight[] = [];
      if (this.llmEnabled && this.config.reflection.enabled && this.config.reflection.turnReflection) {
        try {
          const userMessages = params.messages.filter(m => m.role === "user").map(m => m.content).join("\n");

          const turnReflections = await reflectOnTurn(
            this.config.reflection,
            createCompleteFn(this.config.llm)!,
            {
              extractedNodes: upsertedNodes.map(n => ({
                name: n.name,
                category: n.category,
                type: n.type,
                validatedCount: n.validatedCount,
              })),
              existingNodes: existingNodes
                .filter(n => n.validatedCount >= 2)
                .map(n => ({
                  name: n.name,
                  category: n.category,
                  validatedCount: n.validatedCount,
                })),
            }
          );
          // Convert TurnBoost[] to ReflectionInsight[]
          reflections = turnReflections.map(boost => ({
            text: boost.reason,
            kind: "decision" as const,
            reflectionKind: "derived" as const,
            confidence: 0.8,
          }));
        } catch (error) {
          logger.error("context", "Failed to perform turn reflection:", error);
          // Continue with empty reflections
        }
      }

      // Update working memory
      try {
        const userMessages = params.messages.filter(m => m.role === "user");
        const assistantMessages = params.messages.filter(m => m.role === "assistant");
        
        this.workingMemory = updateWorkingMemory(
          this.workingMemory,
          this.config.workingMemory,
          {
            extractedNodes: upsertedNodes.map(n => ({
              name: n.name,
              category: n.category,
              type: n.type,
              content: n.content,
            })),
            userMessage: userMessages.pop()?.content || "",
            assistantMessage: assistantMessages.pop()?.content || "",
          }
        );
      } catch (error) {
        logger.error("context", "Failed to update working memory:", error);
        // Continue with existing working memory
      }

      return {
        extractedNodes: upsertedNodes,
        extractedEdges: upsertedEdges,
        reflections,
        workingMemory: this.workingMemory,
      };
    } catch (error) {
      logger.error("context", "Failed to process turn:", error);
      throw new Error(`Turn processing failed: ${(error as Error).message}`);
    }
  }

  /**
   * Recall relevant knowledge for a query
   *
   * Memory belongs to the Agent/Workspace, not to individual Sessions.
   * This method first tries to recall within the current agent/workspace scope,
   * then falls back to cross-scope recall based on sharing configuration (v1.0.0 B-2).
   */
  async recall(query: string, sessionId?: string, agentId?: string, workspaceId?: string): Promise<RecallResult> {
    try {
      const excludeScopes: any[] = [];
      const includeScopes: any[] = [];

      // Build scope filter by agent/workspace
      if (agentId || workspaceId) {
        includeScopes.push({
          sessionId: null,
          agentId: agentId || null,
          workspaceId: workspaceId || null,
          allowCrossScope: true,
        });
      }

      // First attempt: scoped recall with sharing configuration (v1.0.0 B-2)
      const sharingCfg = this.config.memorySharing || { enabled: true, mode: "mixed" as const, sharedCategories: [] as any[], allowedAgents: [] as string[] };
      const scopeFilter = {
        excludeScopes,
        includeScopes,
        allowCrossScope: includeScopes.length === 0,
        sharingMode: sharingCfg.enabled ? sharingCfg.mode : "isolated",
        sharedCategories: sharingCfg.sharedCategories,
        currentAgentId: agentId,
        allowedAgents: sharingCfg.allowedAgents,
      };

      let result = await this.recaller.recall(query, scopeFilter);

      // Fallback: if no results and no cross-scope was attempted, try unrestricted recall
      if (result.nodes.length === 0 && includeScopes.length === 0) {
        if (process.env.BM_DEBUG) {
          logger.debug("context", "Scoped recall returned 0 nodes, falling back to unrestricted recall");
        }
        const fallbackFilter = {
          excludeScopes: [],
          includeScopes: [],
          allowCrossScope: true,
        };
        result = await this.recaller.recall(query, fallbackFilter);
      }

      if (process.env.BM_DEBUG) {
        logger.debug("context", `Recall for "${query.substring(0, 50)}": ${result.nodes.length} nodes`);
      }

      return result;
    } catch (error) {
      logger.error("context", "Failed to recall information:", error);
      throw new Error(`Recall failed: ${(error as Error).message}`);
    }
  }

  /**
   * Perform knowledge fusion to merge duplicate/related nodes
   */
  async performFusion(sessionId: string = "fusion"): Promise<FusionResult> {
    if (!this.config.fusion.enabled) {
      return { candidates: [], merged: 0, linked: 0, durationMs: 0 };
    }
    
    try {
      return await runFusion(
        this.db,
        this.config,
        this.llmEnabled ? createCompleteFn(this.config.llm) : null,  // graceful degradation
        createEmbedFn(this.config.embedding),
        sessionId
      );
    } catch (error) {
      logger.error("context", "Failed to perform fusion:", error);
      throw new Error(`Fusion failed: ${(error as Error).message}`);
    }
  }

  /**
   * Perform session-level reflection at the end of a conversation
   */
  async reflectOnSession(sessionId: string, messages: Array<{ role?: string; content: string }>): Promise<ReflectionInsight[]> {
    if (!this.config.reflection.enabled || !this.config.reflection.sessionReflection) {
      return [];
    }
    if (!this.llmEnabled) {
      logger.warn("context", "Session reflection skipped — LLM not configured");
      return [];
    }

    try {
      // Get nodes created in this session
      const sessionNodes = allActiveNodes(this.db).filter(n => 
        n.sourceSessions.includes(sessionId)
      );
      
      return await reflectOnSession(
        this.config.reflection,
        createCompleteFn(this.config.llm)!,
        {
          sessionMessages: messages.map(m => m.content).join("\n"),
          extractedNodes: sessionNodes.map(n => ({
            name: n.name,
            category: n.category,
            type: n.type,
            content: n.content,
          })),
        }
      );
    } catch (error) {
      logger.error("context", "Failed to perform session reflection:", error);
      throw new Error(`Session reflection failed: ${(error as Error).message}`);
    }
  }

  /**
   * Run reasoning to derive new insights from existing knowledge
   */
  async performReasoning(query?: string): Promise<any[]> {
    if (!this.config.reasoning.enabled) {
      return [];
    }
    if (!this.llmEnabled) {
      logger.warn("context", "Reasoning skipped — LLM not configured");
      return [];
    }

    try {
      // Get all active nodes and edges for reasoning context
      const nodes = allActiveNodes(this.db);
      const edges = allEdges(this.db);
      
      const reasoningResult = await runReasoning(
        createCompleteFn(this.config.llm)!,
        nodes,
        edges, // #1 fix: pass actual edges instead of empty array
        query || "",
        this.config
      );
      return reasoningResult?.conclusions || [];
    } catch (error) {
      logger.error("context", "Failed to perform reasoning:", error);
      throw new Error(`Reasoning failed: ${(error as Error).message}`);
    }
  }

  /**
   * Run maintenance tasks (community detection, PageRank, etc.)
   */
  async runMaintenance(): Promise<void> {
    try {
      await runMaintenance(this.db, this.config);
    } catch (error) {
      logger.error("context", "Failed to run maintenance:", error);
      throw new Error(`Maintenance failed: ${(error as Error).message}`);
    }
  }

  /**
   * Get working memory context for inclusion in prompts
   */
  getWorkingMemoryContext(): string | null {
    return buildWorkingMemoryContext(this.workingMemory);
  }

  /**
   * Search for specific nodes
   */
  searchNodes(query: string, limit: number = 10): BmNode[] {
    return searchNodes(this.db, query, limit);
  }

  /**
   * Get all active nodes
   */
  getAllActiveNodes(): BmNode[] {
    return allActiveNodes(this.db);
  }

  /**
   * Close the database connection
   */
  close(): void {
    try {
      this.db.close();
    } catch (error) {
      logger.error("context", "Failed to close database:", error);
      // Don't throw here as this is a cleanup operation
    }
  }

  /**
   * Get comprehensive engine statistics.
   *
   * Returns counts for nodes (total/active/deprecated/by-type/by-category),
   * edges (total/by-type), communities, vectors, sessions, DB size,
   * schema version, uptime, and embedding cache hit rate.
   *
   * All queries are lightweight — typically < 10ms total on SQLite.
   */
  getStats(): EngineStats {
    const startMs = Date.now();

    // Node counts
    const totalNodes = this.db.prepare("SELECT COUNT(*) as c FROM bm_nodes").get()["c"] as number;
    const activeNodes = this.db.prepare("SELECT COUNT(*) as c FROM bm_nodes WHERE status='active'").get()["c"] as number;
    const deprecatedNodes = this.db.prepare("SELECT COUNT(*) as c FROM bm_nodes WHERE status='deprecated'").get()["c"] as number;

    // Nodes by type
    const taskCount = this.db.prepare("SELECT COUNT(*) as c FROM bm_nodes WHERE type='TASK'").get()["c"] as number;
    const skillCount = this.db.prepare("SELECT COUNT(*) as c FROM bm_nodes WHERE type='SKILL'").get()["c"] as number;
    const eventCount = this.db.prepare("SELECT COUNT(*) as c FROM bm_nodes WHERE type='EVENT'").get()["c"] as number;

    // Nodes by temporal type
    const staticCount = this.db.prepare("SELECT COUNT(*) as c FROM bm_nodes WHERE temporal_type='static'").get()["c"] as number;
    const dynamicCount = this.db.prepare("SELECT COUNT(*) as c FROM bm_nodes WHERE temporal_type='dynamic'").get()["c"] as number;

    // Nodes by source
    const userCount = this.db.prepare("SELECT COUNT(*) as c FROM bm_nodes WHERE source='user'").get()["c"] as number;
    const assistantCount = this.db.prepare("SELECT COUNT(*) as c FROM bm_nodes WHERE source='assistant'").get()["c"] as number;

    // Edge counts
    const totalEdges = this.db.prepare("SELECT COUNT(*) as c FROM bm_edges").get()["c"] as number;

    // Communities, vectors, sessions
    const communityCount = this.db.prepare("SELECT COUNT(*) as c FROM bm_communities").get()["c"] as number;
    const vectorCount = this.db.prepare("SELECT COUNT(*) as c FROM bm_vectors").get()["c"] as number;
    const sessionCount = this.db.prepare("SELECT COUNT(DISTINCT session_id) as c FROM bm_messages").get()["c"] as number;

    // DB size
    let dbSizeBytes = 0;
    try {
      const resolvedPath = this.config.dbPath.replace(/^~/, homedir());
      if (existsSync(resolvedPath)) {
        dbSizeBytes = statSync(resolvedPath).size;
      }
    } catch {
      // Size unavailable
    }

    // Schema version
    const schemaVersion = getSchemaVersion(this.db);

    // Uptime
    const uptimeMs = Date.now() - this.createdAt;

    // Embedding cache stats
    const cacheStats = getEmbedCacheStats();

    const queryTimeMs = Date.now() - startMs;

    return {
      // Backward-compatible top-level fields
      nodeCount: totalNodes,
      edgeCount: totalEdges,
      sessionCount,
      // Detailed breakdowns
      nodes: {
        total: totalNodes,
        active: activeNodes,
        deprecated: deprecatedNodes,
        byType: { task: taskCount, skill: skillCount, event: eventCount },
        byTemporalType: { static: staticCount, dynamic: dynamicCount },
        bySource: { user: userCount, assistant: assistantCount },
      },
      edges: { total: totalEdges },
      communities: communityCount,
      vectors: vectorCount,
      dbSizeBytes,
      schemaVersion,
      uptimeMs,
      embedCache: cacheStats,
      queryTimeMs,
    };
  }

  // ─── Health Check (F-2) ──────────────────────────────────────

  /**
   * Check the health of all engine components.
   *
   * Returns a structured status object covering:
   * - Database connection health
   * - LLM availability
   * - Embedding availability
   * - Schema version
   * - Uptime
   * - Key statistics
   */
  healthCheck(): HealthStatus {
    // Database check
    let dbStatus: HealthComponentStatus = "ok";
    let dbDetail: string | undefined;
    try {
      this.db.prepare("SELECT 1").get();
    } catch (error) {
      dbStatus = "error";
      dbDetail = (error as Error).message;
    }

    // LLM status
    let llmStatus: HealthLlmStatus = this.llmEnabled ? "ok" : "not_configured";
    let llmDetail: string | undefined;
    if (!this.llmEnabled) {
      llmDetail = "No LLM API key configured — extraction, reflection, fusion, reasoning will be skipped.";
    }

    // Embedding status
    let embedStatus: HealthEmbedStatus = this.embedEnabled ? "ok" : "not_configured";
    let embedDetail: string | undefined;
    if (!this.embedEnabled) {
      embedDetail = "No Embedding API key configured — vector search and dedup will be disabled.";
    }

    // Schema version
    const schemaVersion = getSchemaVersion(this.db);

    // Uptime
    const uptimeMs = Date.now() - this.createdAt;

    // Stats
    let stats: HealthStats | undefined;
    if (dbStatus === "ok") {
      try {
        const nodeCount = this.db.prepare("SELECT COUNT(*) as c FROM bm_nodes").get()["c"] as number;
        const edgeCount = this.db.prepare("SELECT COUNT(*) as c FROM bm_edges").get()["c"] as number;
        const vectorCount = this.db.prepare("SELECT COUNT(*) as c FROM bm_vectors").get()["c"] as number;
        const communityCount = this.db.prepare("SELECT COUNT(*) as c FROM bm_communities").get()["c"] as number;

        let dbSizeBytes = 0;
        try {
          const resolvedPath = this.config.dbPath.replace(/^~/, homedir());
          if (existsSync(resolvedPath)) {
            dbSizeBytes = statSync(resolvedPath).size;
          }
        } catch {
          // Ignore — size info unavailable
        }

        stats = { nodeCount, edgeCount, vectorCount, communityCount, dbSizeBytes };
      } catch {
        // Stats unavailable but not fatal
      }
    }

    // Overall status
    let status: HealthOverallStatus = "healthy";
    if (dbStatus === "error") {
      status = "unhealthy";
    } else if (!this.llmEnabled || !this.embedEnabled) {
      status = "degraded";
    }

    const result: HealthStatus = {
      status,
      uptimeMs,
      schemaVersion,
      components: {
        database: { status: dbStatus, ...(dbDetail ? { detail: dbDetail } : {}) },
        llm: { status: llmStatus, ...(llmDetail ? { detail: llmDetail } : {}) },
        embedding: { status: embedStatus, ...(embedDetail ? { detail: embedDetail } : {}) },
      },
    };
    if (stats) result.stats = stats;

    return result;
  }
}

// ─── Engine Stats Types (F-5) ─────────────────────────────────

export interface EngineStats {
  // Backward-compatible top-level fields
  nodeCount: number;
  edgeCount: number;
  sessionCount: number;
  // Detailed breakdowns
  nodes: {
    total: number;
    active: number;
    deprecated: number;
    byType: { task: number; skill: number; event: number };
    byTemporalType: { static: number; dynamic: number };
    bySource: { user: number; assistant: number };
  };
  edges: { total: number };
  communities: number;
  vectors: number;
  dbSizeBytes: number;
  schemaVersion: number;
  uptimeMs: number;
  embedCache: EmbedCacheStats;
  queryTimeMs: number;
}

// ─── Health Check Types ────────────────────────────────────────

export type HealthComponentStatus = "ok" | "error";
export type HealthLlmStatus = "ok" | "not_configured" | "error";
export type HealthEmbedStatus = "ok" | "not_configured" | "error";
export type HealthOverallStatus = "healthy" | "degraded" | "unhealthy";

export interface HealthStats {
  nodeCount: number;
  edgeCount: number;
  vectorCount: number;
  communityCount: number;
  dbSizeBytes: number;
}

export interface HealthStatus {
  /** Overall health: healthy / degraded / unhealthy */
  status: HealthOverallStatus;
  /** Engine uptime in milliseconds */
  uptimeMs: number;
  /** Current database schema version */
  schemaVersion: number;
  /** Component statuses */
  components: {
    database: { status: HealthComponentStatus; detail?: string };
    llm: { status: HealthLlmStatus; detail?: string };
    embedding: { status: HealthEmbedStatus; detail?: string };
  };
  /** Optional statistics (only when DB is healthy) */
  stats?: HealthStats;
}

/**
 * Factory function to create a ContextEngine instance
 */
export async function createContextEngine(config: BmConfig): Promise<ContextEngine> {
  return new ContextEngine(config);
}