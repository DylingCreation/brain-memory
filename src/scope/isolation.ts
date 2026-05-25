/**
 * brain-memory — Multi-scope isolation
 *
 * Isolates memories by session/agent/workspace scope.
 * Controls read/write permissions per scope.
 * Supports cross-scope retrieval when authorized.
 */

import { createHash } from 'crypto';
import type { MemoryCategory, SharingMode, MemoryScopeV2, ScopeFilterV2 } from '../types';

export interface MemoryScope {
  sessionId?: string;
  agentId?: string;
  workspaceId?: string;
}

export interface ScopeFilter {
  includeScopes: MemoryScope[];
  excludeScopes: MemoryScope[];
  allowCrossScope: boolean;
  /** v1.0.0 B-2: Multi-agent sharing */
  sharingMode?: SharingMode;
  /** v1.0.0 B-2: Categories allowed for cross-agent sharing */
  sharedCategories?: MemoryCategory[];
  /** v1.0.0 B-2: Current agent ID (for cross-scope recall) */
  currentAgentId?: string;
  /** v1.0.0 B-2: Allowed agent IDs for sharing (empty = all) */
  allowedAgents?: string[];
}

export const DEFAULT_SCOPE_FILTER: ScopeFilter = {
  includeScopes: [],
  excludeScopes: [],
  allowCrossScope: false,
};

/**
 * Check if two scopes match.
 * A scope matches if all non-null fields are equal.
 */
export function scopesMatch(a: MemoryScope, b: MemoryScope): boolean {
  if (a.sessionId && b.sessionId && a.sessionId !== b.sessionId) return false;
  if (a.agentId && b.agentId && a.agentId !== b.agentId) return false;
  if (a.workspaceId && b.workspaceId && a.workspaceId !== b.workspaceId) return false;
  return true;
}

/**
 * Generate a scope key for storage/indexing.
 */
export function scopeKey(scope: MemoryScope): string {
  return [
    scope.sessionId ?? '*',
    scope.agentId ?? '*',
    scope.workspaceId ?? '*',
  ].join('|');
}

/**
 * Build a parameterized SQL WHERE clause for scope filtering.
 * Returns `{ clause, params }` where `clause` contains `?` placeholders
 * and `params` holds the bound values — preventing SQL injection.
 * Returns `{ clause: "", params: [] }` if no filtering needed.
 */
export function buildScopeFilterClause(filter: ScopeFilter): { clause: string; params: (string | number | null)[] } {
  const conditions: string[] = [];
  const params: (string | number | null)[] = [];

  // Include scopes
  if (filter.includeScopes.length > 0) {
    const includeClauses = filter.includeScopes.map(s => {
      const parts: string[] = [];
      if (s.sessionId) { parts.push('scope_session = ?'); params.push(s.sessionId); }
      if (s.agentId) { parts.push('scope_agent = ?'); params.push(s.agentId); }
      if (s.workspaceId) { parts.push('scope_workspace = ?'); params.push(s.workspaceId); }
      return parts.length > 0 ? `(${parts.join(' AND ')})` : '1=1';  // #18 fix: AND for includeScopes (was OR, too permissive)
    });
    conditions.push(`(${includeClauses.join(' OR ')})`);
  }

  // v1.0.0 B-2: Cross-scope sharing logic
  if (filter.allowCrossScope && filter.sharingMode && filter.sharingMode !== 'isolated') {
    if (filter.sharingMode === 'shared') {
      // Fully shared: no additional restriction
      // (allow all active nodes regardless of scope)
    } else if (filter.sharingMode === 'mixed' && filter.sharedCategories && filter.sharedCategories.length > 0) {
      // Mixed mode: allow nodes from any agent, but only for shared categories
      const placeholders = filter.sharedCategories.map(() => '?').join(', ');
      filter.sharedCategories.forEach(cat => params.push(cat));
      conditions.push(`(category IN (${placeholders}))`);
    }
    // Additional agent restriction if allowedAgents is specified
    if (filter.allowedAgents && filter.allowedAgents.length > 0) {
      const agentPlaceholders = filter.allowedAgents.map(() => '?').join(', ');
      filter.allowedAgents.forEach(aid => params.push(aid));
      conditions.push(`(scope_agent IN (${agentPlaceholders}))`);
    }
  }

  // Exclude scopes
  if (filter.excludeScopes.length > 0) {
    const excludeClauses = filter.excludeScopes.map(s => {
      const parts: string[] = [];
      if (s.sessionId) { parts.push('scope_session != ?'); params.push(s.sessionId); }
      if (s.agentId) { parts.push('scope_agent != ?'); params.push(s.agentId); }
      if (s.workspaceId) { parts.push('scope_workspace != ?'); params.push(s.workspaceId); }
      return parts.length > 0 ? `(${parts.join(' AND ')})` : '1=1';
    });
    conditions.push(excludeClauses.join(' AND '));
  }

  if (conditions.length === 0) return { clause: '', params: [] };
  return { clause: ` AND ${conditions.join(' AND ')}`, params };
}

// ─── v2.0 六层 scope ──────────────────────────────────────────

/**
 * v2.0：根据六层 scope 生成唯一 scope_id。
 * 排序键确保 platform|workspace|agent|user|chat|thread → 确定性 hash。
 */
export function computeScopeId(scope: MemoryScopeV2): string {
  const parts = [
    scope.platform ?? '*',
    scope.workspace ?? '*',
    scope.agent ?? '*',
    scope.user ?? '*',
    scope.chat ?? '*',
    scope.thread ?? '*',
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);
}

