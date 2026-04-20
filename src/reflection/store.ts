/**
 * brain-memory — Reflection store
 *
 * Stores reflection insights as graph nodes with:
 *  - Appropriate type/category mapping based on insight kind
 *  - Edge connections to related nodes
 *  - Importance boosting for validated insights
 *  - Safety filtering to prevent prompt injection
 *
 * Design: reflection results are graph nodes (not flat text),
 * so they participate in PPR ranking, community detection, and decay.
 */

import { type DatabaseSyncInstance } from "@photostructure/sqlite";
import type { BmConfig, ReflectionInsight, ReflectionConfig } from "../types.ts";
import { upsertNode, findByName, allActiveNodes, normalizeName } from "../store/store.ts";
import { sanitizeReflectionText } from "./extractor.ts";
import { tokenize, jaccardSimilarity } from "../utils/text.ts";

// ─── Insight → Node Mapping ───────────────────────────────────

/** Map reflection insight kind to graph node type + memory category */
export function mapInsightToNode(insight: ReflectionInsight): {
  type: "TASK" | "SKILL" | "EVENT";
  category: string;
  prefix: string;
} {
  switch (insight.kind) {
    case "user-model":
      // User preferences/profile → TASK node, preferences/profile category
      return {
        type: "TASK",
        category: insight.text.toLowerCase().includes("prefer") || insight.text.toLowerCase().includes("喜欢") || insight.text.toLowerCase().includes("习惯")
          ? "preferences"
          : "profile",
        prefix: "用户画像",
      };
    case "agent-model":
      // Agent behavior lessons → EVENT node, cases category
      return { type: "EVENT", category: "cases", prefix: "Agent教训" };
    case "lesson":
      // General lessons → EVENT node, cases/patterns category
      return { type: "EVENT", category: "cases", prefix: "经验教训" };
    case "decision":
      // Decisions → TASK node, events category
      return { type: "TASK", category: "events", prefix: "重要决策" };
  }
}

// ─── Store Reflection Insights ────────────────────────────────

export function storeReflectionInsights(
  db: DatabaseSyncInstance,
  insights: ReflectionInsight[],
  sessionId: string,
  cfg: BmConfig,
): { stored: number; boosted: number } {
  if (!insights.length) return { stored: 0, boosted: 0 };

  let stored = 0;
  let boosted = 0;
  const allNodes = allActiveNodes(db);

  for (const insight of insights) {
    const mapping = mapInsightToNode(insight);

    // Try to find existing related node first (by content similarity)
    const relatedNode = findRelatedNode(allNodes, insight.text);
    if (relatedNode) {
      // Boost importance of existing node instead of creating new one
      const newImportance = Math.min(1.0, relatedNode.importance + cfg.reflection.importanceBoost);
      db.prepare("UPDATE bm_nodes SET importance=?, validated_count=validated_count+1, updated_at=? WHERE id=?")
        .run(newImportance, Date.now(), relatedNode.id);
      boosted++;
      if (process.env.BM_DEBUG) {
        console.log(`  [REFLECT] boosted "${relatedNode.name}" importance: ${relatedNode.importance.toFixed(2)} → ${newImportance.toFixed(2)}`);
      }
      continue;
    }

    // Create new reflection node
    const name = `${mapping.prefix}: ${insight.text.slice(0, 50)}`;
    const description = `${insight.kind} (confidence: ${insight.confidence.toFixed(2)})`;
    const content = insight.text;

    // Initial importance is moderate (0.3-0.5 based on confidence)
    // Needs multiple validations to reach Core tier (>0.7)
    const initialImportance = 0.3 + insight.confidence * 0.2;

    try {
      upsertNode(db, {
        type: mapping.type,
        category: mapping.category as any,
        name,
        description,
        content,
        temporalType: "static", // Reflection insights are stable
      }, sessionId);

      // Set custom importance (upsertNode sets default 0.5)
      const normalized = normalizeName(name);
      const node = findByName(db, normalized);
      if (node) {
        db.prepare("UPDATE bm_nodes SET importance=? WHERE id=?")
          .run(initialImportance, node.id);
      }

      stored++;
      if (process.env.BM_DEBUG) {
        console.log(`  [REFLECT] stored "${name}" (importance: ${initialImportance.toFixed(2)})`);
      }
    } catch (err) {
      if (process.env.BM_DEBUG) {
        console.log(`  [WARN] failed to store reflection: ${err}`);
      }
    }
  }

  return { stored, boosted };
}

// ─── Find Related Node ────────────────────────────────────────
// Simple token overlap to find if insight is about an existing node

function findRelatedNode(
  nodes: Array<{ id: string; name: string; content: string; importance: number }>,
  insightText: string,
): typeof nodes[0] | null {
  const insightTokens = tokenize(insightText);
  if (insightTokens.size < 2) return null;

  let bestMatch: typeof nodes[0] | null = null;
  let bestOverlap = 0;

  for (const node of nodes) {
    const nodeTokens = tokenize(`${node.name} ${node.content}`);
    const overlap = jaccardSimilarity(insightTokens, nodeTokens);
    if (overlap > bestOverlap && overlap > 0.15) {
      bestOverlap = overlap;
      bestMatch = node;
    }
  }

  return bestMatch;
}

// tokenize, jaccardSimilarity imported from ../utils/text.ts

// ─── Turn Reflection: Apply Importance Boosts ─────────────────

export function applyTurnBoosts(
  db: DatabaseSyncInstance,
  boosts: Array<{ name: string; reason: string; importanceDelta: number }>,
  maxBoost: number = 0.3,
): number {
  let applied = 0;

  for (const boost of boosts) {
    const node = findByName(db, boost.name);
    if (!node) continue;

    const newImportance = Math.min(1.0, node.importance + Math.min(boost.importanceDelta, maxBoost));
    db.prepare("UPDATE bm_nodes SET importance=?, updated_at=? WHERE id=?")
      .run(newImportance, Date.now(), node.id);

    applied++;
    if (process.env.BM_DEBUG) {
      console.log(`  [REFLECT] turn boost "${node.name}": ${node.importance.toFixed(2)} → ${newImportance.toFixed(2)} (${boost.reason})`);
    }
  }

  return applied;
}
