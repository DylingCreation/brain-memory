/**
 * brain-memory — Compressor tests
 */

import { describe, it, expect } from 'vitest';
import { evaluateSessionValue, compressSession } from '../src/session/compressor';
import { createTestDb } from './helpers';

describe('evaluateSessionValue', () => {
  it('should evaluate session value correctly', () => {
    const db = createTestDb();
    
    // Insert test session data
    db.prepare('INSERT INTO bm_messages (id, session_id, turn_index, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run('msg1', 'test-session', 1, 'user', 'test message', Date.now());
    
    db.prepare('INSERT INTO bm_nodes (id, type, category, name, description, content, status, validated_count, source_sessions, created_at, updated_at, temporal_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run('node1', 'TASK', 'tasks', 'test-node', 'desc', 'content', 'active', 1, '["test-session"]', Date.now(), Date.now(), 'static');
    
    db.prepare('INSERT INTO bm_edges (id, from_id, to_id, type, instruction, session_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('edge1', 'node1', 'node1', 'REQUIRES', 'instruction', 'test-session', Date.now());

    const result = evaluateSessionValue(db, 'test-session');
    
    expect(result).toBeDefined();
    expect(result.sessionId).toBe('test-session');
    expect(typeof result.messageCount).toBe('number');
    expect(typeof result.knowledgeNodes).toBe('number');
    expect(typeof result.knowledgeEdges).toBe('number');
    expect(typeof result.valueScore).toBe('number');
    expect(['keep', 'compress', 'archive']).toContain(result.compressRecommendation);
    
    db.close();
  });

  it('should handle session with no data', () => {
    const db = createTestDb();
    
    const result = evaluateSessionValue(db, 'nonexistent-session');
    
    expect(result).toBeDefined();
    expect(result.sessionId).toBe('nonexistent-session');
    expect(result.messageCount).toBe(0);
    expect(result.knowledgeNodes).toBe(0);
    expect(result.knowledgeEdges).toBe(0);
    expect(result.valueScore).toBe(0);
    expect(result.compressRecommendation).toBe('keep');
    
    db.close();
  });
});

describe('compressSession', () => {
  it('should not compress short sessions', async () => {
    const db = createTestDb();
    
    // Mock LLM function
    const mockLlm = async (_sys: string, _user: string): Promise<string> => {
      return "Mock summary";
    };
    
    // Insert a short session (less than 10 messages)
    for (let i = 0; i < 5; i++) {
      db.prepare('INSERT INTO bm_messages (id, session_id, turn_index, role, content, extracted, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(`msg${i}`, 'short-session', i, 'user', `message ${i}`, 0, Date.now());
    }
    
    const config = {
      dbPath: ':memory:',
      // Add other necessary config fields
    } as any;
    
    const result = await compressSession(db, 'short-session', mockLlm, config);
    
    expect(result.compressed).toBe(false);
    expect(result.summary).toContain('too short');
    
    db.close();
  });
});