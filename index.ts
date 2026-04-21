/**
 * brain-memory - Unified knowledge graph + vector memory system
 * 
 * Merges graph-memory (knowledge graphs) with memory-lancedb-pro (vector memory)
 * into an 8-category system with intelligent decay and reflection.
 * 
 * @module brain-memory
 */

export { ContextEngine } from './src/engine/context';
export { DEFAULT_CONFIG, type BmConfig } from './src/types';
export { initDb } from './src/store/db';
export { 
  upsertNode, 
  searchNodes, 
  allActiveNodes, 
  upsertEdge,
  updateAccess,
  updatePageranks,
  updateCommunities,
  graphWalk,
  vectorSearchWithScore,
  communityVectorSearch,
  nodesByCommunityIds,
  type ScoredCommunity
} from './src/store/store';
export { Recaller } from './src/recaller/recall';
export { Extractor } from './src/extractor/extract';
export { 
  computeNameSimilarity, 
  findFusionCandidates, 
  parseFusionDecision,
  shouldRunFusion,
  runFusion,
  type FusionCandidate,
  type FusionResult
} from './src/fusion/analyzer';
export { 
  runReasoning, 
  shouldRunReasoning,
  buildReasoningContext,
  parseReasoningResult,
  type ReasoningConclusion,
  type ReasoningResult
} from './src/reasoning/engine';
export { 
  reflectOnTurn, 
  reflectOnSession, 
  sanitizeReflectionText
} from './src/reflection/extractor';
export { 
  createWorkingMemory, 
  updateWorkingMemory, 
  buildWorkingMemoryContext
} from './src/working-memory/manager';
export { 
  scopesMatch, 
  scopeKey, 
  buildScopeFilterClause, 
  DEFAULT_SCOPE_FILTER,
  type MemoryScope,
  type ScopeFilter
} from './src/scope/isolation';
export { assembleContext, buildSystemPromptAddition } from './src/format/assemble';
export { scoreDecay, applyTimeDecay } from './src/decay/engine';
export { isNoise } from './src/noise/filter';
export { classifyTemporal } from './src/temporal/classifier';
export { 
  computeGlobalPageRank,
  personalizedPageRank,
  type GlobalPageRankResult,
  type PPRResult
} from './src/graph/pagerank';
export { 
  detectCommunities, 
  getCommunityPeers, 
  communityRepresentatives 
} from './src/graph/community';
export { 
  extractJson 
} from './src/utils/json';
export { 
  escapeXml 
} from './src/utils/xml';
export { 
  cosineSimilarityF32,
  type SimilarityFn
} from './src/utils/similarity';
export { 
  tokenize, 
  jaccardSimilarity 
} from './src/utils/text';

// Export all type definitions
export * from './src/types';

// Export OpenClaw plugin functions (required for plugin loading)
export {
  register,
  init,
  activate,
  deactivate,
  message_received,
  session_start,
  session_end,
  before_message_write,
  getMemoryContext,
  get_status,
  shutdown,
  // Backward compatibility aliases
  handleMessage,
  onSessionStart,
  onSessionEnd,
  beforeMessageSend,
  getStatus
} from './openclaw-register';

console.log('brain-memory module loaded successfully.');