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
    
    return await pluginInstance.handleMessage(message);
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
 * Note: This is a synchronous hook in OpenClaw, so we return the original event
 * and handle any memory injection asynchronously without blocking the message flow.
 */
export function before_message_write(event: any, ctx: any) {
  // For synchronous hook, we return the original event immediately
  // Any memory injection should happen via other mechanisms
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