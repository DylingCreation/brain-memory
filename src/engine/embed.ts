/**
 * brain-memory — Embedding engine (fetch-based, no SDK needed)
 *
 * Compatible with any OpenAI-compatible embedding endpoint:
 * OpenAI, Azure, DashScope, MiniMax, Ollama, llama.cpp, vLLM
 *
 * Authors: adoresever (graph-memory), brain-memory contributors
 */

export type EmbedFn = (text: string) => Promise<number[]>;

export interface EmbeddingConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  dimensions?: number;
}

export function createEmbedFn(cfg?: EmbeddingConfig): EmbedFn | null {
  if (!cfg?.apiKey) return null;

  const baseURL = cfg.baseURL || "https://api.openai.com/v1";
  const model = cfg.model || "text-embedding-3-small";
  const dims = cfg.dimensions;

  return async (text: string): Promise<number[]> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const body: Record<string, unknown> = { model, input: text };
      if (dims) body.dimensions = dims;

      const res = await fetch(`${baseURL}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.apiKey}`,
          "User-Agent": "brain-memory/1.0"
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!res.ok) {
        const errorMessage = await res.text();
        throw new Error(`Embedding API error: ${res.status} ${res.statusText} - ${errorMessage}`);
      }
      
      const data = (await res.json()) as any;
      return data.data?.[0]?.embedding ?? [];
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new Error('Embedding request timed out after 30 seconds');
      }
      throw error;
    }
  };
}
