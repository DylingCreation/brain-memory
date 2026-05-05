/**
 * brain-memory — Knowledge extraction from conversations
 *
 * Unified: graph triple extraction + mlp's smart extraction patterns.
 * Supports 8-category memory system with noise filtering and temporal classification.
 * Authors: adoresever (graph-memory), win4r (memory-lancedb-pro), brain-memory contributors
 */

import type { BmConfig, ExtractionResult, FinalizeResult, MemoryCategory, MEMORY_CATEGORIES, EdgeType, GraphNodeType } from "../types";
import { EDGE_FROM_CONSTRAINT, EDGE_TO_CONSTRAINT } from "../types";
import type { CompleteFn } from "../engine/llm";
import { isNoise } from "../noise/filter";
import { classifyTemporal } from "../temporal/classifier";
import { normalizeName } from "../store/store";
import { extractJson, extractJsonTolerant } from "../utils/json";
import { truncate } from "../utils/truncate";
import { logger } from "../utils/logger";

const VALID_NODE_TYPES = new Set(["TASK", "SKILL", "EVENT"]);
const VALID_CATEGORIES = new Set(["profile", "preferences", "entities", "events", "tasks", "skills", "cases", "patterns"]);
// 从 types.ts 统一导入，不维护本地副本
const VALID_EDGE_TYPES = new Set<EdgeType>(Object.keys(EDGE_FROM_CONSTRAINT) as EdgeType[]);

const EXTRACT_SYS = `你是 brain-memory 知识提取引擎，从 AI Agent 对话中提取结构化知识。
输出严格 JSON：{"nodes":[...],"edges":[...]}，不包含任何额外文字。
## 格式要求（重要）
- 使用双引号，不要使用单引号
- 不要有尾随逗号（如 {"a":1,} 是错误的）
- 所有字符串值必须用双引号包裹

## 节点提取（3 种图节点类型 × 8 类记忆分类）

图节点类型（type）：
   - TASK：具体任务或讨论分析主题
   - SKILL：可复用操作技能，有工具/命令/API
   - EVENT：报错或异常

记忆分类（category）：
   - profile：用户画像（身份、角色、背景）
   - preferences：用户偏好（喜欢/讨厌/习惯）
   - entities：实体信息（项目、工具、环境的客观事实）
   - events：报错/异常（发生过的问题）
   - tasks：完成任务（做过什么、讨论过什么）
   - skills：可复用技能（怎么做事）
   - cases：案例经验（具体场景的成功/失败案例）
   - patterns：模式规律（跨案例的抽象规律）

每个节点：type, category, name, description, content

## 边提取（11 种，严格方向约束）

   **基础 5 种（v0.1.x）：**
   USED_SKILL: TASK → SKILL
   SOLVED_BY: EVENT → SKILL 或 SKILL → SKILL
   REQUIRES: SKILL → SKILL
   PATCHES: SKILL → SKILL（新→旧）
   CONFLICTS_WITH: SKILL ↔ SKILL

   **扩展 6 种（v1.0.0 新增）：**
   HAS_PREFERENCE: TASK/SKILL/EVENT → TASK/SKILL/EVENT（关联用户偏好）
   BELONGS_TO: TASK/SKILL/EVENT → TASK/SKILL/EVENT（归属关系）
   LEARNED_FROM: SKILL → SKILL（从某经验学习）
   EXEMPLIFIES: SKILL → SKILL（某案例是技能的示例）
   RELATED_TO: TASK/SKILL/EVENT ↔ TASK/SKILL/EVENT（通用关联）
   OBSERVED_IN: SKILL/EVENT → SKILL/EVENT（在某事件/场景中观察到）

   决策树：
   a. from=TASK, to=SKILL → USED_SKILL
   b. from=EVENT, to=SKILL → SOLVED_BY
   c. from=SKILL, to=SKILL → 选 SOLVED_BY/REQUIRES/PATCHES/CONFLICTS_WITH/LEARNED_FROM/EXEMPLIFIES
   d. 涉及用户偏好/归属/关联 → 选 HAS_PREFERENCE/BELONGS_TO/RELATED_TO/OBSERVED_IN
   e. 不符合以上规则的不提取

## 策略
讨论/分析/对比都提取。用户偏好、身份、项目信息都提取。只有纯粹寒暄不提取。

## 角色处理
对话包含 [USER] 和 [ASSISTANT] 两种角色：
- [USER] 消息：提取用户的意图、问题、偏好、项目信息
- [ASSISTANT] 消息：提取 AI 给出的建议、推荐、解决方案、代码示例、工具推荐
  - AI 推荐的工具/书籍/资源 → entities 或 skills
  - AI 给出的操作建议 → tasks（描述建议内容）
  - AI 解释的概念/方法 → skills（可复用知识）
  - AI 提供的代码/命令 → skills（包含具体操作）`;

