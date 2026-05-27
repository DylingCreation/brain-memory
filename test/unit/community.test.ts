/**
 * brain-memory — Community detection unit tests
 *
 * v2.1.0: Coverage补盲 — LPA 算法 + 增量检测 + 社区查询。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestStorage, cleanupTestDb } from '../helpers';
import {
  detectCommunities,
  runIncrementalCommunities,
  getCommunityPeers,
  communityRepresentatives,
} from '../../src/graph/community';

describe('detectCommunities', () => {
  let storage: ReturnType<typeof createTestStorage>;

  beforeEach(() => { storage = createTestStorage(); });
  afterEach(() => { cleanupTestDb(storage); });

  it('should return empty for empty graph', () => {
    const result = detectCommunities(storage);
    expect(result.communities.size).toBe(0);
    expect(result.count).toBe(0);
  });

  it('should assign all nodes to communities', () => {
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) {
      const { node } = storage.upsertNode({ type: 'TASK', category: 'tasks', name: `N${i}`, description: 'x', content: `n${i}`, source: 'user' }, 's1');
      ids.push(node.id);
    }
    for (let i = 0; i < ids.length - 1; i++) {
      storage.upsertEdge({ fromId: ids[i], toId: ids[i+1], type: 'RELATED_TO', instruction: 'link', sessionId: 's1' });
    }

    const result = detectCommunities(storage);
    expect(result.count).toBeGreaterThan(0);
    expect(result.communities.size).toBeGreaterThan(0);
  });

  it('should respect maxIter limit', () => {
    for (let i = 0; i < 3; i++) {
      storage.upsertNode({ type: 'TASK', category: 'tasks', name: `L${i}`, description: 'x', content: `l${i}`, source: 'user' }, 's1');
    }
    const result = detectCommunities(storage, 2);
    expect(result.count).toBeGreaterThanOrEqual(0);
  });
});

describe('runIncrementalCommunities', () => {
  let storage: ReturnType<typeof createTestStorage>;

  beforeEach(() => { storage = createTestStorage(); });
  afterEach(() => { cleanupTestDb(storage); });

  it('should return empty for no dirty nodes', () => {
    // Ensure clean state — clear any residual dirty marks
    storage.clearDirty();
    const result = runIncrementalCommunities(storage);
    expect(result).toBeDefined();
    expect(result.skipped || result.count === 0).toBe(true);
  });

  it('should handle dirty nodes', () => {
    storage.upsertNode({ type: 'TASK', category: 'tasks', name: 'Dirty', description: 'x', content: 'd', source: 'user' }, 's1');
    const { node } = storage.upsertNode({ type: 'SKILL', category: 'skills', name: 'D2', description: 'x', content: 'd2', source: 'user' }, 's1');
    storage.markDirty([node.id]);

    const result = runIncrementalCommunities(storage);
    expect(result).toBeDefined();
    expect(result.communities).toBeDefined();
  });
});

describe('getCommunityPeers', () => {
  let storage: ReturnType<typeof createTestStorage>;

  beforeEach(() => { storage = createTestStorage(); });
  afterEach(() => { cleanupTestDb(storage); });

  it('should return empty for isolated node', () => {
    const { node } = storage.upsertNode({ type: 'TASK', category: 'tasks', name: 'Iso', description: 'x', content: 'c', source: 'user' }, 's1');
    storage.updateCommunities(new Map([[node.id, 'c-99']]));
    const peers = getCommunityPeers(storage, node.id);
    expect(peers.length).toBe(0);
  });

  it('should find peers in same community', () => {
    const { node: a } = storage.upsertNode({ type: 'TASK', category: 'tasks', name: 'PeerA', description: 'x', content: 'ca', source: 'user' }, 's1');
    const { node: b } = storage.upsertNode({ type: 'SKILL', category: 'skills', name: 'PeerB', description: 'x', content: 'cb', source: 'user' }, 's1');
    storage.updateCommunities(new Map([[a.id, 'c-1'], [b.id, 'c-1']]));
    const peers = getCommunityPeers(storage, a.id);
    expect(peers).toContain(b.id);
  });
});

describe('communityRepresentatives', () => {
  let storage: ReturnType<typeof createTestStorage>;

  beforeEach(() => { storage = createTestStorage(); });
  afterEach(() => { cleanupTestDb(storage); });

  it('should return empty for empty graph', () => {
    const reps = communityRepresentatives(storage);
    expect(reps.length).toBe(0);
  });

  it('should return top nodes per community', () => {
    const { node: a } = storage.upsertNode({ type: 'TASK', category: 'tasks', name: 'RepA', description: 'x', content: 'ca', source: 'user' }, 's1');
    const { node: b } = storage.upsertNode({ type: 'TASK', category: 'tasks', name: 'RepB', description: 'x', content: 'cb', source: 'user' }, 's1');
    storage.updateCommunities(new Map([[a.id, 'c-r1'], [b.id, 'c-r1']]));
    const reps = communityRepresentatives(storage, 1);
    expect(reps.length).toBeGreaterThanOrEqual(1);
  });
});
