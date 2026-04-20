/**
 * brain-memory — Query expander tests
 */

import { describe, it, expect } from "vitest";
import { expandQuery } from "../src/retriever/query-expander.ts";

describe("expandQuery", () => {
  it("returns unchanged query when no match", () => {
    expect(expandQuery("hello world")).toBe("hello world");
    expect(expandQuery("random query")).toBe("random query");
  });

  it("expands Chinese error terms", () => {
    const result = expandQuery("服务器挂了");
    expect(result).toContain("崩溃");
    expect(result).toContain("error");
    expect(result.length).toBeGreaterThan("服务器挂了".length);
  });

  it("expands English config terms", () => {
    const result = expandQuery("Docker config");
    expect(result).toContain("配置");
    expect(result).toContain("configuration");
    expect(result).toContain("容器"); // Docker synonym expansion
  });

  it("does not duplicate existing terms", () => {
    const result = expandQuery("报错 error");
    // Should not add "error" again since it's already in query
    expect(result.toLowerCase()).not.toMatch(/error\s+error/i);
  });

  it("handles short queries", () => {
    expect(expandQuery("a")).toBe("a");
    expect(expandQuery("")).toBe("");
  });

  it("expands deploy terms", () => {
    const result = expandQuery("部署到生产环境");
    expect(result).toContain("deploy");
    expect(result).toContain("上线");
  });
});
