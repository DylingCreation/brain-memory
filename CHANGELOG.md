# Changelog

All notable changes to the brain-memory project.

## [Unreleased] - YYYY-MM-DD

### Added
- Performance benchmarking suite for vector search optimization
- Comprehensive test coverage for core modules
- New documentation files (architecture, deployment, security, user guide, API reference)
- Enhanced error handling throughout the system
- Scope-based isolation for multi-tenant support
- Working memory management system
- Reflection and reasoning capabilities
- Knowledge fusion and deduplication
- Community detection and PageRank algorithms

### Changed
- **MAJOR PERFORMANCE IMPROVEMENT**: Optimized vectorSearchWithScore function to reduce database load by filtering nodes before loading vectors, resulting in significant performance gains
- Improved TypeScript type safety across all modules
- Enhanced database query efficiency with proper parameterization
- Refined knowledge extraction and recall algorithms
- Updated configuration system with better defaults
- Improved memory decay and forgetting mechanisms

### Fixed
- Fixed TypeScript compilation errors throughout the codebase
- Resolved critical syntax errors in ContextEngine class
- Fixed vector search performance issues with large datasets
- Corrected database connection handling and resource management
- Fixed import statement issues causing build failures
- Resolved test configuration and dependency issues
- Fixed error handling in LLM and embedding integrations
- Corrected PageRank implementation to properly handle config parameters
- Fixed duplicate function declarations in multiple files
- Resolved undefined variable issues in several modules

### Security
- Implemented proper SQL injection prevention with parameterized queries
- Added input validation and sanitization
- Enhanced scope-based data isolation
- Improved credential handling and storage

## [1.0.0] - 2026-04-21

### Added
- Initial release of brain-memory unified knowledge system
- Graph-based memory with 8-category classification
- Vector-based semantic search capabilities
- Dual-path recall (graph + vector)
- Memory decay and forgetting mechanisms
- Working memory and context management
- Knowledge extraction from conversations
- Reflection and reasoning capabilities
- Community detection and PageRank algorithms

### Features
- **8-Category Memory System**: Profile, Preferences, Entities, Events, Tasks, Skills, Cases, Patterns
- **Dual-Path Recall**: Combines graph traversal and vector similarity
- **Memory Decay**: Weibull model for intelligent forgetting
- **Scope Isolation**: Session/agent/workspace level data separation
- **Knowledge Fusion**: Automatic duplicate detection and merging
- **Reflection System**: Insight derivation from conversation history
- **Working Memory**: Short-term context management
- **Community Detection**: Label Propagation Algorithm for clustering
- **Personalized PageRank**: Context-aware node ranking