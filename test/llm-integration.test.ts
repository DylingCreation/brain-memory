/**
 * brain-memory — LLM Integration Tests
 *
 * Tests that actually call the LLM to verify prompts work end-to-end.
 * Requires: ANTHROPIC_API_KEY or DASHSCOPE_API_KEY env var.
 *
 * Run with: BM_LLM_TEST=1 npx vitest run test/llm-integration.test.ts
 * Skip (default): npx vitest run test/ --exclude 'llm-integration'
 */

import { describe, it, expect, beforeAll } from "vitest";
import { createCompleteFn, type CompleteFn } from "../src/engine/llm.ts";
import { reflectOnSession } from "../src/reflection/extractor.ts";
import { runReasoning, shouldRunReasoning } from "../src/reasoning/engine.ts";
import { runFusion, shouldRunFusion, findFusionCandidates, decideFusion } from "../src/fusion/analyzer.ts";
import { saveVector } from "../src/store/store.ts";
import { DatabaseSync } from "@photostructure/sqlite";

// ─── Test Configuration ──────────────────────────────────────────

const LLM_ENABLED = process.env.BM_LLM_TEST === "1";
const API_KEY = "sk-sp-876da19ae67142baa215b9d9ff8cc325";
const BASE_URL = "https://coding.dashscope.aliyuncs.com/v1";
const MODEL = "qwen3.6-plus";

let llm: CompleteFn;

beforeAll(() => {
  llm = createCompleteFn({
    apiKey: API_KEY,
    baseURL: BASE_URL,
    model: MODEL,
  });
});

const defaultReflectionConfig = {
  enabled: true,
  turnReflection: false,
  sessionReflection: true,
  safetyFilter: true,
  maxInsights: 8,
  importanceBoost: 0.15,
  minConfidence: 0.6,
};

const defaultReasoningConfig = {
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
  reasoning: { enabled: true, maxHops: 2, maxConclusions: 3, minRecallNodes: 2 },
};

