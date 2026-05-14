/**
 * v1.2.0 F-7 — Developer Hook Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHookRegistry, type HookRegistry } from "../src/plugin/hooks";
import { ContextEngine } from "../src/engine/context";
import { DEFAULT_CONFIG } from "../src/types";

describe("F-7 开发者 Hook", () => {
  let engine: ContextEngine;

  afterEach(async () => {
    if (engine) {
      try { engine.close(); } catch {}
    }
  });

  // ─── Hook Registry ──────────────────────────────────────────

  describe("createHookRegistry", () => {
    it("creates empty registry with all 6 hook types", () => {
      const registry = createHookRegistry();
      expect(registry.beforeExtract).toEqual([]);
      expect(registry.afterExtract).toEqual([]);
      expect(registry.beforeRecall).toEqual([]);
      expect(registry.afterRecall).toEqual([]);
      expect(registry.beforeFusion).toEqual([]);
      expect(registry.afterFusion).toEqual([]);
    });
  });

  // ─── Before-extract Hook ──────────────────────────────────

  describe("beforeExtract hook", () => {
    it("is called with messages and existingNames", async () => {
      engine = new ContextEngine({ ...DEFAULT_CONFIG });
      const hook = vi.fn(async (input) => input);
      engine.hooks.beforeExtract.push(hook);

      try {
        await engine.processTurn({
          sessionId: "test",
          agentId: "test",
          workspaceId: "test",
          messages: [{ role: "user", content: "hello" }],
        });
      } catch { /* LLM not configured is fine */ }

      expect(hook).toHaveBeenCalledTimes(1);
      const args = hook.mock.calls[0][0];
      expect(args.messages).toBeDefined();
      expect(args.existingNames).toBeDefined();
    });
  });

  // ─── afterExtract Hook ───────────────────────────────────

  describe("afterExtract hook", () => {
    it("is called with extraction results", async () => {
      engine = new ContextEngine({ ...DEFAULT_CONFIG });
      const hook = vi.fn(async (input) => input);
      engine.hooks.afterExtract.push(hook);

      try {
        await engine.processTurn({
          sessionId: "test",
          agentId: "test",
          workspaceId: "test",
          messages: [{ role: "user", content: "hello" }],
        });
      } catch { /* LLM not configured */ }

      expect(hook).toHaveBeenCalledTimes(1);
    });
  });

  // ─── beforeRecall Hook ──────────────────────────────────

  describe("beforeRecall hook", () => {
    it("is called with query", async () => {
      engine = new ContextEngine({ ...DEFAULT_CONFIG });
      const hook = vi.fn(async (input) => input);
      engine.hooks.beforeRecall.push(hook);

      const result = await engine.recall("test query", "test", "test", "test");
      expect(hook).toHaveBeenCalledTimes(1);
      const args = hook.mock.calls[0][0];
      expect(args.query).toBeDefined();
    });
  });

  // ─── Before-fusion Hook ──────────────────────────────────

  describe("beforeFusion hook", () => {
    it("is called in performFusion", async () => {
      engine = new ContextEngine({ ...DEFAULT_CONFIG, fusion: { enabled: true, similarityThreshold: 0.75, minNodes: 20, minCommunities: 3 } });
      const hook = vi.fn(async (input) => input);
      engine.hooks.beforeFusion.push(hook);

      const result = await engine.performFusion("test");
      expect(hook).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Hook Error Resilience ───────────────────────────────

  describe("hook error resilience", () => {
    it("catching hooks don't break the pipeline", async () => {
      engine = new ContextEngine({ ...DEFAULT_CONFIG });
      const badHook = vi.fn(async () => { throw new Error("test error"); });
      engine.hooks.beforeRecall.push(badHook);

      // Should not throw
      const result = await engine.recall("test", "test", "test", "test");
      expect(result).toBeDefined();
      expect(badHook).toHaveBeenCalled();
    });
  });
});
