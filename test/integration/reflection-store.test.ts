/**
 * brain-memory — Reflection store tests
 *
 * v2.1.0: Migrated from createTestDb to createTestStorage (IStorageAdapter).
 */

import { describe, it, expect } from 'vitest';
import { storeReflectionInsights, mapInsightToNode } from '../../src/reflection/store';
import { createTestStorage, cleanupTestDb } from '../helpers';
import { DEFAULT_CONFIG } from '../../src/types';

describe('Reflection Store', () => {
  it('should map insight to node correctly', () => {
    const insight = {
      text: 'User behavior pattern',
      kind: 'user-model',
      reflectionKind: 'derived',
      confidence: 0.8
    };

    const mapping = mapInsightToNode(insight);

    expect(mapping).toBeDefined();
    expect(mapping.type).toBe('TASK');
    expect(['profile', 'preferences']).toContain(mapping.category);
    expect(mapping.prefix).toBe('用户画像');
  });

  it('should handle different insight kinds', () => {
    expect(mapInsightToNode({
      text: 'User prefers dark mode',
      kind: 'user-model', reflectionKind: 'derived', confidence: 0.8
    }).category).toBe('preferences');

    expect(mapInsightToNode({
      text: 'Agent should use concise responses',
      kind: 'agent-model', reflectionKind: 'derived', confidence: 0.8
    }).category).toBe('cases');

    expect(mapInsightToNode({
      text: 'Always validate user inputs',
      kind: 'lesson', reflectionKind: 'derived', confidence: 0.8
    }).category).toBe('cases');

    expect(mapInsightToNode({
      text: 'Choose option A over B',
      kind: 'decision', reflectionKind: 'derived', confidence: 0.8
    }).category).toBe('events');
  });

  it('should store reflection insights without errors', () => {
    const storage = createTestStorage();

    const insights = [{
      text: 'This is a test reflection insight',
      kind: 'decision' as const,
      reflectionKind: 'derived' as const,
      confidence: 0.8
    }];

    const result = storeReflectionInsights(storage, insights, 'test-session', DEFAULT_CONFIG);

    expect(result).toBeDefined();
    expect(typeof result.stored).toBe('number');
    expect(typeof result.boosted).toBe('number');

    cleanupTestDb(storage);
  });

  it('should handle empty insights array', () => {
    const storage = createTestStorage();

    const result = storeReflectionInsights(storage, [], 'test-session', DEFAULT_CONFIG);

    expect(result).toEqual({ stored: 0, boosted: 0 });

    cleanupTestDb(storage);
  });
});
