/**
 * brain-memory — Embedding Integration Test (Test 1)
 *
 * Verifies that Ollama bge-m3 embedding works end-to-end
 * through the brain-memory embedding engine.
 */

import { describe, it, expect } from "vitest";
import { createEmbedFn, createBatchEmbedFn, getEmbedCacheStats } from "../src/engine/embed";
import type { EmbeddingConfig } from "../src/engine/embed";
import { createRequire } from "node:module";

// ─── Ollama availability check ─────────────────────────────────

function isOllamaAvailable(): boolean {
  try {
    const net = createRequire(import.meta.url)("node:net");
    const sock = net.createConnection({ port: 11434, host: "localhost" });
    sock.destroy();
    return true;
  } catch {
    return false;
  }
}

const OLLAMA_AVAILABLE = isOllamaAvailable();

// ─── Ollama bge-m3 config ─────────────────────────────────────

const OLLAMA_CONFIG: EmbeddingConfig = {
  baseURL: "http://localhost:11434/api",
  model: "bge-m3",
};

// ─── Tests ─────────────────────────────────────────────────────

describe("Embedding Integration — Ollama bge-m3", { skip: !OLLAMA_AVAILABLE }, () => {
  it("createEmbedFn returns a function for Ollama (no API key needed)", () => {
    const embedFn = createEmbedFn(OLLAMA_CONFIG);
    expect(embedFn).not.toBeNull();
    expect(typeof embedFn).toBe("function");
  });

  it("createEmbedFn returns null when no model is specified", () => {
    const embedFn = createEmbedFn({});
    expect(embedFn).toBeNull();
  });

  it("embeds a single text and returns a 1024-dim vector", async () => {
    const embedFn = createEmbedFn(OLLAMA_CONFIG);
    expect(embedFn).not.toBeNull();

    const vec = await embedFn!("hello world");
    expect(Array.isArray(vec)).toBe(true);
    expect(vec.length).toBe(1024);
    // Not all zeros
    expect(vec.some(v => v !== 0)).toBe(true);
  });

  it("embeds Chinese text correctly", async () => {
    const embedFn = createEmbedFn(OLLAMA_CONFIG);
    expect(embedFn).not.toBeNull();

    const vec = await embedFn!("你好世界，这是一个测试");
    expect(vec.length).toBe(1024);
    expect(vec.some(v => v !== 0)).toBe(true);
  });

  it("produces different vectors for different texts", async () => {
    const embedFn = createEmbedFn(OLLAMA_CONFIG);
    expect(embedFn).not.toBeNull();

    const vec1 = await embedFn!("typescript programming");
    const vec2 = await embedFn!("cooking recipes");
    // Cosine similarity should not be 1.0 (different texts)
    const dot = vec1.reduce((s, v, i) => s + v * vec2[i], 0);
    const norm1 = Math.sqrt(vec1.reduce((s, v) => s + v * v, 0));
    const norm2 = Math.sqrt(vec2.reduce((s, v) => s + v * v, 0));
    const cosine = dot / (norm1 * norm2);
    expect(cosine).toBeLessThan(0.95);
  });

  it("caches results (second call should be instant)", async () => {
    const embedFn = createEmbedFn(OLLAMA_CONFIG);
    expect(embedFn).not.toBeNull();

    const vec1 = await embedFn!("cache test text");
    const stats1 = getEmbedCacheStats();

    const vec2 = await embedFn!("cache test text");
    const stats2 = getEmbedCacheStats();

    // Same result
    expect(vec1).toEqual(vec2);
    // Hit count increased
    expect(stats2.hits).toBeGreaterThan(stats1.hits);
  });

  it("createBatchEmbedFn returns a function for Ollama", () => {
    const batchFn = createBatchEmbedFn(OLLAMA_CONFIG);
    expect(batchFn).not.toBeNull();
    expect(typeof batchFn).toBe("function");
  });

  it("batch embeds multiple texts at once", async () => {
    const batchFn = createBatchEmbedFn(OLLAMA_CONFIG);
    expect(batchFn).not.toBeNull();

    const texts = ["hello", "你好", "test", "测试"];
    const vecs = await batchFn!(texts);
    expect(vecs.length).toBe(4);
    vecs.forEach(vec => {
      expect(vec.length).toBe(1024);
      expect(vec.some(v => v !== 0)).toBe(true);
    });
  });

  it("batch handles empty input", async () => {
    const batchFn = createBatchEmbedFn(OLLAMA_CONFIG);
    expect(batchFn).not.toBeNull();

    const vecs = await batchFn!([]);
    expect(vecs).toEqual([]);
  });

  it("batch respects cache for mixed cached/uncached texts", async () => {
    const batchFn = createBatchEmbedFn(OLLAMA_CONFIG);
    expect(batchFn).not.toBeNull();

    // First batch — all uncached
    const vecs1 = await batchFn!(["a", "b", "c"]);
    expect(vecs1.length).toBe(3);

    // Second batch — all cached
    const vecs2 = await batchFn!(["a", "b", "c"]);
    expect(vecs2.length).toBe(3);
    // Results should be identical
    vecs1.forEach((v, i) => expect(v).toEqual(vecs2[i]));
  });
});
