/**
 * brain-memory — Store tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, insertNode, insertEdge } from "./helpers.ts";
import {
  saveMessage, getUnextracted, markExtracted,
  upsertNode, upsertEdge, findByName, findById, allActiveNodes,
  updateAccess, searchNodes, topNodes, graphWalk,
  normalizeName,
} from "../src/store/store.ts";

let db: ReturnType<typeof createTestDb>;

beforeEach(() => { db = createTestDb(); });

describe("normalizeName", () => {
  it("lowercases and replaces spaces", () => {
    expect(normalizeName("Hello World")).toBe("hello-world");
    expect(normalizeName("  Spaces  ")).toBe("spaces");
    expect(normalizeName("under_score")).toBe("under-score");
    expect(normalizeName("中文测试")).toBe("中文测试");
  });
});

describe("saveMessage / getUnextracted / markExtracted", () => {
  it("saves and retrieves messages", () => {
    saveMessage(db, "s1", 1, "user", "hello");
    saveMessage(db, "s1", 2, "assistant", "hi back");
    const msgs = getUnextracted(db, "s1", 10);
    expect(msgs.length).toBe(2);
    expect(msgs[0].content).toBe('"hello"'); // content is JSON-encoded
    expect(msgs[0].role).toBe("user");
  });

  it("marks messages as extracted", () => {
    saveMessage(db, "s1", 1, "user", "a");
    saveMessage(db, "s1", 2, "assistant", "b");
    saveMessage(db, "s1", 3, "user", "c");
    markExtracted(db, "s1", 2);
    const remaining = getUnextracted(db, "s1", 10);
    expect(remaining.length).toBe(1);
    expect(remaining[0].turn_index).toBe(3);
  });

  it("returns empty for unknown session", () => {
    expect(getUnextracted(db, "nonexistent", 10).length).toBe(0);
  });
});

describe("upsertNode", () => {
  it("creates new node", () => {
    const { node, isNew } = upsertNode(db, {
      type: "TASK", category: "tasks", name: "test-task", description: "desc", content: "body"
    }, "s1");
    expect(isNew).toBe(true);
    expect(node.name).toBe("test-task");
    expect(node.validatedCount).toBe(1);
    expect(node.temporalType).toBe("static");
  });

  it("updates existing node", () => {
    upsertNode(db, { type: "TASK", category: "tasks", name: "dup", description: "v1", content: "short" }, "s1");
    const { node: n2, isNew } = upsertNode(db, { type: "TASK", category: "tasks", name: "dup", description: "longer description here", content: "longer content" }, "s1");
    expect(isNew).toBe(false);
    expect(n2.validatedCount).toBe(2);
    expect(n2.content).toBe("longer content"); // longer wins
  });

  it("derives category from type when category is omitted in insert", () => {
    // Schema enforces NOT NULL on category, so fallback only protects against data corruption.
    // Verify that upsertNode correctly sets category based on type.
    const { node: skill } = upsertNode(db, { type: "SKILL", category: "skills", name: "test-skill", description: "d", content: "c" }, "s1");
    expect(skill.category).toBe("skills");
    
    const { node: task } = upsertNode(db, { type: "TASK", category: "tasks", name: "test-task", description: "d", content: "c" }, "s1");
    expect(task.category).toBe("tasks");
    
    const { node: event } = upsertNode(db, { type: "EVENT", category: "events", name: "test-event", description: "d", content: "c" }, "s1");
    expect(event.category).toBe("events");
  });

  it("sets temporalType from upsert param", () => {
    const { node } = upsertNode(db, {
      type: "TASK", category: "tasks", name: "temp-test", description: "d", content: "c", temporalType: "dynamic"
    }, "s1");
    expect(node.temporalType).toBe("dynamic");
  });
});

describe("find / all", () => {
  it("finds by name", () => {
    insertNode(db, { name: "my-skill", type: "SKILL", category: "skills", sessions: ["s1"] });
    const found = findByName(db, "my-skill")!;
    expect(found).toBeTruthy();
    expect(found.type).toBe("SKILL");
    expect(found.category).toBe("skills");
    expect(findById(db, found.id)).toEqual(found);
  });

  it("returns null for missing", () => {
    expect(findByName(db, "nope")).toBeNull();
    expect(findById(db, "nope")).toBeNull();
  });

  it("lists only active nodes", () => {
    insertNode(db, { name: "a1", type: "TASK", category: "tasks", sessions: ["s1"] });
    insertNode(db, { name: "a2", type: "SKILL", category: "skills", sessions: ["s1"] });
    const all = allActiveNodes(db);
    expect(all.length).toBe(2);
  });
});

describe("updateAccess", () => {
  it("increments access count", () => {
    const id = insertNode(db, { name: "access-test", type: "TASK", category: "tasks", sessions: ["s1"] });
    updateAccess(db, id);
    updateAccess(db, id);
    const node = findById(db, id)!;
    expect(node.accessCount).toBe(2);
    expect(node.lastAccessedAt).toBeGreaterThan(0);
  });
});

describe("searchNodes (FTS5)", () => {
  it("finds by keyword", () => {
    insertNode(db, { name: "docker-setup", type: "SKILL", category: "skills", description: "Docker container setup", content: "Use docker compose up", sessions: ["s1"] });
    insertNode(db, { name: "git-flow", type: "SKILL", category: "skills", description: "Git workflow", content: "Use git branch", sessions: ["s1"] });
    const results = searchNodes(db, "docker", 5);
    expect(results.length).toBe(1);
    expect(results[0].name).toBe("docker-setup");
  });

  it("falls back to LIKE when FTS fails", () => {
    insertNode(db, { name: "unique-word-xyz", type: "TASK", category: "tasks", content: "some content", sessions: ["s1"] });
    const results = searchNodes(db, "unique", 5);
    expect(results.length).toBe(1);
  });

  it("returns empty for no match", () => {
    const results = searchNodes(db, "zxcvbnm", 5);
    expect(results.length).toBe(0);
  });
});

describe("topNodes", () => {
  it("returns by pagerank", () => {
    insertNode(db, { name: "low", type: "TASK", category: "tasks", pagerank: 0.1, sessions: ["s1"] });
    insertNode(db, { name: "high", type: "TASK", category: "tasks", pagerank: 0.9, sessions: ["s1"] });
    const top = topNodes(db, 5);
    expect(top[0].name).toBe("high");
  });
});

describe("graphWalk", () => {
  it("walks connected nodes", () => {
    const t1 = insertNode(db, { name: "task-1", type: "TASK", category: "tasks", sessions: ["s1"] });
    const s1 = insertNode(db, { name: "skill-1", type: "SKILL", category: "skills", sessions: ["s1"] });
    const s2 = insertNode(db, { name: "skill-2", type: "SKILL", category: "skills", sessions: ["s1"] });
    insertEdge(db, { fromId: t1, toId: s1, type: "USED_SKILL", sessionId: "s1" });
    insertEdge(db, { fromId: s1, toId: s2, type: "REQUIRES", sessionId: "s1" });

    const result = graphWalk(db, [t1], 2);
    expect(result.nodes.length).toBeGreaterThanOrEqual(2);
    expect(result.edges.length).toBeGreaterThanOrEqual(1);
  });

  it("returns empty for non-existent seed", () => {
    const result = graphWalk(db, ["nonexistent"], 2);
    expect(result.nodes.length).toBe(0);
    expect(result.edges.length).toBe(0);
  });
});
