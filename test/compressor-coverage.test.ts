/**
 * brain-memory — Compressor coverage补盲
 * v1.6.0 C-2: compressor.ts 56.09% → ≥70%
 *
 * 盲区：compressSession() 的 LLM 调用路径 + error handling
 */

import { describe, it, expect } from 'vitest';
import { evaluateSessionValue, compressSession } from '../src/session/compressor';
import { createTestDb } from './helpers';

describe('compressSession — full path coverage', () => {
  // Helper: create a mock LLM that returns the given string
  const mockLlm = (response: string) => async (_sys: string, _user: string): Promise<string> => response;

  // Helper: create a mock LLM that throws
  const mockLlmThrow = (msg: string) => async (_sys: string, _user: string): Promise<string> => {
    throw new Error(msg);
  };

  it('compresses a session with enough messages (success path)', async () => {
    const db = createTestDb();

    // Insert 10+ messages (enough to trigger compression)
    for (let i = 0; i < 12; i++) {
      db.prepare(
        'INSERT INTO bm_messages (id, session_id, turn_index, role, content, extracted, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(`msg${i}`, 'long-session', i, i % 2 === 0 ? 'user' : 'assistant', `message content ${i}`, 1, Date.now());
    }

    const llm = mockLlm('关键决策：完成了压缩测试。代码变更：无。');

    const result = await compressSession(db, 'long-session', llm);

    expect(result.compressed).toBe(true);
    expect(result.summary).toBeTruthy();
    expect(typeof result.summary).toBe('string');

    // Verify summary node was created
    const nodes = db.prepare('SELECT id, type, content FROM bm_nodes WHERE id = ?')
      .all('session-summary-long-session') as Array<Record<string, unknown>>;
    expect(nodes.length).toBeGreaterThanOrEqual(1);

    // Verify messages were marked as compressed
    const msgs = db.prepare('SELECT extracted FROM bm_messages WHERE session_id = ? AND extracted = 2')
      .all('long-session') as Array<Record<string, unknown>>;
    expect(msgs.length).toBeGreaterThan(0);

    db.close();
  });

  it('handles LLM failure gracefully (error degradation)', async () => {
    const db = createTestDb();

    for (let i = 0; i < 12; i++) {
      db.prepare(
        'INSERT INTO bm_messages (id, session_id, turn_index, role, content, extracted, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(`msg${i}`, 'error-session', i, 'user', `content ${i}`, 1, Date.now());
    }

    const llm = mockLlmThrow('API timeout');

    const result = await compressSession(db, 'error-session', llm);

    expect(result.compressed).toBe(false);
    expect(result.summary).toContain('Compression failed');

    db.close();
  });

  it('returns early when session has fewer than 10 messages', async () => {
    const db = createTestDb();

    for (let i = 0; i < 5; i++) {
      db.prepare(
        'INSERT INTO bm_messages (id, session_id, turn_index, role, content, extracted, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(`msg${i}`, 'tiny-session', i, 'user', `msg ${i}`, 1, Date.now());
    }

    const llm = mockLlm('should not be called');
    const result = await compressSession(db, 'tiny-session', llm);

    expect(result.compressed).toBe(false);
    expect(result.summary).toContain('too short');

    db.close();
  });
});

describe('evaluateSessionValue — boundary coverage', () => {
  it('recommends compression for low-value long sessions', () => {
    const db = createTestDb();

    // Insert 30 messages (long) but only 1 knowledge node (low value)
    for (let i = 0; i < 30; i++) {
      db.prepare(
        'INSERT INTO bm_messages (id, session_id, turn_index, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(`msg${i}`, 'low-value-session', i, 'user', 'just casual chat about nothing important', Date.now());
    }

    // Low knowledge: 1 node
    db.prepare(
      'INSERT INTO bm_nodes (id, type, category, name, description, content, status, validated_count, source_sessions, created_at, updated_at, temporal_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run('node-low', 'TASK', 'tasks', 'minor', 'desc', 'content', 'active', 1, '["low-value-session"]', Date.now(), Date.now(), 'static');

    const result = evaluateSessionValue(db, 'low-value-session');

    expect(result.valueScore).toBeLessThan(0.2);
    expect(result.messageCount).toBeGreaterThan(20);
    expect(result.compressRecommendation).toBe('compress');

    db.close();
  });

  it('keeps sessions with high knowledge density', () => {
    const db = createTestDb();

    // Insert 5 messages with 3 knowledge nodes (high density)
    for (let i = 0; i < 5; i++) {
      db.prepare(
        'INSERT INTO bm_messages (id, session_id, turn_index, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(`msg${i}`, 'dense-session', i, 'user', `decision about architecture v${i}`, Date.now());
    }

    for (let i = 0; i < 3; i++) {
      db.prepare(
        'INSERT INTO bm_nodes (id, type, category, name, description, content, status, validated_count, source_sessions, created_at, updated_at, temporal_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(`node-dense-${i}`, 'TASK', 'tasks', `decision-${i}`, 'desc', 'content', 'active', 1, '["dense-session"]', Date.now(), Date.now(), 'static');
    }

    const result = evaluateSessionValue(db, 'dense-session');

    expect(result.compressRecommendation).toBe('keep');
    expect(result.valueScore).toBeGreaterThan(0.3);

    db.close();
  });
});
