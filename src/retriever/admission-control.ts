/**
 * brain-memory — Admission control for memory writes
 *
 * Lightweight gatekeeper: evaluates candidate memories before writing.
 * Rejects low-utility, low-confidence, or duplicate content.
 *
 * v1.1.0 F-2: Uses IStorageAdapter.
 */

import type { MemoryCategory } from "../types";
import type { IStorageAdapter } from "../store/adapter";
import type { EmbedFn } from "../engine/embed";
import { tokenize, jaccardSimilarity } from "../utils/text";

/** 准入控制配置：控制低质量或重复内容的过滤阈值。 */
export interface AdmissionConfig {
  enabled: boolean;
  duplicateThreshold: number;
  minContentLength: number;
  typePriors: Record<string, number>;
}

/** 默认准入控制配置：禁用状态，阈值 0.85。 */
export const DEFAULT_ADMISSION_CONFIG: AdmissionConfig = {
  enabled: false,
  duplicateThreshold: 0.85,
  minContentLength: 10,
  typePriors: {
    profile: 0.95, preferences: 0.9, entities: 0.75, events: 0.45,
    tasks: 0.8, skills: 0.85, cases: 0.8, patterns: 0.85,
  },
};

/** 准入评估结果：包含决策（accept/reject）、原因和相似度。 */
export interface AdmissionResult {
  decision: "accept" | "reject";
  reason: string;
  similarityToExisting: number;
}

/** 准入控制器：评估候选记忆是否应写入，拒绝低质量或重复内容。 */
export class AdmissionController {
  constructor(
    private storage: IStorageAdapter,
    private config: AdmissionConfig,
    private embedFn?: EmbedFn | null,
  ) {}

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

    if (content.length < minContentLength) {
      return { decision: "reject", reason: `content too short (${content.length} < ${minContentLength})`, similarityToExisting: 0 };
    }

    const typePrior = typePriors[category] ?? 0.5;
    if (typePrior < 0.3) {
      return { decision: "reject", reason: `low type prior for ${category} (${typePrior})`, similarityToExisting: 0 };
    }

    // Check for duplicates via name match
    const existing = this.storage.searchNodes(name, 5);
    if (existing.length > 0) {
      const candidateTokens = tokenizeText(content);
      let maxOverlap = 0;
      for (const ex of existing) {
        if (ex && ex.content !== undefined) {
          const existingTokens = tokenizeText(ex.content);
          const overlap = jaccardSimilarity(candidateTokens, existingTokens);
          if (overlap > maxOverlap) maxOverlap = overlap;
        }
      }
      if (maxOverlap > duplicateThreshold) {
        return { decision: "reject", reason: `high content overlap (${maxOverlap.toFixed(2)} > ${duplicateThreshold})`, similarityToExisting: maxOverlap };
      }
    }

    // Check for duplicates via vector similarity
    if (vector && this.embedFn) {
      try {
        const scored = this.storage.vectorSearchWithScore(vector, 5);
        if (scored.length > 0 && scored[0].score > duplicateThreshold) {
          return { decision: "reject", reason: `high vector similarity (${scored[0].score.toFixed(2)} > ${duplicateThreshold})`, similarityToExisting: scored[0].score };
        }
      } catch { /* vector search unavailable */ }
    }

    return { decision: "accept", reason: `passed (typePrior=${typePrior.toFixed(2)})`, similarityToExisting: 0 };
  }
}

function tokenizeText(text: string): Set<string> { return tokenize(text); }
