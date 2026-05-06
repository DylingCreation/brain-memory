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
import { scoreDecay } from "../decay/engine"
import { allActiveNodes } from "../store/store"
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

  // 5. v1.0.0 B-3: Decay-based archiving (mark low-composite nodes as deprecated)
  let deprecatedCount = 0;
  if (cfg.decay.enabled) {
    const nodes = allActiveNodes(db);
    const threshold = 0.25; // nodes below this composite score get deprecated
    for (const node of nodes) {
      const score = scoreDecay(node, cfg.decay);
      if (score.composite < threshold && node.validatedCount <= 1) {
        try {
          db.prepare("UPDATE bm_nodes SET status = 'deprecated' WHERE id = ? AND status = 'active'").run(node.id);
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

  return {
    dedup: dedupResult,
    pagerank: pagerankResult,
    community: communityResult,
    communitySummaries,
    deprecatedNodes: deprecatedCount,
    durationMs: Date.now() - start,
  };
}
