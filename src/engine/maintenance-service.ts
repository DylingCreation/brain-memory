/**
 * brain-memory — Maintenance Service
 *
 * Runs graph maintenance pipeline: dedup → PageRank → community detection →
 * decay archiving. Checks storage capabilities for graceful degradation.
 *
 * Extracted from ContextEngine (v2.0.0 → v2.1.0 refactor).
 *
 * Authors: brain-memory contributors
 */

import type { BmConfig } from '../types';
import type { IStorageAdapter } from '../store/adapter';
import { runMaintenance } from '../graph/maintenance';
import { logger } from '../utils/logger';

export class MaintenanceService {
  constructor(
    private storage: IStorageAdapter,
    private config: BmConfig,
  ) {}

  /** Run graph maintenance: PageRank, community detection, decay, archiving. */
  async run(): Promise<void> {
    if (!this.storage.capabilities.communities) {
      logger.warn('context', 'Community detection skipped — storage backend does not support communities');
    }
    try {
      await runMaintenance(this.storage, this.config);
      this.storage.clearDirty();
    } catch (error) {
      logger.error('context', 'Failed to run maintenance:', error);
      throw new Error(`Maintenance failed: ${(error as Error).message}`);
    }
  }
}
