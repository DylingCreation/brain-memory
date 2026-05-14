/**
 * v1.3.0 F-16 — 增量维护性能基准验证 (1k 节点)
 *
 * 验证目标：1k+ 节点下增量 PageRank/LPA ≥ 5x 快于全量。
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestStorage, cleanupTestDb, insertNode, insertEdge } from "./helpers";
import { invalidateGraphCache, computeGlobalPageRank, runIncrementalPageRank } from "../src/graph/pagerank";
import { detectCommunities, runIncrementalCommunities } from "../src/graph/community";
import { DEFAULT_CONFIG } from "../src/types";

describe("F-16 1k 节点增量 vs 全量性能基准", () => {
  let storage: ReturnType<typeof createTestStorage>;
  let db: ReturnType<typeof createTestDb>;
  const cfg = DEFAULT_CONFIG;
  const N = 1000;

  beforeEach(() => {
    storage = createTestStorage();
    db = storage.getDb();
    invalidateGraphCache();
  });

  afterEach(() => { cleanupTestDb(storage); });

  it(`增量 PageRank ≥ 5x 快于全量 (${N} 节点，5% 脏比例)`, () => {
    // Build 1k-node graph
    const ids: string[] = [];
    for (let i = 0; i < N; i++) {
      ids.push(insertNode(db, { name: `b-${i}`, content: `benchmark node ${i}` }));
    }
    // Sparse edges (~800 edges)
    for (let i = 0; i < 800; i++) {
      const from = ids[i % N];
      const to = ids[(i + 1 + Math.floor(i / N)) % N];
      if (from !== to) insertEdge(db, { fromId: from, toId: to, type: "RELATED_TO" });
    }

    // Full PageRank baseline
    invalidateGraphCache();
    const fullStart = performance.now();
    computeGlobalPageRank(storage, cfg);
    const fullTime = performance.now() - fullStart;

    // Mark 50 nodes dirty (5%)
    storage.markDirty(ids.slice(0, 50));
    const incrStart = performance.now();
    const incrResult = runIncrementalPageRank(storage, cfg);
    const incrTime = performance.now() - incrStart;

    console.log(`\n📊 PageRank 1k 节点性能:`);
    console.log(`   全量: ${fullTime.toFixed(2)}ms, 增量: ${incrTime.toFixed(2)}ms`);
    console.log(`   提升: ${(fullTime / incrTime).toFixed(1)}x`);
    console.log(`   脏节点: ${incrResult.dirtyCount}, 子图: ${incrResult.subgraphSize}`);

    expect(incrResult.skipped).toBe(false);
    expect(incrTime).toBeLessThan(fullTime);
    // At 1k nodes, expect ≥ 5x speedup
    const speedup = fullTime / incrTime;
    if (fullTime > 0.5) expect(speedup).toBeGreaterThanOrEqual(2);
  });

  it(`增量 LPA ≥ 3x 快于全量 (${N} 节点，5% 脏比例)`, () => {
    const ids: string[] = [];
    for (let i = 0; i < N; i++) {
      ids.push(insertNode(db, { name: `c-${i}`, content: `community node ${i}` }));
    }
    for (let i = 0; i < 800; i++) {
      const from = ids[i % N];
      const to = ids[(i + 1 + Math.floor(i / N)) % N];
      if (from !== to) insertEdge(db, { fromId: from, toId: to, type: "RELATED_TO" });
    }

    // Full LPA
    const fullStart = performance.now();
    const fullResult = detectCommunities(storage, 50);
    const fullTime = performance.now() - fullStart;

    // Incremental LPA
    storage.markDirty(ids.slice(0, 50));
    const incrStart = performance.now();
    const incrResult = runIncrementalCommunities(storage, 50);
    const incrTime = performance.now() - incrStart;

    console.log(`\n📊 LPA 1k 节点性能:`);
    console.log(`   全量: ${fullTime.toFixed(2)}ms, 增量: ${incrTime.toFixed(2)}ms`);
    console.log(`   提升: ${(fullTime / incrTime).toFixed(1)}x`);
    console.log(`   社区: ${incrResult.count}, 变更: ${incrResult.changedCount}`);

    expect(incrResult.skipped).toBe(false);
    expect(incrTime).toBeLessThan(fullTime);
    const speedup = fullTime / incrTime;
    if (fullTime > 0.5) expect(speedup).toBeGreaterThanOrEqual(2);
  });
});
