/**
 * brain-memory — Graceful degradation tests (F-3)
 *
 * Verify that when LLM is not configured, brain-memory does NOT crash,
 * and non-LLM features (recall, working memory, stats) remain functional.
 */

import { describe, it, expect } from "vitest";
import { ContextEngine } from "../src/engine/context";
import type { BmConfig } from "../src/types";

// ─── Helpers ───────────────────────────────────────────────────

function baseConfig(dbPath: string): BmConfig {
  return {
    engine: "graph",
    storage: "sqlite",
    dbPath,
    compactTurnCount: 6,
    recallMaxNodes: 6,
    recallMaxDepth: 2,
    recallStrategy: "full",
    dedupThreshold: 0.90,
    pagerankDamping: 0.85,
    pagerankIterations: 20,
    decay: {
      enabled: false,
      recencyHalfLifeDays: 30,
      recencyWeight: 0.4,
      frequencyWeight: 0.3,
      intrinsicWeight: 0.3,
      timeDecayHalfLifeDays: 60,
      betaCore: 0.8,
      betaWorking: 1.0,
      betaPeripheral: 1.3,
      coreDecayFloor: 0.9,
      workingDecayFloor: 0.7,
      peripheralDecayFloor: 0.5,
    },
    noiseFilter: { enabled: true, minContentLength: 10 },
    llm: {},          // ← No LLM config
    embedding: {},    // ← No embedding config
    rerank: { enabled: false },
    reflection: {
      enabled: true,
      turnReflection: true,
      sessionReflection: true,
      safetyFilter: true,
      maxInsights: 8,
      importanceBoost: 0.15,
      minConfidence: 0.6,
    },
    workingMemory: { enabled: true, maxTasks: 3, maxDecisions: 5, maxConstraints: 5 },
    fusion: { enabled: true, similarityThreshold: 0.75, minNodes: 20, minCommunities: 3 },
    reasoning: { enabled: true, maxHops: 2, maxConclusions: 3, minRecallNodes: 3 },
  };
}

// ─── Tests ─────────────────────────────────────────────────────

describe("ContextEngine without LLM", () => {
  it("constructs without throwing when LLM is not configured", () => {
    expect(() => new ContextEngine(baseConfig(":memory:"))).not.toThrow();
  });

  it("processTurn returns empty nodes/edges/reflections (does not crash)", async () => {
    const engine = new ContextEngine(baseConfig(":memory:"));

    const result = await engine.processTurn({
      sessionId: "test-session",
      agentId: "test-agent",
      workspaceId: "test-workspace",
      messages: [
        { role: "user", content: "How do I set up Docker on Ubuntu?" },
        { role: "assistant", content: "Install Docker using apt..." },
      ],
    });

    expect(result.extractedNodes).toEqual([]);
    expect(result.extractedEdges).toEqual([]);
    expect(result.reflections).toEqual([]);
    // Working memory should still be updated
    expect(result.workingMemory).toBeDefined();
  });

  it("recall does not crash without LLM", async () => {
    const engine = new ContextEngine(baseConfig(":memory:"));

    const result = await engine.recall("Docker", "test-session", "test-agent", "test-workspace");

    expect(result).toBeDefined();
    expect(result.nodes).toBeDefined();
    expect(result.tokenEstimate).toBeDefined();
  });

  it("performFusion returns empty result without LLM", async () => {
    const engine = new ContextEngine(baseConfig(":memory:"));

    const result = await engine.performFusion("test-fusion");

    expect(result).toBeDefined();
    expect(result.merged).toBe(0);
    expect(result.linked).toBe(0);
  });

  it("reflectOnSession returns empty array without LLM", async () => {
    const engine = new ContextEngine(baseConfig(":memory:"));

    const result = await engine.reflectOnSession("test-session", [
      { role: "user", content: "hello" },
    ]);

    expect(result).toEqual([]);
  });

  it("performReasoning returns empty array without LLM", async () => {
    const engine = new ContextEngine(baseConfig(":memory:"));

    const result = await engine.performReasoning("test query");

    expect(result).toEqual([]);
  });

  it("getStats works without LLM", () => {
    const engine = new ContextEngine(baseConfig(":memory:"));

    const stats = engine.getStats();

    expect(stats).toBeDefined();
    expect(typeof stats.nodeCount).toBe("number");
    expect(typeof stats.edgeCount).toBe("number");
    expect(typeof stats.sessionCount).toBe("number");
  });

  it("getAllActiveNodes works without LLM", () => {
    const engine = new ContextEngine(baseConfig(":memory:"));

    const nodes = engine.getAllActiveNodes();

    expect(nodes).toBeDefined();
    expect(Array.isArray(nodes)).toBe(true);
  });

  it("searchNodes works without LLM", () => {
    const engine = new ContextEngine(baseConfig(":memory:"));

    const nodes = engine.searchNodes("test");

    expect(nodes).toBeDefined();
    expect(Array.isArray(nodes)).toBe(true);
  });

  it("runMaintenance does not crash without LLM", async () => {
    const engine = new ContextEngine(baseConfig(":memory:"));

    await expect(engine.runMaintenance()).resolves.not.toThrow();
  });

  it("multiple processTurn calls work sequentially without LLM", async () => {
    const engine = new ContextEngine(baseConfig(":memory:"));

    for (let i = 0; i < 3; i++) {
      const result = await engine.processTurn({
        sessionId: `session-${i}`,
        agentId: "test-agent",
        workspaceId: "test-workspace",
        messages: [{ role: "user", content: `Turn ${i}` }],
      });
      expect(result.extractedNodes).toEqual([]);
      expect(result.workingMemory).toBeDefined();
    }
  });
});

describe("ContextEngine with LLM configured", () => {
  it("constructs normally when LLM apiKey is provided", () => {
    const config = baseConfig(":memory:");
    config.llm = { apiKey: "test-key", baseURL: "https://test.api/v1", model: "test-model" };

    expect(() => new ContextEngine(config)).not.toThrow();
  });
});
