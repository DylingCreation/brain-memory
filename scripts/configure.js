#!/usr/bin/env node

import fs from 'fs';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function configureProject() {
  console.log('=== brain-memory 交互式配置向导 ===\n');
  
  // 询问是否使用 DashScope API
  const useDashScope = await askQuestion('是否使用 DashScope API? (y/n): ');
  
  let configContent = '';
  
  if (useDashScope.toLowerCase() === 'y') {
    console.log('\n请输入 DashScope 配置信息：');
    const apiKey = await askQuestion('API Key (sk-开头): ');
    const baseURL = await askQuestion('Base URL (默认: https://coding.dashscope.aliyuncs.com/v1): ') || 'https://coding.dashscope.aliyuncs.com/v1';
    const model = await askQuestion('模型名称 (默认: qwen3.6-plus): ') || 'qwen3.6-plus';
    
    configContent = `/**
 * brain-memory 配置文件
 * 由交互式配置向导生成
 */

export const LLM_CONFIG = {
  baseURL: '${baseURL}',
  apiKey: '${apiKey}',
  model: '${model}'
};

export const EMBEDDING_CONFIG = {
  model: 'bge-m3:latest',
  baseURL: 'http://localhost:11434'
};
`;
  } else {
    console.log('\n请输入自定义配置信息：');
    const baseURL = await askQuestion('LLM Base URL: ');
    const apiKey = await askQuestion('LLM API Key: ');
    const model = await askQuestion('LLM Model: ');
    const embedModel = await askQuestion('Embedding Model (默认: bge-m3:latest): ') || 'bge-m3:latest';
    const embedBaseURL = await askQuestion('Embedding Base URL (默认: http://localhost:11434): ') || 'http://localhost:11434';
    
    configContent = `/**
 * brain-memory 配置文件
 * 由交互式配置向导生成
 */

export const LLM_CONFIG = {
  baseURL: '${baseURL}',
  apiKey: '${apiKey}',
  model: '${model}'
};

export const EMBEDDING_CONFIG = {
  model: '${embedModel}',
  baseURL: '${embedBaseURL}'
};
`;
  }
  
  // 写入配置文件
  fs.writeFileSync('config.js', configContent);
  console.log('\n✓ config.js 已生成');
  
  // 生成 .env 文件
  const envContent = `# brain-memory 环境变量配置
DASHSCOPE_API_KEY=${useDashScope.toLowerCase() === 'y' ? await askQuestion('再次输入API Key以写入.env文件: ') : ''}
DASHSCOPE_BASE_URL=${useDashScope.toLowerCase() === 'y' ? 'https://coding.dashscope.aliyuncs.com/v1' : await askQuestion('LLM Base URL for .env: ')}
DASHSCOPE_MODEL=${useDashScope.toLowerCase() === 'y' ? 'qwen3.6-plus' : await askQuestion('LLM Model for .env: ')}
`;
  
  fs.writeFileSync('.env', envContent);
  console.log('✓ .env 文件已生成');
  
  // 生成 llm_client.js
  const llmClientContent = `/**
 * brain-memory LLM客户端
 * 由交互式配置向导生成
 */

import { LLM_CONFIG, EMBEDDING_CONFIG } from './config.js';

export async function createLLMClient() {
  const { baseURL, apiKey, model } = LLM_CONFIG;
  
  const callLLM = async (sysPrompt, userPrompt) => {
    const response = await fetch(\`\${baseURL}/chat/completions\`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': \`Bearer \${apiKey}\`
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
      throw new Error(\`LLM API请求失败: \${response.status} \${await response.text()}\`);
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
      const response = await fetch(\`\${baseURL}/api/embeddings\`, {
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
        throw new Error(\`Embedding API请求失败: \${response.status}\`);
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
`;
  
  fs.writeFileSync('llm_client.js', llmClientContent);
  console.log('✓ llm_client.js 已生成');
  
  console.log('\n=== 配置完成 ===');
  console.log('配置文件已生成，请检查内容是否正确');
  console.log('接下来可以运行: npm run build 或 npm start');
  
  rl.close();
}

configureProject().catch(console.error);