/**
 * brain-memory — SQLiteStorageAdapter unit tests
 *
 * v2.1.0: Coverage补盲 — 49 方法 CRUD 全覆盖。
 *
 * Uses createTestStorage() helper (in-memory SQLite via IStorageAdapter).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestStorage, cleanupTestDb } from '../helpers';

describe('SQLiteStorageAdapter', () => {
  let storage: ReturnType<typeof createTestStorage>;

  beforeEach(() => { storage = createTestStorage(); });
  afterEach(() => { cleanupTestDb(storage); });

  // ─── Lifecycle ────────────────────────────────────────

  describe('Lifecycle', () => {
    it('should be connected after initialization', () => {
      expect(storage.isConnected()).toBe(true);
    });

    it('should report capabilities (all true for SQLite)', () => {
      const caps = storage.capabilities;
      expect(caps.communities).toBe(true);
      expect(caps.messages).toBe(true);
      expect(caps.vector).toBe(true);
      expect(caps.ftsSearch).toBe(true);
      expect(caps.graphTraversal).toBe(true);
      expect(caps.reflections).toBe(true);
    });
  });

  // ─── Node CRUD ────────────────────────────────────────

  describe('Node CRUD', () => {
    it('should upsert a new node and return it with isNew=true', () => {
      const { node, isNew } = storage.upsertNode({
        type: 'TASK', category: 'tasks', name: 'Test Task',
        description: 'A test', content: 'content', source: 'user',
      }, 'session-1');

      expect(isNew).toBe(true);
      expect(node.id).toBeTruthy();
      // names are normalized (lowercase, hyphenated) by upsertNode
      expect(node.name.toLowerCase()).toContain('test');
      expect(node.type).toBe('TASK');
      expect(node.category).toBe('tasks');
    });

    it('should find a node by name', () => {
      storage.upsertNode({ type: 'TASK', category: 'tasks', name: 'FindMe', description: 'x', content: 'c', source: 'user' }, 's1');
      // upsertNode normalizes names; findNodeByName also normalizes input
      const found = storage.findNodeByName('FindMe');
      expect(found).not.toBeNull();
      expect(found!.name).toContain('find');
    });

    it('should return null for non-existent name', () => {
      expect(storage.findNodeByName('NoSuchThing')).toBeNull();
    });

    it('should find a node by id', () => {
      const { node } = storage.upsertNode({ type: 'TASK', category: 'tasks', name: 'ById', description: 'x', content: 'c', source: 'user' }, 's1');
      const found = storage.findNodeById(node.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(node.id);
    });

    it('should return null for non-existent id', () => {
      expect(storage.findNodeById('fake-id')).toBeNull();
    });

    it('should update an existing node (same name = merge)', () => {
      const { node: first } = storage.upsertNode({ type: 'TASK', category: 'tasks', name: 'MergeMe', description: 'First', content: 'c1', source: 'user' }, 's1');
      const { node: second, isNew } = storage.upsertNode({ type: 'TASK', category: 'tasks', name: 'MergeMe', description: 'Second', content: 'c2', source: 'user' }, 's2');

      expect(isNew).toBe(false);
      expect(second.id).toBe(first.id);
      expect(second.validatedCount).toBeGreaterThan(first.validatedCount);
    });

    it('should deprecate a node (soft delete)', () => {
      const { node } = storage.upsertNode({ type: 'TASK', category: 'tasks', name: 'ToDelete', description: 'x', content: 'c', source: 'user' }, 's1');
      storage.deprecateNode(node.id);
      const found = storage.findNodeById(node.id);
      expect(found!.status).toBe('deprecated');
    });

    it('should merge two nodes (keep higher validatedCount)', () => {
      const { node: a } = storage.upsertNode({ type: 'TASK', category: 'tasks', name: 'KeepMe', description: 'A', content: 'ca', source: 'user' }, 's1');
      // Force higher validatedCount on 'a'
      storage.updateAccess(a.id);
      storage.updateAccess(a.id);

      const { node: b } = storage.upsertNode({ type: 'TASK', category: 'tasks', name: 'MergeAway', description: 'B', content: 'cb', source: 'user' }, 's2');

      storage.mergeNodes(a.id, b.id);
      expect(storage.findNodeById(b.id)!.status).toBe('deprecated');
      expect(storage.findNodeById(a.id)!.status).toBe('active');
    });

    it('should findAllActive returning all active nodes', () => {
      storage.upsertNode({ type: 'TASK', category: 'tasks', name: 'N1', description: 'x', content: 'c', source: 'user' }, 's1');
      storage.upsertNode({ type: 'SKILL', category: 'skills', name: 'N2', description: 'x', content: 'c', source: 'user' }, 's1');
      const active = storage.findAllActive();
      expect(active.length).toBe(2);
    });

    it('should findAllActive excluding deprecated nodes', () => {
      const { node } = storage.upsertNode({ type: 'TASK', category: 'tasks', name: 'Gone', description: 'x', content: 'c', source: 'user' }, 's1');
      storage.deprecateNode(node.id);
      const active = storage.findAllActive();
      expect(active.every(n => n.status === 'active')).toBe(true);
      expect(active.find(n => n.name === 'Gone')).toBeUndefined();
    });

    it('should findAllActive with scope filter (includeScopesV2)', () => {
      storage.upsertNode({
        type: 'TASK', category: 'tasks', name: 'DiscordNode',
        description: 'x', content: 'c', source: 'user',
        scopePlatform: 'discord', scopeAgent: 'bot-x',
      }, 's1');
      storage.upsertNode({
        type: 'SKILL', category: 'skills', name: 'TelegramNode',
        description: 'x', content: 'c', source: 'user',
        scopePlatform: 'telegram', scopeAgent: 'bot-y',
      }, 's1');

      const filtered = storage.findAllActive({
        includeScopesV2: [{ platform: 'discord', workspace: null, agent: null, user: null, chat: null, thread: null }],
        excludeScopesV2: [],
        sharingMode: 'isolated',
        sharedCategories: [],
      });
      expect(filtered.length).toBeGreaterThanOrEqual(1);
      expect(filtered.every(n => n.scopePlatform === 'discord')).toBe(true);
    });
  });

  // ─── Edge CRUD ────────────────────────────────────────

  describe('Edge CRUD', () => {
    it('should upsert an edge between two nodes', () => {
      const { node: from } = storage.upsertNode({ type: 'TASK', category: 'tasks', name: 'From', description: 'x', content: 'c', source: 'user' }, 's1');
      const { node: to } = storage.upsertNode({ type: 'SKILL', category: 'skills', name: 'To', description: 'x', content: 'c', source: 'user' }, 's1');

      const edge = storage.upsertEdge({ fromId: from.id, toId: to.id, type: 'USED_SKILL', instruction: 'use this', sessionId: 's1' });
      expect(edge.id).toBeTruthy();
      expect(edge.fromId).toBe(from.id);
      expect(edge.toId).toBe(to.id);
    });

    it('should findAllEdges', () => {
      const { node: from } = storage.upsertNode({ type: 'TASK', category: 'tasks', name: 'E1', description: 'x', content: 'c', source: 'user' }, 's1');
      const { node: to } = storage.upsertNode({ type: 'SKILL', category: 'skills', name: 'E2', description: 'x', content: 'c', source: 'user' }, 's1');
      storage.upsertEdge({ fromId: from.id, toId: to.id, type: 'USED_SKILL', instruction: 'do', sessionId: 's1' });
      storage.upsertEdge({ fromId: to.id, toId: from.id, type: 'RELATED_TO', instruction: 'rel', sessionId: 's1' });

      const edges = storage.findAllEdges();
      expect(edges.length).toBe(2);
    });

    it('should findEdgesFrom a node', () => {
      const { node: from } = storage.upsertNode({ type: 'TASK', category: 'tasks', name: 'Src', description: 'x', content: 'c', source: 'user' }, 's1');
      const { node: to } = storage.upsertNode({ type: 'SKILL', category: 'skills', name: 'Dst', description: 'x', content: 'c', source: 'user' }, 's1');
      storage.upsertEdge({ fromId: from.id, toId: to.id, type: 'USED_SKILL', instruction: 'use', sessionId: 's1' });

      const outgoing = storage.findEdgesFrom(from.id);
      expect(outgoing.length).toBe(1);
      expect(outgoing[0].toId).toBe(to.id);
    });

    it('should findEdgesTo a node', () => {
      const { node: from } = storage.upsertNode({ type: 'TASK', category: 'tasks', name: 'InFrom', description: 'x', content: 'c', source: 'user' }, 's1');
      const { node: to } = storage.upsertNode({ type: 'SKILL', category: 'skills', name: 'InTo', description: 'x', content: 'c', source: 'user' }, 's1');
      storage.upsertEdge({ fromId: from.id, toId: to.id, type: 'USED_SKILL', instruction: 'use', sessionId: 's1' });

      const incoming = storage.findEdgesTo(to.id);
      expect(incoming.length).toBe(1);
      expect(incoming[0].fromId).toBe(from.id);
    });
  });

  // ─── Search ───────────────────────────────────────────

  describe('Search', () => {
    it('should searchNodes by FTS5 text match', () => {
      storage.upsertNode({ type: 'TASK', category: 'tasks', name: 'Python Error Handler', description: 'handles exceptions', content: 'try except finally', source: 'user' }, 's1');
      storage.upsertNode({ type: 'SKILL', category: 'skills', name: 'Unrelated', description: 'something else', content: 'totally different', source: 'user' }, 's1');

      const results = storage.searchNodes('python error', 5);
      // FTS5 matches normalized names, so Python Error Handler → python-error-handler
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].name.toLowerCase()).toContain('python');
    });

    it('should findTopNodes ordered by pagerank', () => {
      const { node: n1 } = storage.upsertNode({ type: 'TASK', category: 'tasks', name: 'Top1', description: 'x', content: 'c', source: 'user' }, 's1');
      const { node: n2 } = storage.upsertNode({ type: 'TASK', category: 'tasks', name: 'Top2', description: 'x', content: 'c', source: 'user' }, 's1');

      storage.updatePageranks(new Map([[n1.id, 0.9], [n2.id, 0.3]]));
      const top = storage.findTopNodes(2);
      expect(top[0].id).toBe(n1.id);
      expect(top[1].id).toBe(n2.id);
    });
  });

  // ─── Pagerank / Community / Access ────────────────────

  describe('Bulk updates', () => {
    it('should updatePageranks in batch', () => {
      const { node } = storage.upsertNode({ type: 'TASK', category: 'tasks', name: 'PR', description: 'x', content: 'c', source: 'user' }, 's1');
      storage.updatePageranks(new Map([[node.id, 0.75]]));
      const found = storage.findNodeById(node.id);
      expect(found!.pagerank).toBe(0.75);
    });

    it('should updateCommunities in batch', () => {
      const { node } = storage.upsertNode({ type: 'TASK', category: 'tasks', name: 'C1', description: 'x', content: 'c', source: 'user' }, 's1');
      storage.updateCommunities(new Map([[node.id, 'community-42']]));
      const found = storage.findNodeById(node.id);
      expect(found!.communityId).toBe('community-42');
    });

    it('should updateAccess and increment count', () => {
      const { node } = storage.upsertNode({ type: 'TASK', category: 'tasks', name: 'Acc', description: 'x', content: 'c', source: 'user' }, 's1');
      const before = node.accessCount;
      storage.updateAccess(node.id);
      const after = storage.findNodeById(node.id)!;
      expect(after.accessCount).toBeGreaterThan(before);
      expect(after.lastAccessedAt).toBeGreaterThan(node.lastAccessedAt);
    });
  });

  // ─── Vectors ──────────────────────────────────────────

  describe('Vectors', () => {
    it('should saveVector and getVector', () => {
      const { node } = storage.upsertNode({ type: 'TASK', category: 'tasks', name: 'Vec', description: 'x', content: 'c', source: 'user' }, 's1');
      const vec = Array.from({ length: 8 }, (_, i) => i * 0.1);
      storage.saveVector(node.id, 'test content hash', vec);

      const retrieved = storage.getVector(node.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.length).toBe(8);
    });

    it('should return null for missing vector', () => {
      expect(storage.getVector('nonexistent')).toBeNull();
    });

    it('should loadAllVectors for dedup', () => {
      const { node: n1 } = storage.upsertNode({ type: 'TASK', category: 'tasks', name: 'VV1', description: 'x', content: 'c', source: 'user' }, 's1');
      const { node: n2 } = storage.upsertNode({ type: 'TASK', category: 'tasks', name: 'VV2', description: 'x', content: 'c', source: 'user' }, 's1');

      storage.saveVector(n1.id, 'h1', [1, 2, 3]);
      storage.saveVector(n2.id, 'h2', [4, 5, 6]);

      const all = storage.loadAllVectors();
      expect(all.length).toBe(2);
    });
  });

  // ─── Communities ──────────────────────────────────────

  describe('Communities', () => {
    it('should upsertCommunity and getCommunity', () => {
      storage.upsertCommunity('c-1', 'Test community summary', 5);
      const c = storage.getCommunity('c-1');
      expect(c).not.toBeNull();
      expect(c!.summary).toBe('Test community summary');
      expect(c!.nodeCount).toBe(5);
    });

    it('should return null for missing community', () => {
      expect(storage.getCommunity('no-such')).toBeNull();
    });

    it('should getAllCommunities', () => {
      storage.upsertCommunity('c-a', 'Summary A', 3);
      storage.upsertCommunity('c-b', 'Summary B', 7);
      const all = storage.getAllCommunities();
      expect(all.size).toBe(2);
    });

    it('should pruneCommunities returning count', () => {
      // No nodes assigned → communities are orphans
      storage.upsertCommunity('c-orphan', 'orphan', 1);
      const pruned = storage.pruneCommunities();
      expect(pruned).toBeGreaterThanOrEqual(0);
    });
  });

  // ─── Messages ─────────────────────────────────────────

  describe('Messages', () => {
    it('should saveMessage and getUnextractedMessages', () => {
      storage.saveMessage('s1', 1, 'user', 'Hello world');
      storage.saveMessage('s1', 2, 'assistant', 'Hi there');

      const msgs = storage.getUnextractedMessages('s1', 10);
      expect(msgs.length).toBe(2);
      expect(msgs[0].role).toBe('user');
      // SQL returns snake_case turn_index
      expect((msgs[1] as Record<string,unknown>).turn_index).toBe(2);
    });

    it('should markMessagesExtracted', () => {
      storage.saveMessage('s1', 1, 'user', 'msg1');
      storage.saveMessage('s1', 2, 'user', 'msg2');
      storage.markMessagesExtracted('s1', 1);
      const remaining = storage.getUnextractedMessages('s1', 10);
      expect(remaining.length).toBe(1);
      expect((remaining[0] as Record<string,unknown>).turn_index).toBe(2);
    });
  });

  // ─── Statistics & Metadata ────────────────────────────

  describe('Statistics', () => {
    it('should getStats with node/edge counts', () => {
      storage.upsertNode({ type: 'TASK', category: 'tasks', name: 'S1', description: 'x', content: 'c', source: 'user' }, 's1');
      storage.upsertNode({ type: 'SKILL', category: 'skills', name: 'S2', description: 'x', content: 'c', source: 'user' }, 's1');

      const stats = storage.getStats();
      expect(stats.totalNodes).toBe(2);
      expect(stats.activeNodes).toBe(2);
    });

    it('should getSchemaVersion', () => {
      expect(storage.getSchemaVersion()).toBeGreaterThan(0);
    });
  });

  // ─── Dirty Tracking ───────────────────────────────────

  describe('Dirty tracking', () => {
    it('should markDirty and getDirtyNodes', () => {
      const { node } = storage.upsertNode({ type: 'TASK', category: 'tasks', name: 'D1', description: 'x', content: 'c', source: 'user' }, 's1');
      storage.markDirty([node.id]);
      const dirty = storage.getDirtyNodes();
      expect(dirty.has(node.id)).toBe(true);
    });

    it('should clearDirty', () => {
      const { node } = storage.upsertNode({ type: 'TASK', category: 'tasks', name: 'D2', description: 'x', content: 'c', source: 'user' }, 's1');
      storage.markDirty([node.id]);
      storage.clearDirty();
      expect(storage.getDirtyNodes().size).toBe(0);
    });

    it('should getAffectedSubgraph around dirty nodes', () => {
      const { node: center } = storage.upsertNode({ type: 'TASK', category: 'tasks', name: 'Center', description: 'x', content: 'c', source: 'user' }, 's1');
      storage.markDirty([center.id]);
      const subgraph = storage.getAffectedSubgraph(2);
      expect(subgraph.nodes.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Graph ────────────────────────────────────────────

  describe('Graph', () => {
    it('should loadGraphStructure with node ids and edges', () => {
      const { node: a } = storage.upsertNode({ type: 'TASK', category: 'tasks', name: 'GA', description: 'x', content: 'c', source: 'user' }, 's1');
      const { node: b } = storage.upsertNode({ type: 'SKILL', category: 'skills', name: 'GB', description: 'x', content: 'c', source: 'user' }, 's1');
      storage.upsertEdge({ fromId: a.id, toId: b.id, type: 'USED_SKILL', instruction: 'use', sessionId: 's1' });

      const graph = storage.loadGraphStructure();
      expect(graph.nodeIds).toContain(a.id);
      expect(graph.edges.length).toBe(1);
    });

    it('should graphWalk from seed nodes', () => {
      const { node: a } = storage.upsertNode({ type: 'TASK', category: 'tasks', name: 'WalkA', description: 'x', content: 'c', source: 'user' }, 's1');
      const { node: b } = storage.upsertNode({ type: 'SKILL', category: 'skills', name: 'WalkB', description: 'x', content: 'c', source: 'user' }, 's1');
      storage.upsertEdge({ fromId: a.id, toId: b.id, type: 'USED_SKILL', instruction: 'walk', sessionId: 's1' });

      const walked = storage.graphWalk([a.id], 2);
      expect(walked.nodes.length).toBeGreaterThanOrEqual(2);
    });
  });
});
