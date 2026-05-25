/**
 * brain-memory — LanceDB MVP 集成测试
 *
 * 验证：Node CRUD 真实化 + scope 字段正确读写 + Stats 真实化
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { LanceDBStorageAdapter } from '../src/store/lancedb-adapter';
import type { IStorageAdapter, NodeUpsertInput, StorageStats } from '../src/store/adapter';
import { rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// ─── Helpers ──────────────────────────────────────────────

let _testCounter = 0;
function tmpDbPath(): string {
  return join(tmpdir(), `bm-lancedb-mvp-${Date.now()}-${++_testCounter}`);
}

function cleanup(path: string): void {
  try { if (existsSync(path)) rmSync(path, { recursive: true }); } catch { /* ignore */ }
}

describe('LanceDB MVP — Node CRUD', () => {
  const dbPath = tmpDbPath();
  let storage: IStorageAdapter;

  beforeAll(async () => {
    storage = new LanceDBStorageAdapter(dbPath);
    await (storage as LanceDBStorageAdapter).initialize();
  }, 15000);

  afterAll(() => {
    try { storage.close(); } catch {}
    cleanup(dbPath);
  });

  it('初始状态：空数据库', () => {
    const nodes = storage.findAllActive();
    expect(nodes.length).toBe(0);
    const stats = storage.getStats();
    expect(stats.totalNodes).toBe(0);
    expect(stats.activeNodes).toBe(0);
  });

  it('写入单个节点并读取', () => {
    const { node, isNew } = storage.upsertNode({
      type: 'SKILL',
      category: 'skills',
      name: 'typescript-debugging',
      description: 'TypeScript 调试技巧',
      content: '使用 ts-node 配合 --inspect 标志进行断点调试',
      source: 'user',
    }, 'session-1');

    expect(isNew).toBe(true);
    expect(node.name).toBe('typescript-debugging');
    expect(node.category).toBe('skills');
    expect(node.status).toBe('active');

    // 通过 ID 查询
    const found = storage.findNodeById(node.id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe('typescript-debugging');

    // 通过名称查询
    const byName = storage.findNodeByName('typescript-debugging');
    expect(byName).not.toBeNull();
  });

  it('upsert 更新已存在节点', () => {
    const { node, isNew } = storage.upsertNode({
      type: 'SKILL',
      category: 'skills',
      name: 'typescript-debugging',
      description: '更新后的更详细描述',
      content: '扩展后的内容：使用 ts-node --inspect-brk 配合 Chrome DevTools',
      source: 'assistant',
    }, 'session-2');

    expect(isNew).toBe(false);
    expect(node.validatedCount).toBe(2);
    expect(node.sourceSessions).toContain('session-1');
    expect(node.sourceSessions).toContain('session-2');
  });

  it('批量写入 100 条并验证 findAllActive', () => {
    for (let i = 0; i < 100; i++) {
      storage.upsertNode({
        type: i % 3 === 0 ? 'TASK' : i % 3 === 1 ? 'SKILL' : 'EVENT',
        category: i % 5 === 0 ? 'tasks' : i % 5 === 1 ? 'skills' : i % 5 === 2 ? 'events' : i % 5 === 3 ? 'entities' : 'patterns',
        name: `bulk-node-${i}`,
        description: `Description ${i}`,
        content: `Content for bulk node ${i} with keywords like testing, validation, and performance.`,
        source: 'user',
      }, `session-bulk`);
    }
    const active = storage.findAllActive();
    expect(active.length).toBe(101); // 1 original + 100 bulk
  });

  it('deprecateNode 软删除后 findAllActive 不包含该节点', () => {
    const { node } = storage.upsertNode({
      type: 'TASK', category: 'tasks',
      name: 'to-be-deprecated',
      description: '将被删除',
      content: '即将被弃用的节点',
      source: 'user',
    }, 's-dep');

    storage.deprecateNode(node.id);
    const found = storage.findNodeById(node.id);
    expect(found).not.toBeNull();
    expect(found!.status).toBe('deprecated');

    const active = storage.findAllActive();
    expect(active.some(n => n.id === node.id)).toBe(false);
  });

  it('Stats 返回真实数据', () => {
    const stats = storage.getStats();
    expect(stats.totalNodes).toBeGreaterThanOrEqual(102);
    expect(stats.activeNodes).toBeGreaterThanOrEqual(101);
    expect(stats.deprecatedNodes).toBeGreaterThanOrEqual(1);
    expect(stats.totalEdges).toBe(0);
    expect(typeof stats.nodesByCategory).toBe('object');
    expect(stats.schemaVersion).toBe(2);
  });
});

// ─── Scope 字段测试 ──────────────────────────────────────

describe('LanceDB MVP — scope 字段', () => {
  const dbPath = tmpDbPath();
  let storage: IStorageAdapter;

  beforeAll(async () => {
    storage = new LanceDBStorageAdapter(dbPath);
    await (storage as LanceDBStorageAdapter).initialize();
  }, 15000);

  afterAll(() => {
    try { storage.close(); } catch {}
    cleanup(dbPath);
  });

  it('写入六层 scope 记忆并正确读取', () => {
    const { node } = storage.upsertNode({
      type: 'SKILL',
      category: 'skills',
      name: 'scoped-skill',
      description: '带 scope 的技能',
      content: 'scope test content',
      source: 'user',
      scopePlatform: 'qqbot',
      scopeWorkspace: '/ws/test',
      scopeAgent: 'agent-main',
      scopeUser: 'user-1',
      scopeChat: 'chat-1',
      scopeThread: 'thread-1',
    }, 'scope-session');

    expect(node.scopePlatform).toBe('qqbot');
    expect(node.scopeWorkspace).toBe('/ws/test');
    expect(node.scopeAgent).toBe('agent-main');
    expect(node.scopeUser).toBe('user-1');
    expect(node.scopeChat).toBe('chat-1');
    expect(node.scopeThread).toBe('thread-1');
    // 旧字段兼容
    expect(node.scopeSession).toBe('scope-session');
  });

  it('scopeChat fallback to scopeSession', () => {
    const { node } = storage.upsertNode({
      type: 'TASK',
      category: 'tasks',
      name: 'fallback-scope',
      description: 'scope fallback 测试',
      content: 'test',
      source: 'user',
      scopeSession: 'fallback-session',
    }, 'fallback-session');

    expect(node.scopeChat).toBe('fallback-session');
  });

  it('source: manual 正确存储', () => {
    const { node } = storage.upsertNode({
      type: 'TASK',
      category: 'tasks',
      name: 'manual-entry',
      description: '手动添加',
      content: '手动输入的记忆',
      source: 'manual',
    }, 'manual-session');

    expect(node.source).toBe('manual');
  });
});

// ─── Edge CRUD 测试 ──────────────────────────────────────

describe('LanceDB MVP — Edge CRUD', () => {
  const dbPath = tmpDbPath();
  let storage: IStorageAdapter;

  beforeAll(async () => {
    storage = new LanceDBStorageAdapter(dbPath);
    await (storage as LanceDBStorageAdapter).initialize();
    storage.upsertNode({ type: 'TASK', category: 'tasks', name: 'task-a', description: '', content: 'a', source: 'user' }, 's1');
    storage.upsertNode({ type: 'SKILL', category: 'skills', name: 'skill-b', description: '', content: 'b', source: 'user' }, 's1');
  }, 15000);

  afterAll(() => {
    try { storage.close(); } catch {}
    cleanup(dbPath);
  });

  it('创建边并查询', () => {
    const taskA = storage.findNodeByName('task-a');
    const skillB = storage.findNodeByName('skill-b');
    expect(taskA).not.toBeNull();
    expect(skillB).not.toBeNull();

    const edge = storage.upsertEdge({
      fromId: taskA!.id,
      toId: skillB!.id,
      type: 'USED_SKILL',
      instruction: 'task-a uses skill-b',
      sessionId: 's1',
    });

    expect(edge.type).toBe('USED_SKILL');

    const fromEdges = storage.findEdgesFrom(taskA!.id);
    expect(fromEdges.length).toBe(1);
    expect(fromEdges[0].toId).toBe(skillB!.id);
  });
});

// ─── Scope 过滤测试 ──────────────────────────────────────

describe('LanceDB MVP — scope 过滤', () => {
  const dbPath = tmpDbPath();
  let storage: IStorageAdapter;

  beforeAll(async () => {
    storage = new LanceDBStorageAdapter(dbPath);
    await (storage as LanceDBStorageAdapter).initialize();
    // 写入两个不同 scope 的节点
    storage.upsertNode({ type: 'TASK', category: 'tasks', name: 'scoped-a', description: '', content: 'a', source: 'user', scopePlatform: 'qqbot', scopeAgent: 'main', scopeChat: 'c1' }, 's1');
    storage.upsertNode({ type: 'TASK', category: 'tasks', name: 'scoped-b', description: '', content: 'b', source: 'user', scopePlatform: 'discord', scopeAgent: 'main', scopeChat: 'c1' }, 's2');
  }, 15000);

  afterAll(() => {
    try { storage.close(); } catch {}
    cleanup(dbPath);
  });

  it('includeScopesV2 过滤 — 只返回匹配 scope 的节点', () => {
    // 验证写入正确
    const a = storage.findNodeByName('scoped-a');
    const b = storage.findNodeByName('scoped-b');
    expect(a?.scopePlatform).toBe('qqbot');
    expect(b?.scopePlatform).toBe('discord');

    const nodes = storage.findAllActive({
      includeScopesV2: [{ platform: 'qqbot' }],
    });
    expect(nodes.length).toBe(1);
    expect(nodes[0].name).toBe('scoped-a');
  });

  it('excludeScopesV2 过滤 — 排除匹配 scope 的节点', () => {
    const nodes = storage.findAllActive({
      excludeScopesV2: [{ platform: 'qqbot' }],
    });
    expect(nodes.length).toBe(1);
    expect(nodes[0].name).toBe('scoped-b');
  });

  it('无 scope filter — 返回全部', () => {
    const nodes = storage.findAllActive();
    expect(nodes.length).toBe(2);
  });
});
