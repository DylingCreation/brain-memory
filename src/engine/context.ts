/**
 * brain-memory — Unified Context Engine
 *
 * Main orchestrator that integrates all components: extraction, recall, fusion,
 * reflection, reasoning, and working memory. Provides the primary API for the
 * brain-memory system.
 *
 * v1.1.0 F-2: Replaced direct DatabaseSyncInstance with IStorageAdapter.
 * v1.1.0 F-3: Added dirty node marking for incremental graph maintenance.
 *
 * Authors: adoresever (graph-memory), win4r (memory-lancedb-pro), brain-memory contributors
 */

import type { DatabaseSyncInstance } from "@photostructure/sqlite";
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
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { logger } from "../utils/logger";
import { IStorageAdapter } from "../store/adapter";
import { SQLiteStorageAdapter } from "../store/sqlite-adapter";
import { Extractor } from "../extractor/extract";
import { Recaller } from "../recaller/recall";
import { createCompleteFn } from "./llm";
import { createEmbedFn, createBatchEmbedFn } from "./embed";
import { runFusion } from "../fusion/analyzer";
import { reflectOnTurn, reflectOnSession } from "../reflection/extractor";
import { createWorkingMemory, updateWorkingMemory, buildWorkingMemoryContext } from "../working-memory/manager";
import { detectCommunities } from "../graph/community";
import { computeGlobalPageRank } from "../graph/pagerank";
import { runReasoning } from "../reasoning/engine";
import { runMaintenance } from "../graph/maintenance";
import { createHookRegistry, type HookRegistry, type BeforeExtractHook, type AfterExtractHook, type BeforeRecallHook, type AfterRecallHook, type BeforeFusionHook, type AfterFusionHook } from "../plugin/hooks";

/**
 * 统一上下文引擎 — brain-memory 主入口。
 *
 * 整合提取、召回、融合、反思、推理和工作记忆。
 * 通过 IStorageAdapter 实现存储抽象，Recaller 处理双路径召回。
 *
 * @example
 * const engine = new ContextEngine({ dbPath: ":memory:" });
 * await engine.processTurn({ ... });
 * const result = await engine.recall("query");
 */
export class ContextEngine {
  private storage: IStorageAdapter;
  private config: BmConfig;
  private extractor: Extractor;
  private recaller: Recaller;
  private workingMemory: WorkingMemoryState;
  private llmEnabled: boolean;
  private embedEnabled: boolean;
  private readonly createdAt: number;
  /** v1.2.0 F-7: Developer hook registry */
  readonly hooks: HookRegistry = createHookRegistry();

  constructor(config: BmConfig) {
    this.config = config;
    try {
      this.storage = new SQLiteStorageAdapter(config.dbPath);
      this.storage.initialize();
    } catch (error) {
      logger.error("context", `Failed to initialize database at ${config.dbPath}:`, error);
      throw new Error(`Database initialization failed: ${(error as Error).message}`);
    }

    const llm = createCompleteFn(config.llm);
    this.llmEnabled = llm !== null;
    if (!this.llmEnabled) {
      logger.warn("context", "LLM not configured — extraction, reflection, fusion, reasoning will be skipped. Recall and working memory remain functional.");
    }

    let embed: any;
    let batchEmbed: any;
    try {
      embed = createEmbedFn(config.embedding);
      batchEmbed = createBatchEmbedFn(config.embedding);
    } catch (error) {
      logger.error("context", "Failed to initialize embedding client:", error);
      embed = null;
      batchEmbed = null;
    }

    try {
      this.extractor = new Extractor(config, llm);
      this.recaller = new Recaller(this.storage, config);
      if (embed) {
        this.recaller.setEmbedFn(embed);
        if (batchEmbed) this.recaller.setBatchEmbedFn(batchEmbed);
      }
    } catch (error) {
      logger.error("context", "Failed to initialize components:", error);
      throw new Error(`Component initialization failed: ${(error as Error).message}`);
    }

    this.embedEnabled = embed !== null;
    this.createdAt = Date.now();

    try {
      this.workingMemory = createWorkingMemory();
    } catch (error) {
      logger.error("context", "Failed to initialize working memory:", error);
      throw new Error(`Working memory initialization failed: ${(error as Error).message}`);
    }

    logger.info("context", `Initialized with ${this.storage.findAllActive().length} existing nodes`);
  }

