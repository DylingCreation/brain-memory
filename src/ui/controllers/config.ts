/**
 * brain-memory UI — Config Controller
 *
 * GET /api/config   → 读取当前配置 + JSON Schema
 * PUT /api/config   → 保存配置到 openclaw.json
 */

import { readFileSync, writeFileSync, existsSync, renameSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import type { UiServerContext } from '../server';

type HonoHandler = (c: any) => any;

// ─── Config path resolution ───────────────────────────────

function resolveConfigPath(): string {
  const home = homedir();
  const candidates = [
    join(home, '.openclaw', 'openclaw.json'),
    join(process.env.APPDATA || home, 'openclaw', 'openclaw.json'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return candidates[0];
}

// ─── Safe JSON5-ish parse (handles comments + trailing commas) ──

function parseOpenClawConfig(raw: string): any {
  // 去除单行注释
  let cleaned = raw.replace(/\/\/.*$/gm, '');
  // 去除尾逗号
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(cleaned);
}

export function createConfigController(ctx: UiServerContext) {
  const { eventBus } = ctx;

  const getConfig: HonoHandler = (c) => {
    try {
      const configPath = resolveConfigPath();
      if (!existsSync(configPath)) {
        return c.json({ error: 'openclaw.json not found' }, 404);
      }
      const raw = readFileSync(configPath, 'utf-8');
      const config = parseOpenClawConfig(raw);
      const bmConfig = config?.plugins?.entries?.['brain-memory']?.config || {};

      // 读取 configSchema 从 openclaw.plugin.json
      let schema: any = {};
      try {
        const pluginJsonPath = join(dirname(configPath), '..', 'plugins', 'brain-memory', 'openclaw.plugin.json');
        const altPath = join(process.cwd(), 'openclaw.plugin.json');
        for (const p of [altPath, pluginJsonPath]) {
          if (existsSync(p)) {
            schema = JSON.parse(readFileSync(p, 'utf-8')).configSchema;
            break;
          }
        }
      } catch {}

      return c.json({
        config: bmConfig,
        schema,
        source: configPath,
        lastModified: existsSync(configPath)
          ? new Date((require('fs').statSync(configPath)).mtimeMs).toISOString()
          : '',
      });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  };

  const putConfig: HonoHandler = async (c) => {
    try {
      const body = await c.req.json();
      const configPath = resolveConfigPath();
      if (!existsSync(configPath)) {
        return c.json({ error: 'openclaw.json not found' }, 404);
      }

      // 读取现有配置
      const raw = readFileSync(configPath, 'utf-8');
      const config = parseOpenClawConfig(raw);

      // 备份
      const bak = `${configPath}.bak`;
      try { copyFileSync(configPath, bak); } catch {}

      // 深度合并 brain-memory 配置
      if (!config.plugins) config.plugins = {};
      if (!config.plugins.entries) config.plugins.entries = {};
      if (!config.plugins.entries['brain-memory']) config.plugins.entries['brain-memory'] = {};
      config.plugins.entries['brain-memory'].config = {
        ...config.plugins.entries['brain-memory'].config,
        ...body,
      };

      // 写回（原子操作：先写临时文件，再 rename）
      const tmp = `${configPath}.tmp`;
      writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf-8');
      renameSync(tmp, configPath);

      // 记录变更
      const changed = Object.keys(body);
      eventBus.emit('config:changed', { diff: changed, requiresRestart: true });

      return c.json({
        saved: true,
        message: '配置已保存，重启 Gateway 后生效',
        requiresRestart: true,
        diff: { changed, unchanged: 'other' },
      });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  };

  return { getConfig, putConfig };
}
