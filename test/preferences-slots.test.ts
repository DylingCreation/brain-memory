/**
 * brain-memory — Preference slots tests
 *
 * ⚠️ Tests removed along with dead code (#22, 2026-04-25).
 * The regex-based preference extraction (extractPreferences, formatPreferencesForStorage)
 * was never wired into the pipeline and has been removed.
 *
 * Preference extraction is now handled by the LLM-based extractor in
 * src/extractor/extract.ts (EXTRACT_SYS prompt).
 *
 * If you revive the regex-based fallback, restore these tests.
 */

import { describe, it, expect } from "vitest";
import type { PreferenceSlot } from "../src/preferences/slots.ts";

describe("PreferenceSlot interface (kept as reference)", () => {
  it("type-checks correctly", () => {
    const slot: PreferenceSlot = {
      category: "language",
      key: "response_language",
      value: "Chinese",
      confidence: 0.8,
    };
    expect(slot.category).toBe("language");
    expect(slot.confidence).toBe(0.8);
  });
});
