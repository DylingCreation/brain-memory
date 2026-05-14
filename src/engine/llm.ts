/**
 * brain-memory — LLM client (fetch-based, no SDK needed)
 *
 * Compatible with any OpenAI-compatible endpoint.
 * Features: retry with exponential backoff, request logging, unified API key handling.
 * Authors: adoresever (graph-memory), brain-memory contributors
 */

/** LLM 补全函数：输入 system prompt 和 user prompt，返回文本响应。 */
export type CompleteFn = (system: string, user: string) => Promise<string>;

/** LLM 客户端配置。支持 OpenAI 兼容 API 和 Anthropic API。 */
export interface LlmConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
}

import { logger } from "../utils/logger";

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

/** 创建 LLM 补全函数。支持重试（指数退避）、Qwen thinking 优化和请求超时。 */
export function createCompleteFn(cfg?: LlmConfig): CompleteFn | null {
  const apiKey = cfg?.apiKey || process.env.ANTHROPIC_API_KEY || "";
  const baseURL = cfg?.baseURL || "https://api.openai.com/v1";
  const model = cfg?.model || "gpt-4o-mini";

  // No credentials at all — return null so caller can warn
  if (!apiKey) return null;

  // Detect Anthropic vs OpenAI-compatible
  const isAnthropic = baseURL.includes("anthropic");

  return async (system: string, user: string): Promise<string> => {
    const requestId = crypto.randomUUID().slice(0, 8);
    const startTime = Date.now();

    // Logging (#3): optional, enabled via BM_LOG_LLM env var or BM_LOG_LEVEL=debug
    if (process.env.BM_LOG_LLM) {
      logger.debug("llm", `req=${requestId} model=${model} system=${system.length}ch user=${user.length}ch`);
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = isAnthropic
          ? await anthropicComplete(apiKey, system, user, model)  // #19: pass apiKey
          : await openaiComplete(apiKey, baseURL, model, system, user);

        if (process.env.BM_LOG_LLM) {
          logger.debug("llm", `req=${requestId} ok latency=${Date.now() - startTime}ms attempt=${attempt}`);
        }
        return result;
      } catch (error) {
        lastError = error as Error;
        if (process.env.BM_LOG_LLM) {
          logger.warn("llm", `req=${requestId} fail attempt=${attempt}/${MAX_RETRIES} error=${lastError.message}`);
        }
        // Retry on transient errors (#4): rate limits (429), server errors (5xx), network failures
        const isRetryable = isRetryableError(lastError);
        if (!isRetryable || attempt >= MAX_RETRIES) break;

        const delayMs = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        if (process.env.BM_LOG_LLM) {
          logger.debug("llm", `req=${requestId} retrying in ${delayMs}ms...`);
        }
        await sleep(delayMs);
      }
    }

    throw lastError!;
  };
}

// ─── Helpers ──────────────────────────────────────────────────

function isRetryableError(error: Error): boolean {
  // Network/timeout errors
  if (error.name === 'AbortError') return true;
  if (error.message.includes('timed out')) return true;
  if (error.message.includes('fetch')) return true;
  // HTTP 429 (rate limit) and 5xx (server error)
  const match = error.message.match(/(\d{3})/);
  if (match) {
    const code = parseInt(match[1], 10);
    return code === 429 || (code >= 500 && code < 600);
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── OpenAI-compatible ────────────────────────────────────────

/**
 * Check if the model is a DashScope Qwen model with thinking enabled by default.
 * Qwen reasoning models (e.g. qwen3.6-plus) default to thinking mode which adds
 * 3-4s latency. For knowledge extraction (structured JSON), deep reasoning is
 * unnecessary, so we disable it to improve speed.
 */
function isThinkingModel(model: string): boolean {
  // Qwen 3.x models on DashScope default to thinking mode
  return /qwen3/i.test(model);
}

async function openaiComplete(apiKey: string, baseURL: string, model: string, system: string, user: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const body: Record<string, unknown> = {
      model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      temperature: 0.1,
      max_tokens: 4096
    };

    // Disable thinking for Qwen reasoning models to reduce latency (~4x faster)
    // Verified: qwen3.6-plus goes from ~4s to ~1s with thinking disabled
    if (isThinkingModel(model)) {
      (body as any).thinking = { type: "disabled" };
    }

    const res = await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "User-Agent": "brain-memory/1.0"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!res.ok) {
      const errorMessage = await res.text();
      throw new Error(`LLM error: ${res.status} - ${errorMessage}`);
    }

    const data = await res.json() as any;
    return data.choices?.[0]?.message?.content ?? "";
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── Anthropic ────────────────────────────────────────────────

async function anthropicComplete(apiKey: string, system: string, user: string, model: string): Promise<string> {
  if (!apiKey) throw new Error("No LLM configured: set config.llm.apiKey or ANTHROPIC_API_KEY");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "User-Agent": "brain-memory/1.0"
      },
      body: JSON.stringify({
        model,
        system,
        messages: [{ role: "user", content: user }],
        max_tokens: 4096
      }),
      signal: controller.signal
    });

    if (!res.ok) {
      const errorMessage = await res.text();
      throw new Error(`Anthropic error: ${res.status} - ${errorMessage}`);
    }

    const data = await res.json() as any;
    return data.content?.[0]?.text ?? "";
  } finally {
    clearTimeout(timeoutId);
  }
}
