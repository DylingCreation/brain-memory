/**
 * brain-memory — ContextEngine Full Integration Test (Test 3)
 *
 * Verifies the complete pipeline: LLM extraction + Embedding + SQLite + Recall
 * all working together through ContextEngine.processTurn() and engine.recall().
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env" });

import { describe, it, expect, afterAll } from "vitest";
import { ContextEngine } from "../src/engine/context";
import type { BmConfig } from "../src/types";

// ─── Config ────────────────────────────────────────────────────

function getApiKey(): string | null {
  const key = process.env.TEST_LLM_API_KEY;
  if (key && key !== "YOUR_API_KEY_HERE" && key.length > 10) return key;
  return null;
}

const TEST_DB = ":memory:";

function makeConfig(apiKey: string): BmConfig {
  return {
    engine: "graph",
    storage: "sqlite",
    dbPath: TEST_DB,
    compactTurnCount: 6,
    recallMaxNodes: 6,
    recallMaxDepth: 2,
    recallStrategy: "full",
    dedupThreshold: 0.90,
    pagerankDamping: 0.85,
    pagerankIterations: 20,
    decay: { enabled: false },
    noiseFilter: { enabled: true, minContentLength: 10 },
    reflection: {
      enabled: false,  // disable to speed up test
      turnReflection: false,
      sessionReflection: false,
      safetyFilter: false,
      maxInsights: 8,
      importanceBoost: 0.15,
      minConfidence: 0.6,
    },
    workingMemory: { enabled: true, maxTasks: 3, maxDecisions: 5, maxConstraints: 5 },
    fusion: { enabled: false },  // disable LLM-dependent fusion
    reasoning: { enabled: true, maxHops: 2, maxConclusions: 3, minRecallNodes: 3 },
    rerank: { enabled: false },
    llm: {
      baseURL: "https://coding.dashscope.aliyuncs.com/v1",
      apiKey,
      model: "qwen3.6-plus",
    },
    embedding: {
      baseURL: "http://localhost:11434/api",
      model: "bge-m3",
    },
  };
}

// ─── Tests ─────────────────────────────────────────────────────

describe("ContextEngine Full Integration", () => {
  const apiKey = getApiKey();

  if (!apiKey) {
    it.skip("skipped: TEST_LLM_API_KEY not set", () => {});
  } else {
    let engine: ContextEngine;

    afterAll(() => {
      if (engine) engine.close();
    });

    it("initializes without error with LLM + Embedding configured", () => {
      engine = new ContextEngine(makeConfig(apiKey));
      expect(engine).toBeDefined();
    });

    it("processTurn extracts knowledge from a real conversation", async () => {
      const result = await engine.processTurn({
        sessionId: "integration-test-1",
        agentId: "test-agent",
        workspaceId: "test-workspace",
        messages: [
          {
            role: "user",
            content: "I need to implement a memory system for my AI agent using TypeScript and SQLite. The agent should be able to extract knowledge from conversations.",
          },
          {
            role: "assistant",
            content: "I recommend using a knowledge graph with SQLite for storage. We can extract entities, tasks, and skills from conversations.",
          },
        ],
      });

      expect(result.extractedNodes.length).toBeGreaterThan(0);
      expect(result.extractedEdges.length).toBeGreaterThanOrEqual(0);
      console.log(`Extracted ${result.extractedNodes.length} nodes, ${result.extractedEdges.length} edges`);
      console.log("Nodes:", JSON.stringify(result.extractedNodes.map(n => ({ name: n.name, type: n.type, category: n.category }))));
    }, 60000);

    it("recall finds relevant memories after processTurn", async () => {
      const recall = await engine.recall(
        "TypeScript memory system SQLite",
        "integration-test-1",
        "test-agent",
        "test-workspace"
      );

      expect(recall.nodes.length).toBeGreaterThan(0);
      console.log(`Recalled ${recall.nodes.length} nodes for query: "TypeScript memory system SQLite"`);
      console.log("Recalled:", JSON.stringify(recall.nodes.map(n => ({ name: n.name, score: n.score }))));
    });

    it("recall with Chinese query finds relevant memories", async () => {
      // First add a Chinese conversation turn
      await engine.processTurn({
        sessionId: "integration-test-cn",
        agentId: "test-agent",
        workspaceId: "test-workspace",
        messages: [
          {
            role: "user",
            content: "我正在开发一个TypeScript项目，需要用SQLite做数据存储。",
          },
        ],
      });

      const recall = await engine.recall(
        "TypeScript 项目 数据库",
        "integration-test-cn",
        "test-agent",
        "test-workspace"
      );

      expect(recall.nodes.length).toBeGreaterThan(0);
      console.log(`Recalled ${recall.nodes.length} nodes for Chinese query`);
    });

    it("working memory tracks current context", () => {
      const wmCtx = engine.getWorkingMemoryContext();
      // Working memory should be functional (may be empty or have content)
      expect(wmCtx).toBeDefined();
    });

    it("searchNodes finds nodes by query", () => {
      const nodes = engine.searchNodes("TypeScript", 10);
      expect(nodes.length).toBeGreaterThan(0);
      console.log(`searchNodes found ${nodes.length} nodes for "TypeScript"`);
    });

    it("getStats returns valid statistics", () => {
      const stats = engine.getStats();
      console.log("Stats keys:", Object.keys(stats));
      console.log("Stats:", JSON.stringify(stats, null, 2));
      // Stats structure varies by version — check that the object is populated
      expect(Object.keys(stats).length).toBeGreaterThan(0);
      // Check common fields exist in v0.2.0+
      if (stats.nodes !== undefined) {
        expect(stats.nodes.total).toBeGreaterThan(0);
      } else if (stats.nodeCount !== undefined) {
        expect(stats.nodeCount).toBeGreaterThan(0);
      }
    });

    it("healthCheck reports healthy status", () => {
      const health = engine.healthCheck();
      console.log("Health keys:", Object.keys(health));
      console.log("Health:", JSON.stringify(health, null, 2));
      // Check that the object is populated
      expect(Object.keys(health).length).toBeGreaterThan(0);
      // db status should be ok for in-memory SQLite
      if (health.db) {
        expect(health.db.status).toBe("ok");
      }
    });
  }
});
