/**
 * brain-memory — Database migration system
 *
 * Manages schema version tracking and incremental migrations.
 * Ensures old databases can be smoothly upgraded to the latest schema.
 *
 * Current schema version: 1 (v0.1.x baseline)
 *
 * @module migrate
 */

import { type DatabaseSyncInstance } from '@photostructure/sqlite';
import { createHash } from 'crypto';

// ─── Constants ─────────────────────────────────────────────────

/**
 * Current schema version.
 * Increment this number and add a new migrateTo_vN function
 * whenever the schema changes in a future release.
 */
export const CURRENT_SCHEMA_VERSION = 2;

/**
 * Table that stores schema metadata (version, etc.).
 * Created during migration — existing databases that lack this table
 * will get it created automatically.
 */
const META_TABLE = `
CREATE TABLE IF NOT EXISTS bm_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

// ─── Public API ────────────────────────────────────────────────

/**
 * Get the current schema version from a database.
 * Returns 0 if the bm_meta table doesn't exist (pre-migration database).
 */
export function getSchemaVersion(db: DatabaseSyncInstance): number {
  try {
    const row = db.prepare('SELECT value FROM bm_meta WHERE key = \'schema_version\'').get() as { value: string } | undefined;
    if (!row) return 0;
    return parseInt(row.value, 10);
  } catch {
    // bm_meta table doesn't exist yet — this is a pre-migration database
    return 0;
  }
}

/**
 * Run all pending migrations on the database.
 *
 * Idempotent: calling it on an already-up-to-date database is a no-op.
 * Safe to call on every init().
 *
 * @param db — DatabaseSyncInstance
 * @returns The schema version after migration
 */
export function migrate(db: DatabaseSyncInstance): number {
  // Step 1: Ensure bm_meta table exists (covers pre-v1 databases)
  db.exec(META_TABLE);

  // Step 2: Read current version (now safe — table always exists)
  let version = getSchemaVersion(db);

  // Step 3: If version is 0, this is a brand new or pre-migration DB.
  // The current SCHEMA in db.ts already created all tables, so we just
  // need to record the version as 1.
  if (version === 0) {
    db.prepare('INSERT INTO bm_meta (key, value) VALUES (\'schema_version\', \'1\')').run();
    version = 1;
  }

  // Step 4: Apply incremental migrations
  if (version < 2) { migrateToV2_ScopeUpgrade(db); version = 2; }

  return version;
}

/**
 * v2.0 scope 升级迁移。
 * 新增五列 + scope_id 计算 + 旧数据映射。
 * 幂等：列已存在时 try-catch 跳过。
 */
function migrateToV2_ScopeUpgrade(db: DatabaseSyncInstance): void {
  // 检查 bm_nodes 表是否存在（空数据库可能无此表）
  const tableCheck = db.prepare('SELECT name FROM sqlite_master WHERE type=\'table\' AND name=\'bm_nodes\'').get() as { name: string } | undefined;
  if (!tableCheck) {
    // 无 bm_nodes 表：只更新版本号，跳过列迁移
    db.prepare('UPDATE bm_meta SET value = \'2\' WHERE key = \'schema_version\'').run();
    return;
  }
  // 1. 新增六层 scope 列（幂等：列已存在则跳过）
  const newColumns = [
    'ALTER TABLE bm_nodes ADD COLUMN scope_platform TEXT',
    'ALTER TABLE bm_nodes ADD COLUMN scope_user TEXT',
    'ALTER TABLE bm_nodes ADD COLUMN scope_chat TEXT',
    'ALTER TABLE bm_nodes ADD COLUMN scope_thread TEXT',
    'ALTER TABLE bm_nodes ADD COLUMN scope_id TEXT',
  ];
  for (const sql of newColumns) {
    try { db.exec(sql); } catch { /* 列已存在，跳过 */ }
  }

  // 2. 旧数据映射：scope_session → scope_chat
  db.exec('UPDATE bm_nodes SET scope_chat = scope_session WHERE scope_chat IS NULL AND scope_session IS NOT NULL');

  // 3. 为已有数据生成 scope_id
  // ⚠️ 必须与 src/scope/isolation.ts 的 computeScopeId() 使用相同算法 (sha256 → hex slice 0,16)
  // v2.0.1 fix: 原 SQL 使用 lower(hex(...)) 产生 ASCII hex 编码，与 JS sha256 结果完全不同，
  // 导致 scope 隔离失效。改用 JS 逐行计算，确保迁移数据与新数据 scope_id 一致。
  const computeScopeIdV2 = (platform: string | null, workspace: string | null, agent: string | null, user: string | null, chat: string | null, thread: string | null): string => {
    const parts = [
      platform ?? '*',
      workspace ?? '*',
      agent ?? '*',
      user ?? '*',
      chat ?? '*',
      thread ?? '*',
    ];
    return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);
  };

  const rows = db.prepare(`
    SELECT id, scope_platform, scope_workspace, scope_agent,
           scope_user, scope_chat, scope_thread
    FROM bm_nodes
    WHERE scope_id IS NULL OR scope_id = ''
  `).all() as Array<{
    id: string;
    scope_platform: string | null;
    scope_workspace: string | null;
    scope_agent: string | null;
    scope_user: string | null;
    scope_chat: string | null;
    scope_thread: string | null;
  }>;

  if (rows.length > 0) {
    const updateStmt = db.prepare('UPDATE bm_nodes SET scope_id = ? WHERE id = ?');
    const txFn = () => {
      for (const row of rows) {
        const scopeId = computeScopeIdV2(
          row.scope_platform, row.scope_workspace, row.scope_agent,
          row.scope_user, row.scope_chat, row.scope_thread
        );
        updateStmt.run(scopeId, row.id);
      }
    };
    db.transaction(txFn)();
  }

  // 4. 建索引（幂等）
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_nodes_scope_id ON bm_nodes(scope_id)',
    'CREATE INDEX IF NOT EXISTS idx_nodes_scope_platform ON bm_nodes(scope_platform)',
    'CREATE INDEX IF NOT EXISTS idx_nodes_scope_chat ON bm_nodes(scope_chat)',
    'CREATE INDEX IF NOT EXISTS idx_nodes_scope_user ON bm_nodes(scope_user)',
    'CREATE INDEX IF NOT EXISTS idx_nodes_scope_agent ON bm_nodes(scope_agent)',
  ];
  for (const sql of indexes) { db.exec(sql); }

  // 5. 更新版本号
  db.prepare('UPDATE bm_meta SET value = \'2\' WHERE key = \'schema_version\'').run();
}
