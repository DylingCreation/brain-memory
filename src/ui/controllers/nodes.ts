/**
 * brain-memory UI — Nodes Controller
 *
 * GET /api/nodes       → 节点列表（搜索 + 分页 + 过滤）
 * GET /api/nodes/:id   → 节点详情（含关联边 + 社区）
 */

import type { UiServerContext } from '../server';
import type { Context } from 'hono';

type HonoHandler = (c: Context) => Response | Promise<Response>;

export function createNodesController(ctx: UiServerContext) {
  const { storage } = ctx;

  const list: HonoHandler = (c) => {
    const q = c.req.query();

    const limit = Math.min(parseInt(q.limit) || 50, 200);
    const offset = parseInt(q.offset) || 0;
    const search = q.search || '';
    const category = q.category || '';
    const sort = q.sort || 'pagerank';
    const order = q.order || 'desc';

    // 获取活跃节点
    let all = storage.findAllActive();

    // 分类过滤
    if (category) {
      const cats = category.split(',').filter(Boolean);
      if (cats.length) all = all.filter(n => cats.includes(n.category));
    }

    // 文本搜索
    if (search.trim()) {
      const ql = search.toLowerCase();
      all = all.filter(n =>
        n.name.toLowerCase().includes(ql) ||
        n.description.toLowerCase().includes(ql) ||
        n.content.toLowerCase().includes(ql)
      );
    }

    // 排序
    const dir = order === 'asc' ? 1 : -1;
    if (sort === 'importance') all.sort((a, b) => dir * ((b.importance || 0.5) - (a.importance || 0.5)));
    else if (sort === 'updated') all.sort((a, b) => dir * (b.updatedAt - a.updatedAt));
    else all.sort((a, b) => dir * (b.pagerank - a.pagerank));

    const total = all.length;
    const nodes = all.slice(offset, offset + limit);

    // 简化返回（过滤掉大 content 字段，可单独通过 detail 拉取）
    const rows = nodes.map((n) => ({
      id: n.id,
      type: n.type,
      category: n.category,
      name: n.name,
      description: n.description?.slice(0, 200) || '',
      status: n.status,
      pagerank: n.pagerank || 0,
      importance: n.importance || 0.5,
      validatedCount: n.validatedCount || 0,
      accessCount: n.accessCount || 0,
      source: n.source,
      scopeChat: n.scopeChat,
      scopePlatform: n.scopePlatform,
      scopeAgent: n.scopeAgent,
      updatedAt: n.updatedAt,
      createdAt: n.createdAt,
    }));

    return c.json({ total, limit, offset, nodes: rows });
  };

  const detail: HonoHandler = (c) => {
    const id = c.req.param('id');
    const node = storage.findNodeById(id);
    if (!node) return c.json({ error: 'Node not found' }, 404);

    const fromEdges = storage.findEdgesFrom(id);
    const toEdges = storage.findEdgesTo(id);

    // 查找关联节点名称
    const edgesWithNames = [...fromEdges, ...toEdges].map(e => {
      const otherId = e.fromId === id ? e.toId : e.fromId;
      const other = storage.findNodeById(otherId);
      return {
        id: e.id,
        type: e.type,
        instruction: e.instruction,
        fromId: e.fromId,
        toId: e.toId,
        direction: e.fromId === id ? 'out' : 'in',
        otherName: other?.name || otherId,
        sessionId: e.sessionId,
      };
    });

    return c.json({
      node: {
        ...node,
        content: node.content?.slice(0, 5000) || '', // 截断大内容
      },
      edges: edgesWithNames,
      edgeCount: edgesWithNames.length,
    });
  };

  return { list, detail };
}

// ─── 编辑操作 ────────────────────────────────────────────

export function createNodesEditController(ctx: UiServerContext) {
  const { storage, eventBus } = ctx;

  const create: HonoHandler = async (c) => {
    const body = await c.req.json();
    const result = storage.upsertNode({
      type: body.type || 'TASK',
      category: body.category || 'tasks',
      name: body.name,
      description: body.description || '',
      content: body.content || '',
      source: 'manual',
      scopePlatform: body.scopePlatform || null,
      scopeAgent: body.scopeAgent || null,
      scopeUser: body.scopeUser || null,
      scopeChat: body.scopeChat || null,
      scopeThread: body.scopeThread || null,
    }, 'manual');

    eventBus.emit('node:created', { node: result.node });
    eventBus.emit('stats:updated', storage.getStats());
    return c.json({ node: result.node, isNew: result.isNew }, 201);
  };

  const update: HonoHandler = async (c) => {
    const id = c.req.param('id');
    const existing = storage.findNodeById(id);
    if (!existing) return c.json({ error: 'Node not found' }, 404);

    const body = await c.req.json();
    const result = storage.upsertNode({
      type: existing.type,
      category: existing.category,
      name: existing.name,
      description: body.description ?? existing.description,
      content: body.content ?? existing.content,
      source: existing.source,
    }, 'manual');

    eventBus.emit('node:updated', { node: result.node, changes: Object.keys(body) });
    return c.json({ node: result.node });
  };

  const remove: HonoHandler = (c) => {
    const id = c.req.param('id');
    const existing = storage.findNodeById(id);
    if (!existing) return c.json({ error: 'Node not found' }, 404);
    storage.deprecateNode(id);
    eventBus.emit('node:deprecated', { nodeId: id });
    eventBus.emit('stats:updated', storage.getStats());
    return c.json({ deprecated: true });
  };

  const merge: HonoHandler = async (c) => {
    const body = await c.req.json();
    storage.mergeNodes(body.keepId, body.mergeId);
    const kept = storage.findNodeById(body.keepId);
    eventBus.emit('stats:updated', storage.getStats());
    return c.json({ merged: true, kept });
  };

  return { create, update, remove, merge };
}
