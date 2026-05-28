/**
 * brain-memory — Reasoning Service
 *
 * Handles graph-level reasoning: derives new conclusions from recalled knowledge subgraphs.
 * Extracted from ContextEngine (v2.x I1 refactor).
 */

import type { BmConfig } from '../types';
import type { IStorageAdapter } from '../store/adapter';
import { createCompleteFn } from './llm';
import { runReasoning, type ReasoningConclusion } from '../reasoning/engine';
import { logger } from '../utils/logger';

export class ReasoningService {
  constructor(
    private storage: IStorageAdapter,
    private config: BmConfig,
    private llmEnabled: boolean,
  ) {}

  /** Perform graph-level reasoning across all active nodes. */
  async run(query?: string): Promise<ReasoningConclusion[]> {
    if ((this.config.mode ?? 'full') === 'lite' || !this.config.reasoning.enabled) {
      return [];
    }
    if (!this.llmEnabled) {
      logger.warn('reasoning', 'Reasoning skipped — LLM not configured');
      return [];
    }

    try {
      const nodes = this.storage.findAllActive();
      const edges = this.storage.findAllEdges();
      const reasoningResult = await runReasoning(
        createCompleteFn(this.config.llm)!, nodes, edges, query || '', this.config,
      );
      return reasoningResult?.conclusions || [];
    } catch (error) {
      logger.error('reasoning', 'Failed to perform reasoning:', error);
      throw error;
    }
  }
}
