/**
 * brain-memory — Web Control UI Server
 *
 * 嵌入式 HTTP + WebSocket 服务器，随插件 activate() 启动。
 * 使用 Hono 做 HTTP 路由，ws 做 WebSocket 广播。
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import type { IStorageAdapter } from '../store/adapter';
import { createStatsController } from './controllers/stats';
import { createNodesController, createNodesEditController } from './controllers/nodes';
import { createGraphController } from './controllers/graph';
import { createConfigController } from './controllers/config';
import { createAuthMiddleware } from './middleware/auth';
import { logger } from '../utils/logger';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ─── Types ─────────────────────────────────────────────────

export interface UiServerConfig {
  port?: number;
  authToken?: string;
  bind?: 'loopback' | 'lan';
}

export interface UiServerContext {
  storage: IStorageAdapter;
  eventBus: EventEmitter;
  config: UiServerConfig;
}

// ─── Server ────────────────────────────────────────────────

export function createUiServer(storage: IStorageAdapter, config: UiServerConfig = {}) {
  const app = new Hono();
  const eventBus = new EventEmitter();
  let wss: WebSocketServer | null = null;
  let server: ReturnType<typeof createServer> | null = null;

  const ctx: UiServerContext = { storage, eventBus, config };
  const auth = createAuthMiddleware(config.authToken);

  // ─── Static files (UI frontend) ──────────────────────────

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const uiDistPath = join(__dirname, '..', '..', '..', 'ui', 'dist');
  const uiPublicPath = join(__dirname, '..', '..', '..', 'ui', 'public');
  const serveStatic = async (c: Context, filePath: string) => {
    try {
      const fullPath = join(uiDistPath, filePath);
      if (!existsSync(fullPath)) return null;
      const content = readFileSync(fullPath, 'utf-8');
      const ext = filePath.split('.').pop() || '';
      const mime = { html: 'text/html', js: 'application/javascript', css: 'text/css', svg: 'image/svg+xml', json: 'application/json' }[ext] || 'text/plain';
      c.header('Content-Type', mime);
      return c.body(content);
    } catch {
      return null;
    }
  };

  app.get('/', async (c) => serveStatic(c, 'index.html') || c.text('brain-memory UI — run `npm run build:ui` to build frontend'));
  app.get('/assets/*', async (c) => serveStatic(c, c.req.path.slice(1)) || c.text('Not found', 404));

  // Canvas 嵌入视图
  app.get('/embed/dashboard', async (c) => {
    const html = readFileSync(join(uiPublicPath, 'embed-dashboard.html'), 'utf-8');
    c.header('Content-Type', 'text/html');
    return c.body(html);
  });

  // ─── API Routes ──────────────────────────────────────────

  const api = new Hono();
  api.use('*', auth);

  const statsController = createStatsController(ctx);
  api.get('/stats', statsController.getStats);
  api.get('/stats/decay', statsController.getDecay);

  const nodesController = createNodesController(ctx);
  api.get('/nodes', nodesController.list);
  api.get('/nodes/:id', nodesController.detail);

  const nodesEdit = createNodesEditController(ctx);
  api.post('/nodes', nodesEdit.create);
  api.put('/nodes/:id', nodesEdit.update);
  api.delete('/nodes/:id', nodesEdit.remove);
  api.post('/nodes/merge', nodesEdit.merge);

  const graphController = createGraphController(ctx);
  api.get('/graph', graphController.getGraph);
  api.get('/graph/community/:id', graphController.getCommunity);

  const configController = createConfigController(ctx);
  api.get('/config', configController.getConfig);
  api.put('/config', configController.putConfig);

  app.route('/api', api);

  // ─── WebSocket ───────────────────────────────────────────

  app.get('/ws', (c) => {
    if (!wss) return c.text('WebSocket not ready', 503);
    // Token check
    const token = c.req.query('token') || c.req.header('Authorization')?.replace('Bearer ', '');
    if (config.authToken && token !== config.authToken) {
      return c.text('Unauthorized', 401);
    }
    // Hono can't directly upgrade to WebSocket, handled via HTTP server upgrade
    return c.text('Use ws:// upgrade');
  });

  // ─── Start / Stop ────────────────────────────────────────

  function start(port?: number): number {
    const actualPort = port || config.port || 0;
    const hostname = config.bind === 'lan' ? '0.0.0.0' : '127.0.0.1';

    // Node.js 原生 HTTP server
    const httpServer = createServer(async (req, res) => {
      // Hono fetch 处理请求
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (v) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
      }
      const init: RequestInit = {
        method: req.method || 'GET',
        headers,
        ...(req.method !== 'GET' && req.method !== 'HEAD' ? {
          body: await readRequestBody(req),
        } : {}),
      };
      const request = new Request(url.toString(), init);
      const response = await app.fetch(request);

      res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      if (response.body) {
        const reader = response.body.getReader();
        const pump = async () => {
          const { done, value } = await reader.read();
          if (done) { res.end(); return; }
          res.write(value);
          await pump();
        };
        await pump();
      } else {
        res.end();
      }
    });

    // WebSocket 共享同一个 HTTP server
    wss = new WebSocketServer({ server: httpServer });
    setupWebSocket(wss, eventBus, config);

    httpServer.listen(actualPort, hostname, () => {
      const addr = httpServer.address();
      const p = typeof addr === 'object' && addr ? addr.port : actualPort;
      logger.info('ui', `UI available at http://${hostname === '0.0.0.0' ? 'localhost' : hostname}:${p}`);
    });

    const addr = httpServer.address();
    const p = typeof addr === 'object' && addr !== null ? (addr as import('net').AddressInfo).port : actualPort;
    return p;
  }

  async function stop(): Promise<void> {
    if (wss) { wss.close(); wss = null; }
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = null;
    }
    eventBus.removeAllListeners();
  }

  return { app, start, stop, eventBus };
}

// ─── Helpers ───────────────────────────────────────────────

async function readRequestBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: Buffer) => body += chunk.toString());
    req.on('end', () => resolve(body));
  });
}

// ─── WebSocket setup ───────────────────────────────────────

function setupWebSocket(wss: WebSocketServer, bus: EventEmitter, config: UiServerConfig) {
  const clients = new Set<WebSocket>();

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const token = url.searchParams.get('token');
    if (config.authToken && token !== config.authToken) {
      ws.close(4001, 'Unauthorized');
      return;
    }
    clients.add(ws);
    ws.send(JSON.stringify({ event: 'connected', data: { timestamp: Date.now() } }));
    ws.on('close', () => clients.delete(ws));
  });

  const broadcast = (event: string, data: unknown) => {
    const msg = JSON.stringify({ event, data, timestamp: Date.now() });
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    }
  };

  bus.on('stats:updated', (data) => broadcast('stats:updated', data));
  bus.on('node:created', (data) => broadcast('node:created', data));
  bus.on('node:updated', (data) => broadcast('node:updated', data));
  bus.on('node:deprecated', (data) => broadcast('node:deprecated', data));
}
