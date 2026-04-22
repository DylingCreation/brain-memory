/**
 * brain-memory — SQLite database initialization
 *
 * Unified schema supporting both graph nodes + vector embeddings.
 * Authors: adoresever, win4r, brain-memory contributors
 */

import { DatabaseSync, type DatabaseSyncInstance } from "@photostructure/sqlite";
import { homedir } from "node:os";
import { join } from "node:path";

export function getDbPath(raw?: string): string {
  const p = (raw || "~/.openclaw/brain-memory.db").replace(/^~/, homedir());
  return p;
}

const SCHEMA = `
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- ─── Nodes ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bm_nodes (
  id              TEXT PRIMARY KEY,
  type            TEXT NOT NULL CHECK(type IN ('TASK','SKILL','EVENT')),
  category        TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  content         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','deprecated')),
  validated_count INTEGER NOT NULL DEFAULT 1,
  source_sessions TEXT NOT NULL DEFAULT '[]',
  community_id    TEXT,
  pagerank        REAL NOT NULL DEFAULT 0,
  importance      REAL NOT NULL DEFAULT 0.5,
  access_count    INTEGER NOT NULL DEFAULT 0,
  last_accessed   INTEGER NOT NULL DEFAULT 0,
  temporal_type   TEXT NOT NULL DEFAULT 'static' CHECK(temporal_type IN ('static','dynamic')),
  source          TEXT NOT NULL DEFAULT 'user' CHECK(source IN ('user', 'assistant')),
  -- Scope isolation fields
  scope_session   TEXT,
  scope_agent     TEXT,
  scope_workspace TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

-- ─── Edges ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bm_edges (
  id          TEXT PRIMARY KEY,
  from_id     TEXT NOT NULL REFERENCES bm_nodes(id),
  to_id       TEXT NOT NULL REFERENCES bm_nodes(id),
  type        TEXT NOT NULL,
  instruction TEXT NOT NULL,
  condition   TEXT,
  session_id  TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

-- ─── Vectors (optional, for semantic search + dedup) ───────────
CREATE TABLE IF NOT EXISTS bm_vectors (
  node_id   TEXT PRIMARY KEY REFERENCES bm_nodes(id),
  embedding BLOB NOT NULL,
  hash      TEXT NOT NULL
);

-- ─── Messages ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bm_messages (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  turn_index INTEGER NOT NULL,
  role       TEXT NOT NULL,
  content    TEXT NOT NULL,
  extracted  INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- ─── Community summaries ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS bm_communities (
  id         TEXT PRIMARY KEY,
  summary    TEXT NOT NULL,
  node_count INTEGER NOT NULL DEFAULT 0,
  embedding  BLOB,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- ─── FTS5 index ────────────────────────────────────────────────
-- Note: bm_nodes uses TEXT PRIMARY KEY, so SQLite creates an implicit
-- integer rowid column. FTS5 triggers reference new.rowid / old.rowid.
-- This is safe because SQLite always provides rowid for INTEGER PK-less tables.
CREATE VIRTUAL TABLE IF NOT EXISTS bm_nodes_fts USING fts5(
  name, description, content,
  content='bm_nodes',
  content_rowid='rowid'
);

-- ─── Triggers for FTS5 sync ────────────────────────────────────
CREATE TRIGGER IF NOT EXISTS bm_nodes_ai AFTER INSERT ON bm_nodes BEGIN
  INSERT INTO bm_nodes_fts(rowid, name, description, content)
  VALUES (new.rowid, new.name, new.description, new.content);
END;

CREATE TRIGGER IF NOT EXISTS bm_nodes_ad AFTER DELETE ON bm_nodes BEGIN
  INSERT INTO bm_nodes_fts(bm_nodes_fts, rowid, name, description, content)
  VALUES ('delete', old.rowid, old.name, old.description, old.content);
END;

CREATE TRIGGER IF NOT EXISTS bm_nodes_au AFTER UPDATE ON bm_nodes BEGIN
  INSERT INTO bm_nodes_fts(bm_nodes_fts, rowid, name, description, content)
  VALUES ('delete', old.rowid, old.name, old.description, old.content);
  INSERT INTO bm_nodes_fts(rowid, name, description, content)
  VALUES (new.rowid, new.name, new.description, new.content);
END;

-- ─── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_nodes_name ON bm_nodes(name);
CREATE INDEX IF NOT EXISTS idx_nodes_type ON bm_nodes(type);
CREATE INDEX IF NOT EXISTS idx_nodes_community ON bm_nodes(community_id);
CREATE INDEX IF NOT EXISTS idx_nodes_status ON bm_nodes(status);
CREATE INDEX IF NOT EXISTS idx_edges_from ON bm_edges(from_id);
CREATE INDEX IF NOT EXISTS idx_edges_to ON bm_edges(to_id);
CREATE INDEX IF NOT EXISTS idx_edges_type ON bm_edges(type);
CREATE INDEX IF NOT EXISTS idx_messages_session ON bm_messages(session_id, turn_index);
`;

export function initDb(dbPath: string): DatabaseSyncInstance {
  const db = new DatabaseSync(dbPath);
  db.exec(SCHEMA);
  return db;
}
