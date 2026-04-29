/**
 * brain-memory — Database migration tests
 */

import { describe, it, expect, afterEach } from "vitest";
import { DatabaseSync } from "@photostructure/sqlite";
import { getSchemaVersion, migrate, CURRENT_SCHEMA_VERSION } from "../src/store/migrate";
import { initDb } from "../src/store/db";
import fs from "fs";
import path from "path";

// ─── Helpers ───────────────────────────────────────────────────

function createEmptyDb(): DatabaseSync {
  return new DatabaseSync(":memory:");
}

function getMetaValue(db: DatabaseSync, key: string): string | null {
  try {
    const row = db.prepare("SELECT value FROM bm_meta WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value ?? null;
  } catch {
    return null;
  }
}

// Temp DB path for integration tests (cleaned up in afterEach)
const tempDbPath = path.resolve(__dirname, 'test-brain-memory-migration.db');

// ─── Tests ─────────────────────────────────────────────────────

describe("migrate()", () => {
  it("creates bm_meta table and sets version on empty database", () => {
    const db = createEmptyDb();
    const version = migrate(db);

    expect(version).toBe(1);
    expect(getMetaValue(db, "schema_version")).toBe("1");
  });

  it("is idempotent — second call on same DB is a no-op", () => {
    const db = createEmptyDb();

    const v1 = migrate(db);
    expect(v1).toBe(1);

    const v2 = migrate(db);
    expect(v2).toBe(1);
    expect(getMetaValue(db, "schema_version")).toBe("1");
  });

  it("getSchemaVersion returns 0 before bm_meta exists", () => {
    const db = createEmptyDb();
    expect(getSchemaVersion(db)).toBe(0);
  });

  it("getSchemaVersion returns correct version after migration", () => {
    const db = createEmptyDb();
    migrate(db);
    expect(getSchemaVersion(db)).toBe(1);
  });
});

describe("getSchemaVersion()", () => {
  it("returns 0 for database without bm_meta", () => {
    const db = createEmptyDb();
    // No tables at all
    expect(getSchemaVersion(db)).toBe(0);
  });

  it("returns 0 for database with only business tables (no bm_meta)", () => {
    const db = createEmptyDb();
    // Simulate pre-v0.2.0 database: has bm_nodes but no bm_meta
    db.exec(`
      CREATE TABLE IF NOT EXISTS bm_nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        name TEXT NOT NULL
      );
    `);
    expect(getSchemaVersion(db)).toBe(0);
  });

  it("returns version from bm_meta after migration", () => {
    const db = createEmptyDb();
    migrate(db);

    const version = getSchemaVersion(db);
    expect(version).toBe(1);
  });
});

describe("initDb() — migration integration", () => {
  afterEach(() => {
    // Clean up any leftover files from previous test runs
    cleanupDbFiles(tempDbPath);
  });

  function cleanupDbFiles(dbPath: string): void {
    const files = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
    for (const f of files) {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* ignore */ }
    }
  }

  it("initializes bm_meta when creating new database via initDb()", () => {
    // Clean start
    cleanupDbFiles(tempDbPath);

    const db = initDb(tempDbPath);

    // bm_meta should exist
    const row = db.prepare("SELECT value FROM bm_meta WHERE key = 'schema_version'").get() as { value: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.value).toBe("1");

    db.close();

    // Clean up after test
    cleanupDbFiles(tempDbPath);
  });

  it("CURRENT_SCHEMA_VERSION constant matches migrated version", () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
  });
});
