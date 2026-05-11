/**
 * brain-memory — LLM Integration Test (Test 2)
 *
 * Verifies that DashScope qwen3.6-plus LLM works end-to-end
 * through the brain-memory LLM engine and knowledge extractor.
 *
 * Gated by TEST_LLM_API_KEY — set BM_LLM_TEST=1 to enable.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env" });

import { describe, it, expect } from "vitest";
import { createCompleteFn, type LlmConfig } from "../src/engine/llm";

// LLM calls can be slow (8-20s each, sometimes more)
const LLM_TIMEOUT = 60000;

// ─── LLM config from config.js ────────────────────────────────
// Dynamically import to pick up the actual API key

const LLM_CONFIG: LlmConfig = {
  baseURL: process.env.TEST_LLM_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1",
  model: process.env.TEST_LLM_MODEL ?? "qwen3.6-plus",
  apiKey: process.env.TEST_LLM_API_KEY || "",
};

function getApiKey(): string | null {
  // Check if the API key is configured (non-empty, not a placeholder)
  const key = process.env.TEST_LLM_API_KEY;
  if (key && key !== "YOUR_API_KEY_HERE" && key.length > 10) return key;
  return null;
}

// ─── Tests ─────────────────────────────────────────────────────

describe("LLM Integration — DashScope qwen3.6-plus", () => {
  it("createCompleteFn returns a function when API key is configured", () => {
    const apiKey = getApiKey();
    if (!apiKey) {
      console.warn("Skipping: TEST_LLM_API_KEY not set");
      return;
    }

    const completeFn = createCompleteFn({ ...LLM_CONFIG, apiKey });
    expect(completeFn).not.toBeNull();
    expect(typeof completeFn).toBe("function");
  });

  it("createCompleteFn returns null when no API key", () => {
    const fn = createCompleteFn({ baseURL: "https://example.com", model: "test" });
    expect(fn).toBeNull();
  });

  it("LLM responds to a simple completion", async () => {
    const apiKey = getApiKey();
    if (!apiKey) {
      console.warn("Skipping: TEST_LLM_API_KEY not set");
      return;
    }

    const completeFn = createCompleteFn({ ...LLM_CONFIG, apiKey });
    expect(completeFn).not.toBeNull();

    const response = await completeFn!(
      "You are a helpful assistant. Respond in 5 words or less.",
      "What is 2+2?"
    );
    expect(response.length).toBeGreaterThan(0);
    expect(response.length).toBeLessThan(200);
    console.log(`LLM response: "${response.trim()}"`);
  }, LLM_TIMEOUT);

  it("LLM can produce JSON output for knowledge extraction", async () => {
    const apiKey = getApiKey();
    if (!apiKey) {
      console.warn("Skipping: TEST_LLM_API_KEY not set");
      return;
    }

    const completeFn = createCompleteFn({ ...LLM_CONFIG, apiKey });
    expect(completeFn).not.toBeNull();

    const response = await completeFn!(
      `You are a JSON-only API. Output ONLY valid JSON, no other text.
Format: {"nodes":[{"name":"string","type":"TASK|SKILL|EVENT","category":"entities"}]}`,
      `Extract knowledge from: "User is working on a TypeScript memory system project"`
    );
    expect(response.length).toBeGreaterThan(0);

    // Should contain valid JSON
    const parsed = JSON.parse(response);
    expect(parsed).toHaveProperty("nodes");
    expect(Array.isArray(parsed.nodes)).toBe(true);
    expect(parsed.nodes.length).toBeGreaterThan(0);
    console.log(`Extracted nodes: ${JSON.stringify(parsed.nodes)}`);
  }, LLM_TIMEOUT);

  it("LLM handles Chinese text correctly", async () => {
    const apiKey = getApiKey();
    if (!apiKey) {
      console.warn("Skipping: TEST_LLM_API_KEY not set");
      return;
    }

    const completeFn = createCompleteFn({ ...LLM_CONFIG, apiKey });
    expect(completeFn).not.toBeNull();

    const response = await completeFn!(
      "你是一个 JSON API，只输出 JSON，不要其他内容。",
      `从这句话中提取知识："用户正在开发一个 TypeScript 记忆系统"`
    );
    expect(response.length).toBeGreaterThan(0);
    console.log(`Chinese extraction: "${response.slice(0, 200)}..."`);
  }, LLM_TIMEOUT);
});
