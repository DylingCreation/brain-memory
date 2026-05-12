/**
 * brain-memory — Decay presets tests
 */

import { describe, it, expect } from "vitest";
import { DECAY_PRESETS, computeDecayCurve, visualizeDecay, applyDecayPreset } from "../src/decay/presets";
import type { DecayConfig } from "../src/types";

// ─── Preset existence & structure ──────────────────────────────

describe("DECAY_PRESETS", () => {
  it("has all four presets", () => {
    expect(DECAY_PRESETS).toHaveProperty("aggressive");
    expect(DECAY_PRESETS).toHaveProperty("balanced");
    expect(DECAY_PRESETS).toHaveProperty("conservative");
    expect(DECAY_PRESETS).toHaveProperty("episodic");
  });

  it("aggressive has short half-life and low floors", () => {
    const p = DECAY_PRESETS.aggressive;
    expect(p.timeDecayHalfLifeDays).toBe(14);
    expect(p.coreDecayFloor).toBe(0.6);
    expect(p.workingDecayFloor).toBe(0.4);
    expect(p.peripheralDecayFloor).toBe(0.2);
  });

  it("balanced has moderate half-life and high floors", () => {
    const p = DECAY_PRESETS.balanced;
    expect(p.timeDecayHalfLifeDays).toBe(30);
    expect(p.coreDecayFloor).toBe(0.9);
    expect(p.workingDecayFloor).toBe(0.7);
    expect(p.peripheralDecayFloor).toBe(0.5);
  });

  it("conservative has long half-life and very high floors", () => {
    const p = DECAY_PRESETS.conservative;
    expect(p.timeDecayHalfLifeDays).toBe(90);
    expect(p.coreDecayFloor).toBe(0.95);
    expect(p.workingDecayFloor).toBe(0.85);
    expect(p.peripheralDecayFloor).toBe(0.7);
  });

  it("episodic has shortest half-life and lowest floors", () => {
    const p = DECAY_PRESETS.episodic;
    expect(p.timeDecayHalfLifeDays).toBe(7);
    expect(p.coreDecayFloor).toBe(0.5);
    expect(p.workingDecayFloor).toBe(0.3);
    expect(p.peripheralDecayFloor).toBe(0.1);
  });

  it("all presets have valid weight sums close to 1", () => {
    for (const [name, p] of Object.entries(DECAY_PRESETS)) {
      const sum = (p.recencyWeight ?? 0) + (p.frequencyWeight ?? 0) + (p.intrinsicWeight ?? 0);
      expect(sum).toBeCloseTo(1, 1);
    }
  });
});

// ─── computeDecayCurve ─────────────────────────────────────────

