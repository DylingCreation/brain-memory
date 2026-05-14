/**
 * F-9 覆盖率补全 — 批次 ②: fusion/analyzer.ts + community.ts
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestStorage, cleanupTestDb, insertNode, insertEdge } from "./helpers";
import { shouldRunFusion, findFusionCandidates, executeFusion, computeNameSimilarity, parseFusionDecision } from "../src/fusion/analyzer";
import { runIncrementalCommunities } from "../src/graph/community";
import { DEFAULT_CONFIG } from "../src/types";

let storage: ReturnType<typeof createTestStorage>;
let db: ReturnType<typeof createTestDb>;

beforeEach(() => { storage = createTestStorage(); db = storage.getDb(); });
afterEach(() => { cleanupTestDb(storage); });

// ─── fusion/analyzer.ts ─────────────────────────────────────

describe("shouldRunFusion", () => {
  it("returns false when not enough nodes", () => {
    for (let i = 0; i < 5; i++) insertNode(db, { name: `n${i}`, content: "x" });
    const cfg = { ...DEFAULT_CONFIG, fusion: { ...DEFAULT_CONFIG.fusion, minNodes: 20 } };
    expect(shouldRunFusion(storage, cfg)).toBe(false);
  });

  it("returns true when thresholds met", () => {
    // Add nodes and seed a community summary to meet minCommunities
    for (let i = 0; i < 30; i++) {
      insertNode(db, { name: `n${i}`, content: "x" });
    }
    // Manually create a community summary row to satisfy the check
    storage.upsertCommunity("c-test", "test community", 30);
    const cfg = { ...DEFAULT_CONFIG, fusion: { ...DEFAULT_CONFIG.fusion, minNodes: 20, minCommunities: 1 } };
    expect(shouldRunFusion(storage, cfg)).toBe(true);
  });
});

describe("executeFusion", () => {
  it("merges two nodes", () => {
    const n1 = insertNode(db, { name: "node-a", content: "content a", validatedCount: 5 });
    const n2 = insertNode(db, { name: "node-b", content: "content b", validatedCount: 2 });
    const candidates = [{
      nodeA: storage.findNodeById(n1)!, nodeB: storage.findNodeById(n2)!,
      nameScore: 0.5, vectorScore: 0, combinedScore: 0.95,
      decision: "merge" as const, reason: "test merge",
    }];
    const result = executeFusion(storage, candidates, "test-session");
    expect(result.merged).toBe(1);
    expect(result.linked).toBe(0);
  });

  it("links two nodes with different communities", () => {
    const n1 = insertNode(db, { name: "node-c", content: "c", validatedCount: 3, communityId: "c-1" });
    const n2 = insertNode(db, { name: "node-d", content: "d", validatedCount: 3, communityId: "c-2" });
    const candidates = [{
      nodeA: storage.findNodeById(n1)!, nodeB: storage.findNodeById(n2)!,
      nameScore: 0.5, vectorScore: 0, combinedScore: 0.90,
      decision: "link" as const, reason: "test link",
    }];
    const result = executeFusion(storage, candidates, "test-session");
    expect(result.linked).toBe(1);
    expect(result.merged).toBe(0);
  });

  it("skips candidates with decision=none", () => {
    const n1 = insertNode(db, { name: "node-e", content: "e", validatedCount: 1 });
    const n2 = insertNode(db, { name: "node-f", content: "f", validatedCount: 1 });
    const candidates = [{
      nodeA: storage.findNodeById(n1)!, nodeB: storage.findNodeById(n2)!,
      nameScore: 0.3, vectorScore: 0, combinedScore: 0.3,
      decision: "none" as const, reason: "below threshold",
    }];
    const result = executeFusion(storage, candidates, "test-session");
    expect(result.merged).toBe(0);
    expect(result.linked).toBe(0);
  });
});

describe("computeNameSimilarity", () => {
  it("returns 1.0 for exact match after normalization", () => {
    expect(computeNameSimilarity("docker-setup", "docker setup")).toBe(1.0);
  });

  it("returns partial similarity for similar names", () => {
    const sim = computeNameSimilarity("docker-setup-guide", "docker-deployment-guide");
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });

  it("returns 0 for completely different names", () => {
    expect(computeNameSimilarity("docker", "python")).toBe(0);
  });
});

describe("parseFusionDecision", () => {
  it("parses merge decision", () => {
    const result = parseFusionDecision('{"decision":"merge","reason":"same content"}');
    expect(result.decision).toBe("merge");
  });

  it("parses link decision", () => {
    const result = parseFusionDecision('{"decision":"link","reason":"related"}');
    expect(result.decision).toBe("link");
  });

  it("defaults to none on parse failure", () => {
    const result = parseFusionDecision("not json");
    expect(result.decision).toBe("none");
  });
});

// ─── graph/community.ts ──────────────────────────────────────

describe("runIncrementalCommunities", () => {
  it("returns empty for no dirty nodes", () => {
    insertNode(db, { name: "ic1", content: "x" });
    const result = runIncrementalCommunities(storage, 50);
    expect(result.skipped).toBe(false);
    expect(result.count).toBe(0);
  });

  it("detects communities with dirty nodes", () => {
    for (let i = 0; i < 20; i++) insertNode(db, { name: `dc${i}`, content: `node ${i}` });
    for (let i = 0; i < 19; i++) {
      insertEdge(db, { fromId: db.prepare("SELECT id FROM bm_nodes WHERE name=?").get(`dc${i}`).id, toId: db.prepare("SELECT id FROM bm_nodes WHERE name=?").get(`dc${i + 1}`).id, type: "RELATED_TO" });
    }
    const dirtyId = db.prepare("SELECT id FROM bm_nodes WHERE name='dc10'").get()["id"] as string;
    storage.markDirty([dirtyId]);

    const result = runIncrementalCommunities(storage, 50);
    expect(result.skipped).toBe(false);
    expect(result.count).toBeGreaterThanOrEqual(1);
  });
});
