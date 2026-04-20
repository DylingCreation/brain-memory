/**
 * brain-memory — JSON extraction utilities
 *
 * Shared functions for extracting JSON from LLM responses
 * that may contain markdown code fences or thinking tags.
 */

/** Extract the first JSON object from a raw LLM response string */
export function extractJson(raw: string): string {
  let s = raw.trim();
  s = s.replace(/<think>[\s\S]*?<\/think>/gi, "");
  s = s.replace(/<think>[\s\S]*/gi, "");
  s = s.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?\s*```\s*$/i, "");
  s = s.trim();
  if (s.startsWith("{") && s.endsWith("}")) return s;
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last > first) return s.slice(first, last + 1);
  return s;
}
