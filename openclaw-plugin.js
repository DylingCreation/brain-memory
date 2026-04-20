/**
 * brain-memory - OpenClaw Plugin Entry Point
 * 
 * This file serves as the entry point for OpenClaw to load the brain-memory plugin.
 * It follows the OpenClaw plugin specification.
 */

// Import the handler class
import { BrainMemoryHandler } from './src/plugin/handler.js';

// Plugin manifest
export const pluginInfo = {
  id: 'brain-memory',
  name: 'Brain Memory',
  version: '1.0.0',
  description: 'Unified knowledge graph + vector memory system for AI agents',
  author: 'OpenClaw Team',
  license: 'MIT',
};

// Plugin factory function
let handlerInstance = null;

/**
 * Initialize the plugin with the provided configuration
 */
export async function init(config) {
  try {
    console.log('[brain-memory] Initializing plugin...');
    
    // Create handler instance
    handlerInstance = new BrainMemoryHandler(config);
    
    // Initialize the handler
    await handlerInstance.initialize();
    
    console.log('[brain-memory] Plugin initialized successfully');
    return { success: true, message: 'Plugin initialized successfully' };
  } catch (error) {
    console.error('[brain-memory] Plugin initialization failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle incoming messages
 */
export async function handleMessage(data) {
  if (!handlerInstance) {
    console.warn('[brain-memory] Handler not initialized');
    return { success: false, error: 'Handler not initialized' };
  }

  try {
    const { content, sessionId, agentId, workspaceId, role, turnIndex } = data;
    
    // Process the message to extract knowledge
    await handlerInstance.handleMessage(content, sessionId, agentId, workspaceId, role, turnIndex);
    
    return { success: true };
  } catch (error) {
    console.error('[brain-memory] Handle message failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Hook for session start
 */
export async function onSessionStart(data) {
  if (!handlerInstance) {
    console.warn('[brain-memory] Handler not initialized');
    return { success: false, error: 'Handler not initialized' };
  }

  try {
    const { sessionId, agentId, workspaceId } = data;
    
    await handlerInstance.handleSessionStart(sessionId, agentId, workspaceId);
    
    return { success: true };
  } catch (error) {
    console.error('[brain-memory] Session start hook failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Hook for session end
 */
export async function onSessionEnd(data) {
  if (!handlerInstance) {
    console.warn('[brain-memory] Handler not initialized');
    return { success: false, error: 'Handler not initialized' };
  }

  try {
    const { sessionId, agentId, workspaceId, messages } = data;
    
    await handlerInstance.handleSessionEnd(sessionId, agentId, workspaceId, messages);
    
    return { success: true };
  } catch (error) {
    console.error('[brain-memory] Session end hook failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get memory context for a query
 */
export async function getMemoryContext(data) {
  if (!handlerInstance) {
    console.warn('[brain-memory] Handler not initialized');
    return { success: false, error: 'Handler not initialized', context: null };
  }

  try {
    const { query, sessionId, agentId, workspaceId } = data;
    
    const context = await handlerInstance.getMemoryContext(query, sessionId, agentId, workspaceId);
    
    return { success: true, context };
  } catch (error) {
    console.error('[brain-memory] Get memory context failed:', error);
    return { success: false, error: error.message, context: null };
  }
}

/**
 * Get plugin status
 */
export async function getStatus() {
  if (!handlerInstance) {
    return { 
      success: false, 
      error: 'Handler not initialized', 
      status: { status: 'not initialized' } 
    };
  }

  try {
    const status = await handlerInstance.getStatus();
    return { success: true, status };
  } catch (error) {
    console.error('[brain-memory] Get status failed:', error);
    return { success: false, error: error.message, status: {} };
  }
}

/**
 * Shutdown the plugin
 */
export async function shutdown() {
  if (!handlerInstance) {
    console.warn('[brain-memory] Handler not initialized');
    return { success: true, message: 'Nothing to shut down' };
  }

  try {
    await handlerInstance.shutdown();
    handlerInstance = null;
    return { success: true, message: 'Plugin shut down successfully' };
  } catch (error) {
    console.error('[brain-memory] Shutdown failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Export the plugin interface as default
 */
export default {
  init,
  handleMessage,
  onSessionStart,
  onSessionEnd,
  getMemoryContext,
  getStatus,
  shutdown,
  pluginInfo
};