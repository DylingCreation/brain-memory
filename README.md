<p align="center">
  <h1 align="center">🧠 brain-memory</h1>
  <p align="center"><strong>Give AI Agents a Human-Like Memory — Remember, Forget, Reflect, Reason</strong></p>
</p>

<p align="center">
  <a href="#-in-one-sentence">Concept</a> •
  <a href="#-four-capacities">Capacities</a> •
  <a href="#-three-pipelines">Pipelines</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-api">API</a> •
  <a href="#-design-philosophy">Philosophy</a>
</p>

---

## 💬 In One Sentence

Brain-Memory is a TypeScript memory engine that gives AI Agents long-term memory — remembering your preferences, learned skills, past mistakes, and decisions made, so every conversation doesn't start from scratch.

---

## 🧠 Four Capacities

```
       👤 Human Memory                    🤖 Brain-Memory
  ┌─────────────────┐         ┌──────────────────────┐
  │ Remember         │   ←→    │ 8-Category Auto-Class │
  │ Forget           │   ←→    │ Weibull Decay Model   │
  │ Reflect          │   ←→    │ Dual-Level Reflection │
  │ Reason           │   ←→    │ Graph Reasoning Engine│
  └─────────────────┘         └──────────────────────┘
```

### Remember — 8 Categories, Auto-Extracted

No manual curation. Knowledge is extracted from conversations automatically:

| Category | What It Remembers | Example |
|----------|------------------|---------|
| 👤 Profile | Identity, role, background | "User is a Python backend developer" |
| 🎯 Preferences | Likes and dislikes | "Prefers pnpm over npm" |
| 📦 Entities | Objective facts about projects/tools | "Project deployed on AWS ECS" |
| ⚡ Events | Problems and anomalies | "Last Docker build failed due to OOM" |
| ✅ Tasks | Completed work and discussions | "Finished API rate-limit module last week" |
| 🔧 Skills | Reusable how-to knowledge | "Use docker-compose up -d to start" |
| 📋 Cases | Success/failure case studies | "Redis cache layer solved the query bottleneck" |
| 🔮 Patterns | Cross-case abstractions | "Running integration tests pre-deploy prevents 80% of issues" |

### Forget — Weibull Decay, Three Tiers

Not simple time-based expiration — a survival function modeling real forgetting:

```
Core (importance > 0.7)     → Nearly permanent (e.g. "user's programming language")
Working (importance > 0.4)  → Fades with disuse (e.g. "a script used 3 months ago")
Peripheral (importance ≤ 0.4) → Auto-cleans (e.g. "irrelevant chat snippet")
```

Dynamic information decays **3× faster** than static knowledge.

### Reflect — Post-Session Insights

After each session, the system derives insights automatically:

- "User demands high TypeScript type safety" → updates user model
- "Recommended Docker approach incompatible with NVIDIA" → records agent lesson
- "GPU deployments require nvidia-docker driver check" → distills pattern

Reflections are stored as knowledge nodes, participating in future search and reasoning.

### Reason — From Known to Unknown

| Type | Behavior | Example |
|------|----------|---------|
| Path | Indirect links A→B→C | Docker → GPU → nvidia-docker |
| Implicit | Shared neighbors suggest hidden connections | A and B both use Redis → shared data layer? |
| Pattern | Multiple failures reveal systemic issues | 3 consecutive deploy timeouts → process flaw |
| Contradiction | Conflicting information detected | Node A says MySQL, Node B says PostgreSQL |

---

## ⚙️ Three Pipelines

### Learn (processTurn)

```
User message → noise filter → three-tier extraction:
  Tier 1: Rule engine (code/commands/regex) ← zero LLM, <10ms
  Tier 2: LLM deep understanding            ← with LLM configured
  Tier 3: Tolerant JSON repair              ← auto-fix malformed LLM output
→ generate embeddings → store in SQLite → update graph edges → update working memory
```

Degrades gracefully without LLM — Tier 1 still extracts coarse knowledge.

### Recall

```
Query → relevance check → intent analysis → query expansion
→ four-path parallel search:
  ① Keyword + vector → community expansion
  ② Community semantic match → member recall
  ③ LanceDB semantic search (required companion index)
  ④ External long-term memory
→ PageRank → multi-path boost (×1.2) → time decay → Top-N
```

### Maintain

```
Periodic → dedup → PageRank → community detection → summaries → decay archiving
```

Incremental mode activates when <10% nodes change — **5×+ speedup**.

---

## 📦 Install

```bash
npm install memory-likehuman-pro     # npm package

# or full source
git clone https://github.com/DylingCreation/brain-memory.git
cd brain-memory && npm install
```

