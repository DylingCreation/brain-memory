/**
 * brain-memory — Working Memory Manager
 *
 * Tracks the current state of conversation focus without extra LLM calls.
 * Derived entirely from extraction results and user messages.
 *
 * Updated after each turn's extraction, injected at the top of context during assemble.
 * Cleared when session ends.
 */

import type { WorkingMemoryConfig, WorkingMemoryState } from "../types.ts";

// ─── Default State ────────────────────────────────────────────

export function createWorkingMemory(): WorkingMemoryState {
  return {
    currentTasks: [],
    recentDecisions: [],
    constraints: [],
    attention: "",
    updatedAt: Date.now(),
  };
}

// ─── Update Working Memory from Extraction Results ────────────

/**
 * Update working memory state based on turn extraction results.
 * No LLM needed — derived entirely from structured extraction output.
 */
export function updateWorkingMemory(
  state: WorkingMemoryState,
  cfg: WorkingMemoryConfig,
  params: {
    extractedNodes: Array<{ name: string; category: string; type: string; content: string }>;
    userMessage: string;
  },
): WorkingMemoryState {
  if (!cfg.enabled) return state;

  const now = Date.now();

  // 1. Update current tasks from extracted TASK nodes
  const taskNodes = params.extractedNodes.filter(n => n.type === "TASK");
  if (taskNodes.length > 0) {
    const newTasks = taskNodes.map(n => n.name).reverse(); // newest last in extraction, put first
    state.currentTasks = [...newTasks, ...state.currentTasks]
      .filter((v, i, a) => a.indexOf(v) === i) // dedup, keep newest first
      .slice(0, cfg.maxTasks);
  }

  // 2. Update recent decisions from newly extracted nodes
  // All extracted nodes represent recent decisions/learnings
  const allNames = params.extractedNodes.map(n => n.name);
  const newDecisions = allNames.filter(n => !state.recentDecisions.includes(n));
  state.recentDecisions = [...newDecisions, ...state.recentDecisions]
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, cfg.maxDecisions);

  // 3. Update constraints from preference/profile nodes
  const prefNodes = params.extractedNodes.filter(n =>
    n.category === "preferences" || n.category === "profile"
  );
  if (prefNodes.length > 0) {
    const newConstraints = prefNodes.map(n => `${n.name}: ${n.description || n.content.slice(0, 100)}`);
    state.constraints = [...newConstraints, ...state.constraints]
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, cfg.maxConstraints);
  }

  // 4. Update attention from user message (lightweight cleanup)
  if (params.userMessage) {
    state.attention = cleanUserMessage(params.userMessage, 200);
  }

  state.updatedAt = now;
  return state;
}

// ─── Build Working Memory Context for Assemble ────────────────

export function buildWorkingMemoryContext(state: WorkingMemoryState): string | null {
  const parts: string[] = [];

  if (state.currentTasks.length > 0) {
    parts.push(`## Current Tasks\n${state.currentTasks.map(t => `- ${t}`).join("\n")}`);
  }

  if (state.recentDecisions.length > 0) {
    parts.push(`## Recent Decisions\n${state.recentDecisions.map(d => `- ${d}`).join("\n")}`);
  }

  if (state.constraints.length > 0) {
    parts.push(`## Constraints & Preferences\n${state.constraints.map(c => `- ${c}`).join("\n")}`);
  }

  if (state.attention) {
    parts.push(`## Current Focus\n${state.attention}`);
  }

  if (parts.length === 0) return null;

  return `<working_memory>\n${parts.join("\n\n")}\n</working_memory>`;
}

// ─── Helpers ──────────────────────────────────────────────────

/** Clean user message for working memory attention tracking */
function cleanUserMessage(raw: string, maxLen: number): string {
  let text = raw.trim();

  // Remove common metadata patterns
  text = text.replace(/^\/\w+\s+/, "").trim();
  text = text.replace(/^\[[\w\s\-:]+\]\s*/, "").trim();

  // Remove code blocks (keep the intent, not the code)
  const fenceStart = text.indexOf("```");
  if (fenceStart >= 0) {
    text = text.slice(0, fenceStart).trim();
  }

  // Truncate
  if (text.length > maxLen) {
    text = text.slice(0, maxLen - 3) + "...";
  }

  return text;
}
