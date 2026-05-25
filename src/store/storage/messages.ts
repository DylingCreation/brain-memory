import { type DatabaseSyncInstance } from '@photostructure/sqlite';
import { uid, type SqlRow } from './_helpers';

// ─── Message CRUD ──────────────────────────────────────────────

/** Save a conversation message. INSERT OR IGNORE - duplicate (same id) messages are silently skipped. */
/** 保存对话消息。 */
export function saveMessage(
  db: DatabaseSyncInstance, sid: string, turn: number, role: string, content: unknown
): void {
  db.prepare(`INSERT OR IGNORE INTO bm_messages (id, session_id, turn_index, role, content, extracted, created_at)
    VALUES (?,?,?,?,?,0,?)`)
    .run(uid('m'), sid, turn, role, JSON.stringify(content), Date.now());
}

/** Return messages that have not yet been processed for memory extraction, ordered by turn_index. */
/** 获取未提取的会话消息(按 turn_index 排序)。 */
export function getUnextracted(db: DatabaseSyncInstance, sid: string, limit: number): Record<string, unknown>[] {
  return db.prepare('SELECT * FROM bm_messages WHERE session_id=? AND extracted=0 ORDER BY turn_index LIMIT ?')
    .all(sid, limit) as SqlRow[];
}

/** Mark messages up to the given turn_index as extracted (processed for memory). */
/** 标记消息为已提取(截至指定轮次)。 */
export function markExtracted(db: DatabaseSyncInstance, sid: string, upToTurn: number): void {
  db.prepare('UPDATE bm_messages SET extracted=1 WHERE session_id=? AND turn_index<=?')
    .run(sid, upToTurn);
}

/** Retrieve episodic messages near a given timestamp across multiple sessions. Returns text snippets within maxChars budget, ordered by temporal proximity to nearTime. */
/** 获取指定时间附近的对话片段(用于场景回忆)。 */
export function getEpisodicMessages(
  db: DatabaseSyncInstance, sessionIds: string[], nearTime: number, maxChars = 1500,
): Array<{ sessionId: string; role: string; text: string }> {
  if (!sessionIds.length) return [];
  const results: Array<{ sessionId: string; role: string; text: string }> = [];
  let totalChars = 0;

  for (const sid of sessionIds) {
    const msgs = db.prepare(`
      SELECT role, content FROM bm_messages
      WHERE session_id=? AND role IN ('user','assistant')
      ORDER BY ABS(turn_index - (
        SELECT turn_index FROM bm_messages WHERE session_id=? AND role='user'
        ORDER BY ABS(created_at - ?) LIMIT 1
      )) LIMIT 10
    `).all(sid, sid, nearTime) as SqlRow[];

    for (const m of msgs) {
      const text = (() => { try { return JSON.parse(m.content as string); } catch { return m.content; } })();
      const s = typeof text === 'string' ? text : JSON.stringify(text);
      if (totalChars + s.length > maxChars) break;
      results.push({ sessionId: sid, role: m.role as string, text: s });
      totalChars += s.length;
    }
    if (totalChars >= maxChars) break;
  }
  return results;
}