const FINALIZE_SYS = `你是图谱整理引擎，session 结束前最终审查。
1. EVENT 升级为 SKILL（通用复用价值）
2. 补充遗漏关系
3. 标记失效节点
返回 JSON：{"promotedSkills":[...],"newEdges":[...],"invalidations":[]}`;

// Default category mapping for graph types (used when LLM doesn't provide category)
const DEFAULT_CATEGORY: Record<string, MemoryCategory> = {
  TASK: "tasks",
  SKILL: "skills",
  EVENT: "events",
};

export class Extractor {
  constructor(private cfg: BmConfig, private llm: CompleteFn | null) {}

  async extract(params: { messages: any[]; existingNames: string[] }): Promise<ExtractionResult> {
    // Graceful degradation: skip extraction when LLM is not available
    if (!this.llm) {
      logger.warn("extract", "Extraction skipped — LLM not configured");
      return { nodes: [], edges: [] };
    }

    const maxRetries = 2;
    const noiseCfg = this.cfg.noiseFilter;
    const filtered = noiseCfg.enabled
      ? params.messages.filter(m => {
          const text = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
          return !isNoise(text, noiseCfg);
        })
      : params.messages;

    if (filtered.length === 0) return { nodes: [], edges: [] };

    const userPrompt = `<Existing Nodes>\n${params.existingNames.join(", ") || "（无）"}\n\n<Conversation>\n${
      filtered
        .map(m => `[${(m.role ?? "?").toUpperCase()} t=${m.turn_index ?? 0}]\n${
          truncate(String(typeof m.content === "string" ? m.content : JSON.stringify(m.content)), 1200, "extract")
        }`).join("\n\n---\n\n")
    }`;

    let raw = "";
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt === 0) {
          raw = await this.llm(EXTRACT_SYS, userPrompt);
        } else {
          const fixPrompt = `上次输出 JSON 解析失败。请修正格式错误（确保双引号、无尾随逗号、完整闭合）并重新输出。原始对话：\n\n${userPrompt}`;
          raw = await this.llm(EXTRACT_SYS, fixPrompt);
        }
        const result = this.parseExtract(raw);
        if (result.nodes.length > 0 || result.edges.length > 0) {
          return result;
        }
        return result;
      } catch (error) {
        if (attempt < maxRetries) {
          logger.warn("extract", `Extraction parse failed (attempt ${attempt + 1}/${maxRetries}), retrying...`);
          continue;
        }
        logger.warn("extract", "All retries failed, attempting tolerant extraction...");
        const tolerantResult = this.parseExtractTolerant(raw);
        if (tolerantResult) return tolerantResult;
        logger.error("extract", "Failed to extract knowledge after all attempts:", error);
        return { nodes: [], edges: [] };
      }
    }
    return { nodes: [], edges: [] };
  }

  async finalize(params: { sessionNodes: any[]; graphSummary: string }): Promise<FinalizeResult> {
    try {
      const raw = await this.llm(
        FINALIZE_SYS,
        `<Session Nodes>\n${JSON.stringify(params.sessionNodes.map(n => ({
          id: n.id, type: n.type, name: n.name, description: n.description, v: n.validatedCount
        })), null, 2)}\n\n<Graph Summary>\n${params.graphSummary}`,
      );
      return this.parseFinalize(raw, params.sessionNodes);
    } catch (error) {
      logger.error("extract", "Failed to finalize extraction:", error);
      return { newEdges: [], promotedSkills: [], invalidations: [] };
    }
  }

  private parseExtract(raw: string): ExtractionResult {
    try {
      const json = extractJson(raw);
      const p = JSON.parse(json);

      const nodes = (p.nodes ?? []).filter((n: any) => {
        if (!n.name || !n.type || !n.content) return false;
        if (!VALID_NODE_TYPES.has(n.type)) return false;
        if (!n.description) n.description = "";
        n.name = normalizeName(n.name);
        // Validate category, fallback to type-based default
        if (!n.category || !VALID_CATEGORIES.has(n.category)) {
          n.category = DEFAULT_CATEGORY[n.type] || "tasks";
        }
        return true;
      });

      // Apply temporal classification to each node
      for (const n of nodes) {
        n.temporalType = classifyTemporal(n.content, n.description);
      }

      const nameToType = new Map<string, string>();
      for (const n of nodes) nameToType.set(n.name, n.type);

      const edges = (p.edges ?? [])
        .filter((e: any) => e.from && e.to && e.type && e.instruction)
        .map((e: any) => {
          e.from = normalizeName(e.from);
          e.to = normalizeName(e.to);
          return correctEdgeType(e, nameToType);
        })
        .filter((e: any) => e !== null);

      return { nodes, edges };
    } catch (err) {
      throw new Error(`brain-memory extraction parse failed: ${err}\nraw: ${raw.slice(0, 200)}`);
    }
  }

  /**
   * #2 fix: Tolerant extraction using balanced-brace + auto-fix parser.
   * Last-resort fallback when all retries fail.
   */
  private parseExtractTolerant(raw: string): ExtractionResult | null {
    const json = extractJsonTolerant(raw);
    if (!json) return null;
    try {
      const p = JSON.parse(json);
      const nodes = (p.nodes ?? []).filter((n: any) => {
        if (!n.name || !n.type || !n.content) return false;
        if (!VALID_NODE_TYPES.has(n.type)) return false;
        if (!n.description) n.description = "";
        n.name = normalizeName(n.name);
        if (!n.category || !VALID_CATEGORIES.has(n.category)) {
          n.category = DEFAULT_CATEGORY[n.type] || "tasks";
        }
        return true;
      });
      for (const n of nodes) {
        n.temporalType = classifyTemporal(n.content, n.description);
      }
      const nameToType = new Map<string, string>();
      for (const n of nodes) nameToType.set(n.name, n.type);
      const edges = (p.edges ?? [])
        .filter((e: any) => e.from && e.to && e.type && e.instruction)
        .map((e: any) => {
          e.from = normalizeName(e.from);
          e.to = normalizeName(e.to);
          return correctEdgeType(e, nameToType);
        })
        .filter((e: any) => e !== null);
      logger.info("extract", `Tolerant extraction succeeded: ${nodes.length} nodes, ${edges.length} edges`);
      return { nodes, edges };
    } catch {
      return null;
    }
  }

  private parseFinalize(raw: string, sessionNodes?: any[]): FinalizeResult {
    try {
      const json = extractJson(raw);
      const p = JSON.parse(json);

      const nameToType = new Map<string, string>();
      if (sessionNodes) {
        for (const n of sessionNodes) {
          if (n.name && n.type) nameToType.set(normalizeName(n.name), n.type);
        }
      }

      const promotedSkills = (p.promotedSkills ?? []).filter((n: any) => n.name && n.content);
      const newEdges = (p.newEdges ?? [])
        .filter((e: any) => e.from && e.to && e.type && VALID_EDGE_TYPES.has(e.type))
        .map((e: any) => {
          e.from = normalizeName(e.from);
          e.to = normalizeName(e.to);
          return correctEdgeType(e, nameToType);
        })
        .filter((e: any) => e !== null);

      return { promotedSkills, newEdges, invalidations: p.invalidations ?? [] };
    } catch {
      return { promotedSkills: [], newEdges: [], invalidations: [] };
    }
  }
}

