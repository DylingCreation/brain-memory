/**
 * brain-memory — Recaller tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createTestStorage, cleanupTestDb, createTestDb, insertNode, insertEdge } from "./helpers.ts";
import { Recaller } from "../src/recaller/recall.ts";
import { DEFAULT_CONFIG } from "../src/types.ts";

let db: ReturnType<typeof createTestDb>;
let storage: ReturnType<typeof createTestStorage>;

beforeEach(() => { storage = createTestStorage(); db = storage.getDb(); });

afterEach(() => { cleanupTestDb(storage); });

describe("Recaller", () => {
  it("returns empty for empty DB", async () => {
    const recaller = new Recaller(storage, DEFAULT_CONFIG);
    const result = await recaller.recall("test query");
    expect(result.nodes.length).toBe(0);
    expect(result.edges.length).toBe(0);
  });

  it("recalls via FTS5 when no embedding", async () => {
    insertNode(db, { name: "docker-setup", type: "SKILL", category: "skills", description: "Docker container setup guide", content: "Use docker compose up -d to start", sessions: ["s1"] });
    insertNode(db, { name: "git-flow", type: "SKILL", category: "skills", description: "Git workflow", content: "Use git branch feature", sessions: ["s1"] });

    const recaller = new Recaller(storage, DEFAULT_CONFIG);
    const result = await recaller.recall("docker");
    expect(result.nodes.length).toBeGreaterThanOrEqual(1);
    expect(result.nodes[0].name).toBe("docker-setup");
  });

  it("decay integration: decay reduces score for older nodes", async () => {
    const { applyTimeDecay } = await import("../src/decay/engine.ts");
    const cfgWithDecay = { ...DEFAULT_CONFIG, decay: { ...DEFAULT_CONFIG.decay, enabled: true } };
    const now = Date.now();

    // Verify decay engine correctly penalizes older nodes
    const freshNode = {
      id: "n1", type: "SKILL" as const, category: "skills" as const, name: "fresh", description: "", content: "",
      status: "active" as const, validatedCount: 1, sourceSessions: ["s1"], communityId: null, pagerank: 0.5,
      importance: 0.5, accessCount: 0, lastAccessedAt: 0, temporalType: "static" as const,
      createdAt: now - 86400000, updatedAt: now, // 1 day old
    };
    const oldNode = {
      ...freshNode, id: "n2", name: "old",
      createdAt: now - 86400000 * 90, updatedAt: now - 86400000 * 90, // 90 days old
    };

    const freshScore = applyTimeDecay(0.5, freshNode, cfgWithDecay.decay, now);
    const oldScore = applyTimeDecay(0.5, oldNode, cfgWithDecay.decay, now);

    expect(freshScore).toBeGreaterThan(oldScore);
    expect(freshScore).toBeGreaterThan(0.42); // Fresh node retains most of its score
    expect(oldScore).toBeLessThan(0.45); // Old node is significantly penalized
  });

  it("updates access count when decay enabled", async () => {
    const now = Date.now();
    const id = insertNode(db, { name: "access-test", type: "SKILL", category: "skills", description: "Test", content: "Content", sessions: ["s1"] });

    const cfgWithDecay = { ...DEFAULT_CONFIG, decay: { ...DEFAULT_CONFIG.decay, enabled: true } };
    const recaller = new Recaller(storage, cfgWithDecay);
    await recaller.recall("test");

    const node = db.prepare("SELECT access_count FROM bm_nodes WHERE id=?").get(id) as any;
    expect(node.access_count).toBeGreaterThanOrEqual(1);
  });
});
