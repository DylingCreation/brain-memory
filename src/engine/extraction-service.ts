/**
 * brain-memory — Extraction Service
 *
 * Handles the full turn processing pipeline: extraction → upsert →
 * embedding → turn reflection → working memory update.
 *
 * Extracted from ContextEngine (v2.0.0 → v2.1.0 refactor).
 *
 * Authors: brain-memory contributors
 */

import type {
  BmConfig,
  BmNode,
  BmEdge,
  ReflectionInsight,
  WorkingMemoryState,
} from '../types';
import { createCompleteFn } from './llm';
import { reflectOnTurn } from '../reflection/extractor';
import { updateWorkingMemory } from '../working-memory/manager';
import type { IStorageAdapter } from '../store/adapter';
import type { Extractor } from '../extractor/extract';
import type { Recaller } from '../recaller/recall';
import type { HookRegistry } from '../plugin/hooks';
import { logger } from '../utils/logger';

export interface ProcessTurnParams {
  sessionId: string;
  agentId: string;
  workspaceId: string;
  platform?: string;
  userId?: string;
  chatId?: string;
  threadId?: string;
  messages: Array<{ role?: string; content: string; turn_index?: number }>;
}

export interface ProcessTurnResult {
  extractedNodes: BmNode[];
  extractedEdges: BmEdge[];
  reflections: ReflectionInsight[];
  workingMemory: WorkingMemoryState;
}

export class ExtractionService {
  constructor(
    private storage: IStorageAdapter,
    private config: BmConfig,
    private extractor: Extractor,
    private recaller: Recaller,
    private hooks: HookRegistry,
    private llmEnabled: boolean,
    private workingMemory: WorkingMemoryState,
  ) {}

  /**
   * Process a conversation turn: extract knowledge, upsert nodes/edges,
   * sync embeddings, perform turn reflection, and update working memory.
   */
  async processTurn(params: ProcessTurnParams): Promise<ProcessTurnResult> {
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
        const result = await hook({ messages: hookMessages, existingNames: hookNames });
        if (result) { hookMessages = result.messages; hookNames = result.existingNames; }
      } catch (err) { logger.warn('context', `beforeExtract hook failed: ${err}`); }
    }

    const extractionResult = await this.extractor.extract({
      messages: hookMessages,
      existingNames: hookNames,
    });

    // v1.2.0 F-7: After-extract hook
    for (const hook of this.hooks.afterExtract) {
      try { await hook(extractionResult); } catch (err) { logger.warn('context', `afterExtract hook failed: ${err}`); }
    }

    const userMessages = normalizedMessages.filter(m => m.role === 'user');
    const assistantMessages = normalizedMessages.filter(m => m.role === 'assistant');

    const upsertedNodes: BmNode[] = [];
    for (const nodeData of extractionResult.nodes) {
      try {
        let source: 'user' | 'assistant' = 'user';
        if (assistantMessages.length > 0 && userMessages.length === 0) {
          source = 'assistant';
        } else if (userMessages.length > 0 && assistantMessages.length === 0) {
          source = 'user';
        }

        const { node } = this.storage.upsertNode({
          type: nodeData.type,
          category: nodeData.category,
          name: nodeData.name,
          description: nodeData.description,
          content: nodeData.content,
          source,
          temporalType: nodeData.temporalType || 'static',
          scopeSession: params.sessionId,
          scopeAgent: params.agentId,
          scopeWorkspace: params.workspaceId,
          scopePlatform: params.platform ?? null,
          scopeUser: params.userId ?? null,
          scopeChat: params.chatId ?? params.sessionId ?? null,
          scopeThread: params.threadId ?? null,
        }, params.sessionId);
        upsertedNodes.push(node);

        // v1.1.0 F-3: Mark node as dirty for incremental maintenance
        this.storage.markDirty([node.id]);
      } catch (error) {
        logger.error('context', `Failed to upsert node ${nodeData.name}:`, error);
      }
    }

    // Batch-embed newly created/updated nodes
    if (upsertedNodes.length > 0) {
      try {
        await this.recaller.batchSyncEmbed(upsertedNodes);
      } catch (embedError) {
        logger.warn('context', 'Batch embedding failed:', embedError);
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
            this.storage.markDirty([fromNode.id, toNode.id]);
          }
        }
      } catch (error) {
        logger.error('context', `Failed to upsert edge from ${edgeData.from} to ${edgeData.to}:`, error);
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
          text: boost.reason, kind: 'decision' as const, reflectionKind: 'derived' as const, confidence: 0.8,
        }));
      } catch (error) {
        logger.error('context', 'Failed to perform turn reflection:', error);
      }
    }

    // Update working memory
    try {
      const userMsg = params.messages.filter(m => m.role === 'user');
      const assistantMsg = params.messages.filter(m => m.role === 'assistant');
      this.workingMemory = updateWorkingMemory(
        this.workingMemory, this.config.workingMemory,
        {
          extractedNodes: upsertedNodes.map(n => ({
            name: n.name, category: n.category, type: n.type, content: n.content,
          })),
          userMessage: userMsg.pop()?.content || '',
          assistantMessage: assistantMsg.pop()?.content || '',
        }
      );
    } catch (error) {
      logger.error('context', 'Failed to update working memory:', error);
    }

    // v1.1.0 F-3: Expand dirty marks to 1-hop neighbors
    this._expandDirtyMarks();

    return {
      extractedNodes: upsertedNodes,
      extractedEdges: upsertedEdges,
      reflections,
      workingMemory: this.workingMemory,
    };
  }

  /** Expand dirty marks to 1-hop neighbors for subgraph context */
  private _expandDirtyMarks(): void {
    const dirty = this.storage.getDirtyNodes();
    if (dirty.size === 0) return;
    const subgraph = this.storage.getAffectedSubgraph(1);
    const expanded = subgraph.nodes.map(n => n.id);
    this.storage.markDirty(expanded);
  }
}
