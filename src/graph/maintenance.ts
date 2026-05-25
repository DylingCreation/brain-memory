/**
 * brain-memory — Graph maintenance pipeline
 *
 * Sequence: dedup → PageRank → community detection → community summaries
 *
 * v1.1.0 F-2: Uses IStorageAdapter instead of DatabaseSyncInstance.
 * v1.1.0 F-4: Smart trigger — incremental when dirty ratio < threshold.
 * v2.0.0 S-9: Delegates to composable pipeline in ./pipeline.ts.
 *
 * Authors: adoresever (graph-memory), brain-memory contributors
 */

import type { BmConfig } from '../types';
import type { IStorageAdapter } from '../store/adapter';
import type { CompleteFn } from '../engine/llm';
import type { EmbedFn } from '../engine/embed';
import { runMaintenance as _run, type MaintenanceResult } from './pipeline';

// ─── Incremental threshold ───────────────────────────────

const DEFAULT_DIRTY_THRESHOLD = 0.10;

/** 检查是否应走增量维护路径 (脏节点比 < 10%) */
export function shouldRunIncremental(storage: IStorageAdapter, threshold: number = DEFAULT_DIRTY_THRESHOLD): boolean {
  const dirtyCount = storage.getDirtyNodes().size;
  const totalActive = storage.findAllActive().length;
  return dirtyCount > 0 && dirtyCount / Math.max(totalActive, 1) < threshold;
}

// ─── Main entry (delegates to pipeline) ──────────────────

/**
 * 运行图维护: 去重 → PageRank → 社区检测 → 社区摘要 → 衰减归档。
 * v2.0.0 S-9: 委托给可组合管线。
 */
export async function runMaintenance(
  storage: IStorageAdapter,
  cfg: BmConfig,
  llm?: CompleteFn,
  embedFn?: EmbedFn,
): Promise<MaintenanceResult> {
  return _run(storage, cfg, llm, embedFn);
}

export type { MaintenanceResult };
