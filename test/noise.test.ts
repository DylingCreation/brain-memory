/**
 * brain-memory — Noise filter tests
 */

import { describe, it, expect } from "vitest";
import { isNoise } from "../src/noise/filter.ts";

const cfg = { enabled: true, minContentLength: 10 };

describe("isNoise", () => {
  it("filters short content", () => {
    expect(isNoise("hi", cfg)).toBe(true);
    expect(isNoise("ok", cfg)).toBe(true);
  });

  it("filters greetings", () => {
    expect(isNoise("你好", cfg)).toBe(true);
    expect(isNoise("Hello there", cfg)).toBe(true);
    expect(isNoise("hey!", cfg)).toBe(true);
  });

  it("filters thanks", () => {
    expect(isNoise("谢谢", cfg)).toBe(true);
    expect(isNoise("thanks", cfg)).toBe(true);
    expect(isNoise("Thank you!", cfg)).toBe(true);
  });

  it("filters short acks", () => {
    expect(isNoise("好的", cfg)).toBe(true);
    expect(isNoise("收到", cfg)).toBe(true);
    expect(isNoise("ok", cfg)).toBe(true);
  });

  it("allows longer acks", () => {
    // "好的" matches ack pattern, only filtered if < 50 chars
    expect(isNoise("好的", cfg)).toBe(true);
    // This string is > 50 chars so the ack filter doesn't apply
    const longMsg = "好的，我知道了，这个问题需要进一步讨论和分析，我们需要更多详细信息和更多文字来确保超过五十字的限制，这样可以验证过滤器的行为是否正确";
    expect(longMsg.length).toBeGreaterThan(50);
    expect(isNoise(longMsg, { enabled: true, minContentLength: 10 })).toBe(false);
  });

  it("allows meaningful content", () => {
    expect(isNoise("I think we should use React for the frontend", cfg)).toBe(false);
    expect(isNoise("帮我查一下 Python 的 asyncio 用法", cfg)).toBe(false);
  });

  it("handles minContentLength", () => {
    expect(isNoise("abc", { enabled: true, minContentLength: 10 })).toBe(true);
    // "hello" matches greeting pattern, filtered
    expect(isNoise("hello", { enabled: true, minContentLength: 10 })).toBe(true);
    // Non-noise long content
    expect(isNoise("this is a detailed explanation of the project", { enabled: true, minContentLength: 10 })).toBe(false);
  });
});