  /**
   * Process a conversation turn and extract knowledge.
   * v1.1.0 F-3: Marks affected nodes as dirty for incremental maintenance.
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
      const existingNodes = this.storage.findAllActive();
      const existingNames = existingNodes.map(n => n.name);

      const normalizedMessages = params.messages.map(msg => ({
        role: msg.role || 'user',
        content: msg.content,
        ...(msg.turn_index !== undefined ? { turn_index: msg.turn_index } : {})
      }));

      // v1.2.0 F-7: Before-extract hook
      let hookMessages = normalizedMessages;
      let hookNames = existingNames;
      for (const hook of this.hooks.beforeExtract) {
        try {
          const result = await hook({ messages: hookMessages as any, existingNames: hookNames });
          if (result) { hookMessages = result.messages as any; hookNames = result.existingNames; }
        } catch (err) { logger.warn("context", `beforeExtract hook failed: ${err}`); }
      }

      const extractionResult = await this.extractor.extract({
        messages: hookMessages,
        existingNames: hookNames,
      });

      // v1.2.0 F-7: After-extract hook
      for (const hook of this.hooks.afterExtract) {
        try { await hook(extractionResult); } catch (err) { logger.warn("context", `afterExtract hook failed: ${err}`); }
      }

      const userMessages = normalizedMessages.filter(m => m.role === 'user');
      const assistantMessages = normalizedMessages.filter(m => m.role === 'assistant');

      const upsertedNodes: BmNode[] = [];
      for (const nodeData of extractionResult.nodes) {
        try {
          let source: "user" | "assistant" = "user";
          if (assistantMessages.length > 0 && userMessages.length === 0) {
            source = "assistant";
          } else if (userMessages.length > 0 && assistantMessages.length === 0) {
            source = "user";
          }

          const { node } = this.storage.upsertNode({
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
          upsertedNodes.push(node);

          // v1.1.0 F-3: Mark node as dirty for incremental maintenance
          this.storage.markDirty([node.id]);
        } catch (error) {
          logger.error("context", `Failed to upsert node ${nodeData.name}:`, error);
        }
      }

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
          const fromNode = existingNodes.find(n => n.name === edgeData.from) ||
                          upsertedNodes.find(n => n.name === edgeData.from);
          const toNode = existingNodes.find(n => n.name === edgeData.to) ||
                        upsertedNodes.find(n => n.name === edgeData.to);

          if (fromNode && toNode) {
            const insertedEdge = this.storage.upsertEdge({
              fromId: fromNode.id,
              toId: toNode.id,
              type: edgeData.type,
              instruction: edgeData.instruction,
              sessionId: params.sessionId,
            });
            if (insertedEdge) {
              upsertedEdges.push(insertedEdge);
              // v1.1.0 F-3: Mark edge endpoints as dirty
              this.storage.markDirty([fromNode.id, toNode.id]);
            }
          }
        } catch (error) {
          logger.error("context", `Failed to upsert edge from ${edgeData.from} to ${edgeData.to}:`, error);
        }
      }

      // Turn reflection (LLM-dependent)
      let reflections: ReflectionInsight[] = [];
      if (this.llmEnabled && this.config.reflection.enabled && this.config.reflection.turnReflection) {
        try {
          const turnReflections = await reflectOnTurn(
            this.config.reflection,
            createCompleteFn(this.config.llm)!,
            {
              extractedNodes: upsertedNodes.map(n => ({
                name: n.name, category: n.category, type: n.type, validatedCount: n.validatedCount,
              })),
              existingNodes: existingNodes
                .filter(n => n.validatedCount >= 2)
                .map(n => ({ name: n.name, category: n.category, validatedCount: n.validatedCount })),
            }
          );
          reflections = turnReflections.map(boost => ({
            text: boost.reason, kind: "decision" as const, reflectionKind: "derived" as const, confidence: 0.8,
          }));
        } catch (error) {
          logger.error("context", "Failed to perform turn reflection:", error);
        }
      }

      // Update working memory
      try {
        const userMsg = params.messages.filter(m => m.role === "user");
        const assistantMsg = params.messages.filter(m => m.role === "assistant");
        this.workingMemory = updateWorkingMemory(
          this.workingMemory, this.config.workingMemory,
          {
            extractedNodes: upsertedNodes.map(n => ({
              name: n.name, category: n.category, type: n.type, content: n.content,
            })),
            userMessage: userMsg.pop()?.content || "",
            assistantMessage: assistantMsg.pop()?.content || "",
          }
        );
      } catch (error) {
        logger.error("context", "Failed to update working memory:", error);
      }

      // v1.1.0 F-3: Expand dirty marks to 1-hop neighbors
      this._expandDirtyMarks();

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

  /** v1.1.0 F-3: Expand dirty marks to 1-hop neighbors for subgraph context */
  private _expandDirtyMarks(): void {
    const dirty = this.storage.getDirtyNodes();
    if (dirty.size === 0) return;
    const subgraph = this.storage.getAffectedSubgraph(1);
    const expanded = subgraph.nodes.map(n => n.id);
    this.storage.markDirty(expanded);
  }

