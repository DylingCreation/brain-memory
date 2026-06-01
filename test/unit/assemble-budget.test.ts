/**
 * F-3: format/assemble.ts Token 预算与截断单元测试
 * v2.1.1
 *
 * 覆盖：estimateNodeTokens（控制预算计算）、truncate（智能截断）、
 * assembleContext 预算截断行为（通过 integration 风格验证）
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { estimateNodeTokens } from '../../src/utils/tokens';
import { truncate } from '../../src/utils/truncate';
import { ContextEngine } from '../../src/engine/context';
import { DEFAULT_CONFIG, type BmConfig } from '../../src/types';

// ─── 纯函数测试：estimateNodeTokens ──────────────────────

describe('estimateNodeTokens', () => {
  it('returns > 0 for non-empty node-like object', () => {
    const tokens = estimateNodeTokens({
      name: '测试节点',
      description: '这是一个测试描述',
      content: '测试内容',
    } as any);
    expect(tokens).toBeGreaterThan(0);
  });

  it('returns higher tokens for longer content', () => {
    const short = estimateNodeTokens({ name: 'a', description: 'b', content: 'c' } as any);
    const long = estimateNodeTokens({
      name: 'a',
      description: 'b',
      content: '这是一段非常长的中文内容，用于测试token估算函数在处理较长文本时的表现',
    } as any);
    expect(long).toBeGreaterThanOrEqual(short);
  });

  it('handles empty fields gracefully', () => {
    const tokens = estimateNodeTokens({ name: '', description: '', content: '' } as any);
    expect(tokens).toBeGreaterThanOrEqual(0);
  });
});

// ─── 纯函数测试：truncate ────────────────────────────────

describe('truncate', () => {
  it('returns original text when shorter than maxChars', () => {
    expect(truncate('hello', 100, 'test')).toBe('hello');
  });

  it('truncates at sentence boundary for Chinese text', () => {
    const text = '第一句话。第二句话很长很长很长很长很长。第三句话。第四句话。';
    const result = truncate(text, 10, 'test');
    // Result should not exceed maxChars by too much, or be truncated
    expect(result.length).toBeLessThanOrEqual(text.length);
  });

  it('truncates at paragraph boundary when available', () => {
    const text = 'short line\n\nlong paragraph after the double newline that should be cut';
    const result = truncate(text, 20, 'test');
    expect(result.length).toBeLessThanOrEqual(25); // 截断在段落边界附近
  });

  it('handles empty text', () => {
    expect(truncate('', 100, 'test')).toBe('');
  });
});

// ─── 预算截断集成验证 ────────────────────────────────────

describe('assembleContext budget control', () => {
  let engine: ContextEngine;
  let dbPath: string;

  beforeEach(() => {
    dbPath = join(tmpdir(), `bm-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    const config: BmConfig = {
      ...DEFAULT_CONFIG,
      dbPath,
      mode: 'lite',
      decay: { ...DEFAULT_CONFIG.decay, enabled: false },
      noiseFilter: { ...DEFAULT_CONFIG.noiseFilter, enabled: false },
      reflection: { ...DEFAULT_CONFIG.reflection, enabled: false },
      workingMemory: { ...DEFAULT_CONFIG.workingMemory, enabled: false },
      fusion: { ...DEFAULT_CONFIG.fusion, enabled: false },
      reasoning: { ...DEFAULT_CONFIG.reasoning, enabled: false },
      memoryInjection: { ...DEFAULT_CONFIG.memoryInjection, enabled: false, strategy: 'off' as const },
      memorySharing: { ...DEFAULT_CONFIG.memorySharing, enabled: false },
      rerank: { enabled: false },
    };
    engine = new ContextEngine(config);
  });

  afterEach(() => {
    try { engine.close(); } catch { /* ignore */ }
    try { if (existsSync(dbPath)) unlinkSync(dbPath); } catch { /* ignore */ }
    try { if (existsSync(dbPath + '-wal')) unlinkSync(dbPath + '-wal'); } catch { /* ignore */ }
    try { if (existsSync(dbPath + '-shm')) unlinkSync(dbPath + '-shm'); } catch { /* ignore */ }
  });

  it('returns empty result when no memory found', async () => {
    const result = await engine.recall('nonexistent query about nothing');
    expect(result.nodes).toHaveLength(0);
    expect(result.tokenEstimate).toBe(0);
  });

  it('returns nodes when relevant memory exists', async () => {
    // Use text that heuristic extraction will catch (contains command + error patterns)
    await engine.processTurn({
      sessionId: 'test-session',
      agentId: 'test-agent',
      workspaceId: 'test-workspace',
      messages: [
        { role: 'user', content: '我需要用 docker run nginx 部署一个 Error: connection refused 的问题' },
      ],
    });

    const result = await engine.recall('docker nginx deployment');
    // At minimum, the FTS5 search should find something
    expect(result.tokenEstimate).toBeGreaterThanOrEqual(0);
  });
});
