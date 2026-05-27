/**
 * brain-memory — Health Service
 *
 * Provides engine statistics, health checks, and storage diagnostics.
 *
 * Extracted from ContextEngine (v2.0.0 → v2.1.0 refactor).
 *
 * Authors: brain-memory contributors
 */

import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import type { BmConfig, BmNode } from '../types';
import type { IStorageAdapter } from '../store/adapter';
import { getEmbedCacheStats, type EmbedCacheStats } from '../engine/embed';

/** 引擎统计信息接口。包含节点、边、社区、向量、会话等完整统计。 */
export interface EngineStats {
  nodeCount: number; edgeCount: number; sessionCount: number;
  nodes: {
    total: number; active: number; deprecated: number;
    byType: { task: number; skill: number; event: number };
    byCategory: { profile: number; preferences: number; entities: number; events: number; tasks: number; skills: number; cases: number; patterns: number };
    byTemporalType: { static: number; dynamic: number };
    bySource: { user: number; assistant: number };
  };
  edges: { total: number };
  communities: number; vectors: number; dbSizeBytes: number; schemaVersion: number; uptimeMs: number;
  embedCache: EmbedCacheStats; queryTimeMs: number;
}

/** 组件健康状态：ok=正常, error=异常。 */
export type HealthComponentStatus = 'ok' | 'error';
/** LLM 健康状态：ok=正常, not_configured=未配置, error=异常。 */
export type HealthLlmStatus = 'ok' | 'not_configured' | 'error';
/** Embedding 健康状态：ok=正常, not_configured=未配置, error=异常。 */
export type HealthEmbedStatus = 'ok' | 'not_configured' | 'error';
/** 引擎整体健康状态：healthy=健康, degraded=降级, unhealthy=不健康。 */
export type HealthOverallStatus = 'healthy' | 'degraded' | 'unhealthy';

/** 健康检查统计信息。 */
export interface HealthStats { nodeCount: number; edgeCount: number; vectorCount: number; communityCount: number; dbSizeBytes: number; }

/** 健康检查完整响应。包含引擎状态、各组件状态和统计信息。 */
export interface HealthStatus {
  status: HealthOverallStatus; uptimeMs: number; schemaVersion: number;
  components: {
    database: { status: HealthComponentStatus; detail?: string };
    llm: { status: HealthLlmStatus; detail?: string };
    embedding: { status: HealthEmbedStatus; detail?: string };
  };
  stats?: HealthStats;
}

export class HealthService {
  constructor(
    private storage: IStorageAdapter,
    private config: BmConfig,
    private llmEnabled: boolean,
    private embedEnabled: boolean,
    private createdAt: number,
  ) {}

  /** Get engine statistics (node/edge counts, category distribution, etc.). */
  getStats(): EngineStats {
    const startMs = Date.now();
    const stats = this.storage.getStats();
    const dbPath = this.config.dbPath.replace(/^~/, homedir());
    let dbSizeBytes = 0;
    try { if (existsSync(dbPath)) dbSizeBytes = statSync(dbPath).size; } catch { /* stat may fail */ }
    const uptimeMs = Date.now() - this.createdAt;
    const cacheStats = getEmbedCacheStats();
    return {
      nodeCount: stats.totalNodes, edgeCount: stats.totalEdges, sessionCount: 0,
      nodes: {
        total: stats.totalNodes, active: stats.activeNodes, deprecated: stats.deprecatedNodes,
        byType: stats.byType,
        byCategory: stats.nodesByCategory,
        byTemporalType: stats.byTemporalType,
        bySource: stats.bySource,
      },
      edges: { total: stats.totalEdges },
      communities: stats.communityCount, vectors: stats.vectorCount,
      dbSizeBytes, schemaVersion: stats.schemaVersion, uptimeMs, embedCache: cacheStats,
      queryTimeMs: Date.now() - startMs,
    };
  }

  /** Health check: database, LLM, and embedding component status. */
  healthCheck(): HealthStatus {
    let dbStatus: HealthComponentStatus = 'ok';
    let dbDetail: string | undefined;
    try {
      if (!this.storage.isConnected()) { dbStatus = 'error'; dbDetail = 'Storage not connected'; }
    } catch (error) { dbStatus = 'error'; dbDetail = (error as Error).message; }
    const llmStatus: HealthLlmStatus = this.llmEnabled ? 'ok' : 'not_configured';
    let llmDetail: string | undefined;
    if (!this.llmEnabled) llmDetail = 'No LLM API key configured';
    const embedStatus: HealthEmbedStatus = this.embedEnabled ? 'ok' : 'not_configured';
    let embedDetail: string | undefined;
    if (!this.embedEnabled) embedDetail = 'No Embedding API key configured';
    const stats = this.storage.getStats();
    const uptimeMs = Date.now() - this.createdAt;
    let healthStats: HealthStats | undefined;
    if (dbStatus === 'ok') {
      const dbPath = this.config.dbPath.replace(/^~/, homedir());
      let dbSizeBytes = 0;
      try { if (existsSync(dbPath)) dbSizeBytes = statSync(dbPath).size; } catch { /* stat may fail */ }
      healthStats = { nodeCount: stats.totalNodes, edgeCount: stats.totalEdges, vectorCount: stats.vectorCount, communityCount: stats.communityCount, dbSizeBytes };
    }
    let status: HealthOverallStatus = 'healthy';
    if (dbStatus === 'error') status = 'unhealthy';
    else if (!this.llmEnabled || !this.embedEnabled) status = 'degraded';
    const result: HealthStatus = {
      status, uptimeMs, schemaVersion: stats.schemaVersion,
      components: {
        database: { status: dbStatus, ...(dbDetail ? { detail: dbDetail } : {}) },
        llm: { status: llmStatus, ...(llmDetail ? { detail: llmDetail } : {}) },
        embedding: { status: embedStatus, ...(embedDetail ? { detail: embedDetail } : {}) },
      },
    };
    if (healthStats) result.stats = healthStats;
    return result;
  }

  /** Get all active nodes (delegates to storage). */
  getAllActiveNodes(): BmNode[] { return this.storage.findAllActive(); }

  /** Search nodes by query text (delegates to storage). */
  searchNodes(query: string, limit: number = 10): BmNode[] { return this.storage.searchNodes(query, limit); }

  /** Get the underlying storage adapter (for UI server, etc.). */
  getStorage(): IStorageAdapter { return this.storage; }
}
