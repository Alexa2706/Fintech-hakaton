// Scripted grounded agent — the Phase-1 stand-in for the live DeepSeek
// tool-calling loop. Every answer is assembled DETERMINISTICALLY from engine
// evidence (no LLM, no network, no hallucination), and returns the SAME shape
// the real agent will (`AgentTurn`), so the UI flips to live DeepSeek by
// swapping `runAgent` for a fetch to /api/agent — no UI change.
//
// Grounding rules mirror lib/agent/system.ts (Phase 2): answer only from tool
// outputs, cite the evidence (reason code · list · policy), never decide.

import type { Engine, GEdge } from "@/lib/engine/types";

export type Intent =
  | "brief"
  | "why"
  | "trace"
  | "who"
  | "drivers"
  | "verify"
  | "sar"
  | "visualize";

export type CiteKind = "reason" | "node" | "policy" | "list";
export interface Citation {
  kind: CiteKind;
  label: string; // chip text
  ref: string; // the value (code / version / label)
  nodeId?: string; // for node citations -> highlight on the graph
}

export interface AgentTurn {
  intent?: Intent;
  text: string;
  toolsRead: string[]; // which engine tools this answer read (transparency)
  citations: Citation[];
  sar?: string; // present only for the SAR intent
  fallback?: boolean; // true when the live agent failed and we used scripted
  streaming?: boolean; // true while tokens are still arriving
}

export interface Suggestion {
  intent: Intent;
  label: string;
}

const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

// shortest tainted path (BFS), same logic the inspector uses
function taintedPath(eng: Engine, caseId: string): GEdge[] {
  const graph = eng.getPath(caseId);
  const verdict = eng.getVerdict(caseId);
  const target = graph.nodes.find((n) => n.role === "dest");
  if (!verdict.sanctionedSource || !target) return [];
  const adj = new Map<string, GEdge[]>();
  for (const e of graph.edges) {
    if (!e.tainted) continue;
    const list = adj.get(e.from) ?? [];
    list.push(e);
    adj.set(e.from, list);
  }
  const queue: { node: string; path: GEdge[] }[] = [
    { node: verdict.sanctionedSource, path: [] },
  ];
  const seen = new Set<string>([verdict.sanctionedSource]);
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur.node === target.id) return cur.path;
    for (const e of adj.get(cur.node) ?? []) {
      if (seen.has(e.to)) continue;
      seen.add(e.to);
      queue.push({ node: e.to, path: [...cur.path, e] });
    }
  }
  return [];
}

export function suggestionsFor(eng: Engine, caseId: string): Suggestion[] {
  const v = eng.getVerdict(caseId);
  const out: Suggestion[] = [];
  if (v.sanctionedSource)
    out.push({ intent: "visualize", label: "Visualize transfer" });
  out.push({ intent: "why", label: "Why REVIEW, not block?" });
  if (v.sanctionedSource) {
    out.push({ intent: "trace", label: "Trace the tainted path" });
    out.push({ intent: "who", label: "Who is the sanctioned party?" });
    out.push({ intent: "drivers", label: "What drives the taint?" });
  }
  out.push({ intent: "verify", label: "What should I verify?" });
  out.push({ intent: "sar", label: "Draft the SAR" });
  return out;
}

// crude keyword routing for free-text input (scripted; live LLM handles this natively)
export function routeText(text: string): Intent {
  const t = text.toLowerCase();
  if (/\bsar\b|report|file|filing/.test(t)) return "sar";
  if (/path|trace|route|hop|flow/.test(t)) return "trace";
  if (/who|sdn|sanction|owner|ubo|individual|party/.test(t)) return "who";
  if (/driver|reason|decompos|breakdown|contribut|lower|reduce/.test(t))
    return "drivers";
  if (/verify|check|validate|confirm|corrobor/.test(t)) return "verify";
  return "why";
}

