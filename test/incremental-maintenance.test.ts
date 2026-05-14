/**
 * v1.1.0 F-3 — 增量图维护测试
 *
 * Covers:
 * - runIncrementalPageRank
 * - runIncrementalCommunities
 * - shouldRunIncremental
 * - runMaintenance (incremental vs full path)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestStorage, cleanupTestDb, insertNode, insertEdge } from "./helpers";
import {
  runIncrementalPageRank,
  invalidateGraphCache,
} from "../src/graph/pagerank";
import { runIncrementalCommunities } from "../src/graph/community";
import { shouldRunIncremental } from "../src/graph/maintenance";
import { DEFAULT_CONFIG } from "../src/types";
import type { IStorageAdapter } from "../src/store/adapter";

describe("F-3 增量图维护", () => {
  let storage: ReturnType<typeof createTestStorage>;
  let db: ReturnType<typeof createTestDb>;
  const cfg = DEFAULT_CONFIG;

  beforeEach(() => {
    storage = createTestStorage();
    db = storage.getDb();
    invalidateGraphCache();
  });

  afterEach(() => { cleanupTestDb(storage); });

  // ─── shouldRunIncremental ───────────────────────────────────

  describe("shouldRunIncremental", () => {
    it("returns false when no dirty nodes", () => {
      insertNode(db, { name: "n1", content: "c1" });
      expect(shouldRunIncremental(storage)).toBe(false);
    });

    it("returns true when dirty ratio < threshold", () => {
      // Create 100 nodes, mark 5 as dirty (5%)
      for (let i = 0; i < 100; i++) {
        insertNode(db, { name: `n-${i}`, content: `content-${i}` });
      }
      storage.markDirty(["n-0", "n-1", "n-2", "n-3", "n-4"]);
      expect(shouldRunIncremental(storage, 0.10)).toBe(true);
    });

    it("returns false when dirty ratio > threshold", () => {
      // Create 100 nodes, mark 50 as dirty (50%)
      for (let i = 0; i < 100; i++) {
        insertNode(db, { name: `n-${i}`, content: `content-${i}` });
      }
      const dirtyIds: string[] = [];
      for (let i = 0; i < 50; i++) {
        dirtyIds.push(`n-${i}`);
      }
      storage.markDirty(dirtyIds);
      expect(shouldRunIncremental(storage, 0.10)).toBe(false);
    });
  });

  // ─── runIncrementalPageRank ────────────────────────────────

  describe("runIncrementalPageRank", () => {
    it("returns empty when no dirty nodes", () => {
      const result = runIncrementalPageRank(storage, cfg);
      expect(result.dirtyCount).toBe(0);
      expect(result.skipped).toBe(false);
    });

    it("computes scores for dirty nodes (low dirty ratio)", () => {
      // Create 100 nodes with edges
      const ids: string[] = [];
      for (let i = 0; i < 100; i++) {
        const id = insertNode(db, { name: `p-${i}`, content: `node ${i}`, pagerank: 0.01 });
        ids.push(id);
      }
      // Create sparse edges
      for (let i = 0; i < 80; i++) {
        insertEdge(db, { fromId: ids[i], toId: ids[(i + 1) % 100], type: "RELATED_TO" });
      }

      // Mark 3 nodes as dirty
      storage.markDirty([ids[0], ids[1], ids[2]]);

      const result = runIncrementalPageRank(storage, cfg);
      expect(result.skipped).toBe(false);
      expect(result.dirtyCount).toBe(3);
      expect(result.subgraphSize).toBeGreaterThan(3);
      expect(result.scores.size).toBeGreaterThan(0);

      // Dirty nodes should have scores
      for (const dirtyId of [ids[0], ids[1], ids[2]]) {
        expect(result.scores.has(dirtyId)).toBe(true);
      }
    });

    it("skips when dirty ratio > threshold", () => {
      // Create 10 nodes, mark 5 as dirty (50%)
      const ids: string[] = [];
      for (let i = 0; i < 10; i++) {
        const id = insertNode(db, { name: `q-${i}`, content: `node ${i}` });
        ids.push(id);
      }
      storage.markDirty(ids.slice(0, 5));

      const result = runIncrementalPageRank(storage, cfg, 0.10);
      expect(result.skipped).toBe(true);
      expect(result.dirtyCount).toBe(5);
    });
  });

  // ─── runIncrementalCommunities ─────────────────────────────

  describe("runIncrementalCommunities", () => {
    it("returns empty when no dirty nodes", () => {
      const result = runIncrementalCommunities(storage);
      expect(result.skipped).toBe(false);
      expect(result.count).toBe(0);
    });

    it("detects communities for dirty nodes", () => {
      // Create two clusters
      for (let i = 0; i < 20; i++) {
        insertNode(db, { name: `c1-${i}`, content: `cluster 1 node ${i}` });
      }
      for (let i = 0; i < 20; i++) {
        insertNode(db, { name: `c2-${i}`, content: `cluster 2 node ${i}` });
      }
      // Create edges within clusters
      for (let i = 0; i < 19; i++) {
        insertEdge(db, { fromId: db.prepare("SELECT id FROM bm_nodes WHERE name=?").get(`c1-${i}`).id, toId: db.prepare("SELECT id FROM bm_nodes WHERE name=?").get(`c1-${i + 1}`).id, type: "RELATED_TO" });
        insertEdge(db, { fromId: db.prepare("SELECT id FROM bm_nodes WHERE name=?").get(`c2-${i}`).id, toId: db.prepare("SELECT id FROM bm_nodes WHERE name=?").get(`c2-${i + 1}`).id, type: "RELATED_TO" });
      }

      // Mark one node in each cluster as dirty
      const dirty1 = db.prepare("SELECT id FROM bm_nodes WHERE name='c1-10'").get()["id"] as string;
      const dirty2 = db.prepare("SELECT id FROM bm_nodes WHERE name='c2-10'").get()["id"] as string;
      storage.markDirty([dirty1, dirty2]);

      const result = runIncrementalCommunities(storage);
      expect(result.skipped).toBe(false);
      expect(result.count).toBeGreaterThanOrEqual(1);
    });
  });
});
