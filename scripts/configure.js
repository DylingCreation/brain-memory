#!/usr/bin/env node

import fs from 'fs';
import readline from 'readline';

// ─── Colors & Symbols ───────────────────────────────────────────

const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  cyan:    '\x1b[36m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  red:     '\x1b[31m',
  white:   '\x1b[37m',
  gray:    '\x1b[90m',
};

const S = {
  step:    '▸',
  done:    '✓',
  warn:    '⚠',
  file:    '📄',
  banner:  '🧠',
  arrow:   '→',
  dot:     '·',
};

// ─── Helpers ────────────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question, def) {
  return new Promise((resolve) => {
    const hint = def ? ` ${C.dim}[${def}]${C.reset}` : '';
    rl.question(`${C.cyan}${S.step}${C.reset} ${question}${hint}  `, (answer) => {
      resolve(answer.trim() || def || '');
    });
  });
}

function banner() {
  console.log('');
  console.log(`${C.bold}${C.cyan}${S.banner}  brain-memory${C.reset}  交互式配置向导`);
  console.log(`${C.dim}   Unified Knowledge Graph + Vector Memory System${C.reset}`);
  console.log(`${C.dim}   v${getVersion()}${C.reset}`);
  console.log(`${C.gray}   ──────────────────────────────────────────${C.reset}`);
  console.log('');
}

function getVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
    return pkg.version;
  } catch { return '?'; }
}

function maskKey(key) {
  if (!key || key.length < 8) return '(empty)';
  return key.slice(0, 6) + '...' + key.slice(-4);
}

// ─── Provider presets ──────────────────────────────────────────

const PROVIDERS = {
  dashscope: {
    label: '阿里云 DashScope',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    embedModel: 'text-embedding-v3',
    embedBaseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  },
  openai: {
    label: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    embedModel: 'text-embedding-3-small',
    embedBaseURL: 'https://api.openai.com/v1',
  },
  ollama: {
    label: 'Ollama (本地)',
    baseURL: 'http://localhost:11434/v1',
    model: 'qwen2.5:7b',
    embedModel: 'nomic-embed-text',
    embedBaseURL: 'http://localhost:11434/api',
    noKey: true,
  },
  custom: {
    label: '自定义 / 其他兼容 OpenAI 的 API',
    baseURL: '',
    model: '',
    embedModel: '',
    embedBaseURL: '',
  },
};

// ─── Main ───────────────────────────────────────────────────────