  /** 召回与查询相关的记忆节点和边。 */
  async recall(query: string, sessionId?: string, agentId?: string, workspaceId?: string): Promise<RecallResult> {
    try {
      // v1.2.0 F-7: Before-recall hook
      let hookQuery = query;
      for (const hook of this.hooks.beforeRecall) {
        try {
          const result = await hook({ query: hookQuery, scopeFilter: undefined });
          if (result) hookQuery = result.query;
        } catch (err) { logger.warn("context", `beforeRecall hook failed: ${err}`); }
      }

      const excludeScopes: any[] = [];
      const includeScopes: any[] = [];
      if (agentId || workspaceId) {
        includeScopes.push({
          sessionId: null, agentId: agentId || null, workspaceId: workspaceId || null, allowCrossScope: true,
        });
      }
      const sharingCfg = this.config.memorySharing || { enabled: true, mode: "mixed" as const, sharedCategories: [] as any[], allowedAgents: [] as string[] };
      const scopeFilter = {
        excludeScopes, includeScopes,
        allowCrossScope: includeScopes.length === 0,
        sharingMode: sharingCfg.enabled ? sharingCfg.mode : "isolated",
        sharedCategories: sharingCfg.sharedCategories,
        currentAgentId: agentId,
        allowedAgents: sharingCfg.allowedAgents,
      };
      let result = await this.recaller.recall(hookQuery, scopeFilter);
      if (result.nodes.length === 0 && includeScopes.length === 0) {
        result = await this.recaller.recall(hookQuery, { excludeScopes: [], includeScopes: [], allowCrossScope: true } as any);
      }

      // v1.2.0 F-7: After-recall hook
      for (const hook of this.hooks.afterRecall) {
        try { await hook(result); } catch (err) { logger.warn("context", `afterRecall hook failed: ${err}`); }
      }

      return result;
    } catch (error) {
      logger.error("context", "Failed to recall information:", error);
      throw new Error(`Recall failed: ${(error as Error).message}`);
    }
  }

  /** 执行知识融合，合并重复节点或链接相关节点。 */
  async performFusion(sessionId: string = "fusion"): Promise<FusionResult> {
    if (!this.config.fusion.enabled) return { candidates: [], merged: 0, linked: 0, durationMs: 0 };
    try {
      // v1.2.0 F-7: Before-fusion hook
      for (const hook of this.hooks.beforeFusion) {
        try { await hook([]); } catch (err) { logger.warn("context", `beforeFusion hook failed: ${err}`); }
      }

      const result = await runFusion(this.storage, this.config, this.llmEnabled ? createCompleteFn(this.config.llm) : null, createEmbedFn(this.config.embedding), sessionId);

      // v1.2.0 F-7: After-fusion hook
      for (const hook of this.hooks.afterFusion) {
        try { await hook({ merged: result.merged, linked: result.linked }); } catch (err) { logger.warn("context", `afterFusion hook failed: ${err}`); }
      }

      return result;
    } catch (error) {
      logger.error("context", "Failed to perform fusion:", error);
      throw new Error(`Fusion failed: ${(error as Error).message}`);
    }
  }

  async reflectOnSession(sessionId: string, messages: Array<{ role?: string; content: string }>): Promise<ReflectionInsight[]> {
    if (!this.config.reflection.enabled || !this.config.reflection.sessionReflection) return [];
    if (!this.llmEnabled) { logger.warn("context", "Session reflection skipped — LLM not configured"); return []; }
    try {
      const sessionNodes = this.storage.findAllActive().filter(n => n.sourceSessions.includes(sessionId));
      return await reflectOnSession(this.config.reflection, createCompleteFn(this.config.llm)!, {
        sessionMessages: messages.map(m => m.content).join("\n"),
        extractedNodes: sessionNodes.map(n => ({ name: n.name, category: n.category, type: n.type, content: n.content })),
      });
    } catch (error) {
      logger.error("context", "Failed to perform session reflection:", error);
      throw new Error(`Session reflection failed: ${(error as Error).message}`);
    }
  }

