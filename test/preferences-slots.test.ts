/**
 * brain-memory — Preference slots tests
 */

import { describe, it, expect } from "vitest";
import { extractPreferences, formatPreferencesForStorage } from "../src/preferences/slots.ts";

describe("extractPreferences", () => {
  it("detects language preference (positive)", () => {
    const result = extractPreferences("我喜欢用中文回复");
    expect(result.slots.length).toBeGreaterThan(0);
    expect(result.category).toBe("preferences");
  });

  it("detects language preference (English)", () => {
    const result = extractPreferences("I prefer English responses");
    expect(result.slots.length).toBeGreaterThan(0);
  });

  it("detects language preference (negative)", () => {
    const result = extractPreferences("不要中文");
    expect(result.slots.length).toBeGreaterThan(0);
  });

  it("detects communication style", () => {
    const result = extractPreferences("简短回复");
    expect(result.slots.length).toBeGreaterThan(0);
    const slot = result.slots.find(s => s.key === "response_detail");
    expect(slot?.value).toBe("concise");
  });

  it("detects detailed communication style", () => {
    const result = extractPreferences("请详细解释");
    expect(result.slots.length).toBeGreaterThan(0);
    const slot = result.slots.find(s => s.key === "response_detail");
    expect(slot?.value).toBe("detailed");
  });

  it("detects code style preference", () => {
    const result = extractPreferences("用 Prettier");
    expect(result.slots.length).toBeGreaterThan(0);
  });

  it("detects tool preference", () => {
    const result = extractPreferences("我喜欢用 VS Code");
    expect(result.slots.length).toBeGreaterThan(0);
  });

  it("returns empty for non-preference text", () => {
    const result = extractPreferences("Docker 部署成功了");
    expect(result.slots.length).toBe(0);
  });
});

describe("formatPreferencesForStorage", () => {
  it("formats slots by category", () => {
    const result = extractPreferences("我喜欢用中文，简短回复");
    const formatted = formatPreferencesForStorage(result.slots);
    expect(formatted.length).toBeGreaterThan(0);
    expect(formatted).toContain("[");
    expect(formatted).toContain(":");
  });

  it("returns empty string for no slots", () => {
    expect(formatPreferencesForStorage([])).toBe("");
  });
});
