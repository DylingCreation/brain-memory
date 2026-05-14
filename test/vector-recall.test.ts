/**
 * brain-memory — Vector recall tests (RRF fusion)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createTestStorage, cleanupTestDb, createTestDb, insertNode } from "./helpers.ts";
import { VectorRecaller } from "../src/retriever/vector-recall.ts";
import { DEFAULT_CONFIG } from "../src/types.ts";

let db: ReturnType<typeof createTestDb>;
let storage: ReturnType<typeof createTestStorage>;

beforeEach(() => { storage = createTestStorage(); db = storage.getDb(); });

afterEach(() => { cleanupTestDb(storage); });

describe("VectorRecaller", () => {
  it("returns empty for empty DB", async () => {
    const recaller = new VectorRecaller(storage, DEFAULT_CONFIG);
    const result = await recaller.recall("test query");
    expect(result.nodes.length).toBe(0);
    expect(result.diagnostics?.vectorCount).toBe(0);
    expect(result.diagnostics?.bm25Count).toBe(0);
  });

  it("recalls via FTS5 when no embedding", async () => {
    insertNode(db, { name: "docker-setup", type: "SKILL", category: "skills", description: "Docker container setup guide", content: "Use docker compose up -d to start all services", sessions: ["s1"] });
    insertNode(db, { name: "git-flow", type: "SKILL", category: "skills", description: "Git workflow guide", content: "Use git branch and git merge for feature branches", sessions: ["s1"] });

    const recaller = new VectorRecaller(storage, DEFAULT_CONFIG);
    const result = await recaller.recall("docker");

    expect(result.nodes.length).toBeGreaterThanOrEqual(1);
    expect(result.nodes[0].name).toBe("docker-setup");
    expect(result.diagnostics?.bm25Count).toBeGreaterThanOrEqual(1);
    expect(result.diagnostics?.intent).toBeDefined();
  });

  it("returns intent in diagnostics", async () => {
    insertNode(db, { name: "fix-bug", type: "EVENT", category: "events", description: "Error fix", content: "Fixed connection error", sessions: ["s1"] });

    const recaller = new VectorRecaller(storage, DEFAULT_CONFIG);
    const result = await recaller.recall("报错怎么修复");

    expect(result.diagnostics?.intent).toBe("technical");
  });

  it("respects recallMaxNodes limit", async () => {
    for (let i = 0; i < 10; i++) {
      insertNode(db, { name: `skill-${i}`, type: "SKILL", category: "skills", description: `Skill ${i} description with unique word num${i}`, content: `Content for skill number ${i}`, sessions: ["s1"] });
    }

    const cfg = { ...DEFAULT_CONFIG, recallMaxNodes: 3 };
    const recaller = new VectorRecaller(storage, cfg);
    const result = await recaller.recall("skill");

    expect(result.nodes.length).toBeLessThanOrEqual(3);
  });
});
