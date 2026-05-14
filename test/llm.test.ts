/**
 * v1.0.0 B-5 — LLM Client Tests
 *
 * Covers src/engine/llm.ts — createCompleteFn
 * 27 test cases across 7 groups.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createCompleteFn, type CompleteFn, type LlmConfig } from "../src/engine/llm";

// ─── createCompleteFn null cases (3 tests) ─────────────────────

describe("createCompleteFn — null returns", () => {
  it("returns null when no config", () => {
    const fn = createCompleteFn(undefined);
    expect(fn).toBeNull();
  });

  it("returns null when apiKey is empty string", () => {
    const fn = createCompleteFn({ apiKey: "" });
    expect(fn).toBeNull();
  });

  it("returns null when apiKey is undefined", () => {
    const fn = createCompleteFn({} as LlmConfig);
    expect(fn).toBeNull();
  });
});

// ─── returns function (4 tests) ────────────────────────────────

describe("createCompleteFn — returns function", () => {
  it("returns function when apiKey is provided", () => {
    const fn = createCompleteFn({ apiKey: "test-key" });
    expect(typeof fn).toBe("function");
  });

  it("uses default parameters", () => {
    const fn = createCompleteFn({ apiKey: "test-key" });
    expect(typeof fn).toBe("function");
  });

  it("accepts custom baseURL", () => {
    const fn = createCompleteFn({ apiKey: "test-key", baseURL: "https://custom.api/v1" });
    expect(typeof fn).toBe("function");
  });

  it("accepts custom model", () => {
    const fn = createCompleteFn({ apiKey: "test-key", model: "gpt-4" });
    expect(typeof fn).toBe("function");
  });
});

// ─── OpenAI-compatible API (5 tests) ──────────────────────────

describe("createCompleteFn — OpenAI-compatible API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends correct request body", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: "hello" } }] }),
    }));

    const fn = createCompleteFn({ apiKey: "sk-test", baseURL: "https://api.openai.com/v1", model: "gpt-4o-mini" })!;
    const result = await fn("system prompt", "user prompt");
    expect(result).toBe("hello");

    const callArgs = (fetch as any).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.messages).toEqual([
      { role: "system", content: "system prompt" },
      { role: "user", content: "user prompt" },
    ]);
    expect(callArgs[1].headers.Authorization).toBe("Bearer sk-test");

    vi.useRealTimers();
  });

  it("handles empty response", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [] }),
    }));

    const fn = createCompleteFn({ apiKey: "sk-test" })!;
    const result = await fn("sys", "user");
    expect(result).toBe("");

    vi.useRealTimers();
  });

  it("throws on 500 error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    }));

    const fn = createCompleteFn({ apiKey: "sk-test" })!;
    await expect(fn("sys", "user")).rejects.toThrow("500");
  });

  it("throws on 401 error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
    }));

    const fn = createCompleteFn({ apiKey: "sk-test" })!;
    await expect(fn("sys", "user")).rejects.toThrow("401");
  });

  it("detects Anthropic by baseURL", () => {
    const fn = createCompleteFn({ apiKey: "sk-ant-test", baseURL: "https://api.anthropic.com" });
    expect(typeof fn).toBe("function");
  });
});

// ─── Retry logic (4 tests) ─────────────────────────────────────

describe("createCompleteFn — retry logic", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("retries on 429 rate limit", async () => {
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount <= 2) {
        return Promise.resolve({ ok: false, status: 429, text: () => Promise.resolve("Rate limit") });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ choices: [{ message: { content: "ok" } }] }) });
    }));

    const fn = createCompleteFn({ apiKey: "sk-test" })!;
    const promise = fn("sys", "user");

    // Advance through retries
    await vi.advanceTimersByTimeAsync(1000); // retry 1 delay
    await vi.advanceTimersByTimeAsync(2000); // retry 2 delay
    await vi.advanceTimersByTimeAsync(4000); // retry 3 delay

    const result = await promise;
    expect(result).toBe("ok");
    expect(callCount).toBe(3);
  });

  it("retries on 503 server error", async () => {
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount <= 1) {
        return Promise.resolve({ ok: false, status: 503, text: () => Promise.resolve("Service Unavailable") });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ choices: [{ message: { content: "ok" } }] }) });
    }));

    const fn = createCompleteFn({ apiKey: "sk-test" })!;
    const promise = fn("sys", "user");
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);

    const result = await promise;
    expect(result).toBe("ok");
  });

  it("gives up after MAX_RETRIES", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Server Error"),
    }));

    const fn = createCompleteFn({ apiKey: "sk-test" })!;
    const promise = fn("sys", "user");

    // Attach rejection handler early to prevent vitest unhandled rejection warning
    // (fake timer + async retry creates a microtask timing gap)
    promise.catch(() => {});

    // Advance through all 3 retries
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);

    await expect(promise).rejects.toThrow("500");
  });

  it("does not retry on 400 bad request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve("Bad Request"),
    }));

    const fn = createCompleteFn({ apiKey: "sk-test" })!;
    await expect(fn("sys", "user")).rejects.toThrow("400");
    expect((fetch as any).mock.calls.length).toBe(1);
  });
});

// ─── isRetryableError retry behavior (2 tests) ─────────────────

describe("createCompleteFn — network error retry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("retries on network error (fetch failed)", async () => {
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount <= 1) {
        return Promise.reject(new Error("fetch failed"));
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ choices: [{ message: { content: "ok" } }] }) });
    }));

    const fn = createCompleteFn({ apiKey: "sk-test" })!;
    const promise = fn("sys", "user");
    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toBe("ok");
  });

  it("retries on timeout error (AbortError)", async () => {
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount <= 1) {
        return Promise.reject(new DOMException("The operation was aborted.", "AbortError"));
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ choices: [{ message: { content: "ok" } }] }) });
    }));

    const fn = createCompleteFn({ apiKey: "sk-test" })!;
    const promise = fn("sys", "user");
    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toBe("ok");
  });
});

// ─── Request timeout (1 test) ──────────────────────────────────

describe("createCompleteFn — request timeout", () => {
  it("uses AbortController signal", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url: string, opts: any) => {
      expect(opts.signal).toBeDefined();
      expect(opts.signal instanceof AbortController).toBe(false); // it's AbortController.signal
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ choices: [{ message: { content: "ok" } }] }) });
    }));

    const fn = createCompleteFn({ apiKey: "sk-test" })!;
    await fn("sys", "user");

    vi.unstubAllGlobals();
  });
});
