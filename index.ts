/**
 * brain-memory - Unified knowledge graph + vector memory system
 * 
 * Merges graph-memory (knowledge graphs) with memory-lancedb-pro (vector memory)
 * into an 8-category system with intelligent decay and reflection.
 * 
 * @module brain-memory
 */

export { ContextEngine } from './src/engine/context.ts';
export { DEFAULT_CONFIG, type BmConfig } from './src/types.ts';
export { initDb } from './src/store/db.ts';
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
} from './src/store/store.ts';
export { Recaller } from './src/recaller/recall.ts';
export { Extractor } from './src/extractor/extract.ts';
export { 
  computeNameSimilarity, 
  findFusionCandidates, 
  parseFusionDecision,
  shouldRunFusion,
  runFusion,
  type FusionCandidate,
  type FusionResult
} from './src/fusion/analyzer.ts';
export { 
  runReasoning, 
  shouldRunReasoning,
  buildReasoningContext,
  parseReasoningResult,
  type ReasoningConclusion,
  type ReasoningResult
} from './src/reasoning/engine.ts';
export { 
  reflectOnTurn, 
  reflectOnSession, 
  sanitizeReflectionText,
  type ReflectionResult
} from './src/reflection/extractor.ts';
export { 
  createWorkingMemory, 
  updateWorkingMemory, 
  buildWorkingMemoryContext,
  type WorkingMemoryState
} from './src/working-memory/manager.ts';
export { 
  scopesMatch, 
  scopeKey, 
  buildScopeFilterClause, 
  DEFAULT_SCOPE_FILTER,
  type MemoryScope,
  type ScopeFilter
} from './src/scope/isolation.ts';
export { assembleContext, buildSystemPromptAddition } from './src/format/assemble.ts';
export { scoreDecay, applyTimeDecay } from './src/decay/engine.ts';
export { isNoise } from './src/noise/filter.ts';
export { classifyTemporal } from './src/temporal/classifier.ts';
export { 
  computeGlobalPageRank,
  personalizePageRank,
  type GlobalPageRankResult,
  type PPRResult
} from './src/graph/pagerank.ts';
export { 
  detectCommunities, 
  getCommunityPeers, 
  communityRepresentatives 
} from './src/graph/community.ts';
export { 
  extractJson 
} from './src/utils/json.ts';
export { 
  escapeXml 
} from './src/utils/xml.ts';
export { 
  cosineSimilarityF32,
  type SimilarityFn
} from './src/utils/similarity.ts';
export { 
  tokenize, 
  jaccardSimilarity 
} from './src/utils/text.ts';

// Export all type definitions
export * from './src/types.ts';

console.log('brain-memory module loaded successfully.');