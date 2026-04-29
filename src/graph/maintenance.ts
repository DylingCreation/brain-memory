/**
 * brain-memory — Graph maintenance pipeline
 *
 * Sequence: dedup → PageRank → community detection → community summaries
 * Authors: adoresever (graph-memory), brain-memory contributors
 */

import { type DatabaseSyncInstance } from "@photostructure/sqlite";
import type { BmConfig } from "../types";
import type { CompleteFn } from "../engine/llm";
import type { EmbedFn } from "../engine/embed";
import { invalidateGraphCache, computeGlobalPageRank } from "./pagerank"
import { detectCommunities, summarizeCommunities } from "./community"
import { dedup } from "./dedup"
import { logger } from "../utils/logger";

export async function runMaintenance(
  db: DatabaseSyncInstance,
  cfg: BmConfig,
  llm?: CompleteFn,
  embedFn?: EmbedFn,
) {
  const start = Date.now();
  invalidateGraphCache();

  // 1. Dedup
  const dedupResult = dedup(db, cfg);
  if (dedupResult.merged > 0) invalidateGraphCache();

  // 2. Global PageRank
  const pagerankResult = computeGlobalPageRank(db, cfg);

  // 3. Community detection
  const communityResult = detectCommunities(db);

  // 4. Community summaries (needs LLM)
  let communitySummaries = 0;
  if (llm && communityResult.count > 0) {
    try {
      communitySummaries = await summarizeCommunities(db, communityResult.communities, llm, embedFn);
    } catch (err) {
      logger.debug("maintenance", `community summaries failed: ${err}`);
    }
  }

  return {
    dedup: dedupResult,
    pagerank: pagerankResult,
    community: communityResult,
    communitySummaries,
    durationMs: Date.now() - start,
  };
}
