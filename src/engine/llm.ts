/**
 * brain-memory — LLM client (fetch-based, no SDK needed)
 *
 * Compatible with any OpenAI-compatible endpoint.
 * Features: retry with exponential backoff, request logging, unified API key handling.
 * Authors: adoresever (graph-memory), brain-memory contributors
 */

export type CompleteFn = (system: string, user: string) => Promise<string>;

export interface LlmConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
}

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

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

    // Logging (#3): optional, enabled via BM_LOG_LLM env var
    if (process.env.BM_LOG_LLM) {
      console.log(`[LLM] req=${requestId} model=${model} system=${system.length}ch user=${user.length}ch`);
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = isAnthropic
          ? await anthropicComplete(apiKey, system, user, model)  // #19: pass apiKey
          : await openaiComplete(apiKey, baseURL, model, system, user);

        if (process.env.BM_LOG_LLM) {
          console.log(`[LLM] req=${requestId} ok latency=${Date.now() - startTime}ms attempt=${attempt}`);
        }
        return result;
      } catch (error) {
        lastError = error as Error;
        if (process.env.BM_LOG_LLM) {
          console.warn(`[LLM] req=${requestId} fail attempt=${attempt}/${MAX_RETRIES} error=${lastError.message}`);
        }
        // Retry on transient errors (#4): rate limits (429), server errors (5xx), network failures
        const isRetryable = isRetryableError(lastError);
        if (!isRetryable || attempt >= MAX_RETRIES) break;

        const delayMs = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        if (process.env.BM_LOG_LLM) {
          console.log(`[LLM] req=${requestId} retrying in ${delayMs}ms...`);
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

async function openaiComplete(apiKey: string, baseURL: string, model: string, system: string, user: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "User-Agent": "brain-memory/1.0"
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        temperature: 0.1,
        max_tokens: 4096
      }),
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
