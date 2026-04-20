/**
 * brain-memory — Decay engine tests
 */

import { describe, it, expect } from "vitest";
import { scoreDecay, applyTimeDecay } from "../src/decay/engine.ts";
import type { BmNode, DecayConfig } from "../src/types.ts";

const cfg: DecayConfig = {
  enabled: true,
  recencyHalfLifeDays: 30,
  recencyWeight: 0.4,
  frequencyWeight: 0.3,
  intrinsicWeight: 0.3,
  timeDecayHalfLifeDays: 60,
  betaCore: 0.8,
  betaWorking: 1.0,
  betaPeripheral: 1.3,
  coreDecayFloor: 0.9,
  workingDecayFloor: 0.7,
  peripheralDecayFloor: 0.5,
};

function makeNode(overrides: Partial<BmNode> = {}): BmNode {
  const now = Date.now();
  return {
    id: "n1", type: "SKILL", category: "skills", name: "test", description: "", content: "",
    status: "active", validatedCount: 1, sourceSessions: ["s1"],
    communityId: null, pagerank: 0.5, importance: 0.5,
    accessCount: 0, lastAccessedAt: 0, temporalType: "static",
    createdAt: now, updatedAt: now, ...overrides,
  };
}

describe("scoreDecay", () => {
  it("returns high score for recent, frequently accessed nodes", () => {
    const now = Date.now();
    const node = makeNode({
      createdAt: now - 86400000, // 1 day old
      accessCount: 10,
      importance: 0.8, // Core tier
    });
    const score = scoreDecay(node, cfg, now);
    expect(score.recency).toBeGreaterThan(0.8); // Very recent
    expect(score.frequency).toBeGreaterThan(0.3);
    expect(score.intrinsic).toBe(0.8);
  });

  it("returns low score for old, rarely accessed nodes", () => {
    const now = Date.now();
    const node = makeNode({
      createdAt: now - 86400000 * 180, // 180 days old
      accessCount: 0,
      importance: 0.2, // Peripheral tier
    });
    const score = scoreDecay(node, cfg, now);
    expect(score.recency).toBeLessThan(0.6);
    expect(score.frequency).toBe(0);
    expect(score.intrinsic).toBe(0.2);
  });

  it("dynamic content decays faster", () => {
    const now = Date.now();
    // At 60 days with importance=0.5, both hit the floor (0.7). Use shorter age.
    const ageDays = 20;
    const staticNode = makeNode({ createdAt: now - 86400000 * ageDays, temporalType: "static", importance: 0.5 });
    const dynamicNode = makeNode({ createdAt: now - 86400000 * ageDays, temporalType: "dynamic", importance: 0.5 });

    const sScore = applyTimeDecay(0.8, staticNode, cfg, now);
    const dScore = applyTimeDecay(0.8, dynamicNode, cfg, now);
    expect(dScore).toBeLessThan(sScore);
  });
});

describe("applyTimeDecay", () => {
  it("reduces score for old nodes", () => {
    const now = Date.now();
    const node = makeNode({ createdAt: now - 86400000 * 90, importance: 0.3 }); // 90 days old
    const decayed = applyTimeDecay(0.8, node, cfg, now);
    expect(decayed).toBeLessThan(0.8);
    expect(decayed).toBeGreaterThan(0.3); // Floor protection
  });

  it("does not reduce score for fresh nodes", () => {
    const now = Date.now();
    const node = makeNode({ createdAt: now - 86400000, importance: 0.5 }); // 1 day old
    const decayed = applyTimeDecay(0.8, node, cfg, now);
    expect(decayed).toBeCloseTo(0.8, 1); // Minimal decay for fresh nodes
  });
});
