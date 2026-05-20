/**
 * brain-memory — RecallCache 单元测试
 * v1.6.0 A-1: LRU 缓存 + 脏标记失效
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RecallCache } from '../src/recaller/cache';
import type { RecallResult, BmNode, BmEdge } from '../src/types';

// ─── Helpers ─────────────────────────────────────────────────

function makeResult(nodes: string[]): RecallResult {
  return {
    nodes: nodes.map((name, i) => ({
      id: `n-${i}`,
      type: 'TASK' as const,
      category: 'tasks',
      name,
      description: '',
      content: '',
      status: 'active' as const,
      validatedCount: 1,
      sourceSessions: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      temporalType: 'dynamic' as const,
    })),
    edges: [] as BmEdge[],
    tokenEstimate: nodes.length * 50,
  };
}

function makeStorage(dirtyCount: number) {
  return {
    getDirtyNodes: () => new Set<string>(Array.from({ length: dirtyCount }, (_, i) => `dirty-${i}`)),
    searchNodes: () => [],
    vectorSearchWithScore: () => [],
    communityVectorSearch: () => [],
    findCommunityPeers: () => [],
    findNodesByCommunities: () => [],
    findCommunityRepresentatives: () => [],
    findAllActive: () => [],
    graphWalk: () => ({ nodes: [], edges: [] }),
    updateAccess: () => {},
    getVectorHash: () => null,
    saveVector: () => {},
  } as any;
}

// ─── Cache Tests ─────────────────────────────────────────────

describe('RecallCache', () => {
  let cache: RecallCache;
  let storage: ReturnType<typeof makeStorage>;

  beforeEach(() => {
    cache = new RecallCache(10, 3600_000); // 10 entries, 1h TTL
    storage = makeStorage(0);
  });

  describe('basic cache operations', () => {
    it('returns null on cache miss', () => {
      expect(cache.get('test query')).toBeNull();
    });

    it('stores and retrieves result', () => {
      const r = makeResult(['alpha', 'beta']);
      cache.set('test query', r);
      const cached = cache.get('test query');
      expect(cached).not.toBeNull();
      expect(cached!.nodes.map(n => n.name)).toEqual(['alpha', 'beta']);
    });

    it('distinguishes by query string', () => {
      cache.set('query A', makeResult(['A1']));
      cache.set('query B', makeResult(['B1', 'B2']));

      expect(cache.get('query A')!.nodes.length).toBe(1);
      expect(cache.get('query B')!.nodes.length).toBe(2);
      expect(cache.get('query C')).toBeNull();
    });
  });

  describe('scope & source filter keying', () => {
    it('distinguishes by scopeFilter', () => {
      cache.set('q', makeResult(['all']));
      cache.set('q', makeResult(['scoped']), { includeScopes: [{ agentId: 'agent-1' }], excludeScopes: [] });

      expect(cache.get('q')!.nodes[0].name).toBe('all');
      expect(cache.get('q', { includeScopes: [{ agentId: 'agent-1' }], excludeScopes: [] })!.nodes[0].name).toBe('scoped');
    });

    it('distinguishes by sourceFilter', () => {
      cache.set('q', makeResult(['both']), undefined, 'both');
      cache.set('q', makeResult(['user']), undefined, 'user');

      expect(cache.get('q', undefined, 'both')!.nodes[0].name).toBe('both');
      expect(cache.get('q', undefined, 'user')!.nodes[0].name).toBe('user');
    });
  });

  describe('LRU eviction', () => {
    it('evicts oldest entry when capacity reached', () => {
      const small = new RecallCache(3, 3600_000);
      small.set('A', makeResult(['A']));
      small.set('B', makeResult(['B']));
      small.set('C', makeResult(['C']));
      small.set('D', makeResult(['D'])); // should evict A

      expect(small.get('A')).toBeNull();
      expect(small.get('B')).not.toBeNull();
      expect(small.get('C')).not.toBeNull();
      expect(small.get('D')).not.toBeNull();
    });

    it('refreshes position on access (get = mark recent)', () => {
      const small = new RecallCache(3, 3600_000);
      small.set('A', makeResult(['A']));
      small.set('B', makeResult(['B']));
      small.set('C', makeResult(['C']));

      // Access A → moves to end of LRU queue
      small.get('A');
      small.set('D', makeResult(['D'])); // should evict B (now oldest)

      expect(small.get('A')).not.toBeNull(); // was refreshed
      expect(small.get('B')).toBeNull();     // was evicted (oldest after A refresh)
    });
  });

  describe('TTL expiry', () => {
    it('expires entries after TTL', () => {
      const shortCache = new RecallCache(10, 10); // 10ms TTL
      shortCache.set('fast', makeResult(['fast']));

      // Wait for TTL
      return new Promise(resolve => {
        setTimeout(() => {
          expect(shortCache.get('fast')).toBeNull();
          resolve(undefined);
        }, 20);
      });
    });
  });

  describe('invalidation', () => {
    it('clears all cache entries', () => {
      cache.set('A', makeResult(['A']));
      cache.set('B', makeResult(['B']));
      expect(cache.getStats().size).toBe(2);

      cache.invalidate();
      expect(cache.getStats().size).toBe(0);
      expect(cache.get('A')).toBeNull();
    });
  });

  describe('dirty mark validation', () => {
    it('marks as invalid when dirty nodes exist', () => {
      const dirtyStorage = makeStorage(3);
      expect(cache.isValid(dirtyStorage)).toBe(false);
    });

    it('marks as valid when no dirty nodes', () => {
      expect(cache.isValid(storage)).toBe(true);
    });
  });

  describe('diagnostics', () => {
    it('reports cache stats', () => {
      cache.set('A', makeResult(['A1', 'A2']));
      const stats = cache.getStats();
      expect(stats.size).toBe(1);
      expect(stats.maxSize).toBe(10);
    });

    it('pruneExpired removes TTL-expired entries', () => {
      const shortCache = new RecallCache(10, 1); // 1ms TTL
      shortCache.set('X', makeResult(['X']));
      return new Promise(resolve => {
        setTimeout(() => {
          shortCache.pruneExpired();
          expect(shortCache.getStats().size).toBe(0);
          resolve(undefined);
        }, 5);
      });
    });
  });
});
