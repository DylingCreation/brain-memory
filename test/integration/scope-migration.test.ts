/**
 * brain-memory — Scope v2.0 数据库迁移测试
 *
 * 验证：新数据库直接创建 v2 schema / 迁移幂等 / scope 写入与读取
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DatabaseSync, type DatabaseSyncInstance } from '@photostructure/sqlite';
import { initDb } from '../../src/store/db';
import { migrate, getSchemaVersion, CURRENT_SCHEMA_VERSION } from '../../src/store/migrate';
import {
  upsertNode,
  findByName,
  allActiveNodes,
} from '../../src/store/store';
import { rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// ─── Helpers ──────────────────────────────────────────────

function tmpDbPath(): string {
  return join(tmpdir(), `bm-scope-migration-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.db`);
}

function cleanup(path: string): void {
  try {
    if (existsSync(path)) rmSync(path);
    if (existsSync(path + '-shm')) rmSync(path + '-shm');
    if (existsSync(path + '-wal')) rmSync(path + '-wal');
  } catch { /* ignore */ }
}

// ─── 新数据库 v2 schema ───────────────────────────────────

describe('新数据库 v2 schema', () => {
  const dbPath = tmpDbPath();
  let db: DatabaseSyncInstance;

  beforeAll(() => {
    db = initDb(dbPath);
  });

  afterAll(() => {
    try { db.close(); } catch { /* ignore */ }
    cleanup(dbPath);
  });

  it('schema version 应为 2', () => {
    expect(getSchemaVersion(db)).toBe(2);
    expect(CURRENT_SCHEMA_VERSION).toBe(2);
  });

  it('bm_nodes 表应有六层 scope 列', () => {
    const info = db.prepare("PRAGMA table_info('bm_nodes')").all() as Array<{ name: string }>;
    const colNames = info.map(r => r.name);
    expect(colNames).toContain('scope_platform');
    expect(colNames).toContain('scope_user');
    expect(colNames).toContain('scope_chat');
    expect(colNames).toContain('scope_thread');
    expect(colNames).toContain('scope_id');
    expect(colNames).toContain('scope_session'); // 旧字段保留
  });

  it('scope 索引存在', () => {
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_nodes_scope%'").all() as Array<{ name: string }>;
    const names = indexes.map(r => r.name);
    expect(names).toContain('idx_nodes_scope_id');
    expect(names).toContain('idx_nodes_scope_platform');
    expect(names).toContain('idx_nodes_scope_chat');
  });

  it('可以写入和读取六层 scope 记忆', () => {
    const result = upsertNode(db, {
      type: 'SKILL',
      category: 'skills',
      name: 'test-scope-write',
      description: '验证 scope 读写',
      content: 'test content',
      source: 'user',
      scopePlatform: 'qqbot',
      scopeWorkspace: '/ws/test',
      scopeAgent: 'agent1',
      scopeUser: 'user1',
      scopeChat: 'chat1',
      scopeThread: 'thread1',
    }, 'session1');

    expect(result.isNew).toBe(true);
    expect(result.node.scopePlatform).toBe('qqbot');
    expect(result.node.scopeWorkspace).toBe('/ws/test');
    expect(result.node.scopeAgent).toBe('agent1');
    expect(result.node.scopeUser).toBe('user1');
    expect(result.node.scopeChat).toBe('chat1');
    expect(result.node.scopeThread).toBe('thread1');
  });

  it('scopeChat fallback — 未传 scopeChat 时使用 scopeSession', () => {
    const result = upsertNode(db, {
      type: 'TASK',
      category: 'tasks',
      name: 'test-scope-fallback',
      description: '验证 fallback',
      content: 'test content',
      source: 'user',
      scopeSession: 'session-fallback',
    }, 'session-fallback');

    expect(result.node.scopeChat).toBe('session-fallback');
    expect(result.node.scopeSession).toBe('session-fallback');
    expect(result.node.scopePlatform).toBeNull();
    expect(result.node.scopeUser).toBeNull();
    expect(result.node.scopeThread).toBeNull();
  });
});

// ─── 从 v1 迁移到 v2 ──────────────────────────────────────

