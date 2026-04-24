/**
 * brain-memory - Working Memory Manager
 *
 * Tracks the current state of conversation focus without extra LLM calls.
 * Derived entirely from extraction results and user messages.
 *
 * Updated after each turn's extraction, injected at the top of context during assemble.
 * Cleared when session ends.
 */

import type { WorkingMemoryConfig, WorkingMemoryState } from "../types";

// ─── Default State ────────────────────────────────────────────

export function createWorkingMemory(): WorkingMemoryState {
  return {
    currentTasks: [],
    recentDecisions: [],
    constraints: [],
    attention: "",
    recentCommitments: [],
    updatedAt: Date.now(),
  };
}

// ─── Update Working Memory from Extraction Results ────────────

/**
 * Update working memory state based on turn extraction results.
 * No LLM needed - derived entirely from structured extraction output.
 */
export function updateWorkingMemory(
  state: WorkingMemoryState,
  cfg: WorkingMemoryConfig,
  params: {
    extractedNodes: Array<{ name: string; category: string; type: string; content: string }>;  
    userMessage: string;
    assistantMessage?: string;
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
  // #20 fix: only TASK and SKILL nodes represent decisions/learnings (not events, preferences, etc.)
  const decisionNodes = params.extractedNodes.filter(n =>
    n.type === "TASK" || n.type === "SKILL"
  );
  const allNames = decisionNodes.map(n => n.name);
  const newDecisions = allNames.filter(n => !state.recentDecisions.includes(n));
  state.recentDecisions = [...newDecisions, ...state.recentDecisions]
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, cfg.maxDecisions);

  // 3. Update constraints from preference/profile nodes
  const prefNodes = params.extractedNodes.filter(n =>
    n.category === "preferences" || n.category === "profile"
  );
  if (prefNodes.length > 0) {
    const newConstraints = prefNodes.map(n => `${n.name}: ${n.content.slice(0, 100)}`);
    state.constraints = [...newConstraints, ...state.constraints]
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, cfg.maxConstraints);
  }

  // 4. Update recent commitments from assistant messages
  if (params.assistantMessage) {
    // Extract potential commitments from assistant message
    const commitments = extractCommitments(params.assistantMessage);
    if (commitments.length > 0) {
      const newCommitments = commitments.filter(c => !state.recentCommitments.includes(c));
      state.recentCommitments = [...newCommitments, ...state.recentCommitments]
        .filter((v, i, a) => a.indexOf(v) === i)
        .slice(0, cfg.maxDecisions); // reuse maxDecisions for max commitments
    }
  }

  // 5. Update attention from user message (lightweight cleanup)
  // #17 fix: increase from 200 to 500 and truncate at sentence boundary
  if (params.userMessage) {
    state.attention = cleanUserMessage(params.userMessage, 500);
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

  if (state.recentCommitments.length > 0) {
    parts.push(`## Recent Commitments\n${state.recentCommitments.map(c => `- ${c}`).join("\n")}`);
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

  // Remove code blocks but KEEP text after them (the intent might be after the code)
  const fenceRegex = /```[\s\S]*?```/g;
  text = text.replace(fenceRegex, '[CODE]').trim();

  // #17 fix: truncate at sentence boundary instead of hard cut
  if (text.length > maxLen) {
    let cutPoint = maxLen;
    // Try sentence boundary
    for (let i = cutPoint; i > maxLen * 0.5; i--) {
      if (/[.!?。！？]/.test(text[i]) && (i + 1 >= text.length || /\s/.test(text[i + 1]))) {
        cutPoint = i + 1;
        break;
      }
    }
    text = text.slice(0, cutPoint).trim() + '...';
  }

  return text;
}

/**
 * Extract potential commitments from assistant messages
 * Looks for keywords that indicate promises, recommendations, or future actions
 */
function extractCommitments(text: string): string[] {
  const lowerText = text.toLowerCase();
  const commitments: string[] = [];
  
  // Keywords that often precede commitments
  const commitmentKeywords = [
    "i will", "i'll", "i would", "should", "recommend", "suggest", "propose", 
    "plan to", "going to", "intend to", "promise", "guarantee", "assure",
    "let me", "let's", "help you", "assist with", "take care of",
    "look into", "investigate", "check", "find", "search"
  ];
  
  for (const keyword of commitmentKeywords) {
    if (lowerText.includes(keyword)) {
      // Extract the sentence containing the keyword
      const sentences = text.split(/[.!?]+/);
      for (const sentence of sentences) {
        if (sentence.toLowerCase().includes(keyword) && sentence.trim().length > 0) {
          const cleaned = sentence.trim();
          if (!commitments.includes(cleaned)) {
            commitments.push(cleaned);
          }
        }
      }
    }
  }
  
  return commitments;
}
