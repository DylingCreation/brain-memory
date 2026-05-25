/**
 * brain-memory — Composable maintenance pipeline (v2.0.0 S-9)
 *
 * 替代 maintenance.ts 中的三条独立路径函数。
 * 从旧函数逐行提取每一步 → 用 wrap() 适配 sync→async → 注入管线。
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

/** sync/任意返回值 → Promise<void> */
const wrap = <T>(fn: () => T): (() => Promise<void>) => async () => { fn(); };

/** async → Promise<void> */
const wrapAsync = (fn: () => Promise<unknown>): (() => Promise<void>) => async () => { await fn(); };

// ─── Decay archiving (所有路径共享) ──────────────────────

const DECAY_DEPRECATE_THRESHOLD = 0.25;

function runDecayArchiving(storage: IStorageAdapter, cfg: BmConfig): number {
  if (!cfg.decay.enabled) return 0;
  let deprecated = 0;
  const nodes = storage.findAllActive();
  for (const node of nodes) {
    const score = scoreDecay(node, cfg.decay);
    if (score.composite < DECAY_DEPRECATE_THRESHOLD && node.validatedCount <= 1) {
      try { storage.deprecateNode(node.id); deprecated++; }
      catch { /* ignore */ }
    }
  }
  if (deprecated > 0) {
    logger.info('maintenance', `Decay archiving: ${deprecated} nodes deprecated (composite < ${DECAY_DEPRECATE_THRESHOLD})`);
  }
  return deprecated;
}

// ─── Factory ────────────────────────────────────────────

export interface PipelineResult {
  incremental: boolean;
  lite: boolean;
  durationMs: number;
}

export async function runPipeline(
  storage: IStorageAdapter,
  cfg: BmConfig,
  llm?: CompleteFn,
  embedFn?: EmbedFn,
): Promise<PipelineResult> {
  const start = Date.now();
  const mode: RunMode = cfg.mode ?? 'full';
  const isLite = mode === 'lite';
  const incremental = !isLite && shouldRunIncremental(storage);

  const p = new MaintenancePipeline();

  // Step 1: dedup (all paths)
  p.add('dedup', wrap(() => {
    const result = dedup(storage, cfg);
    if (result.merged > 0) invalidateGraphCache();
  }));

  if (isLite) {
    // Lite: dedup + PageRank + decay (no LPA, no LLM)
    p.add('pagerank', wrap(() => computeGlobalPageRank(storage, cfg)));
  } else if (incremental) {
    // Incremental: dedup + inc-PR + inc-LPA + (LLM summaries) + decay
    p.add('inc-pagerank', wrap(() => runIncrementalPageRank(storage, cfg)));
    p.add('inc-communities', wrapAsync(async () => {
      const commResult = await runIncrementalCommunities(storage);
      if (llm && embedFn && commResult.count > 0) {
        await summarizeCommunities(storage, commResult.communities, llm, embedFn);
      }
    }));
  } else {
    // Full: dedup + PR + LPA + (LLM summaries) + decay
    p.add('pagerank', wrap(() => computeGlobalPageRank(storage, cfg)));
    p.add('communities', wrapAsync(async () => {
      const commResult = detectCommunities(storage);
      if (llm && embedFn && commResult.count > 0) {
        await summarizeCommunities(storage, commResult.communities, llm, embedFn);
      }
    }));
  }

  // Step final: decay archiving + cleanup (all paths)
  p.add('decay', wrap(() => {
    runDecayArchiving(storage, cfg);
    storage.clearDirty();
  }));

  await p.run();

  return {
    incremental: !isLite && incremental,
    lite: isLite,
    durationMs: Date.now() - start,
  };
}
