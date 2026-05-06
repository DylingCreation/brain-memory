/**
 * brain-memory — Heuristic knowledge extraction (LLM-free fallback)
 *
 * Rule-based extraction using regex patterns, code block parsing, and
 * keyword matching. Provides coarse-grained but functional knowledge
 * extraction when LLM is unavailable. Part of the A-2 three-tier system.
 *
 * @module heuristic
 */

import type { ExtractionResult, MemoryCategory, GraphNodeType } from "../types";
import { normalizeName } from "../store/store";
import { classifyTemporal } from "../temporal/classifier";
import { logger } from "../utils/logger";

// ─── Heuristic rule definitions ─────────────────────────────────────────

interface HeuristicRule {
  /** Pattern to match against message content */
  pattern: RegExp;
  /** Memory category when matched */
  category: MemoryCategory;
  /** Node type when matched */
  nodeType: GraphNodeType;
  /** Name generation function */
  extractName: (text: string, match: RegExpMatchArray) => string;
  /** Description generation function */
  extractDesc: (text: string, match: RegExpMatchArray) => string;
}

interface CommandExtraction {
  nodeType: "SKILL";
  category: MemoryCategory;
  name: string;
  description: string;
  content: string;
}

// 8 类记忆正则规则
const HEURISTIC_RULES: HeuristicRule[] = [
  // profile — 身份/角色/背景
  {
    pattern: /我是(?:一[个位])?(.*?)(?:开发|工程|设计|产品|运营|管理|学生|负责|做)/i,
    category: "profile",
    nodeType: "TASK",
    extractName: (t, m) => `用户角色-${m[1]?.trim() || "profile"}`,
    extractDesc: (t, m) => `用户身份：${m[0]}`,
  },
  // preferences — 偏好
  {
    pattern: /我(不)?喜欢|不要用|别用|我习惯|我偏好|我更(喜欢|倾向)|拒绝(使用)?|禁止/i,
    category: "preferences",
    nodeType: "TASK",
    extractName: (t, m) => `用户偏好-${m[0].slice(0, 10)}`,
    extractDesc: (t, m) => `用户偏好：${m[0]}`,
  },
  // entities — 实体信息
  {
    pattern: /部署在|用的是|版本[\d.]+|运行在|数据库是|系统是|框架是|语言是|http[s]?:\/\/|\//i,
    category: "entities",
    nodeType: "TASK",
    extractName: (t, m) => `实体-${m[0].slice(0, 15)}`,
    extractDesc: (t, m) => `实体信息：${m[0]}`,
  },
  // tasks — 任务/需求
  {
    pattern: /我需要|帮我|请帮我|优化|升级|部署|安装|配置|搭建|实现|开发|创建/i,
    category: "tasks",
    nodeType: "TASK",
    extractName: (t, m) => `任务-${m[0].slice(0, 15)}`,
    extractDesc: (t, m) => `任务需求：${m[0]}`,
  },
  // events — 报错/异常
  {
    pattern: /Error|Exception|崩溃|报错|异常|panic|failed|fatal|SyntaxError|TypeError|ReferenceError|ENOENT|EACCES/i,
    category: "events",
    nodeType: "EVENT",
    extractName: (t, m) => `报错-${m[0].slice(0, 20)}`,
    extractDesc: (t, m) => `异常事件：${m[0]}`,
  },
  // skills — 代码块/命令
  {
    pattern: /```(?:\w+)?\n[\s\S]*?```|npm\s+(?:install|i\s|run|build|start)|docker\s+(?:run|build|compose|exec)|git\s+(?:commit|push|pull|clone|init)|curl\s+|kubectl\s+|pip\s+(?:install|i\s)|cargo\s+(?:build|run|new)|go\s+(?:build|run|mod|get)/i,
    category: "skills",
    nodeType: "SKILL",
    extractName: (t, m) => `技能-${m[0].slice(0, 15)}`,
    extractDesc: (t, m) => `操作技能：${m[0].slice(0, 30)}`,
  },
  // cases — 案例经验
  {
    pattern: /上次|之前|曾经|以前|之前遇到|之前做过|当时|那次|上次部署|上次解决/i,
    category: "cases",
    nodeType: "TASK",
    extractName: (t, m) => `案例-${m[0].slice(0, 15)}`,
    extractDesc: (t, m) => `案例经验：${m[0]}`,
  },
  // patterns — 模式规律
  {
    pattern: /通常|一般|常见|每次.*都|最佳实践|推荐做|建议(先|都|一定)|必须(先|记得)|经验(表明|总结)/i,
    category: "patterns",
    nodeType: "TASK",
    extractName: (t, m) => `模式-${m[0].slice(0, 15)}`,
    extractDesc: (t, m) => `模式规律：${m[0]}`,
  },
];

// ─── Code block extraction ──────────────────────────────────────────────

/**
 * Extract code blocks as SKILL nodes.
 */
