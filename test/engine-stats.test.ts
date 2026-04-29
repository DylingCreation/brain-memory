/**
 * brain-memory — F-5 Engine Stats (getStats) tests
 *
 * Verifies that getStats() returns comprehensive statistics with
 * proper structure and accuracy.
 */

import { describe, it, expect } from "vitest";
import { ContextEngine } from "../src/engine/context.ts";
import type { BmConfig } from "../src/types.ts";

function makeConfig(overrides: Partial<BmConfig> = {}): BmConfig {
  return {
    engine: "graph",
    storage: "sqlite",
    dbPath: ":memory:",
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
    llm: {},
    embedding: {},
    rerank: { enabled: false },
    reflection: {
      enabled: true,
      turnReflection: false,
      sessionReflection: true,
      safetyFilter: true,
      maxInsights: 8,
      importanceBoost: 0.15,
      minConfidence: 0.6,
    },
    workingMemory: {
      enabled: true,
      maxTasks: 3,
      maxDecisions: 5,
      maxConstraints: 5,
    },
    fusion: {
      enabled: true,
      similarityThreshold: 0.75,
      minNodes: 20,
      minCommunities: 3,
    },
    reasoning: {
      enabled: true,
      maxHops: 2,
      maxConclusions: 3,
      minRecallNodes: 3,
    },
    ...overrides,
  };
}

describe("getStats() — F-5", () => {
  it("returns complete structure on empty database", () => {
    const config = makeConfig();
    const engine = new ContextEngine(config);
    try {
      const stats = engine.getStats();

      // Backward-compatible top-level fields
      expect(stats.nodeCount).toBe(0);
      expect(stats.edgeCount).toBe(0);
      expect(stats.sessionCount).toBe(0);

      // Node breakdowns
      expect(stats.nodes.total).toBe(0);
      expect(stats.nodes.active).toBe(0);
      expect(stats.nodes.deprecated).toBe(0);
      expect(stats.nodes.byType.task).toBe(0);
      expect(stats.nodes.byType.skill).toBe(0);
      expect(stats.nodes.byType.event).toBe(0);
      expect(stats.nodes.byTemporalType.static).toBe(0);
      expect(stats.nodes.byTemporalType.dynamic).toBe(0);
      expect(stats.nodes.bySource.user).toBe(0);
      expect(stats.nodes.bySource.assistant).toBe(0);

      // Other counts
      expect(stats.edges.total).toBe(0);
      expect(stats.communities).toBe(0);
      expect(stats.vectors).toBe(0);

      // Metadata
      expect(stats.schemaVersion).toBe(1);
      expect(stats.uptimeMs).toBeGreaterThanOrEqual(0);
      expect(typeof stats.dbSizeBytes).toBe("number");
      expect(stats.queryTimeMs).toBeGreaterThanOrEqual(0);

      // Embed cache
      expect(stats.embedCache).toBeDefined();
      expect(typeof stats.embedCache.hits).toBe("number");
      expect(typeof stats.embedCache.misses).toBe("number");
      expect(typeof stats.embedCache.hitRate).toBe("number");
      expect(typeof stats.embedCache.size).toBe("number");
    } finally {
      engine.close();
    }
  });

  it("query time is under 100ms (performance requirement)", () => {
    const config = makeConfig();
    const engine = new ContextEngine(config);
    try {
      const stats = engine.getStats();
      expect(stats.queryTimeMs).toBeLessThan(100);
    } finally {
      engine.close();
    }
  });

  it("uptime increases between calls", async () => {
    const config = makeConfig();
    const engine = new ContextEngine(config);
    try {
      const s1 = engine.getStats();
      await new Promise((r) => setTimeout(r, 50));
      const s2 = engine.getStats();
      expect(s2.uptimeMs).toBeGreaterThanOrEqual(s1.uptimeMs);
    } finally {
      engine.close();
    }
  });

  it("multiple calls return consistent structure", () => {
    const config = makeConfig();
    const engine = new ContextEngine(config);
    try {
      const stats1 = engine.getStats();
      const stats2 = engine.getStats();

      // All fields present in both
      expect(typeof stats1.nodeCount).toBe("number");
      expect(typeof stats2.nodeCount).toBe("number");
      expect(stats1.nodeCount).toBe(stats2.nodeCount);
      expect(stats1.edgeCount).toBe(stats2.edgeCount);
      expect(stats1.sessionCount).toBe(stats2.sessionCount);
    } finally {
      engine.close();
    }
  });

  it("backward compatibility: top-level fields match nested fields", () => {
    const config = makeConfig();
    const engine = new ContextEngine(config);
    try {
      const stats = engine.getStats();

      expect(stats.nodeCount).toBe(stats.nodes.total);
      expect(stats.edgeCount).toBe(stats.edges.total);
    } finally {
      engine.close();
    }
  });
});
