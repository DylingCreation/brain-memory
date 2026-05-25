/**
 * brain-memory — Storage shared helpers (v2.0.0 S-5)
 */
import type { BmNode, BmEdge, EdgeType, GraphNodeType, MemoryCategory, NodeStatus } from '../../types';

export type SqlRow = Record<string, unknown>;

export function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function toNode(r: SqlRow): BmNode {
  return {
    id: r.id as string, type: r.type as GraphNodeType, category: ((r.category || typeToCategory(r.type as string)) as MemoryCategory),
    name: r.name as string, description: (r.description as string) ?? '', content: r.content as string,
    status: r.status as NodeStatus, validatedCount: r.validated_count as number,
    sourceSessions: JSON.parse((r.source_sessions as string) ?? '[]'),
    communityId: (r.community_id as string) ?? null, pagerank: (r.pagerank as number) ?? 0,
    importance: (r.importance as number) ?? 0.5, accessCount: (r.access_count as number) ?? 0,
    lastAccessedAt: (r.last_accessed as number) ?? 0,
    temporalType: ((r.temporal_type as string) ?? 'static') as 'static' | 'dynamic',
    source: (r.source as string) as 'user' | 'assistant',
    scopePlatform: (r.scope_platform as string) ?? null,
    scopeWorkspace: (r.scope_workspace as string) ?? null,
    scopeAgent: (r.scope_agent as string) ?? null,
    scopeUser: (r.scope_user as string) ?? null,
    scopeChat: ((r.scope_chat as string) ?? (r.scope_session as string)) ?? null,
    scopeThread: (r.scope_thread as string) ?? null,
    scopeId: (r.scope_id as string) ?? null,
    scopeSession: (r.scope_session as string) ?? null,
    createdAt: r.created_at as number, updatedAt: r.updated_at as number,
  };
}

function typeToCategory(type: string): MemoryCategory {
  if (type === 'TASK') return 'tasks';
  if (type === 'SKILL') return 'skills';
  return 'events';
}

export function toEdge(r: SqlRow): BmEdge {
  return {
    id: r.id as string, fromId: r.from_id as string, toId: r.to_id as string, type: r.type as EdgeType,
    instruction: r.instruction as string, condition: (r.condition as string) ?? undefined,
    sessionId: r.session_id as string, createdAt: r.created_at as number,
  };
}

export function normalizeName(name: string): string {
  const normalized = name.trim().toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fff-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
  if (!normalized) return name.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '') || 'unnamed';
  return normalized;
}