/**
 * 校验并修正边类型。
 * 策略：先检查 LLM 提供的类型是否合法；若不合法，再根据 from/to 节点类型尝试修正为最匹配的边类型。
 * 修正仅在原类型不合法时触发，避免覆盖 LLM 正确选择的新边类型（如 RELATED_TO、OBSERVED_IN 等）。
 */
function correctEdgeType(
  edge: { from: string; to: string; type: string; instruction: string; condition?: string },
  nameToType: Map<string, string>,
): typeof edge | null {
  const fromType = nameToType.get(normalizeName(edge.from));
  const toType = nameToType.get(normalizeName(edge.to));
  if (!fromType || !toType) return edge;

  let type = edge.type;

  // 第一步：检查 LLM 提供的类型是否合法
  const typeValid = VALID_EDGE_TYPES.has(type as EdgeType);
  const fromOk = typeValid ? EDGE_FROM_CONSTRAINT[type as EdgeType]?.has(fromType as GraphNodeType) ?? false : false;
  const toOk = typeValid ? EDGE_TO_CONSTRAINT[type as EdgeType]?.has(toType as GraphNodeType) ?? false : false;

  if (typeValid && fromOk && toOk) return { ...edge, type }; // 原类型完全合法，直接返回

  // 第二步：原类型不合法，尝试根据 from/to 节点类型修正
  let corrected: string | null = null;
  if (fromType === "TASK" && toType === "SKILL") corrected = "USED_SKILL";
  else if (fromType === "EVENT" && toType === "SKILL") corrected = "SOLVED_BY";

  if (corrected) {
    type = corrected;
    const cFromOk = EDGE_FROM_CONSTRAINT[type as EdgeType]?.has(fromType as GraphNodeType) ?? false;
    const cToOk = EDGE_TO_CONSTRAINT[type as EdgeType]?.has(toType as GraphNodeType) ?? false;
    if (cFromOk && cToOk) return { ...edge, type };
  }

  // 无法修正，拒绝此边
  return null;
}

// extractJson imported from ../utils/json.ts
