/**
 * brain-memory — Deduplication tests
 */

import { describe, it, expect } from 'vitest';
import { detectDuplicates, dedup } from '../src/graph/dedup';
import { createTestDb, insertNode, insertVector } from './helpers';
import { DEFAULT_CONFIG } from '../src/types';

describe('detectDuplicates', () => {
  it('should detect duplicate nodes with embeddings', () => {
    const db = createTestDb();
    
    // Create nodes with similar embeddings
    const nodeId1 = insertNode(db, { name: 'similar-node-1', content: 'content1' });
    const nodeId2 = insertNode(db, { name: 'similar-node-2', content: 'content2' });
    const nodeId3 = insertNode(db, { name: 'different-node', content: 'completely different content' });
    
    // Add similar embeddings
    insertVector(db, nodeId1, [0.8, 0.2, 0.1], 'content1');
    insertVector(db, nodeId2, [0.75, 0.25, 0.15], 'content2');  // Very similar to node1
    insertVector(db, nodeId3, [0.1, 0.9, 0.8], 'completely different content');  // Different
    
    const pairs = detectDuplicates(db, DEFAULT_CONFIG);
    
    expect(pairs).toBeDefined();
    expect(Array.isArray(pairs)).toBe(true);
    
    // At least one pair should be detected between similar nodes
    const foundPair = pairs.some(p => 
      (p.nodeA === nodeId1 && p.nodeB === nodeId2) || 
      (p.nodeA === nodeId2 && p.nodeB === nodeId1)
    );
    
    expect(foundPair).toBe(true);
    
    db.close();
  });

  it('should return empty array when no vectors exist', () => {
    const db = createTestDb();
    
    // Create nodes without embeddings
    const nodeId1 = insertNode(db, { name: 'node1', content: 'content1' });
    const nodeId2 = insertNode(db, { name: 'node2', content: 'content2' });
    
    const pairs = detectDuplicates(db, DEFAULT_CONFIG);
    
    expect(pairs).toBeDefined();
    expect(pairs).toEqual([]);
    
    db.close();
  });
});

describe('dedup', () => {
  it('should run dedup without errors', () => {
    const db = createTestDb();
    
    // Create nodes with embeddings
    const nodeId1 = insertNode(db, { name: 'dedup-node1', content: 'content1' });
    const nodeId2 = insertNode(db, { name: 'dedup-node2', content: 'content2' });
    
    insertVector(db, nodeId1, [0.8, 0.2, 0.1], 'content1');
    insertVector(db, nodeId2, [0.75, 0.25, 0.15], 'content2');
    
    const result = dedup(db, DEFAULT_CONFIG);
    
    expect(result).toBeDefined();
    expect(typeof result.merged).toBe('number');
    expect(Array.isArray(result.pairs)).toBe(true);
    
    db.close();
  });
});