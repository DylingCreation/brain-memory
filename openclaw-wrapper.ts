/**
 * brain-memory - OpenClaw Plugin Wrapper
 * 
 * Simple wrapper that provides the register/activate functions required by OpenClaw
 * while delegating functionality to the main BrainMemoryPlugin implementation.
 */

// Import the plugin implementation
import createBrainMemoryPlugin, { BrainMemoryPluginCore as BrainMemoryPluginClass, createBrainMemoryPluginCore } from './openclaw-plugin';

// Define simple message type for OpenClaw compatibility
interface Message {
  sessionId: string;
  agentId?: string;
  workspaceId?: string;
  content: any;
  role?: string;
}

interface SessionEvent {
  sessionId: string;
  agentId?: string;
  workspaceId?: string;
  messages?: Message[];
}

// Global plugin instance
let pluginInstance: BrainMemoryPluginClass | null = null;

// Store configuration globally for access in hooks
let storedConfig: any = null;

// Default configuration values
const DEFAULT_CONFIG = {
  enabled: true,
  injectMemories: true,
  extractMemories: true,
  autoMaintain: true,
  maxRecallNodes: 6,
  recallMaxDepth: 3,
  dbPath: `${process.env.HOME}/.openclaw/brain-memory.db`
};

// Cache for storing retrieved memories.
// Keyed by "agentId:workspaceId" (agent-level) to share memories across sessions.
// Also keyed by sessionId for backward compatibility with existing cached data.
const sessionMemoryCache = new Map<string, any>();

/**
 * Build a cache key for memory context.
 * Uses agent-level key so new sessions can reuse memories from previous sessions.
 */
function memoryCacheKey(agentId: string, workspaceId: string): string {
  return `mem:${agentId}:${workspaceId}`;
}

/**
 * Register the plugin with OpenClaw
 * 
 * NOTE: This must be a synchronous function because OpenClaw does not await promises
 * returned from register(). Async code after the first await will be ignored.
 */
export function register(api: any) {
  console.log('[brain-memory] Registering plugin with OpenClaw');
  
  // Extract configuration from OpenClaw's config structure
  const fullConfig = (api && api.config) || {};
  const bmConfig = fullConfig?.plugins?.entries?.['brain-memory']?.config || {};
  
  // Expand ~ path if present
  if (!bmConfig.dbPath) {
    bmConfig.dbPath = `${process.env.HOME}/.openclaw/brain-memory.db`;
  } else if (bmConfig.dbPath?.startsWith('~')) {
    bmConfig.dbPath = bmConfig.dbPath.replace('~', process.env.HOME || '');
  }
  
  // Store config globally for access in hook functions
  // Merge with default values to ensure all required config options exist
  storedConfig = { ...DEFAULT_CONFIG, ...bmConfig };
  
  // Register hooks using api.on() as per OpenClaw requirements
  if (api?.on) {
    api.on('message_received', message_received);
    api.on('message_sent', message_sent);
    api.on('before_message_write', before_message_write);
    api.on('session_start', session_start);
    api.on('session_end', session_end);
  }
  
  return {
    id: 'brain-memory',
    name: 'Brain Memory',
    version: '1.0.0',
    description: 'Unified knowledge graph + vector memory system for AI agents',
    author: 'OpenClaw Team',
    license: 'MIT',
  };
}

/**
 * Initialize the plugin
 */
