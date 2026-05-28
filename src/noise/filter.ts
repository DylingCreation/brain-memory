/**
 * brain-memory — Noise filter
 *
 * From memory-lancedb-pro: filters out low-signal content (greetings, short acks, etc.)
 * Authors: win4r (memory-lancedb-pro), brain-memory contributors
 */

import type { NoiseFilterConfig } from '../types';

const GREETING_RE = /^(hi|hello|hey|hallo|ohayo|こん|안녕|ciao|bonjour|halo|喂|你好|哈喽|嗨|嘿)/i;
const THANKS_RE = /^(thanks?|thank you|thx|ty|谢谢|感谢|多谢|merci|gracias|danke)/i;
const NOISE_RE = /^(ok|okay|k|yes|no|yep|nope|sure|好的|收到|嗯嗯|哈哈|呵呵|👍|👌|✅|❤️)/i;

/** 噪声检测：判断消息是否太短或无意义。 */
export function isNoise(text: string, cfg: NoiseFilterConfig): boolean {
  const trimmed = text.trim();
  if (trimmed.length < cfg.minContentLength) return true;
  if (GREETING_RE.test(trimmed)) return true;
  if (THANKS_RE.test(trimmed)) return true;
  if (NOISE_RE.test(trimmed) && trimmed.length < 50) return true;
  return false;
}

// ─── Recall pre-filter ─────────────────────────────────────

/** Low-information patterns that don't warrant a recall query. */
const RECALL_SKIP_EMOJI = new Set(['👍','👌','✅','❌','❤️','😂','🙏','🔥','💯']);

const RECALL_SKIP_PATTERNS = [
  /^(好的|收到|嗯嗯|哦哦|哈哈|呵呵|行|可以|OK|ok|okay|k+|yes|no|yep|nope|sure|right|fine|got it|gotcha|继续|go on|next|然后|然后呢|之后|之后呢)$/i,
  /^(嗯|哦|啊|哈|额|呃|咦|哟|嗨|嘿)$/,
];

/**
 * 判断用户消息是否值得触发记忆召回。
 * 低信息量的确认/寒暄/单字回复不应浪费召回资源。
 *
 * @returns true 如果应该召回，false 如果跳过
 */
export function shouldRecall(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;

  // Very short messages (< 3 chars) almost never contain meaningful queries
  if (trimmed.length < 3) return false;

  // Check against low-information patterns
  for (const pattern of RECALL_SKIP_PATTERNS) {
    if (pattern.test(trimmed)) return false;
  }

  // Pure emoji reactions don't need recall
  if ([...trimmed].every(c => RECALL_SKIP_EMOJI.has(c))) return false;

  // Pure greetings don't need recall
  if (GREETING_RE.test(trimmed) && trimmed.length < 15) return false;

  return true;
}
