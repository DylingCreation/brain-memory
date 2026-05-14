/**
 * brain-memory — Graph maintenance pipeline
 *
 * Sequence: dedup → PageRank → community detection → community summaries
 *
 * v1.1.0 F-2: Uses IStorageAdapter instead of DatabaseSyncInstance.
 * v1.1.0 F-4: Smart trigger — incremental when dirty ratio < threshold.
 *
 * Authors: adoresever (graph-memory), brain-memory contributors
 */

import type { BmConfig } from "../types";
import type { IStorageAdapter } from "../store/adapter";
import type { CompleteFn } from "../engine/llm";
import type { EmbedFn } from "../engine/embed";
import { invalidateGraphCache, computeGlobalPageRank, runIncrementalPageRank } from "./pagerank";
import { detectCommunities, summarizeCommunities, runIncrementalCommunities } from "./community";
import { dedup } from "./dedup";
import { scoreDecay } from "../decay/engine";
import { logger } from "../utils/logger";

// ─── Incremental threshold (configurable) ─────────────────────

const DEFAULT_DIRTY_THRESHOLD = 0.10; // 10%

/**
 * Check whether to run incremental or full maintenance.
 * Returns true if incremental should be used.
 */
export function shouldRunIncremental(storage: IStorageAdapter, threshold: number = DEFAULT_DIRTY_THRESHOLD): boolean {
  const dirtyCount = storage.getDirtyNodes().size;
  const totalActive = storage.findAllActive().length;
  return dirtyCount > 0 && dirtyCount / Math.max(totalActive, 1) < threshold;
}

export async function runMaintenance(
  storage: IStorageAdapter,
  cfg: BmConfig,
  llm?: CompleteFn,
  embedFn?: EmbedFn,
) {
  const start = Date.now();
  const dirtyCount = storage.getDirtyNodes().size;
  const totalActive = storage.findAllActive().length;
  const dirtyRatio = dirtyCount / Math.max(totalActive, 1);

  if (shouldRunIncremental(storage)) {
    // v1.1.0 F-4: Incremental path
    return runIncrementalMaintenancePath(storage, cfg, llm, embedFn, start, dirtyRatio);
  }

  // Full maintenance
  return runFullMaintenancePath(storage, cfg, llm, embedFn, start, dirtyRatio);
}

// ─── Incremental Maintenance Path ──────────────────────────────

async function runIncrementalMaintenancePath(
  storage: IStorageAdapter,
  cfg: BmConfig,
  llm?: CompleteFn,
  embedFn?: EmbedFn,
  start?: number,
  dirtyRatio?: number,
) {
  const startTime = start ?? Date.now();
  const ratio = dirtyRatio ?? storage.getDirtyNodes().size / Math.max(storage.findAllActive().length, 1);

  logger.info("maintenance", `Incremental path (dirty ratio: ${(ratio * 100).toFixed(1)}%)`);

  // 1. Incremental dedup (only check new/changed nodes)
  const dedupResult = dedup(storage, cfg);
  if (dedupResult.merged > 0) invalidateGraphCache();

  // 2. Incremental PageRank
  const prResult = runIncrementalPageRank(storage, cfg);
  const pagerankResult = prResult.skipped
    ? { scores: new Map(), topK: [] }
    : { scores: prResult.scores, topK: Array.from(prResult.scores.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([id, score]) => ({ id, name: id, score })) };

  // 3. Incremental community detection
  const commResult = runIncrementalCommunities(storage);

  // 4. Community summaries (LLM-dependent)
  let communitySummaries = 0;
  if (llm && commResult.count > 0) {
    try {
      communitySummaries = await summarizeCommunities(storage, commResult.communities, llm, embedFn);
    } catch (err) {
      logger.debug("maintenance", `community summaries failed: ${err}`);
    }
  }

  // 5. Decay-based archiving (still run on all nodes for safety)
  let deprecatedCount = 0;
  if (cfg.decay.enabled) {
    const nodes = storage.findAllActive();
    const threshold = 0.25;
    for (const node of nodes) {
      const score = scoreDecay(node, cfg.decay);
      if (score.composite < threshold && node.validatedCount <= 1) {
        try {
          storage.deprecateNode(node.id);
          deprecatedCount++;
        } catch (err) {
          logger.debug("maintenance", `Failed to deprecate node ${node.id}: ${err}`);
        }
      }
    }
  }

  // Clear dirty marks
  storage.clearDirty();

  return {
    dedup: dedupResult,
    pagerank: pagerankResult,
    community: commResult,
    communitySummaries,
    deprecatedNodes: deprecatedCount,
    incremental: true,
    dirtyRatio: ratio,
    durationMs: Date.now() - startTime,
  };
}

// ─── Full Maintenance Path ─────────────────────────────────────

async function runFullMaintenancePath(
  storage: IStorageAdapter,
  cfg: BmConfig,
  llm?: CompleteFn,
  embedFn?: EmbedFn,
  start?: number,
  dirtyRatio?: number,
) {
  const startTime = start ?? Date.now();
  const ratio = dirtyRatio ?? storage.getDirtyNodes().size / Math.max(storage.findAllActive().length, 1);

  logger.info("maintenance", `Full path (dirty ratio: ${(ratio * 100).toFixed(1)}%)`);

  invalidateGraphCache();

  // 1. Dedup
  const dedupResult = dedup(storage, cfg);
  if (dedupResult.merged > 0) invalidateGraphCache();

  // 2. Global PageRank
  const pagerankResult = computeGlobalPageRank(storage, cfg);

  // 3. Community detection
  const communityResult = detectCommunities(storage);

  // 4. Community summaries (needs LLM)
  let communitySummaries = 0;
  if (llm && communityResult.count > 0) {
    try {
      communitySummaries = await summarizeCommunities(storage, communityResult.communities, llm, embedFn);
    } catch (err) {
      logger.debug("maintenance", `community summaries failed: ${err}`);
    }
  }

  // 5. v1.0.0 B-3: Decay-based archiving
  let deprecatedCount = 0;
  if (cfg.decay.enabled) {
    const nodes = storage.findAllActive();
    const threshold = 0.25;
    for (const node of nodes) {
      const score = scoreDecay(node, cfg.decay);
      if (score.composite < threshold && node.validatedCount <= 1) {
        try {
          storage.deprecateNode(node.id);
          deprecatedCount++;
        } catch (err) {
          logger.debug("maintenance", `Failed to deprecate node ${node.id}: ${err}`);
        }
      }
    }
    if (deprecatedCount > 0) {
      logger.info("maintenance", `Decay archiving: ${deprecatedCount} nodes marked as deprecated (composite < ${threshold})`);
    }
  }

  // Clear dirty marks
  storage.clearDirty();

  return {
    dedup: dedupResult,
    pagerank: pagerankResult,
    community: communityResult,
    communitySummaries,
    deprecatedNodes: deprecatedCount,
    incremental: false,
    dirtyRatio: ratio,
    durationMs: Date.now() - startTime,
  };
}
