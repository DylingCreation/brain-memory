# brain-memory Module Index

> Package: `memory-likehuman-pro` v1.6.0
> Description: Unified knowledge graph + vector memory system for AI agents

---

## Project Layout

| Directory / File | Purpose |
|------------------|---------|
| `index.ts` | Package entry point — re-exports all public APIs |
| `src/` | Core source code (16 functional domains) |
| `test/` | Unit tests, integration tests, performance benchmarks (~70 files) |
| `scripts/` | Ops scripts (install, health check, publish, JSDoc scan, etc.) |
| `docs/` | Documentation |
| `benchmark/` | Standalone benchmark suites |
| `test_data/` | Test fixtures and sample data |

---

## src/ Core Modules

### 1. Store Layer — Persistence & Data Access

| File | Purpose |
|------|---------|
| `src/store/db.ts` | Database initialization and connection management |
| `src/store/sqlite-adapter.ts` | SQLite adapter — graph node/edge CRUD |
| `src/store/lancedb-adapter.ts` | LanceDB adapter — vector storage and retrieval |
| `src/store/adapter.ts` | Unified adapter interface bridging SQLite + LanceDB |
| `src/store/store.ts` | High-level store API — unified ops for nodes, edges, communities, vector search |
| `src/store/migrate.ts` | Database migration scripts |

### 2. Memory Engine — Core Orchestration

| File | Purpose |
|------|---------|
| `src/engine/context.ts` | ContextEngine — memory context building and assembly |
| `src/engine/embed.ts` | Embedding encoding |
| `src/engine/llm.ts` | LLM call wrapper |

### 3. Recall System — Multi-Path Retrieval

| File | Purpose |
|------|---------|
| `src/recaller/recall.ts` | Recaller — multi-path recall master controller |
| `src/recaller/cache.ts` | Recall cache layer |
| `src/retriever/vector-recall.ts` | Vector recall |
| `src/retriever/hybrid-recall.ts` | Hybrid recall — multi-path result fusion |
| `src/retriever/reranker.ts` | Reranker — score-based reordering |
| `src/retriever/intent-analyzer.ts` | User intent analysis |
| `src/retriever/query-expander.ts` | Query expansion |
| `src/retriever/admission-control.ts` | Admission control — filter low-value queries |

### 4. Graph Algorithms — Knowledge Graph Computation

| File | Purpose |
|------|---------|
| `src/graph/pagerank.ts` | PageRank — global + personalized |
| `src/graph/community.ts` | Community detection — node clustering |
| `src/graph/dedup.ts` | Graph deduplication |
| `src/graph/maintenance.ts` | Graph maintenance — periodic cleanup / rebuild |

### 5. Decay Engine — Memory Forgetting

| File | Purpose |
|------|---------|
| `src/decay/engine.ts` | Decay engine — core calculation |
| `src/decay/presets.ts` | Preset decay strategies (different rates per memory type) |

### 6. Extractor — Structured Information Extraction

| File | Purpose |
|------|---------|
| `src/extractor/extract.ts` | Extractor — main text-to-structure extractor |
| `src/extractor/heuristic.ts` | Heuristic extractor — fast path without LLM |

### 7. Reasoning Engine — Intent Understanding & Planning

| File | Purpose |
|------|---------|
| `src/reasoning/engine.ts` | Reasoning engine core |
| `src/reasoning/prompts.ts` | Reasoning prompt templates |

### 8. Reflection System — Session-Level Self-Summary

| File | Purpose |
|------|---------|
| `src/reflection/extractor.ts` | Reflection content extraction |
| `src/reflection/prompts.ts` | Reflection prompt templates |
| `src/reflection/store.ts` | Reflection result persistence |

### 9. Working Memory — Short-Term Context Management

| File | Purpose |
|------|---------|
| `src/working-memory/manager.ts` | Working memory manager — create / update / build short-term context |

### 10. Fusion — Graph + Vector Result Merging

