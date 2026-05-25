import { type DatabaseSyncInstance } from '@photostructure/sqlite';
import { createHash } from 'crypto';
import { type SqlRow } from './_helpers';

// ─── Vector ops ────────────────────────────────────────────────

/** Store or replace an embedding vector for a node. Content hash is saved for cache-hit detection. */
/** 存储或替换节点的嵌入向量。 */
export function saveVector(db: DatabaseSyncInstance, nodeId: string, content: string, vec: number[]): void {
  const hash = createHash('md5').update(content).digest('hex');
  const f32 = vec instanceof Float32Array ? vec : new Float32Array(vec);
  const blob = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
  db.prepare('INSERT OR REPLACE INTO bm_vectors(node_id, embedding, hash) VALUES (?,?,?)')
    .run(nodeId, blob, hash);
}

/** Retrieve the stored embedding vector for a node. Returns null if not found. */
/** 获取节点的嵌入向量(Float32Array)。返回 null 若不存在。 */
export function getVector(db: DatabaseSyncInstance, nodeId: string): Float32Array | null {
  const r = db.prepare('SELECT embedding FROM bm_vectors WHERE node_id=?').get(nodeId) as SqlRow;
  if (!r?.embedding) return null;
  const raw = r.embedding as Uint8Array;
  return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
}

/** Retrieve the MD5 content hash stored alongside a node's embedding vector. Returns null if not found. */
/** 获取节点向量的内容哈希(用于缓存检测)。 */
export function getVectorHash(db: DatabaseSyncInstance, nodeId: string): string | null {
  const r = db.prepare('SELECT hash FROM bm_vectors WHERE node_id=?').get(nodeId) as SqlRow;
  return (r?.hash as string) ?? null;
}

/** Load all stored node-embedding pairs. Returns Float32Array embeddings for in-memory operations (e.g., cosine similarity). */
/** 加载所有节点的嵌入向量对。用于去重检测。 */
export function getAllVectors(db: DatabaseSyncInstance): Array<{ nodeId: string; embedding: Float32Array }> {
  const rows = db.prepare('SELECT node_id, embedding FROM bm_vectors').all() as SqlRow[];
  return rows.map(r => {
    const raw = r.embedding as Uint8Array;
    return { nodeId: r?.node_id as string, embedding: new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4) };
  });
}

