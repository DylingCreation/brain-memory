/**
 * brain-memory — Embedding engine (fetch-based, no SDK needed)
 *
 * Compatible with any OpenAI-compatible embedding endpoint:
 * OpenAI, Azure, DashScope, MiniMax, Ollama, llama.cpp, vLLM
 *
 * Phase 2:
 *  - #11 In-memory LRU cache for embeddings
 *  - #12 Batch embedding API support (text[] → number[][])
 *
 * Authors: adoresever (graph-memory), brain-memory contributors
 */

export type EmbedFn = (text: string) => Promise<number[]>;
export type BatchEmbedFn = (texts: string[]) => Promise<number[][]>;

export interface EmbeddingConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  dimensions?: number;
}

// ─── LRU Cache with TTL (#11 + #9) ──────────────────────────

const EMBED_CACHE_SIZE = 500;
const EMBED_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
  vector: number[];
  timestamp: number;
}

const embedCache = new Map<string, CacheEntry>();

// ─── Cache Hit/Miss Tracking ────────────────────────────────

let cacheHits = 0;
let cacheMisses = 0;

function cacheGet(text: string): number[] | null {
  const key = cacheKey(text);
  const entry = embedCache.get(key);
  if (entry !== undefined) {
    // #9 fix: check TTL — stale entries are treated as misses
    if (Date.now() - entry.timestamp > EMBED_CACHE_TTL_MS) {
      embedCache.delete(key);
      cacheMisses++;
      return null;
    }
    // Move to end (most recently used)
    embedCache.delete(key);
    embedCache.set(key, entry);
    cacheHits++;
    return entry.vector;
  }
  cacheMisses++;
  return null;
}

function cacheKey(text: string): string {
  // Simple hash for cache key — avoids storing full text as key
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

/**
 * Remove expired entries during cacheGet (lazy eviction).
 * Also purges if cache exceeds size limit.
 */
function purgeExpired(): void {
  const now = Date.now();
  const expired: string[] = [];
  for (const [key, entry] of embedCache) {
    if (now - entry.timestamp > EMBED_CACHE_TTL_MS) {
      expired.push(key);
    }
  }
  for (const key of expired) embedCache.delete(key);
}

export interface EmbedCacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
}

export function getEmbedCacheStats(): EmbedCacheStats {
  const total = cacheHits + cacheMisses;
  return {
    size: embedCache.size,
    hits: cacheHits,
    misses: cacheMisses,
    hitRate: total > 0 ? cacheHits / total : 0,
  };
}

/** Reset cache stats counters (useful for testing or per-session tracking). */
export function resetEmbedCacheStats(): void {
  cacheHits = 0;
  cacheMisses = 0;
}

/** Clear the entire embedding cache (useful for testing isolation). */
export function clearEmbedCache(): void {
  embedCache.clear();
  cacheHits = 0;
  cacheMisses = 0;
}

function cacheSet(text: string, vec: number[]): void {
  const key = cacheKey(text);
  if (embedCache.has(key)) embedCache.delete(key);
  // #9 fix: store with timestamp for TTL expiration
  embedCache.set(key, { vector: vec, timestamp: Date.now() });
  // Evict oldest entries if over limit
  while (embedCache.size > EMBED_CACHE_SIZE) {
    const oldest = embedCache.keys().next().value;
    if (oldest !== undefined) embedCache.delete(oldest);
    else break;
  }
}

// ─── Embedding creation ───────────────────────────────────────

// Detect Ollama by port or URL pattern
function isOllama(cfg?: EmbeddingConfig): boolean {
  if (!cfg?.baseURL) return false;
  return cfg.baseURL.includes("11434") || cfg.baseURL.includes("localhost:11434");
}

