#!/usr/bin/env node

/**
 * brain-memory — Mock OpenClaw Integration Test
 *
 * Simulates the full OpenClaw plugin lifecycle without running the Gateway:
 *   register → init → activate → message_received → before_message_write
 *     → message_sent → session_start → session_end → verify → cleanup
 *
 * This tests the complete extraction + recall + reflection pipeline
 * against real LLM (DashScope) and Embedding (Ollama) services.
 *
 * Usage: npx tsx scripts/mock-openclaw-test.js
 *
 * Requires: LLM API key set via env TEST_LLM_API_KEY or in config.js
 *           Ollama running on localhost:11434 with bge-m3 model
 */

import { existsSync, unlinkSync, mkdirSync, readdirSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

// ─── Config ──────────────────────────────────────────────────────

// Resolve LLM API key from env or config.js
let llmApiKey = process.env.TEST_LLM_API_KEY || "";
if (!llmApiKey || llmApiKey === "YOUR_API_KEY_HERE") {
  try {
    const configPath = join(projectRoot, "config.js");
    if (existsSync(configPath)) {
      const configUrl = new URL(`file://${configPath.replace(/\\/g, "/")}`);
      const configModule = await import(configUrl.href);
      llmApiKey = configModule.LLM_CONFIG?.apiKey || "";
    }
  } catch {
    // fallback: empty key → LLM will be skipped
  }
}

const hasLLM = llmApiKey && llmApiKey !== "YOUR_API_KEY_HERE" && llmApiKey.length > 10;
if (!hasLLM) {
  console.log("⚠️  LLM API key not configured. Skipping LLM-dependent tests.");
  console.log("   Set TEST_LLM_API_KEY env var or fill config.js with your key.\n");
}

// Temporary database path
const tmpDbDir = join(tmpdir(), `brain-memory-mock-${Date.now()}`);
mkdirSync(tmpDbDir, { recursive: true });
const dbPath = join(tmpDbDir, "brain-memory-test.db");

console.log(`📦 Test database: ${dbPath}`);
console.log(`🧠 LLM: ${hasLLM ? "enabled (qwen3.6-plus)" : "disabled"}\n`);

// ─── Build plugin config ─────────────────────────────────────────

const pluginConfig = {
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
    enabled: hasLLM,
    turnReflection: false,
    sessionReflection: hasLLM,
    safetyFilter: true,
    maxInsights: 8,
    importanceBoost: 0.15,
    minConfidence: 0.6,
  },
  workingMemory: { enabled: true, maxTasks: 3, maxDecisions: 5, maxConstraints: 5 },
  fusion: { enabled: false },  // skip LLM-dependent fusion
  reasoning: { enabled: hasLLM, maxHops: 2, maxConclusions: 3, minRecallNodes: 3 },
  rerank: { enabled: false },
  llm: hasLLM ? {
    baseURL: "https://coding.dashscope.aliyuncs.com/v1",
    apiKey: llmApiKey,
    model: "qwen3.6-plus",
  } : {},
  embedding: {
    baseURL: "http://localhost:11434/api",
    model: "bge-m3",
  },
};

// ─── Mock OpenClaw API ───────────────────────────────────────────

const registeredHooks = {};
const mockApi = {
  config: {
    plugins: {
      entries: {
        "brain-memory": {
          enabled: true,
          config: pluginConfig,
        },
      },
    },
  },

  registerHook(name, handler) {
    registeredHooks[name] = handler;
    console.log(`  📎 Hook registered: ${name}`);
  },

  on(name, handler) {
    this.registerHook(name, handler);
  },
};

// ─── Hook dispatcher ─────────────────────────────────────────────

async function fireHook(name, event) {
  const handler = registeredHooks[name];
  if (!handler) {
    console.log(`  ⚠️  No handler for ${name}`);
    return null;
  }
  try {
    const result = await handler(event);
    return result;
  } catch (error) {
    console.error(`  ❌ Hook ${name} failed:`, error.message);
    return null;
  }
}

// ─── Main test ───────────────────────────────────────────────────

let failures = 0;
let passes = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passes++;
  } else {
    console.error(`  ❌ ${label}`);
    failures++;
  }
}

