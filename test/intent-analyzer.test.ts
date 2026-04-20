/**
 * brain-memory — Intent analyzer tests
 */

import { describe, it, expect } from "vitest";
import { analyzeIntent } from "../src/retriever/intent-analyzer.ts";

describe("analyzeIntent", () => {
  it("detects technical intent (how-to)", () => {
    const result = analyzeIntent("怎么配置 Docker 容器？");
    expect(result.intent).toBe("technical");
    expect(result.scores.technical).toBeGreaterThan(0);
  });

  it("detects error/technical intent", () => {
    const result = analyzeIntent("报错：connection refused");
    expect(result.intent).toBe("technical");
  });

  it("detects preference intent", () => {
    const result = analyzeIntent("我更喜欢用 TypeScript");
    expect(result.intent).toBe("preference");
  });

  it("detects factual intent", () => {
    const result = analyzeIntent("Python 是什么？");
    expect(result.intent).toBe("factual");
  });

  it("detects task intent", () => {
    const result = analyzeIntent("任务进度更新");
    expect(result.intent).toBe("task");
    expect(result.scores.task).toBeGreaterThan(0);
  });

  it("defaults to general for ambiguous queries", () => {
    // "怎么样" contains "怎么" so avoid that
    const result = analyzeIntent("今天天气");
    expect(result.intent).toBe("general");
    expect(result.scores.general).toBe(1);
  });

  it("handles English queries", () => {
    const result = analyzeIntent("How to deploy with Docker?");
    expect(result.intent).toBe("technical");
  });
});
