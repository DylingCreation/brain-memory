/**
 * brain-memory — Compressor coverage补盲
 * v1.6.0 C-2: compressor.ts 56.09% → ≥70%
 * v2.1.0: Migrated tests from createTestDb to createTestStorage (IStorageAdapter).
 */

import { describe, it, expect } from 'vitest';
import { evaluateSessionValue, compressSession } from '../../src/session/compressor';
import { createTestStorage, cleanupTestDb } from '../helpers';

describe('compressSession — full path coverage', () => {
  const mockLlm = (response: string) => async (_sys: string, _user: string): Promise<string> => response;
  const mockLlmThrow = (msg: string) => async (_sys: string, _user: string): Promise<string> => { throw new Error(msg); };

  it('compresses a session with enough messages (success path)', async () => {
    const storage = createTestStorage();
    for (let i = 0; i < 12; i++) {
      storage.saveMessage('long-session', i, i % 2 === 0 ? 'user' : 'assistant', `message content ${i}`);
    }

    const llm = mockLlm('关键决策：完成了压缩测试。代码变更：无。');
    const result = await compressSession(storage, 'long-session', llm);

    expect(result.compressed).toBe(true);
    expect(result.summary).toBeTruthy();
    expect(typeof result.summary).toBe('string');

    // Verify summary node was created
    const node = storage.findNodeByName('session-summary-long-session');
    expect(node).not.toBeNull();

    cleanupTestDb(storage);
  });

  it('handles LLM failure gracefully (error degradation)', async () => {
    const storage = createTestStorage();
    for (let i = 0; i < 12; i++) {
      storage.saveMessage('error-session', i, 'user', `content ${i}`);
    }

    const llm = mockLlmThrow('API timeout');
    const result = await compressSession(storage, 'error-session', llm);

    expect(result.compressed).toBe(false);
    expect(result.summary).toContain('Compression failed');

    cleanupTestDb(storage);
  });

  it('returns early when session has fewer than 10 messages', async () => {
    const storage = createTestStorage();
    for (let i = 0; i < 5; i++) {
      storage.saveMessage('tiny-session', i, 'user', `msg ${i}`);
    }

    const llm = mockLlm('should not be called');
    const result = await compressSession(storage, 'tiny-session', llm);

    expect(result.compressed).toBe(false);
    expect(result.summary).toContain('too short');

    cleanupTestDb(storage);
  });
});

describe('evaluateSessionValue — boundary coverage', () => {
  it('recommends compression for low-value long sessions', () => {
    const storage = createTestStorage();

    for (let i = 0; i < 30; i++) {
      storage.saveMessage('low-value-session', i, 'user', 'just casual chat about nothing important');
    }

    storage.upsertNode({
      type: 'TASK', category: 'tasks', name: 'minor', description: 'desc',
      content: 'content', source: 'user',
    }, 'low-value-session');

    const result = evaluateSessionValue(storage, 'low-value-session');
    expect(result.valueScore).toBeLessThan(0.2);
    expect(result.messageCount).toBeGreaterThan(20);
    expect(result.compressRecommendation).toBe('compress');

    cleanupTestDb(storage);
  });

  it('recommends archive for very low value sessions with many messages', () => {
    const storage = createTestStorage();

    for (let i = 0; i < 55; i++) {
      storage.saveMessage('junk-session', i, 'user', 'ok');
    }

    const result = evaluateSessionValue(storage, 'junk-session');
    expect(result.messageCount).toBeGreaterThan(50);
    expect(result.valueScore).toBeLessThan(0.1);
    expect(result.compressRecommendation).toBe('archive');

    cleanupTestDb(storage);
  });

  it('archive takes priority over compress when condition is met', () => {
    const storage = createTestStorage();

    for (let i = 0; i < 60; i++) {
      storage.saveMessage('priority-session', i, 'user', 'yeah');
    }

    storage.upsertNode({
      type: 'EVENT', category: 'events', name: 'noted', description: 'desc',
      content: 'content', source: 'user',
    }, 'priority-session');

    const result = evaluateSessionValue(storage, 'priority-session');
    expect(result.compressRecommendation).toBe('archive');
    expect(result.compressRecommendation).not.toBe('compress');

    cleanupTestDb(storage);
  });

  it('keeps sessions with high knowledge density', () => {
    const storage = createTestStorage();

    for (let i = 0; i < 5; i++) {
      storage.saveMessage('dense-session', i, 'user', `decision about architecture v${i}`);
    }

    for (let i = 0; i < 3; i++) {
      storage.upsertNode({
        type: 'TASK', category: 'tasks', name: `decision-${i}`,
        description: 'desc', content: 'content', source: 'user',
      }, 'dense-session');
    }

    const result = evaluateSessionValue(storage, 'dense-session');
    expect(result.compressRecommendation).toBe('keep');
    expect(result.valueScore).toBeGreaterThan(0.3);

    cleanupTestDb(storage);
  });
});
