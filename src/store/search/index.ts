/**
 * brain-memory — ISearchIndex 伴随语义索引接口 (v2.0.0 S-2)
 *
 * 非真值存储（真值在 SQLite / IStorageAdapter），可随时从 SQLite 全量重建。
 * 当前实现: LanceDB。未来可扩展到 Pinecone、Weaviate 等。
 */

import type { BmNode, ScopeFilterV2 } from '../../types';

// ─── Types ────────────────────────────────────────────────

/** 语义搜索结果: 节点 ID + cosine 相似度分数 [0, 1] */
export interface ScoredNodeId {
  nodeId: string;
  score: number;
}

// ─── Interface ────────────────────────────────────────────

/** 伴随语义索引。存 embedding → nodeId 映射，不存真值。 */
export interface ISearchIndex {
  /** 索引单个节点。node.content 完整，embedding 由调用方计算。 */
  indexNode(node: BmNode, embedding: number[]): Promise<void>;

  /** 批量索引。LanceDB add() 单次批量比逐条快 10-50x。 */
  indexNodes(items: Array<{ node: BmNode; embedding: number[] }>): Promise<void>;

  /** 从索引中删除节点。 */
  removeNode(nodeId: string): Promise<void>;

  /** 语义搜索。返回按 cosine 相似度排序的节点 ID + 分数。 */
  semanticSearch(queryVec: number[], limit: number, filter?: ScopeFilterV2): Promise<ScoredNodeId[]>;

  /** 从 SQLite 真值源全量重建索引。drop → batchEmbed → bulkIndex。 */
  rebuild(sourceNodes: BmNode[], embedFn: (text: string) => Promise<number[]>): Promise<void>;

  /** 索引中的节点数。用于健康检查验证一致性。 */
  count(): Promise<number>;

  /** 关闭索引连接。 */
  close(): Promise<void>;
}