| File | Purpose |
|------|---------|
| `src/fusion/analyzer.ts` | Fusion decision maker — how to merge graph and vector recall results |
| `src/fusion/prompts.ts` | Fusion prompt templates |

### 11. Noise Filter — Low-Quality Input Interception

| File | Purpose |
|------|---------|
| `src/noise/filter.ts` | Noise detection and filtering |

### 12. Temporal Classifier — Memory Timeliness Annotation

| File | Purpose |
|------|---------|
| `src/temporal/classifier.ts` | Temporal classifier — determine memory time attributes |

### 13. Scope Isolation — Multi-User / Multi-Agent Data Partitioning

| File | Purpose |
|------|---------|
| `src/scope/isolation.ts` | Scope isolation — filter / partition data by scope |

### 14. Session Compressor — Long Context Compression

| File | Purpose |
|------|---------|
| `src/session/compressor.ts` | Session text compressor |

### 15. Preferences — User Preference Slots

| File | Purpose |
|------|---------|
| `src/preferences/slots.ts` | Preference slots — store and retrieve user preferences |

### 16. Prompt Templates

| File | Purpose |
|------|---------|
| `src/prompts/small.ts` | Lightweight mode prompts |

### 17. Format Assembly — Context Output

| File | Purpose |
|------|---------|
| `src/format/assemble.ts` | Context assembly — combine results from all modules into final output |

### 18. Utilities

| File | Purpose |
|------|---------|
| `src/types.ts` | Global type definitions |
| `src/utils/json.ts` | JSON parsing / extraction |
| `src/utils/xml.ts` | XML escaping |
| `src/utils/similarity.ts` | Similarity computation (cosine, etc.) |
| `src/utils/text.ts` | Text utilities (tokenization, Jaccard) |
| `src/utils/tokens.ts` | Token estimation |
| `src/utils/truncate.ts` | Text truncation |
| `src/utils/logger.ts` | Structured logging |

---

## Root-Level Key Files

| File / Directory | Purpose |
|------------------|---------|
| `index.ts` | Package entry point, re-exports all public APIs |
| `openclaw-register.ts` | OpenClaw plugin registration point (lifecycle hooks) |
| `openclaw-plugin.ts` | OpenClaw plugin implementation |
| `package.json` | Package metadata, dependencies, scripts |
| `CHANGELOG.md` | Version change log |
| `README.md / README_CN.md` | English / Chinese documentation |
| `SETUP.md` | Installation & configuration guide |
| `CONTRIBUTING.md` | Contributor guidelines |
| `CODE_OF_CONDUCT.md` | Community behavior standards |
| `METHODOLOGY.md` | Methodology document |
| `scripts/` | Ops scripts (install, health check, JSDoc scan, publish, etc.) |
| `test/` | All tests (~70 test files) |
| `.github/` | GitHub Actions CI configuration |

---

## Data Flow Overview

```
Input Text
  │
  ├─► noise/filter.ts        ← Noise filter (reject garbage)
  │
  ├─► extractor/             ← Extract structured info (nodes, edges)
  │    ├─ extract.ts          ← LLM-based extraction
  │    └─ heuristic.ts        ← Fast heuristic extraction
  │
  ├─► store/                 ← Persist to SQLite + LanceDB
  │    ├─ sqlite-adapter.ts   ← Graph storage
  │    └─ lancedb-adapter.ts ← Vector storage
  │
  └─► graph/                 ← Background maintenance
       ├─ pagerank.ts         ← Update PageRank scores
       ├─ community.ts        ← Detect communities
       ├─ dedup.ts            ← Merge duplicate nodes
       └─ maintenance.ts      ← Periodic cleanup
```

```
Query → intent-analyzer → query-expander → admission-control
                                          │
                    ┌─────────────────────┼──────────────────────┐
                    ▼                     ▼                      ▼
              vector-recall.ts       graph (store)          hybrid-recall.ts
                    │                     │                      │
                    └─────────────────────┼──────────────────────┘
                                          ▼
                                    reranker.ts
                                          ▼
                              format/assemble.ts → Final Context
```