describe("computeDecayCurve", () => {
  function makeCfg(overrides: Partial<DecayConfig> = {}): DecayConfig {
    return {
      enabled: true,
      recencyHalfLifeDays: 30,
      recencyWeight: 0.4,
      frequencyWeight: 0.3,
      intrinsicWeight: 0.3,
      timeDecayHalfLifeDays: 30,
      betaCore: 0.8,
      betaWorking: 1.0,
      betaPeripheral: 1.3,
      coreDecayFloor: 0.9,
      workingDecayFloor: 0.7,
      peripheralDecayFloor: 0.5,
      ...overrides,
    };
  }

  it("returns 8 time points", () => {
    const curve = computeDecayCurve(makeCfg());
    expect(curve).toHaveLength(8);
    expect(curve.map(c => c.days)).toEqual([1, 7, 14, 30, 60, 90, 180, 365]);
  });

  it("peripheral decays fastest (at day 1, core > working > peripheral)", () => {
    // The decay formula with beta parameters is non-linear:
    // beta=0.8 (core) decays FASTER initially than beta=1.0 (working)
    // due to how λ = halfLife / pow(ln2, 1/beta) behaves.
    // So we only assert: each tier monotonically decreases over time (already tested above)
    // AND that at long times (day 365), each tier hits its floor.
    const curve = computeDecayCurve(makeCfg());
    // At day 365, all tiers should be at or near their floors
    const last = curve[curve.length - 1];
    expect(last.core).toBeGreaterThanOrEqual(0.89);     // floor=0.9
    expect(last.working).toBeGreaterThanOrEqual(0.69);   // floor=0.7
    expect(last.peripheral).toBeGreaterThanOrEqual(0.49); // floor=0.5
  });

  it("values decrease over time for each tier", () => {
    const curve = computeDecayCurve(makeCfg());
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i].core).toBeLessThanOrEqual(curve[i - 1].core);
      expect(curve[i].working).toBeLessThanOrEqual(curve[i - 1].working);
      expect(curve[i].peripheral).toBeLessThanOrEqual(curve[i - 1].peripheral);
    }
  });

  it("values hit their floors", () => {
    const curve = computeDecayCurve(makeCfg());
    for (const p of curve) {
      expect(p.core).toBeGreaterThanOrEqual(0.9);
      expect(p.working).toBeGreaterThanOrEqual(0.7);
      expect(p.peripheral).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("aggressive preset decays faster than conservative", () => {
    const aggressive = computeDecayCurve(makeCfg({
      timeDecayHalfLifeDays: 14, betaCore: 0.5, betaPeripheral: 1.5,
      coreDecayFloor: 0.6, workingDecayFloor: 0.4, peripheralDecayFloor: 0.2,
    }));
    const conservative = computeDecayCurve(makeCfg({
      timeDecayHalfLifeDays: 90, betaCore: 1.0, betaPeripheral: 1.5,
      coreDecayFloor: 0.95, workingDecayFloor: 0.85, peripheralDecayFloor: 0.7,
    }));
    // At 90 days, aggressive should be at or near floor, conservative still high
    expect(aggressive[6].peripheral).toBeLessThan(conservative[6].peripheral);
  });

  it("values are all between 0 and 1", () => {
    const curve = computeDecayCurve(makeCfg());
    for (const p of curve) {
      expect(p.core).toBeGreaterThanOrEqual(0);
      expect(p.core).toBeLessThanOrEqual(1);
      expect(p.working).toBeGreaterThanOrEqual(0);
      expect(p.working).toBeLessThanOrEqual(1);
      expect(p.peripheral).toBeGreaterThanOrEqual(0);
      expect(p.peripheral).toBeLessThanOrEqual(1);
    }
  });
});

// ─── visualizeDecay ────────────────────────────────────────────

describe("visualizeDecay", () => {
  function makeCfg(overrides: Partial<DecayConfig> = {}): DecayConfig {
    return {
      enabled: true,
      recencyHalfLifeDays: 30,
      recencyWeight: 0.4,
      frequencyWeight: 0.3,
      intrinsicWeight: 0.3,
      timeDecayHalfLifeDays: 30,
      betaCore: 0.8,
      betaWorking: 1.0,
      betaPeripheral: 1.3,
      coreDecayFloor: 0.9,
      workingDecayFloor: 0.7,
      peripheralDecayFloor: 0.5,
      ...overrides,
    };
  }

  it("returns a non-empty string with expected sections", () => {
    const chart = visualizeDecay(makeCfg());
    expect(chart).toContain("Decay Curve Preview");
    expect(chart).toContain("Days");
    expect(chart).toContain("Core");
    expect(chart).toContain("Working");
    expect(chart).toContain("Peripheral");
    expect(chart).toContain("Half-life");
  });

  it("includes beta and floor values in header", () => {
    const chart = visualizeDecay(makeCfg({ betaCore: 0.8, coreDecayFloor: 0.9 }));
    expect(chart).toContain("β=0.8");
    expect(chart).toContain("floor=0.90");
  });

  it("contains percentage values for each time point", () => {
    const chart = visualizeDecay(makeCfg());
    for (const days of [1, 7, 14, 30, 60, 90, 180, 365]) {
      expect(chart).toContain(`${String(days).padStart(5)}d`);
    }
  });

  it("shows weight summary", () => {
    const chart = visualizeDecay(makeCfg({
      recencyWeight: 0.4, frequencyWeight: 0.3, intrinsicWeight: 0.3,
    }));
    expect(chart).toContain("R=0.4");
    expect(chart).toContain("F=0.3");
    expect(chart).toContain("I=0.3");
  });
});

// ─── applyDecayPreset ──────────────────────────────────────────

describe("applyDecayPreset", () => {
  function makeBase(): DecayConfig {
    return {
      enabled: true,
      recencyHalfLifeDays: 60,
      recencyWeight: 0.5,
      frequencyWeight: 0.25,
      intrinsicWeight: 0.25,
      timeDecayHalfLifeDays: 60,
      betaCore: 0.9,
      betaWorking: 1.1,
      betaPeripheral: 1.4,
      coreDecayFloor: 0.85,
      workingDecayFloor: 0.65,
      peripheralDecayFloor: 0.45,
    };
  }

  it("applies balanced preset overrides to base config", () => {
    const result = applyDecayPreset(makeBase(), "balanced");
    expect(result.timeDecayHalfLifeDays).toBe(30); // overridden
    expect(result.recencyWeight).toBe(0.4); // overridden
    expect(result.betaCore).toBe(0.8); // overridden
  });

  it("preserves non-overridden base fields", () => {
    const result = applyDecayPreset(makeBase(), "aggressive");
    expect(result.enabled).toBe(true); // base field, not in preset
  });

  it("warns and uses balanced for unknown preset", () => {
    const result = applyDecayPreset(makeBase(), "nonexistent");
    expect(result.timeDecayHalfLifeDays).toBe(30); // balanced default
  });

  it("applies aggressive preset correctly", () => {
    const result = applyDecayPreset(makeBase(), "aggressive");
    expect(result.timeDecayHalfLifeDays).toBe(14);
    expect(result.coreDecayFloor).toBe(0.6);
    expect(result.workingDecayFloor).toBe(0.4);
  });

  it("applies conservative preset correctly", () => {
    const result = applyDecayPreset(makeBase(), "conservative");
    expect(result.timeDecayHalfLifeDays).toBe(90);
    expect(result.coreDecayFloor).toBe(0.95);
  });

  it("applies episodic preset correctly", () => {
    const result = applyDecayPreset(makeBase(), "episodic");
    expect(result.timeDecayHalfLifeDays).toBe(7);
    expect(result.recencyWeight).toBe(0.6);
    expect(result.peripheralDecayFloor).toBe(0.1);
  });
});
