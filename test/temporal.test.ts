/**
 * brain-memory — Temporal classifier tests
 */

import { describe, it, expect } from "vitest";
import { classifyTemporal } from "../src/temporal/classifier.ts";

describe("classifyTemporal", () => {
  it("classifies static knowledge", () => {
    expect(classifyTemporal("The algorithm uses a binary search tree")).toBe("static");
    expect(classifyTemporal("Python is a programming language")).toBe("static");
    expect(classifyTemporal("Definition of REST API")).toBe("static");
  });

  it("classifies dynamic content", () => {
    expect(classifyTemporal("The server is currently down")).toBe("dynamic");
    expect(classifyTemporal("Version 2.1.0 has a bug")).toBe("dynamic");
    expect(classifyTemporal("This is a temporary fix")).toBe("dynamic");
  });

  it("defaults to static for ambiguous content", () => {
    expect(classifyTemporal("something happened")).toBe("static");
    expect(classifyTemporal("discussed the project")).toBe("static");
  });
});
