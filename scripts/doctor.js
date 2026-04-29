#!/usr/bin/env node

/**
 * brain-memory — CLI 诊断工具
 *
 * 用法：npx brain-memory doctor
 *
 * 检查项：
 * 1. 环境 — Node.js 版本
 * 2. 依赖 — npm 包安装状态、关键依赖版本
 * 3. 配置 — config.js、环境变量（LLM/Embedding/日志级别）
 * 4. 数据库 — 连接状态、Schema 版本、文件大小、表统计
 */

import { execSync } from "child_process";
import { existsSync, readFileSync, statSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ─── Colors & Symbols ───────────────────────────────────────────

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
};

const S = {
  ok: "✓",
  warn: "⚠",
  fail: "✗",
  arrow: "→",
  dot: "·",
};

function ok(msg) { console.log(`  ${C.green}${S.ok}${C.reset} ${msg}`); }
function warn(msg) { console.log(`  ${C.yellow}${S.warn}${C.reset} ${msg}`); }
function fail(msg) { console.log(`  ${C.red}${S.fail}${C.reset} ${msg}`); }
function section(title) { console.log(`\n${C.bold}${C.cyan}${S.arrow} ${title}${C.reset}`); }
function header() {
  console.log(`\n${C.bold}${C.cyan}🧠 brain-memory 诊断报告${C.reset}`);
  console.log(`${C.gray}${"─".repeat(50)}${C.reset}`);
}
function footer(totalOk, totalWarn, totalFail) {
  console.log(`\n${C.gray}${"─".repeat(50)}${C.reset}`);
  const summary = [];
  if (totalOk) summary.push(`${C.green}${totalOk} 通过${C.reset}`);
  if (totalWarn) summary.push(`${C.yellow}${totalWarn} 警告${C.reset}`);
  if (totalFail) summary.push(`${C.red}${totalFail} 失败${C.reset}`);
  console.log(`${C.bold}结果：${summary.join(" / ")}${C.reset}`);
  if (totalFail > 0) {
    console.log(`\n${C.yellow}建议：修复标记为 ${C.red}${S.fail}${C.yellow} 的项后重新运行诊断${C.reset}`);
  }
  console.log();
}

// ─── State ──────────────────────────────────────────────────────

let totalOk = 0;
let totalWarn = 0;
let totalFail = 0;

function check(pass, msg) {
  if (pass === "ok") { ok(msg); totalOk++; }
  else if (pass === "warn") { warn(msg); totalWarn++; }
  else { fail(msg); totalFail++; }
}

// ─── 1. 环境检查 ────────────────────────────────────────────────

function checkEnvironment() {
  section("环境检查");

  // Node.js 版本
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1), 10);
  if (major >= 20) {
    check("ok", `Node.js ${nodeVersion}（≥ 20）`);
  } else {
    check("fail", `Node.js ${nodeVersion}（需要 ≥ 20，当前 ${major}）`);
  }
}

// ─── 2. 依赖检查 ────────────────────────────────────────────────

async function checkDependencies() {
  section("依赖检查");

  const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const pkgJsonPath = join(projectRoot, "package.json");

  if (!existsSync(pkgJsonPath)) {
    check("fail", "package.json 不存在");
    return;
  }

  const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));

  // npm 包安装状态
  const nodeModules = join(projectRoot, "node_modules");
  if (!existsSync(nodeModules)) {
    check("fail", "node_modules 不存在，请运行 npm install");
    return;
  }

  // 关键依赖检查
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const criticalDeps = ["@photostructure/sqlite"];

  for (const dep of criticalDeps) {
    const depPath = join(nodeModules, dep);
    if (existsSync(depPath)) {
      try {
        const depPkg = JSON.parse(readFileSync(join(depPath, "package.json"), "utf-8"));
        check("ok", `${dep} ${depPkg.version}（已安装）`);
      } catch {
        check("warn", `${dep}（目录存在但无法读取版本）`);
      }
    } else {
      check("fail", `${dep}（未安装，需 npm install）`);
    }
  }

  // FTS5 扩展检查（SQLite 编译时内置）
  try {
    const sqlite = await import("@photostructure/sqlite");
    const { DatabaseSync } = sqlite;
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE VIRTUAL TABLE test_fts USING fts5(content)");
    db.close();
    check("ok", "SQLite FTS5 扩展可用");
  } catch (e) {
    check("fail", `SQLite FTS5 扩展不可用: ${e.message}`);
  }
}

// ─── 3. 配置检查 ────────────────────────────────────────────────

