# API Reference

This document provides detailed reference for all public APIs in brain-memory.

## ContextEngine

The main orchestrator class that integrates all components.

### Constructor
```typescript
new ContextEngine(config: BmConfig)
```

**Parameters:**
- `config`: Configuration object with the following properties:
  - `dbPath`: Path to SQLite database file
  - `llm`: LLM configuration (apiKey, baseURL, model)
  - `embedding`: Embedding configuration (apiKey, baseURL, model)
  - `recallMaxNodes`: Maximum number of nodes to recall (default: 10)
  - `recallStrategy`: Recall strategy ('graph', 'vector', or 'hybrid') (default: 'hybrid')
  - `fusion`: Fusion configuration
  - `decay`: Decay configuration
  - `reflection`: Reflection configuration
  - `workingMemory`: Working memory configuration

### Methods

#### processTurn
Processes a conversation turn and extracts knowledge.

```typescript
async processTurn(params: {
  sessionId: string;
  agentId: string;
  workspaceId: string;
  messages: Array<{ role: string; content: string; turn_index?: number }>;
}): Promise<{
  extractedNodes: BmNode[];
  extractedEdges: BmEdge[];
  reflections: ReflectionInsight[];
  workingMemory: WorkingMemoryState;
}>
```

**Parameters:**
- `sessionId`: Unique identifier for the session
- `agentId`: Identifier for the agent
- `workspaceId`: Identifier for the workspace
- `messages`: Array of conversation messages

**Returns:**
- `extractedNodes`: Knowledge nodes extracted from the turn
- `extractedEdges`: Knowledge edges extracted from the turn
- `reflections`: Reflection insights derived from the turn
- `workingMemory`: Updated working memory state

#### recall
Recalls relevant knowledge for a query.

```typescript
async recall(query: string, sessionId?: string, agentId?: string, workspaceId?: string): Promise<RecallResult>
```

**Parameters:**
- `query`: Search query string
- `sessionId`: Optional session ID for scope filtering
- `agentId`: Optional agent ID for scope filtering
- `workspaceId`: Optional workspace ID for scope filtering

**Returns:**
- `nodes`: Array of relevant knowledge nodes
- `edges`: Array of relevant knowledge edges
- `tokenEstimate`: Estimated token count of results
- `diagnostics`: Performance and diagnostic information

#### performFusion
Performs knowledge fusion to merge duplicate/related nodes.

```typescript
async performFusion(sessionId?: string): Promise<FusionResult>
```

**Parameters:**
- `sessionId`: Optional session ID to scope fusion to specific session

**Returns:**
- `candidates`: Fusion candidates identified
- `merged`: Number of nodes merged
- `linked`: Number of new edges created
- `durationMs`: Operation duration in milliseconds

#### reflectOnSession
Performs reflection on a completed session.

```typescript
async reflectOnSession(sessionId: string, messages: Array<{ role: string; content: string }>): Promise<ReflectionInsight[]>
```

**Parameters:**
- `sessionId`: Session ID to reflect on
- `messages`: Complete session message history

**Returns:**
- Array of reflection insights derived from the session

#### performReasoning
Runs reasoning to derive new insights from existing knowledge.

```typescript
async performReasoning(query?: string): Promise<ReasoningConclusion[]>
```

**Parameters:**
- `query`: Optional query to guide reasoning

**Returns:**
- Array of reasoning conclusions

#### runMaintenance
Runs maintenance tasks (PageRank, community detection, etc.).

```typescript
async runMaintenance(): Promise<void>
```

**Returns:**
- Promise that resolves when maintenance is complete

#### getWorkingMemoryContext
Gets the current working memory context.

```typescript
getWorkingMemoryContext(): string | null
```

**Returns:**
- Working memory context as a string, or null if empty

#### close
Closes the database connection.

```typescript
close(): void
```

## Types

### BmConfig
Configuration interface for the brain-memory system.

```typescript
interface BmConfig {
  dbPath: string;                    // Path to SQLite database
  llm: {                             // LLM configuration
    apiKey: string;
    baseURL: string;
    model: string;
  };
  embedding: {                       // Embedding configuration
    apiKey: string;
    baseURL: string;
    model: string;
  };
  recallMaxNodes: number;            // Max nodes to recall (default: 10)
  recallStrategy: 'graph' | 'vector' | 'hybrid'; // Recall strategy (default: 'hybrid')
  fusion: FusionConfig;              // Fusion settings
  decay: DecayConfig;                // Decay settings
  reflection: ReflectionConfig;      // Reflection settings
  workingMemory: WorkingMemoryConfig; // Working memory settings
}
```

### BmNode
Represents a knowledge node in the graph.

```typescript
interface BmNode {
  id: string;                        // Unique identifier
  type: GraphNodeType;               // Node type (TASK, SKILL, EVENT)
  category: MemoryCategory;          // Memory category
  name: string;                      // Display name
  description: string;               // Brief description
  content: string;                   // Full content
  status: 'active' | 'deprecated';   // Node status
  validatedCount: number;            // Validation count (affects importance)
  sourceSessions: string[];          // Sessions that contributed to this node
  communityId: string | null;        // Associated community ID
  pagerank: number;                  // PageRank score
  importance: number;                // Importance score (0-1)
  accessCount: number;               // Access frequency count
  lastAccessedAt: number;            // Timestamp of last access
  temporalType: 'static' | 'dynamic'; // Temporal classification
  scopeSession: string | null;       // Session scope
  scopeAgent: string | null;         // Agent scope
  scopeWorkspace: string | null;     // Workspace scope
  createdAt: number;                 // Creation timestamp
  updatedAt: number;                 // Last update timestamp
}
```

