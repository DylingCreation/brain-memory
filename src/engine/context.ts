/**
 * brain-memory — Unified Context Engine
 *
 * Main orchestrator that wires together domain services:
 *   ExtractionService, RecallService, MaintenanceService, HealthService.
 *
 * Owns: hook lifecycle, working memory, fusion, reflection, reasoning,
 * export/import, and lifecycle management.
 *
 * v1.1.0 F-2: Replaced direct DatabaseSyncInstance with IStorageAdapter.
 * v1.1.0 F-3: Added dirty node marking for incremental graph maintenance.
 * v2.1.0: Extracted domain services from monolith ContextEngine.
 *
 * Authors: adoresever (graph-memory), win4r (memory-lancedb-pro), brain-memory contributors
 */

import type {
  BmConfig,
  BmNode,
  BmEdge,
  RecallResult,
  ReflectionInsight,
  WorkingMemoryState,
  MemoryScopeV2,
} from '../types';
import type { FusionResult } from '../fusion/analyzer';
import type { ISearchIndex } from '../store/search/index';
import { logger } from '../utils/logger';
import { IStorageAdapter } from '../store/adapter';
import { scopeMatchV2 } from '../scope/isolation';
import { SQLiteStorageAdapter } from '../store/sqlite-adapter';
import { LanceDBStorageAdapter } from '../store/lancedb-adapter';
import { Extractor } from '../extractor/extract';
import { Recaller } from '../recaller/recall';
import { createCompleteFn } from './llm';
import { createEmbedFn, createBatchEmbedFn, type EmbedFn, type BatchEmbedFn } from './embed';
import { runFusion } from '../fusion/analyzer';
import { reflectOnSession } from '../reflection/extractor';
import { createWorkingMemory, buildWorkingMemoryContext } from '../working-memory/manager';
import { runReasoning, type ReasoningConclusion } from '../reasoning/engine';
import { createHookRegistry, type HookRegistry } from '../plugin/hooks';

import { ExtractionService, type ProcessTurnParams, type ProcessTurnResult } from './extraction-service';
import { RecallService } from './recall-service';
import { MaintenanceService } from './maintenance-service';
import { HealthService } from './health-service';
export type { EngineStats, HealthComponentStatus, HealthLlmStatus, HealthEmbedStatus, HealthOverallStatus, HealthStats, HealthStatus } from './health-service';

/**
 * 统一上下文引擎 — brain-memory 主入口。
 *
 * 编排提取、召回、融合、反思、推理和工作记忆。
 * 通过 IStorageAdapter 实现存储抽象。
 *
 * @example
 * const engine = new ContextEngine({ dbPath: ":memory:" });
 * await engine.processTurn({ ... });
 * const result = await engine.recall("query");
 */
export class ContextEngine {
  private storage: IStorageAdapter;
  private config: BmConfig;
  private extraction: ExtractionService;
  private recallService: RecallService;
  private maintenanceService: MaintenanceService;
  private healthService: HealthService;
  private recaller: Recaller;
  private workingMemory: WorkingMemoryState;
  private llmEnabled: boolean;
  private embedEnabled: boolean;
  /** v1.2.0 F-7: Developer hook registry */
  readonly hooks: HookRegistry = createHookRegistry();

  constructor(config: BmConfig) {
    this.config = config;
    try {
      if (config.storage === 'lancedb') {
        logger.warn('context', 'LanceDB backend selected — limited functionality: community detection, message history, and reflections are disabled. See docs for details.');
        this.storage = new LanceDBStorageAdapter(config.dbPath);
      } else {
        this.storage = new SQLiteStorageAdapter(config.dbPath);
      }
      this.storage.initialize();
    } catch (error) {
      logger.error('context', `Failed to initialize database at ${config.dbPath}:`, error);
      throw new Error(`Database initialization failed: ${(error as Error).message}`);
    }

    const llm = createCompleteFn(config.llm);
    this.llmEnabled = llm !== null;
    if (!this.llmEnabled) {
      logger.warn('context', 'LLM not configured — extraction, reflection, fusion, reasoning will be skipped. Recall and working memory remain functional.');
    }

    let embed: EmbedFn | null = null;
    let batchEmbed: BatchEmbedFn | null = null;
    try {
      embed = createEmbedFn(config.embedding);
      batchEmbed = createBatchEmbedFn(config.embedding);
    } catch (error) {
      logger.error('context', 'Failed to initialize embedding client:', error);
      embed = null;
      batchEmbed = null;
    }

    let extractor: Extractor;
    let recaller: Recaller;
    try {
      extractor = new Extractor(config, llm);
      recaller = new Recaller(this.storage, config);
      if (embed) {
        recaller.setEmbedFn(embed);
        if (batchEmbed) recaller.setBatchEmbedFn(batchEmbed);
      }
    } catch (error) {
      logger.error('context', 'Failed to initialize components:', error);
      throw new Error(`Component initialization failed: ${(error as Error).message}`);
    }

    this.embedEnabled = embed !== null;
    this.recaller = recaller;

    try {
      this.workingMemory = createWorkingMemory();
    } catch (error) {
      logger.error('context', 'Failed to initialize working memory:', error);
      throw new Error(`Working memory initialization failed: ${(error as Error).message}`);
    }

    // Initialize domain services
    this.extraction = new ExtractionService(
      this.storage, config, extractor, recaller,
      this.hooks, this.llmEnabled, this.workingMemory,
    );
    this.recallService = new RecallService(config, recaller, this.hooks);
    this.maintenanceService = new MaintenanceService(this.storage, config);
    this.healthService = new HealthService(
      this.storage, config, this.llmEnabled, this.embedEnabled, Date.now(),
    );

    logger.info('context', `Initialized with ${this.storage.findAllActive().length} existing nodes`);
  }

