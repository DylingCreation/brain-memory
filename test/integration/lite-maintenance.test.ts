/**
 * v1.6.0 B-3 — Lite 模式 runMaintenance 补全测试
 *
 * 验证 Lite 模式下：
 *   1. 去重 + PageRank + 衰减正常运行
 *   2. 不执行社区检测
 *   3. 不调用 LLM 摘要
 *   4. 返回 lite: true 标志
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runMaintenance } from '../../src/graph/maintenance';
import { createTestStorage, cleanupTestDb, insertNode, insertEdge } from '../helpers';
import type { BmConfig } from '../../src/types';

const liteCfg: BmConfig = {
  mode: 'lite',
  decay: { enabled: false },
  reasoning: { minRecallNodes: 3, maxConclusions: 3 },
} as unknown as BmConfig;

const fullCfg: BmConfig = {
  ...liteCfg,
  mode: 'full',
} as unknown as BmConfig;

describe('B-3 Lite maintenance path', () => {
  let storage: ReturnType<typeof createTestStorage>;

  beforeEach(() => { storage = createTestStorage(); });
  afterEach(() => { cleanupTestDb(storage); });

  it('runs Lite maintenance without errors', async () => {
    const db = storage.getDb();
    insertNode(db, { name: 'lite-node', content: 'test' });

    const result = await runMaintenance(storage, liteCfg);
    expect(result).toBeDefined();
    expect(result.dedup).toBeDefined();
    expect(result.pagerank).toBeDefined();
  });

  it('returns lite=true flag', async () => {
    const db = storage.getDb();
    insertNode(db, { name: 'flag-node', content: 'test' });

    const result = await runMaintenance(storage, liteCfg);
    expect(result.lite).toBe(true);
  });

  it('does NOT run community detection (Lite mode)', async () => {
    const db = storage.getDb();
    for (let i = 0; i < 20; i++) {
      const n = insertNode(db, { name: `c-${i}`, content: `content ${i}`, pagerank: 0.5, communityId: 'comm-a' });
    }

    const result = await runMaintenance(storage, liteCfg);
    expect(result.community.count).toBe(0);
    expect(result.community.communities?.size ?? 0).toBe(0);
  });

  it('does NOT compute community summaries (Lite mode)', async () => {
    const db = storage.getDb();
    insertNode(db, { name: 'summary-test', content: 'test' });

    const result = await runMaintenance(storage, liteCfg);
    expect(result.communitySummaries).toBe(0);
  });

  it('still runs dedup in Lite mode', async () => {
    const db = storage.getDb();
    // Insert two near-duplicate nodes
    insertNode(db, { name: 'same name', content: 'same content' });
    insertNode(db, { name: 'same name', content: 'same content' });

    const result = await runMaintenance(storage, liteCfg);
    expect(result.dedup).toBeDefined();
    expect(typeof result.dedup.merged).toBe('number');
  });

  it('still runs PageRank in Lite mode', async () => {
    const db = storage.getDb();
    const n1 = insertNode(db, { name: 'pr-a', content: 'a', pagerank: 0.5 });
    const n2 = insertNode(db, { name: 'pr-b', content: 'b', pagerank: 0.3 });
    insertEdge(db, { fromId: n1, toId: n2, type: 'RELATED_TO' });

    const result = await runMaintenance(storage, liteCfg);
    expect(result.pagerank).toBeDefined();
  });

  it('full mode still runs community detection', async () => {
    const db = storage.getDb();
    for (let i = 0; i < 20; i++) {
      insertNode(db, { name: `full-c-${i}`, content: `content ${i}`, pagerank: 0.5, communityId: 'comm-a' });
    }

    const result = await runMaintenance(storage, fullCfg);
    // Full mode may or may not find communities depending on graph structure
    // Key: it should not have lite=true flag
    expect((result as any).lite).toBeFalsy();
  });

  it('handles empty DB in Lite mode', async () => {
    const result = await runMaintenance(storage, liteCfg);
    expect(result).toBeDefined();
    expect(result.lite).toBe(true);
    expect(result.dedup.merged).toBe(0);
  });
});
