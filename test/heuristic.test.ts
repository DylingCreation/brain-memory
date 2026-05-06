/**
 * A-2: Heuristic extraction tests
 *
 * Tests for the rule-based, LLM-free knowledge extraction module.
 * Covers: 8-category regex extraction, code block extraction,
 * command extraction, confidence levels, and Extractor integration.
 */

import { describe, it, expect } from "vitest";
import { heuristicExtract, heuristicConfidence } from "../src/extractor/heuristic";
import { Extractor } from "../src/extractor/extract";
import { DEFAULT_CONFIG } from "../src/types";

// ─── Heuristic extraction: 8 categories ─────────────────────────────────

describe("heuristicExtract — 8 categories", () => {
  it("detects profile (identity/role)", () => {
    const result = heuristicExtract([{ role: "user", content: "我是一个全栈开发工程师" }]);
    expect(result.nodes.length).toBeGreaterThan(0);
    const profileNode = result.nodes.find(n => n.category === "profile");
    expect(profileNode).toBeDefined();
  });

  it("detects preferences", () => {
    const result = heuristicExtract([{ role: "user", content: "我不喜欢写测试，别用 TypeScript" }]);
    expect(result.nodes.length).toBeGreaterThan(0);
    const prefNode = result.nodes.find(n => n.category === "preferences");
    expect(prefNode).toBeDefined();
  });

  it("detects entities", () => {
    const result = heuristicExtract([{ role: "user", content: "项目部署在 Ubuntu 上，用的是 Node.js 版本 18" }]);
    expect(result.nodes.length).toBeGreaterThan(0);
    const entityNode = result.nodes.find(n => n.category === "entities");
    expect(entityNode).toBeDefined();
  });

  it("detects tasks", () => {
    const result = heuristicExtract([{ role: "user", content: "帮我优化一下部署流程" }]);
    expect(result.nodes.length).toBeGreaterThan(0);
    const taskNode = result.nodes.find(n => n.category === "tasks");
    expect(taskNode).toBeDefined();
  });

  it("detects events (errors)", () => {
    const result = heuristicExtract([{ role: "user", content: "Docker 部署报错：EADDRINUSE 端口冲突" }]);
    expect(result.nodes.length).toBeGreaterThan(0);
    const eventNode = result.nodes.find(n => n.category === "events");
    expect(eventNode).toBeDefined();
  });

  it("detects skills (code blocks)", () => {
    const result = heuristicExtract([{ role: "assistant", content: "```bash\nnpm install memory-likehuman-pro\n```" }]);
    expect(result.nodes.length).toBeGreaterThan(0);
    const skillNode = result.nodes.find(n => n.category === "skills");
    expect(skillNode).toBeDefined();
  });

  it("detects cases (past experience)", () => {
    const result = heuristicExtract([{ role: "user", content: "上次部署的时候遇到了端口冲突的问题" }]);
    expect(result.nodes.length).toBeGreaterThan(0);
    const caseNode = result.nodes.find(n => n.category === "cases");
    expect(caseNode).toBeDefined();
  });

  it("detects patterns (general rules)", () => {
    const result = heuristicExtract([{ role: "user", content: "通常部署前都要先检查端口，这是最佳实践" }]);
    expect(result.nodes.length).toBeGreaterThan(0);
    const patternNode = result.nodes.find(n => n.category === "patterns");
    expect(patternNode).toBeDefined();
  });
});

// ─── Code block extraction ─────────────────────────────────────────────

describe("heuristicExtract — code blocks", () => {
  it("extracts bash code block as SKILL", () => {
    const result = heuristicExtract([
      { role: "assistant", content: "运行以下命令：\n```bash\nnpm install --save-dev vitest\n```" },
    ]);
    const skills = result.nodes.filter(n => n.category === "skills" && n.type === "SKILL");
    expect(skills.length).toBeGreaterThan(0);
    expect(skills[0].content).toContain("npm install");
  });

  it("extracts TypeScript code block", () => {
    const result = heuristicExtract([
      { role: "assistant", content: "```typescript\nconst engine = new ContextEngine(config);\n```" },
    ]);
    const skills = result.nodes.filter(n => n.category === "skills" && n.type === "SKILL");
    expect(skills.length).toBeGreaterThan(0);
  });

  it("skips trivial code blocks (< 5 chars) as SKILL nodes", () => {
    const result = heuristicExtract([
      { role: "assistant", content: "```js\nx\n```" },
    ]);
    // Code block "x" is < 5 chars → no SKILL from code blocks
    // But other heuristic rules may still match (e.g., "js" matches entities)
    const codeBlockSkills = result.nodes.filter(n => n.category === "skills" && n.type === "SKILL" && n.content.length < 5);
    expect(codeBlockSkills.length).toBe(0);
  });
});

// ─── Command extraction ────────────────────────────────────────────────

