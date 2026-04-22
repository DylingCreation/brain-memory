/**
 * brain-memory LLM客户端模板
 * 请复制此文件为 llm_client.js 并填入您的实际配置
 * 此文件不应包含任何敏感信息
 */

import { LLM_CONFIG } from './config.js';

export async function createLLMClient() {
  const { baseURL, apiKey, model } = LLM_CONFIG;
  
  const callLLM = async (sysPrompt, userPrompt) => {
    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: userPrompt }
        ],
        enable_thinking: true,
        thinking_budget: 50,
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      throw new Error(`LLM API请求失败: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  };

  return callLLM;
}

export async function createEmbeddingClient() {
  const { baseURL, model } = EMBEDDING_CONFIG;
  
  return async (text) => {
    try {
      const response = await fetch(`${baseURL}/api/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          prompt: text
        })
      });

      if (!response.ok) {
        throw new Error(`Embedding API请求失败: ${response.status}`);
      }

      const data = await response.json();
      return data.embedding || [];
    } catch (error) {
      console.error('Embedding调用失败:', error);
      // 返回一个默认向量作为后备
      return new Array(128).fill(0);
    }
  };
}