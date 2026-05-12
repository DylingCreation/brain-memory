#!/usr/bin/env node

/**
 * brain-memory — INDEX.md 自动生成脚本 (C-4)
 *
 * 扫描 .devdocs/ 目录树，提取每个留痕文件的标题和元数据，生成 INDEX.md。
 *
 * 用法：node scripts/generate-index.js
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(dirname(fileURLToPath(import.meta.url)));
const DEVDOCS = join(__dirname, ".devdocs");
const INDEX_PATH = join(DEVDOCS, "INDEX.md");

const DIR_META = {
  "版本规划": { label: "版本规划/", desc: "版本目标与执行计划", usage: "每次版本迭代前编写，明确目标、功能、风险、批次。" },
  "项目摸底": { label: "项目摸底/", desc: "版本前全维度评估", usage: "新版本启动前，对当前项目做构建/测试/代码/文档/依赖全维度摸底，以及新功能可行性调查。" },
  "开发记录": { label: "开发记录/", desc: "功能开发过程与验收", usage: "每个功能开发完成后记录，含开发内容、测试、验收、使用示例、后续扩展。" },
  "问题修复": { label: "问题修复/", desc: "Bug 修复与遗留项处理", usage: "问题发现→根因分析→修复措施→验证结果的完整闭环记录。" },
  "技术决策": { label: "技术决策/", desc: "架构与技术方案选择（ADR）", usage: "" },
  "版本复盘": { label: "版本复盘/", desc: "版本结束后经验沉淀", usage: "" },
  "性能基准": { label: "性能基准/", desc: "性能测试数据与趋势", usage: "" },
};

// Parse a trail file: extract title, date, feature ID, and short description
function parseFile(filePath, filename) {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  // Title from first # heading
  let title = "";
  for (const line of lines) {
    if (line.startsWith("# ")) {
      title = line.slice(2).trim();
      break;
    }
  }

  // Date from filename: first YYYY-MM-DD
  const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})/);
  const date = dateMatch ? dateMatch[1] : "";

  // Version from filename
  const verMatch = filename.match(/v(\d+\.\d+\.\d+)/);
  const version = verMatch ? `v${verMatch[1]}` : "";

  // Feature/task ID: look for patterns like F-1, A-2, B-3, B-4, B-5, B-6, B-7, 批次5A, 批次1&2
  let featureId = "";
  const idPatterns = [
    /[ABCF]-\d+/,
    /批次\d+[A-Za-z]*/,
    /批次\d+[&]\d+/,
  ];
  for (const pat of idPatterns) {
    const m = filename.match(pat);
    if (m) { featureId = m[0]; break; }
  }

  // Short description: first meaningful line after metadata table, or title if not available
  let description = title;
  let inTable = false;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("|") && t.includes("字段")) { inTable = true; continue; }
    if (inTable && t.startsWith("|"))  continue; // still in table rows
    if (inTable && t === "") { inTable = false; continue; }
    if (!inTable && t && !t.startsWith("#") && !t.startsWith(">") && !t.startsWith("-") && !t.startsWith("*") && t.length > 5) {
      description = t.slice(0, 100).replace(/\n/g, " ");
      break;
    }
  }

  return { date, version, featureId, title, description, filename };
}

function generate() {
  const dirNames = readdirSync(DEVDOCS, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort();

  let out = [];
  out.push("# brain-memory 内部留痕索引\n");
  out.push("> 本目录为内部工作文档，不进入 git 仓库，不进 npm 包。\n");

  for (const dirName of dirNames) {
    const dirPath = join(DEVDOCS, dirName);
    const meta = DIR_META[dirName];
    if (!meta) continue;

    out.push("---\n");
    out.push(`## ${meta.label} — ${meta.desc}\n`);
    if (meta.usage) out.push(`> ${meta.usage}\n`);

    let files = [];
    try {
      files = readdirSync(dirPath)
        .filter(f => f.endsWith(".md") && f !== "INDEX.md")
        .map(f => parseFile(join(dirPath, f), f));
    } catch { /* dir not found */ }

    if (files.length === 0) {
      out.push("\n*（暂无文件）*\n");
      continue;
    }

    // Sort: by version first (newer first), then by date (newer first)
    files.sort((a, b) => {
      if (a.version && b.version && a.version !== b.version) return b.version.localeCompare(a.version);
      return b.date.localeCompare(a.date);
    });

    out.push("");
    out.push("| 日期 | 编号 | 文件 | 说明 |");
    out.push("|------|------|------|------|");
    for (const f of files) {
      const idStr = f.featureId || "—";
      const desc = f.description || f.title;
      out.push(`| ${f.date} | ${idStr} | [${f.title}](./${dirName}/${f.filename}) | ${desc} |`);
    }
    out.push("");
  }

  // Footer
  out.push("---\n");
  out.push("## 目录命名规则\n");
  out.push("| 目录 | 用途 | 何时写入 |");
  out.push("|------|------|---------|");
  out.push('| `版本规划/` | 版本目标、功能清单、风险项、批次划分 | 版本启动前 |');
  out.push('| `项目摸底/` | 全维度摸底报告、可行性调查 | 版本启动前 |');
  out.push('| `开发记录/` | 功能开发内容、测试、验收 | 功能开发完成后 24h 内 |');
  out.push('| `问题修复/` | Bug 根因、修复措施、验证结果 | 问题修复完成后 24h 内 |');
  out.push('| `技术决策/` | 架构选择、技术选型（ADR 格式） | 技术决策做出后 24h 内 |');
  out.push('| `版本复盘/` | 版本完成情况、亮点、问题、经验 | 版本发布后 48h 内 |');
  out.push('| `性能基准/` | 性能测试数据、对比趋势 | 版本发布前 / 按需测试 |');

  out.push("\n---\n");
  out.push("_索引维护：每次新增留痕文件后运行 `node scripts/generate-index.js` 自动更新_");
  out.push(`_最后更新：${new Date().toISOString().slice(0, 16).replace("T", " ")} · 由 C-4 脚本自动生成_`);

  return out.join("\n");
}

const indexContent = generate();
writeFileSync(INDEX_PATH, indexContent, "utf-8");
console.log(`✅ INDEX.md 已生成 (${indexContent.split("\n").length} 行)`);