  async performReasoning(query?: string): Promise<any[]> {
    if (!this.config.reasoning.enabled) return [];
    if (!this.llmEnabled) { logger.warn("context", "Reasoning skipped — LLM not configured"); return []; }
    try {
      const nodes = this.storage.findAllActive();
      const edges = this.storage.findAllEdges();
      const reasoningResult = await runReasoning(createCompleteFn(this.config.llm)!, nodes, edges, query || "", this.config);
      return reasoningResult?.conclusions || [];
    } catch (error) {
      logger.error("context", "Failed to perform reasoning:", error);
      throw new Error(`Reasoning failed: ${(error as Error).message}`);
    }
  }

  /** v1.1.0 F-4: Clears dirty marks after full maintenance */
  /** 运行图维护任务（去重 → PageRank → 社区检测 → 衰减归档）。v1.1.0 F-4：智能触发增量/全量路径。 */
  async runMaintenance(): Promise<void> {
    try {
      await runMaintenance(this.storage, this.config);
      this.storage.clearDirty();
    } catch (error) {
      logger.error("context", "Failed to run maintenance:", error);
      throw new Error(`Maintenance failed: ${(error as Error).message}`);
    }
  }

  getWorkingMemoryContext(): string | null { return buildWorkingMemoryContext(this.workingMemory); }

  searchNodes(query: string, limit: number = 10): BmNode[] { return this.storage.searchNodes(query, limit); }

  getAllActiveNodes(): BmNode[] { return this.storage.findAllActive(); }

  getDb(): DatabaseSyncInstance { return (this.storage as SQLiteStorageAdapter).getDb(); }

  close(): void {
    try { this.storage.close(); } catch (error) { logger.error("context", "Failed to close database:", error); }
  }

  /** 获取引擎统计信息（节点数、边数、社区数、各类分布）。 */
  getStats(): EngineStats {
    const startMs = Date.now();
    const stats = this.storage.getStats();
    const dbPath = this.config.dbPath.replace(/^~/, homedir());
    let dbSizeBytes = 0;
    try { if (existsSync(dbPath)) dbSizeBytes = statSync(dbPath).size; } catch {}
    const uptimeMs = Date.now() - this.createdAt;
    const cacheStats = getEmbedCacheStats();
    const db = (this.storage as SQLiteStorageAdapter).getDb();
    const taskCount = db.prepare("SELECT COUNT(*) as c FROM bm_nodes WHERE type='TASK'").get()["c"] as number;
    const skillCount = db.prepare("SELECT COUNT(*) as c FROM bm_nodes WHERE type='SKILL'").get()["c"] as number;
    const eventCount = db.prepare("SELECT COUNT(*) as c FROM bm_nodes WHERE type='EVENT'").get()["c"] as number;
    const staticCount = db.prepare("SELECT COUNT(*) as c FROM bm_nodes WHERE temporal_type='static'").get()["c"] as number;
    const dynamicCount = db.prepare("SELECT COUNT(*) as c FROM bm_nodes WHERE temporal_type='dynamic'").get()["c"] as number;
    const userCount = db.prepare("SELECT COUNT(*) as c FROM bm_nodes WHERE source='user'").get()["c"] as number;
    const assistantCount = db.prepare("SELECT COUNT(*) as c FROM bm_nodes WHERE source='assistant'").get()["c"] as number;
    const sessionCount = db.prepare("SELECT COUNT(DISTINCT session_id) as c FROM bm_messages").get()["c"] as number;
    return {
      nodeCount: stats.totalNodes, edgeCount: stats.totalEdges, sessionCount,
      nodes: {
        total: stats.totalNodes, active: stats.activeNodes, deprecated: stats.deprecatedNodes,
        byType: { task: taskCount, skill: skillCount, event: eventCount },
        byCategory: stats.nodesByCategory,
        byTemporalType: { static: staticCount, dynamic: dynamicCount },
        bySource: { user: userCount, assistant: assistantCount },
      },
      edges: { total: stats.totalEdges },
      communities: stats.communityCount, vectors: stats.vectorCount,
      dbSizeBytes, schemaVersion: stats.schemaVersion, uptimeMs, embedCache: cacheStats,
      queryTimeMs: Date.now() - startMs,
    };
  }

