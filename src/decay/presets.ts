/**
 * brain-memory — Decay configuration presets and visualization
 *
 * Phase 4 (#26): Pre-calibrated decay configurations for common usage patterns,
 * plus a visualization tool to preview decay curves before deployment.
 */

import type { DecayConfig } from "../types";
import { logger } from "../utils/logger";

// ─── Presets ──────────────────────────────────────────────────

export const DECAY_PRESETS: Record<string, Partial<DecayConfig>> = {
  /** Aggressive decay — for active users with frequent new memories */
  aggressive: {
    recencyWeight: 0.5,
    frequencyWeight: 0.2,
    intrinsicWeight: 0.3,
    timeDecayHalfLifeDays: 14,
    betaCore: 0.5,
    betaWorking: 0.8,
    betaPeripheral: 1.5,
    coreDecayFloor: 0.6,
    workingDecayFloor: 0.4,
    peripheralDecayFloor: 0.2,
  },

  /** Balanced decay — recommended default */
  balanced: {
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
  },

  /** Conservative decay — for low-frequency users, memories persist longer */
  conservative: {
    recencyWeight: 0.3,
    frequencyWeight: 0.35,
    intrinsicWeight: 0.35,
    timeDecayHalfLifeDays: 90,
    betaCore: 1.0,
    betaWorking: 1.2,
    betaPeripheral: 1.5,
    coreDecayFloor: 0.95,
    workingDecayFloor: 0.85,
    peripheralDecayFloor: 0.7,
  },

  /** Episodic focus — recent sessions matter most, older fades quickly */
  episodic: {
    recencyWeight: 0.6,
    frequencyWeight: 0.15,
    intrinsicWeight: 0.25,
    timeDecayHalfLifeDays: 7,
    betaCore: 0.4,
    betaWorking: 0.7,
    betaPeripheral: 1.8,
    coreDecayFloor: 0.5,
    workingDecayFloor: 0.3,
    peripheralDecayFloor: 0.1,
  },
};

// ─── Visualization ────────────────────────────────────────────

export interface DecayCurvePoint {
  days: number;
  core: number;
  working: number;
  peripheral: number;
}

/**
 * Generate decay curve data for visualization.
 * Returns points at [1, 7, 14, 30, 60, 90, 180, 365] days.
 */
export function computeDecayCurve(cfg: DecayConfig): DecayCurvePoint[] {
  const dayPoints = [1, 7, 14, 30, 60, 90, 180, 365];
  return dayPoints.map(days => {
    const ageDays = days;
    const lambda = (halfLife: number, beta: number) =>
      halfLife / Math.pow(Math.log(2), 1 / beta);

    const decay = (halfLife: number, beta: number, floor: number) => {
      if (halfLife <= 0) return 1;
      const l = lambda(halfLife, beta);
      return Math.max(floor, Math.exp(-Math.pow(ageDays / l, beta)));
    };

    return {
      days,
      core: decay(cfg.timeDecayHalfLifeDays, cfg.betaCore, cfg.coreDecayFloor),
      working: decay(cfg.timeDecayHalfLifeDays, cfg.betaWorking, cfg.workingDecayFloor),
      peripheral: decay(cfg.timeDecayHalfLifeDays, cfg.betaPeripheral, cfg.peripheralDecayFloor),
    };
  });
}

/**
 * Generate a text-based decay curve chart for console output.
 */
export function visualizeDecay(cfg: DecayConfig): string {
  const curve = computeDecayCurve(cfg);
  let chart = "Decay Curve Preview\n";
  chart += "=".repeat(70) + "\n";
  chart += "Days  | Core (β=" + cfg.betaCore.toFixed(1) + ", floor=" + cfg.coreDecayFloor.toFixed(2) +
           ") | Working (β=" + cfg.betaWorking.toFixed(1) + ", floor=" + cfg.workingDecayFloor.toFixed(2) +
           ") | Peripheral (β=" + cfg.betaPeripheral.toFixed(1) + ", floor=" + cfg.peripheralDecayFloor.toFixed(2) + ")\n";
  chart += "-".repeat(70) + "\n";
  for (const p of curve) {
    chart += `${String(p.days).padStart(5)}d | ${(p.core * 100).toFixed(1).padStart(5)}%` +
             ` | ${(p.working * 100).toFixed(1).padStart(5)}%` +
             ` | ${(p.peripheral * 100).toFixed(1).padStart(5)}%\n`;
  }
  chart += "-".repeat(70) + "\n";
  chart += `Half-life: ${cfg.timeDecayHalfLifeDays}d | Weights: R=${cfg.recencyWeight} F=${cfg.frequencyWeight} I=${cfg.intrinsicWeight}\n`;
  return chart;
}

/**
 * Apply a preset to an existing config, overriding only the preset's fields.
 */
export function applyDecayPreset(base: DecayConfig, presetName: string): DecayConfig {
  const preset = DECAY_PRESETS[presetName];
  if (!preset) {
    logger.warn("decay", `Unknown decay preset: ${presetName}. Using "balanced".`);
    return { ...base, ...DECAY_PRESETS.balanced };
  }
  return { ...base, ...preset };
}
