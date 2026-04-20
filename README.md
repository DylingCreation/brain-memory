# like-human-brain-memory

Unified knowledge graph + vector memory system for AI agents. Provides 8-category memory system with dual-path recall (graph + vector), community detection, and reflection capabilities.

## Features

- **8-Category Memory System**: Tasks, skills, events, profiles, preferences, entities, cases, patterns
- **Dual-Path Recall**: Combines graph traversal and vector similarity for optimal results
- **Community Detection**: Identifies related knowledge clusters using Label Propagation Algorithm
- **Personalized PageRank**: Ranks knowledge based on relevance to current context
- **Reflection System**: Derives insights from conversation history
- **Working Memory**: Maintains short-term context for ongoing conversations
- **Decay Model**: Implements Weibull model for intelligent forgetting
- **Multi-Scope Isolation**: Supports session/agent/workspace level data isolation

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    API Layer                            │
│             ContextEngine (Unified Interface)           │
└─────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────┐
│                   Control Layer                         │
│  Extractor │ Recaller │ Fusion │ Reflection │ Reasoning │
└─────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────┐
│                   Algorithm Layer                       │
│ PageRank │ Community Detection │ Vector Similarity    │
└─────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────┐
│                   Storage Layer                         │
│        SQLite (Graph + Vector + FTS5)                 │
└─────────────────────────────────────────────────────────┘
```

## Installation

```bash
npm install like-human-brain-memory
```

## Usage

```typescript
import { ContextEngine, DEFAULT_CONFIG } from 'like-human-brain-memory';

const config = {
  ...DEFAULT_CONFIG,
  dbPath: './my-brain-memory.db',
  llm: {
    apiKey: process.env.OPENAI_API_KEY!,
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini'
  },
  embedding: {
    apiKey: process.env.OPENAI_API_KEY!,
    baseURL: 'https://api.openai.com/v1',
    model: 'text-embedding-3-small'
  }
};

const engine = new ContextEngine(config);

// Process conversation turns
const result = await engine.processTurn({
  sessionId: 'session-1',
  agentId: 'agent-1',
  workspaceId: 'workspace-1',
  messages: [{
    role: 'user',
    content: 'I need to learn TypeScript patterns for AI agents'
  }]
});

// Recall relevant knowledge
const recallResult = await engine.recall('TypeScript patterns');
```

## Configuration

The system supports comprehensive configuration for all aspects:

- **LLM Settings**: API endpoints, models, parameters
- **Embedding Settings**: Vector models, dimensions, endpoints
- **Recall Settings**: Max nodes, strategies, depth
- **Fusion Settings**: Duplicate detection thresholds
- **Decay Settings**: Half-life periods, weighting
- **Reflection Settings**: Enabled modes, thresholds
- **Working Memory Settings**: Capacity, retention policies

## Key Components

### ContextEngine
Main orchestrator that integrates all components. Provides unified API for:
- Knowledge extraction from conversations
- Dual-path recall (graph + vector)
- Knowledge fusion and deduplication
- Reflection and reasoning
- Working memory management

### Knowledge Extraction
Extracts structured knowledge from conversations using LLMs:
- Graph triple extraction (nodes and relationships)
- 8-category memory classification
- Temporal classification (static/dynamic)
- Noise filtering

### Dual-Path Recall
Combines two complementary approaches:
- **Graph Path**: Vector/FTS5 → Community expansion → Graph traversal → PPR ranking
- **Vector Path**: Vector search → FTS5 → RRF fusion → Reranking

### Memory Decay
Implements Weibull model for intelligent forgetting:
- Separates static and dynamic information
- Applies different decay rates
- Considers access frequency and recency

## Performance Optimizations

The system includes several performance optimizations:

1. **Efficient Vector Search**: Filters nodes before loading vectors to reduce memory usage
2. **Batched Database Operations**: Reduces database round trips
3. **Caching Mechanisms**: Caches frequently accessed data
4. **Algorithmic Improvements**: Optimized graph algorithms for large datasets

## Security

- Parameterized SQL queries to prevent injection attacks
- Scope-based isolation for multi-tenant environments
- Input validation and sanitization
- Secure credential handling

## Configuration

The package offers both programmatic and interactive configuration options:

### Interactive Configuration (Recommended for non-programmers)

Run the interactive configuration wizard after installation:

```bash
# If you're in the project directory:
npm run configure

# Or run the configuration script directly:
npx like-human-brain-memory configure
```

The interactive configuration will guide you through:
- Setting up database path
- Configuring LLM API settings (API key, base URL, model)
- Configuring embedding API settings
- Setting up decay and recall parameters
- Customizing other system behaviors

### Programmatic Configuration (For developers)

For programmatic use, you can configure the engine directly in code:

```typescript
import { ContextEngine, DEFAULT_CONFIG } from 'like-human-brain-memory';

const config = {
  ...DEFAULT_CONFIG,
  dbPath: './my-brain-memory.db',
  llm: {
    apiKey: process.env.OPENAI_API_KEY!,
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini'
  },
  embedding: {
    apiKey: process.env.OPENAI_API_KEY!,
    baseURL: 'https://api.openai.com/v1',
    model: 'text-embedding-3-small'
  }
};

const engine = new ContextEngine(config);
```

## Testing

The project includes comprehensive test coverage:
- Unit tests for individual components
- Integration tests for full workflows
- Performance benchmarks
- Error handling verification

Run tests with:
```bash
npm test
```

## Contributing

See CONTRIBUTING.md for contribution guidelines.

## License

MIT