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

/** 提取前钩子输入：消息列表和已有节点名。 */
export interface BeforeExtractInput {
  messages: Array<{ role: string; content: string; turn_index?: number }>;
  existingNames: string[];
}

/** 提取后钩子输入：提取出的节点和边。 */
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

/** 提取前钩子函数：可修改输入消息和已有节点名。 */
export type BeforeExtractHook = (input: BeforeExtractInput) => Promise<BeforeExtractInput> | BeforeExtractInput;
/** 提取后钩子函数：可观察或修改提取结果。 */
export type AfterExtractHook = (input: AfterExtractInput) => Promise<AfterExtractInput> | AfterExtractInput;

// ─── Recall Hooks ───────────────────────────────────────────

/** 召回前钩子输入：查询字符串和范围过滤。 */
export interface BeforeRecallInput {
  query: string;
  scopeFilter?: ScopeFilter;
}

/** 召回后钩子输入：召回的节点和边。 */
export interface AfterRecallInput {
  nodes: BmNode[];
  edges: BmEdge[];
}

/** 召回前钩子函数：可修改查询参数。 */
export type BeforeRecallHook = (input: BeforeRecallInput) => Promise<BeforeRecallInput> | BeforeRecallInput;
/** 召回后钩子函数：可观察或修改召回结果。 */
export type AfterRecallHook = (input: AfterRecallInput) => Promise<AfterRecallInput> | AfterRecallInput;

// ─── Fusion Hooks ───────────────────────────────────────────

/** 融合前钩子函数：可过滤或修改候选节点对。 */
export type BeforeFusionHook = (candidates: FusionCandidate[]) => Promise<FusionCandidate[]> | FusionCandidate[];
/** 融合后钩子函数：可观察融合结果。 */
export type AfterFusionHook = (result: { merged: number; linked: number }) => Promise<{ merged: number; linked: number }> | { merged: number; linked: number };

// ─── Hook Registry ──────────────────────────────────────────

/** 钩子注册表：6 种钩子类型的容器。 */
export interface HookRegistry {
  beforeExtract: BeforeExtractHook[];
  afterExtract: AfterExtractHook[];
  beforeRecall: BeforeRecallHook[];
  afterRecall: AfterRecallHook[];
  beforeFusion: BeforeFusionHook[];
  afterFusion: AfterFusionHook[];
}

/** Create an empty hook registry */
/** 创建空的钩子注册表，包含所有 6 种钩子类型。 */
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
