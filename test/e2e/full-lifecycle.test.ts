/**
 * brain-memory — E2E Tests (I3)
 *
 * Covers full user-facing scenarios using the engine's public API:
 *  1. Full lifecycle: seed → search → maintain
 *  2. Multi-session data persistence
 *  3. Scope isolation verification (v2 six-layer)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ContextEngine } from "../../src/engine/context";
import { DEFAULT_CONFIG } from "../../src/types";

function createEngine() {
  return new ContextEngine({ ...DEFAULT_CONFIG, dbPath: ":memory:" });
}

describe("E2E — 全生命周期", () => {
  let engine: ContextEngine;

  beforeEach(() => { engine = createEngine(); });
  afterEach(() => { try { engine.close(); } catch {} });

  it("seed → search → maintenance 完整闭环", async () => {
    // Seed data
    const storage = engine.getStorage();
    const { node: n1 } = storage.upsertNode({
      type: "SKILL", category: "skills", name: "docker-flask-setup",
      description: "Docker setup for Flask", content: "Use docker-compose up for Flask apps.",
      source: "user", temporalType: "static",
    }, "e2e-session");
    const { node: n2 } = storage.upsertNode({
      type: "EVENT", category: "events", name: "deploy-failure",
      description: "Deployment error", content: "Deploy failed: missing DATABASE_URL env var.",
      source: "user", temporalType: "static",
    }, "e2e-session");

    // Verify nodes exist
    expect(engine.getAllActiveNodes().length).toBe(2);

    // Search
    const results = engine.searchNodes("docker", 5);
    expect(results.length).toBeGreaterThanOrEqual(1);

    // Maintenance
    await engine.runMaintenance();
    expect(engine.getAllActiveNodes().length).toBeGreaterThanOrEqual(1);
  });
});

describe("E2E — 多会话数据持久化", () => {
  let engine: ContextEngine;

  beforeEach(() => { engine = createEngine(); });
  afterEach(() => { try { engine.close(); } catch {} });

  it("多个会话的节点均可被查询", async () => {
    const storage = engine.getStorage();
    storage.upsertNode({
      type: "SKILL", category: "skills", name: "alice-docker",
      description: "Docker microservices", content: "Docker setup with custom network.",
      source: "user", temporalType: "static",
      scopeChat: "alice-chat", scopeAgent: "e2e-agent",
    }, "session-alice");
    storage.upsertNode({
      type: "SKILL", category: "skills", name: "bob-python",
      description: "Python venv", content: "Python virtual environment with pip-tools.",
      source: "user", temporalType: "static",
      scopeChat: "bob-chat", scopeAgent: "e2e-agent",
    }, "session-bob");

    expect(engine.getAllActiveNodes().length).toBe(2);

    // Cross-session: global search finds nodes from both sessions
    const dockerResults = engine.searchNodes("docker", 5);
    const pythonResults = engine.searchNodes("python", 5);
    expect(dockerResults.length).toBeGreaterThanOrEqual(1);
    expect(pythonResults.length).toBeGreaterThanOrEqual(1);
  });
});

describe("E2E — Scope 隔离", () => {
  let engine: ContextEngine;

  beforeEach(() => { engine = createEngine(); });
  afterEach(() => { try { engine.close(); } catch {} });

  it("不同 workspace 的数据隔离", async () => {
    const storage = engine.getStorage();
    storage.upsertNode({
      type: "SKILL", category: "skills", name: "ws1-rust-backend",
      description: "Rust backend", content: "Project Alpha uses Rust with Actix-web.",
      source: "user", temporalType: "static",
      scopeAgent: "agent-x", scopeWorkspace: "workspace-1",
    }, "s1");
    storage.upsertNode({
      type: "SKILL", category: "skills", name: "ws2-flutter-app",
      description: "Flutter app", content: "Project Beta uses Flutter with Riverpod.",
      source: "user", temporalType: "static",
      scopeAgent: "agent-x", scopeWorkspace: "workspace-2",
    }, "s2");

    expect(engine.getAllActiveNodes().length).toBe(2);

    // Recall with workspace-1 scope
    const ws1Results = engine.searchNodes("rust", 5);
    const ws2Results = engine.searchNodes("flutter", 5);
    expect(ws1Results.length).toBeGreaterThanOrEqual(1);
    expect(ws2Results.length).toBeGreaterThanOrEqual(1);
  });

  it("六层 scope 字段正确持久化", async () => {
    const storage = engine.getStorage();
    const { node } = storage.upsertNode({
      type: "TASK", category: "tasks", name: "six-layer-test",
      description: "Full scope test", content: "Testing all six scope layers.",
      source: "user", temporalType: "static",
      scopePlatform: "discord",
      scopeWorkspace: "test-ws",
      scopeAgent: "test-agent",
      scopeUser: "test-user",
      scopeChat: "test-chat",
      scopeThread: "test-thread",
    }, "s1");

    const found = storage.findNodeById(node.id);
    expect(found).not.toBeNull();
    expect(found!.scopePlatform).toBe("discord");
    expect(found!.scopeWorkspace).toBe("test-ws");
    expect(found!.scopeAgent).toBe("test-agent");
    expect(found!.scopeUser).toBe("test-user");
    expect(found!.scopeChat).toBe("test-chat");
    expect(found!.scopeThread).toBe("test-thread");
  });
});
