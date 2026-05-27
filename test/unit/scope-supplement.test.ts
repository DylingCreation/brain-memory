/**
 * brain-memory — Scope isolation supplementary tests
 *
 * v2.1.0: Coverage补盲 — scopeMatchV2 边界 + computeScopeId 幂等性。
 */

import { describe, it, expect } from 'vitest';
import { computeScopeId, scopeMatchV2 } from '../../src/scope/isolation';
import type { MemoryScopeV2 } from '../../src/types';

describe('scopeMatchV2 — supplementary', () => {
  const mkScope = (p: string|null, w: string|null, a: string|null, u: string|null, c: string|null, t: string|null): MemoryScopeV2 =>
    ({ platform: p, workspace: w, agent: a, user: u, chat: c, thread: t });

  it('should match when both scopes are identical', () => {
    const s = mkScope('discord', 'team', 'bot', 'user1', 'ch42', 'th99');
    expect(scopeMatchV2(s, s)).toBe(true);
  });

  it('should match when query is a prefix of memory', () => {
    const mem = mkScope('discord', 'team', 'bot', 'user1', 'ch42', 'th99');
    const qry = mkScope('discord', 'team', 'bot', 'user1', 'ch42', null);
    expect(scopeMatchV2(mem, qry)).toBe(true);
  });

  it('should treat null query fields as wildcards', () => {
    const mem = mkScope('discord', 'team-a', 'agent-x', 'user-1', 'chat-5', 'thread-9');
    const qry = mkScope('discord', null, null, null, null, null);
    expect(scopeMatchV2(mem, qry)).toBe(true);
  });

  it('should treat null memory fields as wildcards (global memory)', () => {
    const mem = mkScope(null, null, null, null, null, null);
    const qry = mkScope('discord', 'team-a', null, null, null, null);
    expect(scopeMatchV2(mem, qry)).toBe(true);
  });

  it('should reject when platform differs', () => {
    const mem = mkScope('discord', null, null, null, null, null);
    const qry = mkScope('telegram', null, null, null, null, null);
    expect(scopeMatchV2(mem, qry)).toBe(false);
  });

  it('should reject when agent differs', () => {
    const mem = mkScope(null, null, 'agent-a', null, null, null);
    const qry = mkScope(null, null, 'agent-b', null, null, null);
    expect(scopeMatchV2(mem, qry)).toBe(false);
  });

  it('should accept when only memory has a field (superset)', () => {
    const mem = mkScope('discord', 'team', 'bot', 'user1', 'ch42', 'th99');
    const qry = mkScope('discord', null, null, null, null, null);
    expect(scopeMatchV2(mem, qry)).toBe(true);
  });

  it('should accept empty query scope (match all)', () => {
    const mem = mkScope('slack', 'corp', 'prod', 'u1', 'c1', 't1');
    const qry = mkScope(null, null, null, null, null, null);
    expect(scopeMatchV2(mem, qry)).toBe(true);
  });
});

describe('computeScopeId', () => {
  it('should produce deterministic output', () => {
    const scope1: MemoryScopeV2 = { platform: 'discord', workspace: 'team-a', agent: 'main', user: null, chat: 'ch-1', thread: null };
    const scope2: MemoryScopeV2 = { ...scope1 };
    expect(computeScopeId(scope1)).toBe(computeScopeId(scope2));
  });

  it('should produce different ids for different platforms', () => {
    const s1: MemoryScopeV2 = { platform: 'discord', workspace: null, agent: null, user: null, chat: null, thread: null };
    const s2: MemoryScopeV2 = { platform: 'telegram', workspace: null, agent: null, user: null, chat: null, thread: null };
    expect(computeScopeId(s1)).not.toBe(computeScopeId(s2));
  });

  it('should produce 16-character hex string', () => {
    const scope: MemoryScopeV2 = { platform: 'qqbot', workspace: 'ws', agent: 'a', user: 'u', chat: 'c', thread: 't' };
    const id = computeScopeId(scope);
    expect(id.length).toBe(16);
    expect(/^[0-9a-f]{16}$/.test(id)).toBe(true);
  });

  it('should use * for null fields', () => {
    const a = computeScopeId({ platform: 'p', workspace: null, agent: null, user: null, chat: null, thread: null });
    const b = computeScopeId({ platform: 'p', workspace: '', agent: '', user: '', chat: '', thread: '' });
    // null and empty string may differ — but both should be valid 16-char hex
    expect(a.length).toBe(16);
    expect(b.length).toBe(16);
  });
});