### BmEdge
Represents a relationship between nodes.

```typescript
interface BmEdge {
  id: string;                        // Unique identifier
  fromId: string;                    // Source node ID
  toId: string;                      // Target node ID
  type: EdgeType;                    // Edge type
  instruction: string;               // Relationship instruction
  condition?: string;                // Conditional relationship
  sessionId: string;                 // Session where edge was created
  createdAt: number;                 // Creation timestamp
}
```

### RecallResult
Result of a recall operation.

```typescript
interface RecallResult {
  nodes: BmNode[];                   // Retrieved nodes
  edges: BmEdge[];                   // Retrieved edges
  tokenEstimate: number;             // Estimated token count
  diagnostics?: {                    // Optional diagnostics
    graphCount: number;              // Number of graph results
    vectorCount: number;             // Number of vector results
    fusedCount: number;              // Number of fused results
    intent: string;                  // Detected intent
  };
}
```

### FusionResult
Result of a fusion operation.

```typescript
interface FusionResult {
  candidates: FusionCandidate[];     // Identified fusion candidates
  merged: number;                    // Number of nodes merged
  linked: number;                    // Number of new links created
  durationMs: number;                // Operation duration in ms
}
```

### FusionCandidate
A potential fusion opportunity.

```typescript
interface FusionCandidate {
  nodeA: BmNode;                     // First node to merge
  nodeB: BmNode;                     // Second node to merge
  similarity: number;                // Similarity score (0-1)
  decision: 'merge' | 'link' | 'none'; // Recommended action
  reason: string;                    // Reason for recommendation
}
```

### ReflectionInsight
An insight derived through reflection.

```typescript
interface ReflectionInsight {
  text: string;                      // Reflection text
  kind: 'decision' | 'pattern' | 'preference' | 'fact'; // Insight type
  reflectionKind: 'derived' | 'learned' | 'realized'; // Reflection subtype
  confidence: number;                // Confidence score (0-1)
}
```

### WorkingMemoryState
Current state of working memory.

```typescript
interface WorkingMemoryState {
  tasks: string[];                   // Active tasks
  decisions: string[];               // Recent decisions
  constraints: string[];             // Active constraints
  attention: string;                 // Current attention focus
  lastUpdate: number;                // Last update timestamp
}
```

## Constants

### DEFAULT_CONFIG
Default configuration object with sensible defaults for all settings.

```typescript
const DEFAULT_CONFIG: BmConfig;
```

### MEMORY_CATEGORIES
List of all supported memory categories.

```typescript
const MEMORY_CATEGORIES: MemoryCategory[];
```

### VALID_NODE_TYPES
List of all valid node types.

```typescript
const VALID_NODE_TYPES: GraphNodeType[];
```

## Utility Functions

### createCompleteFn
Creates a completion function for LLM calls.

```typescript
function createCompleteFn(config: { apiKey: string; baseURL: string; model: string }): CompleteFn | null
```

### createEmbedFn
Creates an embedding function for vector operations.

```typescript
function createEmbedFn(config: { apiKey: string; baseURL: string; model: string }): EmbedFn | null
```

### initDb
Initializes the database with required schema.

```typescript
function initDb(dbPath: string): DatabaseSyncInstance
```

## Events

The ContextEngine emits the following events:

### 'knowledge-extracted'
Emitted when knowledge is extracted from a conversation.

```typescript
engine.on('knowledge-extracted', (data: {
  sessionId: string;
  nodes: BmNode[];
  edges: BmEdge[];
  durationMs: number;
}) => {
  console.log(`Extracted ${data.nodes.length} nodes in session ${data.sessionId}`);
});
```

### 'memory-recalled'
Emitted when memory recall is performed.

```typescript
engine.on('memory-recalled', (data: {
  query: string;
  count: number;
  durationMs: number;
}) => {
  console.log(`Recalled ${data.count} memories for query: ${data.query}`);
});
```

### 'fusion-completed'
Emitted when fusion is completed.

```typescript
engine.on('fusion-completed', (data: {
  sessionId: string;
  merged: number;
  linked: number;
  durationMs: number;
}) => {
  console.log(`Fusion completed: ${data.merged} merged, ${data.linked} linked`);
});
```

### 'reflection-generated'
Emitted when reflection is performed.

```typescript
engine.on('reflection-generated', (data: {
  kind: 'turn' | 'session';
  sessionId: string;
  insights: ReflectionInsight[];
}) => {
  console.log(`Generated ${data.insights.length} insights`);
});
```

## Error Handling

All asynchronous methods may throw errors in the following situations:

- **DatabaseError**: Issues with database operations
- **ValidationError**: Invalid input parameters
- **LLMError**: Issues with LLM API calls
- **NetworkError**: Network connectivity issues
- **ConfigError**: Invalid configuration

Errors are typically subclasses of Error with specific error codes and messages. Always wrap calls in try-catch blocks in production code.