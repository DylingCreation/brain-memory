/**
 * brain-memory — Noise filter
 *
 * From memory-lancedb-pro: filters out low-signal content (greetings, short acks, etc.)
 * Authors: win4r (memory-lancedb-pro), brain-memory contributors
 */

import type { NoiseFilterConfig } from "../types";

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
