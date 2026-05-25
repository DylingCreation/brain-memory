/**
 * brain-memory — User preference slot extraction
 *
 * @deprecated v1.8.0 — 死代码，从未集成到提取管线。
 * 偏好提取由 src/extractor/extract.ts 的 LLM 提示词完成。
 * 此文件仅保留作参考，不在任何运行路径中使用。
 * 0% 测试覆盖率。lite/small 模式下自动跳过。
 *
 * ⚠️ DEAD CODE — #22 cleanup (2026-04-25)
 * These functions were never integrated into the extraction pipeline.
 * Preference extraction is handled entirely by the LLM-based extractor
 * in `src/extractor/extract.ts` (EXTRACT_SYS prompt).
 *
 * The regex-based patterns below had limited coverage and were never wired up.
 * Kept as reference only — do not use in production.
 *
 * If you want to revive regex preference extraction as a fallback,
 * wire `extractPreferences()` into the extractor pipeline and add tests.
 */

import type { MemoryCategory } from '../types';

/** 偏好槽：用户偏好的结构化存储单元。 */
export interface PreferenceSlot {
  category: string;
  key: string;
  value: string;
  confidence: number;
}

export interface PreferenceExtractionResult {
  slots: PreferenceSlot[];
  category: MemoryCategory;
}

// ── Dead code removed (#22, 2026-04-25) ───────────────────────
// PREFERENCE_PATTERNS, extractPreferences(), formatPreferencesForStorage()
// were never wired into the extraction pipeline. Preference extraction is
// handled by the LLM-based extractor in src/extractor/extract.ts.
// See the commit message for the removed code if you want to revive it.
