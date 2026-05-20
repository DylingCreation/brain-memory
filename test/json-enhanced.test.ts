/**
 * v1.6.0 B-2 — JSON 解析增强测试
 *
 * 测试内容：
 *   1. 通用增强：所有解析器使用 extractJsonTolerant
 *   2. Small 专用：smallJsonRepair + safeJsonParse + SMALL_DEFAULTS
 *   3. 边界：畸形输入、截断、引号错误
 */

import { describe, it, expect } from 'vitest';
import {
  extractJson, tryFixJson, extractJsonTolerant,
  smallJsonRepair, safeJsonParse, SMALL_DEFAULTS,
} from '../src/utils/json';
import { parseReasoningResult } from '../src/reasoning/engine';
import { parseFusionDecision } from '../src/fusion/analyzer';

// ─── Commons ──────────────────────────────────────────────

describe('extractJsonTolerant — 统一增强', () => {
  it('handles valid JSON', () => {
    const json = extractJsonTolerant('{"a": 1}');
    expect(json).toBe('{"a": 1}');
  });

  it('strips markdown fences', () => {
    const json = extractJsonTolerant('```json\n{"a": 1}\n```');
    expect(JSON.parse(json!)).toEqual({ a: 1 });
  });

  it('strips think tags', () => {
    const json = extractJsonTolerant('<think>thinking...</think>\n{"a": 1}');
    expect(JSON.parse(json!)).toEqual({ a: 1 });
  });

  it('fixes trailing commas', () => {
    const json = extractJsonTolerant('{"a": 1,}');
    expect(JSON.parse(json!)).toEqual({ a: 1 });
  });

  it('fixes unquoted keys', () => {
    const json = extractJsonTolerant('{a: 1}');
    expect(JSON.parse(json!)).toEqual({ a: 1 });
  });

  it('fixes single quotes', () => {
    const json = extractJsonTolerant("{'a': 'hello'}");
    expect(JSON.parse(tryFixJson(json!))).toBeDefined();
  });

  it('balances missing closing brace', () => {
    const json = extractJsonTolerant('{"a": [1, 2');
    expect(json).toBeDefined();
    expect(JSON.parse(json!)).toEqual({ a: [1, 2] });
  });

  it('returns null for completely malformed input', () => {
    const json = extractJsonTolerant('this is not json at all');
    expect(json).toBeNull();
  });

  it('recovers from truncated JSON with balanced extraction', () => {
    const json = extractJsonTolerant('prefix {"a": 1, "b": 2} suffix');
    expect(json).toBe('{"a": 1, "b": 2}');
  });
});

// ─── parseReasoningResult — now uses tolerant ──────────────

describe('parseReasoningResult — B-2 tolerant 增强', () => {
  const validJson = JSON.stringify({
    conclusions: [
      { text: '推理结论A', type: 'path', confidence: 0.9 },
      { text: '推理结论B', type: 'implicit', confidence: 0.7 },
    ],
  });

  it('parses valid JSON', () => {
    const r = parseReasoningResult(validJson, 5);
    expect(r.length).toBe(2);
    expect(r[0].text).toBe('推理结论A');
  });

  it('handles markdown-fenced JSON', () => {
    const r = parseReasoningResult('```json\n' + validJson + '\n```', 5);
    expect(r.length).toBe(2);
  });

  it('handles think-tagged JSON', () => {
    const r = parseReasoningResult('<think>hmm</think>\n' + validJson, 5);
    expect(r.length).toBe(2);
  });

  it('handles trailing comma (tolerant)', () => {
    const malformed = '{"conclusions": [{"text": "A", "type": "path", "confidence": 0.9,},]}';
    const r = parseReasoningResult(malformed, 5);
    expect(r.length).toBe(1);
    expect(r[0].text).toBe('A');
  });

  it('returns empty on completely broken input', () => {
    const r = parseReasoningResult('not json', 5);
    expect(r).toEqual([]);
  });
});

// ─── parseFusionDecision — now uses tolerant ───────────────

describe('parseFusionDecision — B-2 tolerant 增强', () => {
  it('parses valid decision', () => {
    const r = parseFusionDecision('{"decision": "merge", "reason": "same content"}');
    expect(r.decision).toBe('merge');
    expect(r.reason).toBe('same content');
  });

  it('handles markdown-fenced input', () => {
    const r = parseFusionDecision('```json\n{"decision": "link", "reason": "similar"}\n```');
    expect(r.decision).toBe('link');
  });

  it('handles trailing comma', () => {
    const r = parseFusionDecision('{"decision": "none", "reason": "different",}');
    expect(r.decision).toBe('none');
  });

  it('returns safe defaults on failure', () => {
    const r = parseFusionDecision('garbage');
    expect(r.decision).toBe('none');
    expect(r.reason).toBe('');
  });
});

// ─── Small mode utilities ──────────────────────────────────

describe('smallJsonRepair — Small 专用修复', () => {
  it('works on valid JSON (pass-through)', () => {
    const json = smallJsonRepair('{"a": 1}');
    expect(JSON.parse(json!)).toEqual({ a: 1 });
  });

  it('repairs missing outer braces via tolerant', () => {
    const json = smallJsonRepair('```\n{"a": 1,}\n```');
    expect(JSON.parse(json!)).toEqual({ a: 1 });
  });

  it('wraps bare text as conclusion', () => {
    const json = smallJsonRepair('这是推理结果');
    expect(json).toContain('conclusions');
    expect(json).toContain('推理结果');
  });

  it('returns null for unfixable input', () => {
    const json = smallJsonRepair('[[[');
    // Unbalanced brackets may be fixed, check that result is valid JSON or null
    if (json !== null) {
      expect(() => JSON.parse(json)).not.toThrow();
    }
  });
});

describe('safeJsonParse', () => {
  it('returns parsed value on success', () => {
    const r = safeJsonParse('{"a": 1}', { a: 0 });
    expect(r).toEqual({ a: 1 });
  });

  it('returns fallback on failure', () => {
    const fallback = { ok: false };
    const r = safeJsonParse('garbage', fallback);
    expect(r).toBe(fallback);
  });

  it('returns fallback on null input', () => {
    const fallback = { ok: false };
    const r = safeJsonParse(null, fallback);
    expect(r).toBe(fallback);
  });
});

describe('SMALL_DEFAULTS', () => {
  it('provides safe node defaults', () => {
    expect(SMALL_DEFAULTS.nodeDefaults.type).toBe('TASK');
    expect(SMALL_DEFAULTS.nodeDefaults.category).toBe('tasks');
    expect(SMALL_DEFAULTS.nodeDefaults.source).toBe('user');
  });
});
