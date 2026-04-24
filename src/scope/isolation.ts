/**
 * brain-memory — Multi-scope isolation
 *
 * Isolates memories by session/agent/workspace scope.
 * Controls read/write permissions per scope.
 * Supports cross-scope retrieval when authorized.
 */

export interface MemoryScope {
  sessionId?: string;
  agentId?: string;
  workspaceId?: string;
}

export interface ScopeFilter {
  includeScopes: MemoryScope[];
  excludeScopes: MemoryScope[];
  allowCrossScope: boolean;
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
    scope.sessionId ?? "*",
    scope.agentId ?? "*",
    scope.workspaceId ?? "*",
  ].join("|");
}

/**
 * Build a parameterized SQL WHERE clause for scope filtering.
 * Returns `{ clause, params }` where `clause` contains `?` placeholders
 * and `params` holds the bound values — preventing SQL injection.
 * Returns `{ clause: "", params: [] }` if no filtering needed.
 */
export function buildScopeFilterClause(filter: ScopeFilter): { clause: string; params: any[] } {
  const conditions: string[] = [];
  const params: any[] = [];

  // Include scopes
  if (filter.includeScopes.length > 0) {
    const includeClauses = filter.includeScopes.map(s => {
      const parts: string[] = [];
      if (s.sessionId) { parts.push(`scope_session = ?`); params.push(s.sessionId); }
      if (s.agentId) { parts.push(`scope_agent = ?`); params.push(s.agentId); }
      if (s.workspaceId) { parts.push(`scope_workspace = ?`); params.push(s.workspaceId); }
      return parts.length > 0 ? `(${parts.join(" AND ")})` : "1=1";  // #18 fix: AND for includeScopes (was OR, too permissive)
    });
    conditions.push(`(${includeClauses.join(" OR ")})`);
  }

  // Exclude scopes
  if (filter.excludeScopes.length > 0) {
    const excludeClauses = filter.excludeScopes.map(s => {
      const parts: string[] = [];
      if (s.sessionId) { parts.push(`scope_session != ?`); params.push(s.sessionId); }
      if (s.agentId) { parts.push(`scope_agent != ?`); params.push(s.agentId); }
      if (s.workspaceId) { parts.push(`scope_workspace != ?`); params.push(s.workspaceId); }
      return parts.length > 0 ? `(${parts.join(" AND ")})` : "1=1";
    });
    conditions.push(excludeClauses.join(" AND "));
  }

  if (conditions.length === 0) return { clause: "", params: [] };
  return { clause: ` AND ${conditions.join(" AND ")}`, params };
}
