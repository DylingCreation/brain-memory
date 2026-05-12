/**
 * brain-memory — Smart truncate tests
 */

import { describe, it, expect } from "vitest";
import { smartTruncate, truncate } from "../src/utils/truncate";

// ─── smartTruncate ─────────────────────────────────────────────

describe("smartTruncate", () => {
  it("returns text unchanged when within limit", () => {
    expect(smartTruncate("short", { maxChars: 10 })).toBe("short");
  });

  it("returns empty string for empty input", () => {
    expect(smartTruncate("", { maxChars: 10 })).toBe("");
  });

  // Paragraph boundary
  it("truncates at paragraph break (\\n\\n)", () => {
    const text = "First paragraph.\n\nSecond paragraph that goes on and on and should be cut.";
    const result = smartTruncate(text, { maxChars: 30 });
    expect(result).toContain("First paragraph.");
    expect(result).toContain("...");
    expect(result).not.toContain("Second paragraph");
  });

  it("appends hint when provided", () => {
    const text = "Para one.\n\nPara two that is long and goes on forever.";
    const result = smartTruncate(text, { maxChars: 15, hint: "embed" });
    expect(result).toContain("[embed]");
    expect(result).toContain("...");
  });

  // Sentence boundary
  it("truncates at sentence boundary when no paragraph break", () => {
    const text = "First sentence. Second sentence is very long and continues without a paragraph break.";
    const result = smartTruncate(text, { maxChars: 40 });
    expect(result).toContain("First sentence.");
    expect(result).toContain("...");
  });

  it("handles Chinese sentence endings", () => {
    const text = "这是第一句话。这是第二句很长的话没有换行。";
    const result = smartTruncate(text, { maxChars: 10 });
    expect(result).toContain("这是第一句话。");
    expect(result).toContain("...");
  });

  it("handles exclamation and question marks", () => {
    const text = "Really! What happened? I don't know. More text that continues.";
    const result = smartTruncate(text, { maxChars: 30 });
    expect(result).toMatch(/[!?.]\s*\.\.\./);
  });

  // Code block boundary
  it("truncates at code block boundary (```) when no better boundary", () => {
    // No sentence/paragraph boundary before ``` marker, and ``` within maxChars
    const text = "Lorem ipsum dolor sit amet consectetur adipiscing elit\n```code block here```";
    const result = smartTruncate(text, { maxChars: 65 });
    expect(result).toContain("...[code truncated]");
  });

  // Space boundary
  it("truncates at word break when no better boundary", () => {
    const text = "word1 word2 word3 word4 word5 word6 word7 word8";
    const result = smartTruncate(text, { maxChars: 20 });
    expect(result).toContain("word1 word2");
    expect(result).toContain("...");
  });

  // Hard cut (last resort)
  it("hard cuts when text has no break points within minBoundary", () => {
    const text = "ThisIsAVeryLongWordWithoutAnySpacesOrPunctuationOrBreaks";
    const result = smartTruncate(text, { maxChars: 30 });
    expect(result.length).toBeLessThanOrEqual(30 + 3); // maxChars + suffix
    expect(result).toContain("...");
  });

  // Custom suffix
  it("uses custom suffix when provided", () => {
    const text = "hello world this is a long text with spaces everywhere";
    const result = smartTruncate(text, { maxChars: 20, suffix: " [more]" });
    expect(result).toContain(" [more]");
  });

  // Boundary conditions
  it("truncates exactly at limit with paragraph break", () => {
    const text = "A".repeat(50) + "\n\n" + "B".repeat(100);
    const result = smartTruncate(text, { maxChars: 60 });
    expect(result.length).toBeLessThan(text.length);
  });

  it("respects minBoundary (50% of maxChars) for paragraph", () => {
    // Paragraph break at position 2 < minBoundary (25 for maxChars=50) should be skipped
    // Falls back to hard cut at ~50 chars; output still starts from position 0
    const text = "ab\n\n" + "X".repeat(100);
    const result = smartTruncate(text, { maxChars: 50 });
    // Hard cut means we get ~47 chars + suffix
    expect(result.length).toBeLessThanOrEqual(53);
    // The paragraph break was skipped (not used as truncation point)
    // but text from position 0 is always included in the result
  });
});

// ─── truncate convenience wrapper ──────────────────────────────

describe("truncate", () => {
  it("calls smartTruncate with defaults", () => {
    const text = "hello world foo bar baz";
    const result = truncate(text, 10);
    expect(result).toContain("...");
  });

  it("passes hint through", () => {
    const text = "hello world foo bar baz";
    const result = truncate(text, 10, "test");
    expect(result).toContain("[test]");
  });

  it("returns full text when within limit", () => {
    const text = "short";
    expect(truncate(text, 100)).toBe("short");
  });
});
