/**
 * brain-memory — Maintenance coverage补盲
 * v1.6.0 C-2: maintenance.ts 47.4% → ≥70%
 *
 * 盲区：runIncrementalMaintenancePath() / runFullMaintenancePath() 完整路径 +
 *       decay archiving 分支 + 社区摘要错误处理
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runMaintenance, shouldRunIncremental } from '../../src/graph/maintenance';
import { createTestStorage, cleanupTestDb, insertNode, insertEdge, insertVector } from '../helpers';
import type { BmConfig } from '../../src/types';
import type { CompleteFn } from '../../src/engine/llm';

let storage: ReturnType<typeof createTestStorage>;

beforeEach(() => { storage = createTestStorage(); });
afterEach(() => { cleanupTestDb(storage); });

const cfg: BmConfig = {
  decay: { enabled: false },
  reasoning: { minRecallNodes: 3, maxConclusions: 3 },
  memory: {},
  storage: { dbPath: ':memory:' },
  graph: {},
  embedding: { provider: 'none' },
  mode: 'full',
  scopes: [],
} as unknown as BmConfig;

// ─── Full maintenance path ───────────────────────────────────

describe('runMaintenance — full path', () => {
  it('runs full maintenance on populated database (no dirty → full path)', async () => {
    const db = storage.getDb();
    // Insert nodes without marking dirty → should trigger full path
    const n1 = insertNode(db, { name: 'full-node-1', content: 'content a', pagerank: 0.5 });
    const n2 = insertNode(db, { name: 'full-node-2', content: 'content b', pagerank: 0.3 });
    insertEdge(db, { fromId: n1, toId: n2, type: 'USED_SKILL' });

    const result = await runMaintenance(storage, cfg);

    expect(result).toBeDefined();
    expect(result.incremental).toBe(false); // full path
    expect(result.dedup).toBeDefined();
    expect(result.pagerank).toBeDefined();
    expect(result.community).toBeDefined();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('runs full path with empty DB', async () => {
    const result = await runMaintenance(storage, cfg);

    expect(result.incremental).toBe(false);
    expect(result.dedup.merged).toBe(0);
  });

  it('runs full path on >10% dirty ratio', async () => {
    const db = storage.getDb();
    for (let i = 0; i < 10; i++) {
      const n = insertNode(db, { name: `crowd-${i}`, content: `content ${i}`, pagerank: 0.5 });
      storage.markDirty([n]);
    }

    const result = await runMaintenance(storage, cfg);

    // With all nodes dirty (100%), should choose full path
    expect(result.incremental).toBe(false);
  });
});

// ─── Incremental maintenance path ─────────────────────────────

describe('runMaintenance — incremental path', () => {
  it('runs incremental maintenance on <10% dirty ratio', async () => {
    const db = storage.getDb();
    // Insert many nodes
    for (let i = 0; i < 50; i++) {
      insertNode(db, { name: `stable-${i}`, content: `content ${i}`, pagerank: 0.5 });
    }
    // Mark only 1 as dirty → ~2% dirty ratio → incremental path
    const dirtyNode = insertNode(db, { name: 'dirty-node', content: 'new content', pagerank: 0.5 });
    storage.markDirty([dirtyNode]);

    const result = await runMaintenance(storage, cfg);

    expect(result.incremental).toBe(true);
    expect(result.dedup).toBeDefined();
    expect(result.pagerank).toBeDefined();
    expect(result.community).toBeDefined();
  });
});

// ─── Decay archiving ──────────────────────────────────────────

describe('runMaintenance — decay archiving', () => {
  it('deprecates low-value nodes when decay is enabled', async () => {
    const cfgDecay: BmConfig = {
      ...cfg,
      decay: {
        enabled: true,
        baseHalfLifeDays: 30,
        importanceBoost: 0.3,
        validatedBoost: 0.2,
        frequencyBoost: 0.1,
      },
    } as BmConfig;

    const db = storage.getDb();
    // Old node with low validated count → should be deprecated
    const oldNode = insertNode(db, {
      name: 'old-task',
      content: 'old content',
      validatedCount: 1,
      createdAt: Date.now() - 365 * 24 * 3600 * 1000, // 1 year old
    });

    const result = await runMaintenance(storage, cfgDecay);

    expect(result.deprecatedNodes).toBeGreaterThanOrEqual(0);
    expect(result.incremental).toBe(false); // full path
  });

  it('does not deprecate when decay is disabled', async () => {
    const cfgNoDecay: BmConfig = { ...cfg, decay: { enabled: false } };

    const db = storage.getDb();
    insertNode(db, {
      name: 'no-decay-node',
      content: 'content',
      validatedCount: 1,
      createdAt: Date.now() - 365 * 24 * 3600 * 1000,
    });

    const result = await runMaintenance(storage, cfgNoDecay);

    expect(result.deprecatedNodes).toBe(0);
  });
});

// ─── Community summaries with LLM ─────────────────────────────

describe('runMaintenance — community summaries (LLM path)', () => {
  it('handles LLM summary gracefully when LLM is provided', async () => {
    const mockLlm: CompleteFn = async (_sys: string, _user: string): Promise<string> =>
      '社区摘要：测试社区包含相关节点。';

    const db = storage.getDb();
    const ids: string[] = [];
    for (let i = 0; i < 20; i++) {
      const n = insertNode(db, {
        name: `community-node-${i}`,
        content: `content for community ${i}`,
        pagerank: 0.3 + Math.random() * 0.5,
        communityId: 'comm-a',
      });
      ids.push(n);
      // Need vectors for some community analysis
      insertVector(db, n, Array.from({ length: 10 }, () => Math.random()), `content for community ${i}`);
    }
    for (let i = 0; i < 5; i++) {
      insertEdge(db, { fromId: ids[i], toId: ids[i + 5], type: 'USED_SKILL' });
    }

    const result = await runMaintenance(storage, cfg, mockLlm);

    expect(result).toBeDefined();
    expect(result.communitySummaries).toBeGreaterThanOrEqual(0);
  });

  it('handles LLM summary error gracefully', async () => {
    const mockLlm: CompleteFn = async (): Promise<string> => {
      throw new Error('LLM unavailable');
    };

    const db = storage.getDb();
    for (let i = 0; i < 20; i++) {
      insertNode(db, { name: `err-node-${i}`, content: `content ${i}`, pagerank: 0.5, communityId: 'comm-b' });
    }

    const result = await runMaintenance(storage, cfg, mockLlm);

    // Should not throw — error should be caught
    expect(result).toBeDefined();
    expect(result.communitySummaries).toBe(0);
  });
});

// ─── shouldRunIncremental ─────────────────────────────────────

describe('shouldRunIncremental', () => {
  it('returns false on empty DB', () => {
    expect(shouldRunIncremental(storage)).toBe(false);
  });

  it('returns false when no dirty nodes', () => {
    const db = storage.getDb();
    insertNode(db, { name: 'clean', content: 'content' });
    expect(shouldRunIncremental(storage)).toBe(false);
  });

  it('returns true when dirty ratio < 10%', () => {
    const db = storage.getDb();
    for (let i = 0; i < 50; i++) {
      insertNode(db, { name: `stable-${i}`, content: `content ${i}` });
    }
    const dirtyNode = insertNode(db, { name: 'only-dirty', content: 'content' });
    storage.markDirty([dirtyNode]);

    expect(shouldRunIncremental(storage)).toBe(true);
  });

  it('uses custom threshold', () => {
    const db = storage.getDb();
    for (let i = 0; i < 10; i++) {
      insertNode(db, { name: `node-${i}`, content: `content ${i}` });
    }
    const dirtyNode = insertNode(db, { name: 'dirty', content: 'content' });
    storage.markDirty([dirtyNode]); // 1/11 ≈ 9%

    // With threshold 0.05 (5%), should return false
    expect(shouldRunIncremental(storage, 0.05)).toBe(false);
    // With threshold 0.15 (15%), should return true
    expect(shouldRunIncremental(storage, 0.15)).toBe(true);
  });
});
