/**
 * brain-memory — LanceDBStorageAdapter 测试
 * v1.3.0 F-13: POC 测试（4 用例）
 * v1.6.0 A-2: 扩展至 14 用例 — 错误处理/向量持久化/初始化/关闭/边界
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { LanceDBStorageAdapter } from '../src/store/lancedb-adapter';
import { rmSync, existsSync } from 'node:fs';

function safeClean(path: string) {
  try { if (existsSync(path)) rmSync(path, { recursive: true }); } catch {}
}

// ─── Initialization & Lifecycle ─────────────────────────────

describe('LanceDBStorageAdapter — lifecycle', () => {
  const DB = '/tmp/bm-lance-lifecycle';
  let storage: LanceDBStorageAdapter;

  afterEach(() => {
    try { storage?.close(); } catch {}
    safeClean(DB);
  });

  it('initializes and connects to LanceDB', async () => {
    storage = new LanceDBStorageAdapter(DB);
    await storage.initialize();
    expect(storage.isConnected()).toBe(true);
    expect(storage.getInitError()).toBeNull();
  });

  it('closes cleanly without error', async () => {
    storage = new LanceDBStorageAdapter(DB);
    await storage.initialize();
    storage.close();
    expect(storage.isConnected()).toBe(false);
  });

  it('reports isConnected=false before initialization', () => {
    storage = new LanceDBStorageAdapter(DB);
    expect(storage.isConnected()).toBe(false);
  });

  it('survives close() before initialize()', () => {
    storage = new LanceDBStorageAdapter(DB);
    storage.close();
    expect(storage.isConnected()).toBe(false);
  });
});

// ─── Node CRUD ─────────────────────────────────────────────

describe('LanceDBStorageAdapter — node CRUD', () => {
  const DB = '/tmp/bm-lance-node';
  let storage: LanceDBStorageAdapter;

  beforeEach(async () => {
    safeClean(DB);
    storage = new LanceDBStorageAdapter(DB);
    await storage.initialize();
  });
  afterEach(() => { storage.close(); safeClean(DB); });

  it('creates and finds nodes', () => {
    const { node } = storage.upsertNode(
      { type: 'TASK', category: 'tasks', name: 'test-node', description: 'test', content: 'test content', source: 'user' },
      'session-1',
    );
    expect(node.id).toBeDefined();
    expect(storage.findNodeById(node.id)).toBeDefined();
    expect(storage.findNodeByName('test-node')).toBeDefined();
  });

  it('returns null for missing node', () => {
    expect(storage.findNodeById('non-existent')).toBeNull();
    expect(storage.findNodeByName('missing')).toBeNull();
  });

  it('deprecates nodes', () => {
    const { node } = storage.upsertNode(
      { type: 'TASK', category: 'tasks', name: 'temp', description: '', content: '', source: 'user' },
      's1',
    );
    expect(storage.findAllActive().length).toBe(1);
    storage.deprecateNode(node.id);
    expect(storage.findAllActive().length).toBe(0);
  });

  it('merges nodes correctly', () => {
    const { node: n1 } = storage.upsertNode(
      { type: 'TASK', category: 'tasks', name: 'keep', description: '', content: 'a', source: 'user' },
      's1',
    );
    const { node: n2 } = storage.upsertNode(
      { type: 'TASK', category: 'tasks', name: 'merge', description: '', content: 'b', source: 'user' },
      's1',
    );
    storage.mergeNodes(n1.id, n2.id);
    expect(storage.findNodeById(n2.id)?.status).toBe('deprecated');
    expect(storage.findNodeById(n1.id)?.validatedCount).toBe(2);
  });
});

// ─── Vector Operations ─────────────────────────────────────

describe('LanceDBStorageAdapter — vectors', () => {
  const DB = '/tmp/bm-lance-vec';
  let storage: LanceDBStorageAdapter;

  beforeEach(async () => {
    safeClean(DB);
    storage = new LanceDBStorageAdapter(DB);
    await storage.initialize();
    storage.upsertNode(
      { type: 'TASK', category: 'tasks', name: 'vec-node', description: '', content: 'vector content', source: 'user' },
      's1',
    );
  });
  afterEach(() => { storage.close(); safeClean(DB); });

  it('stores and retrieves vectors (in-memory)', () => {
    const node = storage.findAllActive()[0];
    const vec = Array(128).fill(0).map(() => Math.random() * 2 - 1);
    storage.saveVector(node.id, 'test', vec);
    const retrieved = storage.getVector(node.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.length).toBe(128);
  });

  it('returns null for missing vector', () => {
    expect(storage.getVector('no-such-node')).toBeNull();
  });

  it('performs vector similarity search (in-memory)', () => {
    for (let i = 0; i < 5; i++) {
      const { node } = storage.upsertNode(
        { type: 'TASK', category: 'tasks', name: `vs-${i}`, description: '', content: `c${i}`, source: 'user' },
        's1',
      );
      storage.saveVector(node.id, 'test', Array(128).fill(0).map(() => Math.random() * 2 - 1));
    }
    const query = Array(128).fill(0).map(() => Math.random() * 2 - 1);
    const results = storage.vectorSearch(query, 3);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].node).toBeDefined();
    expect(typeof results[0].score).toBe('number');
    expect(results[0].score).toBeGreaterThanOrEqual(-1);
    expect(results[0].score).toBeLessThanOrEqual(1);
  });

  it('vectorSearchWithScore works', () => {
    const query = Array(128).fill(0.1);
    const results = storage.vectorSearchWithScore(query, 5);
    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
  });

  it('loads all vectors', () => {
    const node = storage.findAllActive()[0];
    storage.saveVector(node.id, 'test', Array(128).fill(0.3));
    const all = storage.loadAllVectors();
    expect(all.length).toBeGreaterThanOrEqual(1);
    expect(all[0].nodeId).toBe(node.id);
  });
});

// ─── Edge CRUD ──────────────────────────────────────────────

describe('LanceDBStorageAdapter — edges', () => {
  const DB = '/tmp/bm-lance-edge';
  let storage: LanceDBStorageAdapter;

  beforeEach(async () => {
    safeClean(DB);
    storage = new LanceDBStorageAdapter(DB);
    await storage.initialize();
  });
  afterEach(() => { storage.close(); safeClean(DB); });

  it('creates and finds edges', () => {
    const edge = storage.upsertEdge({
      fromId: 'n1', toId: 'n2', type: 'USED_SKILL',
      instruction: 'uses', sessionId: 's1',
    });
    expect(edge.id).toBeDefined();
    expect(storage.findEdgesFrom('n1').length).toBe(1);
    expect(storage.findEdgesTo('n2').length).toBe(1);
    expect(storage.findEdgesFrom('n3').length).toBe(0);
  });
});

// ─── Dirty Marks ────────────────────────────────────────────

describe('LanceDBStorageAdapter — dirty marks', () => {
  const DB = '/tmp/bm-lance-dirty';
  let storage: LanceDBStorageAdapter;

  beforeEach(async () => {
    safeClean(DB);
    storage = new LanceDBStorageAdapter(DB);
    await storage.initialize();
  });
  afterEach(() => { storage.close(); safeClean(DB); });

  it('tracks and clears dirty nodes', () => {
    expect(storage.getDirtyNodes().size).toBe(0);
    storage.markDirty(['a', 'b']);
    expect(storage.getDirtyNodes().size).toBe(2);
    storage.clearDirty();
    expect(storage.getDirtyNodes().size).toBe(0);
  });
});
