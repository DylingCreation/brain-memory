import { type DatabaseSyncInstance } from '@photostructure/sqlite';
import { createHash } from 'crypto';
import { uid, type SqlRow } from './_helpers';

// ─── Community summaries ───────────────────────────────────────

/** 社区摘要记录。包含 ID、摘要文本、节点数和时间戳。 */
export interface CommunitySummary {
  id: string; summary: string; nodeCount: number;
  createdAt: number; updatedAt: number;
}

/** 存储或更新社区摘要和嵌入向量。 */
export function upsertCommunitySummary(
  db: DatabaseSyncInstance, id: string, summary: string, nodeCount: number, embedding?: number[],
): void {
  const now = Date.now();
  const blob = embedding ? new Uint8Array(new Float32Array(embedding).buffer) : null;
  const ex = db.prepare('SELECT id FROM bm_communities WHERE id=?').get(id) as SqlRow;
  if (ex) {
    if (blob) {
      db.prepare('UPDATE bm_communities SET summary=?, node_count=?, embedding=?, updated_at=? WHERE id=?')
        .run(summary, nodeCount, blob, now, id);
    } else {
      db.prepare('UPDATE bm_communities SET summary=?, node_count=?, updated_at=? WHERE id=?')
        .run(summary, nodeCount, now, id);
    }
  } else {
    db.prepare('INSERT INTO bm_communities (id, summary, node_count, embedding, created_at, updated_at) VALUES (?,?,?,?,?,?)')
      .run(id, summary, nodeCount, blob, now, now);
  }
}

/** 按 ID 获取社区摘要。返回 null 若不存在。 */
export function getCommunitySummary(db: DatabaseSyncInstance, id: string): CommunitySummary | null {
  const r = db.prepare('SELECT * FROM bm_communities WHERE id=?').get(id) as SqlRow;
  if (!r) return null;
  return { id: r.id as string, summary: r.summary as string, nodeCount: r.node_count as number, createdAt: r.created_at as number, updatedAt: r.updated_at as number };
}

/** #10 fix: Batch fetch all community summaries in a single query */
/** 批量获取所有社区摘要(单次查询)。 */
export function getAllCommunitySummaries(db: DatabaseSyncInstance): Map<string, CommunitySummary> {
  const rows = db.prepare('SELECT * FROM bm_communities').all() as SqlRow[];
  const map = new Map<string, CommunitySummary>();
  for (const r of rows) {
    map.set(r.id as string, { id: r.id as string, summary: r.summary as string, nodeCount: r.node_count as number, createdAt: r.created_at as number, updatedAt: r.updated_at as number });
  }
  return map;
}

/** Delete orphaned community summaries whose community_id no longer references any active node. Returns the number of deleted rows. */
/** 删除不再存在的社区的摘要记录。 */
export function pruneCommunitySummaries(db: DatabaseSyncInstance): number {
  const result = db.prepare(`
    DELETE FROM bm_communities WHERE id NOT IN (
      SELECT DISTINCT community_id FROM bm_nodes WHERE community_id IS NOT NULL AND status='active'
    )`).run();
  return result.changes;
}

