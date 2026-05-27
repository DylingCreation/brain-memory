/**
 * brain-memory — Session compressor
 *
 * Evaluates long session value and compresses low-value parts,
 * keeping key decisions and conclusions.
 *
 * v2.1.0: Migrated from DatabaseSyncInstance to IStorageAdapter.
 */

import type { IStorageAdapter } from '../store/adapter';
import type { CompleteFn } from '../engine/llm';

export interface SessionValue {
  sessionId: string;
  messageCount: number;
  estimatedTokens: number;
  knowledgeNodes: number;
  knowledgeEdges: number;
  valueScore: number; // 0-1, higher = more valuable
  compressRecommendation: 'keep' | 'compress' | 'archive';
}

/**
 * Evaluate the value of a session based on:
 * - Number of knowledge nodes extracted
 * - Number of edges created
 * - Message count (longer ≠ more valuable)
 */
export function evaluateSessionValue(
  storage: IStorageAdapter,
  sessionId: string,
): SessionValue {
  const messages = storage.countMessagesBySession(sessionId);
  const nodes = storage.countNodesBySession(sessionId);
  const edges = storage.countEdgesBySession(sessionId);

  // Value score: knowledge density > message count
  // High value: many nodes/edges per message
  // Low value: many messages, few nodes/edges
  const knowledgeDensity = messages > 0 ? (nodes + edges * 2) / messages : 0;
  const valueScore = Math.min(1, knowledgeDensity / 0.5); // Normalize: 0.5 density = max score

  let compressRecommendation: 'keep' | 'compress' | 'archive';
  // Check stricter conditions first: archive requires both lower score AND more messages
  if (valueScore < 0.1 && messages > 50) {
    compressRecommendation = 'archive';
  } else if (valueScore < 0.2 && messages > 20) {
    compressRecommendation = 'compress';
  } else {
    compressRecommendation = 'keep';
  }

  return {
    sessionId,
    messageCount: messages,
    estimatedTokens: messages * 50,
    knowledgeNodes: nodes,
    knowledgeEdges: edges,
    valueScore,
    compressRecommendation,
  };
}

/**
 * Compress a session's messages by extracting key decisions and conclusions.
 * Uses LLM to summarize the session while preserving critical information.
 */
export async function compressSession(
  storage: IStorageAdapter,
  sessionId: string,
  llm: CompleteFn,
): Promise<{ compressed: boolean; summary: string }> {
  const messages = storage.getMessagesBySession(sessionId);

  if (messages.length < 10) {
    return { compressed: false, summary: 'Session too short to compress' };
  }

  // Format messages for LLM
  const text = messages
    .map(m => `[${(m.role as string).toUpperCase()}] ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
    .join('\n\n');

  // Ask LLM to extract key decisions and conclusions
  const sysPrompt = `你是一个会话压缩引擎。分析以下会话内容，提取关键信息：
1. 关键决策（做出的重要决定）
2. 重要结论（得出的结论或发现）
3. 重要代码或配置变更
4. 待办事项或后续计划

返回简洁的结构化摘要，不超过 500 字。`;

  try {
    const MAX_CHARS = 12000;
    let sessionText: string;
    if (text.length > MAX_CHARS) {
      const headSize = Math.floor(MAX_CHARS * 0.3);
      const tailSize = MAX_CHARS - headSize;
      sessionText = text.slice(0, headSize) +
        `\n\n--- [${text.length - MAX_CHARS} characters omitted for brevity] ---\n\n` +
        text.slice(-tailSize);
    } else {
      sessionText = text;
    }
    const summary = await llm(sysPrompt, sessionText);

    // Store the compressed summary as a special node
    const nodeId = `session-summary-${sessionId}`;
    storage.upsertNode({
      type: 'TASK',
      category: 'tasks',
      name: nodeId,
      description: 'Compressed session summary',
      content: summary,
      source: 'assistant',
      temporalType: 'static',
    }, sessionId);

    // Mark messages as compressed (archived)
    storage.markMessagesArchived(sessionId);

    return { compressed: true, summary };
  } catch (err) {
    return { compressed: false, summary: `Compression failed: ${err}` };
  }
}