  // ─── Public API (delegates to services) ────────────────────

  /** Process a conversation turn: extract → upsert → embed → reflect → working memory. */
  async processTurn(params: ProcessTurnParams): Promise<ProcessTurnResult> {
    try {
      const result = await this.extraction.processTurn(params);
      this.workingMemory = result.workingMemory;
      return result;
    } catch (error) {
      logger.error('context', 'Failed to process turn:', error);
      throw new Error(`Turn processing failed: ${(error as Error).message}`);
    }
  }

  /** Recall relevant memories for a query with scope filtering. */
  async recall(query: string, scope?: MemoryScopeV2): Promise<RecallResult> {
    try {
      return await this.recallService.recall(query, scope);
    } catch (error) {
      logger.error('context', 'Failed to recall information:', error);
      throw new Error(`Recall failed: ${(error as Error).message}`);
    }
  }

  /** Run graph maintenance: PageRank, community detection, decay, archiving. */
  async runMaintenance(): Promise<void> { await this.maintenanceService.run(); }

  /** Get engine statistics. */
  getStats() { return this.healthService.getStats(); }

  /** Health check: database, LLM, embedding status. */
  healthCheck() { return this.healthService.healthCheck(); }

  /** Get all active nodes. */
  getAllActiveNodes(): BmNode[] { return this.healthService.getAllActiveNodes(); }

  /** Search nodes by text query. */
  searchNodes(query: string, limit: number = 10): BmNode[] { return this.healthService.searchNodes(query, limit); }

  /** Get the underlying storage adapter (for UI Server, etc.). */
  getStorage(): IStorageAdapter { return this.healthService.getStorage(); }

  /** v2.0.0 S-2: Set companion semantic search index (LanceDB). */
  setSearchIndex(idx: ISearchIndex): void { this.recaller.setSearchIndex(idx); }

  // ─── Direct methods (cross-cutting, keep in orchestrator) ──

  /** Perform knowledge fusion: deduplicate nodes or link related ones. */
  async performFusion(sessionId: string = 'fusion'): Promise<FusionResult> {
    if ((this.config.mode ?? 'full') === 'lite' || !this.config.fusion.enabled) return { candidates: [], merged: 0, linked: 0, durationMs: 0 };
    try {
      for (const hook of this.hooks.beforeFusion) {
        try { await hook([]); } catch (err) { logger.warn('context', `beforeFusion hook failed: ${err}`); }
      }

      const result = await runFusion(this.storage, this.config, this.llmEnabled ? createCompleteFn(this.config.llm) : null, createEmbedFn(this.config.embedding), sessionId);

      for (const hook of this.hooks.afterFusion) {
        try { await hook({ merged: result.merged, linked: result.linked }); } catch (err) { logger.warn('context', `afterFusion hook failed: ${err}`); }
      }

      return result;
    } catch (error) {
      logger.error('context', 'Failed to perform fusion:', error);
      throw new Error(`Fusion failed: ${(error as Error).message}`);
    }
  }

  /** Reflect on an entire session to derive high-level insights. */
  async reflectOnSession(sessionId: string, messages: Array<{ role?: string; content: string }>): Promise<ReflectionInsight[]> {
    if ((this.config.mode ?? 'full') === 'lite' || !this.config.reflection.enabled || !this.config.reflection.sessionReflection) return [];
    if (!this.llmEnabled) { logger.warn('context', 'Session reflection skipped — LLM not configured'); return []; }
    if (!this.storage.capabilities.reflections) { logger.warn('context', 'Session reflection skipped — storage backend does not support reflections'); return []; }
    try {
      const sessionNodes = this.storage.findAllActive().filter(n => n.sourceSessions.includes(sessionId));
      return await reflectOnSession(this.config.reflection, createCompleteFn(this.config.llm)!, {
        sessionMessages: messages.map(m => m.content).join('\n'),
        extractedNodes: sessionNodes.map(n => ({ name: n.name, category: n.category, type: n.type, content: n.content })),
      }, this.config.mode as 'full' | 'small' | 'lite');
    } catch (error) {
      logger.error('context', 'Failed to perform session reflection:', error);
      throw new Error(`Session reflection failed: ${(error as Error).message}`);
    }
  }

