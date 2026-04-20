/**
 * brain-memory — Unified AI Memory Engine for OpenClaw
 *
 * Combines:
 *   - graph-memory: knowledge graph + PPR + community detection + vector dedup
 *   - memory-lancedb-pro: Weibull decay + noise filtering + smart extraction patterns
 *
 * Authors: adoresever (graph-memory), win4r (memory-lancedb-pro), brain-memory contributors
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { initDb, getDbPath } from "./src/store/db.ts";
import {
  saveMessage, getUnextracted, markExtracted,
  upsertNode, upsertEdge, findByName, allActiveNodes,
  updateAccess, searchNodes,
} from "./src/store/store.ts";
import { createCompleteFn } from "./src/engine/llm.ts";
import { createEmbedFn } from "./src/engine/embed.ts";
import { Extractor } from "./src/extractor/extract.ts";
import { Recaller } from "./src/recaller/recall.ts";
import { VectorRecaller } from "./src/retriever/vector-recall.ts";
import { HybridRecaller } from "./src/retriever/hybrid-recall.ts";
import { Reranker } from "./src/retriever/reranker.ts";
import { assembleContext } from "./src/format/assemble.ts";
import { runMaintenance } from "./src/graph/maintenance.ts";
import { invalidateGraphCache, computeGlobalPageRank } from "./src/graph/pagerank.ts";
import { detectCommunities } from "./src/graph/community.ts";
import { isNoise } from "./src/noise/filter.ts";
import { DEFAULT_CONFIG, type BmConfig } from "./src/types.ts";
import { reflectOnSession, reflectOnTurn } from "./src/reflection/extractor.ts";
import { storeReflectionInsights, applyTurnBoosts } from "./src/reflection/store.ts";
import { createWorkingMemory, updateWorkingMemory, buildWorkingMemoryContext } from "./src/working-memory/manager.ts";
import { runFusion, shouldRunFusion } from "./src/fusion/analyzer.ts";
import { runReasoning, buildReasoningContext, shouldRunReasoning } from "./src/reasoning/engine.ts";

// ─── Config reader ───────────────────────────────────────────

function readConfig(api: OpenClawPluginApi): BmConfig {
  const raw = (api.getConfig?.() || {}) as Record<string, unknown>;
  const cfg = { ...DEFAULT_CONFIG } as BmConfig;

  if (typeof raw.engine === "string" && ["graph", "vector", "hybrid"].includes(raw.engine)) cfg.engine = raw.engine as any;
  if (typeof raw.storage === "string" && ["sqlite", "lancedb"].includes(raw.storage)) cfg.storage = raw.storage as any;
  if (typeof raw.dbPath === "string") cfg.dbPath = raw.dbPath;
  if (typeof raw.compactTurnCount === "number") cfg.compactTurnCount = Math.floor(raw.compactTurnCount);
  if (typeof raw.recallMaxNodes === "number") cfg.recallMaxNodes = Math.floor(raw.recallMaxNodes);
  if (typeof raw.recallMaxDepth === "number") cfg.recallMaxDepth = Math.floor(raw.recallMaxDepth);
  if (typeof raw.recallStrategy === "string" && ["full", "summary", "adaptive", "off"].includes(raw.recallStrategy)) cfg.recallStrategy = raw.recallStrategy as any;
  if (typeof raw.dedupThreshold === "number") cfg.dedupThreshold = raw.dedupThreshold;
  if (typeof raw.pagerankDamping === "number") cfg.pagerankDamping = raw.pagerankDamping;
  if (typeof raw.pagerankIterations === "number") cfg.pagerankIterations = Math.floor(raw.pagerankIterations);

  if (raw.embedding && typeof raw.embedding === "object") {
    const emb = raw.embedding as Record<string, unknown>;
    cfg.embedding = {
      apiKey: typeof emb.apiKey === "string" ? emb.apiKey : undefined,
      baseURL: typeof emb.baseURL === "string" ? emb.baseURL : undefined,
      model: typeof emb.model === "string" ? emb.model : undefined,
      dimensions: typeof emb.dimensions === "number" ? emb.dimensions : undefined,
    };
  }

  if (raw.llm && typeof raw.llm === "object") {
    const llm = raw.llm as Record<string, unknown>;
    cfg.llm = {
      apiKey: typeof llm.apiKey === "string" ? llm.apiKey : undefined,
      baseURL: typeof llm.baseURL === "string" ? llm.baseURL : undefined,
      model: typeof llm.model === "string" ? llm.model : undefined,
    };
  }

  if (raw.decay && typeof raw.decay === "object") {
    const d = raw.decay as Record<string, unknown>;
    cfg.decay = {
      ...cfg.decay,
      enabled: typeof d.enabled === "boolean" ? d.enabled : cfg.decay.enabled,
      recencyHalfLifeDays: typeof d.recencyHalfLifeDays === "number" ? d.recencyHalfLifeDays : cfg.decay.recencyHalfLifeDays,
      timeDecayHalfLifeDays: typeof d.timeDecayHalfLifeDays === "number" ? d.timeDecayHalfLifeDays : cfg.decay.timeDecayHalfLifeDays,
    };
  }

  if (raw.noiseFilter && typeof raw.noiseFilter === "object") {
    const nf = raw.noiseFilter as Record<string, unknown>;
    cfg.noiseFilter = {
      enabled: typeof nf.enabled === "boolean" ? nf.enabled : cfg.noiseFilter.enabled,
      minContentLength: typeof nf.minContentLength === "number" ? Math.floor(nf.minContentLength) : cfg.noiseFilter.minContentLength,
    };
  }

  if (raw.reflection && typeof raw.reflection === "object") {
    const r = raw.reflection as Record<string, unknown>;
    cfg.reflection = {
      enabled: typeof r.enabled === "boolean" ? r.enabled : cfg.reflection.enabled,
      turnReflection: typeof r.turnReflection === "boolean" ? r.turnReflection : cfg.reflection.turnReflection,
      sessionReflection: typeof r.sessionReflection === "boolean" ? r.sessionReflection : cfg.reflection.sessionReflection,
      safetyFilter: typeof r.safetyFilter === "boolean" ? r.safetyFilter : cfg.reflection.safetyFilter,
      maxInsights: typeof r.maxInsights === "number" ? Math.floor(r.maxInsights) : cfg.reflection.maxInsights,
      importanceBoost: typeof r.importanceBoost === "number" ? r.importanceBoost : cfg.reflection.importanceBoost,
      minConfidence: typeof r.minConfidence === "number" ? r.minConfidence : cfg.reflection.minConfidence,
    };
  }

  if (raw.workingMemory && typeof raw.workingMemory === "object") {
    const wm = raw.workingMemory as Record<string, unknown>;
    cfg.workingMemory = {
      enabled: typeof wm.enabled === "boolean" ? wm.enabled : cfg.workingMemory.enabled,
      maxTasks: typeof wm.maxTasks === "number" ? Math.floor(wm.maxTasks) : cfg.workingMemory.maxTasks,
      maxDecisions: typeof wm.maxDecisions === "number" ? Math.floor(wm.maxDecisions) : cfg.workingMemory.maxDecisions,
      maxConstraints: typeof wm.maxConstraints === "number" ? Math.floor(wm.maxConstraints) : cfg.workingMemory.maxConstraints,
    };
  }

  if (raw.fusion && typeof raw.fusion === "object") {
    const f = raw.fusion as Record<string, unknown>;
    if (!cfg.hasOwnProperty("fusion" as never)) (cfg as any).fusion = {};
    const fusionObj = (cfg as any).fusion || {};
    if (typeof f.enabled === "boolean") fusionObj.enabled = f.enabled;
    if (typeof f.similarityThreshold === "number") fusionObj.similarityThreshold = f.similarityThreshold;
    if (typeof f.minNodes === "number") fusionObj.minNodes = Math.floor(f.minNodes);
    if (typeof f.minCommunities === "number") fusionObj.minCommunities = Math.floor(f.minCommunities);
  }

  if (raw.reasoning && typeof raw.reasoning === "object") {
    const r = raw.reasoning as Record<string, unknown>;
    if (!cfg.hasOwnProperty("reasoning" as never)) (cfg as any).reasoning = {};
    const reasoningObj = (cfg as any).reasoning || {};
    if (typeof r.enabled === "boolean") reasoningObj.enabled = r.enabled;
    if (typeof r.maxHops === "number") reasoningObj.maxHops = Math.floor(r.maxHops);
    if (typeof r.maxConclusions === "number") reasoningObj.maxConclusions = Math.floor(r.maxConclusions);
    if (typeof r.minRecallNodes === "number") reasoningObj.minRecallNodes = Math.floor(r.minRecallNodes);
  }

  return cfg;
}

// ─── Clean prompt ────────────────────────────────────────────

function cleanPrompt(raw: string): string {
  let prompt = raw.trim();
  if (prompt.includes("Sender (untrusted metadata)")) {
    const jsonStart = prompt.indexOf("```json");
    if (jsonStart >= 0) {
      const jsonEnd = prompt.indexOf("```", jsonStart + 7);
      if (jsonEnd >= 0) prompt = prompt.slice(jsonEnd + 3).trim();
    }
    if (prompt.includes("Sender (untrusted metadata)")) {
      const lines = prompt.split("\n").filter(l => l.trim() && !l.includes("Sender") && !l.startsWith("```") && !l.startsWith("{"));
      prompt = lines.join("\n").trim();
    }
  }
  prompt = prompt.replace(/^\/\w+\s+/, "").trim();
  prompt = prompt.replace(/^\[[\w\s\-:]+\]\s*/, "").trim();
  return prompt;
}