---

## 🚀 Quick Start

### Option 1: OpenClaw Plugin

#### Step 1: Install

```bash
npm install -g memory-likehuman-pro
```

> Global install. OpenClaw Gateway auto-discovers and loads the plugin.
>
> Once registered on ClawHub, use: `openclaw plugins install clawhub:brain-memory`

#### Step 2: Enable in openclaw.json

Edit `~/.openclaw/openclaw.json` and add to `plugins.entries`:

```json
{
  "plugins": {
    "entries": {
      "brain-memory": {
        "enabled": true,
        "config": {
          "mode": "full",
          "llm": { "apiKey": "***", "baseURL": "https://api.openai.com/v1", "model": "gpt-4o-mini" },
          "embedding": { "apiKey": "***", "model": "text-embedding-3-small" }
        }
      }
    }
  }
}
```

> Most config keys go inside `config` — equivalent to `BmConfig`. See [Configuration Reference](#configuration-reference) below for full details.

#### Step 3: Restart Gateway

```bash
openclaw gateway restart
```

#### Plugin Registration Details

brain-memory follows the standard OpenClaw plugin protocol with two required metadata files and entry-point registration:

| File | Purpose |
|------|---------|
| `package.json` | Contains `openclaw.extensions` pointing to `openclaw-register.ts` |
| `openclaw.plugin.json` | Plugin manifest declaring `id`, `contracts.hooks` (5 hooks), `activation.onStartup: true`, and `configSchema` (204-line JSON Schema) |

```typescript
// openclaw-register.ts
import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';

export default definePluginEntry({
  id: 'brain-memory',
  name: 'Brain Memory',
  version: '2.1.2',
  description: 'Unified knowledge graph + vector memory system for AI agents',
  register(api) {
    api.on('message_received',  handleMessage);      // Extract knowledge from user messages
    api.on('message_sent',     handleMessage);      // Extract AI suggestions/code/commitments
    api.on('message_sending',  beforeMessageSend);   // Inject relevant memories into context
    api.on('session_start',    onSessionStart);     // Warm up memory cache
    api.on('session_end',      onSessionEnd);       // Session reflection + graph maintenance
  },
});
```

**Lifecycle hooks**:

| Hook | Trigger | Behavior |
|------|---------|----------|
| `message_received` | User message received | Extract knowledge nodes + edges → store in SQLite |
| `message_sent` | AI reply sent | Extract AI suggestions/code/commitments |
| `message_sending` | Before AI reply delivered | Recall relevant memories → inject into context |
| `session_start` | New session | Warm up memory cache |
| `session_end` | Session ends | Session reflection + graph maintenance (PageRank/Community/Decay) |

### Option 2: Standalone Library

```typescript
import { ContextEngine, DEFAULT_CONFIG } from 'memory-likehuman-pro';

const engine = new ContextEngine({
  ...DEFAULT_CONFIG,
  dbPath: '~/.openclaw/brain-memory.db',
  mode: 'full',
  llm: { apiKey: '***', baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  embedding: { apiKey: '***', model: 'text-embedding-3-small' },
});

// 📝 Extract knowledge
const result = await engine.processTurn({
  sessionId: 'demo', agentId: 'assistant', workspaceId: 'my-project',
  messages: [{ role: 'user', content: 'I need to deploy a Python Flask app to Docker' }],
});
console.log(`Extracted ${result.extractedNodes.length} nodes`);

// 🔍 Recall memories
const recall = await engine.recall('Docker deployment');
console.log(recall.nodes.map(n => n.name));
```

### Option 3: Minimal Config (Zero LLM)

```json
{ "dbPath": "brain-memory.db", "storage": "sqlite", "mode": "lite" }
```

No LLM, no Embedding required — rule-engine extraction + text search. SQLite + LanceDB are required dependencies.

---

## 📖 Usage Guide

### OpenClaw Plugin Hooks

The plugin auto-registers 5 lifecycle hooks:

| Hook | Trigger | Purpose |
|------|---------|---------|
| `message_received` | After user message | Extract knowledge nodes & edges |
| `message_sent` | After AI reply | Extract AI suggestions/code/commitments |
| `before_message_write` | Before AI reply sent | Inject relevant memories into context |
| `session_start` | New session | Warm up memory cache |
| `session_end` | Session end | Run session reflection + graph maintenance |

### CLI Diagnostics

```bash
npm run doctor            # Check environment, deps, config, database health
node scripts/check-health.cjs  # Engineering health: lint + tsc + test
```

### Build & Test

```bash
npm run build             # tsc compile
npm test                  # Full test suite (847 tests, 70 files)
npm run lint              # ESLint check
npm run docs              # Generate typedoc API docs
```

### Configuration Reference

<details>
<summary>📋 Full Config Options (click to expand)</summary>

#### Core

| Field | Default | Purpose |
|-------|---------|---------|
| `mode` | `full` | Run mode. `full`=all features / `lite`=skip LLM reflection/fusion/reasoning / `small`=short prompts for local small models |
| `engine` | `graph` | Recall engine. `graph`=knowledge graph+PPR / `vector`=pure vector+BM25 / `hybrid`=both fused |
| `storage` | `sqlite` | Storage backend. Currently only SQLite (sole IStorageAdapter implementation) |
| `dbPath` | `~/.openclaw/brain-memory.db` | Database file path. Supports `~` expansion and `:memory:` |

#### Recall

| Field | Default | Purpose |
|-------|---------|---------|
| `recallMaxNodes` | 6 | Max nodes returned per recall |
| `recallMaxDepth` | 2 | Max graph traversal hops. Higher = broader but slower |
| `recallStrategy` | `full` | Memory injection format. `full`=complete / `summary`=name+desc only / `adaptive`=full if ≤6 nodes, else summary / `off`=disabled |
| `recallCacheSize` | 100 | LRU cache capacity (0=disabled) |
| `recallCacheTtlMs` | 300000 | Cache TTL in ms (default 5 min) |

#### Graph Algorithms

| Field | Default | Purpose |
|-------|---------|---------|
| `dedupThreshold` | 0.90 | Similarity threshold for deduplication (0~1). Higher = more conservative |
| `pagerankDamping` | 0.85 | PageRank damping factor |
| `pagerankIterations` | 20 | PageRank iteration count |
| `compactTurnCount` | 6 | Trigger compression maintenance every N turns |

#### Decay

| Field | Default | Purpose |
|-------|---------|---------|
| `decay.enabled` | `true` | Enable memory decay |
| `decay.recencyHalfLifeDays` | 30 | Recency half-life in days |
| `decay.timeDecayHalfLifeDays` | 60 | Time decay half-life. Dynamic memories ×1/3 faster |
| `decay.recencyWeight` | 0.4 | Weight of recency in composite score (0~1) |
| `decay.frequencyWeight` | 0.3 | Weight of access frequency |
| `decay.intrinsicWeight` | 0.3 | Weight of intrinsic importance |
| `decay.betaCore` | 0.8 | Decay curve steepness for core (>0.7). Lower = flatter |
| `decay.betaWorking` | 1.0 | Decay curve steepness for working (0.4~0.7) |
| `decay.betaPeripheral` | 1.3 | Decay curve steepness for peripheral (≤0.4). Higher = faster |
| `decay.coreDecayFloor` | 0.9 | Minimum retention for core memories |
| `decay.workingDecayFloor` | 0.7 | Minimum retention for working memories |
| `decay.peripheralDecayFloor` | 0.5 | Minimum retention for peripheral memories |

#### Reflection

| Field | Default | Purpose |
|-------|---------|---------|
| `reflection.enabled` | `true` | Enable reflection system |
| `reflection.turnReflection` | `false` | Enable per-turn lightweight reflection. `false`=session-level only |
| `reflection.sessionReflection` | `true` | Enable session-end full LLM analysis |
| `reflection.safetyFilter` | `true` | Filter prompt injection from reflection content |
| `reflection.maxInsights` | 8 | Max insights per reflection |
| `reflection.importanceBoost` | 0.15 | Importance boost for confirmed insights |
| `reflection.minConfidence` | 0.6 | Minimum confidence threshold (0~1) |

#### Working Memory

| Field | Default | Purpose |
|-------|---------|---------|
| `workingMemory.enabled` | `true` | Enable working memory tracking |
| `workingMemory.maxTasks` | 3 | Max tracked current tasks |
| `workingMemory.maxDecisions` | 5 | Max recent decisions retained |
| `workingMemory.maxConstraints` | 5 | Max constraints/preferences retained |

#### Fusion

| Field | Default | Purpose |
|-------|---------|---------|
| `fusion.enabled` | `true` | Enable knowledge fusion (auto-merge duplicates) |
| `fusion.similarityThreshold` | 0.75 | Minimum similarity for fusion candidates. Higher = more conservative |
| `fusion.minNodes` | 20 | Minimum node count to trigger fusion |
| `fusion.minCommunities` | 3 | Minimum community count to trigger fusion |
| `fusion.autoMergeThreshold` | 0.9 | Auto-merge threshold when LLM unavailable |

#### Reasoning

| Field | Default | Purpose |
|-------|---------|---------|
| `reasoning.enabled` | `true` | Enable reasoning engine |
| `reasoning.maxHops` | 2 | Max inference hops. A→B→C = 2 hops |
| `reasoning.maxConclusions` | 3 | Max conclusions per reasoning pass |
| `reasoning.minRecallNodes` | 3 | Minimum recall nodes to trigger reasoning |

#### Noise Filter

| Field | Default | Purpose |
|-------|---------|---------|
| `noiseFilter.enabled` | `true` | Filter greetings, emojis, short noise |
| `noiseFilter.minContentLength` | 10 | Minimum meaningful message length in chars |

#### Memory Injection

| Field | Default | Purpose |
|-------|---------|---------|
| `memoryInjection.enabled` | `true` | Inject recalled memories into LLM context |
| `memoryInjection.strategy` | `adaptive` | Injection strategy: `full`/`summary`/`adaptive`/`off` |
| `memoryInjection.tokenBudget` | 6000 | Token budget cap for injected memories |
| `memoryInjection.maxNodes` | 12 | Max nodes per injection (even if budget allows more) |
| `memoryInjection.includeEpisodic` | `true` | Include original conversation traces |

#### Multi-Agent Sharing

| Field | Default | Purpose |
|-------|---------|---------|
| `memorySharing.enabled` | `true` | Enable cross-agent memory sharing |
| `memorySharing.mode` | `mixed` | Sharing mode: `isolated`/`mixed`/`shared` |
| `memorySharing.sharedCategories` | `["profile","preferences"]` | Categories shared in mixed mode |
| `memorySharing.allowedAgents` | `[]` | Allowed agent list (empty=all) |

</details>

### Database

6 SQLite tables + FTS5 full-text index:

| Table | Purpose |
|-------|---------|
| `bm_nodes` | Knowledge nodes (8 categories, 6-layer scope, PageRank, importance) |
| `bm_edges` | Graph edges (11 types, directional constraints) |
| `bm_vectors` | Embedding vectors (BLOB storage) |
| `bm_messages` | Raw messages (3-state: unextracted/extracted/archived) |
| `bm_communities` | Community summaries (LLM-generated + embeddings) |
| `bm_nodes_fts` | FTS5 full-text index (auto-synced via triggers) |

### Security

| Measure | Detail |
|---------|--------|
| Parameterized SQL | All queries use `?` placeholders — injection-proof |
| Scope Isolation | 6-layer parameterized queries + cross-scope sharing policy |
| Prompt Injection Guard | Reflection content filtered through 6 unsafe pattern regexes |
| API Auth | UI Server supports Bearer Token / Query Token |

---

## 🧩 Core API

```typescript
class ContextEngine {
  processTurn(params): Promise<ProcessTurnResult>    // Process conversation → extract knowledge
  recall(query, scope?): Promise<RecallResult>       // Recall relevant memories
  runMaintenance(): Promise<void>                     // Graph maintenance
  performFusion(sessionId?): Promise<FusionResult>    // Knowledge fusion
  reflectOnSession(id, msgs): Promise<Insight[]>      // Session reflection
  performReasoning(query?): Promise<Conclusion[]>     // Graph reasoning
  getStats(): EngineStats                             // 15+ dimension stats
  healthCheck(): HealthStatus                         // Health check
  export(options?): MemoryExport                      // JSON export
  import(data): { imported, skipped }                 // JSON import
  close(): void                                       // Close database
}
```

---

## 🏗️ Tech Stack

| Component | Choice |
|-----------|--------|
| Language | TypeScript 5.9 (strict) |
| Primary Storage | SQLite — sole source of truth (IStorageAdapter) |
| Semantic Index | LanceDB — required companion index (ISearchIndex), rebuildable from SQLite |
| LLM | OpenAI / DashScope / Ollama / Anthropic — auto-routed |
| Embedding | OpenAI-compatible / Ollama |
| Testing | Vitest 3.2 — **847 tests** (70/72 files), test code > source code |

---

## 🎯 Design Philosophy

| Principle | Implementation |
|-----------|---------------|
| Human-Like Memory | Weibull decay + reflection + reasoning |
| Progressive Enhancement | Three-tier extraction + graceful degradation |
| Structured Knowledge | 8 node types + 11 edge types + LPA communities |
| Scope Isolation | Six-layer scope (platform/workspace/agent/user/chat/thread) |
| Self-Maintaining | Auto dedup + fusion + decay archiving |
| Observable | 847 tests + structured logging + Web control panel |

---

## 📄 License

[MIT](LICENSE) · Made with ❤️ for AI Agents
