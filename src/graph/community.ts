/**
 * brain-memory — Community detection (Label Propagation Algorithm)
 *
 * Note: Community IDs (c-1, c-2, ...) are assigned by size after each detection.
 * If nodes are deleted/re-merged, the same thematic group may get a different ID.
 * This is inherent to LPA + size-based renaming (ISSUE 7.2).
 *
 * v1.1.0 F-2: Uses IStorageAdapter instead of DatabaseSyncInstance.
 *
 * Authors: adoresever (graph-memory), brain-memory contributors
 */

import type { IStorageAdapter } from "../store/adapter";
import type { CompleteFn } from "../engine/llm";
import type { EmbedFn } from "../engine/embed";
import { logger } from "../utils/logger";

export interface CommunityResult {
  labels: Map<string, string>;
  communities: Map<string, string[]>;
  count: number;
}

export function detectCommunities(storage: IStorageAdapter, maxIter = 50): CommunityResult {
  const nodes = storage.findAllActive();
  if (nodes.length === 0) return { labels: new Map(), communities: new Map(), count: 0 };

  const nodeIds = nodes.map(n => n.id);
  const edges = storage.findAllEdges();
  const nodeSet = new Set(nodeIds);
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) adj.set(id, []);
  for (const e of edges) {
    if (!nodeSet.has(e.fromId) || !nodeSet.has(e.toId)) continue;
    adj.get(e.fromId)!.push(e.toId);
    adj.get(e.toId)!.push(e.fromId);
  }

  const label = new Map<string, string>();
  for (const id of nodeIds) label.set(id, id);

  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    const shuffled = [...nodeIds];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    for (const nodeId of shuffled) {
      const neighbors = adj.get(nodeId) || [];
      if (neighbors.length === 0) continue;
      const freq = new Map<string, number>();
      for (const nb of neighbors) {
        const l = label.get(nb)!;
        freq.set(l, (freq.get(l) || 0) + 1);
      }
      let bestLabel = label.get(nodeId)!;
      let bestCount = 0;
      for (const [l, c] of freq) {
        if (c > bestCount || (c === bestCount && l < bestLabel)) {
          bestLabel = l;
          bestCount = c;
        }
      }
      if (label.get(nodeId) !== bestLabel) {
        label.set(nodeId, bestLabel);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const communities = new Map<string, string[]>();
  for (const [nodeId, communityId] of label) {
    if (!communities.has(communityId)) communities.set(communityId, []);
    communities.get(communityId)!.push(nodeId);
  }

  const sorted = Array.from(communities.entries()).sort((a, b) => b[1].length - a[1].length);

  // Filter out single-node communities (ISSUE 7.3)
  const multiNode = sorted.filter(([, members]) => members.length > 1);
  const effective = multiNode.length > 0 ? multiNode : sorted;

  const renameMap = new Map<string, string>();
  effective.forEach(([oldId], i) => renameMap.set(oldId, `c-${i + 1}`));

  const finalLabels = new Map<string, string>();
  for (const [nodeId, oldLabel] of label) finalLabels.set(nodeId, renameMap.get(oldLabel) || oldLabel);

  const finalCommunities = new Map<string, string[]>();
  for (const [oldId, members] of communities) {
    finalCommunities.set(renameMap.get(oldId) || oldId, members);
  }

  storage.updateCommunities(finalLabels);
  return { labels: finalLabels, communities: finalCommunities, count: finalCommunities.size };
}

// ─── Incremental Community Detection (v1.1.0 F-3) ─────────────

export interface IncrementalCommunityResult {
  labels: Map<string, string>;
  communities: Map<string, string[]>;
  count: number;
  changedCount: number;
  skipped: boolean;
}

/**
 * Incremental community detection: frozen + local LPA.
 *
 * 1. Get dirty nodes and affected subgraph
 * 2. Freeze all clean nodes' labels (keep existing community_id)
 * 3. Run LPA only on dirty nodes + 1-hop neighbors
 * 4. Handle boundary: clean nodes act as fixed anchors
 * 5. Write back only changed labels
 *
 * Returns skipped=true if dirty ratio > threshold.
 */
export function runIncrementalCommunities(
  storage: IStorageAdapter,
  maxIter = 50,
  threshold: number = 0.10,
): IncrementalCommunityResult {
  const dirtyNodes = storage.getDirtyNodes();
  if (dirtyNodes.size === 0) return { labels: new Map(), communities: new Map(), count: 0, changedCount: 0, skipped: false };

  const allNodes = storage.findAllActive();
  const totalActive = allNodes.length;
  const dirtyRatio = dirtyNodes.size / Math.max(totalActive, 1);
  if (dirtyRatio > threshold) return { labels: new Map(), communities: new Map(), count: 0, changedCount: 0, skipped: true };

  // Build existing label map from stored community_id
  const existingLabels = new Map<string, string>();
  for (const n of allNodes) {
    if (n.communityId) existingLabels.set(n.id, n.communityId);
  }

  // Get affected subgraph (1-hop)
  const subgraph = storage.getAffectedSubgraph(1);
  const subNodeIds = new Set(subgraph.nodes.map(n => n.id));
  const subAdj = new Map<string, string[]>();
  for (const n of subgraph.nodes) subAdj.set(n.id, []);
  for (const e of subgraph.edges) {
    if (subNodeIds.has(e.fromId) && subNodeIds.has(e.toId)) {
      subAdj.get(e.fromId)!.push(e.toId);
      subAdj.get(e.toId)!.push(e.fromId);
    }
  }

  // Initialize labels
  const label = new Map<string, string>();
  const dirtyIds = new Set<string>();

  for (const nodeId of subNodeIds) {
    if (dirtyNodes.has(nodeId)) {
      // Dirty nodes: reset to self-label (will propagate)
      label.set(nodeId, nodeId);
      dirtyIds.add(nodeId);
    } else {
      // Clean nodes: freeze existing label
      label.set(nodeId, existingLabels.get(nodeId) || nodeId);
    }
  }

  // Also include full existing nodes for boundary context
  const nodeSet = new Set(allNodes.map(n => n.id));
  const allEdges = storage.findAllEdges();
  const fullAdj = new Map<string, string[]>();
  for (const id of nodeSet) fullAdj.set(id, []);
  for (const e of allEdges) {
    if (nodeSet.has(e.fromId) && nodeSet.has(e.toId)) {
      fullAdj.get(e.fromId)!.push(e.toId);
      fullAdj.get(e.toId)!.push(e.fromId);
    }
  }

  // Run LPA only on dirty nodes (neighbors are frozen anchors)
  let changedCount = 0;
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    const shuffled = Array.from(dirtyIds);
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    for (const nodeId of shuffled) {
      const neighbors = fullAdj.get(nodeId) || [];
      if (neighbors.length === 0) continue;
      const freq = new Map<string, number>();
      for (const nb of neighbors) {
        const l = label.get(nb);
        if (l) freq.set(l, (freq.get(l) || 0) + 1);
      }
      let bestLabel = label.get(nodeId)!;
      let bestCount = 0;
      for (const [l, c] of freq) {
        if (c > bestCount || (c === bestCount && l < bestLabel)) {
          bestLabel = l;
          bestCount = c;
        }
      }
      if (label.get(nodeId) !== bestLabel) {
        label.set(nodeId, bestLabel);
        changed = true;
        changedCount++;
      }
    }
    if (!changed) break;
  }

  // Collect results: merge new labels with existing
  const finalLabels = new Map<string, string>(existingLabels);
  for (const [nodeId, communityId] of label) {
    finalLabels.set(nodeId, communityId);
  }

  // Build community map
  const communities = new Map<string, string[]>();
  for (const [nodeId, communityId] of finalLabels) {
    if (!communities.has(communityId)) communities.set(communityId, []);
    communities.get(communityId)!.push(nodeId);
  }

  // Rename communities to c-N format
  const sorted = Array.from(communities.entries()).sort((a, b) => b[1].length - a[1].length);
  const multiNode = sorted.filter(([, members]) => members.length > 1);
  const effective = multiNode.length > 0 ? multiNode : sorted;
  const renameMap = new Map<string, string>();
  effective.forEach(([oldId], i) => renameMap.set(oldId, `c-${i + 1}`));

  const renamedLabels = new Map<string, string>();
  for (const [nodeId, oldLabel] of finalLabels) {
    renamedLabels.set(nodeId, renameMap.get(oldLabel) || oldLabel);
  }

  const renamedCommunities = new Map<string, string[]>();
  for (const [oldId, members] of communities) {
    renamedCommunities.set(renameMap.get(oldId) || oldId, members);
  }

  // Write back
  storage.updateCommunities(renamedLabels);

  return { labels: renamedLabels, communities: renamedCommunities, count: renamedCommunities.size, changedCount, skipped: false };
}

