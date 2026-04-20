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

/** Escape a string for safe use in SQL literal (prevents injection) */
function sqlEscape(s: string): string {
  return s.replace(/'/g, "''");
}

/**
 * Build a SQL WHERE clause for scope filtering.
 * Returns empty string if no filtering needed.
 * All scope values are SQL-escaped to prevent injection.
 */
export function buildScopeFilterClause(filter: ScopeFilter): string {
  const conditions: string[] = [];

  // Include scopes
  if (filter.includeScopes.length > 0) {
    const includeClauses = filter.includeScopes.map(s => {
      const parts: string[] = [];
      if (s.sessionId) parts.push(`scope_session = '${sqlEscape(s.sessionId)}'`);
      if (s.agentId) parts.push(`scope_agent = '${sqlEscape(s.agentId)}'`);
      if (s.workspaceId) parts.push(`scope_workspace = '${sqlEscape(s.workspaceId)}'`);
      return parts.length > 0 ? `(${parts.join(" OR ")})` : "1=1";
    });
    conditions.push(`(${includeClauses.join(" OR ")})`);
  }

  // Exclude scopes
  if (filter.excludeScopes.length > 0) {
    const excludeClauses = filter.excludeScopes.map(s => {
      const parts: string[] = [];
      if (s.sessionId) parts.push(`scope_session != '${sqlEscape(s.sessionId)}'`);
      if (s.agentId) parts.push(`scope_agent != '${sqlEscape(s.agentId)}'`);
      if (s.workspaceId) parts.push(`scope_workspace != '${sqlEscape(s.workspaceId)}'`);
      return parts.length > 0 ? `(${parts.join(" AND ")})` : "1=1";
    });
    conditions.push(excludeClauses.join(" AND "));
  }

  return conditions.length > 0 ? ` AND ${conditions.join(" AND ")}` : "";
}