// ─── Normalize message content for OpenClaw ──────────────────

function normalizeMessageContent(messages: any[]): any[] {
  return messages.map((msg: any) => {
    if (!msg || typeof msg !== "object") return msg;
    const c = msg.content;
    if (Array.isArray(c)) {
      const fixed = c.map((block: any) => {
        if (block && typeof block === "object" && block.type === "text" && !("text" in block)) {
          return { ...block, text: "" };
        }
        return block;
      });
      if (fixed !== c) return { ...msg, content: fixed };
      return msg;
    }
    if (typeof c === "string") {
      return { ...msg, content: [{ type: "text", text: c }] };
    }
    if (c == null) {
      return { ...msg, content: [{ type: "text", text: "" }] };
    }
    return msg;
  });
}

// ─── Plugin entry ────────────────────────────────────────────

export default async function (api: OpenClawPluginApi) {
  const cfg = readConfig(api);
  const dbPath = api.resolvePath(getDbPath(cfg.dbPath));
  const db = initDb(dbPath);

  const llm = createCompleteFn(cfg.llm);
  const recaller = new Recaller(db, cfg);
  const vectorRecaller = new VectorRecaller(db, cfg);
  const hybridRecaller = new HybridRecaller(db, cfg);
  const reranker = new Reranker(cfg);

  // ─── Startup configuration check ───────────────────────────

  const log = (msg: string) => api.logger.info(`brain-memory: ${msg}`);
  const warn = (msg: string) => api.logger.warn(`brain-memory: ${msg}`);

  const hasLlm = llm !== null;
  const hasEmbed = cfg.embedding?.apiKey ? true : false;

  if (!hasLlm) {
    warn("⚠️ LLM not configured — knowledge extraction, reflection, fusion, and reasoning will be disabled.");
    warn("   Configure in your OpenClaw config under plugins.entries.brain-memory.config.llm:");
    warn('   { "apiKey": "sk-...", "baseURL": "https://api.openai.com/v1", "model": "gpt-4o-mini" }');
    warn("   DashScope example: { "apiKey": "sk-...", "baseURL": "https://dashscope.aliyuncs.com/compatible-mode/v1", "model": "qwen3.6-plus" }");
    warn("   Or set ANTHROPIC_API_KEY environment variable for Anthropic Claude.");
    warn("   You can skip this — basic storage/recall will still work without LLM.");
  }

  if (!hasEmbed) {
    warn("⚠️ Embedding not configured — vector semantic search, dedup, and community summaries will be disabled.");
    warn("   Configure under plugins.entries.brain-memory.config.embedding:");
    warn('   { "apiKey": "sk-...", "baseURL": "https://api.openai.com/v1", "model": "text-embedding-3-small" }');
    warn("   FTS5 full-text search will work as fallback.");
  }

  // Init embedding
  const embedFn = createEmbedFn(cfg.embedding);
  if (embedFn) {
    recaller.setEmbedFn(embedFn);
    vectorRecaller.setEmbedFn(embedFn);
    hybridRecaller.setEmbedFn(embedFn);
    log("vector search ready");
  } else {
    log("FTS5 full-text search mode (no embedding — semantic search, dedup, community summaries disabled)");
  }

  const extractor = llm ? new Extractor(cfg, llm) : null;

  log(`ready | db=${dbPath} | engine=${cfg.engine} | storage=${cfg.storage} | llm=${hasLlm ? "yes" : "no"} | embed=${hasEmbed ? "yes" : "no"}`);

  // ─── Session runtime state ─────────────────────────────────

  const msgSeq = new Map<string, number>();
  const recalled = new Map<string, { nodes: any[]; edges: any[] }>();
  const turnCounter = new Map<string, number>();
  const workingMemories = new Map<string, ReturnType<typeof createWorkingMemory>>();

  // ─── Extract serialisation (per-session promise chain) ─────

  const extractChain = new Map<string, Promise<void>>();

  /** Save a message to bm_messages (sync, zero LLM) */
  function ingestMessage(sessionId: string, message: any): void {
    let seq = msgSeq.get(sessionId);
    if (seq === undefined) {
      const row = db.prepare(
        "SELECT MAX(turn_index) as maxTurn FROM bm_messages WHERE session_id=?"
      ).get(sessionId) as any;
      seq = Number(row?.maxTurn) || 0;
    }
    seq += 1;
    msgSeq.set(sessionId, seq);
    saveMessage(db, sessionId, seq, message.role ?? "unknown", message);
  }

  /** Run extraction for a session (chained, won't skip) */
  async function runTurnExtract(sessionId: string, newMessages: any[]): Promise<void> {
    if (!newMessages.length && !cfg.reflection.turnReflection) return;

    const prev = extractChain.get(sessionId) ?? Promise.resolve();
    const next = prev.then(async () => {
      try {
        const msgs = getUnextracted(db, sessionId, 50);
        if (!msgs.length && !cfg.reflection.turnReflection) return;

        if (!extractor) {
          warn("skipping extraction (LLM not configured) — set config.llm.apiKey to enable");
        }
        const existing = allActiveNodes(db).map(n => n.name);
        const result = extractor ? await extractor.extract({ messages: msgs, existingNames: existing }) : { nodes: [], edges: [] };

        const nameToId = new Map<string, string>();
        for (const nc of result.nodes) {
          const { node } = upsertNode(db, {
            type: nc.type,
            category: nc.category,
            name: nc.name,
            description: nc.description,
            content: nc.content,
            temporalType: nc.temporalType,
          }, sessionId);
          nameToId.set(node.name, node.id);
          recaller.syncEmbed(node).catch(() => {});
        }

        for (const ec of result.edges) {
          const fromId = nameToId.get(ec.from) ?? findByName(db, ec.from)?.id;
          const toId = nameToId.get(ec.to) ?? findByName(db, ec.to)?.id;
          if (fromId && toId) {
            upsertEdge(db, {
              fromId, toId, type: ec.type,
              instruction: ec.instruction, condition: ec.condition, sessionId,
            });
          }
        }

        if (msgs.length) {
          const maxTurn = Math.max(...msgs.map((m: any) => m.turn_index));
          markExtracted(db, sessionId, maxTurn);
        }

        if (result.nodes.length || result.edges.length) {
          invalidateGraphCache();
          log(`extracted ${result.nodes.length} nodes, ${result.edges.length} edges`);
        }

        // Update working memory from extraction results
        if (cfg.workingMemory.enabled) {
          let wm = workingMemories.get(sessionId);
          if (!wm) {
            wm = createWorkingMemory();
            workingMemories.set(sessionId, wm);
          }
          const latestUser = msgs.length > 0
            ? msgs.filter((m: any) => m.role === "user").pop()
            : null;
          const userText = latestUser
            ? (typeof latestUser.content === "string" ? latestUser.content : JSON.stringify(latestUser.content))
            : "";
          updateWorkingMemory(wm, cfg.workingMemory, {
            extractedNodes: result.nodes.map(n => ({
              name: n.name, category: n.category, type: n.type, content: n.content,
            })),
            userMessage: userText,
          });
        }

        // Turn reflection: quick scan for importance boosts
        if (cfg.reflection.turnReflection && extractor && llm && (result.nodes.length > 0)) {
          try {
            const allNodes = allActiveNodes(db);
            const boosts = await reflectOnTurn(cfg.reflection, llm, {
              extractedNodes: result.nodes.map(n => ({
                name: n.name, category: n.category, type: n.type, validatedCount: 1,
              })),
              existingNodes: allNodes.map(n => ({
                name: n.name, category: n.category, validatedCount: n.validatedCount,
              })),
            });

            if (boosts.length > 0) {
              const applied = applyTurnBoosts(db, boosts);
              if (applied > 0) log(`turn reflection: ${applied} nodes boosted`);
            }
          } catch (err) {
            api.logger.warn(`brain-memory: turn reflection failed: ${err}`);
          }
        }
      } catch (err) {
        api.logger.error(`brain-memory: turn extract failed: ${err}`);
      }
    });
    extractChain.set(sessionId, next);
    return next;
  }

  // ─── ContextEngine ─────────────────────────────────────────

  const engine = {
    info: {
      id: "brain-memory",
      name: "Brain Memory",
      ownsCompaction: true,
    },

    async bootstrap({ sessionId }: { sessionId: string }) {
      return { bootstrapped: true };
    },

    async ingest({
      sessionId,
      message,
      isHeartbeat,
    }: {
      sessionId: string;
      message: any;
      isHeartbeat?: boolean;
    }) {
      if (isHeartbeat) return { ingested: false };
      ingestMessage(sessionId, message);
      return { ingested: true };
    },

    async assemble({
      sessionId,
      messages,
      tokenBudget,
      prompt,
    }: {
      sessionId: string;
      messages: any[];
      tokenBudget?: number;
      prompt?: string;
    }) {
      const activeNodes = allActiveNodes(db);
      const activeEdges = db.prepare(
        "SELECT * FROM bm_edges"
      ).all() as any[];

      // Choose recall strategy based on engine mode
      let rec = recalled.get(sessionId) ?? { nodes: [], edges: [] };
      if (prompt) {
        const cleaned = cleanPrompt(prompt);
        if (cleaned) {
          try {
            let freshRec;
            if (cfg.engine === "vector") {
              // Vector mode: use vector recall (RRF fusion)
              const vr = await vectorRecaller.recall(cleaned);
              freshRec = { nodes: vr.nodes, edges: vr.edges };
            } else if (cfg.engine === "hybrid") {
              // Hybrid mode: graph + vector fusion
              const hr = await hybridRecaller.recall(cleaned);
              freshRec = { nodes: hr.nodes, edges: hr.edges };
            } else {
              // Graph mode (default): use graph recall (PPR + community)
              const gr = await recaller.recall(cleaned);
              freshRec = { nodes: gr.nodes, edges: gr.edges };
            }
            if (freshRec.nodes.length) {
              rec = freshRec;
              recalled.set(sessionId, freshRec);
            }
          } catch (err) {
            api.logger.warn(`brain-memory: assemble recall failed: ${err}`);
          }
        }
      }

      const totalBmNodes = activeNodes.length + rec.nodes.length;
      if (totalBmNodes === 0) {
        return { messages: normalizeMessageContent(messages), estimatedTokens: 0 };
      }

      // Last turn messages
      const lastTurn = sliceLastTurn(messages);
      const repaired = lastTurn.messages;

      // Graph context assembly
      const { xml, systemPrompt, tokens: bmTokens, episodicXml, episodicTokens } = assembleContext(db, {
        tokenBudget: 0,
        activeNodes,
        activeEdges,
        recalledNodes: rec.nodes,
        recalledEdges: rec.edges,
      });

      if (episodicTokens > 0) {
        log(`assemble: graph ~${bmTokens} tok, episodic ~${episodicTokens} tok`);
      }

      // Assemble systemPromptAddition
      let systemPromptAddition: string | undefined;

      // Working memory: inject at the top (highest priority)
      let workingMemoryXml: string | null = null;
      if (cfg.workingMemory.enabled) {
        const wm = workingMemories.get(sessionId);
        if (wm) {
          workingMemoryXml = buildWorkingMemoryContext(wm);
        }
      }

      // Reasoning: derive new conclusions from recalled subgraph
      let reasoningXml: string | null = null;
      if (cfg.reasoning.enabled && llm && rec.nodes.length > 0) {
        const cleanedPrompt = prompt ? cleanPrompt(prompt) : "";
        try {
          const reasoningResult = await runReasoning(llm, rec.nodes, rec.edges, cleanedPrompt || rec.nodes[0]?.name || "", cfg);
          if (reasoningResult.conclusions.length > 0) {
            reasoningXml = buildReasoningContext(reasoningResult.conclusions);
            log(`reasoning: ${reasoningResult.conclusions.length} conclusions derived`);
          }
        } catch (err) {
          api.logger.warn(`brain-memory: reasoning failed: ${err}`);
        }
      }

      const parts = [workingMemoryXml, systemPrompt, xml, episodicXml, reasoningXml].filter(Boolean);
      if (parts.length) {
        systemPromptAddition = parts.join("\n\n");
      }

      return {
        messages: normalizeMessageContent(repaired),
        estimatedTokens: bmTokens + lastTurn.tokens,
        ...(systemPromptAddition ? { systemPromptAddition } : {}),
      };
    },

    async compact({
      sessionId,
      force,
      currentTokenCount,
    }: {
      sessionId: string;
      sessionFile: string;
      tokenBudget?: number;
      force?: boolean;
      currentTokenCount?: number;
    }) {
      const msgs = getUnextracted(db, sessionId, 50);
      if (!msgs.length) {
        return { ok: true, compacted: false, reason: "no messages" };
      }

      if (!extractor) {
        warn("bm_compact: skipping extraction (LLM not configured) — set config.llm.apiKey to enable");
        return { ok: true, compacted: false, reason: "LLM not configured" };
      }
      try {
        const existing = allActiveNodes(db).map(n => n.name);
        const result = await extractor.extract({ messages: msgs, existingNames: existing });

        const nameToId = new Map<string, string>();
        for (const nc of result.nodes) {
          const { node } = upsertNode(db, {
            type: nc.type, category: nc.category,
            name: nc.name, description: nc.description, content: nc.content,
            temporalType: nc.temporalType,
          }, sessionId);
          nameToId.set(node.name, node.id);
          recaller.syncEmbed(node).catch(() => {});
        }

        for (const ec of result.edges) {
          const fromId = nameToId.get(ec.from) ?? findByName(db, ec.from)?.id;
          const toId = nameToId.get(ec.to) ?? findByName(db, ec.to)?.id;
          if (fromId && toId) {
            upsertEdge(db, {
              fromId, toId, type: ec.type,
              instruction: ec.instruction, condition: ec.condition, sessionId,
            });
          }
        }

        const maxTurn = Math.max(...msgs.map((m: any) => m.turn_index));
        markExtracted(db, sessionId, maxTurn);

        return {
          ok: true, compacted: true,
          result: {
            summary: `extracted ${result.nodes.length} nodes, ${result.edges.length} edges`,
            tokensBefore: currentTokenCount ?? 0,
          },
        };
      } catch (err) {
        api.logger.error(`brain-memory: compact failed: ${err}`);
        return { ok: false, compacted: false, reason: String(err) };
      }
    },

    async afterTurn({
      sessionId,
      messages,
      prePromptMessageCount,
      isHeartbeat,
    }: {
      sessionId: string;
      sessionFile: string;
      messages: any[];
      prePromptMessageCount: number;
      autoCompactionSummary?: string;
      isHeartbeat?: boolean;
      tokenBudget?: number;
    }) {
      if (isHeartbeat) return;

      const totalMsgs = msgSeq.get(sessionId) ?? 0;
      log(`afterTurn sid=${sessionId.slice(0, 8)} totalMsgs=${totalMsgs}`);

      // Extract every turn
      runTurnExtract(sessionId, []).catch((err) => {
        api.logger.error(`brain-memory: turn extract failed: ${err}`);
      });

      // Periodic maintenance: every N turns
      const turns = (turnCounter.get(sessionId) ?? 0) + 1;
      turnCounter.set(sessionId, turns);
      const maintainInterval = cfg.compactTurnCount ?? 6;

      if (turns % maintainInterval === 0) {
        try {
          invalidateGraphCache();
          const pr = computeGlobalPageRank(db, cfg);
          const comm = detectCommunities(db);
          log(`periodic maintenance (turn ${turns}): communities=${comm.count}`);

          // Community summaries: fire-and-forget
          if (comm.communities.size > 0 && llm) {
            (async () => {
              try {
                const { summarizeCommunities } = await import("./src/graph/community.ts");
                const summaries = await summarizeCommunities(db, comm.communities, llm, embedFn ?? undefined);
                log(`community summaries refreshed: ${summaries} summaries`);
              } catch (e) {
                api.logger.error(`brain-memory: community summary failed: ${e}`);
              }
            })();
          }
        } catch (err) {
          api.logger.error(`brain-memory: periodic maintenance failed: ${err}`);
        }
      }
    },

    async dispose() {
      extractChain.clear();
      msgSeq.clear();
      recalled.clear();
      workingMemories.clear();
    },
  };

  api.registerContextEngine("brain-memory", () => engine);

  // ─── session_end: finalize + full maintenance ──────────────

  api.on("session_end", async (event: any, ctx: any) => {
    const sid = ctx?.sessionKey ?? ctx?.sessionId ?? event?.sessionKey ?? event?.sessionId;
    if (!sid) return;

    try {
      const nodes = allActiveNodes(db);
      if (nodes.length && extractor) {
        const summary = nodes.slice(0, 20)
          .map(n => `${n.type}:${n.name}(v${n.validatedCount},pr${n.pagerank.toFixed(3)})`)
          .join(", ");

        const fin = await extractor.finalize({ sessionNodes: nodes, graphSummary: summary });

        for (const nc of fin.promotedSkills) {
          if (nc.name && nc.content) {
            upsertNode(db, {
              type: "SKILL", category: "skills",
              name: nc.name, description: nc.description ?? "", content: nc.content,
            }, sid);
          }
        }
        for (const ec of fin.newEdges) {
          const fromId = findByName(db, ec.from)?.id;
          const toId = findByName(db, ec.to)?.id;
          if (fromId && toId) {
            upsertEdge(db, {
              fromId, toId, type: ec.type,
              instruction: ec.instruction, sessionId: sid,
            });
          }
        }
      }

      // Knowledge fusion: merge related nodes, add cross-community links
      if (!llm && shouldRunFusion(db, cfg)) {
        warn("bm_maintain: skipping knowledge fusion (LLM not configured) — set config.llm.apiKey to enable");
      }
      if (llm && shouldRunFusion(db, cfg)) {
        try {
          const fusionResult = await runFusion(db, cfg, llm, embedFn ?? undefined, sid);
          if (fusionResult.merged > 0 || fusionResult.linked > 0) {
            log(`fusion: ${fusionResult.merged} merged, ${fusionResult.linked} linked (${fusionResult.durationMs}ms)`);
            invalidateGraphCache();
          }
        } catch (err) {
          api.logger.warn(`brain-memory: fusion failed: ${err}`);
        }
      }

      // Session reflection: LLM full analysis → graph nodes
      if (cfg.reflection.sessionReflection && extractor && llm && nodes.length > 0) {
        try {
          const insights = await reflectOnSession(cfg.reflection, llm, {
            sessionMessages: `Session ${sid}: ${nodes.length} nodes extracted`,
            extractedNodes: nodes.map(n => ({
              name: n.name, category: n.category, type: n.type, content: n.content,
            })),
          });

          if (insights.length > 0) {
            const result = storeReflectionInsights(db, insights, sid, cfg);
            if (result.stored > 0 || result.boosted > 0) {
              log(`session reflection: ${result.stored} stored, ${result.boosted} boosted`);
              invalidateGraphCache();
            }
          }
        } catch (err) {
          api.logger.warn(`brain-memory: session reflection failed: ${err}`);
        }
      }

      const result = await runMaintenance(db, cfg, llm, embedFn ?? undefined);
      log(`maintenance: ${result.durationMs}ms, dedup=${result.dedup.merged}, communities=${result.community.count}, summaries=${result.communitySummaries}`);
    } catch (err) {
      api.logger.error(`brain-memory: session_end error: ${err}`);
    } finally {
      extractChain.delete(sid);
      msgSeq.delete(sid);
      recalled.delete(sid);
      turnCounter.delete(sid);
      workingMemories.delete(sid);
    }
  });

  // ─── Tools ─────────────────────────────────────────────────

  api.registerTool(
    "bm_search",
    { description: "Search brain-memory knowledge graph", parameters: Type.Object({ query: Type.String({ description: "Search query" }) }) },
    async ({ query }) => {
      const recalled = await recaller.recall(query);
      if (recalled.nodes.length === 0) return { text: "No relevant memories found." };
      const lines = recalled.nodes.map(n =>
        `- [${n.type}] **${n.name}** (${n.category})\n  ${n.description}\n  ${n.content.slice(0, 200)}`
      );
      return { text: `Found ${recalled.nodes.length} memories:\n\n${lines.join("\n\n")}` };
    },
  );

  api.registerTool(
    "bm_record",
    { description: "Manually record knowledge to brain-memory", parameters: Type.Object({ type: Type.String(), category: Type.Optional(Type.String()), name: Type.String(), description: Type.String(), content: Type.String() }) },
    async ({ type, category, name, description, content }) => {
      const sessionId = "manual";
      const cat = (category || (type === "TASK" ? "tasks" : type === "SKILL" ? "skills" : "events")) as any;
      const { node, isNew } = upsertNode(db, { type: type as any, category: cat, name, description, content }, sessionId);
      recaller.syncEmbed(node).catch(() => {});
      return { text: isNew ? `Recorded new ${type}: ${node.name}` : `Updated ${type}: ${node.name} (validated ${node.validatedCount}x)` };
    },
  );

  api.registerTool(
    "bm_stats",
    { description: "View brain-memory statistics", parameters: Type.Object({}) },
    async () => {
      const nodes = allActiveNodes(db);
      const edges = db.prepare("SELECT COUNT(*) as c FROM bm_edges").get() as any;
      const communities = db.prepare("SELECT COUNT(DISTINCT community_id) as c FROM bm_nodes WHERE community_id IS NOT NULL").get() as any;
      const counts: Record<string, number> = {};
      const catCounts: Record<string, number> = {};
      for (const n of nodes) {
        counts[n.type] = (counts[n.type] || 0) + 1;
        catCounts[n.category] = (catCounts[n.category] || 0) + 1;
      }

      // Reflection stats
      const coreNodes = nodes.filter(n => n.importance > 0.7).length;
      const workingNodes = nodes.filter(n => n.importance > 0.4 && n.importance <= 0.7).length;
      const peripheralNodes = nodes.filter(n => n.importance <= 0.4).length;

      return { text: `Brain Memory Stats:\n- Nodes: ${nodes.length} (by type: ${Object.entries(counts).map(([t, c]) => `${t}:${c}`).join(", ")})\n- Nodes by category: ${Object.entries(catCounts).map(([t, c]) => `${t}:${c}`).join(", ")})\n- Edges: ${edges.c}\n- Communities: ${communities.c || 0}\n- Decay tiers: Core=${coreNodes}, Working=${workingNodes}, Peripheral=${peripheralNodes}\n- Reflection: enabled=${cfg.reflection.enabled}, session=${cfg.reflection.sessionReflection}, turn=${cfg.reflection.turnReflection}` };
    },
  );

  api.registerTool(
    "bm_maintain",
    { description: "Trigger graph maintenance: dedup → PageRank → community detection + summaries", parameters: Type.Object({}) },
    async () => {
      invalidateGraphCache();
      const result = await runMaintenance(db, cfg, llm, embedFn ?? undefined);
      let note = "";
      if (!llm) note += "\n⚠️ LLM not configured: community summaries skipped.";
      if (!embedFn) note += "\n⚠️ Embedding not configured: vector dedup and community embedding skipped.";
      return { text: `Maintenance complete:\n- Dedup: ${result.dedup.merged} merged\n- Communities: ${result.community.count} detected, ${result.communitySummaries} summaries\n- Duration: ${result.durationMs}ms${note}` };
    },
  );

  api.registerTool(
    "bm_reflect",
    { description: "Trigger session reflection on existing knowledge nodes", parameters: Type.Object({}) },
    async () => {
      if (!extractor || !llm) {
        return { text: "Reflection unavailable: LLM not configured." };
      }
      if (!cfg.reflection.sessionReflection) {
        return { text: "Session reflection is disabled in config (reflection.sessionReflection)." };
      }
      const nodes = allActiveNodes(db);
      if (nodes.length === 0) {
        return { text: "No knowledge nodes to reflect on. Extract some knowledge first." };
      }

      const insights = await reflectOnSession(cfg.reflection, llm, {
        sessionMessages: "Manual reflection",
        extractedNodes: nodes.map(n => ({
          name: n.name, category: n.category, type: n.type, content: n.content,
        })),
      });

      if (insights.length === 0) {
        return { text: "No new insights from reflection. All extracted insights were below confidence threshold or duplicate existing knowledge." };
      }

      const result = storeReflectionInsights(db, insights, "manual-reflect", cfg);
      return { text: `Reflection complete:\n- Insights generated: ${insights.length}\n- New nodes stored: ${result.stored}\n- Existing nodes boosted: ${result.boosted}\n\nInsights:\n${insights.map(i => `- [${i.kind}] ${i.text} (confidence: ${i.confidence.toFixed(2)})`).join("\n")}` };
    },
  );

  api.registerTool(
    "bm_fuse",
    { description: "Trigger knowledge fusion: find and merge related nodes, add cross-community links", parameters: Type.Object({}) },
    async () => {
      if (!llm) {
        return { text: "Fusion unavailable: LLM not configured." };
      }
      if (!shouldRunFusion(db, cfg)) {
        const nodeCount = db.prepare("SELECT COUNT(*) as c FROM bm_nodes WHERE status='active'").get() as any;
        const commCount = db.prepare("SELECT COUNT(DISTINCT community_id) as c FROM bm_nodes WHERE community_id IS NOT NULL").get() as any;
        return { text: `Fusion threshold not met: need 20+ nodes and 3+ communities (currently ${nodeCount.c} nodes, ${commCount.c} communities).` };
      }

      invalidateGraphCache();
      const result = await runFusion(db, cfg, llm, embedFn ?? undefined, "manual-fuse");
      if (result.candidates.length === 0) {
        return { text: "No fusion candidates found. Knowledge graph is well-organized." };
      }
      const summary = result.candidates
        .filter(c => c.decision !== "none")
        .map(c => `- [${c.decision.toUpperCase()}] "${c.nodeA.name}" ↔ "${c.nodeB.name}" (${c.combinedScore.toFixed(2)}) ${c.reason}`)
        .join("\n");
      return { text: `Fusion complete (${result.durationMs}ms):\n- Candidates analyzed: ${result.candidates.length}\n- Merged: ${result.merged}\n- Linked: ${result.linked}\n\nDecisions:\n${summary || "No actionable decisions."}` };
    },
  );
}

// ─── Slice last turn messages ────────────────────────────────

function estimateMsgTokens(msg: any): number {
  const text = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? "");
  return Math.ceil(text.length / 3);
}

