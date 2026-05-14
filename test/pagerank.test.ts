/**
 * brain-memory — Pagerank tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { personalizedPageRank, invalidateGraphCache } from '../src/graph/pagerank';
import { createTestStorage, cleanupTestDb, createTestDb, insertNode, insertEdge } from './helpers';
import { DEFAULT_CONFIG } from '../src/types';

let storage: ReturnType<typeof createTestStorage>;
let db: ReturnType<typeof createTestDb>;

beforeEach(() => { storage = createTestStorage(); db = storage.getDb(); invalidateGraphCache(); });
afterEach(() => { cleanupTestDb(storage); });

// Use DEFAULT_CONFIG which already includes required PageRank properties
const pagerankConfig = DEFAULT_CONFIG;

describe('personalizedPageRank', () => {
  it('should compute pagerank scores', () => {
    // Create test nodes
    const nodeId1 = insertNode(db, { name: 'node1', content: 'content1' });
    const nodeId2 = insertNode(db, { name: 'node2', content: 'content2' });
    const nodeId3 = insertNode(db, { name: 'node3', content: 'content3' });
    
    // Create test edges
    insertEdge(db, { fromId: nodeId1, toId: nodeId2, type: 'USED_SKILL' });
    insertEdge(db, { fromId: nodeId2, toId: nodeId3, type: 'USED_SKILL' });
    insertEdge(db, { fromId: nodeId3, toId: nodeId1, type: 'USED_SKILL' });
    
    // Compute PageRank
    const allNodeIds = [nodeId1, nodeId2, nodeId3];
    const result = personalizedPageRank(storage, [nodeId1], allNodeIds, pagerankConfig);
    const scores = result.scores;
    
    // Check that all nodes have scores
    expect(scores.get(nodeId1)).toBeDefined();
    expect(scores.get(nodeId2)).toBeDefined();
    expect(scores.get(nodeId3)).toBeDefined();
    
    // Check that scores sum approximately to 1
    const total = Array.from(scores.values()).reduce((s, v) => s + v, 0);
    expect(total).toBeGreaterThan(0.9);
    expect(total).toBeLessThan(1.1);
  });

  it('should handle single node with no edges', () => {
    const nodeId = insertNode(db, { name: 'lonely', content: 'alone' });
    
    const result = personalizedPageRank(storage, [nodeId], [nodeId], pagerankConfig);
    expect(result.scores.size).toBeGreaterThan(0);
    expect(result.scores.has(nodeId)).toBe(true);
    const score = result.scores.get(nodeId);
    expect(score).toBeDefined();
    expect(typeof score).toBe('number');
    expect(score).toBeGreaterThan(0);
  });

  it('should handle empty graph', () => {
    const result = personalizedPageRank(storage, [], [], pagerankConfig);
    expect(result.scores.size).toBe(0);
  });
});
