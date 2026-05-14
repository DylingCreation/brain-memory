/**
 * brain-memory — Unified type definitions
 *
 * Merges graph-memory (knowledge graph) + memory-lancedb-pro (vector memory)
 * into a unified 8-category system with optional graph edges and decay.
 *
 * Authors: adoresever (graph-memory), win4r (memory-lancedb-pro), brain-memory contributors
 */

// ─── 8 类统一记忆体系 ──────────────────────────────────────────

/**
 * 8 类记忆分类常量：profile / preferences / entities / events /
 * tasks / skills / cases / patterns。
 * 通过 `as const` 确保类型推导为字面量联合类型。
 */
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

/** 8 类记忆分类的 TypeScript 联合类型。 */
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

// 图节点类型（3种，用于知识图谱边）
/** 图节点类型：TASK=任务, SKILL=技能, EVENT=事件。 */
export type GraphNodeType = "TASK" | "SKILL" | "EVENT";

// ─── 边类型 ───────────────────────────────────────────────────

/** 知识图谱边类型联合类型：定义节点之间的 11 种关系。 */
export type EdgeType =
  | "USED_SKILL"
  | "SOLVED_BY"
  | "REQUIRES"
  | "PATCHES"
  | "CONFLICTS_WITH"
  | "HAS_PREFERENCE"
  | "BELONGS_TO"
  | "LEARNED_FROM"
  | "EXEMPLIFIES"
  | "RELATED_TO"
  | "OBSERVED_IN";

/**
 * 边方向约束：定义每种边类型允许 from/to 端的节点类型。
 * 新增 6 种边类型（v1.0.0），使 8 类记忆节点均可建立图谱关系。
 * extract.ts 必须 import 本处定义，不得维护本地副本。
 */
export const EDGE_FROM_CONSTRAINT: Record<EdgeType, Set<GraphNodeType>> = {
  // 现有 5 种（v0.1.x）
  USED_SKILL:     new Set(["TASK"]),
  SOLVED_BY:      new Set(["EVENT", "SKILL"]),
  REQUIRES:       new Set(["SKILL"]),
  PATCHES:        new Set(["SKILL"]),
  CONFLICTS_WITH: new Set(["SKILL"]),
  // 新增 6 种（v1.0.0）
  HAS_PREFERENCE: new Set(["TASK", "SKILL", "EVENT"]),
  BELONGS_TO:     new Set(["TASK", "SKILL", "EVENT"]),
  LEARNED_FROM:   new Set(["SKILL"]),
  EXEMPLIFIES:    new Set(["SKILL"]),
  RELATED_TO:     new Set(["TASK", "SKILL", "EVENT"]),
  OBSERVED_IN:    new Set(["SKILL", "EVENT"]),
};

/** 边 to 端类型约束：定义每种边类型允许指向的目标节点类型。 */
export const EDGE_TO_CONSTRAINT: Record<EdgeType, Set<GraphNodeType>> = {
  // 现有 5 种（v0.1.x）
  USED_SKILL:     new Set(["SKILL"]),
  SOLVED_BY:      new Set(["SKILL"]),
  REQUIRES:       new Set(["SKILL"]),
  PATCHES:        new Set(["SKILL"]),
  CONFLICTS_WITH: new Set(["SKILL"]),
  // 新增 6 种（v1.0.0）
  HAS_PREFERENCE: new Set(["TASK", "SKILL", "EVENT"]),
  BELONGS_TO:     new Set(["TASK", "SKILL", "EVENT"]),
  LEARNED_FROM:   new Set(["SKILL"]),
  EXEMPLIFIES:    new Set(["SKILL"]),
  RELATED_TO:     new Set(["TASK", "SKILL", "EVENT"]),
  OBSERVED_IN:    new Set(["SKILL", "EVENT"]),
};

// ─── 节点 ─────────────────────────────────────────────────────

/** 节点状态：active=活跃, deprecated=已弃用。 */
export type NodeStatus = "active" | "deprecated";

/**
 * 记忆节点（Brain Memory Node）。
 * 知识图谱中的基本单元，包含 8 类记忆分类、类型、内容、衰减权重等。
 */
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

/** 知识图谱边（Edge）：连接两个节点的有向关系。 */
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

/** 工作记忆配置：控制当前任务、决策、约束的追踪上限。 */
export interface WorkingMemoryConfig {
  enabled: boolean;
  maxTasks: number;
  maxDecisions: number;
  maxConstraints: number;
}

/** 工作记忆运行时状态。追踪当前任务、决策、约束和关注点。 */
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

/** 知识融合配置：控制节点合并/关联的阈值和权重。 */
export interface FusionConfig {
  enabled: boolean;
  similarityThreshold: number;
  minNodes: number;
  minCommunities: number;
  // #25: configurable fusion parameters
  namePreFilterThreshold?: number;    // default 0.2
  nameWeight?: number;                 // default 0.6
  vectorWeight?: number;               // default 0.4
  autoMergeThreshold?: number;         // default 0.9
}

// ─── 推理检索配置 ─────────────────────────────────────────────

/** 推理检索配置：控制图谱遍历跳数、结论数等。 */
export interface ReasoningConfig {
  enabled: boolean;
  maxHops: number;
  maxConclusions: number;
  minRecallNodes: number;
}

