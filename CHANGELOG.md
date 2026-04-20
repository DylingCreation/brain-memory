# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial implementation of brain-memory system
- 8-category unified memory system (profile, preferences, entities, events, tasks, skills, cases, patterns)
- 3 graph node types (TASK, SKILL, EVENT) with 5 relationship types
- Dual-path recall engine (graph + vector)
- Intelligent decay system with Weibull model
- Reflection system with safety filtering
- Multi-scope isolation (session/agent/workspace)
- Knowledge fusion for duplicate detection
- Reasoning engine for inference
- Noise filtering for irrelevant content
- Working memory management
- Community detection and summarization
- Personalized PageRank for relevance ranking

### Changed
- Merged graph-memory and memory-lancedb-pro concepts
- Unified configuration system for all components
- Standardized API across all modules

### Fixed
- Various stability and performance improvements
- Proper error handling and validation

### Security
- Implemented safety filtering for reflection system
- Input sanitization for all user-provided content