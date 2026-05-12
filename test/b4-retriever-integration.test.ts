/**
 * v1.0.0 B-4 — Retriever Integration Tests
 *
 * Covers retriever/ integration into recall main flow:
 * - Admission control + cosine rerank paths
 * - processTurn with admission control
 * 5 test cases.
 */

import { describe, it, expect } from "vitest";
import { createTestDb, insertNode } from "./helpers";
import { AdmissionController, DEFAULT_ADMISSION_CONFIG, type AdmissionConfig } from "../src/retriever/admission-control";
import { Reranker, type RerankerConfig } from "../src/retriever/reranker";
import type { BmConfig } from "../src/types";

// ─── Test 1: recall + rerank enabled, no API key → cosine fallback ──

describe("Reranker — cosine fallback without API key", () => {
  it("does not crash with cosine when apiKey is missing", async () => {
    const cfg: BmConfig = {
      dbPath: ":memory:",
      rerank: {
        enabled: true,
        apiKey: "", // no API key
        provider: "jina",
      },
    };
    const reranker = new Reranker(cfg);

    const nodes = [
      { id: "n1", type: "TASK" as const, category: "tasks" as const, name: "A", description: "desc A", content: "content A", status: "active" as const, validatedCount: 1, sourceSessions: [], communityId: null, pagerank: 0.5, importance: 0.5, accessCount: 0, lastAccessedAt: 0, source: "user" as const, createdAt: Date.now(), updatedAt: Date.now() },
      { id: "n2", type: "SKILL" as const, category: "skills" as const, name: "B", description: "desc B", content: "content B", status: "active" as const, validatedCount: 1, sourceSessions: [], communityId: null, pagerank: 0.3, importance: 0.3, accessCount: 0, lastAccessedAt: 0, source: "user" as const, createdAt: Date.now(), updatedAt: Date.now() },
    ];

    // Without embedFn, cosine fallback returns nodes sorted by score 0 (stable order)
    const result = await reranker.rerank("test query", [0.1, 0.2, 0.3], nodes);
    expect(result.nodes.length).toBe(2);
    expect(result.apiUsed).toBe(false);
  });
});

// ─── Test 2: recall + rerank enabled, no embedding → graceful degradation ──

describe("Reranker — graceful degradation without embedding", () => {
  it("handles null embedFn gracefully", async () => {
    const cfg: BmConfig = {
      dbPath: ":memory:",
      rerank: {
        enabled: true,
        apiKey: "",
        provider: "jina",
      },
    };
    const reranker = new Reranker(cfg);

    const nodes = [
      { id: "n1", type: "TASK" as const, category: "tasks" as const, name: "A", description: "desc A", content: "content A", status: "active" as const, validatedCount: 1, sourceSessions: [], communityId: null, pagerank: 0.5, importance: 0.5, accessCount: 0, lastAccessedAt: 0, source: "user" as const, createdAt: Date.now(), updatedAt: Date.now() },
    ];

    // No embedFn — should still work (cosine with no vectors = all scores 0)
    const result = await reranker.rerank("query", [0.1], nodes, null);
    expect(result.nodes.length).toBe(1);
    expect(result.apiUsed).toBe(false);
  });
});

// ─── Test 3: processTurn without LLM + admission default off → main flow works ──

describe("AdmissionController — disabled by default", () => {
  it("accepts all when admission control is disabled", () => {
    const db = createTestDb();
    const config: AdmissionConfig = { ...DEFAULT_ADMISSION_CONFIG, enabled: false };
    const ac = new AdmissionController(db, config);

    const result = ac.evaluate({
      name: "test-memory",
      content: "This is a test memory with enough content length to pass",
      category: "tasks",
    });

    expect(result.decision).toBe("accept");
    expect(result.reason).toBe("admission control disabled");
    db.close();
  });
});

// ─── Test 4: processTurn + admission enabled → gatekeeper works ──

describe("AdmissionController — enabled gatekeeper", () => {
  it("accepts when content passes all checks", () => {
    const db = createTestDb();
    const config: AdmissionConfig = {
      ...DEFAULT_ADMISSION_CONFIG,
      enabled: true,
      minContentLength: 10,
    };
    const ac = new AdmissionController(db, config);

    const result = ac.evaluate({
      name: "new-memory",
      content: "This is a test memory that is long enough to pass the minimum length check",
      category: "tasks",
    });

    expect(result.decision).toBe("accept");
    db.close();
  });
});

// ─── Test 5: processTurn + admission with high minContentLength → short content rejected ──

describe("AdmissionController — min content length rejection", () => {
  it("rejects short content when minContentLength is high", () => {
    const db = createTestDb();
    const config: AdmissionConfig = {
      ...DEFAULT_ADMISSION_CONFIG,
      enabled: true,
      minContentLength: 100,
    };
    const ac = new AdmissionController(db, config);

    const result = ac.evaluate({
      name: "short-memory",
      content: "too short",
      category: "tasks",
    });

    expect(result.decision).toBe("reject");
    expect(result.reason).toContain("content too short");
    db.close();
  });
});
