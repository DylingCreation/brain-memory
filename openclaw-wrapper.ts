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
export function register(api: any) {
  console.log('[brain-memory] Registering plugin with OpenClaw');
  
  return {
    id: 'brain-memory',
    name: 'Brain Memory',
    version: '1.0.0',
    description: 'Unified knowledge graph + vector memory system for AI agents',
    author: 'OpenClaw Team',
    license: 'MIT',
    hooks: [
      'init',
      'handleMessage', 
      'onSessionStart',
      'onSessionEnd',
      'beforeMessageSend',
      'getMemoryContext',
      'getStatus',
      'shutdown'
    ]
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
export async function handleMessage(message: any) {
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
 * Handle session start
 */
export async function onSessionStart(event: any) {
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
 * Handle session end
 */
export async function onSessionEnd(event: any) {
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
 * Prepare message before sending
 */
export async function beforeMessageSend(message: any) {
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
export async function getStatus() {
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