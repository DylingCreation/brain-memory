/**
 * brain-memory — User preference slot extraction
 *
 * Extracts structured user preferences from conversations:
 * - Language preferences (e.g., "用中文回复", "Python only")
 * - Tool preferences (e.g., "喜欢用 VS Code", "不要 Docker")
 * - Code style preferences (e.g., "用 Prettier", "ESLint strict")
 * - Communication preferences (e.g., "简短回复", "详细说明")
 */

import type { MemoryCategory } from "../types";

export interface PreferenceSlot {
  category: string;
  key: string;
  value: string;
  confidence: number;
}

// Preference extraction patterns
const PREFERENCE_PATTERNS: Array<{
  pattern: RegExp;
  category: string;
  extractor: (match: RegExpMatchArray) => { key: string; value: string };
}> = [
  // Language: "用中文", "English only", "不要中文"
  {
    pattern: /(用|使用|喜欢|偏好|prefer|use)\s*(中文|英文|English|Chinese|日语|Japanese)/i,
    category: "language",
    extractor: (m) => ({ key: "response_language", value: m[2] ?? "" }),
  },
  // Negative language: "不要中文", "no English"
  {
    pattern: /(不要|不用|不喜欢|don't\s*(use|like)|avoid)\s*(中文|英文|English|Chinese)/i,
    category: "language",
    extractor: (m) => ({ key: "avoid_language", value: m[2] ?? "" }),
  },
  // Code style: "用 Prettier", "ESLint strict", "不要分号"
  {
    pattern: /(用|使用|喜欢|prefer)\s*(Prettier|ESLint|黑括号|分号|缩进|tab|space)/i,
    category: "code_style",
    extractor: (m) => ({ key: m[2]?.toLowerCase() ?? "", value: "enabled" })
  },
  {
    pattern: /(不要|不用|避免|don't|avoid)\s*(分号|缩进|Prettier|ESLint|tab)/i,
    category: "code_style",
    extractor: (m) => ({ key: m[2]?.toLowerCase() ?? "", value: "disabled" })
  },
  // Tool: "用 VS Code", "不要 Docker", "喜欢 neovim"
  {
    pattern: /(用|使用|喜欢|prefer|like)\s*(VS\s*Code|Docker|neovim|Vim|IntelliJ|PyCharm|Zed)/i,
    category: "tool",
    extractor: (m) => ({ key: "preferred_tool", value: m[2]?.replace(/\s*/g, "") ?? "" })
  },
  // Communication: "简短回复", "详细说明", "用中文解释"
  {
    pattern: /(简短|简洁|详细|详细解释|说重点|tl;dr)/i,
    category: "communication",
    extractor: (m) => ({ key: "response_detail", value: m[1]?.includes("详") ? "detailed" : "concise" })
  },
];

export interface PreferenceExtractionResult {
  slots: PreferenceSlot[];
  category: MemoryCategory;
}

/**
 * Extract preference slots from conversation text.
 * Returns structured preferences that can be stored as preference nodes.
 */
export function extractPreferences(text: string): PreferenceExtractionResult {
  const slots: PreferenceSlot[] = [];

  for (const { pattern, category, extractor } of PREFERENCE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const extracted = extractor(match);
      const key = extracted?.key ?? "";
      const value = extracted?.value ?? "";
      slots.push({
        category,
        key: key,
        value: value,
        confidence: 0.8, // Rule-based extraction has high confidence
      });
    }
  }

  return {
    slots,
    category: "preferences",
  };
}

/**
 * Format preference slots into a node content string for storage.
 */
export function formatPreferencesForStorage(slots: PreferenceSlot[]): string {
  if (slots.length === 0) return "";

  const byCategory = new Map<string, PreferenceSlot[]>();
  for (const slot of slots) {
    if (!byCategory.has(slot.category)) byCategory.set(slot.category, []);
    byCategory.get(slot.category)!.push(slot);
  }

  const lines: string[] = [];
  for (const [cat, catSlots] of byCategory) {
    lines.push(`[${cat}]`);
    for (const s of catSlots) {
      lines.push(`  ${s.key}: ${s.value}`);
    }
  }

  return lines.join("\n");
}
