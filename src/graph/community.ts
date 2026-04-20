/**
 * brain-memory — Community detection (Label Propagation Algorithm)
 *
 * Note: Community IDs (c-1, c-2, ...) are assigned by size after each detection.
 * If nodes are deleted/re-merged, the same thematic group may get a different ID.
 * This is inherent to LPA + size-based renaming (ISSUE 7.2).
 *
 * Authors: adoresever (graph-memory), brain-memory contributors
 */

import { type DatabaseSyncInstance } from "@photostructure/sqlite";
import { updateCommunities, upsertCommunitySummary, pruneCommunitySummaries } from "../store/store.ts";
import type { CompleteFn } from "../engine/llm.ts";
import type { EmbedFn } from "../engine/embed.ts";

export interface CommunityResult {
  labels: Map<string, string>;
  communities: Map<string, string[]>;
  count: number;
}

export function detectCommunities(db: DatabaseSyncInstance, maxIter = 50): CommunityResult {
  const nodeRows = db.prepare("SELECT id FROM bm_nodes WHERE status='active'").all() as any[];
  if (nodeRows.length === 0) return { labels: new Map(), communities: new Map(), count: 0 };

  const nodeIds = nodeRows.map((r: any) => r.id);
  const edgeRows = db.prepare("SELECT from_id, to_id FROM bm_edges").all() as any[];
  const nodeSet = new Set(nodeIds);
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) adj.set(id, []);
  for (const e of edgeRows) {
    if (!nodeSet.has(e.from_id) || !nodeSet.has(e.to_id)) continue;
    adj.get(e.from_id)!.push(e.to_id);
    adj.get(e.to_id)!.push(e.from_id);
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

  // Filter out single-node communities (ISSUE 7.3): isolated nodes that
  // didn't merge into any group are not meaningful communities.
  const multiNode = sorted.filter(([, members]) => members.length > 1);
  // If all communities are single-node, keep them anyway (better than nothing)
  const effective = multiNode.length > 0 ? multiNode : sorted;

  const renameMap = new Map<string, string>();
  effective.forEach(([oldId], i) => renameMap.set(oldId, `c-${i + 1}`));

  const finalLabels = new Map<string, string>();
  for (const [nodeId, oldLabel] of label) finalLabels.set(nodeId, renameMap.get(oldLabel) || oldLabel);

  const finalCommunities = new Map<string, string[]>();
  for (const [oldId, members] of communities) {
    finalCommunities.set(renameMap.get(oldId) || oldId, members);
  }

  updateCommunities(db, finalLabels);
  return { labels: finalLabels, communities: finalCommunities, count: finalCommunities.size };
}

export function getCommunityPeers(db: DatabaseSyncInstance, nodeId: string, limit = 5): string[] {
  const row = db.prepare("SELECT community_id FROM bm_nodes WHERE id=? AND status='active'").get(nodeId) as any;
  if (!row?.community_id) return [];
  return (db.prepare(`
    SELECT id FROM bm_nodes WHERE community_id=? AND id!=? AND status='active'
    ORDER BY validated_count DESC, updated_at DESC LIMIT ?
  `).all(row.community_id, nodeId, limit) as any[]).map(r => r.id);
}

export function communityRepresentatives(db: DatabaseSyncInstance, perCommunity = 2): any[] {
  const rows = db.prepare(`
    SELECT * FROM bm_nodes WHERE status='active' AND community_id IS NOT NULL
    ORDER BY community_id, validated_count DESC, updated_at DESC
  `).all() as any[];
  const byCommunity = new Map<string, any[]>();
  for (const r of rows) {
    const cid = r.community_id;
    if (!byCommunity.has(cid)) byCommunity.set(cid, []);
    if (byCommunity.get(cid)!.length < perCommunity) byCommunity.get(cid)!.push(r);
  }
  return Array.from(byCommunity.values()).flat();
}

const COMMUNITY_SUMMARY_SYS = `你是知识图谱摘要引擎。根据节点列表，用简短描述概括这组节点的主题领域。只返回短语，不要解释。不要使用"社区"这个词。`;

export async function summarizeCommunities(
  db: DatabaseSyncInstance,
  communities: Map<string, string[]>,
  llm: CompleteFn,
  embedFn?: EmbedFn,
): Promise<number> {
  pruneCommunitySummaries(db);
  let generated = 0;

  for (const [communityId, memberIds] of communities) {
    if (memberIds.length === 0) continue;
    const placeholders = memberIds.map(() => "?").join(",");
    const members = db.prepare(`
      SELECT name, type, description FROM bm_nodes
      WHERE id IN (${placeholders}) AND status='active'
      ORDER BY validated_count DESC LIMIT 10
    `).all(...memberIds) as any[];
    if (members.length === 0) continue;

    const memberText = members.map((m: any) => `${m.type}:${m.name} — ${m.description}`).join("\n");

    try {
      const summary = await llm(COMMUNITY_SUMMARY_SYS, `社区成员：\n${memberText}`);
      const cleaned = summary.trim()
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .replace(/<think>[\s\S]*/gi, "")
        .replace(/^["'「」]|["'「」]$/g, "")
        .replace(/\n/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim()
        .slice(0, 100);
      if (cleaned.length === 0) continue;

      let embedding: number[] | undefined;
      if (embedFn) {
        try {
          embedding = await embedFn(`${cleaned}\n${members.map((m: any) => m.name).join(", ")}`);
        } catch { /* skip */ }
      }

      upsertCommunitySummary(db, communityId, cleaned, memberIds.length, embedding);
      generated++;
    } catch (err) {
      if (process.env.BM_DEBUG) console.log(`  [WARN] community summary failed for ${communityId}: ${err}`);
    }
  }
  return generated;
}
