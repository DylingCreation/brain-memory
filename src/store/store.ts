/**
 * brain-memory — Storage barrel (v2.0.0 S-5: God Object 拆分)
 *
 * store.ts 保留为统一入口，实际实现分布在 storage/ 子模块中。
 * 消费者无感知 — 所有 import from './store' 不受影响。
 */

// ─── Types ──────────────────────────────────────────────────
export type { CommunitySummary } from './storage/communities';
export type { ScoredCommunity } from './storage/graph-walk';

// ─── Helpers ─────────────────────────────────────────────────
export { normalizeName } from './storage/_helpers';

// ─── Node CRUD ───────────────────────────────────────────────
export {
  findByName,
  findById,
  allActiveNodes,
  upsertNode,
  deprecate,
  mergeNodes,
  updatePageranks,
  updateCommunities,
  updateAccess,
} from './storage/nodes';

// ─── Edge CRUD ──────────────────────────────────────────────
export {
  upsertEdge,
  edgesFrom,
  edgesTo,
  allEdges,
} from './storage/edges';

// ─── Search ─────────────────────────────────────────────────
export {
  searchNodes,
  topNodes,
  vectorSearchWithScore,
} from './storage/search';

// ─── Vector ops ─────────────────────────────────────────────
export {
  saveVector,
  getVector,
  getVectorHash,
  getAllVectors,
} from './storage/vectors';

// ─── Community summaries ────────────────────────────────────
export {
  upsertCommunitySummary,
  getCommunitySummary,
  getAllCommunitySummaries,
  pruneCommunitySummaries,
} from './storage/communities';

export {
  communityVectorSearch,
  nodesByCommunityIds,
} from './storage/graph-walk';

// ─── Message CRUD ───────────────────────────────────────────
export {
  saveMessage,
  getUnextracted,
  markExtracted,
  getEpisodicMessages,
} from './storage/messages';

// ─── Graph walk ─────────────────────────────────────────────
export {
  graphWalk,
} from './storage/graph-walk';
