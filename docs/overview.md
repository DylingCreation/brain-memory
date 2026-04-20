# brain-memory Overview

## Introduction

brain-memory is a unified knowledge management system for AI agents that combines knowledge graphs and vector memory into a cohesive architecture. It merges concepts from graph-memory (knowledge graphs) and memory-lancedb-pro (vector memory) to create a comprehensive solution for contextual understanding and long-term memory retention.

## Core Concepts

### 8-Category Memory System

The system organizes memories into 8 distinct categories:

- **Profile**: User identity, role, background information
- **Preferences**: User likes/dislikes, habits, preferences
- **Entities**: Objective facts about projects, tools, environments
- **Events**: Errors, exceptions, incidents that occurred
- **Tasks**: Completed tasks, discussed topics
- **Skills**: Reusable operational skills with tools/commands/APIs
- **Cases**: Specific experience cases from scenarios
- **Patterns**: Cross-case abstract patterns and principles

### 3 Graph Node Types

- **TASK**: Specific tasks or discussion topics
- **SKILL**: Reusable operational skills with tools/commands/APIs
- **EVENT**: Error or exception occurrences

### 5 Relationship Types

- **USED_SKILL**: TASK → SKILL (task utilizes skill)
- **SOLVED_BY**: EVENT → SKILL or SKILL → SKILL (problem solved by solution)
- **REQUIRES**: SKILL → SKILL (dependency relationship)
- **PATCHES**: SKILL → SKILL (newer version supersedes older)
- **CONFLICTS_WITH**: SKILL ↔ SKILL (conflicting approaches)

## Architecture Components

### Store Layer
- SQLite database with FTS5 full-text search
- Vector storage for semantic similarity
- Community detection and summarization

### Extraction Engine
- Converts conversation messages to structured graph nodes
- Applies noise filtering to remove irrelevant content
- Classifies temporal characteristics (static vs dynamic)

### Recall Engine
- Dual-path retrieval: precise (vector/FTS5) and generalized (community-based)
- Personalized PageRank for relevance ranking
- Support for graph walking and neighborhood expansion

### Reflection System
- Session-level insights extraction
- Safety filtering to prevent prompt injection
- Insight categorization (user-model, agent-model, lessons, decisions)

### Working Memory
- Short-term context tracking
- Task and constraint management
- Attention focus tracking

### Knowledge Fusion
- Similar node detection and merging
- Relationship preservation during fusion
- Configurable similarity thresholds

### Reasoning Engine
- Path derivation (A→B→C indirect relationships)
- Implicit relation discovery (shared neighbors)
- Pattern generalization (commonalities across nodes)
- Contradiction detection

## Configuration Options

The system supports flexible configuration for different deployment scenarios:

- Engine mode: graph, vector, or hybrid
- Storage backend: sqlite or lancedb
- Decay parameters for intelligent forgetting
- Noise filtering thresholds
- Multi-scope isolation settings