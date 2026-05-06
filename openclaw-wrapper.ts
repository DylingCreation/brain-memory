/**
 * brain-memory - OpenClaw Plugin Wrapper
 *
 * Simple wrapper that provides the register/activate functions required by OpenClaw
 * while delegating functionality to the main BrainMemoryPlugin implementation.
 *
 * #8 fix (2026-04-25):
 *  - Race condition: pluginInstance was assigned BEFORE init() completed.
 *    Now it's assigned AFTER init() finishes, inside the guarded promise.
 *  - All async hooks check initPromise first, not pluginInstance.
 *  - Session memory cache bounded to 200 entries to prevent memory leak.
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

// Import the full DEFAULT_CONFIG from types (contains all nested BmConfig fields)
import { DEFAULT_CONFIG as FULL_DEFAULT_CONFIG } from './src/types';

// Global plugin instance
let pluginInstance: BrainMemoryPluginClass | null = null;

// Store configuration globally for access in hooks
let storedConfig: any = null;

// Initialization guard (#8 fix):
// - initPromise: tracks the active initialization promise
// - initComplete: tracks whether init() has FINISHED (not just started)
// The old code assigned pluginInstance BEFORE await init() completed,
// causing concurrent hooks to see a non-null instance that wasn't ready.
let initPromise: Promise<void> | null = null;
let initComplete = false;

// Cache for storing retrieved memories.
// Keyed by "agentId:workspaceId" (agent-level) to share memories across sessions.
// Also keyed by sessionId for backward compatibility with existing cached data.
// #8 fix: bounded cache to prevent memory leak from unbounded sessionId accumulation.
const MEMORY_CACHE_MAX_SIZE = 200;
const sessionMemoryCache = new Map<string, any>();

/**
 * Evict oldest cache entry if cache exceeds size limit.
 * #8 fix: prevents memory leak from accumulating session IDs.
 */
function evictCacheIfNeeded(): void {
  while (sessionMemoryCache.size > MEMORY_CACHE_MAX_SIZE) {
    const oldest = sessionMemoryCache.keys().next().value;
    if (oldest !== undefined) sessionMemoryCache.delete(oldest);
    else break;
  }
}

/**
 * Build a cache key for memory context.
 * Uses agent-level key so new sessions can reuse memories from previous sessions.
 */
function memoryCacheKey(agentId: string, workspaceId: string): string {
  return `mem:${agentId}:${workspaceId}`;
}

/**
 * Shared initialization guard - prevents concurrent lazy-init races.
 * Called by any hook when pluginInstance is null.
 *
 * #8 fix: pluginInstance is assigned INSIDE the promise, AFTER init() completes.
 * This eliminates the race window where concurrent hooks see a non-null but
 * uninitialized instance.
 */
