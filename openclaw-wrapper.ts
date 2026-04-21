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

/**
 * Register the plugin with OpenClaw
 */
export async function register(api: any) {
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
  
  // Initialize plugin with extracted config
  pluginInstance = createBrainMemoryPlugin(bmConfig);
  await pluginInstance.init();
  
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
 */
export async function message_received(message: any) {
  if (!pluginInstance) {
    console.warn('[brain-memory] Plugin not initialized');
    return null;
  }
  
  try {
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
export async function session_start(event: any) {
  if (!pluginInstance) {
    console.warn('[brain-memory] Plugin not initialized');
    return;
  }
  
  try {
    await pluginInstance.onSessionStart(event);
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
export async function session_end(event: any) {
  if (!pluginInstance) {
    console.warn('[brain-memory] Plugin not initialized');
    return;
  }
  
  try {
    await pluginInstance.onSessionEnd(event);
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
 */
export async function before_message_write(message: any) {
  if (!pluginInstance) {
    console.warn('[brain-memory] Plugin not initialized');
    return message;
  }
  
  try {
    return await pluginInstance.beforeMessageSend(message);
  } catch (error) {
    console.error('[brain-memory] Before message send failed:', error);
    return message;
  }
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
    return { status: 'not initialized', enabled: false };
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