/**
 * brain-memory — Composable maintenance pipeline (v2.0.0 S-9)
 *
 * 替代旧版 runMaintenance() 大函数。每步独立 try/catch。
 * 通过 createPipeline() 根据脏比例自动选择全量/增量路径。
 */

import type { BmConfig } from '../types';
import type { IStorageAdapter } from '../store/adapter';
import { computeGlobalPageRank, runIncrementalPageRank } from './pagerank';
import { detectCommunities, runIncrementalCommunities } from './community';
import { dedup } from './dedup';
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
      try {
        await step.fn();
      } catch (err) {
        logger.error('maintenance', `"${step.name}" failed: ${(err as Error).message}`);
      }
    }
  }
}

// ─── Wrappers (sync → async adapter) ────────────────────

/** 将同步/非Promise函数包装为 Promise<void> */
const wrap = <T>(fn: () => T): (() => Promise<void>) =>
  async () => { fn(); };

// ─── Factory ────────────────────────────────────────────

/**
 * 构建维护管线。根据脏比例自动选择:
 * - 全量: dedup + PageRank + LPA + decay
 * - 增量 (脏比例 < 10%): inc-PageRank + inc-LPA + decay
 * - Lite: 仅 decay
 */
export function createPipeline(
  storage: IStorageAdapter,
  cfg: BmConfig,
): MaintenancePipeline {
  const p = new MaintenancePipeline();
  const mode = cfg.mode ?? 'full';

  if (mode === 'lite') {
    // Lite 模式: 仅衰减
    p.add('decay', wrap(() => {
      storage.findAllActive().forEach(n => scoreDecay(n, cfg.decay));
    }));
    return p;
  }

  if (shouldRunIncremental(storage)) {
    // 增量路径
    p.add('inc-pagerank',
      wrap(() => runIncrementalPageRank(storage, cfg)));
    p.add('inc-communities',
      wrap(() => runIncrementalCommunities(storage)));
    p.add('inc-dedup',
      wrap(() => dedup(storage, cfg)));
  } else {
    // 全量路径
    p.add('dedup',
      wrap(() => dedup(storage, cfg)));
    p.add('pagerank',
      wrap(() => computeGlobalPageRank(storage, cfg)));
    p.add('communities',
      wrap(() => detectCommunities(storage)));
  }

  // decay 始终执行
  p.add('decay', wrap(() => {
    storage.findAllActive().forEach(n => scoreDecay(n, cfg.decay));
  }));

  return p;
}
