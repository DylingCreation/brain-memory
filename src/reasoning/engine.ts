/**
 * brain-memory — Reasoning Engine
 *
 * Derives new conclusions from recalled knowledge subgraphs.
 * Only triggers when recall returns enough nodes (minRecallNodes threshold).
 *
 * Four reasoning types:
 *  1. path: A→B→C indirect relationships
 *  2. implicit: shared neighbors suggest hidden connections
 *  3. pattern: multiple nodes show similar patterns → generalize
 *  4. contradiction: conflicting content → alert user
 */

import type { BmConfig, BmNode, BmEdge } from '../types';
import type { CompleteFn } from '../engine/llm';
import { REASONING_SYS } from './prompts';
import { REASONING_SYS_SMALL } from '../prompts/small';
import { escapeXml } from '../utils/xml';
import { extractJsonTolerant } from '../utils/json';

export interface ReasoningConclusion {
  text: string;
  type: 'path' | 'implicit' | 'pattern' | 'contradiction';
  confidence: number;
}

export interface ReasoningResult {
  conclusions: ReasoningConclusion[];
  triggered: boolean;
  rawOutput: string;
}

// ─── Threshold Check ──────────────────────────────────────────

/** 判断是否应执行推理（节点数达到阈值）。 */
export function shouldRunReasoning(
  nodes: BmNode[],
  cfg: BmConfig,
): boolean {
  const minNodes = cfg.reasoning?.minRecallNodes ?? 3;
  return nodes.length >= minNodes;
}

// ─── Reasoning ────────────────────────────────────────────────

export async function runReasoning(
  llm: CompleteFn,
  nodes: BmNode[],
  edges: BmEdge[],
  query: string,
  cfg: BmConfig,
): Promise<ReasoningResult> {
  if (!shouldRunReasoning(nodes, cfg)) {
    return { conclusions: [], triggered: false, rawOutput: '' };
  }

  const maxConclusions = cfg.reasoning?.maxConclusions ?? 3;

  // Build node id-to-name lookup for readable edge display
  const idToName = new Map<string, string>();
  for (const n of nodes) idToName.set(n.id, n.name);

  // Build context for LLM
  const nodesText = nodes
    .map(n => `[${n.type}:${n.category}] ${n.name}: ${n.description} | ${n.content.slice(0, 200)}`)
    .join('\n');

  const edgesText = edges.length > 0
    ? edges.map(e => {
      const fromName = idToName.get(e.fromId) ?? e.fromId;
      const toName = idToName.get(e.toId) ?? e.toId;
      return `${fromName} --[${e.type}]--> ${toName}: ${e.instruction}`;
    }).join('\n')
    : '（无边关系）';

  const userPrompt = `查询: ${query}\n\n知识节点:\n${nodesText}\n\n边关系:\n${edgesText}`;

  try {
    const raw = await llm(cfg.mode === 'small' ? REASONING_SYS_SMALL : REASONING_SYS, userPrompt);
    const conclusions = parseReasoningResult(raw, maxConclusions);

    return { conclusions, triggered: true, rawOutput: raw };
  } catch {
    return { conclusions: [], triggered: false, rawOutput: '' };
  }
}

// ─── Build Reasoning Context XML ──────────────────────────────

export function buildReasoningContext(conclusions: ReasoningConclusion[]): string | null {
  if (conclusions.length === 0) return null;

  const typeLabels: Record<string, string> = {
    path: '路径推导',
    implicit: '隐含关系',
    pattern: '模式泛化',
    contradiction: '矛盾检测',
  };

  const lines = conclusions.map(c =>
    `    <conclusion type="${typeLabels[c.type] || c.type}" confidence="${c.confidence.toFixed(2)}">${escapeXml(c.text)}</conclusion>`
  );

  return `<reasoning>\n${lines.join('\n')}\n</reasoning>`;
}

// ─── Helpers ──────────────────────────────────────────────────

export function parseReasoningResult(raw: string, maxConclusions: number): ReasoningConclusion[] {
  // B-2: 使用 tolerant JSON 解析（引号修正 + 尾随逗号 + 补括号）
  const json = extractJsonTolerant(raw);
  if (!json) return [];

  try {
    const p = JSON.parse(json);
    const conclusions: ReasoningConclusion[] = (p.conclusions ?? [])
      .filter((c: Record<string, unknown>) => c.text && typeof c.text === 'string')
      .map((c: Record<string, unknown>) => ({
        text: (c.text as string).trim(),
        type: (['path', 'implicit', 'pattern', 'contradiction'].includes(c.type as string) ? c.type as string : 'implicit') as ReasoningConclusion['type'],
        confidence: typeof c.confidence === 'number' ? Math.min(1, Math.max(0, c.confidence)) : 0.7,
      }))
      .slice(0, maxConclusions);

    return conclusions;
  } catch {
    return [];
  }
}

// escapeXml imported from ../utils/xml.ts