function extractCodeBlocks(content: string): CommandExtraction[] {
  const extractions: CommandExtraction[] = [];
  const codeBlockRe = /```(\w+)?\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRe.exec(content)) !== null) {
    const lang = match[1] || "code";
    const code = match[2].trim();
    if (code.length < 5) continue; // skip trivial blocks

    const firstLine = code.split("\n")[0].trim();
    extractions.push({
      nodeType: "SKILL",
      category: "skills",
      name: `代码-${lang}-${firstLine.slice(0, 20)}`,
      description: `${lang} 代码块：${firstLine.slice(0, 40)}`,
      content: code.slice(0, 500),
    });
  }

  return extractions;
}

/**
 * Extract command-line invocations as SKILL nodes.
 */
function extractCommands(content: string): CommandExtraction[] {
  const extractions: CommandExtraction[] = [];
  const commandPatterns = [
    { re: /\b(npm\s+(?:install|i\s|run\s+\S+|build|start|test)[^\n]*)/i, prefix: "npm 命令" },
    { re: /\b(docker\s+(?:run|build|compose|exec|pull|push)[^\n]*)/i, prefix: "Docker 命令" },
    { re: /\b(git\s+(?:commit|push|pull|clone|init|branch|merge|rebase)[^\n]*)/i, prefix: "Git 命令" },
    { re: /\b(curl\s+[^\n]*)/i, prefix: "curl 命令" },
    { re: /\b(kubectl\s+[^\n]*)/i, prefix: "kubectl 命令" },
    { re: /\b(pip\s+(?:install|i\s|freeze|list)[^\n]*)/i, prefix: "pip 命令" },
    { re: /\b(cargo\s+(?:build|run|new|test|add)[^\n]*)/i, prefix: "cargo 命令" },
    { re: /\b(go\s+(?:build|run|mod\s+\S+|get\s+\S+|test)[^\n]*)/i, prefix: "go 命令" },
  ];

  for (const { re, prefix } of commandPatterns) {
    let m: RegExpExecArray | null;
    const globalRe = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    while ((m = globalRe.exec(content)) !== null) {
      const cmd = m[1]?.trim().slice(0, 80);
      if (cmd && cmd.length > 3) {
        extractions.push({
          nodeType: "SKILL",
          category: "skills",
          name: `命令-${cmd.slice(0, 20)}`,
          description: `${prefix}：${cmd}`,
          content: cmd,
        });
      }
    }
  }

  return extractions;
}

// ─── Main heuristic extraction ──────────────────────────────────────────

export interface HeuristicExtractionOptions {
  /** Minimum content length to consider (default: 10) */
  minContentLength?: number;
}

/**
 * Heuristic knowledge extraction — rule-based, LLM-free.
 *
 * Scans message content through 8-category regex patterns and extracts:
 * - Code blocks → SKILL nodes
 * - Command invocations → SKILL nodes
 * - Pattern-matched content → categorized nodes
 *
 * @param messages - Array of conversation messages
 * @param options - Extraction options
 * @returns ExtractionResult with heuristically extracted nodes and empty edges
 */
export function heuristicExtract(
  messages: Array<{ role?: string; content: string }>,
  options: HeuristicExtractionOptions = {},
): ExtractionResult {
  const minLen = options.minContentLength ?? 10;
  const nodes: ExtractionResult["nodes"] = [];
  const seenNames = new Set<string>();

  for (const msg of messages) {
    const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
    if (content.length < minLen) continue;

    // 1. Extract code blocks
    for (const ext of extractCodeBlocks(content)) {
      const name = normalizeName(ext.name);
      if (!seenNames.has(name)) {
        seenNames.add(name);
        nodes.push({
          type: ext.nodeType,
          category: ext.category,
          name: ext.name,
          description: ext.description,
          content: ext.content,
          temporalType: classifyTemporal(ext.content, ext.description),
        });
      }
    }

    // 2. Extract commands
    for (const ext of extractCommands(content)) {
      const name = normalizeName(ext.name);
      if (!seenNames.has(name)) {
        seenNames.add(name);
        nodes.push({
          type: ext.nodeType,
          category: ext.category,
          name: ext.name,
          description: ext.description,
          content: ext.content,
          temporalType: classifyTemporal(ext.content, ext.description),
        });
      }
    }

    // 3. Apply heuristic rules
    for (const rule of HEURISTIC_RULES) {
      const match = rule.pattern.exec(content);
      if (match) {
        const name = rule.extractName(content, match);
        const normalizedName = normalizeName(name);
        if (!seenNames.has(normalizedName)) {
          seenNames.add(normalizedName);
          const desc = rule.extractDesc(content, match);
          nodes.push({
            type: rule.nodeType,
            category: rule.category,
            name,
            description: desc,
            content: content.slice(0, 300),
            temporalType: classifyTemporal(content, desc),
          });
        }
      }
    }
  }

  logger.info("heuristic", `Extracted ${nodes.length} nodes from ${messages.length} messages`);
  return { nodes, edges: [] };
}

/**
 * Compute confidence level of heuristic extraction results.
 *
 * @param result - Extraction result from heuristicExtract
 * @returns confidence level: 'high' | 'medium' | 'low'
 */
export function heuristicConfidence(result: ExtractionResult): "high" | "medium" | "low" {
  const nodeCount = result.nodes.length;
  const categoryCount = new Set(result.nodes.map(n => n.category)).size;

  if (nodeCount >= 3 && categoryCount >= 2) return "high";
  if (nodeCount >= 1) return "medium";
  return "low";
}
