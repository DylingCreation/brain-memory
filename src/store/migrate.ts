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

import { type DatabaseSyncInstance } from "@photostructure/sqlite";

// ─── Constants ─────────────────────────────────────────────────

/**
 * Current schema version.
 * Increment this number and add a new migrateTo_vN function
 * whenever the schema changes in a future release.
 */
export const CURRENT_SCHEMA_VERSION = 1;

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
    const row = db.prepare("SELECT value FROM bm_meta WHERE key = 'schema_version'").get() as { value: string } | undefined;
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
    db.prepare("INSERT INTO bm_meta (key, value) VALUES ('schema_version', '1')").run();
    version = 1;
  }

  // Step 4: Apply incremental migrations for versions beyond current
  // (No migrations needed yet — future versions will add migrateTo_v2, etc.)
  // Example:
  //   if (version < 2) { migrateTo_v2(db); version = 2; }
  //   if (version < 3) { migrateTo_v3(db); version = 3; }

  return version;
}

/**
 * Example: future migration template.
 * Uncomment and adapt when schema changes are needed.
 *
 * function migrateTo_v2(db: DatabaseSyncInstance): void {
 *   db.exec("CREATE TABLE IF NOT EXISTS bm_new_table ( ... );");
 *   db.prepare("UPDATE bm_meta SET value = '2' WHERE key = 'schema_version'").run();
 * }
 */
