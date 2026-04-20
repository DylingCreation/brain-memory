/**
 * brain-memory — Graph module tests (PageRank, Community, Dedup)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, insertNode, insertEdge } from "./helpers.ts";
import { computeGlobalPageRank, personalizedPageRank, invalidateGraphCache } from "../src/graph/pagerank.ts";
import { detectCommunities, communityRepresentatives } from "../src/graph/community.ts";
import { dedup, detectDuplicates } from "../src/graph/dedup.ts";
import { DEFAULT_CONFIG } from "../src/types.ts";

let db: ReturnType<typeof createTestDb>;

beforeEach(() => { db = createTestDb(); });

describe("PageRank", () => {
  it("computes global PageRank", () => {
    const a = insertNode(db, { name: "node-a", type: "TASK", category: "tasks", sessions: ["s1"] });
    const b = insertNode(db, { name: "node-b", type: "SKILL", category: "skills", sessions: ["s1"] });
    const c = insertNode(db, { name: "node-c", type: "SKILL", category: "skills", sessions: ["s1"] });
    insertEdge(db, { fromId: a, toId: b, type: "USED_SKILL", sessionId: "s1" });
    insertEdge(db, { fromId: b, toId: c, type: "REQUIRES", sessionId: "s1" });

    const result = computeGlobalPageRank(db, DEFAULT_CONFIG);
    expect(result.scores.size).toBe(3);
    expect(result.topK.length).toBeGreaterThanOrEqual(1);
    // Check that pagerank is stored in DB
    const row = db.prepare("SELECT name, pagerank FROM bm_nodes ORDER BY pagerank DESC").all() as any[];
    expect(row.length).toBe(3);
  });

  it("handles empty graph", () => {
    invalidateGraphCache();
    const result = computeGlobalPageRank(db, DEFAULT_CONFIG);
    expect(result.scores.size).toBe(0);
    expect(result.topK.length).toBe(0);
  });

  it("PPR ranks seed nodes higher", () => {
    invalidateGraphCache();
    const a = insertNode(db, { name: "seed", type: "SKILL", category: "skills", sessions: ["s1"] });
    const b = insertNode(db, { name: "other", type: "SKILL", category: "skills", sessions: ["s1"] });
    insertEdge(db, { fromId: a, toId: b, type: "REQUIRES", sessionId: "s1" });

    const result = personalizedPageRank(db, [a], [a, b], DEFAULT_CONFIG);
    expect(result.scores.has(a)).toBe(true);
    expect(result.scores.has(b)).toBe(true);
    expect(result.scores.get(a)!).toBeGreaterThan(result.scores.get(b)!);
  });

  it("PPR returns empty for invalid seeds", () => {
    insertNode(db, { name: "orphan", type: "TASK", category: "tasks", sessions: ["s1"] });
    const result = personalizedPageRank(db, ["nonexistent"], ["orphan"], DEFAULT_CONFIG);
    expect(result.scores.size).toBe(0);
  });

  it("cache invalidation works", () => {
    insertNode(db, { name: "x", type: "TASK", category: "tasks", sessions: ["s1"] });
    computeGlobalPageRank(db, DEFAULT_CONFIG); // caches
    invalidateGraphCache();
    // After invalidation, next compute should rebuild
    const result = computeGlobalPageRank(db, DEFAULT_CONFIG);
    expect(result.scores.size).toBe(1);
  });
});

describe("Community Detection", () => {
  it("detects communities with Label Propagation", () => {
    // Create two clusters
    const a1 = insertNode(db, { name: "a1", type: "TASK", category: "tasks", sessions: ["s1"] });
    const a2 = insertNode(db, { name: "a2", type: "SKILL", category: "skills", sessions: ["s1"] });
    const a3 = insertNode(db, { name: "a3", type: "SKILL", category: "skills", sessions: ["s1"] });
    const b1 = insertNode(db, { name: "b1", type: "TASK", category: "tasks", sessions: ["s1"] });
    const b2 = insertNode(db, { name: "b2", type: "SKILL", category: "skills", sessions: ["s1"] });

    // Dense connections within clusters
    insertEdge(db, { fromId: a1, toId: a2, type: "USED_SKILL", sessionId: "s1" });
    insertEdge(db, { fromId: a1, toId: a3, type: "USED_SKILL", sessionId: "s1" });
    insertEdge(db, { fromId: a2, toId: a3, type: "REQUIRES", sessionId: "s1" });
    insertEdge(db, { fromId: b1, toId: b2, type: "USED_SKILL", sessionId: "s1" });

    const result = detectCommunities(db, 50);
    expect(result.count).toBeGreaterThanOrEqual(1);
    // All nodes should have community_id set
    const nodesWithCommunity = db.prepare("SELECT COUNT(*) as c FROM bm_nodes WHERE community_id IS NOT NULL").get() as any;
    expect(nodesWithCommunity.c).toBe(5);
  });

  it("handles empty graph", () => {
    const result = detectCommunities(db);
    expect(result.count).toBe(0);
    expect(result.labels.size).toBe(0);
  });

  it("returns community representatives", () => {
    const a1 = insertNode(db, { name: "rep1", type: "SKILL", category: "skills", validatedCount: 5, sessions: ["s1"] });
    const a2 = insertNode(db, { name: "rep2", type: "SKILL", category: "skills", sessions: ["s1"] });
    // Set same community
    db.prepare("UPDATE bm_nodes SET community_id='c-1' WHERE id=?").run(a1);
    db.prepare("UPDATE bm_nodes SET community_id='c-1' WHERE id=?").run(a2);

    const reps = communityRepresentatives(db, 2);
    expect(reps.length).toBe(2); // 2 nodes in 1 community, 2 per community
  });
});

describe("Dedup", () => {
  it("detects duplicates via cosine similarity", () => {
    const a = insertNode(db, { name: "dup-a", type: "SKILL", category: "skills", sessions: ["s1"] });
    const b = insertNode(db, { name: "dup-b", type: "SKILL", category: "skills", sessions: ["s1"] });
    // Same vector → duplicate
    const vec = Array.from({ length: 384 }, () => 0.1);
    const f32 = new Float32Array(vec);
    const blob = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
    db.prepare("INSERT INTO bm_vectors(node_id, embedding, hash) VALUES(?,?,?)").run(a, blob, "h1");
    db.prepare("INSERT INTO bm_vectors(node_id, embedding, hash) VALUES(?,?,?)").run(b, blob, "h2");

    const pairs = detectDuplicates(db, { ...DEFAULT_CONFIG, dedupThreshold: 0.95 });
    expect(pairs.length).toBe(1);
    expect(pairs[0].similarity).toBeCloseTo(1, 5);
  });

  it("merges duplicates", () => {
    const a = insertNode(db, { name: "merge-a", type: "SKILL", category: "skills", validatedCount: 3, sessions: ["s1"] });
    const b = insertNode(db, { name: "merge-b", type: "SKILL", category: "skills", validatedCount: 1, sessions: ["s1"] });
    const vec = Array.from({ length: 384 }, () => 0.1);
    const f32 = new Float32Array(vec);
    const blob = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
    db.prepare("INSERT INTO bm_vectors(node_id, embedding, hash) VALUES(?,?,?)").run(a, blob, "h1");
    db.prepare("INSERT INTO bm_vectors(node_id, embedding, hash) VALUES(?,?,?)").run(b, blob, "h2");

    const result = dedup(db, { ...DEFAULT_CONFIG, dedupThreshold: 0.95 });
    expect(result.merged).toBe(1);
    // The one with higher validatedCount should survive
    const remaining = db.prepare("SELECT COUNT(*) as c FROM bm_nodes WHERE status='active'").get() as any;
    expect(remaining.c).toBe(1);
  });

  it("returns empty for no vectors", () => {
    insertNode(db, { name: "no-vec", type: "TASK", category: "tasks", sessions: ["s1"] });
    const pairs = detectDuplicates(db, DEFAULT_CONFIG);
    expect(pairs.length).toBe(0);
  });
});
