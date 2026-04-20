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
import { initDb } from "../store/db";
import { Extractor } from "../extractor/extract";
import { Recaller } from "../recaller/recall";
import { createCompleteFn } from "./llm";
import { createEmbedFn } from "./embed";
import { runFusion } from "../fusion/analyzer";
import { reflectOnTurn, reflectOnSession } from "../reflection/extractor";
import { createWorkingMemory, updateWorkingMemory, buildWorkingMemoryContext } from "../working-memory/manager";
import { upsertNode, upsertEdge, allActiveNodes, searchNodes } from "../store/store";
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

  constructor(config: BmConfig) {
    this.config = config;
    try {
      this.db = initDb(config.dbPath);
    } catch (error) {
      console.error(`[brain-memory] Failed to initialize database at ${config.dbPath}:`, error);
      throw new Error(`Database initialization failed: ${(error as Error).message}`);
    }
    
    // Initialize LLM and embedding clients
    let llm: any;
    try {
      llm = createCompleteFn(config.llm);
      if (!llm) {
        console.warn("[brain-memory] Warning: LLM not configured, some features will be disabled");
        
        // Create a mock LLM function for when no configuration is provided
        const mockLlm = async (_sys: string, _user: string): Promise<string> => {
          console.warn("[brain-memory] Mock LLM called - please configure LLM settings");
          return "Mock response - LLM not configured";
        };
        llm = mockLlm; // Use the mock if no real LLM is configured
      }
    } catch (error) {
      console.error("[brain-memory] Failed to initialize LLM client:", error);
      throw new Error(`LLM client initialization failed: ${(error as Error).message}`);
    }
    
    let embed: any;
    try {
      embed = createEmbedFn(config.embedding);
    } catch (error) {
      console.error("[brain-memory] Failed to initialize embedding client:", error);
      embed = null; // Allow graceful degradation
    }
    
    // Initialize components
    try {
      this.extractor = new Extractor(config, llm);
      this.recaller = new Recaller(this.db, config);
      if (embed) {
        this.recaller.setEmbedFn(embed);
      }
    } catch (error) {
      console.error("[brain-memory] Failed to initialize components:", error);
      throw new Error(`Component initialization failed: ${(error as Error).message}`);
    }
    
    // Initialize working memory
    try {
      this.workingMemory = createWorkingMemory();
    } catch (error) {
      console.error("[brain-memory] Failed to initialize working memory:", error);
      throw new Error(`Working memory initialization failed: ${(error as Error).message}`);
    }
    
    console.log(`[brain-memory] ContextEngine initialized with ${this.getAllActiveNodes().length} existing nodes`);
  }

  /**
   * Process a conversation turn and extract knowledge
   */
  async processTurn(params: {
    sessionId: string;
    agentId: string;
    workspaceId: string;
    messages: Array<{ role: string; content: string; turn_index?: number }>;  
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
      const extractionResult = await this.extractor.extract({
        messages: params.messages,
        existingNames: existingNames,
      });

      // Upsert extracted nodes and edges
      const upsertedNodes: BmNode[] = [];
      for (const nodeData of extractionResult.nodes) {
        try {
          upsertNode(this.db, {
            type: nodeData.type,
            category: nodeData.category,
            name: nodeData.name,
            description: nodeData.description,
            content: nodeData.content,
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
        } catch (error) {
          console.error(`[brain-memory] Failed to upsert node ${nodeData.name}:`, error);
          // Continue processing other nodes
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
            await upsertEdge(this.db, {
              fromId: fromNode.id,
              toId: toNode.id,
              type: edgeData.type,
              instruction: edgeData.instruction,
              sessionId: params.sessionId,
            });
            // Get the edge back from the DB after upsert
            const insertedEdge = await this.db.prepare(
              "SELECT * FROM bm_edges WHERE from_id = ? AND to_id = ? AND type = ? AND session_id = ?"
            ).get(fromNode.id, toNode.id, edgeData.type, params.sessionId) as BmEdge | undefined;
            if (insertedEdge) upsertedEdges.push(insertedEdge);
          }
        } catch (error) {
          console.error(`[brain-memory] Failed to upsert edge from ${edgeData.from} to ${edgeData.to}:`, error);
          // Continue processing other edges
        }
      }

      // Perform turn reflection
      let reflections: ReflectionInsight[] = [];
      if (this.config.reflection.enabled && this.config.reflection.turnReflection) {
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
          console.error("[brain-memory] Failed to perform turn reflection:", error);
          // Continue with empty reflections
        }
      }

      // Update working memory
      try {
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
            userMessage: params.messages.filter(m => m.role === "user").pop()?.content || "",
          }
        );
      } catch (error) {
        console.error("[brain-memory] Failed to update working memory:", error);
        // Continue with existing working memory
      }

      return {
        extractedNodes: upsertedNodes,
        extractedEdges: upsertedEdges,
        reflections,
        workingMemory: this.workingMemory,
      };
    } catch (error) {
      console.error("[brain-memory] Failed to process turn:", error);
      throw new Error(`Turn processing failed: ${(error as Error).message}`);
    }
  }

  /**
   * Recall relevant knowledge for a query
   */
  async recall(query: string, sessionId?: string, agentId?: string, workspaceId?: string): Promise<RecallResult> {
    try {
      // Build scope filter based on provided IDs
      const excludeScopes: any[] = [];
      const includeScopes: any[] = [];
      
      if (sessionId || agentId || workspaceId) {
        includeScopes.push({
          sessionId: sessionId || null,
          agentId: agentId || null,
          workspaceId: workspaceId || null,
          allowCrossScope: false,
        });
      }
      
      const scopeFilter = {
        excludeScopes,
        includeScopes,
        allowCrossScope: false,
      };
      
      return await this.recaller.recall(query, scopeFilter);
    } catch (error) {
      console.error("[brain-memory] Failed to recall information:", error);
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
        createCompleteFn(this.config.llm)!,
        createEmbedFn(this.config.embedding),
        sessionId
      );
    } catch (error) {
      console.error("[brain-memory] Failed to perform fusion:", error);
      throw new Error(`Fusion failed: ${(error as Error).message}`);
    }
  }

  /**
   * Perform session-level reflection at the end of a conversation
   */
  async reflectOnSession(sessionId: string, messages: Array<{ role: string; content: string }>): Promise<ReflectionInsight[]> {
    if (!this.config.reflection.enabled || !this.config.reflection.sessionReflection) {
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
      console.error("[brain-memory] Failed to perform session reflection:", error);
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
    
    try {
      // Get all active nodes for reasoning context
      const nodes = allActiveNodes(this.db);
      
      const reasoningResult = await runReasoning(
        createCompleteFn(this.config.llm)!,
        nodes,
        [], // edges
        query || "",
        this.config
      );
      return reasoningResult?.conclusions || [];
    } catch (error) {
      console.error("[brain-memory] Failed to perform reasoning:", error);
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
      console.error("[brain-memory] Failed to run maintenance:", error);
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
      console.error("[brain-memory] Failed to close database:", error);
      // Don't throw here as this is a cleanup operation
    }
  }

  /**
   * Get engine statistics
   */
  getStats(): { nodeCount: number; edgeCount: number; sessionCount: number } {
    const nodeCount = this.db.prepare("SELECT COUNT(*) as count FROM bm_nodes").get()["count"] as number;
    const edgeCount = this.db.prepare("SELECT COUNT(*) as count FROM bm_edges").get()["count"] as number;
    const sessionCount = this.db.prepare("SELECT COUNT(DISTINCT session_id) as count FROM bm_messages").get()["count"] as number;
    
    return { nodeCount, edgeCount, sessionCount };
  }
}

/**
 * Factory function to create a ContextEngine instance
 */
export async function createContextEngine(config: BmConfig): Promise<ContextEngine> {
  return new ContextEngine(config);
}