/**
 * brain-memory - Core Plugin Implementation
 *
 * Contains the main plugin logic without conflicting exports
 */

import { ContextEngine } from '../engine/context';
import type { BmConfig } from '../types';

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
      console.log('[brain-memory] Plugin disabled by configuration');
      return;
    }

    try {
      this.engine = new ContextEngine(this.config);
      console.log('[brain-memory] Plugin initialized successfully');
    } catch (error) {
      console.error('[brain-memory] Failed to initialize:', error);
      throw error;
    }
  }

  async onSessionStart(event: SessionEvent): Promise<void> {
    if (!this.engine || !this.config.enabled) return;

    console.log(`[brain-memory] Session started: ${event.sessionId}`);
    // Initialize session-specific working memory
  }

  async onSessionEnd(event: SessionEvent): Promise<void> {
    if (!this.engine || !this.config.enabled) return;

    console.log(`[brain-memory] Session ended: ${event.sessionId}`);
    
    // Perform session-level reflection
    if (this.config.extractMemories) {
      try {
        const reflections = await this.engine.reflectOnSession(
          event.sessionId,
          event.messages || []
        );
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

      console.log(`[brain-memory] Extracted ${result.extractedNodes.length} nodes, ${result.extractedEdges.length} edges`);

      // Return null to indicate no modification to the message
      return null;
    } catch (error) {
      console.error('[brain-memory] Message processing failed:', error);
      return null;
    }
  }

  async getMemoryContext(message: Message): Promise<any> {
    if (!this.engine || !this.config.enabled || !this.config.injectMemories) return null;

    try {
      // Query relevant memories for this conversation
      const recallResult = await this.engine.recall(
        message.content.toString(),
        message.sessionId,
        message.agentId,
        message.workspaceId
      );

      if (recallResult.nodes.length > 0) {
        const memoryContext = this.engine.getWorkingMemoryContext();
        
        console.log(`[brain-memory] Retrieved ${recallResult.nodes.length} relevant memories`);
        
        return {
          memoryContext,
          relatedNodes: recallResult.nodes,
          tokenEstimate: recallResult.tokenEstimate
        };
      }
      
      return null;
    } catch (error) {
      console.error('[brain-memory] Memory context retrieval failed:', error);
      return null;
    }
  }

  async beforeMessageSend(message: Message): Promise<Message> {
    if (!this.engine || !this.config.enabled || !this.config.injectMemories) return message;

    try {
      // Query relevant memories for this conversation
      const recallResult = await this.engine.recall(
        message.content.toString(),
        message.sessionId,
        message.agentId,
        message.workspaceId
      );

      if (recallResult.nodes.length > 0) {
        // Inject memories into the message context or related structures
        // This is a simplified approach - in practice, this would integrate with OpenClaw's context system
        const memoryContext = this.engine.getWorkingMemoryContext();
        
        console.log(`[brain-memory] Retrieved ${recallResult.nodes.length} relevant memories`);
        
        // Attach memory context to message if the framework supports it
        if (memoryContext) {
          (message as any).memoryContext = memoryContext;
        }
      }

      return message;
    } catch (error) {
      console.error('[brain-memory] Memory injection failed:', error);
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
    console.log('[brain-memory] Plugin shut down');
  }
}

/**
 * Factory function to create the BrainMemory plugin instance
 */
export function createBrainMemoryPluginCore(config: BrainMemoryPluginConfig): BrainMemoryPluginCore {
  return new BrainMemoryPluginCore(config);
}