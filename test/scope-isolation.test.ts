/**
 * brain-memory — Scope isolation tests
 */

import { describe, it, expect } from 'vitest';
import { buildScopeFilterClause } from '../src/scope/isolation';

describe('buildScopeFilterClause', () => {
  it('should return empty clause when no scope filter', () => {
    const result = buildScopeFilterClause({ includeScopes: [], excludeScopes: [], allowCrossScope: false });
    
    expect(result.clause).toBe('');
    expect(result.params).toEqual([]);
  });

  it('should handle include scopes correctly', () => {
    const scopeFilter = {
      includeScopes: [
        { sessionId: 'session1', agentId: 'agent1', workspaceId: 'workspace1', allowCrossScope: false }
      ],
      excludeScopes: [],
      allowCrossScope: false
    };
    
    const result = buildScopeFilterClause(scopeFilter);
    
    expect(result.clause).toContain('scope_session');
    expect(result.clause).toContain('scope_agent');
    expect(result.clause).toContain('scope_workspace');
    expect(result.params).toContain('session1');
    expect(result.params).toContain('agent1');
    expect(result.params).toContain('workspace1');
  });

  it('should handle exclude scopes correctly', () => {
    const scopeFilter = {
      includeScopes: [],
      excludeScopes: [
        { sessionId: 'session1', agentId: 'agent1', workspaceId: 'workspace1' }
      ],
      allowCrossScope: false
    };
    
    const result = buildScopeFilterClause(scopeFilter);
    
    expect(result.clause).toContain('!=');
    expect(result.clause).toContain('scope_session');
    expect(result.clause).toContain('scope_agent');
    expect(result.clause).toContain('scope_workspace');
    expect(result.params).toContain('session1');
    expect(result.params).toContain('agent1');
    expect(result.params).toContain('workspace1');
  });

  it('should handle mixed include and exclude scopes', () => {
    const scopeFilter = {
      includeScopes: [
        { sessionId: 'session1', agentId: null, workspaceId: null }
      ],
      excludeScopes: [
        { sessionId: 'session2', agentId: null, workspaceId: null }
      ],
      allowCrossScope: false
    };
    
    const result = buildScopeFilterClause(scopeFilter);
    
    expect(result.clause).toContain('AND');
    expect(result.clause).toContain('=');
    expect(result.clause).toContain('!=');
    expect(result.params).toContain('session1');
    expect(result.params).toContain('session2');
  });

  it('should handle allowCrossScope true', () => {
    const scopeFilter = {
      includeScopes: [],
      excludeScopes: [],
      allowCrossScope: true
    };
    
    const result = buildScopeFilterClause(scopeFilter);
    
    expect(result.clause).toBe('');
    expect(result.params).toEqual([]);
  });
});