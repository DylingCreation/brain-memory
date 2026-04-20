/**
 * brain-memory - OpenClaw Plugin Entry Point
 * 
 * This is the main entry point for OpenClaw to load the brain-memory plugin.
 * It follows the OpenClaw plugin specification with register/activate functions.
 */

// Import the plugin wrapper that provides the required functions
import pluginWrapper from './openclaw-wrapper';

// Export required functions for OpenClaw
export { 
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
} from './openclaw-wrapper';

// Also export as default for compatibility
export default pluginWrapper;