/**
 * brain-memory — Composable maintenance pipeline (v2.0.0 S-9)
 *
 * 替代 maintenance.ts 中的三条独立路径函数。
 * 返回 MaintenanceResult — 与旧 runMaintenance() 返回值结构完全兼容。
 */

import type { BmConfig, RunMode } from '../types';
import type { IStorageAdapter } from '../store/adapter';
import type { CompleteFn } from '../engine/llm';
import type { EmbedFn } from '../engine/embed';
import { invalidateGraphCache, computeGlobalPageRank, runIncrementalPageRank } from './pagerank';
import { detectCommunities, summarizeCommunities, runIncrementalCommunities } from './community';
import { dedup, type DedupResult } from './dedup';
import { scoreDecay } from '../decay/engine';
import { logger } from '../utils/logger';
import { shouldRunIncremental } from './maintenance';

// ─── Return type (compatible with old runMaintenance) ─────

export interface MaintenanceResult {
  dedup: DedupResult;
  pagerank: { scores: Map<string, number>; topK: Array<{ id: string; name: string; score: number }> };
  community: { count: number; labels: Map<string, string>; communities: Map<string, string[]> };
  communitySummaries: number;
  deprecatedNodes: number;
  incremental: boolean;
  lite: boolean;
  dirtyRatio: number;
  durationMs: number;
}

// ─── Pipeline ───────────────────────────────────────────

export class MaintenancePipeline {
  private _steps: Array<{ name: string; fn: () => Promise<void> }> = [];

  add(name: string, fn: () => Promise<void>): this {
    this._steps.push({ name, fn });
    return this;
  }

  async run(): Promise<void> {
    for (const step of this._steps) {
      try { await step.fn(); }
      catch (e) { logger.error('maintenance', `"${step.name}" failed: ${(e as Error).message}`); }
    }
  }
}

// ─── Wrappers ────────────────────────────────────────────

const wrap = <T>(fn: () => T): (() => Promise<void>) => async () => { fn(); };
const wrapAsync = (fn: () => Promise<unknown>): (() => Promise<void>) => async () => { await fn(); };

// ─── Decay archiving ─────────────────────────────────────

const DECAY_THRESHOLD = 0.25;

function runDecayArchiving(storage: IStorageAdapter, cfg: BmConfig): number {
  if (!cfg.decay.enabled) return 0;
  let deprecated = 0;
  for (const node of storage.findAllActive()) {
    const score = scoreDecay(node, cfg.decay);
    if (score.composite < DECAY_THRESHOLD && node.validatedCount <= 1) {
      try { storage.deprecateNode(node.id); deprecated++; } catch { /* ignore */ }
    }
  }
  if (deprecated > 0) logger.info('maintenance', `Decay: ${deprecated} nodes deprecated`);
  return deprecated;
}

// ─── Main entry (replaces old runMaintenance) ────────────

export async function runMaintenance(
  storage: IStorageAdapter,
  cfg: BmConfig,
  llm?: CompleteFn,
  embedFn?: EmbedFn,
): Promise<MaintenanceResult> {
  const start = Date.now();
  const mode: RunMode = cfg.mode ?? 'full';
  const isLite = mode === 'lite';
  const incremental = !isLite && shouldRunIncremental(storage);
  const dirtyCount = storage.getDirtyNodes().size;
  const totalActive = storage.findAllActive().length;
  const dirtyRatio = dirtyCount / Math.max(totalActive, 1);

  invalidateGraphCache();

  // Step 1: dedup (all paths)
  const dedupResult = dedup(storage, cfg);
  if (dedupResult.merged > 0) invalidateGraphCache();

  // Step 2: pagerank
  let pagerankResult: MaintenanceResult['pagerank'];
  if (isLite || !incremental) {
    const pr = computeGlobalPageRank(storage, cfg);
    pagerankResult = {
      scores: pr.scores,
      topK: Array.from(pr.scores.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([id, score]) => ({ id, name: id, score })),
    };
  } else {
    const pr = runIncrementalPageRank(storage, cfg);
    pagerankResult = pr.skipped
      ? { scores: new Map(), topK: [] }
      : {
          scores: pr.scores,
          topK: Array.from(pr.scores.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([id, score]) => ({ id, name: id, score })),
        };
  }

  // Step 3: communities
  let communityResult: MaintenanceResult['community'];
  let communitySummaries = 0;

  if (!isLite) {
    if (incremental) {
      const cr = runIncrementalCommunities(storage);
      communityResult = { count: cr.count, labels: cr.labels, communities: cr.communities };
      if (llm && embedFn && cr.count > 0) {
        try { communitySummaries = await summarizeCommunities(storage as any, cr.communities, llm, embedFn); } catch { /* ignore */ }
      }
    } else {
      const cr = detectCommunities(storage);
      communityResult = { count: cr.count, labels: cr.labels, communities: cr.communities };
      if (llm && embedFn && cr.count > 0) {
        try { communitySummaries = await summarizeCommunities(storage as any, cr.communities, llm, embedFn); } catch { /* ignore */ }
      }
    }
  } else {
    communityResult = { count: 0, labels: new Map(), communities: new Map() };
  }

  // Step 4: decay archiving
  const deprecatedNodes = runDecayArchiving(storage, cfg);

  // Cleanup
  storage.clearDirty();

  return {
    dedup: dedupResult,
    pagerank: pagerankResult,
    community: communityResult,
    communitySummaries,
    deprecatedNodes,
    incremental: !isLite && incremental,
    lite: isLite,
    dirtyRatio,
    durationMs: Date.now() - start,
  };
}
