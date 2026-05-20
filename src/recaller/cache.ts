/**
 * brain-memory — Recall cache（查询缓存）
 *
 * v1.6.0 A-1: LRU 缓存 + 脏标记失效
 *
 * 缓存 recall() 结果，命中时跳过向量嵌入 → PPR → 排序全流程。
 *
 * 失效条件：
 *   1. 存在 dirty nodes（图有变更）
 *   2. TTL 过期（默认 5 分钟，安全兜底）
 *   3. 缓存容量满 → LRU 淘汰最久未访问
 */

import type { RecallResult } from '../types';
import type { ScopeFilter } from '../scope/isolation';
import type { IStorageAdapter } from '../store/adapter';

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

  // ─── Public API ─────────────────────────────────────────────

  /** 生成缓存键：查询 + 范围过滤 + 源过滤。同一查询不同范围 = 不同缓存 */
  key(query: string, scopeFilter?: ScopeFilter, sourceFilter?: 'user' | 'assistant' | 'both'): string {
    const scopeKey = scopeFilter
      ? `${JSON.stringify(scopeFilter.includeScopes)}|${JSON.stringify(scopeFilter.excludeScopes)}|${scopeFilter.sharingMode || ''}|${scopeFilter.currentAgentId || ''}`
      : '';
    return `${query}::${scopeKey}::${sourceFilter || ''}`;
  }

  /** 检查缓存是否有效（图无脏节点 + TTL 未过期） */
  isValid(storage: IStorageAdapter): boolean {
    return storage.getDirtyNodes().size === 0;
  }

  /** 获取缓存结果。命中时 LRU 刷新（移到队尾）。返回 null 表示未命中 */
  get(query: string, scopeFilter?: ScopeFilter, sourceFilter?: 'user' | 'assistant' | 'both'): RecallResult | null {
    const k = this.key(query, scopeFilter, sourceFilter);
    const entry = this.cache.get(k);
    if (!entry) return null;

    // TTL 检查
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(k);
      return null;
    }

    // LRU：移到队尾（最新使用）
    this.cache.delete(k);
    this.cache.set(k, entry);

    return entry.result;
  }

  /** 存入缓存结果。容量满时 LRU 淘汰最旧条目 */
  set(query: string, result: RecallResult, scopeFilter?: ScopeFilter, sourceFilter?: 'user' | 'assistant' | 'both'): void {
    const k = this.key(query, scopeFilter, sourceFilter);

    // LRU 淘汰
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(k, { result, timestamp: Date.now() });
  }

  /** 强制清空缓存（如知识提取后脏标记触发） */
  invalidate(): void {
    this.cache.clear();
  }

  // ─── Diagnostics ────────────────────────────────────────────

  /** 缓存统计（诊断用） */
  getStats(): { size: number; maxSize: number; hitRate?: number } {
    return { size: this.cache.size, maxSize: this.maxSize };
  }

  /** 从缓存键列表中清除过期条目 */
  pruneExpired(): void {
    const now = Date.now();
    for (const [k, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttlMs) this.cache.delete(k);
    }
  }
}
