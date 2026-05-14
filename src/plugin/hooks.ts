/**
 * brain-memory — Developer Hook System (v1.2.0 F-7)
 *
 * Provides before/after hooks for extractor, recaller, and fusion modules.
 * Allows external injection of custom logic without modifying core code.
 *
 * Hook pattern: (input) => Promise<input> | input — modifies or passes through.
 * Hooks are called in FIFO order. A hook returning its input unchanged is a no-op.
 * Hook errors are caught and logged — they never break the main pipeline.
 *
 * Authors: brain-memory contributors
 */

import type { MessageRow } from "../store/adapter";
import type { BmNode, BmEdge, MemoryCategory, GraphNodeType } from "../types";
import type { ScopeFilter } from "../scope/isolation";
import type { FusionCandidate } from "../fusion/analyzer";

// ─── Extraction Hooks ────────────────────────────────────────

export interface BeforeExtractInput {
  messages: Array<{ role: string; content: string; turn_index?: number }>;
  existingNames: string[];
}

export interface AfterExtractInput {
  nodes: Array<{
    type: GraphNodeType;
    category: MemoryCategory;
    name: string;
    description: string;
    content: string;
    temporalType?: "static" | "dynamic";
  }>;
  edges: Array<{
    from: string;
    to: string;
    type: string;
    instruction: string;
    condition?: string;
  }>;
}

export type BeforeExtractHook = (input: BeforeExtractInput) => Promise<BeforeExtractInput> | BeforeExtractInput;
export type AfterExtractHook = (input: AfterExtractInput) => Promise<AfterExtractInput> | AfterExtractInput;

// ─── Recall Hooks ───────────────────────────────────────────

export interface BeforeRecallInput {
  query: string;
  scopeFilter?: ScopeFilter;
}

export interface AfterRecallInput {
  nodes: BmNode[];
  edges: BmEdge[];
}

export type BeforeRecallHook = (input: BeforeRecallInput) => Promise<BeforeRecallInput> | BeforeRecallInput;
export type AfterRecallHook = (input: AfterRecallInput) => Promise<AfterRecallInput> | AfterRecallInput;

// ─── Fusion Hooks ───────────────────────────────────────────

export type BeforeFusionHook = (candidates: FusionCandidate[]) => Promise<FusionCandidate[]> | FusionCandidate[];
export type AfterFusionHook = (result: { merged: number; linked: number }) => Promise<{ merged: number; linked: number }> | { merged: number; linked: number };

// ─── Hook Registry ──────────────────────────────────────────

export interface HookRegistry {
  beforeExtract: BeforeExtractHook[];
  afterExtract: AfterExtractHook[];
  beforeRecall: BeforeRecallHook[];
  afterRecall: AfterRecallHook[];
  beforeFusion: BeforeFusionHook[];
  afterFusion: AfterFusionHook[];
}

/** Create an empty hook registry */
export function createHookRegistry(): HookRegistry {
  return {
    beforeExtract: [],
    afterExtract: [],
    beforeRecall: [],
    afterRecall: [],
    beforeFusion: [],
    afterFusion: [],
  };
}