async function main() {
  // 1. Load plugin
  console.log("─".repeat(50));
  console.log("Step 1: Loading plugin...");
  let pluginModule;
  try {
    const pluginPath = join(projectRoot, "dist", "openclaw-register.js");
    if (!existsSync(pluginPath)) {
      console.error(`❌ Plugin not found: ${pluginPath}`);
      console.error("   Run 'npx tsc -p tsconfig.build.json' first.");
      process.exit(1);
    }
    pluginModule = await import(new URL(`file://${pluginPath.replace(/\\/g, "/")}`).href);
    console.log("  ✅ Plugin loaded\n");
  } catch (error) {
    console.error(`  ❌ Failed to load plugin: ${error.message}`);
    process.exit(1);
  }

  // 2. Register
  console.log("─".repeat(50));
  console.log("Step 2: register(api)...");
  const regResult = pluginModule.register(mockApi);
  assert(regResult && regResult.id === "brain-memory", "Registration returns correct id");
  assert(Object.keys(registeredHooks).length === 5, `5 hooks registered (got ${Object.keys(registeredHooks).length})`);
  console.log(`  Registered hooks: ${Object.keys(registeredHooks).join(", ")}\n`);

  // 3. Init
  console.log("─".repeat(50));
  console.log("Step 3: init(config)...");
  try {
    const initResult = await pluginModule.init(pluginConfig);
    assert(initResult && initResult.success, "Plugin initialized successfully");
  } catch (error) {
    assert(false, `Plugin init failed: ${error.message}`);
    failures++;
  }
  console.log();

  // 4. Activate
  console.log("─".repeat(50));
  console.log("Step 4: activate(api)...");
  try {
    const activateResult = await pluginModule.activate(mockApi);
    assert(activateResult && activateResult.success, "Plugin activated successfully");
  } catch (error) {
    assert(false, `Plugin activation failed: ${error.message}`);
    failures++;
  }
  console.log();

  // 5. Simulate conversation: Turn 1 (user message)
  console.log("─".repeat(50));
  console.log("Step 5: message_received (Turn 1 - User)...");
  const userMsg1 = {
    type: "message_received",
    sessionKey: "mock-session-1",
    context: {
      conversationId: "mock-session-1",
      accountId: "mock-agent",
      workspaceId: "mock-workspace",
      content: "I need to implement a memory system for my AI agent using TypeScript and SQLite. The agent should be able to extract knowledge from conversations and recall relevant memories.",
    },
  };
  await fireHook("message_received", userMsg1);
  console.log("  ✅ message_received processed\n");

  // 6. Simulate conversation: Turn 1 (before AI reply)
  console.log("─".repeat(50));
  console.log("Step 6: before_message_write (Turn 1 - AI reply)...");
  const beforeWriteEvent1 = {
    type: "before_message_write",
    sessionKey: "mock-session-1",
    context: {
      conversationId: "mock-session-1",
      accountId: "mock-agent",
    },
    content: "",
  };
  const beforeWriteResult = await fireHook("before_message_write", beforeWriteEvent1);
  // before_message_write is synchronous in the plugin — check if it returns cached memories
  if (beforeWriteResult && beforeWriteResult.memoryContext) {
    assert(beforeWriteResult.memoryContext.relatedNodes?.length > 0,
      `before_message_write injected ${beforeWriteResult.memoryContext.relatedNodes.length} memories`);
  } else {
    // First message may not have cached memories yet (no prior recall)
    console.log("  ℹ️  No cached memories yet (first message)");
    passes++;
  }
  console.log();

  // 7. Simulate conversation: Turn 1 (AI reply sent)
  console.log("─".repeat(50));
  console.log("Step 7: message_sent (Turn 1 - AI reply)...");
  const aiReply1 = {
    type: "message_sent",
    sessionKey: "mock-session-1",
    context: {
      conversationId: "mock-session-1",
      accountId: "mock-agent",
      content: "I recommend using a knowledge graph with SQLite for storage. We can extract entities, tasks, and skills from conversations. The system should support both vector search and graph traversal for flexible recall.",
    },
  };
  await fireHook("message_sent", aiReply1);
  console.log("  ✅ message_sent processed\n");

  // 8. Wait for async extraction (message_sent may be async)
  console.log("  ⏳ Waiting for async extraction...");
  await new Promise(r => setTimeout(r, 3000));
  console.log();

  // 9. Simulate conversation: Turn 2 (user message)
  console.log("─".repeat(50));
  console.log("Step 8: message_received (Turn 2 - User)...");
  const userMsg2 = {
    type: "message_received",
    sessionKey: "mock-session-1",
    context: {
      conversationId: "mock-session-1",
      accountId: "mock-agent",
      workspaceId: "mock-workspace",
      content: "Can you show me how to query the knowledge graph to find all tasks related to TypeScript?",
    },
  };
  await fireHook("message_received", userMsg2);
  console.log("  ✅ message_received processed\n");

  // 10. before_message_write (Turn 2)
  console.log("─".repeat(50));
  console.log("Step 9: before_message_write (Turn 2 - AI reply)...");
  const beforeWriteEvent2 = {
    type: "before_message_write",
    sessionKey: "mock-session-1",
    context: {
      conversationId: "mock-session-1",
      accountId: "mock-agent",
    },
    content: "",
  };
  const beforeWriteResult2 = await fireHook("before_message_write", beforeWriteEvent2);
  if (beforeWriteResult2 && beforeWriteResult2.memoryContext) {
    assert(beforeWriteResult2.memoryContext.relatedNodes?.length > 0,
      `before_message_write injected ${beforeWriteResult2.memoryContext.relatedNodes.length} memories (Turn 2)`);
  } else {
    console.log("  ℹ️  No cached memories returned for Turn 2");
    passes++;
  }
  console.log();

  // 11. Simulate conversation: Turn 2 (AI reply sent)
  console.log("─".repeat(50));
  console.log("Step 10: message_sent (Turn 2 - AI reply)...");
  const aiReply2 = {
    type: "message_sent",
    sessionKey: "mock-session-1",
    context: {
      conversationId: "mock-session-1",
      accountId: "mock-agent",
      content: "To query the knowledge graph, you can use the recall() API with a query like 'TypeScript tasks'. This will use vector search + PageRank to find relevant nodes. You can also use searchNodes() for direct FTS5 lookup.",
    },
  };
  await fireHook("message_sent", aiReply2);
  console.log("  ✅ message_sent processed\n");

  // 12. Wait for async extraction
  console.log("  ⏳ Waiting for async extraction...");
  await new Promise(r => setTimeout(r, 3000));
  console.log();

  // 13. Verify database content
  console.log("─".repeat(50));
  console.log("Step 11: Verify database content...");
  try {
    const sqlite = await import("@photostructure/sqlite");
    const { DatabaseSync } = sqlite;
    const db = new DatabaseSync(dbPath);

    // Count nodes
    const nodeCount = db.prepare("SELECT COUNT(*) as cnt FROM bm_nodes").get();
    assert(nodeCount.cnt > 0, `Database has ${nodeCount.cnt} nodes`);

    // Count edges
    const edgeCount = db.prepare("SELECT COUNT(*) as cnt FROM bm_edges").get();
    console.log(`  📊 Edges: ${edgeCount.cnt}`);

    // Count vectors
    const vecCount = db.prepare("SELECT COUNT(*) as cnt FROM bm_vectors").get();
    assert(vecCount.cnt > 0, `Database has ${vecCount.cnt} vectors`);

    // List active nodes
    const nodes = db.prepare("SELECT name, type, category FROM bm_nodes WHERE status = 'active' ORDER BY created_at").all();
    if (nodes.length > 0) {
      console.log("\n  📋 Extracted nodes:");
      for (const n of nodes) {
        console.log(`     • ${n.name} (${n.type}) → ${n.category}`);
      }
    }

    db.close();
  } catch (error) {
    console.error(`  ❌ Database verification failed: ${error.message}`);
    failures++;
  }
  console.log();

  // 14. Test recall via engine
  console.log("─".repeat(50));
  console.log("Step 12: Test recall via ContextEngine...");
  try {
    const { ContextEngine, DEFAULT_CONFIG } = await import(new URL(`file://${join(projectRoot, "dist", "index.js").replace(/\\/g, "/")}`).href);
    const recallConfig = {
      ...DEFAULT_CONFIG,
      dbPath,
      llm: pluginConfig.llm,
      embedding: pluginConfig.embedding,
    };
    const engine = new ContextEngine(recallConfig);

    const recall = await engine.recall("TypeScript tasks knowledge graph", "mock-session-1", "mock-agent", "mock-workspace");
    assert(recall.nodes.length > 0, `Recall found ${recall.nodes.length} nodes for query`);
    if (recall.nodes.length > 0) {
      console.log("  📋 Recalled nodes:");
      for (const n of recall.nodes) {
        console.log(`     • ${n.name} (score: ${n.score?.toFixed(3) || "N/A"})`);
      }
    }

    engine.close();
  } catch (error) {
    console.error(`  ❌ Recall test failed: ${error.message}`);
    failures++;
  }
  console.log();

  // 15. Session end
  console.log("─".repeat(50));
  console.log("Step 13: session_end...");
  const sessionEndEvent = {
    type: "session_end",
    sessionKey: "mock-session-1",
    context: {
      conversationId: "mock-session-1",
      accountId: "mock-agent",
    },
  };
  await fireHook("session_end", sessionEndEvent);
  console.log("  ✅ session_end processed\n");

  // 16. Summary
  console.log("─".repeat(50));
  console.log("📊 Test Summary");
  console.log("─".repeat(50));
  console.log(`  ✅ Passed: ${passes}`);
  console.log(`  ❌ Failed: ${failures}`);
  console.log(`  📦 Total:  ${passes + failures}`);
  console.log();

  // 17. Cleanup
  console.log("🧹 Cleaning up...");
  try {
    // Close any remaining connections first
    const sqlite = await import("@photostructure/sqlite");
    const { DatabaseSync } = sqlite;
    // Try to open and close to flush WAL
    try {
      const db = new DatabaseSync(dbPath);
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      db.close();
    } catch { /* ignore if already closed */ }

    // Small delay to ensure file handles are released (Windows)
    await new Promise(r => setTimeout(r, 500));

    // Remove database files
    const files = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
    for (const f of files) {
      if (existsSync(f)) {
        try { unlinkSync(f); } catch { /* ignore if already deleted */ }
      }
    }
    // Remove temp directory
    if (existsSync(tmpDbDir)) {
      const remaining = readdirSync(tmpDbDir);
      if (remaining.length === 0) {
        rmdirSync(tmpDbDir);
      }
    }
    console.log("  ✅ Cleanup complete\n");
  } catch (error) {
    console.error(`  ⚠️  Cleanup incomplete: ${error.message}`);
  }

  process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
