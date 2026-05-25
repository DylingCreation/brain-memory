/**
 * brain-memory UI — Stats Controller
 *
 * GET /api/stats        → 存储统计 + 最近活动
 * GET /api/stats/decay  → 衰减状态概览
 */

import type { UiServerContext } from '../server';
import { existsSync, statSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

type HonoHandler = (c: any) => any;

export function createStatsController(ctx: UiServerContext) {
  const { storage, eventBus } = ctx;

  const getStats: HonoHandler = async (c) => {
    const stats = storage.getStats();

    // 计算衰减状态
    const allActive = storage.findAllActive();
    let healthy = 0, fading = 0, forgotten = 0;
    for (const n of allActive) {
      const imp = (n as any).importance ?? 0.5;
      if (imp > 0.7) healthy++;
      else if (imp > 0.3) fading++;
      else forgotten++;
    }

    // 数据库文件大小
    let dbSizeBytes = 0;
    try {
      const dbPath = (storage as any).dbPath || join(homedir(), '.openclaw', 'brain-memory.db');
      if (existsSync(dbPath)) dbSizeBytes = statSync(dbPath).size;
    } catch {}

    return c.json({
      ...stats,
      decay: { healthy, fading, forgotten },
      dbSizeBytes,
      dbSizeReadable: dbSizeBytes < 1024 * 1024
        ? `${(dbSizeBytes / 1024).toFixed(1)} KB`
        : `${(dbSizeBytes / (1024 * 1024)).toFixed(1)} MB`,
      timestamp: Date.now(),
    });
  };

  const getDecay: HonoHandler = (c) => {
    const allActive = storage.findAllActive();
    let healthy = 0, fading = 0, forgotten = 0;
    const decayCurve: Array<{ days: number; retention: number }> = [];

    for (const n of allActive) {
      const imp = (n as any).importance ?? 0.5;
      if (imp > 0.7) healthy++;
      else if (imp > 0.3) fading++;
      else forgotten++;
    }

    // 标准衰减曲线（30 天半衰期）
    for (let d = 0; d <= 90; d += 5) {
      decayCurve.push({ days: d, retention: Math.exp(-d / 30) });
    }

    return c.json({ healthy, fading, forgotten, decayCurve });
  };

  return { getStats, getDecay };
}
