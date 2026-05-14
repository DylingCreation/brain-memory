/**
 * F-9 覆盖率补全 — reasoning/engine.ts 测试
 */
import { describe, it, expect } from "vitest";
import { shouldRunReasoning, parseReasoningResult, buildReasoningContext } from "../src/reasoning/engine";
import { DEFAULT_CONFIG } from "../src/types";

describe("F-9 reasoning coverage", () => {
  // ─── shouldRunReasoning ───────────────────────────────────

  describe("shouldRunReasoning", () => {
    it("returns false with empty nodes", () => {
      expect(shouldRunReasoning([], DEFAULT_CONFIG)).toBe(false);
    });

    it("returns false with fewer nodes than threshold", () => {
      const nodes = [
        { id: "1", name: "a", type: "TASK" as const, category: "tasks" as const, content: "x" } as any,
        { id: "2", name: "b", type: "TASK" as const, category: "tasks" as const, content: "y" } as any,
      ];
      expect(shouldRunReasoning(nodes, DEFAULT_CONFIG)).toBe(false);
    });

    it("returns true with enough nodes", () => {
      const nodes = [
        { id: "1", name: "a", type: "TASK" as const, category: "tasks" as const, content: "x" } as any,
        { id: "2", name: "b", type: "TASK" as const, category: "tasks" as const, content: "y" } as any,
        { id: "3", name: "c", type: "TASK" as const, category: "tasks" as const, content: "z" } as any,
        { id: "4", name: "d", type: "TASK" as const, category: "tasks" as const, content: "w" } as any,
      ];
      expect(shouldRunReasoning(nodes, DEFAULT_CONFIG)).toBe(true);
    });
  });

  // ─── parseReasoningResult edge cases ──────────────────────

  describe("parseReasoningResult (extra coverage)", () => {
    it("returns empty for non-JSON response", () => {
      expect(parseReasoningResult("this is not json", 5)).toEqual([]);
    });

    it("handles empty array", () => {
      expect(parseReasoningResult("[]", 5)).toEqual([]);
    });
  });

  // ─── buildReasoningContext ───────────────────────────────

  describe("buildReasoningContext", () => {
    it("builds XML from conclusions", () => {
      const conclusions = [
        { text: "A < B", type: "path" as const, confidence: 0.9 },
        { text: "C depends on D", type: "implicit" as const, confidence: 0.7 },
      ];
      const result = buildReasoningContext(conclusions);
      expect(result).not.toBeNull();
      expect(result!).toContain("A &lt; B"); // XML escaped
      expect(result!.length).toBeGreaterThan(0);
    });
  });
});
