/**
 * brain-memory UI — 认证中间件
 *
 * 从 Gateway 配置读取 auth token，校验 HTTP 请求。
 * 未配置 token 时放行所有请求（localhost 模式）。
 */

import type { MiddlewareHandler } from 'hono';

export function createAuthMiddleware(token?: string): MiddlewareHandler {
  return async (c, next) => {
    if (!token) {
      await next();
      return;
    }
    const reqToken = c.req.header('Authorization')?.replace('Bearer ', '')
      || c.req.query('token');
    if (reqToken !== token) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    await next();
  };
}
