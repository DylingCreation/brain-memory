/**
 * brain-memory — Unified type definitions
 *
 * Merges graph-memory (knowledge graph) + memory-lancedb-pro (vector memory)
 * into a unified 8-category system with optional graph edges and decay.
 *
 * Authors: adoresever (graph-memory), win4r (memory-lancedb-pro), brain-memory contributors
 */

// ─── 8 类统一记忆体系 ──────────────────────────────────────────

export const MEMORY_CATEGORIES = [
  "profile",      // 用户画像
  "preferences",  // 用户偏好
  "entities",     // 实体信息
  "events",       // 报错/异常
  "tasks",        // 完成的任务/讨论主题
  "skills",       // 可复用的操作技能
  "cases",        // 案例经验
  "patterns",     // 模式规律
] as const;

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

// 图节点类型（3种，用于知识图谱边）
export type GraphNodeType = "TASK" | "SKILL" | "EVENT";

// ─── 边类型 ───────────────────────────────────────────────────

export type EdgeType =
  | "USED_SKILL"
  | "SOLVED_BY"
  | "REQUIRES"
  | "PATCHES"
  | "CONFLICTS_WITH";

// 边方向约束
export const EDGE_FROM_CONSTRAINT: Record<EdgeType, Set<GraphNodeType>> = {
  USED_SKILL:     new Set(["TASK"]),
  SOLVED_BY:      new Set(["EVENT", "SKILL"]),
  REQUIRES:       new Set(["SKILL"]),
  PATCHES:        new Set(["SKILL"]),
  CONFLICTS_WITH: new Set(["SKILL"]),
};

export const EDGE_TO_CONSTRAINT: Record<EdgeType, Set<GraphNodeType>> = {
  USED_SKILL:     new Set(["SKILL"]),
  SOLVED_BY:      new Set(["SKILL"]),
  REQUIRES:       new Set(["SKILL"]),
  PATCHES:        new Set(["SKILL"]),
  CONFLICTS_WITH: new Set(["SKILL"]),
};

// ─── 节点 ─────────────────────────────────────────────────────

export type NodeStatus = "active" | "deprecated";

export interface BmNode {
  id: string;
  type: GraphNodeType;
  category: MemoryCategory;
  name: string;
  description: string;
  content: string;
  status: NodeStatus;
  validatedCount: number;
  sourceSessions: string[];
  communityId: string | null;
  pagerank: number;
  /** 衰减模型字段 */
  importance: number;
  accessCount: number;
  lastAccessedAt: number;
  /** Temporal: static facts vs dynamic info */
  temporalType: "static" | "dynamic";
  /** Knowledge source: "user"=user message, "assistant"=AI reply */
  source: "user" | "assistant";
  /** Scope isolation fields */
  scopeSession: string | null;
  scopeAgent: string | null;
  scopeWorkspace: string | null;
  createdAt: number;
  updatedAt: number;
}

// ─── 边 ───────────────────────────────────────────────────────

export interface BmEdge {
  id: string;
  fromId: string;
  toId: string;
  type: EdgeType;
  instruction: string;
  condition?: string;
  sessionId: string;
  createdAt: number;
}

// ─── 工作记忆配置 ─────────────────────────────────────────────

export interface WorkingMemoryConfig {
  enabled: boolean;
  maxTasks: number;
  maxDecisions: number;
  maxConstraints: number;
}

export interface WorkingMemoryState {
  /** 当前任务目标（从最近提取的 TASK 节点推断） */
  currentTasks: string[];
  /** 最近决策和承诺（本轮新增/验证的节点） */
  recentDecisions: string[];
  /** 需要注意的约束条件（preference 类节点） */
  constraints: string[];
  /** 当前关注点（最近用户消息摘要） */
  attention: string;
  /** AI 最近的承诺和行动 */
  recentCommitments: string[];
  /** 最后更新时间 */
  updatedAt: number;
}

// ─── 知识融合配置 ─────────────────────────────────────────────

export interface FusionConfig {
  enabled: boolean;
  similarityThreshold: number;
  minNodes: number;
  minCommunities: number;
}

// ─── 推理检索配置 ─────────────────────────────────────────────

export interface ReasoningConfig {
  enabled: boolean;
  maxHops: number;
  maxConclusions: number;
  minRecallNodes: number;
}

// ─── 反思系统类型 ─────────────────────────────────────────────

export type ReflectionKind = "invariant" | "derived";
export type ReflectionInsightType = "user-model" | "agent-model" | "lesson" | "decision";

export interface ReflectionInsight {
  /** 洞察文本 */
  text: string;
  /** 洞察类型 */
  kind: ReflectionInsightType;
  /** invariant=稳定规则(半衰45天), derived=临时观察(半衰7天) */
  reflectionKind: ReflectionKind;
  /** 置信度 0-1 */
  confidence: number;
}

export interface ReflectionResult {
  insights: ReflectionInsight[];
  /** 原始 LLM 输出（用于调试） */
  rawOutput: string;
}

