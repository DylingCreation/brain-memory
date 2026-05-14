<p align="center">
  <h1 align="center">🧠 brain-memory</h1>
  <p align="center">为 AI Agent 打造的大脑级记忆系统</p>
  <p align="center"><em>让 Agent 像人一样记住 · 遗忘 · 反思 · 推理</em></p>
</p>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-installation">Installation</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-memory-categories">Memory Categories</a> •
  <a href="#-recall-strategies">Recall Strategies</a> •
  <a href="#-api">API</a> •
  <a href="#-license">License</a>
</p>

<p align="center">
  <strong>Unified knowledge graph + vector memory system for AI agents.</strong><br>
  Merges graph-memory with memory-lancedb-pro into an 8-category system with intelligent decay and reflection.
</p>

---

## 🧠 Core Philosophy

brain-memory simulates human brain memory mechanisms:

| 🧬 Human Mechanism | ⚡ Code Implementation |
|:---:|:---|
| **Short-term → Long-term** | Working Memory → Knowledge Graph persistence |
| **Forgetting Curve** | Weibull decay model (3-tier + dynamic acceleration) |
| **Knowledge Association** | Personalized PageRank + Community detection |
| **Reflection** | Turn reflection (lightweight) + Session reflection (deep) |
| **Inductive Reasoning** | 4-type reasoning engine (path / implicit / pattern / contradiction) |

---

## ✨ Features

<details>
<summary><b>📦 Memory System</b> — 8 categories · Bidirectional extraction · Graph structure · Time decay</summary>

- **8-Category Memory** — `profile` / `preferences` / `entities` / `events` / `tasks` / `skills` / `cases` / `patterns`
- **Bidirectional Knowledge Extraction** — Extracts both user messages and AI replies (suggestions, code, tool recommendations)
- **Graph Nodes + Edges** — 3 node types (TASK / SKILL / EVENT) × 11 edge types with strict direction constraints
- **Time Decay** — Weibull model with static/dynamic differentiated decay

</details>

<details>
<summary><b>🔍 Recall Engine</b> — Dual-path · Hybrid fusion · Intent analysis · Query expansion · Reranking</summary>

- **Dual-Path Recall** — Precise path (vector → community expansion → graph walk → PPR) + Generalized path (community match → graph walk → PPR)
- **Hybrid Recall** — Graph + vector recall in parallel, Min-Max normalization + RRF fusion
- **Vector-Only Mode** — Vector search + BM25 full-text + RRF fusion, no graph dependency
- **Intent Analysis** — 5 intent types (technical / preference / factual / task / general)
- **Query Expansion** — 14 bilingual synonym mappings (Chinese/English)
- **Cross-Encoder Reranking** — Supports Jina / SiliconFlow / Voyage / DashScope / TEI / Pinecone

</details>

<details>
<summary><b>🕸️ Knowledge Graph</b> — Community detection · PageRank · Fusion · Graph walk</summary>

- **Community Detection** — Label Propagation Algorithm (LPA), LLM-generated community summaries
- **Personalized PageRank** — Query-dependent ranking based on seed nodes
- **Knowledge Fusion** — Two-phase dedup (name overlap + vector similarity), LLM decides merge/link/none
- **Graph Walk** — Recursive CTE from seed nodes, builds related subgraphs

</details>

<details>
<summary><b>🔄 Smart Maintenance</b> — Reflection · Compression · Pipeline maintenance</summary>

- **Session-End Reflection** — LLM full analysis, 4 insight types (user model / agent lessons / experience / decisions)
- **Turn Reflection** — Lightweight evaluation, dynamically boosts node importance
- **Graph Maintenance Pipeline** — Dedup → PageRank → Community detection → Community summaries
- **Session Compression** — Knowledge density evaluation, auto-summarize low-value sessions

</details>

<details>
<summary><b>🛡️ Engineering</b> — Scope isolation · Working memory · Noise filtering · Security</summary>

- **Multi-Scope Isolation** — Isolate by session / agent / workspace, parameterized queries prevent SQL injection
- **Working Memory** — Zero LLM overhead, tracks current tasks / decisions / constraints / attention
- **Noise Filtering** — Multilingual regex filtering (EN / CN / JP / KR / FR / ES / DE / IT)
- **Prompt Injection Protection** — 6-rule safety filter for reflection content

