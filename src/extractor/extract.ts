/**
 * brain-memory — Knowledge extraction from conversations
 *
 * Unified: graph triple extraction + mlp's smart extraction patterns.
 * Supports 8-category memory system with noise filtering and temporal classification.
 * Authors: adoresever (graph-memory), win4r (memory-lancedb-pro), brain-memory contributors
 */

import type { BmConfig, ExtractionResult, FinalizeResult, MemoryCategory, MEMORY_CATEGORIES } from "../types";
import type { CompleteFn } from "../engine/llm";
import { isNoise } from "../noise/filter";
import { classifyTemporal } from "../temporal/classifier";
import { normalizeName } from "../store/store";
import { extractJson } from "../utils/json";

const VALID_NODE_TYPES = new Set(["TASK", "SKILL", "EVENT"]);
const VALID_EDGE_TYPES = new Set(["USED_SKILL", "SOLVED_BY", "REQUIRES", "PATCHES", "CONFLICTS_WITH"]);
const VALID_CATEGORIES = new Set(["profile", "preferences", "entities", "events", "tasks", "skills", "cases", "patterns"]);

const EDGE_FROM_CONSTRAINT: Record<string, Set<string>> = {
  USED_SKILL: new Set(["TASK"]),
  SOLVED_BY: new Set(["EVENT", "SKILL"]),
  REQUIRES: new Set(["SKILL"]),
  PATCHES: new Set(["SKILL"]),
  CONFLICTS_WITH: new Set(["SKILL"]),
};

const EDGE_TO_CONSTRAINT: Record<string, Set<string>> = {
  USED_SKILL: new Set(["SKILL"]),
  SOLVED_BY: new Set(["SKILL"]),
  REQUIRES: new Set(["SKILL"]),
  PATCHES: new Set(["SKILL"]),
  CONFLICTS_WITH: new Set(["SKILL"]),
};

const EXTRACT_SYS = `你是 brain-memory 知识提取引擎，从 AI Agent 对话中提取结构化知识。
输出严格 JSON：{"nodes":[...],"edges":[...]}，不包含任何额外文字。

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

## 边提取（5 种，严格方向约束）
   USED_SKILL: TASK → SKILL
   SOLVED_BY: EVENT → SKILL 或 SKILL → SKILL
   REQUIRES: SKILL → SKILL
   PATCHES: SKILL → SKILL（新→旧）
   CONFLICTS_WITH: SKILL ↔ SKILL

   决策树：
   a. from=TASK, to=SKILL → USED_SKILL
   b. from=EVENT, to=SKILL → SOLVED_BY
   c. from=SKILL, to=SKILL → 选 SOLVED_BY/REQUIRES/PATCHES/CONFLICTS_WITH
   d. 不符合以上规则的不提取

## 策略
讨论/分析/对比都提取。用户偏好、身份、项目信息都提取。只有纯粹寒暄不提取。`;

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
  constructor(private cfg: BmConfig, private llm: CompleteFn) {}

  async extract(params: { messages: any[]; existingNames: string[] }): Promise<ExtractionResult> {
    try {
      // Noise filter: skip low-quality messages before extraction
      const noiseCfg = this.cfg.noiseFilter;
      const filtered = noiseCfg.enabled
        ? params.messages.filter(m => {
            const text = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
            return !isNoise(text, noiseCfg);
          })
        : params.messages;

      if (filtered.length === 0) return { nodes: [], edges: [] };

      const msgs = filtered
        .map(m => `[${(m.role ?? "?").toUpperCase()} t=${m.turn_index ?? 0}]\n${
          String(typeof m.content === "string" ? m.content : JSON.stringify(m.content)).slice(0, 800)
        }`).join("\n\n---\n\n");

      const raw = await this.llm(
        EXTRACT_SYS,
        `<Existing Nodes>\n${params.existingNames.join(", ") || "（无）"}\n\n<Conversation>\n${msgs}`,
      );
      return this.parseExtract(raw);
    } catch (error) {
      console.error("[brain-memory] Failed to extract knowledge:", error);
      return { nodes: [], edges: [] }; // Return empty result on failure
    }
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
      console.error("[brain-memory] Failed to finalize extraction:", error);
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

function correctEdgeType(
  edge: { from: string; to: string; type: string; instruction: string; condition?: string },
  nameToType: Map<string, string>,
): typeof edge | null {
  const fromType = nameToType.get(normalizeName(edge.from));
  const toType = nameToType.get(normalizeName(edge.to));
  if (!fromType || !toType) return edge;

  let type = edge.type;
  if (fromType === "TASK" && toType === "SKILL" && type !== "USED_SKILL") type = "USED_SKILL";
  if (fromType === "EVENT" && toType === "SKILL" && type !== "SOLVED_BY") type = "SOLVED_BY";

  if (!VALID_EDGE_TYPES.has(type)) return null;
  const fromOk = EDGE_FROM_CONSTRAINT[type]?.has(fromType) ?? false;
  const toOk = EDGE_TO_CONSTRAINT[type]?.has(toType) ?? false;
  if (!fromOk || !toOk) return null;

  return { ...edge, type };
}

// extractJson imported from ../utils/json.ts
