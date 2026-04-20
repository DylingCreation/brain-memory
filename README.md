# brain-memory

Unified knowledge graph + vector memory system for AI agents. Merges graph-memory (knowledge graphs) with memory-lancedb-pro (vector memory) into an 8-category system with intelligent decay and reflection.

## Features

- **8-Category Memory System**: profile, preferences, entities, events, tasks, skills, cases, patterns
- **3 Graph Node Types**: TASK, SKILL, EVENT with 5 relationship types
- **Dual-Path Recall**: Graph + Vector retrieval with personalized PageRank
- **Intelligent Decay**: Weibull model-based forgetting with configurable tiers
- **Reflection System**: Session-level insights with safety filtering
- **Multi-Scope Isolation**: Per-session/agent/workspace memory isolation
- **Noise Filtering**: Automatic filtering of irrelevant content
- **Knowledge Fusion**: Duplicate detection and merging
- **Reasoning Engine**: Path derivation, implicit relations, pattern generalization

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Extractor     │───▶│   Recaller       │───▶│   Assembler     │
│                 │    │                  │    │                 │
│ • Converts      │    │ • Retrieves      │    │ • Combines      │
│   messages to   │    │   relevant       │    │   knowledge     │
│   graph nodes   │    │   knowledge      │    │   for context   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Installation

```bash
npm install
```

## Configuration

### Environment Variables

Create `.env` file with your settings:

```env
# LLM Configuration
LLM_BASE_URL=your_llm_base_url
LLM_API_KEY=your_api_key
LLM_MODEL=your_model_name

# Embedding Configuration
EMBEDDING_MODEL=your_embedding_model
EMBEDDING_BASE_URL=your_embedding_base_url
```

### JavaScript Configuration

For programmatic configuration, create `config.js` based on the template:

```bash
cp config.template.js config.js
```

Then edit `config.js` to add your actual credentials.

## Usage

```typescript
import { ContextEngine } from './src/engine/context.ts';
import { DEFAULT_CONFIG } from './src/types.ts';

const engine = new ContextEngine(DEFAULT_CONFIG);

// Process a conversation turn
const result = await engine.process({
  messages: [
    { role: 'user', content: 'How do I deploy a Flask app?' },
    { role: 'assistant', content: 'You can use Docker for deployment.' }
  ],
  sessionId: 'session-1'
});

// Retrieve relevant knowledge
const recall = await engine.recall('docker deployment');
```

## Testing

```bash
# Run unit tests
npm test

# Run specific test suites
npm run test:integration
npm run test:performance
```

## Directory Structure

```
src/                 # Source code
├── store/          # Database operations
├── extractor/      # Knowledge extraction
├── recaller/       # Knowledge retrieval
├── reasoning/      # Inference engine
├── reflection/     # Reflection system
├── fusion/         # Knowledge fusion
├── decay/          # Decay algorithms
├── scope/          # Multi-tenant isolation
├── temporal/       # Time-based processing
├── noise/          # Noise filtering
├── working-memory/ # Working memory management
├── format/         # Context formatting
├── engine/         # Core engine components
└── utils/          # Utility functions

tests/              # Test files
├── unit/           # Unit tests
├── integration/    # Integration tests
├── performance/    # Performance tests
└── data/           # Test data

docs/               # Documentation
scripts/            # Build/deploy scripts
```

## API Reference

### ContextEngine
Main interface for the memory system.

#### Methods:
- `process(params)`: Process conversation messages and update memory
- `recall(query)`: Retrieve relevant knowledge
- `maintain()`: Run maintenance tasks (compaction, decay, etc.)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

MIT