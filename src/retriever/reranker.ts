/**
 * brain-memory — Cross-encoder reranker
 *
 * Re-ranks candidate memories using a reranker API (Jina, SiliconFlow, Voyage, etc.).
 * Falls back to cosine similarity if API is unavailable.
 */

import type { BmConfig, BmNode } from "../types.ts";
import type { EmbedFn } from "../engine/embed.ts";
import { cosineSimilarity } from "../utils/similarity.ts";

export type RerankProvider = "jina" | "siliconflow" | "voyage" | "dashscope" | "tei" | "pinecone";

export interface RerankerConfig {
  enabled: boolean;
  apiKey?: string;
  model?: string;
  endpoint?: string;
  provider?: RerankProvider;
  topK?: number;
  timeoutMs?: number;
}

export interface RerankResult {
  nodes: BmNode[];
  rerankScores: Map<string, number>;
  apiUsed: boolean;
}

export class Reranker {
  private config: RerankerConfig;

  constructor(cfg: BmConfig) {
    const raw = (cfg as any).rerank || {};
    this.config = {
      enabled: !!raw.enabled,
      apiKey: raw.apiKey,
      model: raw.model || "jina-reranker-v3",
      endpoint: raw.endpoint || "https://api.jina.ai/v1/rerank",
      provider: raw.provider || "jina",
      topK: raw.topK || 20,
      timeoutMs: raw.timeoutMs || 5000,
    };
  }

  /** Re-rank nodes using cross-encoder API or cosine fallback */
  async rerank(query: string, queryVec: number[], nodes: BmNode[], embedFn?: EmbedFn | null): Promise<RerankResult> {
    if (nodes.length <= 1) {
      return { nodes, rerankScores: new Map(), apiUsed: false };
    }

    // Try cross-encoder API first
    if (this.config.enabled && this.config.apiKey) {
      try {
        const reranked = await this.rerankWithApi(query, nodes);
        if (reranked) return reranked;
      } catch {
        // Fall through to cosine
      }
    }

    // Fallback: cosine similarity
    return this.rerankWithCosine(queryVec, nodes, embedFn);
  }

  private async rerankWithApi(query: string, nodes: BmNode[]): Promise<RerankResult | null> {
    const documents = nodes.map(n => `${n.name}: ${n.description}\n${n.content.slice(0, 500)}`);

    const provider = this.config.provider || "jina";
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    // Auth header varies by provider
    if (provider === "pinecone") {
      headers["Api-Key"] = this.config.apiKey!;
    } else {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }

    // Build request body
    const body: Record<string, unknown> = {
      model: this.config.model,
      query,
      documents,
      top_n: Math.min(this.config.topK!, nodes.length),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 5000);

    try {
      const response = await fetch(this.config.endpoint!, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) return null;

      const data = await response.json() as any;
      const results = data.results ?? data.data ?? [];
      if (!Array.isArray(results) || results.length === 0) return null;

      // Parse scores
      const scores = new Map<string, number>();
      for (const item of results) {
        const idx = item.index ?? item.idx;
        const score = item.relevance_score ?? item.score;
        if (typeof idx === "number" && typeof score === "number" && idx < nodes.length) {
          scores.set(nodes[idx].id, score);
        }
      }

      // Blend: 60% rerank + 40% original
      const reranked = [...nodes].sort((a, b) => {
        const sA = (scores.get(a.id) ?? 0) * 0.6 + 0.4; // original score normalized
        const sB = (scores.get(b.id) ?? 0) * 0.6 + 0.4;
        return sB - sA;
      });

      return { nodes: reranked, rerankScores: scores, apiUsed: true };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async rerankWithCosine(queryVec: number[], nodes: BmNode[], embedFn?: EmbedFn | null): Promise<RerankResult> {
    const scores = new Map<string, number>();

    if (embedFn && queryVec.length > 0) {
      for (const node of nodes) {
        try {
          const nodeVec = await embedFn(`${node.name}: ${node.description}`);
          const sim = cosineSimilarity(queryVec, nodeVec);
          scores.set(node.id, sim);
        } catch { /* skip */ }
      }
    }

    // Sort by cosine score
    const reranked = [...nodes].sort((a, b) => {
      const sA = scores.get(a.id) ?? 0;
      const sB = scores.get(b.id) ?? 0;
      return sB - sA;
    });

    return { nodes: reranked, rerankScores: scores, apiUsed: false };
  }
}

// cosineSimilarity imported from ../utils/similarity.ts