export async function init(config: any) {
  try {
    console.log('[brain-memory] Initializing plugin...');
    
    // Create plugin instance
    pluginInstance = createBrainMemoryPlugin(config);
    
    // Initialize the plugin
    await pluginInstance.init();
    
    console.log('[brain-memory] Plugin initialized successfully');
    return { success: true, message: 'Plugin initialized successfully' };
  } catch (error) {
    console.error('[brain-memory] Plugin initialization failed:', error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Activate the plugin
 */
export async function activate(api: any) {
  try {
    console.log('[brain-memory] Activating plugin...');
    
    if (!pluginInstance) {
      throw new Error('Plugin not initialized');
    }
    
    console.log('[brain-memory] Plugin activated successfully');
    return { success: true, message: 'Plugin activated successfully' };
  } catch (error) {
    console.error('[brain-memory] Plugin activation failed:', error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Deactivate the plugin
 */
export async function deactivate() {
  try {
    console.log('[brain-memory] Deactivating plugin...');
    
    if (pluginInstance) {
      await pluginInstance.shutdown();
      pluginInstance = null;
    }
    
    console.log('[brain-memory] Plugin deactivated successfully');
    return { success: true, message: 'Plugin deactivated successfully' };
  } catch (error) {
    console.error('[brain-memory] Plugin deactivation failed:', error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Handle incoming messages
 * 
 * OpenClaw passes (event, ctx) format, but brain-memory expects Message format.
 * Need to convert the parameters accordingly.
 */
export async function message_received(event: any, ctx: any) {
  // Lazy initialization - create and initialize plugin on first use
  if (!pluginInstance) {
    try {
      console.log('[brain-memory] Initializing plugin on first use');
      
      // Use the config stored during registration
      if (!storedConfig) {
        console.error('[brain-memory] No config available for initialization');
        return null;
      }
      
      pluginInstance = createBrainMemoryPlugin(storedConfig);
      await pluginInstance.init();
      
      console.log('[brain-memory] Plugin initialized successfully');
    } catch (error) {
      console.error('[brain-memory] Plugin initialization failed:', error);
      return null;
    }
  }
  
  try {
    // Convert OpenClaw's (event, ctx) format to brain-memory's Message format
    const message = {
      sessionId: ctx?.conversationId || 'default-session',
      agentId: ctx?.accountId || 'default-agent',
      workspaceId: 'default-workspace',
      content: event?.content || '',
      role: 'user'
    };
    
    // Process the message (extract memories, etc.)
    const result = await pluginInstance.handleMessage(message);
    
    // Retrieve relevant memories and cache at agent level (not session level)
    // This allows memories to persist across sessions for the same agent
    try {
      const memoryContext = await pluginInstance.getMemoryContext(message);
      if (memoryContext && memoryContext.relatedNodes && memoryContext.relatedNodes.length > 0) {
        // Cache at agent level so new sessions can find memories
        const agentKey = memoryCacheKey(message.agentId || 'default-agent', message.workspaceId || 'default-workspace');
        sessionMemoryCache.set(agentKey, memoryContext);
        // Also cache at session level for backward compatibility
        sessionMemoryCache.set(message.sessionId, memoryContext);
        console.log(`[brain-memory] Cached ${memoryContext.relatedNodes.length} memories for agent ${message.agentId}`);
      } else {
        sessionMemoryCache.delete(message.sessionId);
      }
    } catch (memoryError) {
      console.warn('[brain-memory] Memory retrieval failed:', memoryError);
    }
    
    return result;
  } catch (error) {
    console.error('[brain-memory] Handle message failed:', error);
    return null;
  }
}

/**
 * Handle incoming messages (alias for backward compatibility)
 */
export const handleMessage = message_received;

/**
 * Handle outgoing (AI) messages — fires after AI sends a reply.
 *
 * OpenClaw's message_sent hook provides:
 *   event: { to, content, success }
 *   ctx:   { accountId, conversationId, channelId, ... }
 *
 * We extract knowledge from AI replies so the memory system knows
 * not just what the user asked, but also what the AI answered,
 * recommended, or committed to.
 */
export async function message_sent(event: any, ctx: any) {
  if (!pluginInstance) {
    try {
      if (!storedConfig) {
        console.error('[brain-memory] No config for message_sent hook');
        return;
      }
      pluginInstance = createBrainMemoryPlugin(storedConfig);
      await pluginInstance.init();
    } catch (error) {
      console.error('[brain-memory] Plugin init failed in message_sent:', error);
      return;
    }
  }

  if (!pluginInstance || !storedConfig?.extractMemories) return;

  const content = event?.content;
  if (!content || typeof content !== 'string') return;

  // Skip very short replies (acknowledgments, emojis, etc.)
  const trimmed = content.trim();
  if (trimmed.length < 50) return;

  const sessionId = ctx?.conversationId || 'default-session';
  const agentId = ctx?.accountId || 'default-agent';
  const workspaceId = 'default-workspace';

  try {
    // Process the AI reply with role='assistant' so the extractor
    // knows this is AI-generated content (not user input)
    const aiMessage = {
      sessionId,
      agentId,
      workspaceId,
      content: trimmed,
      role: 'assistant' as const,
    };

    const result = await pluginInstance.handleMessage(aiMessage);
    console.log(`[brain-memory] AI reply extracted: ${result?.extractedNodes?.length || 0} nodes, ${result?.extractedEdges?.length || 0} edges`);
  } catch (error) {
    console.error('[brain-memory] AI reply extraction failed:', error);
  }
}

/**
 * Handle session start
 */
export async function session_start(event: any, ctx: any) {
  // Lazy initialization
  if (!pluginInstance) {
    try {
      console.log('[brain-memory] Initializing plugin on first use');
      
      // Use the config stored during registration
      if (!storedConfig) {
        console.error('[brain-memory] No config available for initialization');
        return;
      }
      
      pluginInstance = createBrainMemoryPlugin(storedConfig);
      await pluginInstance.init();
      
      console.log('[brain-memory] Plugin initialized successfully');
    } catch (error) {
      console.error('[brain-memory] Plugin initialization failed:', error);
      return;
    }
  }
  
  try {
    // Convert OpenClaw's (event, ctx) format to brain-memory's SessionEvent format
    const sessionEvent = {
      sessionId: ctx?.conversationId || 'default-session',
      agentId: ctx?.accountId || 'default-agent',
      workspaceId: 'default-workspace',
      messages: []
    };
    
    await pluginInstance.onSessionStart(sessionEvent);
    
    // Preload memories from previous sessions for this agent
    // This ensures new sessions start with relevant memory context
    if (storedConfig && pluginInstance) {
      try {
        const agentKey = memoryCacheKey(sessionEvent.agentId, sessionEvent.workspaceId);
        const existingCache = sessionMemoryCache.get(agentKey);
        if (existingCache) {
          // Reuse existing agent-level cache
          sessionMemoryCache.set(sessionEvent.sessionId, existingCache);
          console.log(`[brain-memory] Preloaded ${existingCache.relatedNodes?.length || 0} memories for new session ${sessionEvent.sessionId}`);
        } else {
          // Query for any existing memories to warm up the cache
          const warmupMsg = {
            sessionId: sessionEvent.sessionId,
            agentId: sessionEvent.agentId,
            workspaceId: sessionEvent.workspaceId,
            content: 'recent topics conversations',
            role: 'user'
          };
          const memoryContext = await pluginInstance.getMemoryContext(warmupMsg);
          if (memoryContext && memoryContext.relatedNodes?.length > 0) {
            sessionMemoryCache.set(agentKey, memoryContext);
            sessionMemoryCache.set(sessionEvent.sessionId, memoryContext);
            console.log(`[brain-memory] Warmed up cache with ${memoryContext.relatedNodes.length} memories for new session`);
          }
        }
      } catch (warmupError) {
        console.warn('[brain-memory] Memory preload failed:', warmupError);
      }
    }
  } catch (error) {
    console.error('[brain-memory] Session start failed:', error);
  }
}

/**
 * Handle session start (alias for backward compatibility)
 */
export const onSessionStart = session_start;

/**
 * Handle session end
 */
export async function session_end(event: any, ctx: any) {
  // Lazy initialization
  if (!pluginInstance) {
    try {
      console.log('[brain-memory] Initializing plugin on first use');
      
      // Use the config stored during registration
      if (!storedConfig) {
        console.error('[brain-memory] No config available for initialization');
        return;
      }
      
      pluginInstance = createBrainMemoryPlugin(storedConfig);
      await pluginInstance.init();
      
      console.log('[brain-memory] Plugin initialized successfully');
    } catch (error) {
      console.error('[brain-memory] Plugin initialization failed:', error);
      return;
    }
  }
  
  try {
    // Convert OpenClaw's (event, ctx) format to brain-memory's SessionEvent format
    const sessionEvent = {
      sessionId: ctx?.conversationId || 'default-session',
      agentId: ctx?.accountId || 'default-agent',
      workspaceId: 'default-workspace',
      messages: []
    };
    
    await pluginInstance.onSessionEnd(sessionEvent);
  } catch (error) {
    console.error('[brain-memory] Session end failed:', error);
  }
}

/**
 * Handle session end (alias for backward compatibility)
 */
export const onSessionEnd = session_end;

/**
 * Prepare message before sending
 * 
 * Note: This is a synchronous hook in OpenClaw, so we return the original event immediately
 * and handle any memory injection asynchronously without blocking the message flow.
 * However, we can attach cached memories if available.
 */
export function before_message_write(event: any, ctx: any) {
  // Check if we have cached memories for this session
  const sessionId = ctx?.conversationId || 'default-session';
  let cachedMemoryContext = sessionMemoryCache.get(sessionId);
  
  // Fallback: check agent-level cache if session cache is empty
  if (!cachedMemoryContext) {
    const agentId = ctx?.accountId || 'default-agent';
    const workspaceId = 'default-workspace';
    const agentKey = memoryCacheKey(agentId, workspaceId);
    cachedMemoryContext = sessionMemoryCache.get(agentKey);
    if (cachedMemoryContext) {
      console.log(`[brain-memory] Using agent-level memory cache for session ${sessionId}`);
    }
  }
  
  if (cachedMemoryContext) {
    // Attach memory context to the event if available
    return {
      ...event,
      memoryContext: cachedMemoryContext,
      // Optionally modify the content to include memory hints
      content: event?.content || ''
    };
  }
  
  // Return original event if no cached memories
  return event;
}

/**
 * Prepare message before sending (alias for backward compatibility)
 */
export const beforeMessageSend = before_message_write;

/**
 * Get memory context
 */
export async function getMemoryContext(message: any) {
  if (!pluginInstance) {
    console.warn('[brain-memory] Plugin not initialized');
    return null;
  }
  
  try {
    return await pluginInstance.getMemoryContext(message);
  } catch (error) {
    console.error('[brain-memory] Get memory context failed:', error);
    return null;
  }
}

/**
 * Get plugin status
 */
export async function get_status() {
  if (!pluginInstance) {
    // Try lazy initialization for status check
    try {
      console.log('[brain-memory] Initializing plugin for status check');
      
      // Use the config stored during registration
      if (!storedConfig) {
        console.error('[brain-memory] No config available for initialization');
        return { status: 'not initialized', enabled: false };
      }
      
      pluginInstance = createBrainMemoryPlugin(storedConfig);
      await pluginInstance.init();
      
      console.log('[brain-memory] Plugin initialized successfully for status check');
    } catch (error) {
      console.error('[brain-memory] Plugin initialization failed for status check:', error);
      return { status: 'not initialized', enabled: false };
    }
  }
  
  try {
    return await pluginInstance.getStatus();
  } catch (error) {
    console.error('[brain-memory] Get status failed:', error);
    return { status: 'error', error: (error as Error).message };
  }
}

/**
 * Get plugin status (alias for backward compatibility)
 */
export const getStatus = get_status;

/**
 * Shutdown the plugin
 */
export async function shutdown() {
  if (!pluginInstance) {
    console.warn('[brain-memory] Plugin not initialized');
    return { success: true, message: 'Nothing to shut down' };
  }
  
  try {
    await pluginInstance.shutdown();
    pluginInstance = null;
    return { success: true, message: 'Plugin shut down successfully' };
  } catch (error) {
    console.error('[brain-memory] Shutdown failed:', error);
    return { success: false, error: (error as Error).message };
  }
}

export default {
  register,
  init,
  activate,
  deactivate,
  handleMessage,
  onSessionStart,
  onSessionEnd,
  beforeMessageSend,
  getMemoryContext,
  getStatus,
  shutdown
};