async function ensurePluginInitialized(): Promise<void> {
  console.log('[brain-memory] Initializing plugin on first use');
  const instance = createBrainMemoryPlugin(storedConfig);
  await instance.init(); // ← init completes FIRST
  pluginInstance = instance; // ← THEN assign (no race window)
  initComplete = true;
  console.log('[brain-memory] Plugin initialized successfully');
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

  // Store config globally for access in hook functions.
  // Merge with the FULL_DEFAULT_CONFIG from src/types.ts to ensure all
  // nested fields (decay, reflection, workingMemory, fusion, reasoning, etc.)
  // are present and won't cause runtime crashes in ContextEngine.
  storedConfig = { ...FULL_DEFAULT_CONFIG, ...bmConfig };

  // Register hooks using the real OpenClaw plugin API
  // api.registerHook() is the canonical method (documented in plugin-sdk types)
  // api.on() is kept as a backward-compat alias in some OpenClaw versions
  const hookNames = [
    'message_received',
    'message_sent',
    'before_message_write',
    'session_start',
    'session_end',
  ] as const;
  const hookHandlers: Record<string, (...args: any[]) => any> = {
    message_received,
    message_sent,
    before_message_write,
    session_start,
    session_end,
  };

  if (typeof api?.registerHook === 'function') {
    // Canonical OpenClaw plugin API
    for (const name of hookNames) {
      api.registerHook(name, hookHandlers[name]);
    }
    console.log('[brain-memory] Hooks registered via api.registerHook()');
  } else if (typeof api?.on === 'function') {
    // Backward-compat: some OpenClaw versions expose api.on() as alias
    for (const name of hookNames) {
      api.on(name, hookHandlers[name]);
    }
    console.log('[brain-memory] Hooks registered via api.on() (legacy compat)');
  } else {
    console.error('[brain-memory] No hook registration method found on api (need registerHook or on)');
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
 *
 * The `config` parameter comes from OpenClaw (merged from configSchema defaults + user overrides).
 * Merge it with FULL_DEFAULT_CONFIG to ensure all nested fields are present.
 */
export async function init(config: any) {
  try {
    console.log('[brain-memory] Initializing plugin...');

    // Merge incoming config with full defaults to guarantee complete BmConfig structure.
    // storedConfig from register() may differ if OpenClaw's configSchema is incomplete.
    const mergedConfig = { ...FULL_DEFAULT_CONFIG, ...(config || {}) };

    // If register() already populated storedConfig, prefer it for consistency
    // (register() has already merged full defaults with user overrides)
    const effectiveConfig = storedConfig || mergedConfig;

    // Create plugin instance
    pluginInstance = createBrainMemoryPlugin(effectiveConfig);

    // Initialize the plugin
    await pluginInstance.init();
    initComplete = true;

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
      initComplete = false;
    }

    console.log('[brain-memory] Plugin deactivated successfully');
    return { success: true, message: 'Plugin deactivated successfully' };
  } catch (error) {
    console.error('[brain-memory] Plugin deactivation failed:', error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Normalize OpenClaw hook arguments into a consistent shape.
 *
 * OpenClaw may call hooks in two ways:
 * 1. (event: InternalHookEvent) — canonical plugin API
 * 2. (event: any, ctx: any) — legacy compat
 *
 * This function detects which format is used and extracts
 * consistent fields: sessionId, agentId, content, channel, etc.
 */
function normalizeHookArgs(args: any[]): {
  sessionId: string;
  agentId: string;
  workspaceId: string;
  content: string;
  channel?: string;
  rawEvent: any;
} {
  // Detect InternalHookEvent format (single arg with `type` + `sessionKey` + `context`)
  const first = args[0];
  if (first && typeof first === 'object' && 'sessionKey' in first && 'type' in first) {
    const hookEvent = first as { sessionKey: string; context?: Record<string, unknown>; messages?: string[] };
    const ctx = hookEvent.context || {};
    return {
      sessionId: (ctx.conversationId as string) || hookEvent.sessionKey || 'default-session',
      agentId: (ctx.accountId as string) || 'default-agent',
      workspaceId: (ctx.workspaceId as string) || 'default-workspace',
      content: (ctx.content as string) || (first as any).content || '',
      channel: ctx.channel as string | undefined,
      rawEvent: first,
    };
  }

  // Legacy (event, ctx) format
  const event = args[0] || {};
  const ctx = args[1] || {};
  return {
    sessionId: ctx?.conversationId || 'default-session',
    agentId: ctx?.accountId || 'default-agent',
    workspaceId: 'default-workspace',
    content: event?.content || '',
    channel: ctx?.channelId,
    rawEvent: event,
  };
}

/**
 * Handle incoming messages
 *
 * OpenClaw passes either:
 *   - (event: InternalHookEvent) — canonical
 *   - (event: any, ctx: any) — legacy
 */
export async function message_received(...args: any[]) {
  const { sessionId, agentId, workspaceId, content } = normalizeHookArgs(args);
  // #8 fix: check initPromise first, not pluginInstance.
  // Old code checked pluginInstance which was assigned BEFORE init() completed,
  // creating a race window where concurrent hooks saw a ready-but-not-ready instance.
  if (initPromise) {
    await initPromise;
  } else if (!pluginInstance) {
    if (!storedConfig) {
      console.error('[brain-memory] No config available for initialization');
      return null;
    }
    initPromise = ensurePluginInitialized();
    await initPromise;
  }

  try {
    // Convert to brain-memory's Message format
    const message = {
      sessionId,
      agentId,
      workspaceId,
      content: typeof content === 'string' ? content : JSON.stringify(content || ''),
      role: 'user' as const,
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
        evictCacheIfNeeded();
        // Also cache at session level for backward compatibility
        sessionMemoryCache.set(message.sessionId, memoryContext);
        evictCacheIfNeeded();
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
 * OpenClaw passes either:
 *   - (event: InternalHookEvent) — canonical
 *   - (event: any, ctx: any) — legacy
 *
 * We extract knowledge from AI replies so the memory system knows
 * not just what the user asked, but also what the AI answered,
 * recommended, or committed to.
 */
export async function message_sent(...args: any[]) {
  const { sessionId, agentId, workspaceId, content } = normalizeHookArgs(args);
  // #8 fix: check initPromise first (same race condition guard as message_received)
  if (initPromise) {
    await initPromise;
  } else if (!pluginInstance) {
    if (!storedConfig) {
      console.error('[brain-memory] No config for message_sent hook');
      return;
    }
    initPromise = ensurePluginInitialized();
    await initPromise;
  }

  if (!pluginInstance || !storedConfig?.extractMemories) return;

  const trimmed = content.trim();
  if (trimmed.length < 50) return;

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

    // Use process.nextTick to ensure non-blocking extraction
    process.nextTick(async () => {
      try {
        const result = await pluginInstance.handleMessage(aiMessage) as any;
        console.debug(`[brain-memory] AI reply extracted: ${result?.extractedNodes?.length || 0} nodes, ${result?.extractedEdges?.length || 0} edges`);
      } catch (error) {
        console.error('[brain-memory] AI reply extraction failed:', error);
      }
    });
  } catch (error) {
    console.error('[brain-memory] AI reply extraction failed:', error);
  }
}

/**
 * Handle session start
 */
export async function session_start(...args: any[]) {
  const { sessionId, agentId, workspaceId } = normalizeHookArgs(args);
  // #8 fix: check initPromise first
  if (initPromise) {
    await initPromise;
  } else if (!pluginInstance) {
    if (!storedConfig) {
      console.error('[brain-memory] No config available for initialization');
      return;
    }
    initPromise = ensurePluginInitialized();
    await initPromise;
  }

  try {
    // Convert to brain-memory's SessionEvent format
    const sessionEvent = {
      sessionId,
      agentId,
      workspaceId,
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
          evictCacheIfNeeded();
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
            evictCacheIfNeeded();
            sessionMemoryCache.set(sessionEvent.sessionId, memoryContext);
            evictCacheIfNeeded();
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
export async function session_end(...args: any[]) {
  const { sessionId, agentId, workspaceId } = normalizeHookArgs(args);
  // #8 fix: check initPromise first
  if (initPromise) {
    await initPromise;
  } else if (!pluginInstance) {
    if (!storedConfig) {
      console.error('[brain-memory] No config available for initialization');
      return;
    }
    initPromise = ensurePluginInitialized();
    await initPromise;
  }

  try {
    const sessionEvent = {
      sessionId,
      agentId,
      workspaceId,
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
export function before_message_write(...args: any[]) {
  const { sessionId, agentId, rawEvent } = normalizeHookArgs(args);
  // Synchronous hook — cannot await initialization.
  // #8 fix: only use cache if plugin is fully initialized (initComplete guard).
  // This prevents reading stale/empty cache during the init race window.
  if (!initComplete) {
    // Plugin not yet initialized - just pass through without memory injection.
    // This is safe: the hook is non-critical and will fire again on subsequent messages.
    return rawEvent;
  }

  // Check if we have cached memories for this session
  let cachedMemoryContext = sessionMemoryCache.get(sessionId);

  // Fallback: check agent-level cache if session cache is empty
  if (!cachedMemoryContext) {
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
      ...rawEvent,
      memoryContext: cachedMemoryContext,
      // Optionally modify the content to include memory hints
      content: (rawEvent as any)?.content || ''
    };
  }

  // Return original event if no cached memories
  return rawEvent;
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
  // #8 fix: check initPromise first
  if (initPromise) {
    await initPromise;
  } else if (!pluginInstance) {
    // Try lazy initialization for status check
    if (!storedConfig) {
      console.error('[brain-memory] No config available for initialization');
      return { status: 'not initialized', enabled: false };
    }
    initPromise = ensurePluginInitialized();
    await initPromise;
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
    initComplete = false;
    initPromise = null;
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