const KEEP_TURNS = 5;

function extractAssistantText(msg: any): string {
  if (typeof msg.content === "string") return msg.content;
  if (!Array.isArray(msg.content)) return "";
  return msg.content
    .filter((b: any) => b && typeof b === "object" && b.type === "text" && typeof b.text === "string")
    .map((b: any) => b.text)
    .join("\n")
    .trim();
}

function extractUserText(msg: any): string {
  let raw: string;
  if (typeof msg.content === "string") {
    raw = msg.content;
  } else if (!Array.isArray(msg.content)) {
    raw = String(msg.content ?? "");
  } else {
    raw = msg.content
      .filter((b: any) => b && typeof b === "object" && b.type === "text" && typeof b.text === "string")
      .map((b: any) => b.text)
      .join("\n")
      .trim();
  }

  const fenceEnd = raw.lastIndexOf("```");
  if (fenceEnd >= 0 && raw.includes("Sender")) {
    raw = raw.slice(fenceEnd + 3).trim();
  }
  raw = raw.replace(/^\/\w+\s+/, "").trim();
  raw = raw.replace(/^\[[\w\s\-:]+\]\s*/, "").trim();
  return raw;
}

function sliceLastTurn(
  messages: any[],
): { messages: any[]; tokens: number; dropped: number } {
  if (!messages.length) return { messages: [], tokens: 0, dropped: 0 };

  const userIndices: number[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      userIndices.push(i);
      if (userIndices.length >= KEEP_TURNS) break;
    }
  }
  if (!userIndices.length) return { messages: [], tokens: 0, dropped: messages.length };

  const lastTurnUserIdx = userIndices[0];

  // Last turn: keep full
  let lastTurnMsgs = messages.slice(lastTurnUserIdx);
  const TOOL_MAX = 6000;
  lastTurnMsgs = lastTurnMsgs.map((msg: any) => {
    if (msg.role !== "tool" && msg.role !== "toolResult") return msg;
    if (typeof msg.content !== "string") return msg;
    if (msg.content.length <= TOOL_MAX) return msg;
    const head = Math.floor(TOOL_MAX * 0.6);
    const tail = Math.floor(TOOL_MAX * 0.3);
    return { ...msg, content: msg.content.slice(0, head) + `\n...[truncated ${msg.content.length - head - tail} chars]...\n` + msg.content.slice(-tail) };
  });

  // Previous turns: user + assistant text only
  const prevTurnMsgs: any[] = [];
  if (userIndices.length > 1) {
    const earliestIdx = userIndices[userIndices.length - 1];
    for (let i = earliestIdx; i < lastTurnUserIdx; i++) {
      const msg = messages[i];
      if (!msg) continue;
      if (msg.role === "user") {
        const text = extractUserText(msg);
        if (text) prevTurnMsgs.push({ role: "user", content: text });
      } else if (msg.role === "assistant") {
        const text = extractAssistantText(msg);
        if (text) prevTurnMsgs.push({ role: "assistant", content: text });
      }
    }
  }

  const kept = [...prevTurnMsgs, ...lastTurnMsgs];
  const dropped = messages.length - kept.length;
  let tokens = 0;
  for (const msg of kept) tokens += estimateMsgTokens(msg);

  return { messages: kept, tokens, dropped };
}
