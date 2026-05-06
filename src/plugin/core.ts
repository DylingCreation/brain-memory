/**
 * brain-memory - Core Plugin Implementation
 *
 * Contains the main plugin logic without conflicting exports
 */

import { ContextEngine } from '../engine/context';
import type { BmConfig, BmNode, BmEdge } from '../types';
import { assembleContext } from '../format/assemble';
import { allActiveNodes, allEdges } from '../store/store';
import { logger } from '../utils/logger';

// Define minimal OpenClaw plugin interfaces
export interface Message {
  sessionId: string;
  agentId?: string;
  workspaceId?: string;
  content: any;
  role?: string;
}

export interface SessionEvent {
  sessionId: string;
  agentId?: string;
  workspaceId?: string;
  messages?: Message[];
}

export interface OpenClawPlugin {
  init(): Promise<void>;
  onSessionStart(event: SessionEvent): Promise<void>;
  onSessionEnd(event: SessionEvent): Promise<void>;
  handleMessage(message: Message): Promise<Message | null>;
  getMemoryContext(message: Message): Promise<any>;
  beforeMessageSend(message: Message): Promise<Message>;
  getStatus(): Promise<Record<string, any>>;
  shutdown(): Promise<void>;
}

export interface BrainMemoryPluginConfig extends BmConfig {
  enabled?: boolean;
  injectMemories?: boolean; // Whether to inject memories into conversation context
  extractMemories?: boolean; // Whether to extract memories from conversation
  autoMaintain?: boolean; // Whether to run maintenance automatically
}

export class BrainMemoryPluginCore implements OpenClawPlugin {
  private engine: ContextEngine | null = null;
  private config: BrainMemoryPluginConfig;

  constructor(config: BrainMemoryPluginConfig) {
    this.config = { enabled: true, injectMemories: true, extractMemories: true, autoMaintain: true, ...config };
  }

  async init(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('plugin', 'Plugin disabled by configuration');
      return;
    }