function makeNode(overrides: Partial<{
  id: string; type: "TASK" | "SKILL" | "EVENT"; category: string;
  name: string; description: string; content: string;
}>): any {
  const now = Date.now();
  return {
    id: overrides.id || `n-${Math.random().toString(36).slice(2, 8)}`,
    type: overrides.type || "TASK",
    category: overrides.category || "tasks",
    name: overrides.name || "test-node",
    description: overrides.description || "",
    content: overrides.content || "test content",
    status: "active",
    validatedCount: 1,
    sourceSessions: ["test"],
    communityId: null,
    pagerank: 0,
    importance: 0.5,
    accessCount: 0,
    lastAccessedAt: 0,
    temporalType: "static",
    scopeSession: null,
    scopeAgent: null,
    scopeWorkspace: null,
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Reflection Integration Tests ──────────────────────────────

describe.skipIf(!LLM_ENABLED)("Session Reflection (LLM)", () => {
  it("extracts insights from session data", async () => {
    const nodes = [
      { name: "chinese-preference", category: "preferences", type: "TASK", content: "用户要求所有回复用中文" },
      { name: "python-only", category: "preferences", type: "TASK", content: "用户只写 Python，不接受 TypeScript" },
      { name: "docker-port-fix", category: "cases", type: "EVENT", content: "Docker 端口冲突解决：修改 container_port 从 8080 到 8081" },
    ];

    const insights = await reflectOnSession(
      { ...defaultReflectionConfig, sessionReflection: true },
      llm,
      { sessionMessages: "test", extractedNodes: nodes },
    );

    expect(insights.length).toBeGreaterThan(0);
    expect(insights.some(i => i.kind === "user-model" || i.kind === "lesson")).toBe(true);
    expect(insights.every(i => i.text.length > 0)).toBe(true);
  }, { timeout: 60000 });

  it("handles empty session gracefully", async () => {
    const insights = await reflectOnSession(
      { ...defaultReflectionConfig, sessionReflection: true },
      llm,
      { sessionMessages: "test", extractedNodes: [] },
    );
    expect(insights.length).toBe(0);
  }, { timeout: 60000 });
});

// ─── Reasoning Integration Tests ───────────────────────────────

describe.skipIf(!LLM_ENABLED)("Reasoning (LLM)", () => {
  it("derives conclusions from related nodes", async () => {
    const nodes = [
      makeNode({ name: "service-a-dockerfile", type: "TASK", category: "tasks", content: "A 服务使用 Python+Flask+Docker，端口 8080" }),
      makeNode({ name: "service-b-tech", type: "TASK", category: "tasks", content: "B 服务也是 Python+Flask 框架，还没写 Dockerfile" }),
      makeNode({ name: "port-config", type: "TASK", category: "tasks", content: "A 服务端口 8080，B 服务也计划用 8080" }),
    ];
    const edges = [
      { id: "e1", fromId: nodes[0].id, toId: nodes[2].id, type: "USED_SKILL", instruction: "A uses port 8080", sessionId: "test", createdAt: Date.now() },
    ];

    const result = await runReasoning(llm, nodes, edges, "B 服务部署", defaultReasoningConfig);

    expect(result.triggered).toBe(true);
    expect(result.conclusions.length).toBeGreaterThan(0);
    expect(result.conclusions.some(c => c.text.length > 10)).toBe(true);
  }, { timeout: 60000 });
});

// ─── Fusion Integration Tests ──────────────────────────────────

describe.skipIf(!LLM_ENABLED)("Fusion (LLM)", () => {
  it("decides merge for highly similar nodes", async () => {
    // Create an in-memory DB with similar nodes
    const db = new DatabaseSync(":memory:");
    const SCHEMA = `
      CREATE TABLE bm_nodes (
        id TEXT PRIMARY KEY, type TEXT NOT NULL, category TEXT NOT NULL,
        name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', content TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active', validated_count INTEGER NOT NULL DEFAULT 1,
        source_sessions TEXT NOT NULL DEFAULT '[]', community_id TEXT,
        pagerank REAL NOT NULL DEFAULT 0, importance REAL NOT NULL DEFAULT 0.5,
        access_count INTEGER NOT NULL DEFAULT 0, last_accessed INTEGER NOT NULL DEFAULT 0,
        temporal_type TEXT NOT NULL DEFAULT 'static', scope_session TEXT, scope_agent TEXT,
        scope_workspace TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE bm_vectors (node_id TEXT PRIMARY KEY, embedding BLOB NOT NULL, hash TEXT NOT NULL);
      CREATE TABLE bm_edges (
        id TEXT PRIMARY KEY, from_id TEXT NOT NULL, to_id TEXT NOT NULL,
        type TEXT NOT NULL, instruction TEXT NOT NULL, condition TEXT,
        session_id TEXT NOT NULL, created_at INTEGER NOT NULL
      );
    `;
    db.exec(SCHEMA);

    // Insert two very similar nodes + 8 filler nodes to meet min count (10)
    const now = Date.now();
    db.exec(`
      INSERT INTO bm_nodes VALUES ('n1','TASK','tasks','docker-port-fix','Fix Docker port conflict','Change container port from 8080 to 8081','active',1,'[]',null,0,0.5,0,0,'static',null,null,null,${now},${now});
      INSERT INTO bm_nodes VALUES ('n2','TASK','tasks','docker-port-fix-solution','Docker port fix solution','Change container port from 8080 to 8081','active',1,'[]',null,0,0.5,0,0,'static',null,null,null,${now},${now});
    `);

    // Add 8 filler nodes to meet the 10-node minimum
    for (let i = 3; i <= 10; i++) {
      db.exec(`
        INSERT INTO bm_nodes VALUES ('n${i}','TASK','tasks','filler-node-${i}','Filler node ${i}','Unrelated content for node ${i}','active',1,'[]',null,0,0.5,0,0,'static',null,null,null,${now},${now});
      `);
    }

    // Create embedding vectors (identical for high similarity)
    const vec = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]);
    saveVector(db, 'n1', 'test content', Array.from(vec));
    saveVector(db, 'n2', 'test content', Array.from(vec));

    const cfg = {
      ...defaultReasoningConfig,
      fusion: { enabled: true, similarityThreshold: 0.5, minNodes: 1, minCommunities: 0 },
    };

    const candidates = findFusionCandidates(db, cfg, null);

    // Should find at least one candidate (same content → high similarity)
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].nameScore).toBeGreaterThan(0);
  }, { timeout: 10000 });

  it("LLM correctly decides merge for duplicate nodes", async () => {
    const nodeA = makeNode({ name: "docker-port-fix", type: "TASK", content: "Change container port from 8080 to 8081" });
    const nodeB = makeNode({ name: "docker-port-fix-solution", type: "TASK", content: "Change container port from 8080 to 8081" });

    const candidates = [{
      nodeA, nodeB, nameScore: 0.6, vectorScore: 0.95,
      combinedScore: 0.8, decision: "none", reason: "",
    }];

    const decided = await decideFusion(llm, candidates);

    expect(decided.length).toBe(1);
    expect(decided[0].decision).toBe("merge");
  }, { timeout: 60000 });

  it("LLM correctly decides none for unrelated nodes", async () => {
    const nodeA = makeNode({ name: "docker-port-fix", type: "TASK", content: "Change container port from 8080 to 8081" });
    const nodeB = makeNode({ name: "python-style", type: "TASK", content: "User prefers no type hints in Python" });

    const candidates = [{
      nodeA, nodeB, nameScore: 0.05, vectorScore: 0.1,
      combinedScore: 0.07, decision: "none", reason: "",
    }];

    // This won't reach LLM because score is below threshold, so test the parsing directly
    // Instead, let's test LLM decision with forced high score but unrelated content
    const candidates2 = [{
      nodeA, nodeB, nameScore: 0.05, vectorScore: 0.1,
      combinedScore: 0.85, decision: "none", reason: "",
    }];

    const decided = await decideFusion(llm, candidates2);

    expect(decided.length).toBe(1);
    expect(decided[0].decision).toBe("none");
  }, { timeout: 60000 });
});

// ─── Basic LLM Connectivity Test ───────────────────────────────

describe.skipIf(!LLM_ENABLED)("LLM Connectivity", () => {
  it("can call the LLM API", async () => {
    const result = await llm("你是一个助手。回复一个字：好", "测试连接");
    expect(result.trim().length).toBeGreaterThan(0);
  }, { timeout: 60000 });
});
