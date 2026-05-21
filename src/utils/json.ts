/**
 * brain-memory — JSON extraction utilities
 *
 * Shared functions for extracting JSON from LLM responses
 * that may contain markdown code fences or thinking tags.
 *
 * Phase 4 (#2 fix):
 *  - Auto-fix common JSON errors (trailing commas, missing quotes, truncated objects)
 *  - Attempt balanced-brace extraction for malformed LLM output
 */

/** Extract the first JSON object from a raw LLM response string */
export function extractJson(raw: string): string {
  let s = raw.trim();
  s = s.replace(/<think>[\s\S]*?<\/think>/gi, '');
  s = s.replace(/<think>[\s\S]*/gi, '');
  s = s.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/i, '');
  s = s.trim();
  if (s.startsWith('{') && s.endsWith('}')) return s;
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first !== -1 && last > first) return s.slice(first, last + 1);
  return s;
}

/**
 * Attempt to fix common JSON parsing errors.
 * Returns a fixed string if repair succeeded, or the original on failure.
 */
export function tryFixJson(s: string): string {
  let fixed = s.trim();

  // 1. Remove trailing commas before } or ]
  fixed = fixed.replace(/,\s*([\]}])/g, '$1');

  // 2. Fix unquoted property keys (e.g. {name: "value"} → {"name": "value"})
  fixed = fixed.replace(/(?<=[{,])\s*([a-zA-Z_$][\w$]*)\s*:/g, '"$1":');

  // 3. Fix single-quoted strings → double-quoted
  fixed = fixed.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"');

  // 4. Fix missing closing } or ]: try to balance braces/brackets
  fixed = balanceBraces(fixed);

  // 5. Remove control characters that break JSON
  // eslint-disable-next-line no-control-regex
  fixed = fixed.replace(/[\x00-\x1f]/g, (m) => {
    if (m === '\n') return '\\n';
    if (m === '\r') return '\\r';
    if (m === '\t') return '\\t';
    return '';
  });

  return fixed;
}

/** Attempt to balance opening and closing braces */
function balanceBraces(s: string): string {
  let depth = 0;
  let inString = false;
  let escape = false;
  let lastValid = 0;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') depth--;
    if (depth === 0) lastValid = i;
  }

  // If still inside an unclosed string, close it
  if (inString) {
    s = s.slice(0, lastValid > 0 ? lastValid + 1 : undefined) + '"';
    // re-check after adding quote
    return balanceBraces(s);
  }

  // If depth > 0, add missing closers
  if (depth > 0) {
    const openStack: string[] = [];
    inString = false;
    escape = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') openStack.push('}');
      else if (ch === '[') openStack.push(']');
      else if (ch === '}' || ch === ']') {
        if (openStack.length > 0 && openStack[openStack.length - 1] === ch) openStack.pop();
      }
    }
    s += openStack.reverse().join('');
  }

  return s;
}

/**
 * Attempt to extract a meaningful JSON-like structure from truncated LLM output.
 * Uses balanced-brace extraction + auto-fix.
 */
export function extractJsonTolerant(raw: string): string | null {
  // Step 1: try standard extract
  const std = extractJson(raw);
  try { JSON.parse(std); return std; } catch { /* proceed */ }

  // Step 2: try auto-fix
  const fixed = tryFixJson(std);
  try { JSON.parse(fixed); return fixed; } catch { /* proceed */ }

  // Step 3: find first { and extract balanced JSON from there
  const start = raw.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') depth--;
    if (depth === 0) {
      const candidate = raw.slice(start, i + 1);
      const fixedCandidate = tryFixJson(candidate);
      try { JSON.parse(fixedCandidate); return fixedCandidate; } catch { /* keep looking */ }
      // Try the raw slice too
      try { JSON.parse(candidate); return candidate; } catch { /* fail */ }
      return null; // Found end but couldn't parse — give up
    }
  }

  // Step 4: No closing brace found — LLM output was truncated
  // Extract from { to end, try to fix
  const truncated = raw.slice(start);
  const fixedTruncated = tryFixJson(truncated);
  try { JSON.parse(fixedTruncated); return fixedTruncated; } catch { /* last resort */ }

  return null;
}

// ─── Small 模式专用 fallback (v1.6.0 B-2) ────────────────

/** Small 模型 JSON 输出常见错误：缺少外层括号、字段名未加引号等 */
export interface SmallJsonDefaults {
  /** 缺失字段的默认值 */
  nodeDefaults: {
    type: string;
    category: string;
    description: string;
    source: string;
  };
}

export const SMALL_DEFAULTS: SmallJsonDefaults = {
  nodeDefaults: {
    type: 'TASK',
    category: 'tasks',
    description: '',
    source: 'user',
  },
};

/**
 * Small 模式 JSON 修复：在通用修复基础上增加 Small 模型特有问题的处理。
 * 1. 如果缺少外层 {，添加
 * 2. 如果缺少外层 }，平衡补全
 * 3. 填充缺失的默认字段
 */
export function smallJsonRepair(raw: string): string | null {
  // Step 1: 通用 tolerant 提取
  const json = extractJsonTolerant(raw);
  if (json) return json;

  // Step 2: Small 专属——尝试用 tryFixJson 直接处理原始文本
  const fixed = tryFixJson(raw.trim());
  try { JSON.parse(fixed); return fixed; } catch { /* proceed */ }

  // Step 3: 如果原始文本完全不像 JSON，尝试包裹
  if (!raw.includes('{')) {
    const wrapped = `{"conclusions": [{"text": ${JSON.stringify(raw.slice(0, 200))}, "type": "implicit", "confidence": 0.5}]}`;
    try { JSON.parse(wrapped); return wrapped; } catch { /* fail */ }
  }

  return null;
}

/**
 * 安全解析 JSON，失败时返回默认值而非抛异常。
 * Small 模型输出不稳定时避免整个流程中断。
 */
export function safeJsonParse<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try { return JSON.parse(json) as T; } catch { return fallback; }
}
