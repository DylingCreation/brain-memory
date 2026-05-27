/**
 * brain-memory — Compressor tests
 *
 * v2.1.0: Migrated from createTestDb to createTestStorage (IStorageAdapter).
 */

import { describe, it, expect } from 'vitest';
import { evaluateSessionValue, compressSession } from '../../src/session/compressor';
import { createTestStorage, cleanupTestDb } from '../helpers';

describe('evaluateSessionValue', () => {
  it('should evaluate session value correctly', () => {
    const storage = createTestStorage();

    storage.saveMessage('test-session', 1, 'user', 'test message');
    storage.upsertNode({
      type: 'TASK', category: 'tasks', name: 'test-node', description: 'desc',
      content: 'content', source: 'user',
    }, 'test-session');

    const result = evaluateSessionValue(storage, 'test-session');

    expect(result).toBeDefined();
    expect(result.sessionId).toBe('test-session');
    expect(typeof result.messageCount).toBe('number');
    expect(typeof result.knowledgeNodes).toBe('number');
    expect(typeof result.knowledgeEdges).toBe('number');
    expect(typeof result.valueScore).toBe('number');
    expect(['keep', 'compress', 'archive']).toContain(result.compressRecommendation);

    cleanupTestDb(storage);
  });

  it('should handle session with no data', () => {
    const storage = createTestStorage();

    const result = evaluateSessionValue(storage, 'nonexistent-session');

    expect(result).toBeDefined();
    expect(result.sessionId).toBe('nonexistent-session');
    expect(result.messageCount).toBe(0);
    expect(result.knowledgeNodes).toBe(0);
    expect(result.knowledgeEdges).toBe(0);
    expect(result.valueScore).toBe(0);
    expect(result.compressRecommendation).toBe('keep');

    cleanupTestDb(storage);
  });
});

describe('compressSession', () => {
  it('should not compress short sessions', async () => {
    const storage = createTestStorage();

    const mockLlm = async (_sys: string, _user: string): Promise<string> => 'Mock summary';

    for (let i = 0; i < 5; i++) {
      storage.saveMessage('short-session', i, 'user', `message ${i}`);
    }

    const result = await compressSession(storage, 'short-session', mockLlm);

    expect(result.compressed).toBe(false);
    expect(result.summary).toContain('too short');

    cleanupTestDb(storage);
  });
});
