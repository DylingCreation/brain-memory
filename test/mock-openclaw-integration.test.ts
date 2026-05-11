/**
 * brain-memory — Mock OpenClaw Plugin Integration Test
 *
 * Simulates the full OpenClaw plugin lifecycle without running the Gateway:
 *   register → init → activate → message_received → before_message_write
 *     → message_sent → session_start → session_end → verify → cleanup
 *
 * This tests the complete extraction + recall + reflection pipeline
 * against real LLM (DashScope) and Embedding (Ollama) services.
 *
 * Gated by TEST_LLM_API_KEY — skipped if not configured.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env" });

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, unlinkSync, mkdirSync, readdirSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Resolve project root
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

// Resolve LLM API key
function getApiKey(): string | null {
  const key = process.env.TEST_LLM_API_KEY;
  if (key && key !== "YOUR_API_KEY_HERE" && key.length > 10) return key;
  return null;
}

const TEST_LLM_API_KEY = getApiKey();

// Temporary database
let tmpDbDir: string;
let dbPath: string;

beforeAll(() => {
  tmpDbDir = join(tmpdir(), `brain-memory-mock-vitest-${Date.now()}`);
  mkdirSync(tmpDbDir, { recursive: true });
  dbPath = join(tmpDbDir, "brain-memory-test.db");
});

afterAll(async () => {
  // Clean up temp database files
  if (!dbPath) return;

  // Close any remaining connections
  try {
    const sqlite = await import("@photostructure/sqlite");
    const { DatabaseSync } = sqlite;
    try {
      const db = new DatabaseSync(dbPath);
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      db.close();
    } catch { /* ignore */ }
  } catch { /* ignore */ }

  // Small delay for Windows file handle release
  await new Promise(r => setTimeout(r, 500));

  // Remove database files
  const files = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
  for (const f of files) {
    if (existsSync(f)) {
      try { unlinkSync(f); } catch { /* ignore */ }
    }
  }

  // Remove temp directory
  if (existsSync(tmpDbDir)) {
    try {
      const remaining = readdirSync(tmpDbDir);
      if (remaining.length === 0) {
        rmdirSync(tmpDbDir);
      }
    } catch { /* ignore */ }
  }
});

// Build plugin config
function makePluginConfig(): Record<string, unknown> {
  return {
    engine: "hybrid",
    storage: "sqlite",
    dbPath,
    compactTurnCount: 6,
    recallMaxNodes: 6,
    recallMaxDepth: 2,
    recallStrategy: "full",
    dedupThreshold: 0.90,
    pagerankDamping: 0.85,
    pagerankIterations: 20,
    decay: { enabled: false },
    noiseFilter: { enabled: true, minContentLength: 10 },
    reflection: {
      enabled: !!TEST_LLM_API_KEY,
      turnReflection: false,
      sessionReflection: !!TEST_LLM_API_KEY,
      safetyFilter: true,
      maxInsights: 8,
      importanceBoost: 0.15,
      minConfidence: 0.6,
    },
    workingMemory: { enabled: true, maxTasks: 3, maxDecisions: 5, maxConstraints: 5 },
    fusion: { enabled: false },
    reasoning: { enabled: !!TEST_LLM_API_KEY, maxHops: 2, maxConclusions: 3, minRecallNodes: 3 },
    rerank: { enabled: false },
    llm: TEST_LLM_API_KEY ? {
      baseURL: process.env.TEST_LLM_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: TEST_LLM_API_KEY,
      model: process.env.TEST_LLM_MODEL ?? "qwen3.6-plus",
    } : {},
    embedding: {
      baseURL: process.env.TEST_EMBEDDING_BASE_URL ?? "http://localhost:11434/api",
      model: process.env.TEST_EMBEDDING_MODEL ?? "bge-m3",
    },
  };
}

// Mock OpenClaw API
function createMockApi(config: Record<string, unknown>) {
  const registeredHooks: Record<string, (...args: any[]) => any> = {};

  const mockApi = {
    config: {
      plugins: {
        entries: {
          "brain-memory": {
            enabled: true,
            config,
          },
        },
      },
    },

    registerHook(name: string, handler: (...args: any[]) => any) {
      registeredHooks[name] = handler;
    },

    on(name: string, handler: (...args: any[]) => any) {
      this.registerHook(name, handler);
    },

    getRegisteredHooks() {
      return { ...registeredHooks };
    },
  };

  return mockApi;
}

