/**
 * brain-memory — Working Memory tests
 */

import { describe, it, expect } from "vitest";
import {
  createWorkingMemory,
  updateWorkingMemory,
  buildWorkingMemoryContext,
} from "../src/working-memory/manager.ts";

const defaultConfig = {
  enabled: true,
  maxTasks: 3,
  maxDecisions: 5,
  maxConstraints: 5,
};

describe("createWorkingMemory", () => {
  it("creates empty state", () => {
    const wm = createWorkingMemory();
    expect(wm.currentTasks).toEqual([]);
    expect(wm.recentDecisions).toEqual([]);
    expect(wm.constraints).toEqual([]);
    expect(wm.attention).toBe("");
  });
});

describe("updateWorkingMemory", () => {
  it("extracts tasks from TASK nodes", () => {
    const wm = createWorkingMemory();
    updateWorkingMemory(wm, defaultConfig, {
      extractedNodes: [
        { name: "fix-docker-port", category: "tasks", type: "TASK", content: "Fix Docker port conflict" },
        { name: "deploy-api", category: "tasks", type: "TASK", content: "Deploy API service" },
      ],
      userMessage: "",
    });
    // Newest (last extracted) first
    expect(wm.currentTasks).toEqual(["deploy-api", "fix-docker-port"]);
  });

  it("extracts constraints from preference nodes", () => {
    const wm = createWorkingMemory();
    updateWorkingMemory(wm, defaultConfig, {
      extractedNodes: [
        { name: "chinese-replies", category: "preferences", type: "TASK", content: "Use Chinese", description: "Respond in Chinese" },
      ],
      userMessage: "",
    });
    expect(wm.constraints.length).toBeGreaterThan(0);
    expect(wm.constraints[0]).toContain("chinese-replies");
  });

  it("extracts attention from user message", () => {
    const wm = createWorkingMemory();
    updateWorkingMemory(wm, defaultConfig, {
      extractedNodes: [],
      userMessage: "帮我看看这个 Docker 部署的问题",
    });
    expect(wm.attention).toBe("帮我看看这个 Docker 部署的问题");
  });

  it("cleans user message (removes code blocks)", () => {
    const wm = createWorkingMemory();
    updateWorkingMemory(wm, defaultConfig, {
      extractedNodes: [],
      userMessage: "运行这个\n```\ncode here\n```",
    });
    expect(wm.attention).toBe("运行这个");
  });

  it("respects maxTasks limit", () => {
    const wm = createWorkingMemory();
    const cfg = { ...defaultConfig, maxTasks: 2 };

    updateWorkingMemory(wm, cfg, {
      extractedNodes: [
        { name: "task-1", category: "tasks", type: "TASK", content: "" },
        { name: "task-2", category: "tasks", type: "TASK", content: "" },
        { name: "task-3", category: "tasks", type: "TASK", content: "" },
      ],
      userMessage: "",
    });

    expect(wm.currentTasks).toEqual(["task-3", "task-2"]);
    expect(wm.currentTasks).not.toContain("task-1");
  });

  it("respects maxDecisions limit", () => {
    const wm = createWorkingMemory();
    const cfg = { ...defaultConfig, maxDecisions: 3 };

    updateWorkingMemory(wm, cfg, {
      extractedNodes: [
        { name: "d-1", category: "events", type: "EVENT", content: "" },
        { name: "d-2", category: "events", type: "EVENT", content: "" },
        { name: "d-3", category: "events", type: "EVENT", content: "" },
        { name: "d-4", category: "events", type: "EVENT", content: "" },
      ],
      userMessage: "",
    });

    expect(wm.recentDecisions.length).toBe(3);
  });

  it("does not duplicate decisions across turns", () => {
    const wm = createWorkingMemory();

    updateWorkingMemory(wm, defaultConfig, {
      extractedNodes: [
        { name: "shared-node", category: "events", type: "EVENT", content: "" },
        { name: "new-node", category: "events", type: "EVENT", content: "" },
      ],
      userMessage: "",
    });

    expect(wm.recentDecisions).toContain("shared-node");
    expect(wm.recentDecisions).toContain("new-node");

    // Second turn with same node
    updateWorkingMemory(wm, defaultConfig, {
      extractedNodes: [
        { name: "shared-node", category: "events", type: "EVENT", content: "" },
        { name: "another-node", category: "events", type: "EVENT", content: "" },
      ],
      userMessage: "",
    });

    expect(wm.recentDecisions.filter(n => n === "shared-node").length).toBe(1);
    expect(wm.recentDecisions).toContain("another-node");
  });

  it("does nothing when disabled", () => {
    const wm = createWorkingMemory();
    const disabledConfig = { ...defaultConfig, enabled: false };

    updateWorkingMemory(wm, disabledConfig, {
      extractedNodes: [
        { name: "task-1", category: "tasks", type: "TASK", content: "" },
      ],
      userMessage: "Hello",
    });

    expect(wm.currentTasks).toEqual([]);
    expect(wm.attention).toBe("");
  });
});

describe("buildWorkingMemoryContext", () => {
  it("returns null when empty", () => {
    const wm = createWorkingMemory();
    expect(buildWorkingMemoryContext(wm)).toBeNull();
  });

  it("builds context with all fields", () => {
    const wm = createWorkingMemory();
    wm.currentTasks = ["fix-docker"];
    wm.recentDecisions = ["deploy-api"];
    wm.constraints = ["chinese-replies: Use Chinese"];
    wm.attention = "Deploy the API";

    const ctx = buildWorkingMemoryContext(wm);
    expect(ctx).not.toBeNull();
    expect(ctx).toContain("<working_memory>");
    expect(ctx).toContain("Current Tasks");
    expect(ctx).toContain("Recent Decisions");
    expect(ctx).toContain("Constraints & Preferences");
    expect(ctx).toContain("Current Focus");
    expect(ctx).toContain("</working_memory>");
  });

  it("only includes non-empty sections", () => {
    const wm = createWorkingMemory();
    wm.currentTasks = ["task-1"];

    const ctx = buildWorkingMemoryContext(wm);
    expect(ctx).not.toBeNull();
    expect(ctx).toContain("Current Tasks");
    expect(ctx).not.toContain("Recent Decisions");
    expect(ctx).not.toContain("Constraints");
  });
});
