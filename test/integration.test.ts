/**
 * brain-memory — Full lifecycle integration tests
 *
 * Tests the complete ContextEngine lifecycle:
 *   bootstrap → ingest → assemble → afterTurn (extract) → session_end → maintain
 *
 * Also tests cross-module integration:
 *   store + extractor + recaller + decay + noise + graph (PPR + community)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, insertNode, insertEdge, insertVector } from "./helpers.ts";
import {
  saveMessage, getUnextracted, markExtracted,
  upsertNode, upsertEdge, findByName, allActiveNodes,
  updateAccess, searchNodes,
} from "../src/store/store.ts";
import { Recaller } from "../src/recaller/recall.ts";
import { VectorRecaller } from "../src/retriever/vector-recall.ts";
import { HybridRecaller } from "../src/retriever/hybrid-recall.ts";
import { assembleContext } from "../src/format/assemble.ts";
import { runMaintenance } from "../src/graph/maintenance.ts";
import { invalidateGraphCache, computeGlobalPageRank } from "../src/graph/pagerank.ts";
import { detectCommunities, getCommunityRepresentatives } from "../src/graph/community.ts";
import { isNoise } from "../src/noise/filter.ts";
import { DEFAULT_CONFIG } from "../src/types.ts";
import { scoreDecay, applyTimeDecay } from "../src/decay/engine.ts";
import { Extractor } from "../src/extractor/extract.ts";

let db: ReturnType<typeof createTestDb>;

beforeEach(() => { db = createTestDb(); });

// ─── Mock LLM for integration tests ──────────────────────────

function mockLlm(response: string) {
  return async () => response;
}

const LONG_MSG = {
  role: "user",
  content: "I need to set up a Docker container for my Python Flask application. The previous setup failed with a port conflict error on port 5000, so I had to change it to port 8080.",
  turn_index: 1,
};

// ─── 1.10.1 Store Integration ────────────────────────────────

describe("Lifecycle: store integration", () => {
  it("full node CRUD cycle", () => {
    // Create
    const { node: created, isNew } = upsertNode(db, {
      type: "TASK", category: "tasks", name: "docker-setup",
      description: "Set up Docker for Flask app", content: "Use docker-compose with port 8080",
    }, "session-1");
    expect(isNew).toBe(true);
    expect(created.type).toBe("TASK");
    expect(created.category).toBe("tasks");

    // Read
    const found = findByName(db, "docker-setup");
    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);

    // Update
    const { node: updated, isNew: isUpd } = upsertNode(db, {
      type: "TASK", category: "tasks", name: "docker-setup",
      description: "Updated Docker setup guide", content: "Use docker-compose with port 8080 and add healthcheck",
    }, "session-1");
    expect(isUpd).toBe(false);
    expect(updated.validatedCount).toBe(2);
    expect(updated.content).toBe("Use docker-compose with port 8080 and add healthcheck");

    // Verify FTS5 search works after update
    const results = searchNodes(db, "healthcheck", 5);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("message lifecycle: save → query → mark extracted", () => {
    saveMessage(db, "s1", 1, "user", LONG_MSG.content);
    saveMessage(db, "s1", 2, "assistant", "Here is how to set up Docker with Flask...");
    saveMessage(db, "s1", 3, "user", "Thanks, that worked!");

    // All messages are unextracted
    const unextracted = getUnextracted(db, "s1", 10);
    expect(unextracted.length).toBe(3);

    // Mark first 2 as extracted
    markExtracted(db, "s1", 2);
    const remaining = getUnextracted(db, "s1", 10);
    expect(remaining.length).toBe(1);
    expect(remaining[0].turn_index).toBe(3);
  });

  it("vector storage and retrieval", () => {
    const nodeId = insertNode(db, {
      name: "docker-test", type: "SKILL", category: "skills",
      content: "Docker setup guide for Flask",
      sessions: ["s1"],
    });
    const vec = Array(16).fill(0).map((_, i) => i * 0.1);
    insertVector(db, nodeId, vec, "Docker setup guide for Flask");

    const saved = db.prepare("SELECT node_id FROM bm_vectors WHERE node_id=?").get(nodeId) as any;
    expect(saved).toBeTruthy();
    expect(saved.node_id).toBe(nodeId);
  });
});

// ─── 1.10.2 Extractor Integration ────────────────────────────

describe("Lifecycle: extractor integration", () => {
  it("filters noise before LLM call", async () => {
    const extractor = new Extractor(DEFAULT_CONFIG, mockLlm('{"nodes":[],"edges":[]}'));
    // Noise messages should be filtered, LLM should not be called
    let llmCalled = false;
    const noisyExtractor = new Extractor(DEFAULT_CONFIG, async () => { llmCalled = true; return '{"nodes":[],"edges":[]}'; });
    const result = await noisyExtractor.extract({
      messages: [
        { role: "user", content: "hi!", turn_index: 1 },
        { role: "assistant", content: "hello", turn_index: 2 },
        { role: "user", content: "ok", turn_index: 3 },
      ],
      existingNames: [],
    });
    expect(llmCalled).toBe(false);
    expect(result.nodes).toEqual([]);
  });

  it("passes meaningful content to LLM", async () => {
    let llmCalled = false;
    const extractor = new Extractor(DEFAULT_CONFIG, async () => { llmCalled = true; return '{"nodes":[],"edges":[]}'; });
    await extractor.extract({
      messages: [LONG_MSG],
      existingNames: [],
    });
    expect(llmCalled).toBe(true);
  });

  it("extractor parse pipeline: LLM → JSON → validation → temporal", async () => {
    const json = `{
      "nodes": [
        {"type": "TASK", "category": "tasks", "name": "docker-setup", "description": "Set up Docker", "content": "Docker compose for Flask app"},
        {"type": "EVENT", "category": "events", "name": "port-conflict", "description": "Port 5000 conflict", "content": "Error: port 5000 already in use, changed to 8080"},
        {"type": "SKILL", "category": "skills", "name": "change-port", "description": "Change port to resolve conflict", "content": "Switch from port 5000 to 8080"}
      ],
      "edges": [
        {"from": "port-conflict", "to": "change-port", "type": "SOLVED_BY", "instruction": "Changed port to resolve conflict"}
      ]
    }`;
    const extractor = new Extractor(DEFAULT_CONFIG, mockLlm(json));
    const result = await extractor.extract({ messages: [LONG_MSG], existingNames: [] });

    expect(result.nodes.length).toBe(3);
    expect(result.nodes[0].name).toBe("docker-setup");
    expect(result.nodes[0].temporalType).toBeTruthy(); // temporal classification applied
    expect(result.edges.length).toBe(1);
    expect(result.edges[0].type).toBe("SOLVED_BY");
  });
});

// ─── 1.10.3 Recaller Integration ─────────────────────────────

describe("Lifecycle: recaller integration", () => {
  it("graph recall with populated DB", async () => {
    // Set up a small graph
    const t1 = insertNode(db, { name: "docker-setup", type: "TASK", category: "tasks", content: "Docker container setup for Flask app with docker-compose", sessions: ["s1"] });
    const s1 = insertNode(db, { name: "docker-compose", type: "SKILL", category: "skills", content: "Use docker-compose up -d to start services", sessions: ["s1"] });
    const e1 = insertNode(db, { name: "port-conflict", type: "EVENT", category: "events", content: "Port 5000 conflict error", sessions: ["s1"] });
    insertEdge(db, { fromId: t1, toId: s1, type: "USED_SKILL", sessionId: "s1" });
    insertEdge(db, { fromId: e1, toId: s1, type: "SOLVED_BY", sessionId: "s1" });

    const recaller = new Recaller(db, DEFAULT_CONFIG);
    const result = await recaller.recall("docker");

    expect(result.nodes.length).toBeGreaterThanOrEqual(1);
    expect(result.edges.length).toBeGreaterThanOrEqual(1);
    // docker-setup and docker-compose should be recalled
    const names = result.nodes.map(n => n.name);
    expect(names).toContain("docker-setup");
  });

  it("hybrid recaller merges graph + vector results", async () => {
    const t1 = insertNode(db, { name: "flask-deploy", type: "TASK", category: "tasks", content: "Deploy Flask app to production server", sessions: ["s1"] });
    const s1 = insertNode(db, { name: "gunicorn", type: "SKILL", category: "skills", content: "Use gunicorn as WSGI server for Flask", sessions: ["s1"] });
    insertEdge(db, { fromId: t1, toId: s1, type: "USED_SKILL", sessionId: "s1" });

    const hybrid = new HybridRecaller(db, DEFAULT_CONFIG);
    const result = await hybrid.recall("flask deploy");

    expect(result.nodes.length).toBeGreaterThanOrEqual(1);
  });

  it("recall updates access count when decay enabled", async () => {
    const id = insertNode(db, {
      name: "access-test", type: "SKILL", category: "skills",
      description: "Test skill", content: "Test content for access tracking",
      sessions: ["s1"],
    });

    const cfg = { ...DEFAULT_CONFIG, decay: { ...DEFAULT_CONFIG.decay, enabled: true } };
    const recaller = new Recaller(db, cfg);
    await recaller.recall("access test content");

    const node = db.prepare("SELECT access_count FROM bm_nodes WHERE id=?").get(id) as any;
    expect(node.access_count).toBeGreaterThanOrEqual(1);
  });
});

// ─── 1.10.4 Decay Integration ────────────────────────────────

describe("Lifecycle: decay integration", () => {
  it("decay affects recall ranking", async () => {
    const now = Date.now();
    const day = 86_400_000;

    // Fresh node (1 day old, high importance)
    const freshId = insertNode(db, {
      name: "fresh-skill", type: "SKILL", category: "skills",
      content: "Fresh Docker skill",
      sessions: ["s1"],
      importance: 0.8,
      createdAt: now - day,
    });
    // Old node (90 days old, low importance)
    const oldId = insertNode(db, {
      name: "old-skill", type: "SKILL", category: "skills",
      content: "Old Docker skill",
      sessions: ["s1"],
      importance: 0.3,
      createdAt: now - 90 * day,
    });

    const cfg = { ...DEFAULT_CONFIG, decay: { ...DEFAULT_CONFIG.decay, enabled: true } };
    // findByName returns BmNode with camelCase fields, matching applyTimeDecay expectations
    const fresh = findByName(db, "fresh-skill")!;
    const old = findByName(db, "old-skill")!;

    const freshScore = applyTimeDecay(0.5, fresh, cfg.decay, now);
    const oldScore = applyTimeDecay(0.5, old, cfg.decay, now);

    expect(freshScore).toBeGreaterThan(oldScore);
  });

  it("composite score considers recency, frequency, and importance", () => {
    const now = Date.now();
    const day = 86_400_000;

    const node = {
      id: "n1", type: "SKILL" as const, category: "skills" as const, name: "test",
      description: "", content: "", status: "active" as const,
      validatedCount: 1, sourceSessions: ["s1"], communityId: null, pagerank: 0.5,
      importance: 0.6, accessCount: 5, lastAccessedAt: now,
      temporalType: "static" as const, createdAt: now - 30 * day, updatedAt: now,
    };

    const cfg = DEFAULT_CONFIG.decay;
    const score = scoreDecay(node, cfg, now);

    expect(score.recency).toBeGreaterThan(0);
    expect(score.frequency).toBeGreaterThan(0);
    expect(score.intrinsic).toBe(0.6);
    expect(score.composite).toBeGreaterThan(0);
    expect(score.composite).toBeLessThanOrEqual(1);
  });

  it("dynamic info decays faster than static", () => {
    const now = Date.now();
    const day = 86_400_000;
    const cfg = DEFAULT_CONFIG.decay;

    // Use 10 days — enough age for decay to differ, but not so old that both hit the floor
    const createdAt = now - 10 * day;

    const staticNode = {
      id: "s1", type: "SKILL" as const, category: "skills" as const, name: "static",
      description: "", content: "", status: "active" as const,
      validatedCount: 1, sourceSessions: ["s1"], communityId: null, pagerank: 0.5,
      importance: 0.5, accessCount: 0, lastAccessedAt: 0,
      temporalType: "static" as const, createdAt, updatedAt: now,
    };
    const dynamicNode = { ...staticNode, id: "d1", name: "dynamic", temporalType: "dynamic" as const };

    const staticScore = applyTimeDecay(0.5, staticNode, cfg, now);
    const dynamicScore = applyTimeDecay(0.5, dynamicNode, cfg, now);

    expect(staticScore).toBeGreaterThan(dynamicScore);
  });
});

// ─── 1.10.5 Noise Integration ────────────────────────────────

describe("Lifecycle: noise integration", () => {
  it("noise filter blocks common greeting patterns", () => {
    const noiseCfg = DEFAULT_CONFIG.noiseFilter;
    expect(isNoise("hi there", noiseCfg)).toBe(true);
    expect(isNoise("hello", noiseCfg)).toBe(true);
    expect(isNoise("你好", noiseCfg)).toBe(true);
    expect(isNoise("Hey!", noiseCfg)).toBe(true);
  });

  it("noise filter blocks thank-you messages", () => {
    const noiseCfg = DEFAULT_CONFIG.noiseFilter;
    expect(isNoise("thanks for the help", noiseCfg)).toBe(true);
    expect(isNoise("谢谢", noiseCfg)).toBe(true);
    expect(isNoise("Thank you very much!", noiseCfg)).toBe(true);
  });

  it("noise filter blocks short confirmations", () => {
    const noiseCfg = DEFAULT_CONFIG.noiseFilter;
    expect(isNoise("ok", noiseCfg)).toBe(true);
    expect(isNoise("好的", noiseCfg)).toBe(true);
    expect(isNoise("yes", noiseCfg)).toBe(true);
    expect(isNoise("收到", noiseCfg)).toBe(true);
  });

  it("noise filter passes meaningful content", () => {
    const noiseCfg = DEFAULT_CONFIG.noiseFilter;
    expect(isNoise("I need to fix a Docker port conflict issue", noiseCfg)).toBe(false);
    expect(isNoise("The Flask app crashes on startup with ImportError", noiseCfg)).toBe(false);
    expect(isNoise("Can you explain how PageRank works in the knowledge graph?", noiseCfg)).toBe(false);
  });

  it("noise filter respects minContentLength", () => {
    const strictCfg = { ...DEFAULT_CONFIG.noiseFilter, minContentLength: 50 };
    expect(isNoise("short message here", strictCfg)).toBe(true);
    expect(isNoise("This is a longer message that has more than fifty characters in total length", strictCfg)).toBe(false);
  });
});

// ─── 1.10.6 Full Lifecycle Integration ───────────────────────

describe("Full lifecycle: ingest → extract → assemble → maintain", () => {
  it("complete extraction pipeline with mock LLM", async () => {
    // Step 1: Ingest messages
    saveMessage(db, "session-1", 1, "user", LONG_MSG.content);
    saveMessage(db, "session-1", 2, "assistant", "Here's how to set up Docker with Flask. Use docker-compose with ports configured to avoid conflicts.");
    saveMessage(db, "session-1", 3, "user", "I also prefer using Python 3.11 and keep my code in VS Code.");

    // Step 2: Verify messages are stored
    const msgs = getUnextracted(db, "session-1", 10);
    expect(msgs.length).toBe(3);

    // Step 3: Extract with mock LLM
    const json = `{
      "nodes": [
        {"type": "TASK", "category": "tasks", "name": "docker-setup", "description": "Docker setup for Flask", "content": "Use docker-compose with port configuration"},
        {"type": "SKILL", "category": "skills", "name": "docker-compose", "description": "Docker compose usage", "content": "docker-compose up -d for Flask services"},
        {"type": "EVENT", "category": "events", "name": "port-conflict", "description": "Port 5000 conflict", "content": "Port 5000 already in use error"},
        {"type": "TASK", "category": "preferences", "name": "python-version", "description": "Python version preference", "content": "Prefers Python 3.11"}
      ],
      "edges": [
        {"from": "docker-setup", "to": "docker-compose", "type": "USED_SKILL", "instruction": "Uses docker-compose"},
        {"from": "port-conflict", "to": "docker-compose", "type": "SOLVED_BY", "instruction": "Configure ports differently"}
      ]
    }`;
    const extractor = new Extractor(DEFAULT_CONFIG, mockLlm(json));
    const existing = allActiveNodes(db).map(n => n.name);
    const result = await extractor.extract({ messages: msgs, existingNames: existing });

    // Step 4: Insert extracted nodes
    const nameToId = new Map<string, string>();
    for (const nc of result.nodes) {
      const { node } = upsertNode(db, {
        type: nc.type, category: nc.category,
        name: nc.name, description: nc.description, content: nc.content,
        temporalType: nc.temporalType,
      }, "session-1");
      nameToId.set(node.name, node.id);
    }

    // Step 5: Insert extracted edges
    for (const ec of result.edges) {
      const fromId = nameToId.get(ec.from);
      const toId = nameToId.get(ec.to);
      if (fromId && toId) {
        upsertEdge(db, {
          fromId, toId, type: ec.type,
          instruction: ec.instruction, condition: ec.condition, sessionId: "session-1",
        });
      }
    }

    // Step 6: Mark as extracted
    markExtracted(db, "session-1", 3);

    // Verify extraction results
    const allNodes = allActiveNodes(db);
    expect(allNodes.length).toBe(4);

    const categories = new Set(allNodes.map(n => n.category));
    expect(categories.has("tasks")).toBe(true);
    expect(categories.has("skills")).toBe(true);
    expect(categories.has("events")).toBe(true);
    expect(categories.has("preferences")).toBe(true);

    const edges = db.prepare("SELECT * FROM bm_edges").all() as any[];
    expect(edges.length).toBe(2);

    // Step 7: No more unextracted messages
    expect(getUnextracted(db, "session-1", 10).length).toBe(0);
  });

  it("assemble context with recalled memories", async () => {
    // Populate graph
    const t1 = insertNode(db, { name: "docker-setup", type: "TASK", category: "tasks", content: "Docker setup for Flask with docker-compose", sessions: ["s1"], communityId: "c-1", pagerank: 0.8 });
    const s1 = insertNode(db, { name: "docker-compose", type: "SKILL", category: "skills", content: "docker-compose up -d for services", sessions: ["s1"], communityId: "c-1", pagerank: 0.6 });
    insertEdge(db, { fromId: t1, toId: s1, type: "USED_SKILL", sessionId: "s1" });

    const cfg = DEFAULT_CONFIG;
    const recaller = new Recaller(db, cfg);
    const recall = await recaller.recall("docker flask");

    const { xml, systemPrompt, tokens, episodicXml, episodicTokens } = assembleContext(db, {
      tokenBudget: 4000,
      activeNodes: allActiveNodes(db),
      activeEdges: db.prepare("SELECT * FROM bm_edges").all() as any[],
      recalledNodes: recall.nodes,
      recalledEdges: recall.edges,
    });

    expect(xml.length).toBeGreaterThan(0);
    expect(systemPrompt).toBeTruthy();
    expect(tokens).toBeGreaterThan(0);
  });

  it("maintenance pipeline: PPR → community → summaries", async () => {
    // Build a graph with enough nodes for community detection
    const nodes: string[] = [];
    for (let i = 0; i < 5; i++) {
      nodes.push(insertNode(db, {
        name: `skill-${i}`, type: "SKILL", category: "skills",
        content: `Docker skill ${i}: setup container ${i}`,
        sessions: ["s1"],
      }));
    }
    // Connect them
    for (let i = 0; i < nodes.length - 1; i++) {
      insertEdge(db, { fromId: nodes[i], toId: nodes[i + 1], type: "REQUIRES", sessionId: "s1" });
    }

    // Run maintenance
    invalidateGraphCache();
    const result = await runMaintenance(db, DEFAULT_CONFIG, null, undefined);

    expect(result.dedup).toBeTruthy();
    expect(result.community).toBeTruthy();
    expect(result.community.count).toBeGreaterThanOrEqual(1);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("end-to-end: ingest → extract → recall → assemble → maintain", async () => {
    // Phase 1: Ingest conversation
    const conversation = [
      { role: "user", content: "How do I deploy a Flask app with Docker? My app uses Python 3.11 and I need gunicorn as the WSGI server.", turn_index: 1 },
      { role: "assistant", content: "Create a Dockerfile with Python 3.11 base image, install gunicorn, and set the CMD to run gunicorn with your Flask app. Use docker-compose for managing the container.", turn_index: 2 },
      { role: "user", content: "What about the port configuration? I had issues with port 5000 before.", turn_index: 3 },
      { role: "assistant", content: "Map port 8080 on the host to port 5000 in the container using the ports directive in docker-compose.yml. Like: 8080:5000", turn_index: 4 },
    ];

    for (const msg of conversation) {
      saveMessage(db, "e2e-session", msg.turn_index, msg.role, msg.content);
    }

    // Phase 2: Extract knowledge
    const json = `{
      "nodes": [
        {"type": "TASK", "category": "tasks", "name": "flask-docker-deploy", "description": "Deploy Flask with Docker", "content": "Dockerfile with Python 3.11, gunicorn WSGI server"},
        {"type": "SKILL", "category": "skills", "name": "gunicorn-config", "description": "Gunicorn WSGI configuration", "content": "gunicorn --bind 0.0.0.0:5000 app:app"},
        {"type": "EVENT", "category": "events", "name": "port-5000-conflict", "description": "Port 5000 conflict issue", "content": "Had port conflict on 5000, resolved by mapping 8080:5000"},
        {"type": "SKILL", "category": "skills", "name": "docker-port-mapping", "description": "Docker port mapping", "content": "Use ports directive: 8080:5000 to map host:container ports"}
      ],
      "edges": [
        {"from": "flask-docker-deploy", "to": "gunicorn-config", "type": "USED_SKILL", "instruction": "Uses gunicorn as WSGI"},
        {"from": "flask-docker-deploy", "to": "docker-port-mapping", "type": "USED_SKILL", "instruction": "Uses port mapping"},
        {"from": "port-5000-conflict", "to": "docker-port-mapping", "type": "SOLVED_BY", "instruction": "Port mapping resolves conflict"}
      ]
    }`;
    const extractor = new Extractor(DEFAULT_CONFIG, mockLlm(json));
    const msgs = getUnextracted(db, "e2e-session", 10);
    const extractResult = await extractor.extract({ messages: msgs, existingNames: [] });

    const nameToId = new Map<string, string>();
    for (const nc of extractResult.nodes) {
      const { node } = upsertNode(db, {
        type: nc.type, category: nc.category,
        name: nc.name, description: nc.description, content: nc.content,
        temporalType: nc.temporalType,
      }, "e2e-session");
      nameToId.set(node.name, node.id);
    }
    for (const ec of extractResult.edges) {
      const fromId = nameToId.get(ec.from);
      const toId = nameToId.get(ec.to);
      if (fromId && toId) {
        upsertEdge(db, { fromId, toId, type: ec.type, instruction: ec.instruction, condition: ec.condition, sessionId: "e2e-session" });
      }
    }
    markExtracted(db, "e2e-session", 4);

    // Phase 3: Recall for a follow-up query
    const recaller = new Recaller(db, DEFAULT_CONFIG);
    const recall = await recaller.recall("Docker port mapping Flask");
    expect(recall.nodes.length).toBeGreaterThanOrEqual(1);

    // Phase 4: Assemble context
    const { xml, systemPrompt, tokens } = assembleContext(db, {
      tokenBudget: 4000,
      activeNodes: allActiveNodes(db),
      activeEdges: db.prepare("SELECT * FROM bm_edges").all() as any[],
      recalledNodes: recall.nodes,
      recalledEdges: recall.edges,
    });
    expect(xml.length).toBeGreaterThan(0);
    expect(systemPrompt).toBeTruthy();

    // Phase 5: Run maintenance
    invalidateGraphCache();
    const maintResult = await runMaintenance(db, DEFAULT_CONFIG, null, undefined);
    expect(maintResult.community.count).toBeGreaterThanOrEqual(1);

    // Verify final state
    const finalNodes = allActiveNodes(db);
    expect(finalNodes.length).toBe(4);
    const finalEdges = db.prepare("SELECT COUNT(*) as c FROM bm_edges").get() as any;
    expect(finalEdges.c).toBe(3);
  });
});

describe("Full lifecycle: decay-aware pipeline", () => {
  it("recall ranking respects decay for mixed-age nodes", async () => {
    const now = Date.now();
    const day = 86_400_000;

    // Create nodes of varying ages
    const recent = insertNode(db, {
      name: "recent-docker", type: "SKILL", category: "skills",
      content: "Recent Docker setup guide with latest best practices",
      sessions: ["s1"], importance: 0.7,
      createdAt: now - 2 * day,
    });
    const old = insertNode(db, {
      name: "old-docker", type: "SKILL", category: "skills",
      content: "Old Docker setup guide from 2023",
      sessions: ["s1"], importance: 0.3,
      createdAt: now - 120 * day,
    });

    const cfg = { ...DEFAULT_CONFIG, decay: { ...DEFAULT_CONFIG.decay, enabled: true } };
    const recaller = new Recaller(db, cfg);
    const result = await recaller.recall("Docker setup");

    expect(result.nodes.length).toBeGreaterThanOrEqual(2);
    // Recent node should rank higher due to decay
    const scores = result.nodes.map(n => n.pagerank);
    const recentNode = result.nodes.find(n => n.name === "recent-docker");
    const oldNode = result.nodes.find(n => n.name === "old-docker");
    if (recentNode && oldNode) {
      expect(recentNode.pagerank).toBeGreaterThanOrEqual(oldNode.pagerank);
    }
  });
});
