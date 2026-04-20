/**
 * brain-memory - OpenClaw Plugin Handler
 *
 * Implements the OpenClaw plugin interface to integrate brain-memory functionality:
 * 1. Hooks into message processing to extract knowledge
 * 2. Maintains session-specific memory contexts
 * 3. Injects relevant memories into conversations
 */

import { ContextEngine } from '../engine/context';
import type { BmConfig } from '../types';

export interface BrainMemoryPluginConfig extends BmConfig {
  enabled?: boolean;
  injectMemories?: boolean;  // Whether to inject memories into conversation context
  extractMemories?: boolean; // Whether to extract memories from conversation
  autoMaintain?: boolean;    // Whether to run maintenance automatically
  maxRecallNodes?: number;   // Maximum number of nodes to recall
}

export class BrainMemoryHandler {
  private engine: ContextEngine | null = null;
  private config: BrainMemoryPluginConfig;

  constructor(config: BrainMemoryPluginConfig) {
    this.config = {
      enabled: true,
      injectMemories: true,
      extractMemories: true,
      autoMaintain: true,
      maxRecallNodes: 6,
      ...config
    };
  }

  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      console.log('[brain-memory] Plugin disabled by configuration');
      return;
    }

    try {
      this.engine = new ContextEngine(this.config);
      console.log('[brain-memory] Handler initialized successfully');
    } catch (error) {
      console.error('[brain-memory] Failed to initialize:', error);
      throw error;
    }
  }

  async handleSessionStart(sessionId: string, agentId?: string, workspaceId?: string): Promise<void> {
    if (!this.engine || !this.config.enabled) return;

    console.log(`[brain-memory] Session started: ${sessionId}`);
    // Initialize session-specific context if needed
  }

  async handleSessionEnd(sessionId: string, agentId?: string, workspaceId?: string, messages?: Array<{ role: string; content: string }>): Promise<void> {
    if (!this.engine || !this.config.enabled) return;

    console.log(`[brain-memory] Session ended: ${sessionId}`);
    
    // Perform session-level reflection
    if (this.config.extractMemories && messages) {
      try {
        const reflections = await this.engine.reflectOnSession(sessionId, messages);
        console.log(`[brain-memory] Performed session reflection, got ${reflections.length} insights`);
      } catch (error) {
        console.error('[brain-memory] Session reflection failed:', error);
      }
    }

    // Run maintenance if enabled
    if (this.config.autoMaintain) {
      try {
        await this.engine.runMaintenance();
        console.log('[brain-memory] Maintenance completed');
      } catch (error) {
        console.error('[brain-memory] Maintenance failed:', error);
      }
    }
  }

  async handleMessage(
    content: string,
    sessionId: string,
    agentId?: string,
    workspaceId?: string,
    role: string = 'user',
    turnIndex?: number
  ): Promise<void> {
    if (!this.engine || !this.config.enabled || !this.config.extractMemories) return;

    try {
      // Process the conversation turn and extract knowledge
      const result = await this.engine.processTurn({
        sessionId,
        agentId: agentId || 'default',
        workspaceId: workspaceId || 'default',
        messages: [{
          role,
          content,
          ...(turnIndex !== undefined ? { turn_index: turnIndex } : {})
        }],
      });

      console.log(`[brain-memory] Extracted ${result.extractedNodes.length} nodes, ${result.extractedEdges.length} edges from message`);

    } catch (error) {
      console.error('[brain-memory] Message processing failed:', error);
    }
  }

  async getMemoryContext(query: string, sessionId?: string, agentId?: string, workspaceId?: string): Promise<string | null> {
    if (!this.engine || !this.config.enabled || !this.config.injectMemories) return null;

    try {
      // Query relevant memories
      const recallResult = await this.engine.recall(query, sessionId, agentId, workspaceId);

      if (recallResult.nodes.length > 0) {
        console.log(`[brain-memory] Retrieved ${recallResult.nodes.length} relevant memories for query: ${query.substring(0, 50)}...`);
        return this.formatMemoryContext(recallResult);
      }

      return null;
    } catch (error) {
      console.error('[brain-memory] Memory retrieval failed:', error);
      return null;
    }
  }

  private formatMemoryContext(recallResult: { nodes: any[]; edges: any[]; tokenEstimate: number }): string {
    // Format the retrieved memories into a context string that can be injected into prompts
    const contextParts: string[] = [];
    
    contextParts.push(`<brain_memory_context>`);
    contextParts.push(`<!-- Retrieved ${recallResult.nodes.length} knowledge nodes -->`);
    
    for (const node of recallResult.nodes) {
      const typeTag = node.type.toLowerCase();
      contextParts.push(`<${typeTag} name="${node.name}" category="${node.category}">`);
      contextParts.push(`  Description: ${node.description}`);
      contextParts.push(`  Content: ${node.content.substring(0, 200)}...`);
      contextParts.push(`</${typeTag}>`);
    }
    
    if (recallResult.edges.length > 0) {
      contextParts.push(`<relationships>`);
      for (const edge of recallResult.edges) {
        contextParts.push(`  ${edge.fromId} --[${edge.type}]--> ${edge.toId}: ${edge.instruction}`);
      }
      contextParts.push(`</relationships>`);
    }
    
    contextParts.push(`</brain_memory_context>`);
    
    return contextParts.join('\n');
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
    console.log('[brain-memory] Handler shut down');
  }
}