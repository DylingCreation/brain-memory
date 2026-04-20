#!/usr/bin/env node
/**
 * brain-memory — 首次配置向导
 *
 * 用法：
 *   node scripts/setup.js          # 交互式引导 + 自动写入 openclaw.json
 *   node scripts/setup.js --dry    # 仅打印配置预览，不写入
 *
 * 用户只需提供一次 API Key，脚本自动生成并写入完整配置到 OpenClaw 配置文件中。
 */

import { createInterface } from "readline";
import { stdin, stdout } from "process";
import { readFileSync, existsSync, writeFileSync, copyFileSync, statSync, chmodSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// ─── 预设方案 ────────────────────────────────────────────────

const PRESETS = [
  {
    name: "DashScope（通义千问）",
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    llmModel: "qwen3.6-plus",
    embedModel: "text-embedding-v3",
    embedDims: 512,
    hint: "适合国内用户，通义千问模型，性价比高",
  },
  {
    name: "OpenAI",
    baseURL: "https://api.openai.com/v1",
    llmModel: "gpt-4o-mini",
    embedModel: "text-embedding-3-small",
    embedDims: 1536,
    hint: "OpenAI 官方端点",
  },
  {
    name: "SiliconFlow（硅基流动）",
    baseURL: "https://api.siliconflow.cn/v1",
    llmModel: "Qwen/Qwen2.5-72B-Instruct",
    embedModel: "BAAI/bge-m3",
    embedDims: 1024,
    hint: "国内平台，支持多种开源模型",
  },
  {
    name: "自定义",
    baseURL: "",
    llmModel: "",
    embedModel: "",
    embedDims: 512,
    hint: "手动填写所有参数",
  },
];

// ─── 交互工具 ────────────────────────────────────────────────

const rl = createInterface({ input: stdin, output: stdout });

function ask(question, def) {
  return new Promise((resolve) => {
    const prompt = def ? `${question} [${def}]: ` : `${question}: `;
    rl.question(prompt, (answer) => {
      resolve(answer.trim() || def || "");
    });
  });
}

async function selectPreset() {
  console.log("\n📋 请选择你的 API 提供商：\n");
  for (let i = 0; i < PRESETS.length; i++) {
    const p = PRESETS[i];
    console.log(`  ${i + 1}. ${p.name} — ${p.hint}`);
  }
  console.log();

  while (true) {
    const choice = await ask("请选择 (1-4)", "1");
    const idx = parseInt(choice) - 1;
    if (idx >= 0 && idx < PRESETS.length) return PRESETS[idx];
    console.log("  ❌ 请输入 1-4 之间的数字");
  }
}

// ─── 生成 brain-memory 插件配置 ──────────────────────────────

function generateBrainMemoryConfig(preset, apiKey, overrides) {
  const llmBaseURL = overrides?.baseURL || preset.baseURL;
  const llmModel = overrides?.llmModel || preset.llmModel || "gpt-4o-mini";
  const embedModel = overrides?.embedModel || preset.embedModel || "text-embedding-3-small";
  const embedDims = overrides?.embedDims || preset.embedDims || 512;

  return {
    engine: "graph",
    storage: "sqlite",
    llm: {
      apiKey: apiKey,
      baseURL: llmBaseURL,
      model: llmModel,
    },
    embedding: {
      apiKey: apiKey,
      baseURL: llmBaseURL,
      model: embedModel,
      dimensions: embedDims,
    },
    decay: {
      enabled: true,
      recencyHalfLifeDays: 30,
      timeDecayHalfLifeDays: 60,
    },
    noiseFilter: {
      enabled: true,
      minContentLength: 10,
    },
    reflection: {
      enabled: true,
      turnReflection: false,
      sessionReflection: true,
      safetyFilter: true,
      maxInsights: 8,
      importanceBoost: 0.15,
      minConfidence: 0.6,
    },
    workingMemory: {
      enabled: true,
      maxTasks: 3,
      maxDecisions: 5,
      maxConstraints: 5,
    },
    fusion: {
      enabled: true,
      similarityThreshold: 0.75,
      minNodes: 20,
      minCommunities: 3,
    },
    reasoning: {
      enabled: true,
      maxHops: 2,
      maxConclusions: 3,
      minRecallNodes: 3,
    },
  };
}

// ─── 写入 openclaw.json ─────────────────────────────────────

function findOpenclawConfig() {
  // openclaw.json is the only supported config format
  const candidates = [
    join(homedir(), ".openclaw", "openclaw.json"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

function injectPluginConfig(configPath, pluginConfig) {
  // Backup first
  const backupPath = `${configPath}.bak.${Date.now()}`;
  copyFileSync(configPath, backupPath);

  const raw = readFileSync(configPath, "utf-8");
  let config;
  try {
    config = JSON.parse(raw);
  } catch (err) {
    // Restore backup on parse failure (shouldn't happen since we just copied)
    throw new Error(`配置文件 JSON 解析失败：${err.message}\n文件：${configPath}\n已保留备份：${backupPath}`);
  }

  // Check if brain-memory config already exists
  const existing = config.plugins?.entries?.["brain-memory"];
  if (existing) {
    console.log("\n⚠️  检测到已存在的 brain-memory 配置：");
    console.log(`   ${JSON.stringify(existing, null, 2).slice(0, 200)}...`);
  }

  if (!config.plugins) config.plugins = {};
  if (!config.plugins.entries) config.plugins.entries = {};

  config.plugins.entries["brain-memory"] = {
    enabled: true,
    config: pluginConfig,
  };

  // Preserve original file permissions (typically 0o600 for config with API keys)
  let originalMode = null;
  try {
    originalMode = statSync(configPath).mode;
  } catch { /* ignore */ }

  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");

  // Restore original permissions if we captured them
  if (originalMode !== null) {
    try { chmodSync(configPath, originalMode); } catch { /* ignore */ }
  }

  return backupPath;
}

// ─── 主流程 ──────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const isDry = args.includes("--dry") || args.includes("-d");

  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║       brain-memory · 首次配置向导 ⌨️            ║");
  console.log("╚══════════════════════════════════════════════════╝");

  const preset = await selectPreset();
  console.log(`\n✅ 已选择：${preset.name}`);

  let apiKey = "";
  while (!apiKey) {
    apiKey = await ask("\n请输入你的 API Key");
    if (!apiKey) console.log("  ❌ API Key 不能为空");
  }

  let customBaseURL = "";
  if (preset.name === "自定义") {
    while (!customBaseURL) {
      customBaseURL = await ask("请输入 BaseURL（如 https://api.openai.com/v1）");
      if (!customBaseURL) console.log("  ❌ BaseURL 不能为空");
    }
  } else if (preset.baseURL) {
    customBaseURL = await ask(`BaseURL 已预填为 ${preset.baseURL}，是否需要修改？`, "");
  }

  let customLlmModel = "";
  if (preset.name === "自定义") {
    customLlmModel = await ask("请输入 LLM 模型名（如 gpt-4o-mini）");
  } else if (preset.llmModel) {
    customLlmModel = await ask(`LLM 模型已预填为 ${preset.llmModel}，是否需要修改？`, "");
  }

  let customEmbedModel = "";
  if (preset.name === "自定义") {
    customEmbedModel = await ask("请输入 Embedding 模型名（如 text-embedding-3-small）");
  } else if (preset.embedModel) {
    customEmbedModel = await ask(`Embedding 模型已预填为 ${preset.embedModel}，是否需要修改？`, "");
  }

  const overrides = {};
  if (customBaseURL) overrides.baseURL = customBaseURL;
  if (customLlmModel) overrides.llmModel = customLlmModel;
  if (customEmbedModel) overrides.embedModel = customEmbedModel;

  const pluginConfig = generateBrainMemoryConfig(preset, apiKey, overrides);

  console.log("\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📋 生成的配置：\n");
  console.log(JSON.stringify({ "brain-memory": { enabled: true, config: pluginConfig } }, null, 2));
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  if (!isDry) {
    const configPath = findOpenclawConfig();

    if (!configPath) {
      console.log("\n❌ 未找到 OpenClaw 配置文件 (~/.openclaw/openclaw.json)");
      console.log("   请确认 OpenClaw 已正确安装。");
    } else {
      console.log(`\n📁 将写入：${configPath}`);
      const confirm = await ask("\n确认写入？(y/n)", "y");
      if (confirm.toLowerCase() === "y" || confirm === "") {
        try {
          const backupPath = injectPluginConfig(configPath, pluginConfig);
          console.log("\n✅ 配置已写入！");
          console.log(`   备份文件：${backupPath}`);
          console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
          console.log("🔄 重启 OpenClaw 使配置生效：");
          console.log("   openclaw gateway restart");
          console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        } catch (err) {
          console.error(`\n❌ 写入失败：${err.message}`);
        }
      } else {
        console.log("\n❌ 已取消。配置未写入任何文件。");
      }
    }

    console.log("\n💡 后续个性化调整（直接修改 openclaw.json 中 brain-memory.config）：");
    console.log();
    console.log('  // 调整召回节点数');
    console.log('  "recallMaxNodes": 10');
    console.log();
    console.log('  // 关闭衰减');
    console.log('  "decay": { "enabled": false }');
    console.log();
    console.log('  // 开启轮次反思（会增加 LLM 调用）');
    console.log('  "reflection": { "turnReflection": true }');
    console.log();
    console.log('  // 关闭知识融合');
    console.log('  "fusion": { "enabled": false }');
    console.log();
    console.log('  // 切换 Embedding 为 OpenAI');
    console.log('  "embedding": {');
    console.log('    "apiKey": "sk-...",');
    console.log('    "baseURL": "https://api.openai.com/v1",');
    console.log('    "model": "text-embedding-3-small"');
    console.log('  }');
  } else {
    console.log("\n💡 Dry run — 配置未写入。运行 node scripts/setup.js 自动写入。");
  }
}

main()
  .catch(console.error)
  .finally(() => rl.close());
