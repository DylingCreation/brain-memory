/**
 * brain-memory — Context assembly for system prompt injection
 *
 * Merged from graph-memory assemble.ts.
 * Authors: adoresever (graph-memory), brain-memory contributors
 */

import { type DatabaseSyncInstance } from "@photostructure/sqlite";
import type { BmNode, BmEdge } from "../types";
import { getCommunitySummary, getEpisodicMessages } from "../store/store";
import { escapeXml } from "../utils/xml";

const CHARS_PER_TOKEN = 3;

export function buildSystemPromptAddition(params: {
  selectedNodes: Array<{ type: string; src: "active" | "recalled" }>;
  edgeCount: number;
}): string {
  if (params.selectedNodes.length === 0) return "";

  const recalledCount = params.selectedNodes.filter(n => n.src === "recalled").length;
  const skillCount = params.selectedNodes.filter(n => n.type === "SKILL").length;
  const eventCount = params.selectedNodes.filter(n => n.type === "EVENT").length;
  const taskCount = params.selectedNodes.filter(n => n.type === "TASK").length;

  const lines: string[] = [
    "## Brain Memory — 统一记忆引擎",
    "",
    "Below `<knowledge_graph>` is structured knowledge from past conversations.",
    `Current graph: ${skillCount} skills, ${eventCount} events, ${taskCount} tasks, ${params.edgeCount} relationships.`,
  ];

  if (recalledCount > 0) {
    lines.push(
      "",
      `**${recalledCount} nodes recalled from OTHER conversations** — proven solutions that worked before.`,
      "Apply them directly when the current situation matches their trigger conditions.",
    );
  }

  lines.push(
    "",
    "## Recalled context for this query",
    "",
    "- **`<episodic_context>`** — Original conversation traces from sessions that produced the knowledge nodes.",
    "- **`<knowledge_graph>`** — Relevant triples (TASK/SKILL/EVENT) and edges, grouped by community.",
    "",
    "Read this context first. Use `bm_search` only if insufficient. Use `bm_record` to save new knowledge.",
  );

  return lines.join("\n");
}

