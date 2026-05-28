/**
 * brain-memory — Recall Service
 *
 * Handles query-based memory retrieval: scope filter construction,
 * two-pass recall (restricted → open fallback), and hook lifecycle.
 *
 * Extracted from ContextEngine (v2.0.0 → v2.1.0 refactor).
 *
 * Authors: brain-memory contributors
 */

import type {
  BmConfig,
  RecallResult,
  MemoryCategory,
  MemoryScopeV2,
} from '../types';
import type { Recaller } from '../recaller/recall';
import type { HookRegistry } from '../plugin/hooks';
import { logger } from '../utils/logger';
import { shouldRecall } from '../noise/filter';

export class RecallService {
  constructor(
    private config: BmConfig,
    private recaller: Recaller,
    private hooks: HookRegistry,
  ) {}

  /** Recall memories relevant to a query, with scope filtering and hook lifecycle. */
  async recall(query: string, scope?: MemoryScopeV2): Promise<RecallResult> {
    // D8: Pre-filter — skip recall entirely for low-information messages
    if (!shouldRecall(query)) {
      logger.debug('recall', `Skipping recall for low-information query: "${query.slice(0, 30)}"`);
      return { nodes: [], edges: [], tokenEstimate: 0 };
    }

    // v1.2.0 F-7: Before-recall hook
    let hookQuery = query;
    for (const hook of this.hooks.beforeRecall) {
      try {
        const result = await hook({ query: hookQuery, scopeFilter: undefined });
        if (result) hookQuery = result.query;
      } catch (err) { logger.warn('context', `beforeRecall hook failed: ${err}`); }
    }

    const excludeScopes: MemoryScopeV2[] = [];
    const includeScopes: MemoryScopeV2[] = [];
    if (scope && (scope.agent || scope.workspace || scope.platform || scope.chat)) {
      includeScopes.push({
        platform: scope.platform ?? null,
        workspace: scope.workspace ?? null,
        agent: scope.agent ?? null,
        user: scope.user ?? null,
        chat: scope.chat ?? null,
        thread: scope.thread ?? null,
      });
    }
    const sharingCfg = this.config.memorySharing || {
      enabled: true, mode: 'mixed' as const,
      sharedCategories: [] as MemoryCategory[],
      allowedAgents: [] as string[],
    };
    const scopeFilter = {
      excludeScopes,
      includeScopes,
      allowCrossScope: includeScopes.length === 0,
      sharingMode: sharingCfg.enabled ? sharingCfg.mode : 'isolated',
      sharedCategories: sharingCfg.sharedCategories,
      currentAgentId: scope?.agent ?? undefined,
      allowedAgents: sharingCfg.allowedAgents,
    };
    let result = await this.recaller.recall(hookQuery, scopeFilter);
    if (result.nodes.length === 0 && includeScopes.length === 0) {
      result = await this.recaller.recall(hookQuery, {
        excludeScopes: [], includeScopes: [], allowCrossScope: true,
      });
    }

    // v1.2.0 F-7: After-recall hook
    for (const hook of this.hooks.afterRecall) {
      try { await hook(result); } catch (err) { logger.warn('context', `afterRecall hook failed: ${err}`); }
    }

    return result;
  }
}
