/**
 * brain-memory — Scope v2.0 单元测试
 *
 * 覆盖：scopeMatchV2 / computeScopeId / buildScopeFilterClauseV2 / adaptScopeV1toV2
 */

import { describe, it, expect } from 'vitest';
import {
  scopeMatchV2,
  computeScopeId,
  buildScopeFilterClauseV2,
} from '../../src/scope/isolation';
import {
  adaptScopeV1toV2,
  adaptScopeV2toV1,
  type MemoryScopeV2,
  type ScopeFilterV2,
} from '../../src/types';

// ─── computeScopeId ────────────────────────────────────────────

describe('computeScopeId', () => {
  it('相同 scope 生成相同 hash', () => {
    const a: MemoryScopeV2 = { platform: 'qqbot', workspace: '/ws', agent: 'main', user: 'u1', chat: 'c1', thread: null };
    const b: MemoryScopeV2 = { platform: 'qqbot', workspace: '/ws', agent: 'main', user: 'u1', chat: 'c1', thread: null };
    expect(computeScopeId(a)).toBe(computeScopeId(b));
  });

  it('不同 scope 生成不同 hash', () => {
    const a: MemoryScopeV2 = { platform: 'qqbot', workspace: '/ws', agent: 'main', user: 'u1', chat: 'c1', thread: null };
    const b: MemoryScopeV2 = { platform: 'discord', workspace: '/ws', agent: 'main', user: 'u1', chat: 'c1', thread: null };
    expect(computeScopeId(a)).not.toBe(computeScopeId(b));
  });

  it('NULL 字段统一映射为 *', () => {
    const a: MemoryScopeV2 = { platform: null, workspace: null, agent: null, user: null, chat: null, thread: null };
    const b: MemoryScopeV2 = { platform: undefined as any, workspace: undefined as any, agent: undefined as any, user: undefined as any, chat: undefined as any, thread: undefined as any };
    expect(computeScopeId(a)).toBe(computeScopeId(b));
  });

  it('输出长度为 16 字符（sha256 前 8 字节 hex）', () => {
    const scope: MemoryScopeV2 = { platform: 'webchat', workspace: '/ws', agent: 'todo', user: 'u2', chat: 'c2', thread: 't1' };
    expect(computeScopeId(scope)).toHaveLength(16);
  });
});

// ─── scopeMatchV2 ──────────────────────────────────────────────

describe('scopeMatchV2', () => {
  const mem: MemoryScopeV2 = {
    platform: 'qqbot',
    workspace: '/ws/main',
    agent: 'agent1',
    user: 'user1',
    chat: 'chat1',
    thread: 'thread1',
  };

  it('完全相同的 scope → 匹配', () => {
    const query: MemoryScopeV2 = { ...mem };
    expect(scopeMatchV2(mem, query)).toBe(true);
  });

  it('查询 scope 是前缀 → 匹配（父可见子）', () => {
    const query: MemoryScopeV2 = {
      platform: 'qqbot', workspace: '/ws/main', agent: 'agent1', user: 'user1', chat: 'chat1', thread: null,
    };
    expect(scopeMatchV2(mem, query)).toBe(true);
  });

  it('只查 platform → 匹配（顶层前缀）', () => {
    const query: MemoryScopeV2 = { platform: 'qqbot', workspace: null, agent: null, user: null, chat: null, thread: null };
    expect(scopeMatchV2(mem, query)).toBe(true);
  });

  it('platform 不同 → 不匹配', () => {
    const query: MemoryScopeV2 = { platform: 'discord', workspace: null, agent: null, user: null, chat: null, thread: null };
    expect(scopeMatchV2(mem, query)).toBe(false);
  });

  it('agent 不同 → 不匹配', () => {
    const query: MemoryScopeV2 = { ...mem, agent: 'agent2' };
    expect(scopeMatchV2(mem, query)).toBe(false);
  });

  it('chat 不同 → 不匹配', () => {
    const query: MemoryScopeV2 = { ...mem, chat: 'chat2' };
    expect(scopeMatchV2(mem, query)).toBe(false);
  });

  it('thread 不同 → 不匹配（最细粒度需精确）', () => {
    const query: MemoryScopeV2 = { ...mem, thread: 'thread2' };
    expect(scopeMatchV2(mem, query)).toBe(false);
  });

  it('记忆无 thread，查询有 thread → 匹配（NULL 通配）', () => {
    const memNoThread: MemoryScopeV2 = { ...mem, thread: null };
    const query: MemoryScopeV2 = { ...mem, thread: 'thread1' };
    expect(scopeMatchV2(memNoThread, query)).toBe(true);
  });

  it('记忆 platform 为 NULL → 任何 platform 查询可见', () => {
    const memNull: MemoryScopeV2 = { ...mem, platform: null };
    const query: MemoryScopeV2 = { platform: 'discord', workspace: null, agent: null, user: null, chat: null, thread: null };
    expect(scopeMatchV2(memNull, query)).toBe(true);
  });

  it('全 NULL 记忆 → 任何查询可见', () => {
    const memNull: MemoryScopeV2 = { platform: null, workspace: null, agent: null, user: null, chat: null, thread: null };
    const query: MemoryScopeV2 = { platform: 'qqbot', workspace: '/ws', agent: 'a1', user: 'u1', chat: 'c1', thread: 't1' };
    expect(scopeMatchV2(memNull, query)).toBe(true);
  });

  it('全 NULL 查询 → 任何记忆可见', () => {
    const query: MemoryScopeV2 = { platform: null, workspace: null, agent: null, user: null, chat: null, thread: null };
    expect(scopeMatchV2(mem, query)).toBe(true);
  });
});

// ─── buildScopeFilterClauseV2 ──────────────────────────────────

