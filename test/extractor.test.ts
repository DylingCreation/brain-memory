/**
 * brain-memory — Extractor tests
 *
 * Covers: 8-category extraction, edge constraints, name normalization,
 * JSON parsing, noise filtering, temporal classification.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Extractor } from "../src/extractor/extract.ts";
import { DEFAULT_CONFIG } from "../src/types.ts";

// Mock LLM that returns controlled JSON responses
function mockLlm(response: string) {
  return async () => response;
}

// Messages long enough to pass the noise filter (minContentLength: 10)
const userMsg = { role: "user" as const, content: "I need help setting up a Docker container for my Flask application", turn_index: 1 };
const assistantMsg = { role: "assistant" as const, content: "Here is how you set up a Docker container with Flask using docker compose", turn_index: 2 };

describe("parseExtract — JSON parsing", () => {
  it("parses clean JSON", async () => {
    const ex = new Extractor(DEFAULT_CONFIG, mockLlm('{"nodes":[],"edges":[]}'));
    const result = await ex.extract({ messages: [userMsg], existingNames: [] });
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it("extracts JSON from code fences", async () => {
    const ex = new Extractor(DEFAULT_CONFIG, mockLlm('```json\n{"nodes":[{"type":"TASK","category":"tasks","name":"test","description":"d","content":"c"}],"edges":[]}\n```'));
    const result = await ex.extract({ messages: [userMsg], existingNames: [] });
    expect(result.nodes.length).toBe(1);
    expect(result.nodes[0].name).toBe("test");
  });

  it("extracts JSON from wrapped text", async () => {
    const ex = new Extractor(DEFAULT_CONFIG, mockLlm('Here is the result:\n{"nodes":[],"edges":[]}\nDone.'));
    const result = await ex.extract({ messages: [userMsg], existingNames: [] });
    expect(result.nodes).toEqual([]);
  });

  it("strips think tags", async () => {
    const ex = new Extractor(DEFAULT_CONFIG, mockLlm('<think>reasoning\n</think>{"nodes":[],"edges":[]}'));
    const result = await ex.extract({ messages: [userMsg], existingNames: [] });
    expect(result.nodes).toEqual([]);
  });

  it("throws on invalid JSON", async () => {
    const ex = new Extractor(DEFAULT_CONFIG, mockLlm("not json at all"));
    await expect(ex.extract({ messages: [userMsg], existingNames: [] })).rejects.toThrow();
  });
});

describe("parseExtract — 8 category support", () => {
  it("accepts all 8 categories", async () => {
    const categories: string[] = ["profile", "preferences", "entities", "events", "tasks", "skills", "cases", "patterns"];
    for (const cat of categories) {
      const json = `{"nodes":[{"type":"TASK","category":"${cat}","name":"test-${cat}","description":"d","content":"c"}],"edges":[]}`;
      const ex = new Extractor(DEFAULT_CONFIG, mockLlm(json));
      const result = await ex.extract({ messages: [userMsg], existingNames: [] });
      expect(result.nodes.length).toBe(1);
      expect(result.nodes[0].category).toBe(cat);
    }
  });

  it("defaults category from type when missing", async () => {
    const json = '{"nodes":[{"type":"TASK","name":"task-1","description":"d","content":"c"}],"edges":[]}';
    const ex = new Extractor(DEFAULT_CONFIG, mockLlm(json));
    const result = await ex.extract({ messages: [userMsg], existingNames: [] });
    expect(result.nodes[0].category).toBe("tasks");
  });

  it("defaults SKILL → skills category", async () => {
    const json = '{"nodes":[{"type":"SKILL","name":"skill-1","description":"d","content":"c"}],"edges":[]}';
    const ex = new Extractor(DEFAULT_CONFIG, mockLlm(json));
    const result = await ex.extract({ messages: [userMsg], existingNames: [] });
    expect(result.nodes[0].category).toBe("skills");
  });

  it("defaults EVENT → events category", async () => {
    const json = '{"nodes":[{"type":"EVENT","name":"err-1","description":"d","content":"c"}],"edges":[]}';
    const ex = new Extractor(DEFAULT_CONFIG, mockLlm(json));
    const result = await ex.extract({ messages: [userMsg], existingNames: [] });
    expect(result.nodes[0].category).toBe("events");
  });

  it("rejects invalid node types", async () => {
    const json = '{"nodes":[{"type":"INVALID","name":"x","category":"tasks","description":"d","content":"c"}],"edges":[]}';
    const ex = new Extractor(DEFAULT_CONFIG, mockLlm(json));
    const result = await ex.extract({ messages: [userMsg], existingNames: [] });
    expect(result.nodes.length).toBe(0);
  });

  it("rejects nodes without name", async () => {
    const json = '{"nodes":[{"type":"TASK","name":"","category":"tasks","description":"d","content":"c"}],"edges":[]}';
    const ex = new Extractor(DEFAULT_CONFIG, mockLlm(json));
    const result = await ex.extract({ messages: [userMsg], existingNames: [] });
    expect(result.nodes.length).toBe(0);
  });
});

describe("parseExtract — edge constraints", () => {
  it("accepts valid USED_SKILL edge (TASK → SKILL)", async () => {
    const json = `{
      "nodes":[
        {"type":"TASK","category":"tasks","name":"deploy-app","description":"d","content":"c"},
        {"type":"SKILL","category":"skills","name":"docker-build","description":"d","content":"c"}
      ],
      "edges":[{"from":"deploy-app","to":"docker-build","type":"USED_SKILL","instruction":"uses docker for deployment"}]
    }`;
    const ex = new Extractor(DEFAULT_CONFIG, mockLlm(json));
    const result = await ex.extract({ messages: [userMsg], existingNames: [] });
    expect(result.edges.length).toBe(1);
    expect(result.edges[0].type).toBe("USED_SKILL");
  });

  it("accepts valid SOLVED_BY edge (EVENT → SKILL)", async () => {
    const json = `{
      "nodes":[
        {"type":"EVENT","category":"events","name":"oom-crash","description":"d","content":"c"},
        {"type":"SKILL","category":"skills","name":"increase-memory","description":"d","content":"c"}
      ],
      "edges":[{"from":"oom-crash","to":"increase-memory","type":"SOLVED_BY","instruction":"increase heap size"}]
    }`;
    const ex = new Extractor(DEFAULT_CONFIG, mockLlm(json));
    const result = await ex.extract({ messages: [userMsg], existingNames: [] });
    expect(result.edges.length).toBe(1);
    expect(result.edges[0].type).toBe("SOLVED_BY");
  });

  it("accepts valid REQUIRES edge (SKILL → SKILL)", async () => {
    const json = `{
      "nodes":[
        {"type":"SKILL","category":"skills","name":"deploy","description":"d","content":"c"},
        {"type":"SKILL","category":"skills","name":"build","description":"d","content":"c"}
      ],
      "edges":[{"from":"deploy","to":"build","type":"REQUIRES","instruction":"build before deploy"}]
    }`;
    const ex = new Extractor(DEFAULT_CONFIG, mockLlm(json));
    const result = await ex.extract({ messages: [userMsg], existingNames: [] });
    expect(result.edges.length).toBe(1);
    expect(result.edges[0].type).toBe("REQUIRES");
  });

  it("accepts valid PATCHES edge (SKILL → SKILL)", async () => {
    const json = `{
      "nodes":[
        {"type":"SKILL","category":"skills","name":"deploy-v2","description":"d","content":"c"},
        {"type":"SKILL","category":"skills","name":"deploy-v1","description":"d","content":"c"}
      ],
      "edges":[{"from":"deploy-v2","to":"deploy-v1","type":"PATCHES","instruction":"replaces v1"}]
    }`;
    const ex = new Extractor(DEFAULT_CONFIG, mockLlm(json));
    const result = await ex.extract({ messages: [userMsg], existingNames: [] });
    expect(result.edges.length).toBe(1);
    expect(result.edges[0].type).toBe("PATCHES");
  });

  it("accepts valid CONFLICTS_WITH edge (SKILL ↔ SKILL)", async () => {
    const json = `{
      "nodes":[
        {"type":"SKILL","category":"skills","name":"method-a","description":"d","content":"c"},
        {"type":"SKILL","category":"skills","name":"method-b","description":"d","content":"c"}
      ],
      "edges":[{"from":"method-a","to":"method-b","type":"CONFLICTS_WITH","instruction":"mutually exclusive"}]
    }`;
    const ex = new Extractor(DEFAULT_CONFIG, mockLlm(json));
    const result = await ex.extract({ messages: [userMsg], existingNames: [] });
    expect(result.edges.length).toBe(1);
    expect(result.edges[0].type).toBe("CONFLICTS_WITH");
  });

  it("rejects invalid edge: TASK → TASK", async () => {
    const json = `{
      "nodes":[
        {"type":"TASK","category":"tasks","name":"task-a","description":"d","content":"c"},
        {"type":"TASK","category":"tasks","name":"task-b","description":"d","content":"c"}
      ],
      "edges":[{"from":"task-a","to":"task-b","type":"USED_SKILL","instruction":"wrong"}]
    }`;
    const ex = new Extractor(DEFAULT_CONFIG, mockLlm(json));
    const result = await ex.extract({ messages: [userMsg], existingNames: [] });
    expect(result.edges.length).toBe(0); // USED_SKILL requires TASK→SKILL, not TASK→TASK
  });

  it("rejects invalid edge type string", async () => {
    const json = `{
      "nodes":[
        {"type":"SKILL","category":"skills","name":"a","description":"d","content":"c"},
        {"type":"SKILL","category":"skills","name":"b","description":"d","content":"c"}
      ],
      "edges":[{"from":"a","to":"b","type":"INVALID_TYPE","instruction":"bad"}]
    }`;
    const ex = new Extractor(DEFAULT_CONFIG, mockLlm(json));
    const result = await ex.extract({ messages: [userMsg], existingNames: [] });
    expect(result.edges.length).toBe(0);
  });
});

describe("parseExtract — name normalization", () => {
  it("normalizes node names", async () => {
    const json = '{"nodes":[{"type":"TASK","category":"tasks","name":"  Deploy App  ","description":"d","content":"c"}],"edges":[]}';
    const ex = new Extractor(DEFAULT_CONFIG, mockLlm(json));
    const result = await ex.extract({ messages: [userMsg], existingNames: [] });
    expect(result.nodes[0].name).toBe("deploy-app");
  });

  it("normalizes edge from/to names", async () => {
    const json = `{
      "nodes":[
        {"type":"TASK","category":"tasks","name":"My Task","description":"d","content":"c"},
        {"type":"SKILL","category":"skills","name":"My Skill","description":"d","content":"c"}
      ],
      "edges":[{"from":"My Task","to":"My Skill","type":"USED_SKILL","instruction":"uses it"}]
    }`;
    const ex = new Extractor(DEFAULT_CONFIG, mockLlm(json));
    const result = await ex.extract({ messages: [userMsg], existingNames: [] });
    expect(result.edges[0].from).toBe("my-task");
    expect(result.edges[0].to).toBe("my-skill");
  });
});

describe("parseExtract — noise filtering", () => {
  it("filters out greeting messages", async () => {
    let called = false;
    const ex = new Extractor(DEFAULT_CONFIG, async () => { called = true; return '{"nodes":[],"edges":[]}'; });
    const result = await ex.extract({
      messages: [{ role: "user", content: "hi there!", turn_index: 1 }],
      existingNames: [],
    });
    expect(called).toBe(false); // LLM not called for noise
    expect(result.nodes).toEqual([]);
  });

  it("filters out short confirmations", async () => {
    let called = false;
    const ex = new Extractor(DEFAULT_CONFIG, async () => { called = true; return '{"nodes":[],"edges":[]}'; });
    const result = await ex.extract({
      messages: [{ role: "user", content: "ok", turn_index: 1 }],
      existingNames: [],
    });
    expect(called).toBe(false);
    expect(result.nodes).toEqual([]);
  });

  it("filters out thank-you messages", async () => {
    let called = false;
    const ex = new Extractor(DEFAULT_CONFIG, async () => { called = true; return '{"nodes":[],"edges":[]}'; });
    const result = await ex.extract({
      messages: [{ role: "user", content: "thanks for your help!", turn_index: 1 }],
      existingNames: [],
    });
    expect(called).toBe(false);
    expect(result.nodes).toEqual([]);
  });

  it("passes through meaningful content", async () => {
    let called = false;
    const ex = new Extractor(DEFAULT_CONFIG, async () => { called = true; return '{"nodes":[],"edges":[]}'; });
    await ex.extract({
      messages: [{ role: "user", content: "I need to set up a Docker container for my Python Flask app, and it keeps failing with a port conflict error on port 5000.", turn_index: 1 }],
      existingNames: [],
    });
    expect(called).toBe(true);
  });
});

describe("parseExtract — temporal classification", () => {
  it("classifies static facts", async () => {
    const json = '{"nodes":[{"type":"TASK","category":"tasks","name":"project-info","description":"d","content":"The project uses Python 3.11 and Flask framework on Ubuntu 22.04"}],"edges":[]}';
    const ex = new Extractor(DEFAULT_CONFIG, mockLlm(json));
    const result = await ex.extract({ messages: [userMsg], existingNames: [] });
    expect(result.nodes[0].temporalType).toBe("static");
  });

  it("classifies dynamic info", async () => {
    const json = '{"nodes":[{"type":"EVENT","category":"events","name":"server-status","description":"d","content":"The server is currently down and we expect it to be back up tomorrow"}],"edges":[]}';
    const ex = new Extractor(DEFAULT_CONFIG, mockLlm(json));
    const result = await ex.extract({ messages: [userMsg], existingNames: [] });
    expect(result.nodes[0].temporalType).toBe("dynamic");
  });
});

describe("finalize", () => {
  it("parses valid finalize output", async () => {
    const ex = new Extractor(DEFAULT_CONFIG, mockLlm('{"promotedSkills":[{"type":"SKILL","name":"debug-tips","description":"tips","content":"check logs"}],"newEdges":[],"invalidations":[]}'));
    const result = await ex.finalize({
      sessionNodes: [{ id: "1", type: "EVENT", name: "debug-event", description: "", content: "", validatedCount: 3 }],
      graphSummary: "1 nodes",
    });
    expect(result.promotedSkills.length).toBe(1);
    expect(result.promotedSkills[0].name).toBe("debug-tips");
  });

  it("returns empty on invalid output", async () => {
    const ex = new Extractor(DEFAULT_CONFIG, mockLlm("not json"));
    const result = await ex.finalize({
      sessionNodes: [],
      graphSummary: "empty",
    });
    expect(result.promotedSkills).toEqual([]);
    expect(result.newEdges).toEqual([]);
    expect(result.invalidations).toEqual([]);
  });

  it("validates edge types in finalize", async () => {
    const json = `{"promotedSkills":[],"newEdges":[{"from":"skill-a","to":"skill-b","type":"REQUIRES","instruction":"a needs b"},{"from":"a","to":"b","type":"INVALID","instruction":"bad"}],"invalidations":[]}`;
    const ex = new Extractor(DEFAULT_CONFIG, mockLlm(json));
    const result = await ex.finalize({
      sessionNodes: [
        { id: "1", type: "SKILL", name: "skill-a", description: "", content: "" },
        { id: "2", type: "SKILL", name: "skill-b", description: "", content: "" },
      ],
      graphSummary: "2 skills",
    });
    expect(result.newEdges.length).toBe(1);
    expect(result.newEdges[0].type).toBe("REQUIRES");
  });
});

describe("extract — empty messages", () => {
  it("returns empty for all-noise messages", async () => {
    let called = false;
    const ex = new Extractor(DEFAULT_CONFIG, async () => { called = true; return "x"; });
    const result = await ex.extract({
      messages: [
        { role: "user", content: "hi", turn_index: 1 },
        { role: "assistant", content: "hello!", turn_index: 2 },
      ],
      existingNames: [],
    });
    expect(called).toBe(false);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });
});
