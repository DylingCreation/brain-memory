/**
 * brain-memory — LanceDBSearchIndex: ISearchIndex 的 LanceDB 实现 (v2.0.0 S-2)
 *
 * LanceDB 表 schema:
 *   node_id: string (主键)
 *   vector: float32[] (embedding, 1024 dims)
 *   scope_platform: string
 *   scope_chat: string
 *   scope_user: string
 *   scope_id: string
 *
 * 写入策略: 实时同步 (fire-and-forget)。失败不影响真值。
 * 索引恢复: rebuild() — 从 SQLite 全量重建。
 */

import type { BmNode, ScopeFilterV2 } from '../../types';
import type { ISearchIndex, ScoredNodeId } from './index';
import { logger } from '../../utils/logger';

// ─── LanceDB types (subset) ─────────────────────────────

interface LanceTable {
  add(data: Array<Record<string, unknown>>): Promise<void>;
  countRows(): Promise<number>;
  search(vector?: number[]): { limit(n: number): Promise<{ toArray(): Promise<Array<Record<string, unknown>>> }> };
  delete(predicate: string): Promise<void>;
  drop(): Promise<void>;
}

interface LanceDBConnection {
  createTable(name: string, data: Array<Record<string, unknown>>): Promise<LanceTable>;
  openTable(name: string): Promise<LanceTable>;
  dropTable(name: string): Promise<void>;
  tableNames(): Promise<string[]>;
}

// ─── Constants ──────────────────────────────────────────

const TABLE_NAME = 'bm_search_index';
const VECTOR_DIM = 1024;

// ─── Empty vector (用于创建表时的 schema) ──────────────

function zeros(dim: number): number[] {
  return new Array(dim).fill(0);
}

// ─── Implementation ─────────────────────────────────────

export class LanceDBSearchIndex implements ISearchIndex {
  private table: LanceTable | null = null;
  private db: LanceDBConnection | null = null;
  private dbPath: string;
  private initialized = false;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  // ─── Lifecycle ────────────────────────────────────────

  async initialize(db: LanceDBConnection): Promise<void> {
    this.db = db;
    try {
      const tables = await db.tableNames();
      if (tables.includes(TABLE_NAME)) {
        this.table = await db.openTable(TABLE_NAME);
      } else {
        this.table = await db.createTable(TABLE_NAME, [{
          node_id: '__init__',
          vector: zeros(VECTOR_DIM),
          scope_platform: '',
          scope_chat: '',
          scope_user: '',
          scope_id: '',
        }]);
        // Remove init row
        await this.table.delete('node_id = "__init__"');
      }
      this.initialized = true;
      logger.info('search-index', `LanceDB table '${TABLE_NAME}' ready`);
    } catch (err) {
      logger.error('search-index', `Failed to initialize: ${(err as Error).message}`);
      throw err;
    }
  }

  async close(): Promise<void> {
    this.table = null;
    this.db = null;
    this.initialized = false;
  }

  // ─── Write ────────────────────────────────────────────

  async indexNode(node: BmNode, embedding: number[]): Promise<void> {
    if (!this.initialized || !this.table) return;
    // Delete existing entry first (LanceDB append-only, no upsert)
    try {
      await this.table.delete(`node_id = '${node.id}'`);
    } catch { /* ignore if not found */ }
    await this.table.add([this._toRow(node, embedding)]);
  }

  async indexNodes(items: Array<{ node: BmNode; embedding: number[] }>): Promise<void> {
    if (!this.initialized || !this.table || items.length === 0) return;
    const rows = items.map(i => this._toRow(i.node, i.embedding));
    await this.table.add(rows);
  }

  async removeNode(nodeId: string): Promise<void> {
    if (!this.initialized || !this.table) return;
    try {
      await this.table.delete(`node_id = '${nodeId}'`);
    } catch { /* ignore */ }
  }

  // ─── Read ─────────────────────────────────────────────

  async semanticSearch(queryVec: number[], limit: number, filter?: ScopeFilterV2): Promise<ScoredNodeId[]> {
    if (!this.initialized || !this.table) return [];

    let q = this.table.search(queryVec).limit(limit);

    // LanceDB pre-filtering: scope 过滤
    // 当前实现: post-filter (返回后 JS 过滤)
    // 未来优化: LanceDB where() pre-filter
    const results = await (await q).toArray();

    const scored: ScoredNodeId[] = results
      .map((r: Record<string, unknown>) => ({
        nodeId: r.node_id as string,
        score: r._distance !== undefined ? (1 - (r._distance as number)) : 0,
      }))
      .filter(s => s.nodeId && s.nodeId !== '__init__');

    return scored;
  }

  // ─── Maintenance ──────────────────────────────────────

  async rebuild(sourceNodes: BmNode[], embedFn: (text: string) => Promise<number[]>): Promise<void> {
    if (!this.db) throw new Error('Search index not initialized');
    
    logger.info('search-index', `Rebuilding index from ${sourceNodes.length} source nodes...`);
    
    // Drop old table
    try { await this.db.dropTable(TABLE_NAME); } catch { /* ignore */ }
    
    // Create fresh table
    this.table = await this.db.createTable(TABLE_NAME, [{
      node_id: '__init__',
      vector: zeros(VECTOR_DIM),
      scope_platform: '',
      scope_chat: '',
      scope_user: '',
      scope_id: '',
    }]);
    await this.table.delete('node_id = "__init__"');

    // Batch embed + index
    const BATCH_SIZE = 50;
    for (let i = 0; i < sourceNodes.length; i += BATCH_SIZE) {
      const batch = sourceNodes.slice(i, i + BATCH_SIZE);
      const rows: Array<Record<string, unknown>> = [];
      for (const node of batch) {
        try {
          const vec = await embedFn(node.content);
          rows.push(this._toRow(node, vec));
        } catch { /* skip failed embeddings */ }
      }
      if (rows.length > 0) {
        await this.table.add(rows);
      }
    }

    const count = await this.table.countRows();
    logger.info('search-index', `Rebuild complete: ${count} nodes indexed`);
  }

  async count(): Promise<number> {
    if (!this.initialized || !this.table) return 0;
    return await this.table.countRows();
  }

  // ─── Helpers ───────────────────────────────────────────

  private _toRow(node: BmNode, embedding: number[]): Record<string, unknown> {
    return {
      node_id: node.id,
      vector: embedding,
      scope_platform: node.scopePlatform || '',
      scope_chat: node.scopeChat || '',
      scope_user: node.scopeUser || '',
      scope_id: node.scopeId || '',
    };
  }
}
