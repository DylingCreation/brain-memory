/**
 * brain-memory — Reflection Service
 *
 * Handles session-level reflection: derives high-level insights from conversation turns.
 * Extracted from ContextEngine (v2.x I1 refactor).
 */

import type { BmConfig, ReflectionInsight } from '../types';
import type { IStorageAdapter } from '../store/adapter';
import { createCompleteFn } from './llm';
import { reflectOnSession } from '../reflection/extractor';
import { logger } from '../utils/logger';

export class ReflectionService {
  constructor(
    private storage: IStorageAdapter,
    private config: BmConfig,
    private llmEnabled: boolean,
  ) {}

  /** Reflect on an entire session to derive high-level insights. */
  async run(sessionId: string, messages: Array<{ role?: string; content: string }>): Promise<ReflectionInsight[]> {
    if ((this.config.mode ?? 'full') === 'lite' || !this.config.reflection.enabled || !this.config.reflection.sessionReflection) {
      return [];
    }
    if (!this.llmEnabled) {
      logger.warn('reflection', 'Session reflection skipped — LLM not configured');
      return [];
    }
    if (!this.storage.capabilities.reflections) {
      logger.warn('reflection', 'Session reflection skipped — storage backend does not support reflections');
      return [];
    }

    try {
      const sessionNodes = this.storage.findAllActive().filter(n => n.sourceSessions.includes(sessionId));
      return await reflectOnSession(
        this.config.reflection,
        createCompleteFn(this.config.llm)!,
        {
          sessionMessages: messages.map(m => m.content).join('\n'),
          extractedNodes: sessionNodes.map(n => ({
            name: n.name, category: n.category, type: n.type, content: n.content,
          })),
        },
        this.config.mode as 'full' | 'small' | 'lite',
      );
    } catch (error) {
      logger.error('reflection', 'Failed to perform session reflection:', error);
      throw error;
    }
  }
}