</details>

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        🌐 API Layer                             │
│              ContextEngine (Unified Facade Interface)             │
│     processTurn │ recall │ performFusion │ reflectOnSession      │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────────────────┐
│                     🎛️ Control Layer                            │
│  ┌──────────┐ ┌──────────┐ ┌────────┐ ┌──────────┐ ┌─────────┐ │
│  │ Extractor│ │ Recaller │ │ Fusion │ │Reflection│ │Reasoning│ │
│  └──────────┘ └──────────┘ └────────┘ └──────────┘ └─────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌────────┐ ┌──────────┐ ┌─────────┐ │
│  │  Hybrid  │ │  Vector  │ │ Rerank │ │Admission │ │ Working │ │
│  │  Recall  │ │  Recall  │ │  er    │ │ Control  │ │ Memory  │ │
│  └──────────┘ └──────────┘ └────────┘ └──────────┘ └─────────┘ │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────────────────┐
│                    ⚙️ Algorithm Layer                           │
│  ┌────────────┐ ┌──────────────┐ ┌───────────┐ ┌────────────┐  │
│  │  PageRank  │ │  Community   │ │   LSH     │ │  Temporal  │  │
│  │  (PPR)     │ │ Detection    │ │  Dedup    │ │ Classifier │  │
│  └────────────┘ └──────────────┘ └───────────┘ └────────────┘  │
│  ┌────────────┐ ┌──────────────┐ ┌───────────┐                 │
│  │   Decay    │ │  Intent      │ │  Query    │                 │
│  │  (Weibull) │ │  Analyzer    │ │  Expander │                 │
│  └────────────┘ └──────────────┘ └───────────┘                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────────────────┐
│                     💾 Storage Layer                            │
│    SQLite: 6 tables + FTS5 + Triggers + 8 indexes               │
│    bm_nodes │ bm_edges │ bm_vectors │ bm_messages               │
│    bm_communities │ bm_nodes_fts                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📦 Installation

### Option 1: npm (Published Package)

```bash
npm install memory-likehuman-pro
```

> **Note:** The published npm package contains the compiled `dist/` output. Source files (`src/`, `test/`, etc.) are not included in the npm package.

### Option 2: Clone from Git (Full Source)

```bash
git clone https://github.com/DylingCreation/brain-memory.git
cd brain-memory
npm install
```

### Option 3: Download ZIP