async function configureProject() {
  banner();

  // Step 1: Provider selection
  console.log(`${C.bold}Step 1/3${C.reset}  选择 LLM 提供商\n`);
  const keys = Object.keys(PROVIDERS);
  keys.forEach((k, i) => {
    const p = PROVIDERS[k];
    console.log(`  ${C.yellow}${i + 1}${C.reset}. ${p.label}`);
  });
  console.log('');

  const choice = await ask('请选择 (1-4)', '1');
  const idx = Math.max(0, Math.min(parseInt(choice) - 1, keys.length - 1));
  const provider = PROVIDERS[keys[idx]];

  console.log(`\n${C.green}${S.done}${C.reset}  已选择: ${provider.label}\n`);

  // Step 2: Collect config
  console.log(`${C.bold}Step 2/3${C.reset}  配置参数\n`);

  let llmKey = '';
  if (!provider.noKey) {
    llmKey = await ask('LLM API Key', '');
    if (!llmKey) {
      console.log(`  ${C.yellow}${S.warn}${C.reset} API Key 为空 — LLM 功能将被禁用，仅使用模拟响应\n`);
    }
  }

  const baseURL = await ask('LLM Base URL', provider.baseURL);
  const model = await ask('LLM Model', provider.model);

  console.log(`\n${C.dim}  ── Embedding 配置 (可选，留空则禁用向量检索) ──${C.reset}\n`);

  let embedKey = '';
  if (!provider.noKey && llmKey) {
    const reuse = await ask('复用 LLM 的 API Key？', 'y');
    if (reuse.toLowerCase().startsWith('y')) {
      embedKey = llmKey;
    } else {
      embedKey = await ask('Embedding API Key', '');
    }
  }

  const embedBaseURL = await ask('Embedding Base URL', provider.embedBaseURL);
  const embedModel = await ask('Embedding Model', provider.embedModel);

  console.log(`\n${C.green}${S.done}${C.reset}  参数收集完毕\n`);

  // Step 3: Review & confirm
  console.log(`${C.bold}Step 3/3${C.reset}  配置预览\n`);
  console.log(`${C.gray}  ┌─────────────────────────────────────────${C.reset}`);
  console.log(`${C.gray}  │${C.reset}  LLM`);
  console.log(`${C.gray}  │${C.reset}    Key:     ${llmKey ? maskKey(llmKey) : C.yellow + '(未配置)' + C.reset}`);
  console.log(`${C.gray}  │${C.reset}    Base:    ${baseURL || C.yellow + '(未配置)' + C.reset}`);
  console.log(`${C.gray}  │${C.reset}    Model:   ${model || C.yellow + '(未配置)' + C.reset}`);
  console.log(`${C.gray}  │${C.reset}`);
  console.log(`${C.gray}  │${C.reset}  Embedding`);
  console.log(`${C.gray}  │${C.reset}    Key:     ${embedKey ? maskKey(embedKey) : C.dim + '(同 LLM 或 未配置)' + C.reset}`);
  console.log(`${C.gray}  │${C.reset}    Base:    ${embedBaseURL || C.dim + '(未配置)' + C.reset}`);
  console.log(`${C.gray}  │${C.reset}    Model:   ${embedModel || C.dim + '(未配置)' + C.reset}`);
  console.log(`${C.gray}  └─────────────────────────────────────────${C.reset}`);
  console.log('');

  const confirm = await ask('确认写入配置文件？', 'y');
  if (!confirm.toLowerCase().startsWith('y')) {
    console.log(`\n${C.yellow}${S.warn}${C.reset}  已取消，未写入任何文件\n`);
    rl.close();
    return;
  }

  // ─── Generate files ─────────────────────────────────────────

  // config.js
  const configJs = generateConfigJs(llmKey, baseURL, model, embedKey, embedBaseURL, embedModel);
  fs.writeFileSync('config.js', configJs);

  // .env
  const envContent = generateEnv(llmKey, baseURL, model, embedKey, embedBaseURL, embedModel);
  fs.writeFileSync('.env', envContent);

  // ─── Summary ────────────────────────────────────────────────

  console.log('');
  console.log(`${C.green}${S.done}${C.reset}  配置已写入：`);
  console.log(`  ${S.file}  ${C.bold}config.js${C.reset}        ${C.dim}— 主配置文件${C.reset}`);
  console.log(`  ${S.file}  ${C.bold}.env${C.reset}             ${C.dim}— 环境变量（已在 .gitignore 中）${C.reset}`);
  console.log('');
  console.log(`${C.gray}  下一步：${C.reset}`);
  console.log(`  ${C.cyan}${S.arrow}${C.reset}  npm run build        ${C.dim}编译 TypeScript${C.reset}`);
  console.log(`  ${C.cyan}${S.arrow}${C.reset}  npm run setup-openclaw ${C.dim}写入 OpenClaw 插件配置${C.reset}`);
  console.log(`  ${C.cyan}${S.arrow}${C.reset}  npm start            ${C.dim}启动服务${C.reset}`);
  console.log('');

  rl.close();
}

// ─── Templates ──────────────────────────────────────────────────

function generateConfigJs(llmKey, baseURL, model, embedKey, embedBaseURL, embedModel) {
  const llmBlock = llmKey || baseURL
    ? `export const LLM_CONFIG = {
  baseURL: '${baseURL}',
  apiKey: '${llmKey}',
  model: '${model}'
};`
    : `export const LLM_CONFIG = {
  // apiKey: 'your-api-key-here',
  // baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  // model: 'qwen-plus'
};`;

  const embedBlock = embedBaseURL || embedModel
    ? `export const EMBEDDING_CONFIG = {
  baseURL: '${embedBaseURL}',
  apiKey: '${embedKey}',
  model: '${embedModel}'
};`
    : `export const EMBEDDING_CONFIG = {
  // baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  // apiKey: 'your-api-key-here',
  // model: 'text-embedding-v3'
};`;

  return `/**
 * brain-memory 配置文件
 * 由交互式配置向导自动生成 — ${new Date().toISOString().slice(0, 10)}
 *
 * 此文件包含敏感信息，已被 .gitignore 排除，请勿提交到版本控制。
 */

${llmBlock}

${embedBlock}
`;
}

function generateEnv(llmKey, baseURL, model, embedKey, embedBaseURL, embedModel) {
  return `# brain-memory 环境变量
# 由交互式配置向导自动生成 — ${new Date().toISOString().slice(0, 10)}

LLM_API_KEY=${llmKey}
LLM_BASE_URL=${baseURL}
LLM_MODEL=${model}

EMBEDDING_API_KEY=${embedKey}
EMBEDDING_BASE_URL=${embedBaseURL}
EMBEDDING_MODEL=${embedModel}
`;
}

// ─── Run ────────────────────────────────────────────────────────

configureProject().catch((err) => {
  console.error(`\n${C.red}${S.warn} 配置过程出错:${C.reset}`, err.message);
  process.exit(1);
});