    try {
      this.engine = new ContextEngine(this.config);
      logger.info('plugin', 'Plugin initialized successfully');
    } catch (error) {
      logger.error('plugin', 'Failed to initialize:', error);
      throw error;
    }
  }

  async onSessionStart(event: SessionEvent): Promise<void> {
    if (!this.engine || !this.config.enabled) return;

    logger.info('plugin', `Session started: ${event.sessionId}`);
    // Initialize session-specific working memory
  }

  async onSessionEnd(event: SessionEvent): Promise<void> {
    if (!this.engine || !this.config.enabled) return;

    logger.info('plugin', `Session ended: ${event.sessionId}`);
    
    // Perform session-level reflection
    if (this.config.extractMemories) {
      try {
        const reflections = await this.engine.reflectOnSession(
          event.sessionId,
          event.messages || []
        );
        logger.info('plugin', `Performed session reflection, got ${reflections.length} insights`);
      } catch (error) {
        logger.error('plugin', 'Session reflection failed:', error);
      }
    }

    // Run maintenance if enabled
    if (this.config.autoMaintain) {
      try {
        await this.engine.runMaintenance();
        logger.info('plugin', 'Maintenance completed');
      } catch (error) {
        logger.error('plugin', 'Maintenance failed:', error);
      }
    }
  }

  async handleMessage(message: Message): Promise<Message | null> {
    if (!this.engine || !this.config.enabled || !this.config.extractMemories) return null;

    try {
      // Process the conversation turn and extract knowledge
      const result = await this.engine.processTurn({
        sessionId: message.sessionId,
        agentId: message.agentId || 'default',
        workspaceId: message.workspaceId || 'default',
        messages: [{
          role: message.role || 'user',
          content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
        }],
      });

      logger.info('plugin', `Extracted ${result.extractedNodes.length} nodes, ${result.extractedEdges.length} edges`);

      // Return null to indicate no modification to the message
      return null;
    } catch (error) {
      logger.error('plugin', 'Message processing failed:', error);
      return null;
    }
  }

  async getMemoryContext(message: Message): Promise<any> {
    if (!this.engine || !this.config.enabled || !this.config.injectMemories) return null;

    try {
      // v1.0.0 B-1: Get memory injection config
      const injectionCfg = this.config.memoryInjection || {
        enabled: true,
        strategy: 'adaptive',
        tokenBudget: 6000,
        maxNodes: 12,
        includeEpisodic: true,
      };

      if (!injectionCfg.enabled || injectionCfg.strategy === 'off') {
        // Disabled — fallback to raw nodes for backward compat
        return this._getRawMemoryContext(message);
      }

      // Query relevant memories for this conversation
      const recallResult = await this.engine.recall(
        message.content.toString(),
        message.sessionId,
        message.agentId,
        message.workspaceId
      );

      if (recallResult.nodes.length > 0) {
        logger.info('plugin', `Retrieved ${recallResult.nodes.length} relevant memories`);

        // v1.0.0 B-1: Format memories using assembleContext for structured injection
        const allNodes = allActiveNodes((this.engine as any).db);
        const allEdgesList = allEdges((this.engine as any).db);

        // Apply maxNodes cap before assembly
        const recalledNodes = recallResult.nodes.slice(0, injectionCfg.maxNodes);

        const assembled = assembleContext((this.engine as any).db, {
          tokenBudget: injectionCfg.tokenBudget,
          recallStrategy: injectionCfg.strategy,
          activeNodes: [],
          activeEdges: [],
          recalledNodes,
          recalledEdges: recallResult.edges || [],
        });

        const memoryContext = this.engine.getWorkingMemoryContext();

        return {
          memoryContext,
          relatedNodes: recalledNodes,
          tokenEstimate: assembled.tokens,
          // v1.0.0 B-1: Structured formatted content for injection
          formattedXml: assembled.xml,
          systemPrompt: assembled.systemPrompt,
          episodicXml: injectionCfg.includeEpisodic ? assembled.episodicXml : '',
        };
      }

      return null;
    } catch (error) {
      logger.error('plugin', 'Memory context retrieval failed:', error);
      // Fallback to raw context on error
      return this._getRawMemoryContext(message);
    }
  }

  /** Fallback: raw memory context (pre-v1.0.0 behavior) */
  private async _getRawMemoryContext(message: Message): Promise<any> {
    if (!this.engine) return null;
    try {
      const recallResult = await this.engine.recall(
        message.content.toString(),
        message.sessionId,
        message.agentId,
        message.workspaceId
      );
      if (recallResult.nodes.length > 0) {
        return {
          memoryContext: this.engine.getWorkingMemoryContext(),
          relatedNodes: recallResult.nodes,
          tokenEstimate: recallResult.tokenEstimate,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  async beforeMessageSend(message: Message): Promise<Message> {
    if (!this.engine || !this.config.enabled || !this.config.injectMemories) return message;

    try {
      // v1.0.0 B-1: Reuse getMemoryContext which now returns formatted content
      const memCtx = await this.getMemoryContext(message);
      if (memCtx) {
        logger.info('plugin', `Retrieved ${memCtx.relatedNodes?.length || 0} relevant memories`);

        // v1.0.0 B-1: Attach structured formatted content for downstream use
        (message as any).memoryContext = memCtx.memoryContext;
        (message as any).formattedMemory = {
          xml: memCtx.formattedXml,
          systemPrompt: memCtx.systemPrompt,
          episodicXml: memCtx.episodicXml,
          tokenCount: memCtx.tokenEstimate,
        };
      }

      return message;
    } catch (error) {
      logger.error('plugin', 'Memory injection failed:', error);
      return message;
    }
  }

  async getStatus(): Promise<Record<string, any>> {
    if (!this.engine) {
      return { status: 'not initialized', enabled: this.config.enabled };
    }

    try {
      const stats = this.engine.getStats();
      return {
        status: 'ready',
        enabled: this.config.enabled,
        ...stats,
        workingMemory: this.engine.getWorkingMemoryContext() ? 'active' : 'none',
      };
    } catch (error) {
      return {
        status: 'error',
        error: (error as Error).message,
        enabled: this.config.enabled,
      };
    }
  }

  async shutdown(): Promise<void> {
    if (this.engine) {
      this.engine.close();
      this.engine = null;
    }
    logger.info('plugin', 'Plugin shut down');
  }
}

/**
 * Factory function to create the BrainMemory plugin instance
 */
export function createBrainMemoryPluginCore(config: BrainMemoryPluginConfig): BrainMemoryPluginCore {
  return new BrainMemoryPluginCore(config);
}