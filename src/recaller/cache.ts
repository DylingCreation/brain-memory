/**
 * brain-memory — Recall cache（查询缓存）
 *
 * v1.6.0 A-1: LRU 缓存 + 脏标记失效
 * v2.0.0: 支持 ScopeFilterV2（六层 scope）
 */

import type { RecallResult } from '../types';
import type { ScopeFilter } from '../scope/isolation';
import type { ScopeFilterV2 } from '../types';
import type { IStorageAdapter } from '../store/adapter';

type AnyFilter = ScopeFilter | ScopeFilterV2;

/** Subset of fields needed for cache key generation, shared by both ScopeFilter and ScopeFilterV2. */
interface CacheKeyFields {
  includeScopes?: unknown[];
  excludeScopes?: unknown[];
  sharingMode?: string;
  currentAgentId?: string;
}

interface CacheEntry {
  result: RecallResult;
  timestamp: number;
}

export class RecallCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number;
  private ttlMs: number;

  constructor(maxSize = 100, ttlMs = 5 * 60 * 1000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  key(query: string, scopeFilter?: AnyFilter, sourceFilter?: 'user' | 'assistant' | 'both'): string {
    const f = (scopeFilter as unknown as CacheKeyFields) ?? ({} as CacheKeyFields);
    const inc = f.includeScopes ?? [];
    const exc = f.excludeScopes ?? [];
    const scopeKey = scopeFilter
      ? `${JSON.stringify(inc)}|${JSON.stringify(exc)}|${f.sharingMode || ''}|${f.currentAgentId || ''}`
      : '';
    return `${query}::${scopeKey}::${sourceFilter || ''}`;
  }

  isValid(storage: IStorageAdapter): boolean {
    return storage.getDirtyNodes().size === 0;
  }

  get(query: string, scopeFilter?: AnyFilter, sourceFilter?: 'user' | 'assistant' | 'both'): RecallResult | null {
    const k = this.key(query, scopeFilter, sourceFilter);
    const entry = this.cache.get(k);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(k);
      return null;
    }
    this.cache.delete(k);
    this.cache.set(k, entry);
    return entry.result;
  }

  set(query: string, result: RecallResult, scopeFilter?: AnyFilter, sourceFilter?: 'user' | 'assistant' | 'both'): void {
    const k = this.key(query, scopeFilter, sourceFilter);
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(k, { result, timestamp: Date.now() });
  }

  invalidate(): void {
    this.cache.clear();
  }

  getStats(): { size: number; maxSize: number; hitRate?: number } {
    return { size: this.cache.size, maxSize: this.maxSize };
  }

  pruneExpired(): void {
    const now = Date.now();
    for (const [k, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttlMs) this.cache.delete(k);
    }
  }
}