// ─── 记忆注入格式配置（v1.0.0 B-1）───────────────────────────

/** 记忆注入格式配置：控制如何将召回的记忆注入到对话上下文中。 */
export interface MemoryInjectionConfig {
  /** 是否启用记忆注入 */
  enabled: boolean;
  /** 注入策略：full=完整XML / summary=仅名称+描述 / adaptive=自动切换 / off=不注入 */
  strategy: "full" | "summary" | "adaptive" | "off";
  /** Token 预算（0=不限制） */
  tokenBudget: number;
  /** 最大节点数（即使预算允许也不超过此数） */
  maxNodes: number;
  /** 是否附带原始对话片段 */
  includeEpisodic: boolean;
}

// ─── 多 Agent 记忆共享配置（v1.0.0 B-2）─────────────────────

/** 共享模式：isolated=完全隔离 / mixed=部分共享 / shared=完全共享。 */
export type SharingMode = "isolated" | "mixed" | "shared";

/** 多 Agent 记忆共享配置：控制跨 Agent 的记忆共享策略。 */
export interface MemorySharingConfig {
  /** 是否启用共享 */
  enabled: boolean;
  /** 共享模式：isolated=完全隔离 / mixed=部分共享 / shared=完全共享 */
  mode: SharingMode;
  /** 允许跨 Agent 共享的记忆类别（mixed 模式生效） */
  sharedCategories: MemoryCategory[];
  /** 允许共享的 Agent 列表（空=所有 Agent） */
  allowedAgents: string[];
}

// ─── 反思系统类型 ─────────────────────────────────────────────

/** 反思洞察的来源类型：invariant=稳定规则(跨会话持续), derived=临时观察(会话级)。 */
export type ReflectionKind = "invariant" | "derived";

/** 反思洞察的内容类型：user-model=用户画像, agent-model=Agent 能力, lesson=经验教训, decision=决策记录。 */
export type ReflectionInsightType = "user-model" | "agent-model" | "lesson" | "decision";

/** 单个反思洞察。由 LLM 在 session_end 时生成，用于提炼跨会话的长期记忆。 */
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

/** 反思系统输出。包含 LLM 生成的洞察列表和原始输出（用于调试）。 */
export interface ReflectionResult {
  insights: ReflectionInsight[];
  /** 原始 LLM 输出（用于调试） */
  rawOutput: string;
}

// ─── 提取结果 ─────────────────────────────────────────────────

/** 单轮对话提取结果。包含从用户/AI 对话中提取的节点和边。 */
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

/** 会话结束后的最终处理结果。包含晋升的技能、新建的边和失效的缓存。 */
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

/** 记忆召回结果。包含召回的节点列表、连接它们的边和预估的 token 数量。 */
export interface RecallResult {
  nodes: BmNode[];
  edges: BmEdge[];
  tokenEstimate: number;
}

// ─── Embedding 配置 ──────────────────────────────────────────

/** Embedding 服务配置。用于向量搜索和去重的文本嵌入。 */
export interface EmbeddingConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  dimensions?: number;
}

// ─── 衰减配置 ─────────────────────────────────────────────────

/** 遗忘衰减配置。控制记忆随时间推移的衰减曲线参数。使用 Weibull 分布模型。 */
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

/** 噪声过滤配置。控制提取前的消息过滤阈值。 */
export interface NoiseFilterConfig {
  enabled: boolean;
  minContentLength: number;
}

// ─── 插件配置 ─────────────────────────────────────────────────

/** 引擎运行模式：graph=知识图谱(默认), vector=纯向量检索, hybrid=双引擎混合。 */
export type EngineMode = "graph" | "vector" | "hybrid";

/** 存储后端类型：sqlite=SQLite 轻量级(默认), lancedb=LanceDB 向量数据库。 */
export type StorageBackend = "sqlite" | "lancedb";

/** 重排序配置。控制召回后是否使用外部 API 对结果重新排序。 */
export interface RerankConfig {
  enabled: boolean;
  apiKey?: string;
  model?: string;
  endpoint?: string;
  provider?: string;
  timeoutMs?: number;
}

// ─── 反思系统配置 ─────────────────────────────────────────────

/** 反思系统配置。控制轮次/会话反思的开关、安全过滤和洞察生成参数。 */
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

/** brain-memory 主配置接口。包含引擎模式、存储路径、LLM、衰减、反思、工作记忆等全部配置项。 */
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
  /** 记忆注入格式配置（v1.0.0 B-1） */
  memoryInjection: MemoryInjectionConfig;
  /** 多 Agent 记忆共享配置（v1.0.0 B-2） */
  memorySharing: MemorySharingConfig;
}

/** brain-memory 默认配置实例。开箱即用，适用于大多数场景。*/
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
    enabled: true,  // v1.0.0 B-3: default on
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
  /** v1.0.0 B-1: Memory injection format */
  memoryInjection: {
    enabled: true,
    strategy: "adaptive",
    tokenBudget: 6000,
    maxNodes: 12,
    includeEpisodic: true,
  },
  /** v1.0.0 B-2: Multi-agent memory sharing */
  memorySharing: {
    enabled: true,
    mode: "mixed",
    sharedCategories: ["profile", "preferences"],
    allowedAgents: [],
  },
};
