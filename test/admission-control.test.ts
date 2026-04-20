/**
 * brain-memory — Admission control tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, insertNode, insertVector } from "./helpers.ts";
import { AdmissionController, DEFAULT_ADMISSION_CONFIG } from "../src/retriever/admission-control.ts";

let db: ReturnType<typeof createTestDb>;

beforeEach(() => { db = createTestDb(); });

describe("AdmissionController — disabled", () => {
  it("accepts everything when disabled", () => {
    const ctrl = new AdmissionController(db, { ...DEFAULT_ADMISSION_CONFIG, enabled: false });
    const result = ctrl.evaluate({ name: "test", content: "short", category: "tasks" });
    expect(result.decision).toBe("accept");
  });
});

describe("AdmissionController — content length", () => {
  it("rejects short content", () => {
    const ctrl = new AdmissionController(db, { ...DEFAULT_ADMISSION_CONFIG, enabled: true, minContentLength: 10 });
    const result = ctrl.evaluate({ name: "test", content: "short", category: "tasks" });
    expect(result.decision).toBe("reject");
    expect(result.reason).toContain("content too short");
  });

  it("accepts content above threshold", () => {
    const ctrl = new AdmissionController(db, { ...DEFAULT_ADMISSION_CONFIG, enabled: true, minContentLength: 10 });
    const result = ctrl.evaluate({ name: "test", content: "this is a longer content string", category: "tasks" });
    expect(result.decision).toBe("accept");
  });
});

describe("AdmissionController — type priors", () => {
  it("accepts high-priority types", () => {
    const ctrl = new AdmissionController(db, { ...DEFAULT_ADMISSION_CONFIG, enabled: true });
    const result = ctrl.evaluate({ name: "test", content: "some content here", category: "profile" });
    expect(result.decision).toBe("accept");
  });

  it("accepts medium-priority types", () => {
    const ctrl = new AdmissionController(db, { ...DEFAULT_ADMISSION_CONFIG, enabled: true });
    const result = ctrl.evaluate({ name: "test", content: "some content here", category: "events" });
    // events has typePrior 0.45 which is > 0.3
    expect(result.decision).toBe("accept");
  });
});

describe("AdmissionController — duplicate detection", () => {
  it("rejects duplicate by content overlap", () => {
    // Insert an existing node
    insertNode(db, {
      name: "existing-skill", type: "SKILL", category: "skills",
      content: "Docker setup with port mapping and volume mounting",
      sessions: ["s1"],
    });

    const ctrl = new AdmissionController(db, {
      ...DEFAULT_ADMISSION_CONFIG, enabled: true,
      duplicateThreshold: 0.5, // Low threshold for testing
    });

    const result = ctrl.evaluate({
      name: "existing-skill", // Same name will trigger search
      content: "Docker setup with port mapping and volume mounting",
      category: "skills",
    });

    expect(result.decision).toBe("reject");
    expect(result.reason).toContain("high content overlap");
  });

  it("accepts unique content", () => {
    insertNode(db, {
      name: "docker-setup", type: "SKILL", category: "skills",
      content: "Docker container configuration",
      sessions: ["s1"],
    });

    const ctrl = new AdmissionController(db, {
      ...DEFAULT_ADMISSION_CONFIG, enabled: true,
      duplicateThreshold: 0.85,
    });

    const result = ctrl.evaluate({
      name: "python-debugging",
      content: "Python debugging with pdb and breakpoints",
      category: "skills",
    });

    expect(result.decision).toBe("accept");
  });
});
