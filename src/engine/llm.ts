/**
 * brain-memory — LLM client (fetch-based, no SDK needed)
 *
 * Compatible with OpenAI-compatible, Ollama (native + /v1), DashScope, and Anthropic endpoints.
 * Features: retry with exponential backoff, multi-endpoint thinking disable, request logging.
 *
 * v1.8.0 F-1: Added detectEndpointType() for Ollama native /api/chat support,
 *   configurable maxTokens, and endpoint-aware thinking disable.
 * Authors: adoresever (graph-memory), brain-memory contributors, external deployer feedback
 */

/** LLM 补全函数：输入 system prompt 和 user prompt，返回文本响应。 */
export type CompleteFn = (system: string, user: string) => Promise<string>;

/** LLM 客户端配置。支持 OpenAI 兼容 API、Ollama、DashScope 和 Anthropic API。 */
export interface LlmConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  /** 最大输出 token 数。默认 4096。v1.8.0 F-1 新增。 */
  maxTokens?: number;
}

/** LLM 端点类型。v1.8.0 F-1: 用于路由不同的 body 格式和 thinking 关闭方式。 */
export type LlmEndpointType = 'dashscope' | 'ollama' | 'openai' | 'anthropic';

import { logger } from '../utils/logger';

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;
const DEFAULT_MAX_TOKENS = 4096;

/**
 * 检测 LLM 端点类型，基于 baseURL。
 * v1.8.0 F-1: 替代旧版 isThinkingModel() 的模型名判断，
 * thinking 关闭的格式取决于 endpoint 类型，不是模型名。
 */
export function detectEndpointType(baseURL: string): LlmEndpointType {
  if (baseURL.includes('dashscope') || baseURL.includes('aliyuncs.com')) return 'dashscope';
  if (baseURL.includes('11434') || baseURL.includes('ollama')) return 'ollama';
  if (baseURL.includes('anthropic')) return 'anthropic';
  return 'openai';
}

