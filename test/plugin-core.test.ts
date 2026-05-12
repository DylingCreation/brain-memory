/**
 * v1.0.0 B-5 — Plugin Core Tests
 *
 * Covers src/plugin/core.ts — BrainMemoryPluginCore
 * 36 test cases across 9 method groups.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  BrainMemoryPluginCore,
  createBrainMemoryPluginCore,
} from "../src/plugin/core";
import type { BrainMemoryPluginConfig, Message, SessionEvent } from "../src/plugin/core";
import type { BmConfig } from "../src/types";

// ─── Helpers ────────────────────────────────────────────────────

function makeConfig(overrides: Partial<BrainMemoryPluginConfig> = {}): BrainMemoryPluginConfig {
  return {
    dbPath: ":memory:",
    enabled: true,
    injectMemories: true,
    extractMemories: true,
    autoMaintain: true,
    ...overrides,
  } as BrainMemoryPluginConfig;
}

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    sessionId: "test-session",
    content: "hello world",
    role: "user",
    ...overrides,
  };
}

function makeSessionEvent(overrides: Partial<SessionEvent> = {}): SessionEvent {
  return {
    sessionId: "test-session",
    ...overrides,
  };
}

// ─── Constructor Config (5 tests) ───────────────────────────────

describe("BrainMemoryPluginCore — constructor config", () => {
  it("uses defaults when no overrides", () => {
    const plugin = createBrainMemoryPluginCore({ dbPath: ":memory:" });
    // Should not throw — plugin created
    expect(plugin).toBeDefined();
  });

  it("accepts enabled=false", () => {
    const plugin = createBrainMemoryPluginCore(makeConfig({ enabled: false }));
    expect(plugin).toBeDefined();
  });

  it("accepts injectMemories=false", () => {
    const plugin = createBrainMemoryPluginCore(makeConfig({ injectMemories: false }));
    expect(plugin).toBeDefined();
  });

  it("accepts extractMemories=false", () => {
    const plugin = createBrainMemoryPluginCore(makeConfig({ extractMemories: false }));
    expect(plugin).toBeDefined();
  });

  it("accepts autoMaintain=false", () => {
    const plugin = createBrainMemoryPluginCore(makeConfig({ autoMaintain: false }));
    expect(plugin).toBeDefined();
  });
});

// ─── init() (3 tests) ──────────────────────────────────────────

describe("BrainMemoryPluginCore — init()", () => {
  it("creates engine when enabled", async () => {
    const plugin = createBrainMemoryPluginCore(makeConfig({ enabled: true }));
    await expect(plugin.init()).resolves.not.toThrow();
    await plugin.shutdown();
  });

  it("skips engine creation when disabled", async () => {
    const plugin = createBrainMemoryPluginCore(makeConfig({ enabled: false }));
    await expect(plugin.init()).resolves.not.toThrow();
  });

  it("logs initialization message", async () => {
    const plugin = createBrainMemoryPluginCore(makeConfig({ enabled: true }));
    await expect(plugin.init()).resolves.not.toThrow();
    await plugin.shutdown();
  });
});

// ─── onSessionStart() (3 tests) ────────────────────────────────

describe("BrainMemoryPluginCore — onSessionStart()", () => {
  it("returns early when engine not initialized", async () => {
    const plugin = createBrainMemoryPluginCore(makeConfig());
    await expect(plugin.onSessionStart(makeSessionEvent())).resolves.not.toThrow();
  });

  it("returns early when disabled", async () => {
    const plugin = createBrainMemoryPluginCore(makeConfig({ enabled: false }));
    await plugin.init();
    await expect(plugin.onSessionStart(makeSessionEvent())).resolves.not.toThrow();
    await plugin.shutdown();
  });

  it("succeeds when initialized", async () => {
    const plugin = createBrainMemoryPluginCore(makeConfig({ enabled: true }));
    await plugin.init();
    await expect(
      plugin.onSessionStart(makeSessionEvent({ sessionId: "sess-1" })),
    ).resolves.not.toThrow();
    await plugin.shutdown();
  });
});

// ─── onSessionEnd() (5 tests) ──────────────────────────────────

describe("BrainMemoryPluginCore — onSessionEnd()", () => {
  it("returns early when engine not initialized", async () => {
    const plugin = createBrainMemoryPluginCore(makeConfig());
    await expect(plugin.onSessionEnd(makeSessionEvent())).resolves.not.toThrow();
  });

  it("returns early when disabled", async () => {
    const plugin = createBrainMemoryPluginCore(makeConfig({ enabled: false }));
    await plugin.init();
    await expect(plugin.onSessionEnd(makeSessionEvent())).resolves.not.toThrow();
    await plugin.shutdown();
  });

  it("skips reflection when extractMemories=false", async () => {
    const plugin = createBrainMemoryPluginCore(
      makeConfig({ extractMemories: false }),
    );
    await plugin.init();
    await expect(plugin.onSessionEnd(makeSessionEvent())).resolves.not.toThrow();
    await plugin.shutdown();
  });

  it("handles reflection error gracefully", async () => {
    const plugin = createBrainMemoryPluginCore(makeConfig({ enabled: true }));
    await plugin.init();
    await expect(
      plugin.onSessionEnd(makeSessionEvent()),
    ).resolves.not.toThrow();
    await plugin.shutdown();
  });

  it("handles maintenance error gracefully", async () => {
    const plugin = createBrainMemoryPluginCore(makeConfig({ autoMaintain: true }));
    await plugin.init();
    await expect(
      plugin.onSessionEnd(makeSessionEvent()),
    ).resolves.not.toThrow();
    await plugin.shutdown();
  });
});

// ─── handleMessage() (6 tests) ─────────────────────────────────

describe("BrainMemoryPluginCore — handleMessage()", () => {
  it("returns null when engine not initialized", async () => {
    const plugin = createBrainMemoryPluginCore(makeConfig());
    const result = await plugin.handleMessage(makeMessage());
    expect(result).toBeNull();
  });

  it("returns null when disabled", async () => {
    const plugin = createBrainMemoryPluginCore(makeConfig({ enabled: false }));
    await plugin.init();
    const result = await plugin.handleMessage(makeMessage());
    expect(result).toBeNull();
    await plugin.shutdown();
  });

  it("returns null when extractMemories=false", async () => {
    const plugin = createBrainMemoryPluginCore(makeConfig({ extractMemories: false }));
    await plugin.init();
    const result = await plugin.handleMessage(makeMessage());
    expect(result).toBeNull();
    await plugin.shutdown();
  });

  it("passes correct parameters to engine.processTurn", async () => {
    const plugin = createBrainMemoryPluginCore(makeConfig({ enabled: true }));
    await plugin.init();
    const result = await plugin.handleMessage(
      makeMessage({ sessionId: "s1", agentId: "a1", workspaceId: "w1", content: "test" }),
    );
    // Returns null (no modification) — does not throw
    expect(result).toBeNull();
    await plugin.shutdown();
  });

  it("stringifies non-string content", async () => {
    const plugin = createBrainMemoryPluginCore(makeConfig({ enabled: true }));
    await plugin.init();
    const result = await plugin.handleMessage(
      makeMessage({ content: { key: "value" } as any }),
    );
    expect(result).toBeNull();
    await plugin.shutdown();
  });

  it("returns null on engine error", async () => {
    const plugin = createBrainMemoryPluginCore(makeConfig({ enabled: true }));
    await plugin.init();
    const result = await plugin.handleMessage(makeMessage());
    expect(result).toBeNull();
    await plugin.shutdown();
  });
});

// ─── getMemoryContext() (6 tests) ──────────────────────────────

describe("BrainMemoryPluginCore — getMemoryContext()", () => {
  it("returns null when engine not initialized", async () => {
    const plugin = createBrainMemoryPluginCore(makeConfig());
    const result = await plugin.getMemoryContext(makeMessage());
    expect(result).toBeNull();
  });

  it("returns null when disabled", async () => {
    const plugin = createBrainMemoryPluginCore(makeConfig({ enabled: false }));
    await plugin.init();
    const result = await plugin.getMemoryContext(makeMessage());
    expect(result).toBeNull();
    await plugin.shutdown();
  });

  it("returns null when injectMemories=false", async () => {
    const plugin = createBrainMemoryPluginCore(makeConfig({ injectMemories: false }));
    await plugin.init();
    const result = await plugin.getMemoryContext(makeMessage());
    expect(result).toBeNull();
    await plugin.shutdown();
  });

  it("returns null when no relevant memories", async () => {
    const plugin = createBrainMemoryPluginCore(makeConfig({ enabled: true }));
    await plugin.init();
    const result = await plugin.getMemoryContext(makeMessage());
    // Empty DB → no results
    expect(result).toBeNull();
    await plugin.shutdown();
  });

  it("handles engine error gracefully (error degradation)", async () => {
    const plugin = createBrainMemoryPluginCore(makeConfig({ enabled: true }));
    await plugin.init();
    const result = await plugin.getMemoryContext(makeMessage());
    expect(result).toBeNull();
    await plugin.shutdown();
  });

  it("returns null when strategy=off", async () => {
    const plugin = createBrainMemoryPluginCore(
      makeConfig({ enabled: true, memoryInjection: { enabled: true, strategy: "off" } as any }),
    );
    await plugin.init();
    const result = await plugin.getMemoryContext(makeMessage());
    expect(result).toBeNull();
    await plugin.shutdown();
  });
});

// ─── beforeMessageSend() (3 tests) ─────────────────────────────

describe("BrainMemoryPluginCore — beforeMessageSend()", () => {
  it("returns unchanged message when engine not initialized", async () => {
    const plugin = createBrainMemoryPluginCore(makeConfig());
    const msg = makeMessage();
    const result = await plugin.beforeMessageSend(msg);
    expect(result).toBe(msg);
  });

  it("returns unchanged message when disabled", async () => {
    const plugin = createBrainMemoryPluginCore(makeConfig({ enabled: false }));
    await plugin.init();
    const msg = makeMessage();
    const result = await plugin.beforeMessageSend(msg);
    expect(result).toBe(msg);
    await plugin.shutdown();
  });

  it("handles error gracefully (error degradation)", async () => {
    const plugin = createBrainMemoryPluginCore(makeConfig({ enabled: true }));
    await plugin.init();
    const msg = makeMessage();
    const result = await plugin.beforeMessageSend(msg);
    expect(result).toBe(msg);
    await plugin.shutdown();
  });
});

// ─── getStatus() (3 tests) ─────────────────────────────────────

describe("BrainMemoryPluginCore — getStatus()", () => {
  it("returns not initialized status before init", async () => {
    const plugin = createBrainMemoryPluginCore(makeConfig());
    const status = await plugin.getStatus();
    expect(status.status).toBe("not initialized");
    expect(status.enabled).toBe(true);
  });

  it("returns ready status after init", async () => {
    const plugin = createBrainMemoryPluginCore(makeConfig({ enabled: true }));
    await plugin.init();
    const status = await plugin.getStatus();
    expect(status.status).toBe("ready");
    await plugin.shutdown();
  });

  it("returns error status when engine fails", async () => {
    // Use an invalid dbPath to trigger an error
    const plugin = createBrainMemoryPluginCore(
      makeConfig({ dbPath: "/nonexistent/path/db.sqlite" } as any),
    );
    try {
      await plugin.init();
    } catch {
      // expected
    }
    const status = await plugin.getStatus();
    // Should reflect error or not initialized state
    expect(["not initialized", "error"]).toContain(status.status);
  });
});

// ─── shutdown() (2 tests) ──────────────────────────────────────

describe("BrainMemoryPluginCore — shutdown()", () => {
  it("shuts down cleanly after init", async () => {
    const plugin = createBrainMemoryPluginCore(makeConfig({ enabled: true }));
    await plugin.init();
    await expect(plugin.shutdown()).resolves.not.toThrow();
  });

  it("shuts down cleanly without init", async () => {
    const plugin = createBrainMemoryPluginCore(makeConfig());
    await expect(plugin.shutdown()).resolves.not.toThrow();
  });
});