// ─── 提取结果 ─────────────────────────────────────────────────

export interface ExtractionResult {
  nodes: Array<{
    type: GraphNodeType;
    category: MemoryCategory;
    name: string;
    description: string;
    content: string;
    temporalType: "static" | "dynamic";
  }>;
  edges: Array<{
    from: string;
    to: string;
    type: EdgeType;
    instruction: string;
    condition?: string;
  }>;
}

export interface FinalizeResult {
  promotedSkills: Array<{
    type: "SKILL";
    name: string;
    description: string;
    content: string;
  }>;
  newEdges: Array<{
    from: string;
    to: string;
    type: EdgeType;
    instruction: string;
  }>;
  invalidations: string[];
}

// ─── 召回结果 ─────────────────────────────────────────────────

export interface RecallResult {
  nodes: BmNode[];
  edges: BmEdge[];
  tokenEstimate: number;
}

// ─── Embedding 配置 ──────────────────────────────────────────

export interface EmbeddingConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  dimensions?: number;
}

// ─── 衰减配置 ─────────────────────────────────────────────────

export interface DecayConfig {
  enabled: boolean;
  recencyHalfLifeDays: number;
  recencyWeight: number;
  frequencyWeight: number;
  intrinsicWeight: number;
  timeDecayHalfLifeDays: number;
  betaCore: number;
  betaWorking: number;
  betaPeripheral: number;
  coreDecayFloor: number;
  workingDecayFloor: number;
  peripheralDecayFloor: number;
}

// ─── 噪声过滤配置 ─────────────────────────────────────────────

export interface NoiseFilterConfig {
  enabled: boolean;
  minContentLength: number;
}

// ─── 插件配置 ─────────────────────────────────────────────────

export type EngineMode = "graph" | "vector" | "hybrid";
export type StorageBackend = "sqlite" | "lancedb";

export interface RerankConfig {
  enabled: boolean;
  apiKey?: string;
  model?: string;
  endpoint?: string;
  provider?: string;
  timeoutMs?: number;
}

// ─── 反思系统配置 ─────────────────────────────────────────────

export interface ReflectionConfig {
  /** 是否启用反思系统 */
  enabled: boolean;
  /** 轮次反思（轻量，afterTurn 时扫描本轮提取结果） */
  turnReflection: boolean;
  /** 会话反思（重量，session_end 时 LLM 全量分析） */
  sessionReflection: boolean;
  /** 安全过滤（防止 prompt injection） */
  safetyFilter: boolean;
  /** 单次反思最大洞察数 */
  maxInsights: number;
  /** 反思节点 importance 提升值 */
  importanceBoost: number;
  /** 最低置信度阈值 */
  minConfidence: number;
}

export interface BmConfig {
  /** 引擎模式：graph=知识图谱(默认), vector=向量检索, hybrid=双引擎 */
  engine: EngineMode;
  /** 存储后端：sqlite=轻量(默认), lancedb=向量库 */
  storage: StorageBackend;
  dbPath: string;
  compactTurnCount: number;
  recallMaxNodes: number;
  recallMaxDepth: number;
  recallStrategy: "full" | "summary" | "adaptive" | "off";
  embedding?: EmbeddingConfig;
  llm?: {
    apiKey?: string;
    baseURL?: string;
    model?: string;
  };
  dedupThreshold: number;
  pagerankDamping: number;
  pagerankIterations: number;
  decay: DecayConfig;
  noiseFilter: NoiseFilterConfig;
  rerank?: RerankConfig;
  /** 反思系统配置 */
  reflection: ReflectionConfig;
  /** 工作记忆配置 */
  workingMemory: WorkingMemoryConfig;
  /** 知识融合配置 */
  fusion: FusionConfig;
  /** 推理检索配置 */
  reasoning: ReasoningConfig;
}

export const DEFAULT_CONFIG: BmConfig = {
  engine: "graph",
  storage: "sqlite",
  dbPath: "~/.openclaw/brain-memory.db",
  compactTurnCount: 6,
  recallMaxNodes: 6,
  recallMaxDepth: 2,
  recallStrategy: "full",
  dedupThreshold: 0.90,
  pagerankDamping: 0.85,
  pagerankIterations: 20,
  decay: {
    enabled: false,
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
  },
  noiseFilter: {
    enabled: true,
    minContentLength: 10,
  },
  llm: {},
  embedding: {},
  rerank: {
    enabled: false,
  },
  reflection: {
    enabled: true,
    turnReflection: false,
    sessionReflection: true,
    safetyFilter: true,
    maxInsights: 8,
    importanceBoost: 0.15,
    minConfidence: 0.6,
  },
  workingMemory: {
    enabled: true,
    maxTasks: 3,
    maxDecisions: 5,
    maxConstraints: 5,
  },
  fusion: {
    enabled: true,
    similarityThreshold: 0.75,
    minNodes: 20,
    minCommunities: 3,
  },
  reasoning: {
    enabled: true,
    maxHops: 2,
    maxConclusions: 3,
    minRecallNodes: 3,
  },
};