/** 创建 LLM 补全函数。支持重试（指数退避）、多端点 thinking 优化和请求超时。 */
export function createCompleteFn(cfg?: LlmConfig): CompleteFn | null {
  const apiKey = cfg?.apiKey || '';
  const baseURL = cfg?.baseURL || 'https://api.openai.com/v1';
  const model = cfg?.model || 'gpt-4o-mini';
  const maxTokens = cfg?.maxTokens ?? DEFAULT_MAX_TOKENS;
  const endpointType = detectEndpointType(baseURL);

  // Only Ollama localhost doesn't need an API key; all other endpoints require one
  const needsApiKey = endpointType !== 'ollama';
  if (needsApiKey && !apiKey && !process.env.ANTHROPIC_API_KEY) return null;

  if (process.env.BM_LOG_LLM) {
    logger.debug('llm', `endpoint=${endpointType} baseURL=${baseURL} model=${model} maxTokens=${maxTokens}`);
  }

  return async (system: string, user: string): Promise<string> => {
    const requestId = crypto.randomUUID().slice(0, 8);
    const startTime = Date.now();

    if (process.env.BM_LOG_LLM) {
      logger.debug('llm', `req=${requestId} model=${model} system=${system.length}ch user=${user.length}ch`);
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await completeByEndpoint({
          endpointType, apiKey, baseURL, model, system, user, maxTokens
        });

        if (process.env.BM_LOG_LLM) {
          logger.debug('llm', `req=${requestId} ok latency=${Date.now() - startTime}ms attempt=${attempt}`);
        }
        return result;
      } catch (error) {
        lastError = error as Error;
        if (process.env.BM_LOG_LLM) {
          logger.warn('llm', `req=${requestId} fail attempt=${attempt}/${MAX_RETRIES} error=${lastError.message}`);
        }
        const isRetryable = isRetryableError(lastError);
        if (!isRetryable || attempt >= MAX_RETRIES) break;

        const delayMs = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        if (process.env.BM_LOG_LLM) {
          logger.debug('llm', `req=${requestId} retrying in ${delayMs}ms...`);
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

// ─── Endpoint Routing ─────────────────────────────────────────

interface CompletionParams {
  endpointType: LlmEndpointType;
  apiKey: string;
  baseURL: string;
  model: string;
  system: string;
  user: string;
  maxTokens: number;
}

/**
 * Route completion to the correct endpoint handler.
 * v1.8.0 F-1: Ollama native /api/chat vs DashScope vs OpenAI-compatible vs Anthropic.
 */
async function completeByEndpoint(p: CompletionParams): Promise<string> {
  switch (p.endpointType) {
  case 'ollama':
    return ollamaNativeComplete(p);
  case 'dashscope':
    return dashscopeComplete(p);
  case 'anthropic':
    return anthropicComplete(p);
  default:
    return openaiComplete(p);
  }
}

// ─── Ollama Native /api/chat ───────────────────────────────────

/**
 * Ollama 原生端点。
 * v1.8.0 F-1: 使用 /api/chat (非 /v1/chat/completions)，
 * think: false 为 Ollama 原生参数（布尔值，非 DashScope 的嵌套对象）。
 * 响应格式: { message: { content: "..." } }。
 */
async function ollamaNativeComplete(p: CompletionParams): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const body: Record<string, unknown> = {
      model: p.model,
      messages: [{ role: 'system', content: p.system }, { role: 'user', content: p.user }],
      stream: false,
      think: false,  // Ollama 原生参数: 关闭思考模式, ~9x speedup
      options: {
        temperature: 0.1,
        num_predict: p.maxTokens,
      },
    };

    const url = p.baseURL.replace(/\/v1\/?$/, '') + '/api/chat';

    if (process.env.BM_LOG_LLM) {
      logger.debug('llm', `ollama url=${url} think=false`);
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'brain-memory/1.0'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Ollama error: ${res.status} - ${errorText}`);
    }

    // Ollama 响应体尾部偶有额外字节，使用 tolerant parse
    const rawText = await res.text();
    const data = tolerantJsonParse(rawText) as Record<string, unknown>;
    const msg = data.message as Record<string, unknown> | undefined;
    return (msg?.content as string) ?? '';
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── DashScope (通义千问) ─────────────────────────────────────

/**
 * DashScope (阿里云) 端点。
 * thinking 关闭方式: body.thinking = { type: 'disabled' } (DashScope 专有格式)。
 */
async function dashscopeComplete(p: CompletionParams): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const body: Record<string, unknown> = {
      model: p.model,
      messages: [{ role: 'system', content: p.system }, { role: 'user', content: p.user }],
      temperature: 0.1,
      max_tokens: p.maxTokens,
      // DashScope 专有格式: 关闭 Qwen thinking 模式
      thinking: { type: 'disabled' },
    };

    const res = await fetch(`${p.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${p.apiKey}`,
        'User-Agent': 'brain-memory/1.0'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`DashScope error: ${res.status} - ${errorText}`);
    }

    const data = await res.json() as Record<string, unknown>;
    const choices = data.choices as Array<Record<string, unknown>> | undefined;
    const msg = choices?.[0]?.message as Record<string, unknown> | undefined;
    return (msg?.content as string) ?? '';
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── OpenAI-compatible ────────────────────────────────────────

async function openaiComplete(p: CompletionParams): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const body: Record<string, unknown> = {
      model: p.model,
      messages: [{ role: 'system', content: p.system }, { role: 'user', content: p.user }],
      temperature: 0.1,
      max_tokens: p.maxTokens,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'brain-memory/1.0'
    };
    if (p.apiKey) {
      headers['Authorization'] = `Bearer ${p.apiKey}`;
    }

    const res = await fetch(`${p.baseURL}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`LLM error: ${res.status} - ${errorText}`);
    }

    const data = await res.json() as Record<string, unknown>;
    const choices = data.choices as Array<Record<string, unknown>> | undefined;
    const msg = choices?.[0]?.message as Record<string, unknown> | undefined;
    return (msg?.content as string) ?? '';
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── Anthropic ────────────────────────────────────────────────

async function anthropicComplete(p: CompletionParams): Promise<string> {
  const apiKey = p.apiKey || process.env.ANTHROPIC_API_KEY || '';
  if (!apiKey) throw new Error('Anthropic requires apiKey or ANTHROPIC_API_KEY');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'User-Agent': 'brain-memory/1.0'
      },
      body: JSON.stringify({
        model: p.model,
        system: p.system,
        messages: [{ role: 'user', content: p.user }],
        max_tokens: p.maxTokens
      }),
      signal: controller.signal
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Anthropic error: ${res.status} - ${errorText}`);
    }

    const data = await res.json() as Record<string, unknown>;
    const content = data.content as Array<Record<string, unknown>> | undefined;
    return (content?.[0]?.text as string) ?? '';
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── JSON Tolerant Parse ──────────────────────────────────────

/**
 * 容错 JSON 解析。处理 Ollama 原生端点响应体尾部额外字节的情况。
 * v1.8.0 F-1: Ollama /api/chat 偶有 trailing bytes → 截取到最后一个 `}`。
 */
function tolerantJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // Try truncating to last '}'
    const lastBrace = raw.lastIndexOf('}');
    if (lastBrace > 0) {
      return JSON.parse(raw.slice(0, lastBrace + 1));
    }
    throw new Error('Failed to parse LLM response JSON');
  }
}