  /** Perform graph-level reasoning across all active nodes. */
  async performReasoning(query?: string): Promise<ReasoningConclusion[]> {
    if ((this.config.mode ?? 'full') === 'lite' || !this.config.reasoning.enabled) return [];
    if (!this.llmEnabled) { logger.warn('context', 'Reasoning skipped — LLM not configured'); return []; }
    try {
      const nodes = this.storage.findAllActive();
      const edges = this.storage.findAllEdges();
      const reasoningResult = await runReasoning(createCompleteFn(this.config.llm)!, nodes, edges, query || '', this.config);
      return reasoningResult?.conclusions || [];
    } catch (error) {
      logger.error('context', 'Failed to perform reasoning:', error);
      throw new Error(`Reasoning failed: ${(error as Error).message}`);
    }
  }

  /** Get working memory context as formatted string. */
  getWorkingMemoryContext(): string | null { return buildWorkingMemoryContext(this.workingMemory); }

  // ─── Export / Import ──────────────────────────────────────

  /** Export memories to JSON, optionally filtered by scope. */
  export(options?: ExportOptions): MemoryExport {
    const nodes = this.storage.findAllActive();
    const edges = this.storage.findAllEdges();
    const communities = this.storage.getAllCommunities();

    let filteredNodes = nodes;
    if (options?.scope) {
      filteredNodes = nodes.filter(n => matchExportScope(n, options.scope!));
    }

    const nodeIds = new Set(filteredNodes.map(n => n.id));
    const filteredEdges = edges.filter(e => nodeIds.has(e.fromId) && nodeIds.has(e.toId));

    return {
      version: '2.0.0',
      exportedAt: Date.now(),
      nodeCount: filteredNodes.length,
      edgeCount: filteredEdges.length,
      communityCount: communities.size,
      nodes: filteredNodes,
      edges: filteredEdges,
      communities: Array.from(communities.entries()).map(([id, c]) => ({
        id, summary: c.summary, nodeCount: c.nodeCount,
      })),
    };
  }

  /** Import a JSON backup. Existing nodes (by name) are skipped. */
  import(data: MemoryExport): { imported: number; skipped: number } {
    let imported = 0;
    let skipped = 0;

    for (const node of data.nodes) {
      const existing = this.storage.findNodeByName(node.name);
      if (existing) { skipped++; continue; }
      try {
        this.storage.upsertNode({
          type: node.type,
          category: node.category,
          name: node.name,
          description: node.description,
          content: node.content,
          source: node.source || 'manual',
          temporalType: node.temporalType,
          scopePlatform: node.scopePlatform,
          scopeWorkspace: node.scopeWorkspace,
          scopeAgent: node.scopeAgent,
          scopeUser: node.scopeUser,
          scopeChat: node.scopeChat,
          scopeThread: node.scopeThread,
        }, '__import__');
        imported++;
      } catch { skipped++; }
    }

    for (const edge of data.edges) {
      try {
        this.storage.upsertEdge({
          fromId: edge.fromId,
          toId: edge.toId,
          type: edge.type,
          instruction: edge.instruction,
          sessionId: '__import__',
        });
      } catch { /* skip */ }
    }

    return { imported, skipped };
  }

  /** Close the engine and release resources. */
  close(): void {
    try { this.storage.close(); } catch (error) { logger.error('context', 'Failed to close database:', error); }
  }
}

/** Factory: create a ContextEngine instance. */
export async function createContextEngine(config: BmConfig): Promise<ContextEngine> {
  return new ContextEngine(config);
}

// ─── Export / Import types ──────────────────────────────────

/** Export filter options */
export interface ExportOptions {
  scope?: {
    platform?: string;
    workspace?: string;
    agent?: string;
    user?: string;
    chat?: string;
    thread?: string;
  };
}

/** Memory export JSON structure */
export interface MemoryExport {
  version: string;
  exportedAt: number;
  nodeCount: number;
  edgeCount: number;
  communityCount: number;
  nodes: BmNode[];
  edges: BmEdge[];
  communities: Array<{ id: string; summary: string; nodeCount: number }>;
}

/** Check if a node matches the export scope filter. Delegates to scopeMatchV2. */
function matchExportScope(node: BmNode, scope: NonNullable<ExportOptions['scope']>): boolean {
  const memScope = {
    platform: node.scopePlatform,
    workspace: node.scopeWorkspace,
    agent: node.scopeAgent,
    user: node.scopeUser,
    chat: node.scopeChat,
    thread: node.scopeThread,
  };
  return scopeMatchV2(memScope, scope);
}