export function runAgent(eng: Engine, caseId: string, intent: Intent): AgentTurn {
  const v = eng.getVerdict(caseId);
  const { reasons, policy } = eng.explainScore(caseId);
  const graph = eng.getPath(caseId);
  const subjNode = graph.nodes.find((n) => n.role === "dest");
  const subject = subjNode ? eng.getEntity(subjNode.id) : undefined;
  const srcNode = v.sanctionedSource
    ? graph.nodes.find((n) => n.id === v.sanctionedSource)
    : undefined;
  // the SDN name (a person controlling the sanctioned wallet) = the name-match hit
  const sdnName = graph.nodes.find(
    (n) => n.role === "san" && n.type === "person",
  );
  const sdnMatch = sdnName ? eng.getEntity(sdnName.id).stats.nameMatch : undefined;

  const listCite: Citation = { kind: "list", label: "list", ref: v.listVersion };
  const polCite: Citation = {
    kind: "policy",
    label: "policy",
    ref: v.policyVersion,
  };
  const flow = subject?.rail === "crypto" ? "value" : "ownership";
  const top = reasons[0];

  switch (intent) {
    case "brief": {
      // crypto only: a name (person) controlling a SEPARATE sanctioned wallet =
      // two distinct detections. On fiat the sanctioned source IS the person.
      const sepName =
        sdnName && srcNode && sdnName.id !== srcNode.id ? sdnName : undefined;
      return {
        intent,
        text: `About ${fmtPct(v.taint)} of the money reaching ${subject?.label ?? "the subject"} traces back to a sanctioned source, ${v.hops} step${v.hops === 1 ? "" : "s"} away. That's the grey zone — too much to wave through, not enough to auto-block — so it's your call.${sepName ? ` The wallet's owner, ${sepName.label}, is also on the sanctions list.` : ""}`,
        toolsRead: ["get_verdict", "explain_score", "get_path", "get_entity"],
        citations: [
          ...(top ? [{ kind: "reason" as const, label: "reason", ref: top.code }] : []),
          ...(sepName
            ? [{ kind: "node" as const, label: "name", ref: sepName.label, nodeId: sepName.id }]
            : []),
          ...(srcNode
            ? [{ kind: "node" as const, label: "source", ref: srcNode.label, nodeId: srcNode.id }]
            : []),
          listCite,
          polCite,
        ],
      };
    }

    case "why":
      return {
        intent,
        text: `The engine only auto-blocks above ${fmtPct(policy.blockAt)} sanctioned money, and auto-releases below ${fmtPct(policy.reviewAt)}. This one's at ${fmtPct(v.taint)} — in between — so a person decides, not the machine.`,
        toolsRead: ["get_verdict", "explain_score"],
        citations: [
          polCite,
          ...reasons.map((r) => ({ kind: "reason" as const, label: "reason", ref: r.code })),
        ],
      };

    case "trace": {
      const path = taintedPath(eng, caseId);
      const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
      const steps = path
        .map((e) => `${nodeById.get(e.from)?.label} —${e.label}→ ${nodeById.get(e.to)?.label}`)
        .join("; ");
      return {
        intent,
        text: `Here's the path the flagged money took: ${steps || "no traced path"}. Every step moved money that started at a sanctioned source.`,
        toolsRead: ["get_path"],
        citations: path.flatMap((e) => {
          const n = nodeById.get(e.to);
          return n ? [{ kind: "node" as const, label: n.role === "dest" ? "subject" : "hop", ref: n.label, nodeId: n.id }] : [];
        }),
      };
    }

    case "who": {
      const target = sdnName ?? srcNode;
      if (!target)
        return {
          intent,
          text: "There's no sanctioned source on this case — the exposure doesn't reach a listed party.",
          toolsRead: ["get_path"],
          citations: [],
        };
      const e = eng.getEntity(target.id);
      const match = e.stats.nameMatch && e.stats.nameMatch !== "no hit";
      const wallet = sdnName && srcNode && srcNode.id !== sdnName.id ? srcNode : undefined;
      return {
        intent,
        text: `${e.label} is flagged on the sanctions list we screen against${match ? ` (name match ${e.stats.nameMatch})` : ""}.${wallet ? ` They control ${wallet.label}, where the flagged money starts.` : ""} I only know them as a hit on this list — nothing about who they are in real life.`,
        toolsRead: ["get_entity", "get_path"],
        citations: [
          { kind: "node", label: "name", ref: e.label, nodeId: target.id },
          ...(wallet ? [{ kind: "node" as const, label: "wallet", ref: wallet.label, nodeId: wallet.id }] : []),
          listCite,
        ],
      };
    }

    case "drivers": {
      const decomp = reasons.map((r) => `${r.code} ${fmtPct(r.weight)}`).join(", ");
      const after = top ? v.taint - top.weight : v.taint;
      const verdictAfter =
        after < policy.reviewAt ? "below the review line" : "still inside review";
      return {
        intent,
        text: `The ${fmtPct(v.taint)} is made up of: ${decomp}. The biggest piece is ${top?.code ?? "—"} (${top ? fmtPct(top.weight) : "—"}) — without it the case would drop to ${fmtPct(Math.max(0, after))}, ${verdictAfter}.`,
        toolsRead: ["explain_score"],
        citations: reasons.map((r) => ({ kind: "reason" as const, label: "reason", ref: r.code })),
      };
    }

    case "verify": {
      const pts = reasons.slice(0, 2).map((r) => `${r.code}: ${r.detail}`).join(" • ");
      return {
        intent,
        text: `Two things to confirm before you decide: ${pts}. Then check the path from ${srcNode?.label ?? "the source"} to ${subject?.label ?? "the subject"} still holds. You're double-checking the engine, not starting over.`,
        toolsRead: ["explain_score", "get_path"],
        citations: [
          ...reasons.slice(0, 2).map((r) => ({ kind: "reason" as const, label: "reason", ref: r.code })),
          ...(srcNode ? [{ kind: "node" as const, label: "source", ref: srcNode.label, nodeId: srcNode.id }] : []),
        ],
      };
    }

    case "sar":
      return {
        intent,
        text: "Drafted from this case's evidence only — labeled DRAFT, no outside knowledge. Review and edit before filing.",
        toolsRead: ["draft_sar"],
        citations: [listCite, polCite],
        sar: eng.draftSar(caseId),
      };

    case "visualize": {
      const path = taintedPath(eng, caseId);
      const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
      const seq = [srcNode, ...path.map((e) => nodeById.get(e.to))].filter(
        (n): n is NonNullable<typeof n> => Boolean(n),
      );
      const names = seq.map((n) => n.label);
      return {
        intent,
        text: `Watch the canvas — I'll light up the path the flagged money took, step by step: ${names.join(" → ")}.`,
        toolsRead: ["get_path"],
        citations: seq.map((n) => ({
          kind: "node" as const,
          label:
            n.role === "san" ? "source" : n.role === "dest" ? "subject" : "hop",
          ref: n.label,
          nodeId: n.id,
        })),
      };
    }
  }
}
