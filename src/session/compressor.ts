/**
 * brain-memory — Session compressor
 *
 * Evaluates long session value and compresses low-value parts,
 * keeping key decisions and conclusions.
 */

import type { DatabaseSyncInstance } from "@photostructure/sqlite";
import type { BmConfig } from "../types";
import type { CompleteFn } from "../engine/llm";
import { smartTruncate } from "../utils/truncate";

export interface SessionValue {
  sessionId: string;
  messageCount: number;
  estimatedTokens: number;
  knowledgeNodes: number;
  knowledgeEdges: number;
  valueScore: number; // 0-1, higher = more valuable
  compressRecommendation: "keep" | "compress" | "archive";
}

/**
 * Evaluate the value of a session based on:
 * - Number of knowledge nodes extracted
 * - Number of edges created
 * - Message count (longer ≠ more valuable)
 */
export function evaluateSessionValue(
  db: DatabaseSyncInstance,
  sessionId: string,
): SessionValue {
  const msgCount = db.prepare(
    "SELECT COUNT(*) as c FROM bm_messages WHERE session_id=?"
  ).get(sessionId) as any;

  const nodeCount = db.prepare(
    "SELECT COUNT(*) as c FROM bm_nodes WHERE source_sessions LIKE ?"
  ).get(`%${sessionId}%`) as any;

  const edgeCount = db.prepare(
    "SELECT COUNT(*) as c FROM bm_edges WHERE session_id=?"
  ).get(sessionId) as any;

  const messages = msgCount?.c ?? 0;
  const nodes = nodeCount?.c ?? 0;
  const edges = edgeCount?.c ?? 0;

  // Value score: knowledge density > message count
  // High value: many nodes/edges per message
  // Low value: many messages, few nodes/edges
  const knowledgeDensity = messages > 0 ? (nodes + edges * 2) / messages : 0;
  const valueScore = Math.min(1, knowledgeDensity / 0.5); // Normalize: 0.5 density = max score

  let compressRecommendation: "keep" | "compress" | "archive";
  if (valueScore < 0.2 && messages > 20) {
    compressRecommendation = "compress";
  } else if (valueScore < 0.1 && messages > 50) {
    compressRecommendation = "archive";
  } else {
    compressRecommendation = "keep";
  }

  return {
    sessionId,
    messageCount: messages,
    estimatedTokens: messages * 50, // Rough estimate — kept for backward compat (no message content available here)
    knowledgeNodes: nodes,
    knowledgeEdges: edges,
    valueScore,
    compressRecommendation,
  };
}

/**
 * Compress a session's messages by extracting key decisions and conclusions.
 * Uses LLM to summarize the session while preserving critical information.
 * All database queries use parameterized binding (no SQL injection risk).
 */
export async function compressSession(
  db: DatabaseSyncInstance,
  sessionId: string,
  llm: CompleteFn,
  cfg: BmConfig,
): Promise<{ compressed: boolean; summary: string }> {
  // Get all messages for the session
  const messages = db.prepare(
    "SELECT role, content FROM bm_messages WHERE session_id=? ORDER BY turn_index"
  ).all(sessionId) as any[];

  if (messages.length < 10) {
    return { compressed: false, summary: "Session too short to compress" };
  }

  // Format messages for LLM
  const text = messages
    .map(m => `[${m.role.toUpperCase()}] ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`)
    .join("\n\n");

  // Ask LLM to extract key decisions and conclusions
  const sysPrompt = `你是一个会话压缩引擎。分析以下会话内容，提取关键信息：
1. 关键决策（做出的重要决定）
2. 重要结论（得出的结论或发现）
3. 重要代码或配置变更
4. 待办事项或后续计划

返回简洁的结构化摘要，不超过 500 字。`;

  try {
    // #16 fix: keep head + tail instead of just head (decisions are often at the end)
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
    // All values are bound via parameterized query (? placeholders) — safe from SQL injection
    const now = Date.now();
    const nodeId = `session-summary-${sessionId}`;
    db.prepare(`
      INSERT INTO bm_nodes (id, type, category, name, description, content, status, validated_count, source_sessions, created_at, updated_at, temporal_type)
      VALUES (?, 'TASK', 'tasks', ?, ?, ?, 'active', 1, ?, ?, ?, 'static')
    `).run(
      nodeId,
      nodeId,
      `Compressed session summary`,
      summary,
      JSON.stringify([sessionId]),
      now,
      now,
    );

    // Mark messages as compressed
    db.prepare("UPDATE bm_messages SET extracted=2 WHERE session_id=? AND extracted=1").run(sessionId);

    return { compressed: true, summary };
  } catch (err) {
    return { compressed: false, summary: `Compression failed: ${err}` };
  }
}
