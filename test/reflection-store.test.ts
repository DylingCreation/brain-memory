/**
 * brain-memory — Reflection store tests
 */

import { describe, it, expect } from 'vitest';
import { storeReflectionInsights, mapInsightToNode } from '../src/reflection/store';
import { createTestDb } from './helpers';
import { DEFAULT_CONFIG } from '../src/types';

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
    // user-model with 'prefer' goes to 'preferences', otherwise 'profile'
    expect(['profile', 'preferences']).toContain(mapping.category);
    expect(mapping.prefix).toBe('用户画像');
  });

  it('should handle different insight kinds', () => {
    const userInsight = {
      text: 'User prefers dark mode',
      kind: 'user-model',
      reflectionKind: 'derived',
      confidence: 0.8
    };

    const agentInsight = {
      text: 'Agent should use concise responses',
      kind: 'agent-model',
      reflectionKind: 'derived',
      confidence: 0.8
    };

    const lessonInsight = {
      text: 'Always validate user inputs',
      kind: 'lesson',
      reflectionKind: 'derived',
      confidence: 0.8
    };

    const decisionInsight = {
      text: 'Choose option A over B',
      kind: 'decision',
      reflectionKind: 'derived',
      confidence: 0.8
    };

    expect(mapInsightToNode(userInsight).category).toBe('preferences');
    expect(mapInsightToNode(agentInsight).category).toBe('cases');
    expect(mapInsightToNode(lessonInsight).category).toBe('cases');
    expect(mapInsightToNode(decisionInsight).category).toBe('events');
  });

  it('should store reflection insights without errors', () => {
    const db = createTestDb();
    
    const insights = [{
      text: 'This is a test reflection insight',
      kind: 'decision' as const,
      reflectionKind: 'derived' as const,
      confidence: 0.8
    }];
    
    const result = storeReflectionInsights(
      db,
      insights,
      'test-session',
      DEFAULT_CONFIG
    );
    
    expect(result).toBeDefined();
    expect(typeof result.stored).toBe('number');
    expect(typeof result.boosted).toBe('number');
    
    db.close();
  });

  it('should handle empty insights array', () => {
    const db = createTestDb();
    
    const result = storeReflectionInsights(
      db,
      [],
      'test-session',
      DEFAULT_CONFIG
    );
    
    expect(result).toEqual({ stored: 0, boosted: 0 });
    
    db.close();
  });
});