export function createEmbedFn(cfg?: EmbeddingConfig): EmbedFn | null {
  // Ollama doesn't require an API key; other providers do
  if (!cfg?.apiKey && !isOllama(cfg)) return null;
  if (!cfg?.model) return null;

  const baseURL = cfg.baseURL || "https://api.openai.com/v1";
  const model = cfg.model;
  const dims = cfg.dimensions;
  const ollama = isOllama(cfg);

  // Ollama uses /api/embed endpoint; OpenAI-compatible uses /embeddings
  let embedURL: string;
  if (ollama) {
    // Ollama baseURL is typically "http://localhost:11434/api"
    // The embed endpoint is at "/api/embed" (relative to host)
    embedURL = baseURL.replace(/\/api$/, "/api/embed");
  } else {
    embedURL = `${baseURL}/embeddings`;
  }

  return async (text: string): Promise<number[]> => {
    // #11 cache hit — return immediately
    const cached = cacheGet(text);
    if (cached) return cached;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const body: Record<string, unknown> = { model, input: text };
      if (dims && !ollama) body.dimensions = dims;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": "brain-memory/1.0"
      };
      if (!ollama) {
        headers["Authorization"] = `Bearer ${cfg!.apiKey}`;
      }

      const res = await fetch(embedURL, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!res.ok) {
        const errorMessage = await res.text();
        throw new Error(`Embedding API error: ${res.status} ${res.statusText} - ${errorMessage}`);
      }

      const data = (await res.json()) as any;
      // Ollama response: { "embeddings": [[...]] }
      // OpenAI response: { "data": [{ "embedding": [...] }] }
      const vec = ollama
        ? (data.embeddings?.[0] ?? [])
        : (data.data?.[0]?.embedding ?? []);
      
      // #11 cache the result
      if (vec.length > 0) cacheSet(text, vec);
      return vec;
    } finally {
      clearTimeout(timeoutId);
    }
  };
}

// ─── Batch embedding (#12) ────────────────────────────────────

export function createBatchEmbedFn(cfg?: EmbeddingConfig): BatchEmbedFn | null {
  // Ollama doesn't require an API key; other providers do
  if (!cfg?.apiKey && !isOllama(cfg)) return null;
  if (!cfg?.model) return null;

  const baseURL = cfg.baseURL || "https://api.openai.com/v1";
  const model = cfg.model;
  const dims = cfg.dimensions;
  const ollama = isOllama(cfg);

  // Ollama uses /api/embed endpoint; OpenAI-compatible uses /embeddings
  let embedURL: string;
  if (ollama) {
    embedURL = baseURL.replace(/\/api$/, "/api/embed");
  } else {
    embedURL = `${baseURL}/embeddings`;
  }

  return async (texts: string[]): Promise<number[][]> => {
    if (texts.length === 0) return [];
    
    // #11 cache check — separate cached from uncached
    const results: (number[] | null)[] = texts.map(t => cacheGet(t));
    const uncachedIndices: number[] = [];
    const uncachedTexts: string[] = [];
    
    for (let i = 0; i < texts.length; i++) {
      if (results[i] === null) {
        uncachedIndices.push(i);
        uncachedTexts.push(texts[i]);
      }
    }

    // All cached — return immediately
    if (uncachedTexts.length === 0) {
      return results as number[][];
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const body: Record<string, unknown> = { model, input: uncachedTexts };
      if (dims && !ollama) body.dimensions = dims;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": "brain-memory/1.0"
      };
      if (!ollama) {
        headers["Authorization"] = `Bearer ${cfg!.apiKey}`;
      }

      const res = await fetch(embedURL, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!res.ok) {
        const errorMessage = await res.text();
        throw new Error(`Embedding API error: ${res.status} ${res.statusText} - ${errorMessage}`);
      }

      const data = (await res.json()) as any;
      // Ollama response: { "embeddings": [[...], [...], ...] }
      // OpenAI response: { "data": [{ "embedding": [...] }, ...] }
      const embeddings: number[][] = ollama
        ? (data.embeddings ?? []).map((v: number[]) => v ?? [])
        : (data.data ?? []).map((item: any) => item.embedding ?? []);

      // #11 cache each result and fill in the uncached slots
      let embIdx = 0;
      for (const i of uncachedIndices) {
        const vec = embeddings[embIdx++] ?? [];
        results[i] = vec;
        if (vec.length > 0) cacheSet(texts[i], vec);
      }

      return results as number[][];
    } finally {
      clearTimeout(timeoutId);
    }
  };
}