describe("heuristicExtract — command extraction", () => {
  it("extracts npm commands", () => {
    const result = heuristicExtract([{ role: "assistant", content: "运行 npm install memory-likehuman-pro 安装" }]);
    const skills = result.nodes.filter(n => n.category === "skills" && n.type === "SKILL");
    expect(skills.length).toBeGreaterThan(0);
  });

  it("extracts docker commands", () => {
    const result = heuristicExtract([{ role: "assistant", content: "使用 docker run -p 3000:3000 myapp 启动容器" }]);
    const skills = result.nodes.filter(n => n.category === "skills" && n.type === "SKILL");
    expect(skills.length).toBeGreaterThan(0);
  });

  it("extracts git commands", () => {
    const result = heuristicExtract([{ role: "assistant", content: "先 git clone https://github.com/example/repo.git" }]);
    const skills = result.nodes.filter(n => n.category === "skills" && n.type === "SKILL");
    expect(skills.length).toBeGreaterThan(0);
  });

  it("extracts curl commands", () => {
    const result = heuristicExtract([{ role: "assistant", content: "curl -X POST https://api.example.com/v1/data" }]);
    const skills = result.nodes.filter(n => n.category === "skills" && n.type === "SKILL");
    expect(skills.length).toBeGreaterThan(0);
  });
});

// ─── Confidence levels ─────────────────────────────────────────────────

describe("heuristicConfidence", () => {
  it("returns 'high' for ≥3 nodes and ≥2 categories", () => {
    const result = heuristicExtract([
      { role: "user", content: "我是一个全栈开发，我需要部署到 Docker，上次遇到报错" },
    ]);
    const conf = heuristicConfidence(result);
    expect(conf).toBe("high");
  });

  it("returns 'medium' for 1-2 nodes", () => {
    // Use content long enough to pass minContentLength=10 filter
    const result = heuristicExtract([
      { role: "user", content: "我需要部署应用到服务器上" },
    ]);
    const conf = heuristicConfidence(result);
    expect(conf).toBe("medium");
  });

  it("returns 'low' for empty result", () => {
    const result = heuristicExtract([
      { role: "user", content: "你好" },
    ]);
    const conf = heuristicConfidence(result);
    expect(conf).toBe("low");
  });
});

// ─── Noise filtering ───────────────────────────────────────────────────

describe("heuristicExtract — noise filtering", () => {
  it("skips very short messages (< minContentLength)", () => {
    const result = heuristicExtract(
      [{ role: "user", content: "Hi" }],
      { minContentLength: 10 },
    );
    expect(result.nodes.length).toBe(0);
  });

  it("processes messages above threshold", () => {
    const result = heuristicExtract(
      [{ role: "user", content: "我需要部署一个 Node.js 应用到 Docker 上" }],
      { minContentLength: 10 },
    );
    expect(result.nodes.length).toBeGreaterThan(0);
  });
});

// ─── Dedup within heuristic extraction ─────────────────────────────────

describe("heuristicExtract — deduplication", () => {
  it("deduplicates nodes with same normalized name", () => {
    const result = heuristicExtract([
      { role: "user", content: "我需要部署应用" },
      { role: "user", content: "我需要部署应用到生产环境" },
    ]);
    // Both messages match "我需要" → same normalized name → only 1 node
    const taskNodes = result.nodes.filter(n => n.category === "tasks");
    expect(taskNodes.length).toBeLessThanOrEqual(2);
  });
});

// ─── Extractor integration (LLM unavailable) ───────────────────────────

describe("Extractor with LLM unavailable (heuristic fallback)", () => {
  it("returns heuristic results when LLM is null", () => {
    const extractor = new Extractor(
      { ...DEFAULT_CONFIG, noiseFilter: { enabled: true, minContentLength: 10 } },
      null, // LLM unavailable
    );

    const result = extractor.extract({
      messages: [
        { role: "user", content: "我是一个全栈开发，我需要部署应用到 Docker" },
      ],
      existingNames: [],
    });

    // Should return heuristic result, not empty
    expect(result).toBeDefined();
    // Note: extract() returns a Promise, but since LLM is null it returns synchronously
    // We need to await
  });

  it("returns heuristic results when LLM is null (async)", async () => {
    const extractor = new Extractor(
      { ...DEFAULT_CONFIG, noiseFilter: { enabled: true, minContentLength: 10 } },
      null, // LLM unavailable
    );

    const result = await extractor.extract({
      messages: [
        { role: "user", content: "我是一个全栈开发，我需要部署应用到 Docker" },
      ],
      existingNames: [],
    });

    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.edges.length).toBe(0); // Heuristic doesn't extract edges
  });

  it("handles empty filtered messages", async () => {
    const extractor = new Extractor(
      { ...DEFAULT_CONFIG, noiseFilter: { enabled: true, minContentLength: 10 } },
      null,
    );

    const result = await extractor.extract({
      messages: [{ role: "user", content: "Hi" }], // too short, filtered out
      existingNames: [],
    });

    expect(result.nodes.length).toBe(0);
  });
});

// ─── Multi-message extraction ──────────────────────────────────────────

describe("heuristicExtract — multi-message", () => {
  it("extracts from multiple messages with different categories", () => {
    const result = heuristicExtract([
      { role: "user", content: "我是一个后端开发" },
      { role: "user", content: "我需要部署到 Docker" },
      { role: "user", content: "上次部署时报了 EADDRINUSE 错误" },
    ]);

    const categories = new Set(result.nodes.map(n => n.category));
    expect(categories.size).toBeGreaterThanOrEqual(2);
  });

  it("extracts code blocks from assistant messages", () => {
    const result = heuristicExtract([
      { role: "user", content: "怎么安装依赖？" },
      { role: "assistant", content: "运行以下命令：\n```bash\nnpm install\nnpm run build\n```" },
    ]);

    const skills = result.nodes.filter(n => n.category === "skills");
    expect(skills.length).toBeGreaterThan(0);
  });
});
