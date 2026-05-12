/**
 * C-7: 核心召回响应时间基线
 *
 * 首次测量 recall 全链路耗时，建立 v1.0.0 基线。
 * 使用直接 CRUD 插入种子数据，不依赖 LLM。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ContextEngine } from "../src/engine/context.js";
import type { BmConfig } from "../src/types.js";
import { existsSync, unlinkSync } from "node:fs";

const DB_PATH = "/tmp/bm-recall-perf-baseline.db";

function cleanup() {
  for (const f of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`]) {
    try { if (existsSync(f)) unlinkSync(f); } catch {}
  }
}

const CONFIG: BmConfig = {
  dbPath: DB_PATH,
  llm: {},
  embedding: {},
  reflection: { enabled: false, turnReflection: false, sessionReflection: false },
  extraction: { level: "none" },
  workingMemory: { maxItems: 10 },
  sharing: { mode: "isolated" },
  retriever: {
    intentAnalyzer: { enabled: false },
    queryExpander: { enabled: false },
    reranker: { enabled: true, provider: "cosine" },
    admissionControl: { enabled: true, minScore: 0.1 },
    hybridRecall: { enabled: false },
    vectorRecall: { enabled: false },
  },
};

describe("C-7 核心召回响应时间基线", () => {
  let engine: ContextEngine;

  beforeAll(() => {
    cleanup();
    engine = new ContextEngine(CONFIG);

    // Direct insert: use the db reference to seed nodes (bypass LLM-dependent processTurn)
    const types = ["TASK", "SKILL", "EVENT"] as const;
    const categories = ["tasks", "skills", "events", "entities", "patterns"] as const;

    // Access private db via (engine as any)
    const db = (engine as any).db;

    const now = Date.now();
    for (let i = 0; i < 200; i++) {
      const type = types[i % 3];
      const category = categories[i % 5];
      const id = `n-${now}-${i}-${Math.random().toString(36).slice(2, 5)}`;
      db.prepare(`INSERT INTO bm_nodes
        (id, type, category, name, description, content, status, validated_count,
         source_sessions, pagerank, importance, access_count, last_accessed,
         temporal_type, source, scope_session, scope_agent, scope_workspace, created_at, updated_at)
        VALUES (?,?,?,?,?,?,'active',1,?,0,0.5,0,0,'static',?,?,?,?,?,?)`)
        .run(id, type, category, `perf-node-${i}`, `Description for node ${i}`,
             `Node ${i} content: This is a performance test seed entry for benchmarking recall latency. It contains keywords like performance, latency, benchmark, recall, retrieval, and ${type} ${category} specific terms.`,
             JSON.stringify(["session-1"]),
             i % 2 === 0 ? "user" : "assistant",
             "session-1", "test-agent", "test-workspace", now, now);
    }
  }, 15000);

  afterAll(() => {
    try { engine.close(); } catch {}
    cleanup();
  });

  it("should measure recall latency (< 500ms baseline v1.0.0)", async () => {
    const ITERATIONS = 50;
    const latencies: number[] = [];

    // Warm-up
    await engine.recall("warmup query", "test-agent", "test-workspace");

    for (let i = 0; i < ITERATIONS; i++) {
      const start = performance.now();
      await engine.recall("performance latency benchmarking", "test-agent", "test-workspace");
      latencies.push(performance.now() - start);
    }

    latencies.sort((a, b) => a - b);
    const avg = latencies.reduce((s, x) => s + x, 0) / latencies.length;
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const min = latencies[0];
    const max = latencies[latencies.length - 1];

    console.log(`\n📊 C-7 核心召回响应时间基线 (${ITERATIONS} 次迭代, 200 节点):`);
    console.log(`   avg: ${avg.toFixed(2)}ms`);
    console.log(`   p50: ${p50.toFixed(2)}ms`);
    console.log(`   p95: ${p95.toFixed(2)}ms`);
    console.log(`   min: ${min.toFixed(2)}ms`);
    console.log(`   max: ${max.toFixed(2)}ms`);

    expect(avg).toBeLessThan(500);
    expect(p95).toBeLessThan(500);
  }, 30000);

  it("should handle multi-term queries efficiently", async () => {
    const queries = [
      "performance benchmarking",
      "latency recall retrieval",
      "performance latency benchmark recall retrieval skills",
    ];

    for (const query of queries) {
      const start = performance.now();
      const result = await engine.recall(query, "test-agent", "test-workspace");
      const elapsed = performance.now() - start;

      console.log(`   query "${query}": ${elapsed.toFixed(2)}ms (${result.nodes.length} nodes)`);
      expect(elapsed).toBeLessThan(500);
    }
  }, 15000);
});