export function assembleContext(
  db: DatabaseSyncInstance,
  params: {
    tokenBudget: number;
    recallStrategy: "full" | "summary" | "adaptive" | "off";
    activeNodes: BmNode[];
    activeEdges: BmEdge[];
    recalledNodes: BmNode[];
    recalledEdges: BmEdge[];
  },
): { xml: string | null; systemPrompt: string; tokens: number; episodicXml: string; episodicTokens: number } {
  const map = new Map<string, BmNode & { src: "active" | "recalled" }>();
  for (const n of params.recalledNodes) map.set(n.id, { ...n, src: "recalled" });
  for (const n of params.activeNodes) map.set(n.id, { ...n, src: "active" });

  const TYPE_PRI: Record<string, number> = { SKILL: 3, TASK: 2, EVENT: 1 };
  const sorted = Array.from(map.values())
    .filter(n => n.status === "active")
    .sort((a, b) =>
      (a.src === b.src ? 0 : a.src === "active" ? -1 : 1) ||
      (TYPE_PRI[b.type] ?? 0) - (TYPE_PRI[a.type] ?? 0) ||
      b.validatedCount - a.validatedCount ||
      b.pagerank - a.pagerank
    );

  // Enforce token budget: truncate nodes that exceed the limit.
  // A budget of 0 means no limit (return all nodes).
  const selected: typeof sorted = [];
  if (params.tokenBudget > 0) {
    let usedTokens = 0;
    const budget = params.tokenBudget;
    for (const n of sorted) {
      const nodeTokens = Math.ceil(
        (n.name.length + n.description.length + n.content.length) / CHARS_PER_TOKEN,
      );
      if (usedTokens + nodeTokens > budget && selected.length > 0) break;
      selected.push(n);
      usedTokens += nodeTokens;
    }
  } else {
    selected.push(...sorted);
  }
  if (!selected.length) return { xml: null, systemPrompt: "", tokens: 0, episodicXml: "", episodicTokens: 0 };

  const idToName = new Map<string, string>();
  for (const n of selected) idToName.set(n.id, n.name);

  const selectedIds = new Set(selected.map(n => n.id));
  const allEdges = [...params.activeEdges, ...params.recalledEdges];
  const seen = new Set<string>();
  const edges = allEdges.filter(e =>
    selectedIds.has(e.fromId) && selectedIds.has(e.toId) && !seen.has(e.id) && seen.add(e.id)
  );

  // Group by community
  const byCommunity = new Map<string, typeof selected>();
  const noCommunity: typeof selected = [];
  for (const n of selected) {
    if (n.communityId) {
      if (!byCommunity.has(n.communityId)) byCommunity.set(n.communityId, []);
      byCommunity.get(n.communityId)!.push(n);
    } else {
      noCommunity.push(n);
    }
  }

  const xmlParts: string[] = [];
  for (const [cid, members] of byCommunity) {
    const summary = getCommunitySummary(db, cid);
    const label = summary ? escapeXml(summary.summary) : cid;
    xmlParts.push(`  <community id="${cid}" desc="${label}">`);
    for (const n of members) {
      const tag = n.type.toLowerCase();
      const srcAttr = n.src === "recalled" ? ` source="recalled"` : "";
      const timeAttr = ` updated="${new Date(n.updatedAt).toISOString().slice(0, 10)}"`;
      xmlParts.push(`    <${tag} name="${n.name}" desc="${escapeXml(n.description)}"${srcAttr}${timeAttr}>\n${n.content.trim()}\n    </${tag}>`);
    }
    xmlParts.push(`  </community>`);
  }

  for (const n of noCommunity) {
    const tag = n.type.toLowerCase();
    const srcAttr = n.src === "recalled" ? ` source="recalled"` : "";
    const timeAttr = ` updated="${new Date(n.updatedAt).toISOString().slice(0, 10)}"`;
    xmlParts.push(`  <${tag} name="${n.name}" desc="${escapeXml(n.description)}"${srcAttr}${timeAttr}>\n${n.content.trim()}\n  </${tag}>`);
  }

  const nodesXml = xmlParts.join("\n");
  const edgesXml = edges.length
    ? `\n  <edges>\n${edges.map(e => {
        const fromName = idToName.get(e.fromId) ?? e.fromId;
        const toName = idToName.get(e.toId) ?? e.toId;
        const cond = e.condition ? ` when="${escapeXml(e.condition)}"` : "";
        return `    <e type="${e.type}" from="${fromName}" to="${toName}"${cond}>${escapeXml(e.instruction)}</e>`;
      }).join("\n")}\n  </edges>`
    : "";

  let xml = `<knowledge_graph>\n${nodesXml}${edgesXml}\n</knowledge_graph>`;

  // recallStrategy controls how recalled nodes are presented:
  // "full"     → inject complete XML (name + desc + content)
  // "summary"  → inject only name + description (no content)
  // "adaptive" → full if ≤6 nodes, otherwise summary to save tokens
  // "off"      → skip injection entirely
  if (params.recallStrategy === "summary") {
    xml = `<knowledge_graph>\n${selected.map(n => {
      const tag = n.type.toLowerCase();
      const srcAttr = n.src === "recalled" ? ` source="recalled"` : "";
      return `  <${tag} name="${n.name}" desc="${escapeXml(n.description)}"${srcAttr}/>`;
    }).join("\n")}${edgesXml}\n</knowledge_graph>`;
  } else if (params.recallStrategy === "adaptive" && selected.length > 6) {
    xml = `<knowledge_graph>\n${selected.map(n => {
      const tag = n.type.toLowerCase();
      const srcAttr = n.src === "recalled" ? ` source="recalled"` : "";
      return `  <${tag} name="${n.name}" desc="${escapeXml(n.description)}"${srcAttr}/>`;
    }).join("\n")}${edgesXml}\n</knowledge_graph>`;
  } else if (params.recallStrategy === "off") {
    // recallStrategy "off": skip everything
    return { xml: null, systemPrompt: "", tokens: 0, episodicXml: "", episodicTokens: 0 };
  }

  // recallStrategy "off": skip everything
  if (!xml) return { xml: null, systemPrompt: "", tokens: 0, episodicXml: "", episodicTokens: 0 };

  const systemPrompt = buildSystemPromptAddition({
    selectedNodes: selected.map(n => ({ type: n.type, src: n.src })),
    edgeCount: edges.length,
  });

  // Episodic traces: top 3 nodes → pull original conversation
  const topNodes = selected.slice(0, 3);
  const episodicParts: string[] = [];
  for (const node of topNodes) {
    if (!node.sourceSessions?.length) continue;
    const recentSessions = node.sourceSessions.slice(-2);
    const msgs = getEpisodicMessages(db, recentSessions, node.updatedAt, 500);
    if (!msgs.length) continue;
    const lines = msgs.map(m =>
      `    [${m.role.toUpperCase()}] ${escapeXml(m.text.slice(0, 200))}`
    ).join("\n");
    episodicParts.push(`  <trace node="${node.name}">\n${lines}\n  </trace>`);
  }

  const episodicXml = episodicParts.length
    ? `<episodic_context>\n${episodicParts.join("\n")}\n</episodic_context>`
    : "";

  const fullContent = systemPrompt + "\n\n" + (xml || "") + ((episodicXml && episodicXml.length > 0) ? "\n\n" + episodicXml : "");
  return {
    xml,
    systemPrompt,
    tokens: Math.ceil(fullContent.length / CHARS_PER_TOKEN),
    episodicXml,
    episodicTokens: Math.ceil(episodicXml.length / CHARS_PER_TOKEN),
  };
}

// escapeXml imported from ../utils/xml.ts
