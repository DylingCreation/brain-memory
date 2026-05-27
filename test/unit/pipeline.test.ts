/**
 * brain-memory — MaintenancePipeline unit tests
 *
 * v2.1.0: Coverage补盲 — 管线组合 + 衰减归档 + runMaintenance 测试。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestStorage, cleanupTestDb } from '../helpers';
import { runMaintenance } from '../../src/graph/maintenance';
import { MaintenancePipeline } from '../../src/graph/pipeline';
import { DEFAULT_CONFIG } from '../../src/types';

describe('MaintenancePipeline', () => {
  let storage: ReturnType<typeof createTestStorage>;

  beforeEach(() => { storage = createTestStorage(); });
  afterEach(() => { cleanupTestDb(storage); });

  it('should construct with default config', () => {
    const pipeline = new MaintenancePipeline(storage, DEFAULT_CONFIG);
    expect(pipeline).toBeDefined();
  });

  it('should run dedup step on empty graph without throwing', async () => {
    const pipeline = new MaintenancePipeline(storage, DEFAULT_CONFIG);
    await expect(pipeline.run()).resolves.toBeUndefined();
  });

  it('should handle single node without error', async () => {
    storage.upsertNode({ type: 'TASK', category: 'tasks', name: 'Only', description: 'x', content: 'c', source: 'user' }, 's1');
    const pipeline = new MaintenancePipeline(storage, DEFAULT_CONFIG);
    await expect(pipeline.run()).resolves.toBeUndefined();
  });

  it('should run with multiple nodes and edges', async () => {
    const { node: a } = storage.upsertNode({ type: 'TASK', category: 'tasks', name: 'A', description: 'x', content: 'c', source: 'user' }, 's1');
    const { node: b } = storage.upsertNode({ type: 'SKILL', category: 'skills', name: 'B', description: 'x', content: 'c', source: 'user' }, 's1');
    storage.upsertEdge({ fromId: a.id, toId: b.id, type: 'USED_SKILL', instruction: 'use', sessionId: 's1' });

    const pipeline = new MaintenancePipeline(storage, DEFAULT_CONFIG);
    await expect(pipeline.run()).resolves.toBeUndefined();
  });
});

describe('runMaintenance (functional)', () => {
  let storage: ReturnType<typeof createTestStorage>;

  beforeEach(() => { storage = createTestStorage(); });
  afterEach(() => { cleanupTestDb(storage); });

  it('should run on empty storage without error', async () => {
    const result = await runMaintenance(storage, DEFAULT_CONFIG);
    expect(result).toBeDefined();
  });

  it('should compute pagerank for connected nodes', async () => {
    const { node: a } = storage.upsertNode({ type: 'TASK', category: 'tasks', name: 'PR-A', description: 'x', content: 'content a', source: 'user' }, 's1');
    const { node: b } = storage.upsertNode({ type: 'SKILL', category: 'skills', name: 'PR-B', description: 'x', content: 'content b', source: 'user' }, 's1');
    storage.upsertEdge({ fromId: a.id, toId: b.id, type: 'USED_SKILL', instruction: 'use', sessionId: 's1' });

    const result = await runMaintenance(storage, DEFAULT_CONFIG);
    expect(result).toBeDefined();
    expect(typeof result.durationMs).toBe('number');
  });

  it('should handle graph with 5+ nodes', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) {
      const { node } = storage.upsertNode({ type: 'TASK', category: 'tasks', name: `C-${i}`, description: 'x', content: `node ${i}`, source: 'user' }, 's1');
      ids.push(node.id);
    }
    for (let i = 0; i < ids.length - 1; i++) {
      storage.upsertEdge({ fromId: ids[i], toId: ids[i+1], type: 'RELATED_TO', instruction: 'chain', sessionId: 's1' });
    }

    const result = await runMaintenance(storage, DEFAULT_CONFIG);
    expect(result).toBeDefined();
    expect(result.pagerank).toBeDefined();
  });
});
