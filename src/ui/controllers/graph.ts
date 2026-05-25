/**
 * brain-memory UI — Graph Controller
 *
 * GET /api/graph          → 全量图谱数据（节点 + 边 + 社区）
 * GET /api/graph/community/:id → 单个社区子图
 */

import type { UiServerContext } from '../server';

type HonoHandler = (c: any) => any;

export function createGraphController(ctx: UiServerContext) {
  const { storage } = ctx;

  const getGraph: HonoHandler = (c) => {
    const q = c.req.query();
    const maxNodes = Math.min(parseInt(q.maxNodes) || 200, 500);

    const allNodes = storage.findAllActive();
    const allEdges = storage.findAllEdges();

    // 按 PageRank 排序取 top-N
    const sorted = allNodes.sort((a, b) => (b.pagerank || 0) - (a.pagerank || 0));
    const nodes = sorted.slice(0, maxNodes);

    const nodeIds = new Set(nodes.map(n => n.id));
    const edges = allEdges.filter(e => nodeIds.has(e.fromId) && nodeIds.has(e.toId));

    // 社区汇总
    const communityMap = new Map<string, { ids: string[]; count: number }>();
    for (const n of nodes) {
      if (n.communityId) {
        const c = communityMap.get(n.communityId) || { ids: [], count: 0 };
        c.ids.push(n.id);
        c.count++;
        communityMap.set(n.communityId, c);
      }
    }

    const graphNodes = nodes.map(n => ({
      id: n.id, name: n.name, type: n.type, category: n.category,
      pagerank: n.pagerank || 0, importance: n.importance || 0.5,
      communityId: n.communityId,
      scopePlatform: n.scopePlatform,
    }));

    const graphEdges = edges.map(e => ({
      id: e.id, source: e.fromId, target: e.toId, type: e.type,
      instruction: e.instruction,
    }));

    const communities = Array.from(communityMap.entries()).map(([id, info]) => ({
      id, count: info.count, nodeIds: info.ids,
    }));

    return c.json({ nodes: graphNodes, edges: graphEdges, communities });
  };

  const getCommunity: HonoHandler = (c) => {
    const communityId = c.req.param('id');
    const allNodes = storage.findAllActive();
    const communityNodes = allNodes.filter(n => n.communityId === communityId);

    const nodeIds = new Set(communityNodes.map(n => n.id));
    const allEdges = storage.findAllEdges();
    const communityEdges = allEdges.filter(e => nodeIds.has(e.fromId) && nodeIds.has(e.toId));

    return c.json({
      community: { id: communityId, nodeCount: communityNodes.length },
      nodes: communityNodes.map(n => ({
        id: n.id, name: n.name, type: n.type, category: n.category,
        pagerank: n.pagerank || 0,
      })),
      edges: communityEdges.map(e => ({
        id: e.id, source: e.fromId, target: e.toId, type: e.type,
      })),
    });
  };

  return { getGraph, getCommunity };
}
