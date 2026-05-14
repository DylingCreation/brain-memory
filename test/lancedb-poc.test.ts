/**
 * v1.3.0 F-13 — LanceDB POC 测试
 */
import { describe, it, expect, afterAll } from "vitest";

describe("LanceDBStorageAdapter POC", () => {
  let storage: any;

  // ─── Test 1: Connection ────────────────────────────────────

  it("connects to LanceDB", async () => {
    const { LanceDBStorageAdapter } = await import("../src/store/lancedb-adapter");
    storage = new LanceDBStorageAdapter("/tmp/brain-memory-lancedb-poc-test");
    await storage.initialize();
    expect(storage.isConnected()).toBe(true);
  });

  // ─── Test 2: Node CRUD ───────────────────────────────────

  it("creates and finds nodes", () => {
    const { node, isNew } = storage.upsertNode(
      { type: "TASK", category: "tasks", name: "test-node", description: "test", content: "test content", source: "user" },
      "session-1"
    );
    expect(isNew).toBe(true);
    expect(node.id).toBeDefined();
    expect(storage.findNodeById(node.id)).toBeDefined();
  });

  // ─── Test 3: Vector storage ──────────────────────────────

  it("stores and retrieves vectors", () => {
    const node = storage.findAllActive()[0];
    const vec = Array(128).fill(0).map(() => Math.random() * 2 - 1);
    storage.saveVector(node.id, "test", vec);
    const retrieved = storage.getVector(node.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.length).toBe(128);
  });

  // ─── Test 4: Vector search ───────────────────────────────

  it("performs vector similarity search", () => {
    // Add a few more nodes with vectors
    for (let i = 0; i < 5; i++) {
      const { node } = storage.upsertNode(
        { type: "TASK", category: "tasks", name: `node-${i}`, description: "test", content: `content ${i}`, source: "user" },
        "session-1"
      );
      storage.saveVector(node.id, "test", Array(128).fill(0).map(() => Math.random() * 2 - 1));
    }
    const query = Array(128).fill(0).map(() => Math.random() * 2 - 1);
    const results = storage.vectorSearch(query, 3);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].node).toBeDefined();
    expect(typeof results[0].score).toBe("number");
  });

  // ─── Cleanup ────────────────────────────────────────────

  afterAll(() => {
    if (storage) storage.close();
  });
});
