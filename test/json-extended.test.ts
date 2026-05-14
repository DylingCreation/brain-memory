/**
 * F-9 覆盖率补全 — json.ts 扩展测试
 */
import { describe, it, expect } from "vitest";
import { tryFixJson, extractJsonTolerant, extractJson } from "../src/utils/json";

describe("tryFixJson", () => {
  it("fixes trailing comma in object", () => {
    expect(tryFixJson('{"a":1,"b":2,}')).toBe('{"a":1,"b":2}');
  });

  it("fixes trailing comma in array", () => {
    expect(tryFixJson('{"a":[1,2,]}')).toBe('{"a":[1,2]}');
  });

  it("fixes unquoted keys", () => {
    const result = tryFixJson('{name:"value",age:30}');
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it("fixes single-quoted strings", () => {
    const result = tryFixJson("{'name':'hello'}");
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it("fixes control characters", () => {
    const result = tryFixJson('{"a":"line1\nline2"}');
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it("returns valid JSON unchanged", () => {
    expect(tryFixJson('{"a":1}')).toBe('{"a":1}');
  });
});

describe("extractJsonTolerant", () => {
  it("returns valid JSON as-is", () => {
    expect(extractJsonTolerant('{"a":1}')).toBe('{"a":1}');
  });

  it("recovers from code fences with bad JSON", () => {
    const result = extractJsonTolerant('```json\n{"a":1,\n}\n```');
    expect(result).toBe('{"a":1}');
  });

  it("finds JSON in noisy text", () => {
    const result = extractJsonTolerant('some text {"a":1} more text');
    expect(result).toBe('{"a":1}');
  });

  it("handles truncated JSON (Step 4)", () => {
    // Missing closing brace — should still try to fix
    const result = extractJsonTolerant('{"a":1,"b":2');
    expect(result).not.toBeNull();
  });

  it("returns null for completely invalid input", () => {
    expect(extractJsonTolerant("no json here at all")).toBeNull();
  });

  it("handles unclosed think tags", () => {
    const result = extractJsonTolerant('<think>reasoning\n{"a":1}');
    expect(() => JSON.parse(result!)).not.toThrow();
  });
});