1. Visit [https://github.com/DylingCreation/brain-memory](https://github.com/DylingCreation/brain-memory)
2. Click **Code → Download ZIP**
3. Extract and install dependencies:

```bash
cd brain-memory
npm install
```

---

## 🚀 Quick Start

### 💻 Standalone Library Usage

```typescript
import { ContextEngine, DEFAULT_CONFIG } from 'memory-likehuman-pro';

const config = {
  ...DEFAULT_CONFIG,
  dbPath: '~/.openclaw/brain-memory.db',
  llm: {
    apiKey: process.env.LLM_API_KEY,
    baseURL: 'https://your-ll-api-endpoint/v1',
    model: 'your-model-name'
  },
  embedding: {
    apiKey: process.env.EMBEDDING_API_KEY,
    baseURL: 'https://your-embedding-api-endpoint/v1',
    model: 'your-embedding-model'
  }
};

const engine = new ContextEngine(config);

// 📝 Process conversation turns, extract knowledge
const result = await engine.processTurn({
  sessionId: 'session-1',
  agentId: 'agent-1',
  workspaceId: 'workspace-1',
  messages: [{
    role: 'user',
    content: 'I need to implement a memory system in TypeScript'
  }]
});

console.log(`Extracted ${result.extractedNodes.length} nodes, ${result.extractedEdges.length} edges`);

// 🔍 Recall relevant memories
const recall = await engine.recall('TypeScript memory system', 'session-1', 'agent-1', 'workspace-1');
console.log(`Recalled ${recall.nodes.length} relevant memories`);
```

### 🔌 OpenClaw Plugin Usage

brain-memory is designed as an **OpenClaw** plugin. Configure it in your OpenClaw config file (default: `~/.openclaw/openclaw.json`):

```json
{
  "plugins": {
    "entries": {
      "brain-memory": {
        "enabled": true,
        "config": {
          "llm": {
            "apiKey": "your-api-key-here",
            "baseURL": "https://your-ll-api-endpoint/v1",
            "model": "your-model-name"
          },
          "embedding": {
            "apiKey": "your-embedding-api-key",
            "baseURL": "https://your-embedding-api-endpoint/v1",
            "model": "your-embedding-model"
          },
          "engine": "hybrid",
          "storage": "sqlite",
          "dbPath": "~/.openclaw/brain-memory.db"
        }
      }
    }
  }
}
```

**Plugin hooks registered automatically:**

| 🔗 Hook | ⏰ Trigger | 🎯 Function |
|:---|:---|:---|
| `message_received` | After user sends a message | Extract knowledge from user messages |
| `message_sent` ✨ | After AI sends a reply | Extract suggestions / code / commitments from AI replies |
| `before_message_write` | Before AI sends a reply | Inject relevant memories into context |
| `session_start` | New session starts | Warm up memory cache |
| `session_end` | Session ends | Run reflection + graph maintenance |

### 🛠️ Interactive Configuration (Optional)

The project includes interactive configuration scripts. These are **generic setup tools** (not platform-specific) that generate basic LLM/Embedding API config files:

```bash
# Interactive config — generates config.js, .env, llm_client.js
npm run configure

# OpenClaw integration — writes config into ~/.openclaw/openclaw.json
npm run setup-openclaw
```

> **Important:** The interactive config scripts only set up **core API credentials** (LLM endpoint, API key, model name, embedding settings) and **run mode** (full/lite). They do **not** configure advanced brain-memory features such as decay parameters, reflection settings, fusion thresholds, or working memory limits. Those must be configured manually in your OpenClaw config file or programmatically via `BmConfig`.

> **Lite mode** (`mode: "lite"`): Skips LLM reflection and knowledge fusion. Keeps heuristic extraction + vector recall + working memory. Recommended for local models (e.g. qwen3.5:9b via Ollama) to reduce latency.

### 🩺 CLI Diagnostic Tool (new in v0.2.0)

Quickly check your environment, dependencies, configuration, and database status:

```bash
npm run doctor
# or: npx brain-memory-doctor
```

Checks: Node.js version, dependency installation, LLM/Embedding config, database file/schema version/table stats, WAL/SHM residual files.

---

## 📋 Memory Categories

brain-memory uses **8 memory categories** to cover all valuable conversation information:

| 🏷️ Category | 📖 Meaning | 💡 Example |
|:---|:---|:---|
| **`profile`** | User identity / role / background | "User is a full-stack engineer" |
| **`preferences`** | Likes / dislikes / habits | "User prefers concise replies" |
| **`entities`** | Projects / tools / environments | "Project uses SQLite" |
| **`events`** | Errors / exceptions that occurred | "Docker port conflict" |
| **`tasks`** | Completed tasks / discussion topics | "Implement memory system" |
| **`skills`** | Reusable procedures (how-to) | "npm install command" |
| **`cases`** | Case experience (success / failure) | "Check port before deploying" |
| **`patterns`** | Cross-case abstract patterns | "Checking port before deploy is a general rule" |

---

## 🔍 Recall Strategies

### Three Engine Modes

| 🚀 Mode | 📝 Description | 🎯 Use Case |
|:---|:---|:---|
| **`graph`** *(default)* | Knowledge graph + Community + PPR | When relationship context matters |
| **`vector`** | Pure vector + BM25 + RRF | Lightweight deployment, no graph dependency |
| **`hybrid`** | Graph + vector recall in parallel fusion | Best recall quality |

### Recall Flow Details

**🎯 Precise Path** (graph mode):

```
Query → Vector search / FTS5 → Community expansion (distance 2) → Graph walk (maxDepth) → PPR ranking → Time decay → Return Top N
```

**🌐 Generalized Path** (graph mode):

```
Query → Community vector match → Community members → Graph walk (1 layer) → PPR ranking → Merge with precise path
```

**🔀 Hybrid Fusion**:

```
Graph recall (PPR score) ──┐
                             ├──→ Min-Max normalization → RRF fusion → Sort → Return
Vector recall (RRF score) ──┘
```

---

## ⚙️ Configuration Reference

### Full Configuration

<details>
<summary>📋 Click to expand full configuration reference</summary>

```typescript
interface BmConfig {
  // 🚀 Engine mode: graph(default) | vector | hybrid
  engine: 'graph' | 'vector' | 'hybrid';

  // 💾 Storage backend: sqlite(default) | lancedb
  storage: 'sqlite' | 'lancedb';

  // 📁 Database path
  dbPath: string;

  // 🗜️ Session compression turn count
  compactTurnCount: number;

  // 🔍 Recall settings
  recallMaxNodes: number;     // default: 6
  recallMaxDepth: number;     // default: 2
  recallStrategy: 'full' | 'summary' | 'adaptive' | 'off';

  // 🤖 LLM settings
  llm: {
    apiKey?: string;
    baseURL?: string;
    model?: string;
  };

  // 🔢 Embedding settings
  embedding: {
    apiKey?: string;
    baseURL?: string;
    model?: string;
    dimensions?: number;
  };

  // 🔄 Dedup threshold
  dedupThreshold: number;     // default: 0.90

  // 📊 PageRank settings
  pagerankDamping: number;    // default: 0.85
  pagerankIterations: number; // default: 20

  // ⏳ Decay settings
  decay: {
    enabled: boolean;                    // default: false
    recencyHalfLifeDays: number;         // default: 30
    recencyWeight: number;               // default: 0.4
    frequencyWeight: number;             // default: 0.3
    intrinsicWeight: number;             // default: 0.3
    timeDecayHalfLifeDays: number;       // default: 60
    betaCore: number; betaWorking: number; betaPeripheral: number;
    coreDecayFloor: number; workingDecayFloor: number; peripheralDecayFloor: number;
  };

  // 🔇 Noise filter
  noiseFilter: {
    enabled: boolean;       // default: true
    minContentLength: number; // default: 10
  };

  // 💭 Reflection
  reflection: {
    enabled: boolean;          // default: true
    turnReflection: boolean;   // default: false
    sessionReflection: boolean; // default: true
    safetyFilter: boolean;     // default: true
    maxInsights: number;       // default: 8
    importanceBoost: number;   // default: 0.15
    minConfidence: number;     // default: 0.6
  };

  // 🧠 Working memory
  workingMemory: {
    enabled: boolean;     // default: true
    maxTasks: number;     // default: 3
    maxDecisions: number; // default: 5
    maxConstraints: number; // default: 5
  };

  // 🔗 Knowledge fusion
  fusion: {
    enabled: boolean;            // default: true
    similarityThreshold: number; // default: 0.75
    minNodes: number;            // default: 20
    minCommunities: number;      // default: 3
  };

  // 🧩 Reasoning
  reasoning: {
    enabled: boolean;         // default: true
    maxHops: number;          // default: 2
    maxConclusions: number;   // default: 3
    minRecallNodes: number;   // default: 3
  };
}
```

</details>

---

## 🧩 Core API

### ContextEngine

The unified context engine — main entry point for all features.

```typescript
class ContextEngine {
  // 📝 Process conversation turn, extract knowledge
  processTurn(params: {
    sessionId: string; agentId: string; workspaceId: string;
    messages: Array<{ role: string; content: string }>;
  }): Promise<{
    extractedNodes: BmNode[]; extractedEdges: BmEdge[];
    reflections: ReflectionInsight[]; workingMemory: WorkingMemoryState;
  }>;

  // 🔍 Recall relevant memories
  recall(query: string, sessionId?: string, agentId?: string, workspaceId?: string): Promise<RecallResult>;

  // 🔗 Knowledge fusion (merge duplicate nodes)
  performFusion(sessionId?: string): Promise<FusionResult>;

  // 💭 Session reflection
  reflectOnSession(sessionId: string, messages: Array<{ role: string; content: string }>): Promise<ReflectionInsight[]>;

  // 🧩 Reasoning engine
  performReasoning(query?: string): Promise<ReasoningConclusion[]>;

  // 🔄 Maintenance (dedup + PageRank + community detection)
  runMaintenance(): Promise<void>;

  // 🧠 Working memory context
  getWorkingMemoryContext(): string | null;

  // 🔎 Node search
  searchNodes(query: string, limit?: number): BmNode[];

  // 📊 Statistics (enhanced in v0.2.0)
  getStats(): EngineStats; // nodes by type/status/source, communities, vectors, dbSizeBytes, schemaVersion, uptimeMs, embedCache, queryTimeMs

  // 🩺 Health check (new in v0.2.0)
  healthCheck(): HealthStatus; // overall status, component status (db/llm/embedding), stats, uptime, schemaVersion

  // ❌ Close database
  close(): void;
}
```

---

## 📊 Database Schema

brain-memory uses **SQLite** with **6 tables + FTS5 full-text index**:

| 📋 Table | 📝 Purpose | 🔑 Key Fields |
|:---|:---|:---|
| **`bm_nodes`** | Memory nodes | id, type, category, name, content, pagerank, importance, scope_* |
| **`bm_edges`** | Knowledge edges | from_id, to_id, type, instruction, condition |
| **`bm_vectors`** | Vector embeddings | node_id(FK), embedding(BLOB), hash |
| **`bm_messages`** | Conversation messages | session_id, turn_index, role, content, extracted |
| **`bm_communities`** | Community summaries | id, summary, node_count, embedding |
| **`bm_nodes_fts`** | FTS5 index | name, description, content *(auto-synced via triggers)* |

---

## 🔐 Security

| 🛡️ Feature | 📝 Description |
|:---|:---|
| **Parameterized SQL** | All DB operations use `?` placeholders — no SQL injection |
| **Scope Isolation** | Memory isolated by session / agent / workspace with cross-scope authorization |
| **Prompt Injection Protection** | 6-rule safety filter on reflection content (ignore-instruction / key-leak / role-switch / HTML-inject / role-prefix / disable-safety) |
| **Input Validation** | Strict validation on node types / edge types / memory categories |

---

## 🧪 Testing

```bash
npm test
```

Comprehensive test coverage (v1.5.0):
- ✅ **625+ test cases** — 59 test files, 0 failures (LLM timeout excluded)
- ✅ **83.2% code coverage** — Core modules (recall, llm, embed, plugin) > 90%
- ✅ **Unit tests** — Individual components
- ✅ **Integration tests** — Full workflows
- ✅ **Performance benchmarks** — 0.44ms recall avg, 7.21ms vector search
- ✅ **Error handling** — Graceful degradation, edge case coverage

---

## 🛠️ Build Commands

```bash
# Build the project
npm run build

# Clean build artifacts
npm run clean

# Run linting
npm run lint

# Generate API docs
npm run docs
```

---

## 📁 Project Structure

<details>
<summary>📂 Click to expand directory structure</summary>

```
brain-memory/
├── src/                 # Source code
│   ├── store/          # Database operations (CRUD + FTS5 + vectors)
│   ├── extractor/      # Knowledge extraction (LLM node/edge extraction)
│   ├── recaller/       # Dual-path recall engine
│   ├── retriever/      # Hybrid recall / Vector recall / Reranker / Admission control
│   ├── reasoning/      # Reasoning engine
│   ├── reflection/     # Reflection system
│   ├── fusion/         # Knowledge fusion & dedup
│   ├── decay/          # Weibull forgetting algorithm
│   ├── scope/          # Multi-scope isolation
│   ├── temporal/       # Temporal classification (static/dynamic)
│   ├── noise/          # Noise filtering
│   ├── working-memory/ # Working memory management
│   ├── format/         # Context formatting & assembly
│   ├── engine/         # Core engines (LLM + Embedding + ContextEngine)
│   ├── graph/          # Graph algorithms (PageRank / Community / Dedup / Maintenance)
│   ├── preferences/    # Preference slot extraction
│   ├── session/        # Session compression
│   ├── plugin/         # OpenClaw plugin interfaces
│   └── utils/          # Utilities (JSON / Similarity / Text / XML)
│
├── test/               # Test files
│   ├── *.test.ts       # Unit tests
│   └── integration/    # Integration tests
│
├── docs/               # Documentation
├── scripts/            # Configuration scripts
├── openclaw-*.ts       # OpenClaw plugin entry points
└── index.ts            # Module export entry
```

</details>

---

## 📝 Changelog

### 🆕 Latest Release

| Badge | Description |
|:---:|:---|
| ✨ | **Bidirectional Knowledge Extraction** — New `message_sent` hook extracts both user messages and AI replies |
| 🎯 | **AI Reply Smart Filtering** — Skips replies under 50 characters, focuses on valuable content |
| 🔄 | **Role-Differentiated Processing** — User messages extract intent/preferences, AI replies extract suggestions/code/tools |
| 🌐 | **Cross-Session Memory Sharing** — Agent-level cache, new sessions auto-reuse historical memory |
| 🔥 | **Session Warm-Up** — Preloads relevant memories on session start |

---

## 📄 License

[MIT](LICENSE) · Made with ❤️ for AI Agents
