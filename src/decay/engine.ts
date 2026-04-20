/**
 * brain-memory — Weibull decay engine
 *
 * From memory-lancedb-pro: important memories persist, noise fades naturally.
 * Composite score = recencyWeight * recency + frequencyWeight * frequency + intrinsicWeight * intrinsic
 *
 * Authors: win4r (memory-lancedb-pro), brain-memory contributors
 */

import type { DecayConfig, BmNode } from "../types.ts";

const MS_PER_DAY = 86_400_000;

export interface DecayScore {
  memoryId: string;
  recency: number;
  frequency: number;
  intrinsic: number;
  composite: number;
}

function weibullDecay(ageDays: number, halfLifeDays: number, beta: number, floor: number): number {
  if (halfLifeDays <= 0) return 1;
  const lambda = halfLifeDays / Math.pow(Math.log(2), 1 / beta);
  const decay = Math.exp(-Math.pow(ageDays / lambda, beta));
  return Math.max(floor, decay);
}

function getTierParams(importance: number, cfg: DecayConfig) {
  if (importance > 0.7) return { beta: cfg.betaCore, floor: cfg.coreDecayFloor };
  if (importance > 0.4) return { beta: cfg.betaWorking, floor: cfg.workingDecayFloor };
  return { beta: cfg.betaPeripheral, floor: cfg.peripheralDecayFloor };
}

export function scoreDecay(node: BmNode, cfg: DecayConfig, now?: number): DecayScore {
  const n = now || Date.now();
  const ageDays = (n - node.createdAt) / MS_PER_DAY;
  const tier = getTierParams(node.importance, cfg);
  const effectiveHalfLife = node.temporalType === "dynamic"
    ? cfg.timeDecayHalfLifeDays / 3
    : cfg.timeDecayHalfLifeDays;

  const recency = weibullDecay(ageDays, effectiveHalfLife, tier.beta, tier.floor);
  const frequency = Math.min(1, Math.log10(node.accessCount + 1) / 3);
  const intrinsic = node.importance;
  const composite = cfg.recencyWeight * recency
    + cfg.frequencyWeight * frequency
    + cfg.intrinsicWeight * intrinsic;

  return { memoryId: node.id, recency, frequency, intrinsic, composite };
}

/** Apply time decay as a multiplicative penalty on retrieval scores */
export function applyTimeDecay(score: number, node: BmNode, cfg: DecayConfig, now?: number): number {
  const n = now || Date.now();
  const ageDays = (n - node.createdAt) / MS_PER_DAY;
  const effectiveHalfLife = node.temporalType === "dynamic"
    ? cfg.timeDecayHalfLifeDays / 3
    : cfg.timeDecayHalfLifeDays;
  if (effectiveHalfLife <= 0 || ageDays <= 0) return score;
  const tier = getTierParams(node.importance, cfg);
  const decay = weibullDecay(ageDays, effectiveHalfLife, tier.beta, tier.floor);
  return score * (0.5 + 0.5 * decay);
}
