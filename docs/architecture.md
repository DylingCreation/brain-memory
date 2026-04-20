# brain-memory Architecture

## Overview

brain-memory is a unified knowledge graph and vector memory system designed for AI agents. It combines graph-based knowledge representation with vector-based semantic search to provide a comprehensive memory solution.

## Core Concepts

### Memory Categories
The system implements an 8-category memory system:
1. **Profile**: User profiles and characteristics
2. **Preferences**: User preferences and settings
3. **Entities**: Named entities (people, places, organizations)
4. **Events**: Temporal events and activities
5. **Tasks**: Goals, objectives, and work items
6. **Skills**: Capabilities and competencies
7. **Cases**: Specific examples and precedents
8. **Patterns**: Reusable templates and strategies

### Dual-Path Architecture
The system uses two complementary recall paths:
- **Graph Path**: Semantic relationships and community structures
- **Vector Path**: Semantic similarity and content matching

## System Architecture

### Layers

```
┌─────────────────────────────────────────┐
│              API Layer                  │
│        ContextEngine (Facade)           │
├─────────────────────────────────────────┤
│            Control Layer                │
│ Extractor │ Recaller │ Fusion │ Refl.  │
├─────────────────────────────────────────┤
│           Algorithm Layer               │
│ PageRank │ Community │ Similarity       │
├─────────────────────────────────────────┤
│           Storage Layer                 │
│     SQLite (Graph + Vector + FTS5)      │
└─────────────────────────────────────────┘
```

### Key Components

#### ContextEngine
The main orchestrator that integrates all components:
- Unified API for all memory operations
- Component coordination and workflow management
- State management and working memory

#### Extractor
Responsible for knowledge extraction from conversations:
- LLM-based triple extraction
- Category classification
- Temporal classification
- Noise filtering

#### Recaller
Handles knowledge retrieval:
- Dual-path recall (graph + vector)
- Result fusion and ranking
- Scope filtering

#### Fusion Engine
Manages knowledge consolidation:
- Duplicate detection
- Relationship inference
- Knowledge merging

#### Reflection System
Derives insights from experience:
- Turn-level reflection
- Session-level reflection
- Pattern identification

### Data Flow

1. **Input Processing**: Conversations → Noise Filter → LLM Extraction
2. **Knowledge Creation**: Triples → Validation → Storage
3. **Indexing**: Nodes/Edges → Graph Structure → Vector Index → Community Detection
4. **Retrieval**: Query → Dual-Path Search → Result Fusion → Ranking
5. **Output**: Ranked Results → Working Memory → Context Injection

## Storage Architecture

### Database Schema
The system uses SQLite with the following key tables:

- `bm_nodes`: Knowledge nodes with type, category, content, and metadata
- `bm_edges`: Relationships between nodes
- `bm_vectors`: Vector embeddings for semantic search
- `bm_communities`: Community detection results
- `bm_messages`: Conversation history for context

### Indexing Strategy
- Primary indexes on node IDs and types
- FTS5 full-text search on node content
- Vector indexes for similarity search
- Community-based indexing for graph traversal

## Performance Considerations

### Optimizations Implemented
1. **Vector Search Optimization**: Load only relevant vectors based on scope filters
2. **Batched Operations**: Reduce database round trips
3. **Caching**: Frequently accessed data caching
4. **Algorithm Efficiency**: Optimized graph algorithms

### Scalability Patterns
- Modular architecture enables component scaling
- Database sharding support via scope isolation
- Caching layer for hot data

## Security Architecture

### Data Isolation
- Scope-based access controls (session/agent/workspace)
- Parameterized queries to prevent injection
- Input validation and sanitization

### Privacy Protection
- Sensitive data filtering
- Access logging and monitoring
- Data retention policies

## Integration Points

### LLM Integration
- Pluggable LLM providers (OpenAI, Anthropic, etc.)
- Structured output parsing
- Error handling and fallbacks

### Embedding Integration
- Vector database abstraction
- Multiple provider support
- Dimension flexibility

## Error Handling Strategy

The system implements comprehensive error handling:
- Graceful degradation when LLM unavailable
- Database transaction safety
- Component isolation
- Recovery mechanisms

## Future Extensibility

### Planned Enhancements
- Distributed deployment support
- Real-time synchronization
- Advanced analytics dashboard
- Plugin architecture

### Extension Points
- Custom extraction patterns
- Alternative recall strategies
- Additional storage backends
- Extended metadata schemas