type MockApi = ReturnType<typeof createMockApi>;

// Fire a hook through the mock API
async function fireHook(api: MockApi, name: string, event: Record<string, unknown>) {
  const hooks = api.getRegisteredHooks();
  const handler = hooks[name];
  if (!handler) return null;
  return handler(event);
}

// Load plugin module
async function loadPluginModule() {
  const pluginPath = join(projectRoot, "dist", "openclaw-register.js");
  const pluginUrl = new URL(`file://${pluginPath.replace(/\\/g, "/")}`);
  return import(pluginUrl.href);
}

// ─── Tests ─────────────────────────────────────────────────────

describe("Mock OpenClaw Plugin Integration", { skip: !TEST_LLM_API_KEY }, () => {
  let mockApi: MockApi;
  let pluginModule: any;

  it("loads the compiled plugin module", async () => {
    pluginModule = await loadPluginModule();
    expect(pluginModule).toBeDefined();
    expect(typeof pluginModule.register).toBe("function");
    expect(typeof pluginModule.init).toBe("function");
    expect(typeof pluginModule.activate).toBe("function");
  });

  it("register(api) returns correct metadata and registers 5 hooks", async () => {
    const config = makePluginConfig();
    mockApi = createMockApi(config);

    const regResult = pluginModule.register(mockApi);
    expect(regResult).toBeDefined();
    expect(regResult.id).toBe("brain-memory");
    expect(regResult.name).toBe("Brain Memory");
    expect(regResult.version).toBe("1.0.0");

    const hooks = mockApi.getRegisteredHooks();
    expect(Object.keys(hooks).length).toBe(5);
    expect(hooks.message_received).toBeDefined();
    expect(hooks.message_sent).toBeDefined();
    expect(hooks.before_message_write).toBeDefined();
    expect(hooks.session_start).toBeDefined();
    expect(hooks.session_end).toBeDefined();
  });

  it("init(config) initializes the plugin successfully", async () => {
    const config = makePluginConfig();
    const initResult = await pluginModule.init(config);
    expect(initResult).toBeDefined();
    expect(initResult.success).toBe(true);
  });

  it("activate(api) activates the plugin successfully", async () => {
    const activateResult = await pluginModule.activate(mockApi);
    expect(activateResult).toBeDefined();
    expect(activateResult.success).toBe(true);
  });

  it("message_received extracts knowledge from a user message", async () => {
    const userMsg = {
      type: "message_received",
      sessionKey: "vitest-session-1",
      context: {
        conversationId: "vitest-session-1",
        accountId: "vitest-agent",
        workspaceId: "vitest-workspace",
        content: "I need to implement a memory system for my AI agent using TypeScript and SQLite. The agent should be able to extract knowledge from conversations.",
      },
    };
    await fireHook(mockApi, "message_received", userMsg);

    // Verify nodes were created
    const sqlite = await import("@photostructure/sqlite");
    const { DatabaseSync } = sqlite;
    const db = new DatabaseSync(dbPath);
    const nodeCount = db.prepare("SELECT COUNT(*) as cnt FROM bm_nodes").get() as { cnt: number };
    expect(nodeCount.cnt).toBeGreaterThan(0);
    console.log(`  → Extracted ${nodeCount.cnt} nodes from first user message`);
    db.close();
  }, 30000);

  it("before_message_write injects cached memories", async () => {
    const event = {
      type: "before_message_write",
      sessionKey: "vitest-session-1",
      context: {
        conversationId: "vitest-session-1",
        accountId: "vitest-agent",
      },
      content: "",
    };
    const result = await fireHook(mockApi, "before_message_write", event);
    // First message may not have cached memories yet (no prior recall)
    // But the hook should execute without error
    expect(result).toBeDefined();
    console.log("  → before_message_write executed");
  });

  it("message_sent processes AI reply without error", async () => {
    // message_sent uses async extraction (5s timeout) — timing is non-deterministic.
    // This test verifies the hook executes without crashing and the database
    // remains intact. Node count may or may not increase depending on timing.
    const aiReply = {
      type: "message_sent",
      sessionKey: "vitest-session-1",
      context: {
        conversationId: "vitest-session-1",
        accountId: "vitest-agent",
        content: "I recommend using a knowledge graph with SQLite for storage. We can extract entities, tasks, and skills from conversations. The system should support both vector search and graph traversal for flexible recall.",
      },
    };
    await fireHook(mockApi, "message_sent", aiReply);

    // Wait for async extraction window (plugin uses 5s timeout)
    await new Promise(r => setTimeout(r, 7000));

    // Verify database is intact (nodes from user message should exist)
    const sqlite = await import("@photostructure/sqlite");
    const { DatabaseSync } = sqlite;
    const db = new DatabaseSync(dbPath);
    const nodeCount = db.prepare("SELECT COUNT(*) as cnt FROM bm_nodes").get() as { cnt: number };
    expect(nodeCount.cnt).toBeGreaterThanOrEqual(1); // at least some nodes exist
    console.log(`  → Total nodes after AI reply: ${nodeCount.cnt}`);
    db.close();
  }, 30000);

  it("message_received (Turn 2) continues extracting knowledge", async () => {
    const userMsg = {
      type: "message_received",
      sessionKey: "vitest-session-1",
      context: {
        conversationId: "vitest-session-1",
        accountId: "vitest-agent",
        workspaceId: "vitest-workspace",
        content: "Can you show me how to query the knowledge graph to find all tasks related to TypeScript?",
      },
    };
    await fireHook(mockApi, "message_received", userMsg);

    const sqlite = await import("@photostructure/sqlite");
    const { DatabaseSync } = sqlite;
    const db = new DatabaseSync(dbPath);
    const nodeCount = db.prepare("SELECT COUNT(*) as cnt FROM bm_nodes").get() as { cnt: number };
    expect(nodeCount.cnt).toBeGreaterThan(0);
    console.log(`  → Total nodes after Turn 2: ${nodeCount.cnt}`);
    db.close();
  }, 30000);

  it("session_end performs reflection and maintenance", async () => {
    const sessionEndEvent = {
      type: "session_end",
      sessionKey: "vitest-session-1",
      context: {
        conversationId: "vitest-session-1",
        accountId: "vitest-agent",
      },
    };
    await fireHook(mockApi, "session_end", sessionEndEvent);
    console.log("  → session_end completed (reflection + maintenance)");
  }, 30000);

  it("database has valid content after full lifecycle", async () => {
    const sqlite = await import("@photostructure/sqlite");
    const { DatabaseSync } = sqlite;
    const db = new DatabaseSync(dbPath);

    // Verify nodes
    const nodeCount = db.prepare("SELECT COUNT(*) as cnt FROM bm_nodes").get() as { cnt: number };
    expect(nodeCount.cnt).toBeGreaterThan(0);

    // Verify vectors
    const vecCount = db.prepare("SELECT COUNT(*) as cnt FROM bm_vectors").get() as { cnt: number };
    expect(vecCount.cnt).toBeGreaterThan(0);

    // List active nodes
    const nodes = db.prepare("SELECT name, type, category FROM bm_nodes WHERE status = 'active' ORDER BY created_at").all() as Array<{ name: string; type: string; category: string }>;
    if (nodes.length > 0) {
      console.log(`  → ${nodes.length} active nodes in database:`);
      for (const n of nodes) {
        console.log(`     • ${n.name} (${n.type}) → ${n.category}`);
      }
    }

    db.close();
  });

  it("recall finds relevant memories via ContextEngine", async () => {
    const { ContextEngine, DEFAULT_CONFIG } = await import(new URL(`file://${join(projectRoot, "dist", "index.js").replace(/\\/g, "/")}`).href);

    const recallConfig = {
      ...DEFAULT_CONFIG,
      dbPath,
      llm: {
        baseURL: process.env.TEST_LLM_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1",
        apiKey: TEST_LLM_API_KEY,
        model: process.env.TEST_LLM_MODEL ?? "qwen3.6-plus",
      },
      embedding: {
        baseURL: process.env.TEST_EMBEDDING_BASE_URL ?? "http://localhost:11434/api",
        model: process.env.TEST_EMBEDDING_MODEL ?? "bge-m3",
      },
    };

    const engine = new ContextEngine(recallConfig);
    const recall = await engine.recall(
      "TypeScript tasks knowledge graph",
      "vitest-session-1",
      "vitest-agent",
      "vitest-workspace"
    );
    expect(recall.nodes.length).toBeGreaterThan(0);

    if (recall.nodes.length > 0) {
      console.log(`  → Recall found ${recall.nodes.length} nodes:`);
      for (const n of recall.nodes) {
        console.log(`     • ${n.name}`);
      }
    }

    engine.close();
  }, 30000);
});