/**
 * v2.0：判断查询 scope 是否匹配记忆 scope。
 *
 * 规则：查询 scope 是记忆 scope 的前缀 → 匹配。
 * - 查询中非空的层，记忆必须匹配（或记忆该层为 NULL）
 * - 记忆有而查询无的层 → 视为"记忆更精细，查询可覆盖"→ 放行
 *
 * 示例：
 *   记忆: {platform:'qqbot', agent:'main', chat:'c1', thread:'t1'}
 *   查询: {platform:'qqbot', agent:'main', chat:'c1'}  → ✅ 前缀匹配
 *   查询: {platform:'discord', agent:'main'}           → ❌ platform 不同
 */
export function scopeMatchV2(memoryScope: MemoryScopeV2, queryScope: MemoryScopeV2): boolean {
  if (queryScope.platform && memoryScope.platform && queryScope.platform !== memoryScope.platform) return false;
  if (queryScope.workspace && memoryScope.workspace && queryScope.workspace !== memoryScope.workspace) return false;
  if (queryScope.agent && memoryScope.agent && queryScope.agent !== memoryScope.agent) return false;
  if (queryScope.user && memoryScope.user && queryScope.user !== memoryScope.user) return false;
  if (queryScope.chat && memoryScope.chat && queryScope.chat !== memoryScope.chat) return false;
  // thread 层特殊处理：查询有 thread → 必须精确匹配（或记忆为 NULL）
  if (queryScope.thread && memoryScope.thread && queryScope.thread !== memoryScope.thread) return false;
  return true;
}

/**
 * v2.0：生成参数化 SQL WHERE 子句。
 *
 * includeScopes：OR 连接，每个 scope 生成六层 AND 匹配。
 * 每层语义：(col = ? OR col IS NULL)——精确匹配或该记忆未限定。
 *
 * excludeScopes：AND 连接，每个 scope 生成六层 OR 排除。
 * 每层语义：(col != ? OR col IS NULL)——排除精确匹配，但保留 NULL 通配。
 *
 * @returns { clause, params } — clause 以 " AND " 开头（可追加到 WHERE status='active' 后）
 */
export function buildScopeFilterClauseV2(filter: ScopeFilterV2): { clause: string; params: (string | null)[] } {
  const conditions: string[] = [];
  const params: (string | null)[] = [];

  // — Include scopes —
  if (filter.includeScopes.length > 0) {
    const includeGroups = filter.includeScopes.map(s => {
      const parts: string[] = [];
      if (s.platform)  { parts.push('(scope_platform = ? OR scope_platform IS NULL)'); params.push(s.platform); }
      if (s.workspace) { parts.push('(scope_workspace = ? OR scope_workspace IS NULL)'); params.push(s.workspace); }
      if (s.agent)     { parts.push('(scope_agent = ? OR scope_agent IS NULL)'); params.push(s.agent); }
      if (s.user)      { parts.push('(scope_user = ? OR scope_user IS NULL)'); params.push(s.user); }
      if (s.chat)      { parts.push('(scope_chat = ? OR scope_chat IS NULL)'); params.push(s.chat); }
      if (s.thread)    { parts.push('(scope_thread = ? OR scope_thread IS NULL)'); params.push(s.thread); }
      return parts.length > 0 ? `(${parts.join(' AND ')})` : '1=1';
    });
    conditions.push(`(${includeGroups.join(' OR ')})`);
  }

  // — Exclude scopes —
  if (filter.excludeScopes.length > 0) {
    const excludeGroups = filter.excludeScopes.map(s => {
      const parts: string[] = [];
      if (s.platform)  { parts.push('(scope_platform != ? OR scope_platform IS NULL)'); params.push(s.platform); }
      if (s.workspace) { parts.push('(scope_workspace != ? OR scope_workspace IS NULL)'); params.push(s.workspace); }
      if (s.agent)     { parts.push('(scope_agent != ? OR scope_agent IS NULL)'); params.push(s.agent); }
      if (s.user)      { parts.push('(scope_user != ? OR scope_user IS NULL)'); params.push(s.user); }
      if (s.chat)      { parts.push('(scope_chat != ? OR scope_chat IS NULL)'); params.push(s.chat); }
      if (s.thread)    { parts.push('(scope_thread != ? OR scope_thread IS NULL)'); params.push(s.thread); }
      return parts.length > 0 ? `(${parts.join(' OR ')})` : '1=1';
    });
    conditions.push(excludeGroups.join(' AND '));
  }

  // — Cross-scope sharing（移植 v1.0 B-2）—
  if (filter.allowCrossScope && filter.sharingMode && filter.sharingMode !== 'isolated') {
    if (filter.sharingMode === 'shared') {
      // 完全共享：不追加额外限制
    } else if (filter.sharingMode === 'mixed' && filter.sharedCategories?.length) {
      const ph = filter.sharedCategories.map(() => '?').join(', ');
      filter.sharedCategories.forEach(c => params.push(c));
      conditions.push(`(category IN (${ph}))`);
    }
    if (filter.allowedAgents?.length) {
      const agentPh = filter.allowedAgents.map(() => '?').join(', ');
      filter.allowedAgents.forEach(aid => params.push(aid));
      conditions.push(`(scope_agent IN (${agentPh}))`);
    }
  }

  if (conditions.length === 0) return { clause: '', params: [] };
  return { clause: ` AND ${conditions.join(' AND ')}`, params };
}
