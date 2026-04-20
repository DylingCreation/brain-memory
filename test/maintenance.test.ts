/**
 * brain-memory — Maintenance tests
 */

import { describe, it, expect } from 'vitest';
import { runMaintenance } from '../src/graph/maintenance';
import { createTestDb, insertNode, insertEdge } from './helpers';
import { DEFAULT_CONFIG } from '../src/types';

describe('runMaintenance', () => {
  it('should run maintenance without errors', async () => {
    const db = createTestDb();
    
    // Create test nodes
    const nodeId1 = insertNode(db, { name: 'maint-node1', content: 'content1' });
    const nodeId2 = insertNode(db, { name: 'maint-node2', content: 'content2' });
    
    // Create test edges
    insertEdge(db, { fromId: nodeId1, toId: nodeId2, type: 'RELATED' });
    
    // Run maintenance
    await runMaintenance(db, DEFAULT_CONFIG);
    
    // Basic expectation - it should not throw
    expect(true).toBe(true);
    
    db.close();
  });

  it('should handle empty database', async () => {
    const db = createTestDb();
    
    // Run maintenance on empty database
    await runMaintenance(db, DEFAULT_CONFIG);
    
    // Basic expectation - it should not throw
    expect(true).toBe(true);
    
    db.close();
  });
});