  /** 健康检查：数据库、LLM、Embedding 组件状态。 */
  healthCheck(): HealthStatus {
    let dbStatus: HealthComponentStatus = "ok";
    let dbDetail: string | undefined;
    try {
      if (!this.storage.isConnected()) { dbStatus = "error"; dbDetail = "Storage not connected"; }
    } catch (error) { dbStatus = "error"; dbDetail = (error as Error).message; }
    let llmStatus: HealthLlmStatus = this.llmEnabled ? "ok" : "not_configured";
    let llmDetail: string | undefined;
    if (!this.llmEnabled) llmDetail = "No LLM API key configured";
    let embedStatus: HealthEmbedStatus = this.embedEnabled ? "ok" : "not_configured";
    let embedDetail: string | undefined;
    if (!this.embedEnabled) embedDetail = "No Embedding API key configured";
    const stats = this.storage.getStats();
    const uptimeMs = Date.now() - this.createdAt;
    let healthStats: HealthStats | undefined;
    if (dbStatus === "ok") {
      const dbPath = this.config.dbPath.replace(/^~/, homedir());
      let dbSizeBytes = 0;
      try { if (existsSync(dbPath)) dbSizeBytes = statSync(dbPath).size; } catch {}
      healthStats = { nodeCount: stats.totalNodes, edgeCount: stats.totalEdges, vectorCount: stats.vectorCount, communityCount: stats.communityCount, dbSizeBytes };
    }
    let status: HealthOverallStatus = "healthy";
    if (dbStatus === "error") status = "unhealthy";
    else if (!this.llmEnabled || !this.embedEnabled) status = "degraded";
    const result: HealthStatus = {
      status, uptimeMs, schemaVersion: stats.schemaVersion,
      components: {
        database: { status: dbStatus, ...(dbDetail ? { detail: dbDetail } : {}) },
        llm: { status: llmStatus, ...(llmDetail ? { detail: llmDetail } : {}) },
        embedding: { status: embedStatus, ...(embedDetail ? { detail: embedDetail } : {}) },
      },
    };
    if (healthStats) result.stats = healthStats;
    return result;
  }
}

/** 引擎统计信息接口。包含节点、边、社区、向量、会话等完整统计。 */
export interface EngineStats {
  nodeCount: number; edgeCount: number; sessionCount: number;
  nodes: {
    total: number; active: number; deprecated: number;
    byType: { task: number; skill: number; event: number };
    byCategory: { profile: number; preferences: number; entities: number; events: number; tasks: number; skills: number; cases: number; patterns: number };
    byTemporalType: { static: number; dynamic: number };
    bySource: { user: number; assistant: number };
  };
  edges: { total: number };
  communities: number; vectors: number; dbSizeBytes: number; schemaVersion: number; uptimeMs: number;
  embedCache: EmbedCacheStats; queryTimeMs: number;
}

/** 组件健康状态：ok=正常, error=异常。 */
export type HealthComponentStatus = "ok" | "error";
/** LLM 健康状态：ok=正常, not_configured=未配置, error=异常。 */
export type HealthLlmStatus = "ok" | "not_configured" | "error";
/** Embedding 健康状态：ok=正常, not_configured=未配置, error=异常。 */
export type HealthEmbedStatus = "ok" | "not_configured" | "error";
/** 引擎整体健康状态：healthy=健康, degraded=降级, unhealthy=不健康。 */
export type HealthOverallStatus = "healthy" | "degraded" | "unhealthy";

/** 健康检查统计信息。 */
export interface HealthStats { nodeCount: number; edgeCount: number; vectorCount: number; communityCount: number; dbSizeBytes: number; }

/** 健康检查完整响应。包含引擎状态、各组件状态和统计信息。 */
export interface HealthStatus {
  status: HealthOverallStatus; uptimeMs: number; schemaVersion: number;
  components: {
    database: { status: HealthComponentStatus; detail?: string };
    llm: { status: HealthLlmStatus; detail?: string };
    embedding: { status: HealthEmbedStatus; detail?: string };
  };
  stats?: HealthStats;
}

/** 工厂函数：创建 ContextEngine 实例。 */
export async function createContextEngine(config: BmConfig): Promise<ContextEngine> {
  return new ContextEngine(config);
}
