/**
 * F-5: UI controllers 集成测试
 * v2.1.1
 *
 * 覆盖：GET /api/stats, GET /api/nodes, POST /api/nodes, GET /api/graph
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ContextEngine } from '../../src/engine/context';
import { createUiServer } from '../../src/ui/server';
import { DEFAULT_CONFIG, type BmConfig } from '../../src/types';

describe('UI Controllers', () => {
  let engine: ContextEngine;
  let ui: ReturnType<typeof createUiServer>;
  let dbPath: string;

  beforeEach(() => {
    dbPath = join(tmpdir(), `bm-ui-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    const config: BmConfig = {
      ...DEFAULT_CONFIG,
      dbPath,
      mode: 'lite',
      decay: { ...DEFAULT_CONFIG.decay, enabled: false },
      reflection: { ...DEFAULT_CONFIG.reflection, enabled: false },
      workingMemory: { ...DEFAULT_CONFIG.workingMemory, enabled: false },
      fusion: { ...DEFAULT_CONFIG.fusion, enabled: false },
      reasoning: { ...DEFAULT_CONFIG.reasoning, enabled: false },
    };
    engine = new ContextEngine(config);
    ui = createUiServer(engine.getStorage(), { port: 0, bind: 'loopback' });
  });

  afterEach(() => {
    try { engine.close(); } catch { /* ignore */ }
    try { if (existsSync(dbPath)) unlinkSync(dbPath); } catch { /* ignore */ }
    try { if (existsSync(dbPath + '-wal')) unlinkSync(dbPath + '-wal'); } catch { /* ignore */ }
    try { if (existsSync(dbPath + '-shm')) unlinkSync(dbPath + '-shm'); } catch { /* ignore */ }
  });

  it('GET /api/stats returns valid stats JSON', async () => {
    const res = await ui.app.fetch(new Request('http://localhost/api/stats'));
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toHaveProperty('totalNodes');
    expect(body).toHaveProperty('activeNodes');
    expect(body).toHaveProperty('totalEdges');
    expect(body).toHaveProperty('decay');
    expect(body).toHaveProperty('timestamp');
    expect(typeof body.totalNodes).toBe('number');
    expect(typeof body.activeNodes).toBe('number');
    expect(typeof body.totalEdges).toBe('number');
  });

  it('GET /api/stats/decay returns decay curve', async () => {
    const res = await ui.app.fetch(new Request('http://localhost/api/stats/decay'));
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toHaveProperty('healthy');
    expect(body).toHaveProperty('fading');
    expect(body).toHaveProperty('forgotten');
    expect(body).toHaveProperty('decayCurve');
    expect(Array.isArray(body.decayCurve)).toBe(true);
    expect((body.decayCurve as Array<unknown>).length).toBeGreaterThan(0);
  });

  it('GET /api/nodes returns paginated list', async () => {
    const res = await ui.app.fetch(new Request('http://localhost/api/nodes?limit=10'));
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toHaveProperty('total');
    expect(body).toHaveProperty('limit');
    expect(body).toHaveProperty('offset');
    expect(body).toHaveProperty('nodes');
    expect(Array.isArray(body.nodes)).toBe(true);
    expect(body.limit).toBe(10);
    expect(body.offset).toBe(0);
  });

  it('POST /api/nodes creates a node and returns 201', async () => {
    const res = await ui.app.fetch(new Request('http://localhost/api/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'TASK', category: 'tasks',
        name: 'Integration Test Node',
        description: 'Node created via UI API test',
        content: 'test content for UI controller integration test',
      }),
    }));
    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toHaveProperty('node');
    expect(body).toHaveProperty('isNew');
    expect(body.isNew).toBe(true);
  });

  it('GET /api/graph returns graph structure', async () => {
    const res = await ui.app.fetch(new Request('http://localhost/api/graph?maxNodes=50'));
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toHaveProperty('nodes');
    expect(body).toHaveProperty('edges');
    expect(body).toHaveProperty('communities');
    expect(Array.isArray(body.nodes)).toBe(true);
    expect(Array.isArray(body.edges)).toBe(true);
    expect(Array.isArray(body.communities)).toBe(true);
  });
});
