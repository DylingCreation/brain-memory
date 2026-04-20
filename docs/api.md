# API Reference

## Core Modules

### ContextEngine

The main entry point for the brain-memory system.

#### Constructor
```typescript
new ContextEngine(config: BmConfig)
```

Creates a new instance of the context engine with the specified configuration.

#### Methods

##### process(params)
Processes conversation messages and updates the memory system.

```typescript
async process(params: {
  messages: Array<{ role: 'user' | 'assistant'; content: string; turn_index?: number }>;
  sessionId: string;
}): Promise<ProcessResult>
```

Parameters:
- `messages`: Array of conversation messages
- `sessionId`: Unique identifier for the session

Returns: Process result containing extracted knowledge and context.

##### recall(query, options?)
Retrieves relevant knowledge based on the query.

```typescript
async recall(query: string, options?: RecallOptions): Promise<RecallResult>
```

Parameters:
- `query`: Search query
- `options`: Optional recall configuration

Returns: Recall result with relevant nodes and edges.

##### maintain()
Runs maintenance tasks including compaction, decay calculation, and community detection.

```typescript
async maintain(): Promise<MaintenanceResult>
```

Returns: Result of maintenance operations.

### Store Functions

#### upsertNode(db, nodeData, sessionId)
Creates or updates a memory node.

```typescript
upsertNode(
  db: DatabaseSyncInstance,
  nodeData: {
    type: GraphNodeType;
    category: MemoryCategory;
    name: string;
    description: string;
    content: string;
    temporalType?: 'static' | 'dynamic';
  },
  sessionId: string
): { node: BmNode; isNew: boolean }
```

#### searchNodes(db, query, limit?, scopeFilter?)
Searches for nodes using full-text search.

```typescript
searchNodes(
  db: DatabaseSyncInstance,
  query: string,
  limit?: number,
  scopeFilter?: ScopeFilter
): BmNode[]
```

### Recaller

Handles knowledge retrieval with dual-path approach.

#### recall(query, scopeFilter?)
Main retrieval method.

```typescript
async recall(
  query: string,
  scopeFilter?: ScopeFilter
): Promise<RecallResult>
```

### Extractor

Extracts structured knowledge from conversation messages.

#### extract(params)
Extracts nodes and edges from conversation messages.

```typescript
async extract(params: {
  messages: Array<any>;
  existingNames: string[];
}): Promise<ExtractionResult>
```

## Configuration

### BmConfig

Main configuration object with the following properties:

- `engine`: Engine mode ('graph', 'vector', 'hybrid')
- `storage`: Storage backend ('sqlite', 'lancedb')
- `dbPath`: Database file path
- `recallMaxNodes`: Maximum number of nodes to recall
- `recallMaxDepth`: Maximum graph traversal depth
- `recallStrategy`: Strategy for recall ('full', 'summary', 'adaptive', 'off')
- `decay`: Decay configuration object
- `noiseFilter`: Noise filtering configuration
- `reflection`: Reflection system configuration
- `workingMemory`: Working memory configuration
- `fusion`: Knowledge fusion configuration
- `reasoning`: Reasoning engine configuration