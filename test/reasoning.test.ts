/**
 * brain-memory — Reasoning Engine tests
 */

import { describe, it, expect } from "vitest";
import {
  parseReasoningResult,
  buildReasoningContext,
  shouldRunReasoning,
} from "../src/reasoning/engine.ts";

const defaultConfig = {
  engine: "graph" as const,
  storage: "sqlite" as const,
  dbPath: "~/.openclaw/brain-memory.db",
  compactTurnCount: 6,
  recallMaxNodes: 6,
  recallMaxDepth: 2,
  recallStrategy: "full" as const,
  dedupThreshold: 0.90,
  pagerankDamping: 0.85,
  pagerankIterations: 20,
  decay: { enabled: false, recencyHalfLifeDays: 30, recencyWeight: 0.4, frequencyWeight: 0.3, intrinsicWeight: 0.3, timeDecayHalfLifeDays: 60, betaCore: 0.8, betaWorking: 1.0, betaPeripheral: 1.3, coreDecayFloor: 0.9, workingDecayFloor: 0.7, peripheralDecayFloor: 0.5 },
  noiseFilter: { enabled: true, minContentLength: 10 },
  reflection: { enabled: true, turnReflection: false, sessionReflection: true, safetyFilter: true, maxInsights: 8, importanceBoost: 0.15, minConfidence: 0.6 },
  workingMemory: { enabled: true, maxTasks: 3, maxDecisions: 5, maxConstraints: 5 },
  fusion: { enabled: true, similarityThreshold: 0.75, minNodes: 20, minCommunities: 3 },
  reasoning: { enabled: true, maxHops: 2, maxConclusions: 3, minRecallNodes: 3 },
};

describe("shouldRunReasoning", () => {
  it("returns false for fewer than minRecallNodes", () => {
    const nodes = [
      { id: "n1", type: "TASK", category: "tasks", name: "task-1", description: "", content: "", status: "active", validatedCount: 1, sourceSessions: [], communityId: null, pagerank: 0, importance: 0.5, accessCount: 0, lastAccessedAt: 0, temporalType: "static", scopeSession: null, scopeAgent: null, scopeWorkspace: null, createdAt: 0, updatedAt: 0 },
      { id: "n2", type: "TASK", category: "tasks", name: "task-2", description: "", content: "", status: "active", validatedCount: 1, sourceSessions: [], communityId: null, pagerank: 0, importance: 0.5, accessCount: 0, lastAccessedAt: 0, temporalType: "static", scopeSession: null, scopeAgent: null, scopeWorkspace: null, createdAt: 0, updatedAt: 0 },
    ];
    expect(shouldRunReasoning(nodes as any, defaultConfig)).toBe(false);
  });

  it("returns true for minRecallNodes or more", () => {
    const nodes = [
      { id: "n1", type: "TASK", category: "tasks", name: "task-1", description: "", content: "", status: "active", validatedCount: 1, sourceSessions: [], communityId: null, pagerank: 0, importance: 0.5, accessCount: 0, lastAccessedAt: 0, temporalType: "static", scopeSession: null, scopeAgent: null, scopeWorkspace: null, createdAt: 0, updatedAt: 0 },
      { id: "n2", type: "TASK", category: "tasks", name: "task-2", description: "", content: "", status: "active", validatedCount: 1, sourceSessions: [], communityId: null, pagerank: 0, importance: 0.5, accessCount: 0, lastAccessedAt: 0, temporalType: "static", scopeSession: null, scopeAgent: null, scopeWorkspace: null, createdAt: 0, updatedAt: 0 },
      { id: "n3", type: "TASK", category: "tasks", name: "task-3", description: "", content: "", status: "active", validatedCount: 1, sourceSessions: [], communityId: null, pagerank: 0, importance: 0.5, accessCount: 0, lastAccessedAt: 0, temporalType: "static", scopeSession: null, scopeAgent: null, scopeWorkspace: null, createdAt: 0, updatedAt: 0 },
    ];
    expect(shouldRunReasoning(nodes as any, defaultConfig)).toBe(true);
  });
});

describe("parseReasoningResult", () => {
  it("parses valid JSON response", () => {
    const raw = '{"conclusions":[{"text":"A 可以参考 B 的 Dockerfile","type":"path","confidence":0.8}]}';
    const result = parseReasoningResult(raw, 3);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("A 可以参考 B 的 Dockerfile");
    expect(result[0].type).toBe("path");
    expect(result[0].confidence).toBe(0.8);
  });

  it("clamps confidence to [0, 1]", () => {
    const raw = '{"conclusions":[{"text":"test","type":"implicit","confidence":1.5}]}';
    const result = parseReasoningResult(raw, 3);
    expect(result[0].confidence).toBe(1);
  });

  it("defaults confidence to 0.7", () => {
    const raw = '{"conclusions":[{"text":"test","type":"pattern"}]}';
    const result = parseReasoningResult(raw, 3);
    expect(result[0].confidence).toBe(0.7);
  });

  it("invalid type defaults to implicit", () => {
    const raw = '{"conclusions":[{"text":"test","type":"unknown"}]}';
    const result = parseReasoningResult(raw, 3);
    expect(result[0].type).toBe("implicit");
  });

  it("respects maxConclusions limit", () => {
    const raw = '{"conclusions":[{"text":"c1","type":"path"},{"text":"c2","type":"implicit"},{"text":"c3","type":"pattern"},{"text":"c4","type":"path"}]}';
    const result = parseReasoningResult(raw, 3);
    expect(result).toHaveLength(3);
  });

  it("filters empty text", () => {
    const raw = '{"conclusions":[{"text":"","type":"path"},{"text":"valid","type":"implicit"}]}';
    const result = parseReasoningResult(raw, 3);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("valid");
  });

  it("handles markdown code blocks", () => {
    const raw = '```json\n{"conclusions":[{"text":"test","type":"path"}]}\n```';
    const result = parseReasoningResult(raw, 3);
    expect(result).toHaveLength(1);
  });

  it("handles thinking tags", () => {
    const raw = '<think>let me think</think>\n{"conclusions":[{"text":"test","type":"path"}]}';
    const result = parseReasoningResult(raw, 3);
    expect(result).toHaveLength(1);
  });

  it("returns empty on invalid JSON", () => {
    const result = parseReasoningResult("not json", 3);
    expect(result).toHaveLength(0);
  });
});

describe("buildReasoningContext", () => {
  it("returns null for empty conclusions", () => {
    expect(buildReasoningContext([])).toBeNull();
  });

  it("builds XML context", () => {
    const conclusions = [
      { text: "A 可以参考 B", type: "path" as const, confidence: 0.8 },
      { text: "C 和 D 有冲突", type: "contradiction" as const, confidence: 0.9 },
    ];
    const xml = buildReasoningContext(conclusions);
    expect(xml).not.toBeNull();
    expect(xml).toContain("<reasoning>");
    expect(xml).toContain("路径推导");
    expect(xml).toContain("矛盾检测");
    expect(xml).toContain("</reasoning>");
    expect(xml).toContain("A 可以参考 B");
    expect(xml).toContain("C 和 D 有冲突");
  });

  it("escapes XML special characters", () => {
    const conclusions = [
      { text: "A < B & C > D", type: "path" as const, confidence: 0.7 },
    ];
    const xml = buildReasoningContext(conclusions);
    expect(xml).toContain("A &lt; B &amp; C &gt; D");
  });
});
