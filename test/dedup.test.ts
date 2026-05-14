/**
 * brain-memory — Dedup tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detectDuplicates, dedup } from '../src/graph/dedup';
import { createTestStorage, cleanupTestDb, insertNode, insertVector } from './helpers';
import { DEFAULT_CONFIG } from '../src/types';

let storage: ReturnType<typeof createTestStorage>;
let db: ReturnType<typeof createTestDb>;

beforeEach(() => { storage = createTestStorage(); db = storage.getDb(); });
afterEach(() => { cleanupTestDb(storage); });

const dedupConfig = { ...DEFAULT_CONFIG, dedupThreshold: 0.90 };

describe('detectDuplicates', () => {
  it('should detect duplicate nodes with embeddings', () => {
    const nodeId1 = insertNode(db, { name: 'skill-alpha', content: 'how to use git rebase' });
    const nodeId2 = insertNode(db, { name: 'skill-alpha-clone', content: 'how to use git rebase effectively' });
    
    // Insert similar vectors
    const vec1 = [0.1, 0.2, 0.3, 0.4, 0.5];
    const vec2 = [0.11, 0.19, 0.31, 0.39, 0.51];
    insertVector(db, nodeId1, vec1, 'how to use git rebase');
    insertVector(db, nodeId2, vec2, 'how to use git rebase effectively');
    
    const pairs = detectDuplicates(storage, dedupConfig);
    expect(pairs.length).toBeGreaterThanOrEqual(1);
  });

  it('should return empty array when no vectors exist', () => {
    insertNode(db, { name: 'node-a', content: 'content a' });
    insertNode(db, { name: 'node-b', content: 'content b' });
    
    const pairs = detectDuplicates(storage, dedupConfig);
    expect(pairs.length).toBe(0);
  });
});

describe('dedup', () => {
  it('should run dedup without errors', () => {
    insertNode(db, { name: 'task-x', content: 'do something' });
    
    const result = dedup(storage, dedupConfig);
    expect(result).toBeDefined();
    expect(result.merged).toBeGreaterThanOrEqual(0);
  });
});
