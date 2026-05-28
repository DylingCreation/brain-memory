/**
 * brain-memory — Fusion Service
 *
 * Handles knowledge fusion: finds and merges duplicate or related nodes.
 * Extracted from ContextEngine (v2.x I1 refactor).
 */

import type { BmConfig } from '../types';
import type { FusionResult } from '../fusion/analyzer';
import type { IStorageAdapter } from '../store/adapter';
import type { HookRegistry } from '../plugin/hooks';
import { createCompleteFn } from './llm';
import { createEmbedFn } from './embed';
import { runFusion } from '../fusion/analyzer';
import { logger } from '../utils/logger';

export class FusionService {
  constructor(
    private storage: IStorageAdapter,
    private config: BmConfig,
    private hooks: HookRegistry,
    private llmEnabled: boolean,
  ) {}

  /** Perform knowledge fusion: deduplicate nodes or link related ones. */
  async run(sessionId: string = 'fusion'): Promise<FusionResult> {
    if ((this.config.mode ?? 'full') === 'lite' || !this.config.fusion.enabled) {
      return { candidates: [], merged: 0, linked: 0, durationMs: 0 };
    }

    try {
      for (const hook of this.hooks.beforeFusion) {
        try { await hook([]); } catch (err) { logger.warn('fusion', `beforeFusion hook failed: ${err}`); }
      }

      const result = await runFusion(
        this.storage, this.config,
        this.llmEnabled ? createCompleteFn(this.config.llm) : null,
        createEmbedFn(this.config.embedding),
        sessionId,
      );

      for (const hook of this.hooks.afterFusion) {
        try { await hook({ merged: result.merged, linked: result.linked }); } catch (err) { logger.warn('fusion', `afterFusion hook failed: ${err}`); }
      }

      return result;
    } catch (error) {
      logger.error('fusion', 'Failed to perform fusion:', error);
      throw error;
    }
  }
}