export function getCommunityPeers(storage: IStorageAdapter, nodeId: string, limit = 5): string[] {
  return storage.findCommunityPeers(nodeId, limit);
}

export function communityRepresentatives(storage: IStorageAdapter, perCommunity = 2): any[] {
  return storage.findCommunityRepresentatives(perCommunity);
}

const COMMUNITY_SUMMARY_SYS = `你是知识图谱摘要引擎。根据节点列表，用简短描述概括这组节点的主题领域。只返回短语，不要解释。不要使用"社区"这个词。`;

export async function summarizeCommunities(
  storage: IStorageAdapter,
  communities: Map<string, string[]>,
  llm: CompleteFn,
  embedFn?: EmbedFn,
): Promise<number> {
  storage.pruneCommunities();
  let generated = 0;

  for (const [communityId, memberIds] of communities) {
    if (memberIds.length === 0) continue;
    const members = storage.findNodesByCommunities([communityId], 10);
    if (members.length === 0) continue;

    const memberText = members.map(m => `${m.type}:${m.name} — ${m.description}`).join("\n");

    try {
      const summary = await llm(COMMUNITY_SUMMARY_SYS, `社区成员：\n${memberText}`);
      const cleaned = summary.trim()
        .replace(/[\r\n]+/g, ' ')
        .replace(/\s+/g, ' ');

      if (embedFn) {
        try {
          const embedding = await embedFn(cleaned);
          storage.upsertCommunity(communityId, cleaned, memberIds.length, embedding);
        } catch {
          storage.upsertCommunity(communityId, cleaned, memberIds.length);
        }
      } else {
        storage.upsertCommunity(communityId, cleaned, memberIds.length);
      }
      generated++;
    } catch (error) {
      logger.error("community", `Error summarizing community ${communityId}:`, error);
    }
  }

  return generated;
}
