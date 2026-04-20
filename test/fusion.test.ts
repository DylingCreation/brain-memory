/**
 * brain-memory — Knowledge Fusion tests
 */

import { describe, it, expect } from "vitest";
import {
  computeNameSimilarity,
  parseFusionDecision,
  tokenize,
  jaccardSimilarity,
  cosineSimilarity,
} from "../src/fusion/analyzer.ts";

describe("tokenize", () => {
  it("tokenizes Chinese text", () => {
    const tokens = tokenize("Docker 端口冲突修复");
    expect(tokens.size).toBeGreaterThan(0);
  });

  it("tokenizes English text", () => {
    const tokens = tokenize("docker port conflict fix");
    expect(tokens).toContain("docker");
    expect(tokens).toContain("port");
  });

  it("filters single-char tokens", () => {
    const tokens = tokenize("a b cd");
    expect(tokens.has("a")).toBe(false);
    expect(tokens.has("cd")).toBe(true);
  });
});

describe("jaccardSimilarity", () => {
  it("returns 1 for identical sets", () => {
    const a = new Set(["docker", "port", "fix"]);
    const b = new Set(["docker", "port", "fix"]);
    expect(jaccardSimilarity(a, b)).toBe(1);
  });

  it("returns 0 for disjoint sets", () => {
    const a = new Set(["docker", "port"]);
    const b = new Set(["python", "flask"]);
    expect(jaccardSimilarity(a, b)).toBe(0);
  });

  it("returns partial overlap", () => {
    const a = new Set(["docker", "port", "fix"]);
    const b = new Set(["docker", "deploy", "fix"]);
    const sim = jaccardSimilarity(a, b);
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });
});

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([1, 0, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5);
  });

  it("returns 0 for orthogonal vectors", () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
  });

  it("handles different length vectors", () => {
    const a = new Float32Array([1, 0, 0, 0]);
    const b = new Float32Array([1, 0, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5);
  });
});

describe("computeNameSimilarity", () => {
  it("returns 1 for identical normalized names", () => {
    expect(computeNameSimilarity("docker-port", "docker-port")).toBe(1);
  });

  it("returns high similarity for similar names", () => {
    const sim = computeNameSimilarity("docker port fix", "docker fix port");
    expect(sim).toBe(1); // Same tokens, different order
  });

  it("returns 0 for completely different names", () => {
    const sim = computeNameSimilarity("docker deploy", "python testing");
    expect(sim).toBe(0);
  });
});

describe("parseFusionDecision", () => {
  it("parses merge decision", () => {
    const result = parseFusionDecision('{"decision":"merge","reason":"same topic"}');
    expect(result.decision).toBe("merge");
    expect(result.reason).toBe("same topic");
  });

  it("parses link decision", () => {
    const result = parseFusionDecision('{"decision":"link","reason":"related"}');
    expect(result.decision).toBe("link");
  });

  it("parses none decision", () => {
    const result = parseFusionDecision('{"decision":"none","reason":"different topics"}');
    expect(result.decision).toBe("none");
  });

  it("defaults to none on invalid JSON", () => {
    const result = parseFusionDecision("not json");
    expect(result.decision).toBe("none");
  });

  it("handles markdown code blocks", () => {
    const result = parseFusionDecision('```json\n{"decision":"merge","reason":"test"}\n```');
    expect(result.decision).toBe("merge");
  });

  it("handles thinking tags", () => {
    const result = parseFusionDecision('<think>let me think</think>\n{"decision":"link","reason":"related"}');
    expect(result.decision).toBe("link");
  });

  it("handles case insensitivity", () => {
    const result = parseFusionDecision('{"decision":"MERGE","reason":"same"}');
    expect(result.decision).toBe("merge");
  });
});
