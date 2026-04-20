/**
 * brain-memory — LLM client (fetch-based, no SDK needed)
 *
 * Compatible with any OpenAI-compatible endpoint.
 * Authors: adoresever (graph-memory), brain-memory contributors
 */

export type CompleteFn = (system: string, user: string) => Promise<string>;

export interface LlmConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
}

export function createCompleteFn(cfg?: LlmConfig): CompleteFn | null {
  const apiKey = cfg?.apiKey || process.env.ANTHROPIC_API_KEY || "";
  const baseURL = cfg?.baseURL || "https://api.openai.com/v1";
  const model = cfg?.model || "gpt-4o-mini";

  // No credentials at all — return null so caller can warn
  if (!apiKey) return null;

  // Detect Anthropic vs OpenAI-compatible
  const isAnthropic = baseURL.includes("anthropic");

  return async (system: string, user: string): Promise<string> => {
    if (isAnthropic) {
      return anthropicComplete(system, user, model);
    }
    return openaiComplete(apiKey, baseURL, model, system, user);
  };
}

async function openaiComplete(apiKey: string, baseURL: string, model: string, system: string, user: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
    
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
    
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      const errorMessage = await res.text();
      throw new Error(`LLM error: ${res.status} - ${errorMessage}`);
    }
    
    const data = await res.json() as any;
    return data.choices?.[0]?.message?.content ?? "";
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new Error('LLM request timed out after 60 seconds');
    }
    throw error;
  }
}

async function anthropicComplete(system: string, user: string, model: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("No LLM configured: set config.llm.apiKey or ANTHROPIC_API_KEY");
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
    
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
    
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      const errorMessage = await res.text();
      throw new Error(`Anthropic error: ${res.status} - ${errorMessage}`);
    }
    
    const data = await res.json() as any;
    return data.content?.[0]?.text ?? "";
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new Error('Anthropic request timed out after 60 seconds');
    }
    throw error;
  }
}
