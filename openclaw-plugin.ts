/**
 * brain-memory - OpenClaw Plugin Entry Point
 *
 * Re-exports the main plugin implementation for compatibility
 */

// Re-export everything from the core implementation
export * from './src/plugin/core';

// Export the default plugin factory for OpenClaw to use
import { createBrainMemoryPluginCore } from './src/plugin/core';
export default createBrainMemoryPluginCore;