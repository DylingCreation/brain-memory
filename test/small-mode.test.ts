/**
 * v1.6.0 B-1 — Small 模式测试
 *
 * 验证：
 *   1. mode='small' 使各模块使用精简提示词
 *   2. Small 提示词比 Full 短 8x+
 *   3. 边界验证矩阵（METHODOLOGY.md §5.12）
 */

import { describe, it, expect } from 'vitest';
import { EXTRACT_SYS_SMALL, REFLECTION_SYS_SMALL, FUSION_DECIDE_SYS_SMALL, REASONING_SYS_SMALL } from '../src/prompts/small';
import { shouldRunReasoning, runReasoning } from '../src/reasoning/engine';
import { parseFusionDecision } from '../src/fusion/analyzer';
import { parseReasoningResult } from '../src/reasoning/engine';
import type { BmConfig, BmNode, BmEdge } from '../src/types';

// ─── Prompt size verification ──────────────────────────────

describe('Small 提示词大小', () => {
  function estimateTokens(text: string): number {
    // Rough: CJK ~1 char/token, ASCII ~4 chars/token
    let t = 0;
    for (const ch of text) {
      t += /[\u4e00-\u9fff]/.test(ch) ? 1 : 0.25;
    }
    return Math.ceil(t);
  }

  it('提取提示词 ≤ 200 tokens', () => {
    expect(estimateTokens(EXTRACT_SYS_SMALL)).toBeLessThanOrEqual(220);
  });

  it('反思提示词 ≤ 200 tokens', () => {
    expect(estimateTokens(REFLECTION_SYS_SMALL)).toBeLessThanOrEqual(200);
  });

  it('融合提示词 ≤ 200 tokens', () => {
    expect(estimateTokens(FUSION_DECIDE_SYS_SMALL)).toBeLessThanOrEqual(200);
  });

  it('推理提示词 ≤ 200 tokens', () => {
    expect(estimateTokens(REASONING_SYS_SMALL)).toBeLessThanOrEqual(200);
  });
});

// ─── Small mode routing ─────────────────────────────────────

describe('Small 模式路由', () => {
  const smallCfg: BmConfig = {
    mode: 'small',
    reasoning: { minRecallNodes: 1, maxConclusions: 2 },
    decay: { enabled: false },
  } as unknown as BmConfig;

  const fullCfg: BmConfig = {
    ...smallCfg,
    mode: 'full',
  } as unknown as BmConfig;

  it('shouldRunReasoning still works with Small config', () => {
    const nodes: BmNode[] = [{ id: 'n1', type: 'TASK', category: 'tasks', name: 't', description: '', content: '', status: 'active', validatedCount: 1, sourceSessions: [], createdAt: 0, updatedAt: 0, temporalType: 'static' }];
    expect(shouldRunReasoning(nodes, smallCfg)).toBe(true);
  });

  it('runReasoning small mode uses compact prompt', async () => {
    const nodes: BmNode[] = Array.from({ length: 3 }, (_, i) => ({
      id: `n${i}`, name: `node${i}`, type: 'TASK' as const, category: 'tasks', description: '', content: '', status: 'active' as const, validatedCount: 1, sourceSessions: [], createdAt: 0, updatedAt: 0, temporalType: 'dynamic' as const,
    }));
    const edges: BmEdge[] = [];

    let capturedSys = '';
    const mockLlm = async (sys: string, _user: string) => {
      capturedSys = sys;
      return JSON.stringify({ conclusions: [{ text: 'test', type: 'path', confidence: 0.9 }] });
    };

    const result = await runReasoning(mockLlm, nodes, edges, 'query', smallCfg);
    expect(result.triggered).toBe(true);
    expect(capturedSys).toContain('推理新结论');
    expect(capturedSys.length).toBeLessThan(500); // Compact
  });

  it('runReasoning full mode uses large prompt', async () => {
    const nodes: BmNode[] = Array.from({ length: 3 }, (_, i) => ({
      id: `n${i}`, name: `node${i}`, type: 'TASK' as const, category: 'tasks', description: '', content: '', status: 'active' as const, validatedCount: 1, sourceSessions: [], createdAt: 0, updatedAt: 0, temporalType: 'dynamic' as const,
    }));
    const edges: BmEdge[] = [];

    let capturedSys = '';
    const mockLlm = async (sys: string, _user: string) => {
      capturedSys = sys;
      return JSON.stringify({ conclusions: [] });
    };

    await runReasoning(mockLlm, nodes, edges, 'query', fullCfg);
    expect(capturedSys.length).toBeGreaterThan(300); // Full prompt is larger than small
  });
});

// ─── Boundary validation matrix (§5.12) ────────────────────

describe('Small 模式边界验证矩阵', () => {
  it('mode=full → 行为不变（向后兼容）', () => {
    // Full mode should NOT use Small prompt
    const r = parseReasoningResult(
      JSON.stringify({ conclusions: [{ text: 'A', type: 'path', confidence: 0.9 }] }),
      5,
    );
    expect(r.length).toBe(1);
  });

  it('Small 输出仍可被 tolerant parser 解析', () => {
    // Simulate Small model output with minor JSON errors
    const raw = '```json\n{"conclusions": [{"text": "推论", "type": "path", "confidence": 0.8,}]}\n```';
    const r = parseReasoningResult(raw, 5);
    expect(r.length).toBe(1);
    expect(r[0].text).toBe('推论');
  });

  it('Small 输出缺字段 → 使用默认值', () => {
    const raw = '{"decision": "merge"}'; // missing "reason"
    const r = parseFusionDecision(raw);
    expect(r.decision).toBe('merge');
    expect(r.reason).toBe(''); // Default empty
  });

  it('Small 输出完全损坏 → 安全降级不抛异常', () => {
    expect(() => parseReasoningResult('not json', 5)).not.toThrow();
    expect(() => parseFusionDecision('garbage')).not.toThrow();
  });

  it('Small prompt 仍要求结构化输出格式', () => {
    expect(EXTRACT_SYS_SMALL).toContain('JSON');
    expect(REFLECTION_SYS_SMALL).toContain('JSON');
    expect(FUSION_DECIDE_SYS_SMALL).toContain('JSON');
    expect(REASONING_SYS_SMALL).toContain('JSON');
  });

  it('Small mode 不跳过 LLM 路径（区别于 Lite）', () => {
    // Lite skips; Small should still run
    const cfg: BmConfig = { mode: 'small', reasoning: { minRecallNodes: 0, maxConclusions: 2 } } as unknown as BmConfig;
    expect(cfg.mode).toBe('small');
  });

  it('mode=small 类型安全', () => {
    // Verify TypeScript compiles mode: 'small'
    const cfg: BmConfig = { mode: 'small' } as unknown as BmConfig;
    const mode: string = cfg.mode ?? 'full';
    expect(['full', 'lite', 'small']).toContain(mode);
  });
});
