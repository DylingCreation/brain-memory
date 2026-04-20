/**
 * brain-memory — Admission control for memory writes
 *
 * Lightweight gatekeeper: evaluates candidate memories before writing.
 * Rejects low-utility, low-confidence, or duplicate content.
 * Simplified from memory-lancedb-pro's admission-control.ts.
 */

import type { DatabaseSyncInstance } from "@photostructure/sqlite";
import type { MemoryCategory } from "../types.ts";
import { searchNodes, vectorSearchWithScore } from "../store/store.ts";
import type { EmbedFn } from "../engine/embed.ts";

export interface AdmissionConfig {
  enabled: boolean;
  /** Minimum similarity to existing memory to reject as duplicate */
  duplicateThreshold: number;
  /** Minimum content length to accept */
  minContentLength: number;
  /** Type-based priors (higher = more likely to accept) */
  typePriors: Record<string, number>;
}

export const DEFAULT_ADMISSION_CONFIG: AdmissionConfig = {
  enabled: false,
  duplicateThreshold: 0.85,
  minContentLength: 10,
  typePriors: {
    profile: 0.95,
    preferences: 0.9,
    entities: 0.75,
    events: 0.45,
    tasks: 0.8,
    skills: 0.85,
    cases: 0.8,
    patterns: 0.85,
  },
};

export interface AdmissionResult {
  decision: "accept" | "reject";
  reason: string;
  similarityToExisting: number;
}

export class AdmissionController {
  constructor(
    private db: DatabaseSyncInstance,
    private config: AdmissionConfig,
    private embedFn?: EmbedFn | null,
  ) {}

  /** Evaluate whether a candidate memory should be admitted */
  evaluate(params: {
    name: string;
    content: string;
    category: MemoryCategory;
    vector?: number[];
  }): AdmissionResult {
    const { name, content, category, vector } = params;
    const { duplicateThreshold, minContentLength, typePriors, enabled } = this.config;

    if (!enabled) {
      return { decision: "accept", reason: "admission control disabled", similarityToExisting: 0 };
    }

    // Check minimum content length
    if (content.length < minContentLength) {
      return { decision: "reject", reason: `content too short (${content.length} < ${minContentLength})`, similarityToExisting: 0 };
    }

    // Check type prior
    const typePrior = typePriors[category] ?? 0.5;
    if (typePrior < 0.3) {
      return { decision: "reject", reason: `low type prior for ${category} (${typePrior})`, similarityToExisting: 0 };
    }

    // Check for duplicates via name match
    const existing = searchNodes(this.db, name, 5);
    if (existing.length > 0) {
      // Check content overlap via simple token overlap
      const candidateTokens = tokenizeText(content);
      let maxOverlap = 0;
      for (const ex of existing) {
        const existingTokens = tokenizeText(ex.content);
        const overlap = jaccardSimilarity(candidateTokens, existingTokens);
        if (overlap > maxOverlap) maxOverlap = overlap;
      }
      if (maxOverlap > duplicateThreshold) {
        return { decision: "reject", reason: `high content overlap (${maxOverlap.toFixed(2)} > ${duplicateThreshold})`, similarityToExisting: maxOverlap };
      }
    }

    // Check for duplicates via vector similarity
    if (vector && this.embedFn) {
      try {
        const scored = vectorSearchWithScore(this.db, vector, 5);
        if (scored.length > 0 && scored[0].score > duplicateThreshold) {
          return { decision: "reject", reason: `high vector similarity (${scored[0].score.toFixed(2)} > ${duplicateThreshold})`, similarityToExisting: scored[0].score };
        }
      } catch { /* vector search unavailable */ }
    }

    return { decision: "accept", reason: `passed (typePrior=${typePrior.toFixed(2)})`, similarityToExisting: 0 };
  }
}

function tokenizeText(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter(t => t.length > 1)
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const item of a) { if (b.has(item)) intersection++; }
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}
