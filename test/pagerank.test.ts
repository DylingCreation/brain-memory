/**
 * brain-memory — Pagerank tests
 */

import { describe, it, expect } from 'vitest';
import { personalizedPageRank } from '../src/graph/pagerank';
import { createTestDb, insertNode, insertEdge } from './helpers';
import { DEFAULT_CONFIG } from '../src/types';

// Use DEFAULT_CONFIG which already includes required PageRank properties
const pagerankConfig = DEFAULT_CONFIG;

describe('personalizedPageRank', () => {
  it('should compute pagerank scores', () => {
    const db = createTestDb();
    
    // Create test nodes
    const nodeId1 = insertNode(db, { name: 'node1', content: 'content1' });
    const nodeId2 = insertNode(db, { name: 'node2', content: 'content2' });
    const nodeId3 = insertNode(db, { name: 'node3', content: 'content3' });
    
    // Create test edges
    insertEdge(db, { fromId: nodeId1, toId: nodeId2, type: 'RELATED' });
    insertEdge(db, { fromId: nodeId2, toId: nodeId3, type: 'RELATED' });
    insertEdge(db, { fromId: nodeId3, toId: nodeId1, type: 'RELATED' });
    
    // Compute PageRank
    const allNodeIds = [nodeId1, nodeId2, nodeId3];
    const result = personalizedPageRank(db, [nodeId1], allNodeIds, pagerankConfig);
    const scores = result.scores;
    
    expect(scores).toBeDefined();
    expect(scores instanceof Map).toBe(true);
    expect(scores.size).toBeGreaterThan(0);
    
    // Check that we have scores for our nodes
    expect(scores.has(nodeId1)).toBe(true);
    expect(scores.has(nodeId2)).toBe(true);
    expect(scores.has(nodeId3)).toBe(true);
    
    // Check that scores are reasonable (between 0 and 1)
    for (const [id, score] of scores) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
    
    db.close();
  });

  it('should handle single node with no edges', () => {
    const db = createTestDb();
    
    // Create a single node with no edges
    const nodeId = insertNode(db, { name: 'isolated-node', content: 'content' });
    
    // For single node, we pass it as both seed and candidate
    const result = personalizedPageRank(db, [nodeId], [nodeId], pagerankConfig);
    const scores = result.scores;
    
    expect(scores).toBeDefined();
    expect(scores instanceof Map).toBe(true);
    // With no connections, the node may or may not be in results, but function should not fail
    // At minimum, we check that the function executed without errors
    expect(result).toBeDefined();
    
    db.close();
  });

  it('should handle empty graph', () => {
    const db = createTestDb();
    
    const result = personalizedPageRank(db, [], [], pagerankConfig);
    const scores = result.scores;
    
    expect(scores).toBeDefined();
    expect(scores instanceof Map).toBe(true);
    expect(scores.size).toBe(0);
    
    db.close();
  });
});