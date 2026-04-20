# Usage Guide

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm or yarn package manager
- (Optional) Ollama for local embedding models

### Installation

1. Clone the repository:
```bash
git clone https://github.com/DylingCreation/brain-memory.git
cd brain-memory
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your API keys and settings
```

### Basic Setup

The system uses a modular architecture with several key components:

```typescript
import { ContextEngine } from './src/engine/context.ts';
import { DEFAULT_CONFIG } from './src/types.ts';

// Initialize the engine with default configuration
const engine = new ContextEngine(DEFAULT_CONFIG);

// Or customize the configuration
const config = {
  ...DEFAULT_CONFIG,
  engine: 'hybrid',  // Use hybrid recall engine
  recallMaxNodes: 10,  // Increase max recall nodes
  decay: {
    ...DEFAULT_CONFIG.decay,
    enabled: true,  // Enable decay
    recencyWeight: 0.5  // Adjust recency weight
  }
};

const customEngine = new ContextEngine(config);
```

## Core Operations

### Processing Conversation Messages

The primary operation is processing conversation messages to extract and store knowledge:

```typescript
const result = await engine.process({
  messages: [
    {
      role: 'user',
      content: 'How do I deploy a Flask app with Docker?',
      turn_index: 1
    },
    {
      role: 'assistant',
      content: 'You can use Docker containers for deployment. Create a Dockerfile and docker-compose.yml.',
      turn_index: 2
    }
  ],
  sessionId: 'session-123'
});

console.log('Extracted nodes:', result.extractedNodes.length);
console.log('Extracted edges:', result.extractedEdges.length);
```

### Retrieving Relevant Knowledge

Retrieve contextually relevant information for a query:

```typescript
const recallResult = await engine.recall('docker deployment');

console.log('Recalled nodes:', recallResult.nodes.length);
console.log('Recalled edges:', recallResult.edges.length);
console.log('Token estimate:', recallResult.tokenEstimate);

// Access individual nodes
recallResult.nodes.forEach(node => {
  console.log(`${node.type}: ${node.name} - ${node.description}`);
});
```

### Managing Sessions

The system supports multi-session isolation:

```typescript
// Different sessions maintain separate memory contexts
const session1Result = await engine.process({
  messages: [/* session 1 messages */],
  sessionId: 'user-session-1'
});

const session2Result = await engine.process({
  messages: [/* session 2 messages */],
  sessionId: 'user-session-2'
});

// Each session will only recall its own relevant information
const session1Recall = await engine.recall('docker', {
  includeScopes: [{ sessionId: 'user-session-1' }]
});
```

## Advanced Features

### Reflection System

Enable session-level insights:

```typescript
const reflectionConfig = {
  ...DEFAULT_CONFIG,
  reflection: {
    enabled: true,
    sessionReflection: true,
    safetyFilter: true,
    maxInsights: 8,
    importanceBoost: 0.15,
    minConfidence: 0.6
  }
};

const engineWithReflection = new ContextEngine(reflectionConfig);
```

### Knowledge Fusion

Detect and merge similar knowledge:

```typescript
const fusionConfig = {
  ...DEFAULT_CONFIG,
  fusion: {
    enabled: true,
    similarityThreshold: 0.75,
    minNodes: 20,
    minCommunities: 3
  }
};

const engineWithFusion = new ContextEngine(fusionConfig);
```

### Intelligent Decay

Configure forgetting mechanisms:

```typescript
const decayConfig = {
  ...DEFAULT_CONFIG,
  decay: {
    enabled: true,
    recencyHalfLifeDays: 30,
    recencyWeight: 0.4,
    frequencyWeight: 0.3,
    intrinsicWeight: 0.3,
    timeDecayHalfLifeDays: 60,
    betaCore: 0.8,      // Core memory decay parameter
    betaWorking: 1.0,   // Working memory decay parameter
    betaPeripheral: 1.3, // Peripheral memory decay parameter
    coreDecayFloor: 0.9,      // Minimum decay for core memories
    workingDecayFloor: 0.7,   // Minimum decay for working memories
    peripheralDecayFloor: 0.5 // Minimum decay for peripheral memories
  }
};

const engineWithDecay = new ContextEngine(decayConfig);
```

### Working Memory

Track short-term context:

```typescript
const workingMemoryConfig = {
  ...DEFAULT_CONFIG,
  workingMemory: {
    enabled: true,
    maxTasks: 3,
    maxDecisions: 5,
    maxConstraints: 5
  }
};

const engineWithWorkingMemory = new ContextEngine(workingMemoryConfig);
```

## Configuration Options

### Engine Modes

Choose the appropriate recall engine:

- `graph`: Pure graph-based retrieval
- `vector`: Pure vector-based retrieval  
- `hybrid`: Combination of both approaches

### Storage Backends

Currently supports:

- `sqlite`: Lightweight local storage
- `lancedb`: Vector database (future support)

### Performance Tuning

Adjust these parameters based on your use case:

- `recallMaxNodes`: Limit retrieved nodes to improve performance
- `recallMaxDepth`: Limit graph traversal depth
- `dedupThreshold`: Adjust deduplication sensitivity
- `pagerankIterations`: Balance accuracy vs performance

## Best Practices

### Session Management

- Use unique session IDs for different users or conversations
- Regularly clean up old sessions to maintain performance
- Consider using agent or workspace IDs for multi-tenant scenarios

### Memory Optimization

- Monitor database size and run maintenance regularly
- Adjust decay parameters based on your domain requirements
- Use appropriate recall strategies for different query types

### Error Handling

```typescript
try {
  const result = await engine.process({
    messages: conversationMessages,
    sessionId: sessionId
  });
} catch (error) {
  console.error('Processing failed:', error);
  // Implement retry or fallback logic as appropriate
}
```

## Troubleshooting

### Common Issues

1. **Slow recall performance**: Reduce `recallMaxNodes` or optimize database indexes
2. **High memory usage**: Review decay settings and run maintenance tasks
3. **Poor recall quality**: Adjust embedding models or graph parameters
4. **LLM API errors**: Verify API keys and rate limits

### Maintenance Tasks

Regular maintenance helps keep the system performing well:

```typescript
// Run maintenance periodically
await engine.maintain();
```

This performs:
- Database compaction
- Decay calculations
- Community detection
- Index optimization