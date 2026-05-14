/**
 * brain-memory — Maintenance tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runMaintenance } from '../src/graph/maintenance';
import { createTestStorage, cleanupTestDb, insertNode, insertEdge } from './helpers';
import { DEFAULT_CONFIG } from '../src/types';

let storage: ReturnType<typeof createTestStorage>;
let db: ReturnType<typeof createTestDb>;

beforeEach(() => { storage = createTestStorage(); db = storage.getDb(); });
afterEach(() => { cleanupTestDb(storage); });

describe('runMaintenance', () => {
  it('should run maintenance without errors', async () => {
    const nodeId1 = insertNode(db, { name: 'maint-node1', content: 'content1' });
    const nodeId2 = insertNode(db, { name: 'maint-node2', content: 'content2' });
    insertEdge(db, { fromId: nodeId1, toId: nodeId2, type: 'USED_SKILL' });
    
    const result = await runMaintenance(storage, DEFAULT_CONFIG);
    expect(result).toBeDefined();
  });

  it('should handle empty database', async () => {
    const result = await runMaintenance(storage, DEFAULT_CONFIG);
    expect(result).toBeDefined();
    expect(result.dedup.merged).toBe(0);
  });
});