async function checkConfiguration() {
  section("配置检查");

  const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

  // config.js 存在性
  const configPath = join(projectRoot, "config.js");
  if (existsSync(configPath)) {
    try {
      // 动态导入检查结构
      const configModule = await import(configPath);
      const hasLlm = configModule.LLM_CONFIG &&
        configModule.LLM_CONFIG.baseURL !== "YOUR_LLM_BASE_URL_HERE" &&
        configModule.LLM_CONFIG.apiKey !== "YOUR_API_KEY_HERE";
      const hasEmbed = configModule.EMBEDDING_CONFIG &&
        configModule.EMBEDDING_CONFIG.model !== "YOUR_EMBEDDING_MODEL_HERE";

      if (hasLlm) {
        check("ok", "LLM 配置已设置（model: " + configModule.LLM_CONFIG.model + "）");
      } else {
        check("warn", "LLM 配置未设置（使用模板默认值，LLM 功能将降级跳过）");
      }

      if (hasEmbed) {
        check("ok", "Embedding 配置已设置（model: " + configModule.EMBEDDING_CONFIG.model + "）");
      } else {
        check("warn", "Embedding 配置未设置（向量功能不可用）");
      }
    } catch (e) {
      check("fail", "config.js 存在但无法加载: " + e.message);
    }
  } else {
    check("warn", "config.js 不存在（复制 config.template.js 为 config.js 并填入配置）");
  }

  // 环境变量检查
  const envVars = [
    { name: "ANTHROPIC_API_KEY", required: false, desc: "LLM API 密钥" },
    { name: "BM_LOG_LEVEL", required: false, desc: "日志级别" },
    { name: "BM_DEBUG", required: false, desc: "调试模式（已废弃，使用 BM_LOG_LEVEL=debug）" },
    { name: "BM_LOG_LLM", required: false, desc: "LLM 请求日志" },
  ];

  for (const v of envVars) {
    const val = process.env[v.name];
    if (val) {
      if (v.name === "BM_DEBUG") {
        check("warn", `环境变量 ${v.name}=1（已废弃，请使用 BM_LOG_LEVEL=debug）`);
      } else if (v.name === "ANTHROPIC_API_KEY") {
        check("ok", `环境变量 ${v.name} 已设置（${val.slice(0, 6)}...${val.slice(-4)}）`);
      } else {
        check("ok", `环境变量 ${v.name}=${val}`);
      }
    } else {
      check("warn", `环境变量 ${v.name} 未设置`);
    }
  }
}

// ─── 4. 数据库检查 ──────────────────────────────────────────────

async function checkDatabase() {
  section("数据库检查");

  // 默认 DB 路径
  const defaultDbPath = join(homedir(), ".openclaw", "brain-memory.db");
  const dbExists = existsSync(defaultDbPath);

  if (!dbExists) {
    check("warn", `数据库文件不存在（默认路径: ${defaultDbPath}）`);
    check("ok", "首次运行时会自动创建数据库");
    return;
  }

  check("ok", `数据库文件存在: ${defaultDbPath}`);

  // 文件大小
  try {
    const stats = statSync(defaultDbPath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    if (stats.size < 100 * 1024 * 1024) { // < 100MB
      check("ok", `数据库大小: ${sizeMB} MB`);
    } else {
      check("warn", `数据库大小: ${sizeMB} MB（建议关注性能，可运行 getStats() 查看节点数）`);
    }
  } catch (e) {
    check("fail", `无法读取数据库大小: ${e.message}`);
  }

  // WAL/SHM 残留检查
  const walPath = defaultDbPath + "-wal";
  const shmPath = defaultDbPath + "-shm";
  if (existsSync(walPath)) {
    const walStats = statSync(walPath);
    check("warn", `WAL 文件存在 (${(walStats.size / 1024).toFixed(0)} KB)，数据库可能未正常关闭`);
  } else {
    check("ok", "WAL 文件不存在（正常）");
  }
  if (existsSync(shmPath)) {
    check("warn", "SHM 文件存在，数据库可能未正常关闭");
  } else {
    check("ok", "SHM 文件不存在（正常）");
  }

  // 打开数据库读取统计
  try {
    const sqlite = await import("@photostructure/sqlite");
    const { DatabaseSync } = sqlite;
    const db = new DatabaseSync(defaultDbPath);

    // Schema 版本
    try {
      const row = db.prepare("SELECT value FROM bm_meta WHERE key = 'schema_version'").get();
      const version = row ? parseInt(row.value, 10) : 0;
      if (version >= 1) {
        check("ok", `Schema 版本: ${version}`);
      } else {
        check("warn", "Schema 版本: 0（未运行迁移，旧版数据库）");
      }
    } catch {
      check("warn", "Schema 版本: 无法读取（bm_meta 表不存在）");
    }

    // 表统计
    const tables = [
      { name: "bm_nodes", label: "节点" },
      { name: "bm_edges", label: "边" },
      { name: "bm_vectors", label: "向量" },
      { name: "bm_messages", label: "消息" },
      { name: "bm_communities", label: "社区" },
    ];

    for (const t of tables) {
      try {
        const row = db.prepare(`SELECT COUNT(*) as cnt FROM ${t.name}`).get();
        if (row.cnt > 0) {
          check("ok", `${t.label}: ${row.cnt} 条`);
        } else {
          check("warn", `${t.label}: 0 条（空表）`);
        }
      } catch {
        check("fail", `${t.label}: 表不存在或查询失败`);
      }
    }

    db.close();
  } catch (e) {
    check("fail", `无法打开数据库: ${e.message}`);
  }
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  header();
  checkEnvironment();
  await checkDependencies();
  await checkConfiguration();
  await checkDatabase();
  footer(totalOk, totalWarn, totalFail);
}

main().catch((e) => {
  console.error(`${C.red}${S.fail} 诊断过程出错: ${e.message}${C.reset}`);
  process.exit(1);
});
