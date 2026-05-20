#!/usr/bin/env node

import fs from 'fs';
import readline from 'readline';
import path from 'path';

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

async function setupOpenClawIntegration() {
  console.log('=== brain-memory OpenClaw 集成配置向导 ===\n');
  
  const openclawPath = await askQuestion('OpenClaw 配置文件路径 (默认: ~/.openclaw/openclaw.json): ') || '~/.openclaw/openclaw.json';
  
  // 处理波浪号
  const resolvedPath = openclawPath.startsWith('~') 
    ? path.join(process.env.HOME, openclawPath.slice(2)) 
    : openclawPath;
  
  if (!fs.existsSync(resolvedPath)) {
    console.log('❌ 找不到配置文件，请确认路径是否正确');
    rl.close();
    return;
  }
  
  // 读取现有配置
  let config = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  
  // 添加 brain-memory 配置
  const llmApiKey = await askQuestion('LLM API Key: ');
  const llmBaseUrl = await askQuestion('LLM Base URL (默认: https://coding.dashscope.aliyuncs.com/v1): ') || 'https://coding.dashscope.aliyuncs.com/v1';
  const llmModel = await askQuestion('LLM Model (默认: qwen3.6-plus): ') || 'qwen3.6-plus';
  
  config.plugins = config.plugins || {};
  config.plugins.entries = config.plugins.entries || {};
  config.plugins.entries['brain-memory'] = {
    enabled: true,
    config: {
      llm: {
        apiKey: llmApiKey,
        baseURL: llmBaseUrl,
        model: llmModel
      },
      embedding: {
        model: 'bge-m3:latest',
        baseURL: 'http://localhost:11434',
        dimensions: 1024
      },
      engine: 'hybrid',
      storage: 'sqlite',
      dbPath: '~/.openclaw/brain-memory.db',
      recallMaxNodes: 6,
      recallMaxDepth: 2,
      decay: {
        enabled: true,
        recencyHalfLifeDays: 30,
        recencyWeight: 0.4,
        frequencyWeight: 0.3,
        intrinsicWeight: 0.3,
        timeDecayHalfLifeDays: 60,
        betaCore: 0.8,
        betaWorking: 1.0,
        betaPeripheral: 1.3,
        coreDecayFloor: 0.9,
        workingDecayFloor: 0.7,
        peripheralDecayFloor: 0.5
      },
      noiseFilter: {
        enabled: true,
        minContentLength: 10
      },
      reflection: {
        enabled: true,
        turnReflection: false,
        sessionReflection: true,
        safetyFilter: true,
        maxInsights: 8,
        importanceBoost: 0.15,
        minConfidence: 0.6
      },
      workingMemory: {
        enabled: true,
        maxTasks: 3,
        maxDecisions: 5,
        maxConstraints: 5
      },
      fusion: {
        enabled: true,
        similarityThreshold: 0.75,
        minNodes: 20,
        minCommunities: 3
      },
      reasoning: {
        enabled: true,
        maxHops: 2,
        maxConclusions: 3,
        minRecallNodes: 3
      }
    }
  };
  
  // 写入配置
  fs.writeFileSync(resolvedPath, JSON.stringify(config, null, 2));
  console.log(`\n✓ OpenClaw 配置已更新: ${resolvedPath}`);
  console.log('请重启 OpenClaw 以使配置生效');
  
  rl.close();
}

setupOpenClawIntegration().catch(console.error);