describe('buildScopeFilterClauseV2', () => {
  const defaultFilter: ScopeFilterV2 = {
    includeScopes: [], excludeScopes: [], allowCrossScope: false,
  };

  it('空 scope filter 返回空 clause', () => {
    const result = buildScopeFilterClauseV2(defaultFilter);
    expect(result.clause).toBe('');
    expect(result.params).toEqual([]);
  });

  it('包含单个 include scope — 有 platform 和 agent', () => {
    const filter: ScopeFilterV2 = {
      ...defaultFilter,
      includeScopes: [{ platform: 'qqbot', workspace: null, agent: 'main', user: null, chat: null, thread: null }],
    };
    const result = buildScopeFilterClauseV2(filter);
    expect(result.clause).toContain('scope_platform');
    expect(result.clause).toContain('scope_agent');
    expect(result.params).toContain('qqbot');
    expect(result.params).toContain('main');
    // 应该不包含 workspace/user/chat/thread
    expect(result.clause).not.toContain('scope_workspace');
    expect(result.clause).not.toContain('scope_user');
  });

  it('包含两个 include scope — OR 连接', () => {
    const filter: ScopeFilterV2 = {
      ...defaultFilter,
      includeScopes: [
        { platform: 'qqbot', workspace: null, agent: null, user: null, chat: null, thread: null },
        { platform: 'discord', workspace: null, agent: null, user: null, chat: null, thread: null },
      ],
    };
    const result = buildScopeFilterClauseV2(filter);
    expect(result.clause).toContain('OR');
    expect(result.params).toContain('qqbot');
    expect(result.params).toContain('discord');
  });

  it('排除单个 exclude scope', () => {
    const filter: ScopeFilterV2 = {
      ...defaultFilter,
      excludeScopes: [{ platform: 'discord', workspace: null, agent: null, user: null, chat: null, thread: null }],
    };
    const result = buildScopeFilterClauseV2(filter);
    expect(result.clause).toContain('!=');
    expect(result.params).toContain('discord');
  });

  it('NULL 隔离 — NULL memory 仍可见', () => {
    const filter: ScopeFilterV2 = {
      ...defaultFilter,
      includeScopes: [{ platform: 'qqbot', workspace: null, agent: null, user: null, chat: 'c1', thread: null }],
    };
    const result = buildScopeFilterClauseV2(filter);
    // 每层都是 (col = ? OR col IS NULL) — 保证 NULL 通配
    expect(result.clause).toContain('IS NULL');
  });

  it('shared 共享模式不追加限制', () => {
    const filter: ScopeFilterV2 = {
      ...defaultFilter,
      allowCrossScope: true,
      sharingMode: 'shared',
    };
    const result = buildScopeFilterClauseV2(filter);
    expect(result.clause).toBe('');
  });

  it('mixed 共享模式追加 category 限制', () => {
    const filter: ScopeFilterV2 = {
      ...defaultFilter,
      allowCrossScope: true,
      sharingMode: 'mixed',
      sharedCategories: ['profile', 'preferences'],
    };
    const result = buildScopeFilterClauseV2(filter);
    expect(result.clause).toContain('category IN');
    expect(result.params).toContain('profile');
    expect(result.params).toContain('preferences');
  });

  it('第 14 项：clause 以 AND 开头（可追加到 WHERE status 后）', () => {
    const filter: ScopeFilterV2 = {
      ...defaultFilter,
      includeScopes: [{ platform: 'qqbot', workspace: null, agent: null, user: null, chat: null, thread: null }],
    };
    const result = buildScopeFilterClauseV2(filter);
    expect(result.clause.startsWith(' AND')).toBe(true);
  });
});

// ─── adaptScope 适配器 ────────────────────────────────────────

describe('adaptScope V1 ↔ V2', () => {
  it('V1→V2: session → chat 映射', () => {
    const v1 = { sessionId: 's1', agentId: 'a1', workspaceId: '/ws' };
    const v2 = adaptScopeV1toV2(v1);
    expect(v2.platform).toBeNull();
    expect(v2.workspace).toBe('/ws');
    expect(v2.agent).toBe('a1');
    expect(v2.user).toBeNull();
    expect(v2.chat).toBe('s1');
    expect(v2.thread).toBeNull();
  });

  it('V1→V2: 缺失字段为 NULL', () => {
    const v1 = { sessionId: 's1' };
    const v2 = adaptScopeV1toV2(v1);
    expect(v2.workspace).toBeNull();
    expect(v2.agent).toBeNull();
  });

  it('V2→V1: chat → session 映射', () => {
    const v2: MemoryScopeV2 = { platform: 'qqbot', workspace: '/ws', agent: 'a1', user: 'u1', chat: 'c1', thread: null };
    const v1 = adaptScopeV2toV1(v2);
    expect(v1.sessionId).toBe('c1');
    expect(v1.agentId).toBe('a1');
    expect(v1.workspaceId).toBe('/ws');
  });

  it('V2→V1: NULL chat → undefined sessionId', () => {
    const v2: MemoryScopeV2 = { platform: null, workspace: null, agent: null, user: null, chat: null, thread: null };
    const v1 = adaptScopeV2toV1(v2);
    expect(v1.sessionId).toBeUndefined();
  });

  it('往返转换：V1 → V2 → V1 保持一致', () => {
    const v1 = { sessionId: 's1', agentId: 'a1', workspaceId: '/ws' };
    const v2 = adaptScopeV1toV2(v1);
    const v1Back = adaptScopeV2toV1(v2);
    expect(v1Back.sessionId).toBe('s1');
    expect(v1Back.agentId).toBe('a1');
    expect(v1Back.workspaceId).toBe('/ws');
  });
});
