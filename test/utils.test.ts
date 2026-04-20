/**
 * brain-memory — Utils module tests
 */

import { describe, it, expect } from "vitest";
import { cosineSimilarity, cosineSimilarityF32 } from "../src/utils/similarity.ts";
import { extractJson } from "../src/utils/json.ts";
import { tokenize, jaccardSimilarity } from "../src/utils/text.ts";
import { escapeXml } from "../src/utils/xml.ts";

describe("cosineSimilarity (number[])", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 5);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0, 5);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 5);
  });

  it("handles empty vectors", () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it("handles different length vectors", () => {
    expect(cosineSimilarity([1, 0, 0, 0], [1, 0, 0])).toBeCloseTo(1, 5);
  });
});

describe("cosineSimilarityF32 (Float32Array)", () => {
  it("returns 1 for identical vectors", () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([1, 0, 0]);
    expect(cosineSimilarityF32(a, b)).toBeCloseTo(1, 5);
  });

  it("returns 0 for orthogonal vectors", () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(cosineSimilarityF32(a, b)).toBeCloseTo(0, 5);
  });

  it("handles empty vectors", () => {
    expect(cosineSimilarityF32(new Float32Array(), new Float32Array())).toBe(0);
  });
});

describe("extractJson", () => {
  it("returns clean JSON as-is", () => {
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
  });

  it("extracts JSON from code fences", () => {
    const result = extractJson('```json\n{"a":1}\n```');
    expect(result).toBe('{"a":1}');
  });

  it("extracts JSON from wrapped text", () => {
    const result = extractJson('Here is the result:\n{"a":1}\nDone.');
    expect(result).toBe('{"a":1}');
  });

  it("strips think tags", () => {
    const result = extractJson('<think>reasoning</think>\n{"a":1}');
    expect(result).toBe('{"a":1}');
  });

  it("strips think tags (unclosed — strips all after)", () => {
    // Unclosed think tags greedily strip everything after <think>
    const result = extractJson('<think>reasoning\n{"a":1}');
    expect(result).toBe("");
  });

  it("returns original for non-JSON", () => {
    expect(extractJson("not json at all")).toBe("not json at all");
  });
});

describe("tokenize", () => {
  it("tokenizes English", () => {
    const tokens = tokenize("hello world test");
    expect(tokens.has("hello")).toBe(true);
    expect(tokens.has("world")).toBe(true);
    expect(tokens.has("test")).toBe(true);
  });

  it("tokenizes Chinese", () => {
    const tokens = tokenize("你好世界");
    expect(tokens.size).toBeGreaterThan(0);
  });

  it("filters single-char tokens", () => {
    const tokens = tokenize("a b cd");
    expect(tokens.has("a")).toBe(false);
    expect(tokens.has("cd")).toBe(true);
  });

  it("removes punctuation", () => {
    const tokens = tokenize("hello, world!");
    expect(tokens.has("hello")).toBe(true);
    expect(tokens.has("world")).toBe(true);
  });

  it("lowercases", () => {
    const tokens = tokenize("Hello World");
    expect(tokens.has("hello")).toBe(true);
  });
});

describe("jaccardSimilarity", () => {
  it("returns 1 for identical sets", () => {
    const a = new Set(["a", "b", "c"]);
    const b = new Set(["a", "b", "c"]);
    expect(jaccardSimilarity(a, b)).toBe(1);
  });

  it("returns 0 for disjoint sets", () => {
    const a = new Set(["a", "b"]);
    const b = new Set(["c", "d"]);
    expect(jaccardSimilarity(a, b)).toBe(0);
  });

  it("returns partial overlap", () => {
    const a = new Set(["a", "b", "c"]);
    const b = new Set(["b", "c", "d"]);
    const sim = jaccardSimilarity(a, b);
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
    expect(sim).toBeCloseTo(0.5, 5); // 2 overlap / 4 union
  });

  it("handles empty sets", () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(1);
  });
});

describe("escapeXml", () => {
  it("escapes ampersand", () => {
    expect(escapeXml("a & b")).toBe("a &amp; b");
  });

  it("escapes less-than", () => {
    expect(escapeXml("a < b")).toBe("a &lt; b");
  });

  it("escapes greater-than", () => {
    expect(escapeXml("a > b")).toBe("a &gt; b");
  });

  it("escapes quotes", () => {
    expect(escapeXml('a "b"')).toBe("a &quot;b&quot;");
  });

  it("escapes all special chars", () => {
    expect(escapeXml('<a & "b">')).toBe("&lt;a &amp; &quot;b&quot;&gt;");
  });

  it("passes clean text through", () => {
    expect(escapeXml("hello world")).toBe("hello world");
  });
});
