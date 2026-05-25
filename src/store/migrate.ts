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
  const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='bm_nodes'").get() as { name: string } | undefined;
  if (!tableCheck) {
    // 无 bm_nodes 表：只更新版本号，跳过列迁移
    db.prepare("UPDATE bm_meta SET value = '2' WHERE key = 'schema_version'").run();
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
  db.exec(`UPDATE bm_nodes SET scope_chat = scope_session WHERE scope_chat IS NULL AND scope_session IS NOT NULL`);

  // 3. 为已有数据生成 scope_id（拼接六层 → 取低 8 字节 hex）
  // SQLite 没有内置 sha256，使用简化版：substr(hex(zeroblob(...)) 不可行。
  // 改用 hex 编码拼接字符串作为简易 hash（确定性 + 可索引）。
  db.exec(`
    UPDATE bm_nodes SET scope_id = lower(hex(
      COALESCE(scope_platform,'*') || '|' ||
      COALESCE(scope_workspace,'*') || '|' ||
      COALESCE(scope_agent,'*') || '|' ||
      COALESCE(scope_user,'*') || '|' ||
      COALESCE(scope_chat,'*') || '|' ||
      COALESCE(scope_thread,'*')
    ))
    WHERE scope_id IS NULL
  `);

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
  db.prepare("UPDATE bm_meta SET value = '2' WHERE key = 'schema_version'").run();
}
