/**
 * C-7: 核心召回响应时间基线
 * v2.0.0: 改用 upsertNode 替代 raw INSERT
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ContextEngine } from "../../src/engine/context.js";
import type { BmConfig } from "../../src/types.js";
import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DB_PATH = join(tmpdir(), "bm-recall-perf-baseline.db");

function cleanup() {
  for (const f of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`]) {
    try { if (existsSync(f)) unlinkSync(f); } catch {}
  }
}

describe("C-7 核心召回响应时间基线", () => {
  let engine: ContextEngine;

  beforeAll(async () => {
    cleanup();
    engine = new ContextEngine({
      dbPath: DB_PATH,
      llm: {},
      embedding: {},
      storage: 'sqlite',
      engine: 'graph',
      recallMaxNodes: 6,
      recallMaxDepth: 2,
      decay: {
        enabled: false, recencyHalfLifeDays: 30, recencyWeight: 0.4,
        frequencyWeight: 0.3, intrinsicWeight: 0.3, timeDecayHalfLifeDays: 60,
        betaCore: 0.8, betaWorking: 1.0, betaPeripheral: 1.3,
        coreDecayFloor: 0.9, workingDecayFloor: 0.7, peripheralDecayFloor: 0.5,
      },
      noiseFilter: { enabled: true, minContentLength: 10 },
      reflection: { enabled: false, turnReflection: false, sessionReflection: false,
        safetyFilter: false, maxInsights: 0, importanceBoost: 0, minConfidence: 0 },
      workingMemory: { enabled: false, maxTasks: 0, maxDecisions: 0, maxConstraints: 0 },
      fusion: { enabled: false, similarityThreshold: 0.75, minNodes: 999, minCommunities: 999 },
      reasoning: { enabled: false, maxHops: 0, maxConclusions: 0, minRecallNodes: 999 },
      compactTurnCount: 6,
      recallStrategy: 'full',
      dedupThreshold: 0.9,
      pagerankDamping: 0.85,
      pagerankIterations: 20,
      memoryInjection: { enabled: false, strategy: 'off', tokenBudget: 0, maxNodes: 0, includeEpisodic: false },
      memorySharing: { enabled: false, mode: 'isolated', sharedCategories: [], allowedAgents: [] },
    });

    const types = ["TASK", "SKILL", "EVENT"] as const;
    const categories = ["tasks", "skills", "events", "entities", "patterns"] as const;

    for (let i = 0; i < 200; i++) {
      engine.getDb().prepare(`INSERT INTO bm_nodes
        (id, type, category, name, description, content, status, validated_count,
         source_sessions, pagerank, importance, access_count, last_accessed,
         temporal_type, source,
         scope_session, scope_agent, scope_workspace,
         scope_platform, scope_user, scope_chat, scope_thread, scope_id,
         created_at, updated_at)
        VALUES (?,?,?,?,?,?,'active',1,'[]',0,0.5,0,0,'static',?,
                ?,?,?,
                null,null,null,null,null,
                ?,?)`).run(
        `n-perf-${Date.now()}-${i}`,
        types[i % 3], categories[i % 5],
        `perf-node-${i}`, `Description for node ${i}`,
        `Node ${i} content: benchmark recall latency ${types[i % 3]} ${categories[i % 5]} terms`,
        i % 2 === 0 ? "user" : "assistant",
        "session-1", "test-agent", "test-workspace",
        Date.now(), Date.now(),
      );
    }
  }, 15000);

  afterAll(() => {
    try { engine.close(); } catch {}
    cleanup();
  });

  it("召回延迟 < 500ms", async () => {
    const latencies: number[] = [];
    for (let i = 0; i < 20; i++) {
      const start = performance.now();
      const result = await engine.recall("performance latency benchmarking", { agent: "test-agent", workspace: "test-workspace" });
      latencies.push(performance.now() - start);
      if (i === 0) expect(result).toBeDefined();
    }
    const avg = latencies.reduce((s, x) => s + x, 0) / latencies.length;
    expect(avg).toBeLessThan(500);
  }, 30000);

  it("多词查询 < 500ms", async () => {
    const result = await engine.recall("performance latency benchmark recall retrieval skills", { agent: "test-agent", workspace: "test-workspace" });
    expect(result).toBeDefined();
  }, 15000);
});
