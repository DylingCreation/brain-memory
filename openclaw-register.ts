/**
 * brain-memory — OpenClaw Plugin Entry Point
 *
 * v1.8.0 F-7: 接入 definePluginEntry 标准入口 (替代自创 register()),
 * hook 名 before_message_write → message_sending (保留别名),
 * api.on() 优先于 api.registerHook()。
 */

import pluginWrapper from './openclaw-wrapper';

// ─── Standard Plugin SDK entry (inlined — openclaw npm 包不可安装) ───

/**
 * definePluginEntry: OpenClaw 官方插件入口的兼容实现。
 *
 * v1.8.0 F-7: 替代旧版自创 register() 函数。
 * 因 openclaw 非普通 npm 包 (EPERM)，此处本地实现 definePluginEntry 签名。
 * 标准签名: definePluginEntry({ id, name, version, register(api) })
 */
interface PluginEntry {
  id: string;
  name: string;
  version: string;
  description?: string;
  register: (api: unknown) => void;
}

function definePluginEntry(entry: PluginEntry): PluginEntry {
  // Standard plugin entry point — returns the entry object for OpenClaw to discover.
  // The register() function will be called by the plugin loader with the api object.
  return entry;
}

export default definePluginEntry({
  id: 'brain-memory',
  name: 'Brain Memory',
  version: '2.0.0',
  description: 'Unified knowledge graph + vector memory system for AI agents',
  register(api: unknown) {
    // Delegate to wrapper's register for hook setup
    const { register } = pluginWrapper;
    register(api);
  },
});

// Export required functions for OpenClaw (legacy compat)
export { 
  register, 
  init, 
  activate, 
  deactivate,
  message_received,
  message_sent,
  message_sending,
  session_start,
  session_end,
  getMemoryContext,
  get_status,
  shutdown,
  // Backward compatibility aliases
  before_message_write,
  handleMessage,
  onSessionStart,
  onSessionEnd,
  beforeMessageSend,
  getStatus
} from './openclaw-wrapper';