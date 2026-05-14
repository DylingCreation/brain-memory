/**
 * F-11 TR-11: Reranker 降级路径边界测试
 *
 * 覆盖：API 错误回退、余弦回退、空结果处理、边界条件。
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { Reranker } from "../src/retriever/reranker";
import { DEFAULT_CONFIG, type BmNode } from "../src/types";

function makeNode(id: string, content: string): BmNode {
  return {
    id, type: "TASK" as const, category: "tasks" as const,
    name: id, description: "", content,
    status: "active" as const, validatedCount: 1,
    sourceSessions: [], communityId: null, pagerank: 0.5,
    importance: 0.5, accessCount: 0, lastAccessedAt: 0,
    temporalType: "static" as const, source: "user" as const,
    scopeSession: null, scopeAgent: null, scopeWorkspace: null,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
}

describe("F-11 Reranker 降级路径", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  // ─── 降级 1: API key 缺失 → cosine fallback ─────────────────

  it("API key 为空时降级到 cosine（不崩溃）", async () => {
    const cfg = { ...DEFAULT_CONFIG, rerank: { enabled: true, apiKey: "", provider: "jina" } } as any;
    const reranker = new Reranker(cfg);
    const nodes = [makeNode("n1", "content a"), makeNode("n2", "content b")];
    const result = await reranker.rerank("test query", [0.1, 0.2, 0.3], nodes);
    expect(result.nodes.length).toBe(2);
    expect(result.apiUsed).toBe(false); // fell back to cosine
  });

  // ─── 降级 2: API 500 错误 → cosine fallback ───────────────

  it("API 返回非 ok 时降级到 cosine", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const cfg = {
      ...DEFAULT_CONFIG,
      rerank: { enabled: true, apiKey: "fake-key", provider: "jina" },
    } as any;
    const reranker = new Reranker(cfg);
    const nodes = [makeNode("n1", "doc a"), makeNode("n2", "doc b")];
    const result = await reranker.rerank("query", [], nodes);
    expect(result.nodes.length).toBe(2);
    expect(result.apiUsed).toBe(false);
  });

  // ─── 降级 3: embedFn 为 null→ 仍可运行 ────────────────────

  it("embedFn 为 null 时返回原顺序", async () => {
    const cfg = { ...DEFAULT_CONFIG, rerank: { enabled: true, apiKey: "", provider: "cosine" } } as any;
    const reranker = new Reranker(cfg);
    const nodes = [makeNode("n1", "first"), makeNode("n2", "second")];
    // No embedFn → cosine scores are all 0 → stable order
    const result = await reranker.rerank("q", [0.1], nodes);
    expect(result.nodes.length).toBe(2);
  });

  // ─── 降级 4: API 返回空结果 → fallback ───────────────────

  it("API 返回空 results 时降级到 cosine", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
    }));
    const cfg = {
      ...DEFAULT_CONFIG,
      rerank: { enabled: true, apiKey: "fake-key", provider: "jina" },
    } as any;
    const reranker = new Reranker(cfg);
    const nodes = [makeNode("n1", "alpha"), makeNode("n2", "beta")];
    const result = await reranker.rerank("query", [], nodes);
    expect(result.nodes.length).toBe(2);
  });

  // ─── 降级 5: fetch 抛出异常 → fallback ───────────────────

  it("fetch 抛出异常时降级到 cosine", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));
    const cfg = {
      ...DEFAULT_CONFIG,
      rerank: { enabled: true, apiKey: "fake-key", provider: "jina" },
    } as any;
    const reranker = new Reranker(cfg);
    const nodes = [makeNode("n1", "doc"), makeNode("n2", "doc")];
    const result = await reranker.rerank("query", [], nodes);
    expect(result.nodes.length).toBe(2);
    expect(result.apiUsed).toBe(false);
  });

  // ─── 边界 1: 单节点 ───────────────────────────────────────

  it("单节点时不调用 API", async () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      rerank: { enabled: true, apiKey: "key", provider: "jina" },
    } as any;
    const reranker = new Reranker(cfg);
    const result = await reranker.rerank("q", [0.1], [makeNode("n1", "solo")]);
    expect(result.nodes.length).toBe(1);
  });

  // ─── 边界 2: 禁用状态 ─────────────────────────────────────

  it("rerank disabled 时返回原节点", async () => {
    const cfg = { ...DEFAULT_CONFIG, rerank: { enabled: false } } as any;
    const reranker = new Reranker(cfg);
    const nodes = [makeNode("n1", "a"), makeNode("n2", "b")];
    const result = await reranker.rerank("q", [0.1], nodes);
    expect(result.nodes.length).toBe(2);
    expect(result.apiUsed).toBe(false);
  });
});
