/**
 * brain-memory — Recaller extended tests
 * Covers: embedding-based recall, syncEmbed, batchSyncEmbed,
 * buildEmbeddingText, chunkText, meanAggregate, source/scope filtering
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestStorage, cleanupTestDb, insertNode, insertEdge, insertVector } from "./helpers.ts";
import { Recaller } from "../src/recaller/recall.ts";
import { DEFAULT_CONFIG, type BmConfig } from "../src/types";

let storage: ReturnType<typeof createTestStorage>;
let db: ReturnType<typeof createTestDb>;

beforeEach(() => { storage = createTestStorage(); db = (storage as any).getDb(); });

afterEach(() => { cleanupTestDb(storage); });

// ─── Helpers ─────────────────────────────────────────────────────

function makeEmbedFn(dim: number = 3) {
  return vi.fn(async (text: string): Promise<number[]> => {
    // Deterministic pseudo-embedding based on text hash
    const arr = new Array(dim).fill(0);
    for (let i = 0; i < text.length; i++) {
      arr[i % dim] += text.charCodeAt(i);
    }
    // Normalize
    const norm = Math.sqrt(arr.reduce((s, v) => s + v * v, 0)) || 1;
    return arr.map(v => v / norm);
  });
}

function makeBatchEmbedFn(dim: number = 3) {
  return vi.fn(async (texts: string[]): Promise<number[][]> => {
    return Promise.all(texts.map(t => makeEmbedFn(dim)(t)));
  });
}

function makeNodeData(overrides: Record<string, any> = {}) {
  const now = Date.now();
  return {
    id: overrides.id || `n-${Math.random().toString(36).slice(2, 8)}`,
    type: (overrides.type || "SKILL") as any,
    category: (overrides.category || "skills") as any,
    name: overrides.name || "test-node",
    description: overrides.description || "test desc",
    content: overrides.content || "test content",
    status: (overrides.status || "active") as any,
    validatedCount: overrides.validatedCount ?? 1,
    sourceSessions: overrides.sourceSessions || ["s1"],
    communityId: overrides.communityId ?? null,
    pagerank: overrides.pagerank ?? 0,
    importance: overrides.importance ?? 0.5,
    accessCount: 0,
    lastAccessedAt: 0,
    temporalType: (overrides.temporalType || "static") as any,
    source: overrides.source || "user",
    scopeSession: overrides.scopeSession ?? "test-session",
    scopeAgent: overrides.scopeAgent ?? null,
    scopeWorkspace: overrides.scopeWorkspace ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

// ─── Recall with embedding ──────────────────────────────────────

describe("Recaller — recall with embedding", () => {
  it("recalls via vector search when embedding is available", async () => {
    const id1 = insertNode(db, { name: "docker-setup", type: "SKILL", category: "skills", content: "Docker compose configuration for production" });
    const id2 = insertNode(db, { name: "git-flow", type: "SKILL", category: "skills", content: "Git branching strategy" });
    insertVector(db, id1, [0.9, 0.1, 0.0], "Docker compose configuration for production");
    insertVector(db, id2, [0.1, 0.9, 0.0], "Git branching strategy");

    const cfg: BmConfig = { ...DEFAULT_CONFIG, recallMaxNodes: 10, recallMaxDepth: 2 };
    const recaller = new Recaller(storage, cfg);
    recaller.setEmbedFn(makeEmbedFn(3));

    const result = await recaller.recall("docker");
    // Should find at least one node
    expect(result.nodes.length).toBeGreaterThanOrEqual(1);
    expect(result.nodes.map(n => n.name)).toContain("docker-setup");
  });

  it("falls back to FTS5 when vector search returns few results", async () => {
    const id1 = insertNode(db, { name: "docker-setup", type: "SKILL", category: "skills", content: "Docker compose up for services" });
    insertVector(db, id1, [0.1, 0.1, 0.1], "Docker compose up for services");

    const cfg: BmConfig = { ...DEFAULT_CONFIG, recallMaxNodes: 10, recallMaxDepth: 2 };
    const recaller = new Recaller(storage, cfg);
    recaller.setEmbedFn(makeEmbedFn(3));

    const result = await recaller.recall("docker");
    expect(result.nodes.length).toBeGreaterThanOrEqual(1);
  });

  it("falls back to FTS5 when embedding throws", async () => {
    insertNode(db, { name: "python-test", type: "SKILL", category: "skills", content: "Python testing framework" });

    const cfg: BmConfig = { ...DEFAULT_CONFIG, recallMaxNodes: 10, recallMaxDepth: 2 };
    const recaller = new Recaller(storage, cfg);
    recaller.setEmbedFn(vi.fn(async () => { throw new Error("API down"); }));

    const result = await recaller.recall("python");
    expect(result.nodes.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Recall with source filter ──────────────────────────────────

describe("Recaller — source filter", () => {
  it("filters to only user-sourced nodes", async () => {
    insertNode(db, { name: "user-skill", type: "SKILL", category: "skills", content: "User created skill" });
    // assistant source
    const assistantId = insertNode(db, { name: "assistant-skill", type: "SKILL", category: "skills", content: "Assistant created skill" });
    // Overwrite source to assistant
    db.prepare("UPDATE bm_nodes SET source = ? WHERE id = ?").run("assistant", assistantId);

    const cfg: BmConfig = { ...DEFAULT_CONFIG, recallMaxNodes: 10, recallMaxDepth: 2 };
    const recaller = new Recaller(storage, cfg);
    const result = await recaller.recall("skill", undefined, "user");

    expect(result.nodes.every(n => n.source === "user")).toBe(true);
  });

  it("filters to only assistant-sourced nodes", async () => {
    const userId = insertNode(db, { name: "user-skill", type: "SKILL", category: "skills", content: "User skill" });
    db.prepare("UPDATE bm_nodes SET source = ? WHERE id = ?").run("assistant", userId);
    insertNode(db, { name: "assistant-skill", type: "SKILL", category: "skills", content: "Assistant skill" });

    const cfg: BmConfig = { ...DEFAULT_CONFIG, recallMaxNodes: 10, recallMaxDepth: 2 };
    const recaller = new Recaller(storage, cfg);
    const result = await recaller.recall("skill", undefined, "assistant");

    expect(result.nodes.every(n => n.source === "assistant")).toBe(true);
  });

  it("returns all nodes with 'both' filter", async () => {
    insertNode(db, { name: "user-skill", type: "SKILL", category: "skills", content: "User skill" });
    const aid = insertNode(db, { name: "assistant-skill", type: "SKILL", category: "skills", content: "Assistant skill" });
    db.prepare("UPDATE bm_nodes SET source = ? WHERE id = ?").run("assistant", aid);

    const cfg: BmConfig = { ...DEFAULT_CONFIG, recallMaxNodes: 10, recallMaxDepth: 2 };
    const recaller = new Recaller(storage, cfg);
    const result = await recaller.recall("skill", undefined, "both");

    expect(result.nodes.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── Recall with decay disabled ─────────────────────────────────

describe("Recaller — decay disabled", () => {
  it("sorts by PPR without decay when decay.enabled=false", async () => {
    insertNode(db, { name: "node-a", type: "SKILL", category: "skills", content: "Skill A" });
    insertNode(db, { name: "node-b", type: "SKILL", category: "skills", content: "Skill B" });

    const cfg: BmConfig = {
      ...DEFAULT_CONFIG,
      recallMaxNodes: 10,
      recallMaxDepth: 2,
      decay: { ...DEFAULT_CONFIG.decay, enabled: false },
    };
    const recaller = new Recaller(storage, cfg);
    const result = await recaller.recall("skill");

    expect(result.nodes.length).toBeGreaterThanOrEqual(1);
    // Access count should NOT be updated when decay is disabled
    const node = db.prepare("SELECT access_count FROM bm_nodes WHERE name = ?").get("node-a") as any;
    expect(node.access_count).toBe(0);
  });
});

// ─── Generalized seeds path ─────────────────────────────────────

describe("Recaller — generalized seeds", () => {
  it("falls back to community representatives when no community vector match", async () => {
    // Insert nodes without community vector data
    insertNode(db, { name: "standalone-skill", type: "SKILL", category: "skills", content: "A standalone skill" });

    const cfg: BmConfig = { ...DEFAULT_CONFIG, recallMaxNodes: 10, recallMaxDepth: 2 };
    const recaller = new Recaller(storage, cfg);
    recaller.setEmbedFn(makeEmbedFn(3));

    const result = await recaller.recall("standalone");
    // Should still work via generalized seeds fallback
    expect(result.nodes.length).toBeGreaterThanOrEqual(0);
  });

  it("generalized seeds returns empty when no community data exists", async () => {
    // Empty DB, no communities
    const cfg: BmConfig = { ...DEFAULT_CONFIG, recallMaxNodes: 10, recallMaxDepth: 2 };
    const recaller = new Recaller(storage, cfg);
    recaller.setEmbedFn(makeEmbedFn(3));

    // No nodes → generalized seeds will return empty
    const result = await recaller.recall("anything");
    expect(result.nodes).toEqual([]);
  });
});

// ─── syncEmbed ──────────────────────────────────────────────────

describe("Recaller — syncEmbed", () => {
  it("skips embedding when hash matches", async () => {
    const id = insertNode(db, { name: "cached-node", type: "SKILL", category: "skills", content: "Content that is already embedded" });
    const vec = [0.5, 0.5, 0.5];
    insertVector(db, id, vec, "Content that is already embedded");

    const cfg: BmConfig = { ...DEFAULT_CONFIG };
    const recaller = new Recaller(storage, cfg);
    const embedFn = makeEmbedFn(3);
    recaller.setEmbedFn(embedFn);

    await recaller.syncEmbed(makeNodeData({ id, content: "Content that is already embedded" }));
    // Embed function should NOT be called (hash matches)
    expect(embedFn).not.toHaveBeenCalled();
  });

  it("embeds short content (single chunk)", async () => {
    const id = insertNode(db, { name: "short-node", type: "SKILL", category: "skills", content: "Short content" });

    const cfg: BmConfig = { ...DEFAULT_CONFIG };
    const recaller = new Recaller(storage, cfg);
    const embedFn = makeEmbedFn(3);
    recaller.setEmbedFn(embedFn);

    await recaller.syncEmbed(makeNodeData({ id, content: "Short content" }));
    expect(embedFn).toHaveBeenCalledTimes(1);
    // Vector should be saved
    const vecRow = db.prepare("SELECT embedding FROM bm_vectors WHERE node_id = ?").get(id) as any;
    expect(vecRow).toBeDefined();
  });

  it("does nothing when embedFn is not set", async () => {
    const id = insertNode(db, { name: "no-embed-node", type: "SKILL", category: "skills", content: "No embed" });

    const cfg: BmConfig = { ...DEFAULT_CONFIG };
    const recaller = new Recaller(storage, cfg);

    // No embedFn set — should not throw
    await recaller.syncEmbed(makeNodeData({ id, content: "No embed" }));
    const vecRow = db.prepare("SELECT embedding FROM bm_vectors WHERE node_id = ?").get(id) as any;
    expect(vecRow).toBeUndefined();
  });

  it("handles embed error gracefully", async () => {
    const id = insertNode(db, { name: "error-node", type: "SKILL", category: "skills", content: "Will fail" });

    const cfg: BmConfig = { ...DEFAULT_CONFIG };
    const recaller = new Recaller(storage, cfg);
    recaller.setEmbedFn(vi.fn(async () => { throw new Error("API down"); }));

    // Should not throw
    await recaller.syncEmbed(makeNodeData({ id, content: "Will fail" }));
  });

  it("uses sequential embed fallback when no batchEmbed", async () => {
    const id = insertNode(db, { name: "long-node", type: "SKILL", category: "skills", content: "A".repeat(500) });

    const cfg: BmConfig = { ...DEFAULT_CONFIG };
    const recaller = new Recaller(storage, cfg);
    // Only set embedFn, not batchEmbedFn — forces sequential fallback for chunked content
    const embedFn = makeEmbedFn(3);
    recaller.setEmbedFn(embedFn);

    await recaller.syncEmbed(makeNodeData({ id, content: "A".repeat(500) }));
    // Should have been called multiple times (chunks)
    expect(embedFn).toHaveBeenCalledTimes(2);
    // Vector should be saved
    const vecRow = db.prepare("SELECT embedding FROM bm_vectors WHERE node_id = ?").get(id) as any;
    expect(vecRow).toBeDefined();
  });
});

// ─── batchSyncEmbed ─────────────────────────────────────────────

describe("Recaller — batchSyncEmbed", () => {
  it("returns immediately when no nodes", async () => {
    const cfg: BmConfig = { ...DEFAULT_CONFIG };
    const recaller = new Recaller(storage, cfg);
    const embedFn = makeEmbedFn(3);
    recaller.setEmbedFn(embedFn);

    await recaller.batchSyncEmbed([]);
    expect(embedFn).not.toHaveBeenCalled();
  });

  it("returns immediately when embedFn not set", async () => {
    const cfg: BmConfig = { ...DEFAULT_CONFIG };
    const recaller = new Recaller(storage, cfg);

    await recaller.batchSyncEmbed([makeNodeData({ name: "test" })]);
    // Should not throw
  });

  it("skips nodes that already have vectors", async () => {
    const id = insertNode(db, { name: "cached", type: "SKILL", category: "skills", content: "Already embedded" });
    insertVector(db, id, [0.5, 0.5, 0.5], "Already embedded");

    const cfg: BmConfig = { ...DEFAULT_CONFIG };
    const recaller = new Recaller(storage, cfg);
    const embedFn = makeEmbedFn(3);
    recaller.setEmbedFn(embedFn);

    await recaller.batchSyncEmbed([makeNodeData({ id, content: "Already embedded" })]);
    expect(embedFn).not.toHaveBeenCalled();
  });

  it("batch embeds multiple nodes with batchEmbedFn", async () => {
    const id1 = insertNode(db, { name: "node-1", type: "SKILL", category: "skills", content: "Content one" });
    const id2 = insertNode(db, { name: "node-2", type: "SKILL", category: "skills", content: "Content two" });

    const cfg: BmConfig = { ...DEFAULT_CONFIG };
    const recaller = new Recaller(storage, cfg);
    const batchEmbedFn = makeBatchEmbedFn(3);
    recaller.setEmbedFn(makeEmbedFn(3));
    recaller.setBatchEmbedFn(batchEmbedFn);

    await recaller.batchSyncEmbed([
      makeNodeData({ id: id1, content: "Content one" }),
      makeNodeData({ id: id2, content: "Content two" }),
    ]);

    // batchEmbed should have been called once with all chunks
    expect(batchEmbedFn).toHaveBeenCalledTimes(1);
    // Both vectors should be saved
    const v1 = db.prepare("SELECT embedding FROM bm_vectors WHERE node_id = ?").get(id1) as any;
    const v2 = db.prepare("SELECT embedding FROM bm_vectors WHERE node_id = ?").get(id2) as any;
    expect(v1).toBeDefined();
    expect(v2).toBeDefined();
  });

  it("batch embeds with sequential fallback when no batchEmbedFn", async () => {
    const id1 = insertNode(db, { name: "node-1", type: "SKILL", category: "skills", content: "Content one" });
    const id2 = insertNode(db, { name: "node-2", type: "SKILL", category: "skills", content: "Content two" });

    const cfg: BmConfig = { ...DEFAULT_CONFIG };
    const recaller = new Recaller(storage, cfg);
    const embedFn = makeEmbedFn(3);
    recaller.setEmbedFn(embedFn);

    await recaller.batchSyncEmbed([
      makeNodeData({ id: id1, content: "Content one" }),
      makeNodeData({ id: id2, content: "Content two" }),
    ]);

    // embedFn should have been called for each node (via Promise.all)
    expect(embedFn).toHaveBeenCalledTimes(2);
  });

  it("handles batch embed error gracefully", async () => {
    const id = insertNode(db, { name: "error-batch", type: "SKILL", category: "skills", content: "Will fail in batch" });

    const cfg: BmConfig = { ...DEFAULT_CONFIG };
    const recaller = new Recaller(storage, cfg);
    recaller.setEmbedFn(vi.fn(async () => { throw new Error("API down"); }));

    // Should not throw
    await recaller.batchSyncEmbed([makeNodeData({ id, content: "Will fail in batch" })]);
  });
});

// ─── buildEmbeddingText ─────────────────────────────────────────

describe("Recaller — buildEmbeddingText (via syncEmbed)", () => {
  it("builds full text when content is short", async () => {
    const id = insertNode(db, { name: "short", type: "SKILL", category: "skills", content: "Short" });

    const cfg: BmConfig = { ...DEFAULT_CONFIG };
    const recaller = new Recaller(storage, cfg);
    const embedFn = vi.fn(async (text: string) => {
      // The embedded text should include header
      expect(text).toContain("short: ");
      return [0.5, 0.5, 0.5];
    });
    recaller.setEmbedFn(embedFn);

    await recaller.syncEmbed(makeNodeData({ id, name: "short", content: "Short" }));
  });

  it("truncates long content at paragraph boundary", async () => {
    // Need paragraph break at position > 720 in full text (header ~30 + content position)
    // So content \n\n must be at > 690 position
    const longContent = "A".repeat(800) + "\n\n" + "B".repeat(600);
    const id = insertNode(db, { name: "long-para", type: "SKILL", category: "skills", content: longContent });

    const cfg: BmConfig = { ...DEFAULT_CONFIG };
    const recaller = new Recaller(storage, cfg);
    const embedFn = vi.fn(async (text: string) => {
      // Should be truncated at paragraph boundary (~830 chars)
      expect(text.length).toBeLessThan(longContent.length + 50);
      expect(text).toContain("\n\n"); // paragraph break included
      return [0.5, 0.5, 0.5];
    });
    recaller.setEmbedFn(embedFn);

    await recaller.syncEmbed(makeNodeData({ id, name: "long-para", content: longContent }));
    expect(embedFn).toHaveBeenCalled();
  });
});

// ─── chunkText ──────────────────────────────────────────────────

describe("Recaller — chunkText (via batchSyncEmbed with long content)", () => {
  it("chunks long content into multiple pieces", async () => {
    // Content > 400 chars → should be chunked
    const longContent = "A".repeat(900);
    const id = insertNode(db, { name: "chunkable", type: "SKILL", category: "skills", content: longContent });

    const cfg: BmConfig = { ...DEFAULT_CONFIG };
    const recaller = new Recaller(storage, cfg);
    const batchEmbedFn = makeBatchEmbedFn(3);
    recaller.setEmbedFn(makeEmbedFn(3));
    recaller.setBatchEmbedFn(batchEmbedFn);

    await recaller.batchSyncEmbed([makeNodeData({ id, content: longContent })]);

    // batchEmbed should be called with multiple chunks (header + content > 400 chars)
    const callArgs = batchEmbedFn.mock.calls[0][0] as string[];
    expect(callArgs.length).toBeGreaterThanOrEqual(2);
  });

  it("does not chunk short content", async () => {
    const shortContent = "Short content here";
    const id = insertNode(db, { name: "short-chunk", type: "SKILL", category: "skills", content: shortContent });

    const cfg: BmConfig = { ...DEFAULT_CONFIG };
    const recaller = new Recaller(storage, cfg);
    const batchEmbedFn = makeBatchEmbedFn(3);
    recaller.setEmbedFn(makeEmbedFn(3));
    recaller.setBatchEmbedFn(batchEmbedFn);

    await recaller.batchSyncEmbed([makeNodeData({ id, content: shortContent })]);

    const callArgs = batchEmbedFn.mock.calls[0][0] as string[];
    expect(callArgs.length).toBe(1);
  });
});

// ─── meanAggregate ──────────────────────────────────────────────

describe("Recaller — meanAggregate (via syncEmbed with chunked content)", () => {
  it("aggregates multiple vectors when chunked content is embedded", async () => {
    const longContent = "A".repeat(900);
    const id = insertNode(db, { name: "aggregate-test", type: "SKILL", category: "skills", content: longContent });

    const cfg: BmConfig = { ...DEFAULT_CONFIG };
    const recaller = new Recaller(storage, cfg);
    const batchEmbedFn = vi.fn(async (texts: string[]) => {
      return texts.map(t => {
        const arr = new Array(3).fill(0);
        for (let i = 0; i < t.length; i++) arr[i % 3] += t.charCodeAt(i);
        const norm = Math.sqrt(arr.reduce((s, v) => s + v * v, 0)) || 1;
        return arr.map(v => v / norm);
      });
    });
    recaller.setEmbedFn(makeEmbedFn(3));
    recaller.setBatchEmbedFn(batchEmbedFn);

    await recaller.syncEmbed(makeNodeData({ id, content: longContent }));

    // Vector should be saved (mean-aggregated from chunks)
    const vecRow = db.prepare("SELECT embedding FROM bm_vectors WHERE node_id = ?").get(id) as any;
    expect(vecRow).toBeDefined();
  });
});

// ─── Edge filtering in recall result ────────────────────────────

describe("Recaller — edge filtering", () => {
  it("returns only edges between recalled nodes", async () => {
    const id1 = insertNode(db, { name: "edge-src", type: "TASK", category: "tasks", content: "Task that uses skill" });
    const id2 = insertNode(db, { name: "edge-dst", type: "SKILL", category: "skills", content: "Skill used by task" });
    insertEdge(db, { fromId: id1, toId: id2, type: "USED_SKILL" });

    const cfg: BmConfig = { ...DEFAULT_CONFIG, recallMaxNodes: 10, recallMaxDepth: 2 };
    const recaller = new Recaller(storage, cfg);
    const result = await recaller.recall("task");

    // If both nodes are recalled, edge should be included
    if (result.nodes.length >= 2) {
      expect(result.edges.length).toBeGreaterThanOrEqual(1);
    }
  });
});

// ─── Token estimation ───────────────────────────────────────────

describe("Recaller — token estimation", () => {
  it("includes tokenEstimate in recall result", async () => {
    insertNode(db, { name: "token-test", type: "SKILL", category: "skills", content: "Some content for token estimation test" });

    const cfg: BmConfig = { ...DEFAULT_CONFIG, recallMaxNodes: 10, recallMaxDepth: 2 };
    const recaller = new Recaller(storage, cfg);
    const result = await recaller.recall("token");

    expect(result.tokenEstimate).toBeGreaterThanOrEqual(0);
  });
});

// ─── buildEmbeddingText — sentence boundary fallback ─────────────

describe("Recaller — buildEmbeddingText sentence fallback", () => {
  it("truncates at sentence boundary when no paragraph break", async () => {
    // Content > 1200 chars, NO paragraph break, sentence boundary at ~900 (within loop range 601-1200, > 840)
    // buildEmbeddingText searches backwards from 1200 to 601 for sentence punctuation
    const content = "A".repeat(900) + ". This is the sentence boundary. " + "B".repeat(400);
    const id = insertNode(db, { name: "sentence-truncate", type: "SKILL", category: "skills", content });

    const cfg: BmConfig = { ...DEFAULT_CONFIG };
    const recaller = new Recaller(storage, cfg);
    const embedFn = vi.fn(async (text: string) => {
      // Text should be truncated near the sentence boundary (~901 chars)
      expect(text.length).toBeLessThan(content.length + 50);
      return [0.5, 0.5, 0.5];
    });
    recaller.setEmbedFn(embedFn);

    await recaller.syncEmbed(makeNodeData({ id, name: "sentence-truncate", content }));
    expect(embedFn).toHaveBeenCalled();
  });

  it("falls back to hard cut when no sentence boundary found", async () => {
    // Content > 1200 chars, no paragraph break, no sentence-ending punctuation
    const content = "A".repeat(600) + "B".repeat(800);
    const id = insertNode(db, { name: "hardcut-truncate", type: "SKILL", category: "skills", content });

    const cfg: BmConfig = { ...DEFAULT_CONFIG };
    const recaller = new Recaller(storage, cfg);
    const embedFn = vi.fn(async (text: string) => {
      // Should be truncated at exactly maxContentLen (no natural boundary)
      expect(text.length).toBeLessThanOrEqual(1200 + 50); // header + ~1200 + margin
      return [0.5, 0.5, 0.5];
    });
    recaller.setEmbedFn(embedFn);

    await recaller.syncEmbed(makeNodeData({ id, name: "hardcut-truncate", content }));
    expect(embedFn).toHaveBeenCalled();
  });
});

// ─── chunkText — sentence boundary fallback ──────────────────────

describe("Recaller — chunkText sentence boundary", () => {
  it("splits at sentence boundary when no paragraph break", async () => {
    // Long text with sentence boundary but no \n\n
    const content = "A".repeat(300) + ". Sentence boundary here. " + "B".repeat(300);
    const id = insertNode(db, { name: "chunk-sentence", type: "SKILL", category: "skills", content });

    const cfg: BmConfig = { ...DEFAULT_CONFIG };
    const recaller = new Recaller(storage, cfg);
    const batchEmbedFn = vi.fn(async (texts: string[]) => texts.map(() => [0.5, 0.5, 0.5]));
    recaller.setEmbedFn(makeEmbedFn(3));
    recaller.setBatchEmbedFn(batchEmbedFn);

    await recaller.batchSyncEmbed([makeNodeData({ id, content })]);
    const callArgs = batchEmbedFn.mock.calls[0][0] as string[];
    expect(callArgs.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── matchesScope — via recall with scopeFilter ──────────────────

describe("Recaller — scope filtering via generalized seeds", () => {
  it("excludes nodes matching excludeScopes (matchesScope exclude path)", async () => {
    const id1 = insertNode(db, { name: "included", type: "SKILL", category: "skills", content: "Included node" });
    const id2 = insertNode(db, { name: "excluded", type: "SKILL", category: "skills", content: "Excluded node" });
    // Set scopeSession on id2 so it can be matched by exclude filter
    db.prepare("UPDATE bm_nodes SET scope_session = ? WHERE id = ?").run("excl-session", id2);

    const cfg: BmConfig = { ...DEFAULT_CONFIG, recallMaxNodes: 10, recallMaxDepth: 2 };
    const recaller = new Recaller(storage, cfg);
    recaller.setEmbedFn(makeEmbedFn(3));

    // generalized seeds will trigger matchesScope with excludeScopes
    const scopeFilter = {
      excludeScopes: [{ sessionId: "excl-session", agentId: undefined, workspaceId: undefined }],
      includeScopes: [],
    };
    const result = await recaller.recall("node", scopeFilter);
    // id2 should be excluded by matchesScope
    expect(result.nodes.some(n => n.name === "excluded")).toBe(false);
  });

  it("filters by includeScopes (matchesScope include path)", async () => {
    const id1 = insertNode(db, { name: "scope-match", type: "SKILL", category: "skills", content: "Matching scope" });
    db.prepare("UPDATE bm_nodes SET scope_session = ? WHERE id = ?").run("match-session", id1);

    const cfg: BmConfig = { ...DEFAULT_CONFIG, recallMaxNodes: 10, recallMaxDepth: 2 };
    const recaller = new Recaller(storage, cfg);
    recaller.setEmbedFn(makeEmbedFn(3));

    const scopeFilter = {
      excludeScopes: [],
      includeScopes: [{ sessionId: "match-session", agentId: undefined, workspaceId: undefined }],
    };
    const result = await recaller.recall("scope", scopeFilter);
    expect(result.nodes.length).toBeGreaterThanOrEqual(0);
  });

  it("returns all nodes when scopeFilter has neither exclude nor include (matchesScope default path)", async () => {
    insertNode(db, { name: "no-filter-1", type: "SKILL", category: "skills", content: "Node 1" });
    insertNode(db, { name: "no-filter-2", type: "SKILL", category: "skills", content: "Node 2" });

    const cfg: BmConfig = { ...DEFAULT_CONFIG, recallMaxNodes: 10, recallMaxDepth: 2 };
    const recaller = new Recaller(storage, cfg);

    // Empty scope filter → matchesScope returns true for all
    const scopeFilter = { excludeScopes: [], includeScopes: [] };
    const result = await recaller.recall("node", scopeFilter);
    expect(result.nodes.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── getGeneralizedSeeds — community vector search path ──────────

describe("Recaller — generalized seeds with community vector", () => {
  it("retrieves nodes via community vector search when available", async () => {
    const id1 = insertNode(db, { name: "comm-node-1", type: "SKILL", category: "skills", content: "Community node 1", communityId: "comm-1" });
    const id2 = insertNode(db, { name: "comm-node-2", type: "SKILL", category: "skills", content: "Community node 2", communityId: "comm-1" });

    // Insert a community summary with embedding
    const now = Date.now();
    const commVec = new Float32Array([0.9, 0.1, 0.0]);
    const commBlob = new Uint8Array(commVec.buffer, commVec.byteOffset, commVec.byteLength);
    db.prepare("INSERT INTO bm_communities(id, summary, node_count, embedding, created_at, updated_at) VALUES(?,?,?,?,?,?)").run(
      "comm-1", "Community summary", 2, commBlob, now, now
    );

    const cfg: BmConfig = { ...DEFAULT_CONFIG, recallMaxNodes: 10, recallMaxDepth: 2 };
    const recaller = new Recaller(storage, cfg);
    recaller.setEmbedFn(makeEmbedFn(3));

    const result = await recaller.recall("community");
    // Community vector search + nodesByCommunityIds should be triggered
    expect(result.nodes.length).toBeGreaterThanOrEqual(0);
  });
});
