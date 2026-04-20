/**
 * brain-memory — Hybrid recall tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, insertNode, insertEdge } from "./helpers.ts";
import { HybridRecaller } from "../src/retriever/hybrid-recall.ts";
import { DEFAULT_CONFIG } from "../src/types.ts";

let db: ReturnType<typeof createTestDb>;

beforeEach(() => { db = createTestDb(); });

describe("HybridRecaller", () => {
  it("returns empty for empty DB", async () => {
    const recaller = new HybridRecaller(db, DEFAULT_CONFIG);
    const result = await recaller.recall("test query");
    expect(result.nodes.length).toBe(0);
    expect(result.diagnostics?.graphCount).toBe(0);
    expect(result.diagnostics?.vectorCount).toBe(0);
  });

  it("combines graph and vector results", async () => {
    const a = insertNode(db, { name: "docker-setup", type: "SKILL", category: "skills", description: "Docker setup guide", content: "Use docker compose up", sessions: ["s1"] });
    const b = insertNode(db, { name: "git-flow", type: "SKILL", category: "skills", description: "Git workflow", content: "Use git branch", sessions: ["s1"] });
    insertEdge(db, { fromId: a, toId: b, type: "REQUIRES", sessionId: "s1" });

    const recaller = new HybridRecaller(db, DEFAULT_CONFIG);
    const result = await recaller.recall("docker");

    expect(result.nodes.length).toBeGreaterThanOrEqual(1);
    expect(result.diagnostics?.graphCount).toBeGreaterThanOrEqual(1);
    expect(result.diagnostics?.fusedCount).toBeGreaterThanOrEqual(1);
  });

  it("includes diagnostics", async () => {
    insertNode(db, { name: "test-skill", type: "SKILL", category: "skills", description: "Test skill", content: "Test content", sessions: ["s1"] });

    const recaller = new HybridRecaller(db, DEFAULT_CONFIG);
    const result = await recaller.recall("test");

    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics?.graphCount).toBeDefined();
    expect(result.diagnostics?.vectorCount).toBeDefined();
    expect(result.diagnostics?.overlapCount).toBeDefined();
    expect(result.diagnostics?.fusedCount).toBeDefined();
  });
});
