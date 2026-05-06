/**
 * brain-memory — Multi-scope isolation
 *
 * Isolates memories by session/agent/workspace scope.
 * Controls read/write permissions per scope.
 * Supports cross-scope retrieval when authorized.
 */

import type { MemoryCategory, SharingMode } from "../types";

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

  // v1.0.0 B-2: Cross-scope sharing logic
  if (filter.allowCrossScope && filter.sharingMode && filter.sharingMode !== "isolated") {
    if (filter.sharingMode === "shared") {
      // Fully shared: no additional restriction
      // (allow all active nodes regardless of scope)
    } else if (filter.sharingMode === "mixed" && filter.sharedCategories && filter.sharedCategories.length > 0) {
      // Mixed mode: allow nodes from any agent, but only for shared categories
      const placeholders = filter.sharedCategories.map(() => "?").join(", ");
      filter.sharedCategories.forEach(cat => params.push(cat));
      conditions.push(`(category IN (${placeholders}))`);
    }
    // Additional agent restriction if allowedAgents is specified
    if (filter.allowedAgents && filter.allowedAgents.length > 0) {
      const agentPlaceholders = filter.allowedAgents.map(() => "?").join(", ");
      filter.allowedAgents.forEach(aid => params.push(aid));
      conditions.push(`(scope_agent IN (${agentPlaceholders}))`);
    }
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
