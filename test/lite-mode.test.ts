/**
 * v1.5.0 — Lite 模式测试
 */
import { describe, it, expect } from "vitest";
import { ContextEngine } from "../src/engine/context";
import { DEFAULT_CONFIG } from "../src/types";

describe("v1.5.0 Lite 模式", () => {
  let engine: ContextEngine;

  const makeConfig = (mode: "full" | "lite") => ({
    ...DEFAULT_CONFIG,
    mode,
    fusion: { ...DEFAULT_CONFIG.fusion, enabled: true, minNodes: 1, minCommunities: 0 },
    reasoning: { ...DEFAULT_CONFIG.reasoning, enabled: true, minRecallNodes: 2 },
    reflection: { ...DEFAULT_CONFIG.reflection, enabled: true, sessionReflection: true },
  });

  afterEach(() => {
    try { engine?.close(); } catch {}
  });

  // ─── L-1: processTurn lite mode (no LLM extraction) ─────

  it("lite 模式下 processTurn 不崩溃（仅启发式提取）", async () => {
    engine = new ContextEngine(makeConfig("lite"));
    const result = await engine.processTurn({
      sessionId: "test", agentId: "a1", workspaceId: "w1",
      messages: [{ role: "user", content: "我需要部署一个 Docker 应用到生产环境" }],
    });
    expect(result).toBeDefined();
    expect(result.extractedNodes).toBeDefined();
    expect(result.extractedEdges).toBeDefined();
    expect(result.workingMemory).toBeDefined();
  });

  // ─── L-2: Lite mode skips fusion ────────────────────────

  it("lite 模式下 performFusion 直接返回空", async () => {
    engine = new ContextEngine(makeConfig("lite"));
    const result = await engine.performFusion("test");
    expect(result.candidates).toEqual([]);
    expect(result.merged).toBe(0);
    expect(result.linked).toBe(0);
  });

  // ─── L-3: Lite mode skips session reflection ─────────────

  it("lite 模式下 reflectOnSession 返回空", async () => {
    engine = new ContextEngine(makeConfig("lite"));
    const result = await engine.reflectOnSession("test", []);
    expect(result).toEqual([]);
  });

  // ─── L-4: Lite mode skips reasoning ─────────────────────

  it("lite 模式下 performReasoning 返回空", async () => {
    engine = new ContextEngine(makeConfig("lite"));
    const result = await engine.performReasoning("test");
    expect(result).toEqual([]);
  });

  // ─── L-5: Full mode still works ─────────────────────────

  it("full 模式下 processTurn 正常运行", async () => {
    engine = new ContextEngine(makeConfig("full"));
    const result = await engine.processTurn({
      sessionId: "test", agentId: "a1", workspaceId: "w1",
      messages: [{ role: "user", content: "我需要部署 Docker 应用" }],
    });
    expect(result).toBeDefined();
    expect(result.extractedNodes).toBeDefined();
  });
});
