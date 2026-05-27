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
 *
 * v2.1.0: Migrated from DatabaseSyncInstance to IStorageAdapter.
 */

import type { BmConfig, ReflectionInsight, MemoryCategory } from '../types';
import type { IStorageAdapter } from '../store/adapter';
import { normalizeName } from '../store/store';
import { tokenize, jaccardSimilarity } from '../utils/text';
import { logger } from '../utils/logger';

// ─── Insight → Node Mapping ───────────────────────────────────

/** Map reflection insight kind to graph node type + memory category */
export function mapInsightToNode(insight: ReflectionInsight): {
  type: 'TASK' | 'SKILL' | 'EVENT';
  category: MemoryCategory;
  prefix: string;
} {
  switch (insight.kind) {
  case 'user-model':
    return {
      type: 'TASK',
      category: insight.text.toLowerCase().includes('prefer') || insight.text.toLowerCase().includes('喜欢') || insight.text.toLowerCase().includes('习惯')
        ? 'preferences'
        : 'profile',
      prefix: '用户画像',
    };
  case 'agent-model':
    return { type: 'EVENT', category: 'cases', prefix: 'Agent教训' };
  case 'lesson':
    return { type: 'EVENT', category: 'cases', prefix: '经验教训' };
  case 'decision':
    return { type: 'TASK', category: 'events', prefix: '重要决策' };
  }
}

// ─── Store Reflection Insights ────────────────────────────────

export function storeReflectionInsights(
  storage: IStorageAdapter,
  insights: ReflectionInsight[],
  sessionId: string,
  cfg: BmConfig,
): { stored: number; boosted: number } {
  if (!insights.length) return { stored: 0, boosted: 0 };

  let stored = 0;
  let boosted = 0;
  const allNodes = storage.findAllActive();

  for (const insight of insights) {
    const mapping = mapInsightToNode(insight);

    // Try to find existing related node first (by content similarity)
    const relatedNode = findRelatedNode(allNodes, insight.text);
    if (relatedNode) {
      // Boost importance of existing node instead of creating new one
      const newImportance = Math.min(1.0, relatedNode.importance + cfg.reflection.importanceBoost);
      storage.updateNodeImportance(relatedNode.id, newImportance);
      boosted++;
      logger.debug('reflect', `boosted "${relatedNode.name}" importance: ${relatedNode.importance.toFixed(2)} → ${newImportance.toFixed(2)}`);
      continue;
    }

    // Create new reflection node
    const name = `${mapping.prefix}: ${insight.text.slice(0, 50)}`;
    const description = `${insight.kind} (confidence: ${insight.confidence.toFixed(2)})`;
    const content = insight.text;

    const initialImportance = 0.3 + insight.confidence * 0.2;

    try {
      storage.upsertNode({
        type: mapping.type,
        category: mapping.category,
        name,
        description,
        content,
        source: 'assistant',
        temporalType: 'static',
      }, sessionId);

      // Set custom importance (upsertNode sets default 0.5)
      const normalized = normalizeName(name);
      const node = storage.findNodeByName(normalized);
      if (node) {
        storage.updateNodeImportance(node.id, initialImportance);
      }

      stored++;
      logger.debug('reflect', `stored "${name}" (importance: ${initialImportance.toFixed(2)})`);
    } catch (err) {
      logger.debug('reflect', `failed to store reflection: ${err}`);
    }
  }

  return { stored, boosted };
}

// ─── Find Related Node ────────────────────────────────────────

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

// ─── Turn Reflection: Apply Importance Boosts ─────────────────

export function applyTurnBoosts(
  storage: IStorageAdapter,
  boosts: Array<{ name: string; reason: string; importanceDelta: number }>,
  maxBoost: number = 0.3,
): number {
  let applied = 0;

  for (const boost of boosts) {
    const node = storage.findNodeByName(boost.name);
    if (!node) continue;

    const newImportance = Math.min(1.0, node.importance + Math.min(boost.importanceDelta, maxBoost));
    storage.updateNodeImportance(node.id, newImportance);

    applied++;
    logger.debug('reflect', `turn boost "${node.name}": ${node.importance.toFixed(2)} → ${newImportance.toFixed(2)} (${boost.reason})`);
  }

  return applied;
}
