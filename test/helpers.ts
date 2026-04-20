/**
 * brain-memory — 测试辅助
 */

import { createHash } from "crypto";
import { DatabaseSync, type DatabaseSyncInstance } from "@photostructure/sqlite";
import type { BmNode } from "../src/types.ts";

export function createTestDb(): DatabaseSyncInstance {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA journal_mode=WAL");
  db.exec("PRAGMA foreign_keys=ON");

  // Nodes
  db.exec(`
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
      scope_session   TEXT,
      scope_agent     TEXT,
      scope_workspace TEXT,
      created_at      INTEGER NOT NULL,
      updated_at      INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS ux_bm_nodes_name ON bm_nodes(name);
    CREATE INDEX IF NOT EXISTS ix_bm_nodes_type_status ON bm_nodes(type, status);
    CREATE INDEX IF NOT EXISTS ix_bm_nodes_community ON bm_nodes(community_id);
  `);

  // Edges
  db.exec(`
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
    CREATE INDEX IF NOT EXISTS ix_bm_edges_from ON bm_edges(from_id);
    CREATE INDEX IF NOT EXISTS ix_bm_edges_to   ON bm_edges(to_id);
  `);

  // Vectors
  db.exec(`
    CREATE TABLE IF NOT EXISTS bm_vectors (
      node_id   TEXT PRIMARY KEY REFERENCES bm_nodes(id),
      embedding BLOB NOT NULL,
      hash      TEXT NOT NULL
    );
  `);

  // Messages
  db.exec(`
    CREATE TABLE IF NOT EXISTS bm_messages (
      id          TEXT PRIMARY KEY,
      session_id  TEXT NOT NULL,
      turn_index  INTEGER NOT NULL,
      role        TEXT NOT NULL,
      content     TEXT NOT NULL,
      extracted   INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_bm_msg_session ON bm_messages(session_id, turn_index);
  `);

  // Community summaries
  db.exec(`
    CREATE TABLE IF NOT EXISTS bm_communities (
      id         TEXT PRIMARY KEY,
      summary    TEXT NOT NULL,
      node_count INTEGER NOT NULL DEFAULT 0,
      embedding  BLOB,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // FTS5
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS bm_nodes_fts USING fts5(
        name, description, content,
        content=bm_nodes, content_rowid=rowid
      );
      CREATE TRIGGER IF NOT EXISTS bm_nodes_ai AFTER INSERT ON bm_nodes BEGIN
        INSERT INTO bm_nodes_fts(rowid, name, description, content)
        VALUES (NEW.rowid, NEW.name, NEW.description, NEW.content);
      END;
      CREATE TRIGGER IF NOT EXISTS bm_nodes_ad AFTER DELETE ON bm_nodes BEGIN
        INSERT INTO bm_nodes_fts(bm_nodes_fts, rowid, name, description, content)
        VALUES ('delete', OLD.rowid, OLD.name, OLD.description, OLD.content);
      END;
      CREATE TRIGGER IF NOT EXISTS bm_nodes_au AFTER UPDATE ON bm_nodes BEGIN
        INSERT INTO bm_nodes_fts(bm_nodes_fts, rowid, name, description, content)
        VALUES ('delete', OLD.rowid, OLD.name, OLD.description, OLD.content);
        INSERT INTO bm_nodes_fts(rowid, name, description, content)
        VALUES (NEW.rowid, NEW.name, NEW.description, NEW.content);
      END;
    `);
  } catch { /* FTS5 not available */ }

  return db;
}

export function insertNode(
  db: DatabaseSyncInstance,
  opts: {
    id?: string; type?: string; category?: string; name: string;
    description?: string; content?: string; status?: string;
    validatedCount?: number; sessions?: string[];
    communityId?: string | null; pagerank?: number;
    importance?: number; temporalType?: "static" | "dynamic";
    createdAt?: number;
  },
): string {
  const id = opts.id ?? `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const now = Date.now();
  db.prepare(`
    INSERT INTO bm_nodes (id, type, category, name, description, content, status,
      validated_count, source_sessions, community_id, pagerank, importance,
      access_count, last_accessed, temporal_type, scope_session, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)
  `).run(
    id,
    opts.type ?? "TASK",
    opts.category ?? "tasks",
    opts.name,
    opts.description ?? `desc of ${opts.name}`,
    opts.content ?? `content of ${opts.name}`,
    opts.status ?? "active",
    opts.validatedCount ?? 1,
    JSON.stringify(opts.sessions ?? ["test-session"]),
    opts.communityId ?? null,
    opts.pagerank ?? 0,
    opts.importance ?? 0.5,
    opts.temporalType ?? "static",
    opts.sessions?.[0] ?? "test-session",
    opts.createdAt ?? now,
    now,
  );
  return id;
}

export function insertEdge(
  db: DatabaseSyncInstance,
  opts: { id?: string; fromId: string; toId: string; type?: string; instruction?: string; sessionId?: string },
): string {
  const id = opts.id ?? `e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  db.prepare(`
    INSERT INTO bm_edges (id, from_id, to_id, type, instruction, session_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, opts.fromId, opts.toId, opts.type ?? "USED_SKILL", opts.instruction ?? "test", opts.sessionId ?? "test-session", Date.now());
  return id;
}

export function insertVector(db: DatabaseSyncInstance, nodeId: string, vec: number[], content: string): void {
  const hash = createHash("md5").update(content).digest("hex");
  const f32 = new Float32Array(vec);
  const blob = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
  db.prepare("INSERT OR REPLACE INTO bm_vectors(node_id, embedding, hash) VALUES(?,?,?)").run(nodeId, blob, hash);
}
