/**
 * brain-memory — Reasoning coverage补盲
 * v1.6.0 C-2: reasoning/engine.ts 58.44% → ≥70%
 *
 * 盲区：runReasoning() 的 LLM 调用路径、错误处理、上下文构建
 */

import { describe, it, expect } from 'vitest';
import {
  runReasoning,
  shouldRunReasoning,
  buildReasoningContext,
  parseReasoningResult,
} from '../src/reasoning/engine';
import type { BmNode, BmEdge, BmConfig } from '../src/types';

// ─── Helpers ─────────────────────────────────────────────────

const mockCfg: BmConfig = {
  reasoning: { minRecallNodes: 3, maxConclusions: 3 },
  decay: { enabled: false },
  memory: {},
  storage: { dbPath: ':memory:' },
  graph: {},
  embedding: { provider: 'none' },
  mode: 'full',
  scopes: [],
} as unknown as BmConfig;

function makeNodes(count: number): BmNode[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `node-${i}`,
    type: 'TASK' as const,
    category: 'tasks',
    name: `节点${i}`,
    description: `描述${i}`,
    content: `内容${i}`,
    status: 'active' as const,
    validatedCount: 1,
    sourceSessions: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    temporalType: 'dynamic' as const,
  }));
}

function makeEdges(): BmEdge[] {
  return [{
    id: 'edge-0',
    fromId: 'node-0',
    toId: 'node-1',
    type: 'REQUIRES',
    instruction: 'depends on',
    sessionId: 's1',
    createdAt: Date.now(),
  }];
}

const mockRawJson = JSON.stringify({
  conclusions: [
    { text: '节点0 和 节点1 可能存在隐含关联', type: 'implicit', confidence: 0.8 },
    { text: '分析表明存在模式泛化', type: 'pattern', confidence: 0.6 },
  ],
});

// ─── runReasoning tests ──────────────────────────────────────

describe('runReasoning', () => {
  it('returns early when below threshold (no LLM call)', async () => {
    const nodes = makeNodes(2); // below minRecallNodes=3
    const edges = makeEdges();

    let llmCalled = false;
    const llm = async () => { llmCalled = true; return ''; };

    const result = await runReasoning(llm, nodes, edges, '查询', mockCfg);

    expect(result.triggered).toBe(false);
    expect(result.conclusions).toEqual([]);
    expect(llmCalled).toBe(false);
  });

  it('runs full reasoning when above threshold (success path)', async () => {
    const nodes = makeNodes(5); // above minRecallNodes=3
    const edges = makeEdges();

    const llm = async (_sys: string, _user: string) => mockRawJson;

    const result = await runReasoning(llm, nodes, edges, '知识图谱中的隐含关系', mockCfg);

    expect(result.triggered).toBe(true);
    expect(result.rawOutput).toBe(mockRawJson);
    expect(result.conclusions.length).toBeGreaterThanOrEqual(2);
    expect(result.conclusions[0].type).toBe('implicit');
    expect(result.conclusions[0].confidence).toBe(0.8);
    expect(result.conclusions[0].text).toContain('隐含关联');
  });

  it('handles LLM error gracefully (error degradation)', async () => {
    const nodes = makeNodes(5);
    const edges = makeEdges();

    const llm = async () => { throw new Error('API timeout'); };

    const result = await runReasoning(llm, nodes, edges, '查询', mockCfg);

    expect(result.triggered).toBe(false);
    expect(result.conclusions).toEqual([]);
    expect(result.rawOutput).toBe('');
  });

  it('limits conclusions to maxConclusions config', async () => {
    const cfgWithLimit: BmConfig = {
      ...mockCfg,
      reasoning: { minRecallNodes: 3, maxConclusions: 1 },
    } as BmConfig;

    const nodes = makeNodes(5);
    const edges = makeEdges();

    const manyConclusions = JSON.stringify({
      conclusions: [
        { text: '结论A', type: 'path', confidence: 0.9 },
        { text: '结论B', type: 'implicit', confidence: 0.8 },
        { text: '结论C', type: 'pattern', confidence: 0.7 },
      ],
    });

    const llm = async () => manyConclusions;
    const result = await runReasoning(llm, nodes, edges, '查询', cfgWithLimit);

    expect(result.conclusions.length).toBe(1);
  });

  it('builds correct context with nodes and edges', async () => {
    const nodes = makeNodes(3);
    const edges = makeEdges();

    let capturedUserPrompt = '';
    const llm = async (_sys: string, user: string) => {
      capturedUserPrompt = user;
      return mockRawJson;
    };

    await runReasoning(llm, nodes, edges, '测试查询', mockCfg);

    expect(capturedUserPrompt).toContain('测试查询');
    expect(capturedUserPrompt).toContain('节点0');
    expect(capturedUserPrompt).toContain('节点1');
    expect(capturedUserPrompt).toContain('REQUIRES');
  });

  it('handles empty edges gracefully', async () => {
    const nodes = makeNodes(3);
    const emptyEdges: BmEdge[] = [];

    const llm = async () => mockRawJson;
    const result = await runReasoning(llm, nodes, emptyEdges, '查询', mockCfg);

    expect(result.triggered).toBe(true);
  });

  it('respects minRecallNodes = 0 (always trigger)', async () => {
    const cfgZero: BmConfig = {
      ...mockCfg,
      reasoning: { minRecallNodes: 0, maxConclusions: 2 },
    } as BmConfig;

    const nodes = makeNodes(1);
    const edges = makeEdges();

    const llm = async () => mockRawJson;
    const result = await runReasoning(llm, nodes, edges, '查询', cfgZero);

    expect(result.triggered).toBe(true);
  });
});

// ─── Already covered, regression guard ───────────────────────

describe('shouldRunReasoning (regression)', () => {
  it('returns false when node count below minimum', () => {
    expect(shouldRunReasoning(makeNodes(2), mockCfg)).toBe(false);
  });

  it('returns true when node count above minimum', () => {
    expect(shouldRunReasoning(makeNodes(5), mockCfg)).toBe(true);
  });
});

describe('parseReasoningResult (regression)', () => {
  it('parses valid JSON with conclusions', () => {
    const result = parseReasoningResult(mockRawJson, 5);
    expect(result.length).toBe(2);
  });

  it('returns empty on parse failure', () => {
    const result = parseReasoningResult('not json', 5);
    expect(result).toEqual([]);
  });

  it('strips think tags', () => {
    const raw = '<think>思考中...</think>\n' + mockRawJson;
    const result = parseReasoningResult(raw, 5);
    expect(result.length).toBe(2);
  });
});

describe('buildReasoningContext (regression)', () => {
  it('returns null for empty conclusions', () => {
    expect(buildReasoningContext([])).toBeNull();
  });

  it('builds XML for valid conclusions', () => {
    const ctx = buildReasoningContext([
      { text: '推断结论', type: 'path', confidence: 0.9 },
    ]);
    expect(ctx).toContain('<reasoning>');
    expect(ctx).toContain('路径推导');
    expect(ctx).toContain('推断结论');
  });
});