describe('从 v1 迁移到 v2', () => {
  const dbPath = tmpDbPath();

  afterAll(() => {
    cleanup(dbPath);
  });

  it('旧风格数据 scopeSession 自动映射 scopeChat，新列写入正确', () => {
    const db = initDb(dbPath);
    expect(getSchemaVersion(db)).toBe(2);

    // 只传旧字段 scopeSession
    const { node } = upsertNode(db, {
      type: 'TASK',
      category: 'tasks',
      name: 'old-style-task',
      description: 'v1 风格数据',
      content: 'test',
      source: 'user',
      scopeSession: 'legacy-session-1',
      scopeAgent: 'legacy-agent',
      scopeWorkspace: '/legacy-ws',
    }, 'session-1');

    expect(node.scopeChat).toBe('legacy-session-1');
    expect(node.scopeSession).toBe('legacy-session-1');
    expect(node.scopeAgent).toBe('legacy-agent');
    expect(node.scopeWorkspace).toBe('/legacy-ws');
    // 新字段默认 null
    expect(node.scopePlatform).toBeNull();
    expect(node.scopeUser).toBeNull();
    expect(node.scopeThread).toBeNull();

    db.close();
  });

  it('CURRENT_SCHEMA_VERSION = 2，新数据库直接 v2', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(2);
  });
});

// ─── 迁移幂等性 ───────────────────────────────────────────

describe('迁移幂等性', () => {
  const dbPath = tmpDbPath();
  let db: DatabaseSyncInstance;

  beforeAll(() => {
    db = initDb(dbPath);
  });

  afterAll(() => {
    try { db.close(); } catch { /* ignore */ }
    cleanup(dbPath);
  });

  it('重复执行 migrate() 不报错', () => {
    expect(() => migrate(db)).not.toThrow();
    expect(getSchemaVersion(db)).toBe(2);
  });

  it('重复 upsertNode 正常工作（不因新列抛异常）', () => {
    const r1 = upsertNode(db, {
      type: 'SKILL',
      category: 'skills',
      name: 'idempotent-test',
      description: '幂等测试',
      content: 'test content',
      source: 'user',
      scopePlatform: 'webchat',
      scopeAgent: 'agent-idempotent',
    }, 'session-idempotent');

    expect(r1.isNew).toBe(true);

    const r2 = upsertNode(db, {
      type: 'SKILL',
      category: 'skills',
      name: 'idempotent-test',
      description: '更新后的描述',
      content: 'updated content',
      source: 'user',
      scopePlatform: 'webchat',
      scopeAgent: 'agent-idempotent',
    }, 'session-idempotent-2');

    expect(r2.isNew).toBe(false);
    expect(r2.node.description).toBe('更新后的描述');
    expect(r2.node.scopePlatform).toBe('webchat');
  });
});

// ─── scope 索引查询 ───────────────────────────────────────

describe('scope 索引查询', () => {
  const dbPath = tmpDbPath();
  let db: DatabaseSyncInstance;

  beforeAll(() => {
    db = initDb(dbPath);
    upsertNode(db, { type: 'SKILL', category: 'skills', name: 's-a', description: '', content: '', source: 'user', scopePlatform: 'qqbot', scopeAgent: 'main', scopeChat: 'c1' }, 's1');
    upsertNode(db, { type: 'SKILL', category: 'skills', name: 's-b', description: '', content: '', source: 'user', scopePlatform: 'qqbot', scopeAgent: 'main', scopeChat: 'c2' }, 's2');
    upsertNode(db, { type: 'TASK', category: 'tasks', name: 's-c', description: '', content: '', source: 'user', scopePlatform: 'discord', scopeAgent: 'main', scopeChat: 'c1' }, 's3');
  });

  afterAll(() => {
    try { db.close(); } catch { /* ignore */ }
    cleanup(dbPath);
  });

  it('allActiveNodes 返回所有活跃节点', () => {
    const nodes = allActiveNodes(db);
    expect(nodes.length).toBeGreaterThanOrEqual(3);
  });

  it('scope 列可通过 SQL 直接过滤', () => {
    const rows = db.prepare(
      "SELECT * FROM bm_nodes WHERE scope_platform = ? AND scope_agent = ? AND status = 'active'"
    ).all('qqbot', 'main') as Array<Record<string, unknown>>;
    expect(rows.length).toBe(2);
  });
});
