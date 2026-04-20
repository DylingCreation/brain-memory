/**
 * brain-memory — Reflection extractor
 *
 * Two reflection modes:
 *  - Turn reflection: lightweight, scans extraction results for importance boosts
 *  - Session reflection: heavyweight, LLM full session analysis → graph nodes
 *
 * Safety: reflection content is filtered to prevent prompt injection attacks.
 * Reflection results are stored as graph nodes (not flat text).
 */

import type { BmConfig, ReflectionConfig, ReflectionInsight, ReflectionResult } from "../types.ts";
import type { CompleteFn } from "../engine/llm.ts";
import { TURN_REFLECTION_SYS, SESSION_REFLECTION_SYS } from "./prompts.ts";

// ─── Safety filter for reflection content ──────────────────────
// Prevents prompt injection through reflection results.

const UNSAFE_PATTERNS: RegExp[] = [
  /(?:ignore|disregard|forget|override|bypass)\s+(?:previous|all|prior|system|developer|original)\s+(?:instructions?|rules?|prompts?|directives?|guidelines?|policies?)/i,
  /(?:reveal|print|dump|show|output|display)[\s\S]{0,40}(?:system\s+prompt|developer\s+prompt|hidden\s+instructions?|full\s+prompt|prompt\s+verbatim|secrets?|api\s+keys?|tokens?)/i,
  /(?:you\s+are\s+now|act\s+as|pretend\s+to\s+be|roleplay\s+as|switch\s+to)\s+(?:a\s+)?(?:developer|admin|system|root|god)/i,
  /<\s*\/?\s*(?:system|developer|inherited-rules|derived-focus)\b/i,
  /^(?:system|assistant|user|developer|tool)\s*:/i,
  /(?:disable|turn\s+off|skip|bypass)\s+(?:safety|security|filter|moderation|content\s+policy)/i,
];

export function sanitizeReflectionText(text: string, enabled: boolean): string {
  if (!enabled) return text;

  const trimmed = text.trim()
    .replace(/\*\*/g, "")
    .replace(/^\s*[-*]\s*/, "");

  for (const pattern of UNSAFE_PATTERNS) {
    if (pattern.test(trimmed)) return "";
  }

  // Filter empty/placeholder content
  const normalized = trimmed.toLowerCase().trim();
  if (!normalized || normalized.length < 4) return "";
  if (/^(none|n\/a|no|not\s+applicable|unknown|\(empty\))$/i.test(normalized)) return "";

  return trimmed;
}

// ─── Turn Reflection ──────────────────────────────────────────

interface TurnBoost {
  name: string;
  reason: string;
  importanceDelta: number;
}

export async function reflectOnTurn(
  cfg: ReflectionConfig,
  llm: CompleteFn,
  params: {
    extractedNodes: Array<{ name: string; category: string; type: string; validatedCount: number }>;
    existingNodes: Array<{ name: string; category: string; validatedCount: number }>;
  },
): Promise<TurnBoost[]> {
  if (!cfg.turnReflection || !cfg.enabled) return [];

  const extractedText = params.extractedNodes
    .map(n => `- ${n.name} (${n.category}, ${n.type}, validated:${n.validatedCount})`)
    .join("\n");

  const existingText = params.existingNodes
    .filter(n => n.validatedCount >= 2)
    .map(n => `- ${n.name} (${n.category}, validated:${n.validatedCount})`)
    .join("\n") || "（无）";

  try {
    const raw = await llm(
      TURN_REFLECTION_SYS,
      `<本轮提取节点>\n${extractedText}\n\n<高验证节点>\n${existingText}`,
    );

    const boosts = parseTurnReflection(raw, cfg.maxInsights);
    return boosts.filter(b => b.importanceDelta > 0);
  } catch {
    return [];
  }
}

function parseTurnReflection(raw: string, maxInsights: number): TurnBoost[] {
  try {
    const json = extractJson(raw);
    const p = JSON.parse(json);
    const boosts: TurnBoost[] = (p.boosts ?? []).slice(0, maxInsights);
    return boosts.filter((b: any) => b.name && b.reason);
  } catch {
    return [];
  }
}

// ─── Session Reflection ───────────────────────────────────────

export async function reflectOnSession(
  cfg: ReflectionConfig,
  llm: CompleteFn,
  params: {
    sessionMessages: string;
    extractedNodes: Array<{ name: string; category: string; type: string; content: string }>;
  },
): Promise<ReflectionInsight[]> {
  if (!cfg.sessionReflection || !cfg.enabled) return [];

  const nodesText = params.extractedNodes
    .map(n => `- [${n.type}:${n.category}] ${n.name}: ${n.content.slice(0, 300)}`)
    .join("\n");

  try {
    const raw = await llm(
      SESSION_REFLECTION_SYS,
      `<会话提取节点>\n${nodesText}`,
    );

    return parseSessionReflection(raw, cfg);
  } catch (err) {
    if (process.env.BM_DEBUG) console.log(`  [WARN] session reflection failed: ${err}`);
    return [];
  }
}

function parseSessionReflection(raw: string, cfg: ReflectionConfig): ReflectionInsight[] {
  try {
    const json = extractJson(raw);
    const p = JSON.parse(json);

    const insights: ReflectionInsight[] = [];

    const sections: Array<{ key: string; kind: "user-model" | "agent-model" | "lesson" | "decision" }> = [
      { key: "userModel", kind: "user-model" },
      { key: "agentModel", kind: "agent-model" },
      { key: "lessons", kind: "lesson" },
      { key: "decisions", kind: "decision" },
    ];

    for (const section of sections) {
      const items = p[section.key] ?? [];
      for (const item of items) {
        if (!item.text || typeof item.text !== "string") continue;

        const sanitized = sanitizeReflectionText(item.text, cfg.safetyFilter);
        if (!sanitized) continue;

        const confidence = typeof item.confidence === "number" ? item.confidence : 0.7;
        if (confidence < cfg.minConfidence) continue;

        insights.push({
          text: sanitized,
          kind: section.kind,
          reflectionKind: "invariant", // insights are stable by definition
          confidence,
        });

        if (insights.length >= cfg.maxInsights) break;
      }
      if (insights.length >= cfg.maxInsights) break;
    }

    return insights;
  } catch {
    return [];
  }
}

// ─── Helpers ──────────────────────────────────────────────────

function extractJson(raw: string): string {
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
