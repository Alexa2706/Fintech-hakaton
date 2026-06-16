// The bridge: Python engine response  ->  UI-ready ScreenedCase (engine
// contract). Also a deterministic offline mock-synth so the demo survives the
// Python service being down. Both produce the SAME ScreenedCase shape; the mock
// just builds a fake LiveScreenResponse and runs it through the same mapper.

import type {
  Corner,
  CornerSignal,
  DecisionPolicy,
  EntityProfile,
  Exposure,
  ExposureCategory,
  ExposureSlice,
  GNode,
  GNodeType,
  Outcome,
  Rail,
  Reason,
  Verdict,
} from "@/lib/engine/types";
import type {
  LiveCorner,
  LiveExposureSlice,
  LiveNode,
  LiveScreenResponse,
  ScreenedCase,
  ScreenPayload,
} from "./types";
import { layoutGraph, type LayoutEdgeInput, type LayoutNodeInput } from "./layout";

const REVIEW_AT = 0.4;
const BLOCK_AT = 0.85;

const CORNER_LABEL: Record<string, string> = {
  originator_identity: "Originator identity",
  source_funds: "Source of funds",
  beneficiary_identity: "Beneficiary identity",
  destination: "Destination",
};

// ── small formatters ───────────────────────────────────────────────────────
function prettifyId(id: string): string {
  // 0xHIGH_TAINT -> "High Taint"; c_3278 / p_0 -> left as-is upstream (those
  // arrive with real labels). Real 0x-addresses stay truncated by the canvas.
  const body = id.replace(/^0x/i, "");
  if (/^[0-9a-f]{12,}$/i.test(body)) return id; // real hash address
  return body
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function mapType(type: string, category: string): GNodeType {
  if (category === "mixer") return "mixer";
  switch (type) {
    case "individual":
    case "person":
      return "person";
    case "company":
      return "company";
    case "bank":
      return "bank";
    case "exchange":
      return "exchange";
    default:
      return "wallet";
  }
}

function asExposureCategory(c: string): ExposureCategory {
  const known: ExposureCategory[] = [
    "sanctioned",
    "mixer",
    "darknet",
    "high-risk",
    "exchange",
    "clean",
  ];
  return (known as string[]).includes(c) ? (c as ExposureCategory) : "clean";
}

function signalOf(s: string): CornerSignal {
  if (s === "flagged" || s === "review" || s === "low" || s === "clean")
    return s;
  return "clean";
}

function cornerDetail(c: LiveCorner): string {
  const ev = c.evidence ?? {};
  if (ev.matched_entity) {
    const fields = Array.isArray(ev.fields_matched)
      ? ` on ${(ev.fields_matched as string[]).join(", ")}`
      : "";
    return `Name match to ${ev.matched_entity}${fields} (${Math.round(
      (Number(ev.name_score) || c.score) * 100,
    )}%).`;
  }
  if (ev.wallet_hit) return "Wallet on the sanctions list.";
  if (ev.path) {
    const hops = Number(ev.hops ?? (ev.path as string[]).length - 1);
    const mixer = ev.mixer_detected ? ", mixer in path" : "";
    return `${Math.round(c.score * 100)}% of value traces to a sanctioned source over ${hops} hop${hops === 1 ? "" : "s"}${mixer}.`;
  }
  return "No exposure on this corner.";
}

// ── the mapper ─────────────────────────────────────────────────────────────
export function mapLiveResponse(
  resp: LiveScreenResponse,
  via: "live" | "mock",
): ScreenedCase {
  const lv = resp.verdict;
  const outcome = lv.verdict as Outcome;
  const rail = resp.request.rail as Rail;

  const maxCorner = lv.corners.reduce((m, c) => Math.max(m, c.score), 0);
  // align the marker with the verdict: fuse can decide REVIEW/MATCH off the
  // peak corner while reporting a lower blended score. taint = effective score.
  const taint = Math.min(1, Math.max(lv.score, maxCorner));

  const hops = lv.corners.reduce((m, c) => {
    const h = Number((c.evidence as { hops?: number })?.hops ?? 0);
    return Math.max(m, h);
  }, 0);

  // contract corners (always 4) + reasons (the non-clean ones)
  const corners: Corner[] = lv.corners.map((c) => ({
    key: c.corner,
    label: CORNER_LABEL[c.corner] ?? c.corner,
    signal: signalOf(c.signal),
    score: c.score,
    detail: cornerDetail(c),
  }));
  const reasons: Reason[] = lv.corners
    .filter((c) => c.score > 0.02)
    .sort((a, b) => b.score - a.score)
    .map((c) => ({
      code: c.corner.toUpperCase(),
      detail: cornerDetail(c),
      weight: c.score,
    }));
  if (reasons.length === 0)
    reasons.push({
      code: "NO_EXPOSURE",
      detail: "No corner reached a sanctioned source. Released.",
      weight: 0,
    });

  const auditHex = lv.audit_id.replace(/^aud_/, "");
  const decisionHash = `sha256:${auditHex.slice(0, 4)}…${auditHex.slice(-4) || "0000"}`;

  const verdict: Verdict = {
    caseId: lv.request_id,
    outcome,
    taint,
    reasons,
    hops,
    sanctionedSource: resp.sanctioned_source ?? undefined,
    listVersion: lv.list_version,
    policyVersion: resp.policyVersion,
    decisionHash,
    corners,
  };

  // ── graph: assign roles, prettify labels, lay out ─────────────────────────
  const subjectId = resp.subject_id ?? resp.subgraph.nodes[0]?.id ?? "";
  const taintedTo = new Set<string>();
  for (const e of resp.subgraph.edges)
    if (e.tainted) {
      taintedTo.add(e.src);
      taintedTo.add(e.dst);
    }

  const layoutNodes: LayoutNodeInput[] = resp.subgraph.nodes.map((n) => {
    const role: GNode["role"] = n.sanctioned
      ? "san"
      : n.id === subjectId
        ? "dest"
        : taintedTo.has(n.id)
          ? "mid"
          : "clean";
    const label =
      n.label && n.label !== n.id ? n.label : prettifyId(n.id);
    return { id: n.id, label, role, type: mapType(n.type, n.category) };
  });
  const layoutEdges: LayoutEdgeInput[] = resp.subgraph.edges.map((e) => ({
    from: e.src,
    to: e.dst,
    label: edgeLabel(e, resp.request.asset, resp.request.currency),
    tainted: e.tainted,
    kind:
      e.kind === "owner" || e.kind === "ownership"
        ? "ownership"
        : "transaction",
  }));
  const graph = layoutGraph(layoutNodes, layoutEdges);

  // ── per-node profiles + exposure ──────────────────────────────────────────
  const profiles: EntityProfile[] = resp.subgraph.nodes.map((n) => {
    const label = n.label && n.label !== n.id ? n.label : prettifyId(n.id);
    return {
      id: n.id,
      label,
      rail,
      category: n.category,
      rootRef: n.id,
      sanctioned: n.sanctioned,
      stats: nodeStats(n, n.id === subjectId, taint),
    };
  });

  const exposures = resp.subgraph.nodes.map((n) => ({
    node: n.id,
    exposure: nodeExposure(n, n.id === subjectId, taint),
  }));

  // ── policy, summary, sar ──────────────────────────────────────────────────
  const policy: DecisionPolicy = {
    version: resp.policyVersion,
    reviewAt: REVIEW_AT,
    blockAt: BLOCK_AT,
    rationale:
      "Block at >=85% sanctioned taint; route 40-85% to human review; release below 40%.",
  };

  const party =
    resp.request.beneficiary.name ||
    resp.request.originator.name ||
    layoutNodes.find((n) => n.role === "dest")?.label ||
    "Live screening";
  const amount = formatAmount(
    resp.request.amount,
    resp.request.asset,
    resp.request.currency,
  );

  const verdictTime = (lv.timestamp || "").replace("T", " ").slice(0, 16);
  const corridor = scenarioCorridor(resp.request.scenario);

  return {
    summary: { id: lv.request_id, party, rail, amount, outcome },
    corridor,
    time: verdictTime ? `${verdictTime} UTC` : "live",
    verdict,
    graph,
    profiles,
    exposures,
    policy,
    sar: draftSar(party, amount, corridor, verdict, corners),
    subjectId,
    via,
  };
}

// ── helpers for figures / stats / exposure ─────────────────────────────────
function edgeLabel(
  e: { value: number | null; kind: string; label_override?: string },
  asset: string | null,
  currency: string | null,
): string {
  if (e.label_override) return e.label_override;
  if (e.value == null) return "";
  if (e.kind === "owner" || e.kind === "ownership")
    return `${Math.round(e.value * 100)}%`;
  const unit = asset || currency || "";
  return `${e.value} ${unit}`.trim();
}

function formatAmount(
  amount: string,
  asset: string | null,
  currency: string | null,
): string {
  const n = Number(amount);
  const num = Number.isFinite(n) ? n.toLocaleString("en-US") : amount;
  if (asset) return `${num} ${asset}`;
  if (currency) return `${currency} ${num}`;
  return num;
}

function scenarioCorridor(s: string): string {
  if (s === "on_ramp") return "Fiat → Crypto (on-ramp)";
  if (s === "off_ramp") return "Crypto → Fiat (off-ramp)";
  return "Fiat → Fiat";
}

// Engine-provided stats win (the non-mock path); otherwise synth a minimal grid
// so the cell isn't empty. When the real engine populates LiveNode.stats this is
// served verbatim into the inspector's stats grid.
function nodeStats(
  n: LiveNode,
  isSubject: boolean,
  taint: number,
): Record<string, string> {
  if (n.stats && Object.keys(n.stats).length > 0) return n.stats;
  const stats: Record<string, string> = { category: n.category, type: n.type };
  if (isSubject) stats.taint = `${(taint * 100).toFixed(1)}%`;
  return stats;
}

function riskOf(category: ExposureCategory): "high" | "medium" | "low" {
  return category === "sanctioned" ||
    category === "mixer" ||
    category === "darknet" ||
    category === "high-risk"
    ? "high"
    : "low";
}

function mapSlices(slices: LiveExposureSlice[]): ExposureSlice[] {
  return slices.map((s) => {
    const category = asExposureCategory(s.category);
    return { category, pct: s.pct, risk: s.risk ?? riskOf(category) };
  });
}

// Engine-provided per-node breakdown wins (the non-mock path); otherwise synth
// from the verdict so the bars still render. Real engine -> real exposure bars.
function nodeExposure(n: LiveNode, isSubject: boolean, taint: number): Exposure {
  const clean: ExposureSlice[] = [{ category: "clean", pct: 100, risk: "low" }];
  if (n.exposure?.receiving?.length || n.exposure?.sending?.length) {
    return {
      receiving: n.exposure.receiving?.length
        ? mapSlices(n.exposure.receiving)
        : clean,
      sending: n.exposure.sending?.length ? mapSlices(n.exposure.sending) : clean,
    };
  }
  // ── synth fallback (engine returned no per-node breakdown) ──
  if (n.sanctioned)
    return {
      receiving: [{ category: "sanctioned", pct: 100, risk: "high" }],
      sending: [{ category: "sanctioned", pct: 100, risk: "high" }],
    };
  if (isSubject && taint > 0.01) {
    const tainted = Math.round(taint * 100);
    const cat = asExposureCategory(
      n.category === "clean" ? "sanctioned" : n.category,
    );
    return {
      receiving: [
        { category: cat, pct: tainted, risk: "high" },
        { category: "clean", pct: 100 - tainted, risk: "low" },
      ],
      sending: clean,
    };
  }
  return { receiving: clean, sending: clean };
}

function draftSar(
  party: string,
  amount: string,
  corridor: string,
  verdict: Verdict,
  corners: Corner[],
): string {
  const fired = corners.filter((c) => c.signal === "flagged" || c.signal === "review");
  const lines = [
    `DRAFT — Suspicious Activity Report`,
    `Subject: ${party}`,
    `Transaction: ${amount} · ${corridor}`,
    `Engine verdict: ${verdict.outcome} (taint ${(verdict.taint * 100).toFixed(1)}%, ${verdict.hops} hops).`,
    ``,
    `Basis:`,
    ...(fired.length
      ? fired.map((c) => `- ${c.label}: ${c.detail}`)
      : ["- No corner reached a sanctioned source."]),
    ``,
    `List ${verdict.listVersion} · policy ${verdict.policyVersion} · ${verdict.decisionHash}.`,
    `This draft is machine-assembled from engine evidence only and requires analyst validation.`,
  ];
  return lines.join("\n");
}

// ── offline mock-synth (no Python) ─────────────────────────────────────────
const BAD_WALLET = /sanc|tornado|darkflow|ofac|blocked/i;
const REVIEW_WALLET = /high_taint|high-taint|mixer|fwd_exposed|demo_subject/i;
const BAD_NAME = /dark\s*flow|petrov|kozlov|tornado|al[- ]?rash/i;

export function screenMock(payload: ScreenPayload): ScreenedCase {
  const resp = synthResponse(payload);
  return mapLiveResponse(resp, "mock");
}

function synthResponse(p: ScreenPayload): LiveScreenResponse {
  const rail: "crypto" | "fiat" = p.scenario === "fiat" ? "fiat" : "crypto";
  const wallet =
    p.scenario === "off_ramp" ? p.originator.wallet : p.beneficiary.wallet;
  const name = p.beneficiary.name || p.originator.name || "";

  let outcome: "MATCH" | "REVIEW" | "NO_MATCH" = "NO_MATCH";
  let score = 0.0;
  if ((wallet && BAD_WALLET.test(wallet)) || (name && BAD_NAME.test(name))) {
    outcome = "MATCH";
    score = 1.0;
  } else if (wallet && REVIEW_WALLET.test(wallet)) {
    outcome = "REVIEW";
    score = 0.62;
  }

  const subjectId =
    wallet || p.ownershipNode || "party_benef";
  const sanctionedId = "san_source";
  const nodes = [];
  const edges = [];
  if (outcome !== "NO_MATCH") {
    nodes.push({
      id: sanctionedId,
      label: "Sanctioned source",
      type: rail === "fiat" ? "company" : "address",
      sanctioned: true,
      category: "sanctioned",
    });
  }
  nodes.push({
    id: subjectId,
    label: name || subjectId,
    type: rail === "fiat" ? "company" : "address",
    sanctioned: false,
    category: outcome === "NO_MATCH" ? "clean" : "high-risk",
  });
  if (outcome !== "NO_MATCH") {
    edges.push({
      src: sanctionedId,
      dst: subjectId,
      value: null,
      kind: "transaction",
      tainted: true,
      label_override: rail === "fiat" ? `${Math.round(score * 100)}%` : "traced",
    });
  }

  const mkCorner = (corner: string, s: number, ev: Record<string, unknown>): LiveCorner => ({
    corner,
    signal: s >= 0.85 ? "flagged" : s >= 0.4 ? "review" : s > 0.1 ? "low" : "clean",
    score: s,
    evidence: ev,
  });
  const traceEv =
    outcome === "NO_MATCH"
      ? {}
      : { graph: rail === "fiat" ? "ownership" : "crypto", path: [subjectId, sanctionedId], hops: 1, taint_pct: score };

  return {
    verdict: {
      request_id:
        p.requestId ||
        `LIVE-MOCK-${(wallet || name || "X").slice(-4).toUpperCase().replace(/[^A-Z0-9]/g, "0")}`,
      verdict: outcome,
      score,
      corners: [
        mkCorner("originator_identity", 0, {}),
        mkCorner("source_funds", rail === "crypto" && p.scenario === "off_ramp" ? score : 0, p.scenario === "off_ramp" ? traceEv : {}),
        mkCorner("beneficiary_identity", name && BAD_NAME.test(name) ? score : 0, name && BAD_NAME.test(name) ? { matched_entity: "Sanctioned entity", name_score: score, fields_matched: ["name"] } : {}),
        mkCorner("destination", rail === "fiat" || p.scenario === "on_ramp" ? score : 0, rail === "fiat" || p.scenario === "on_ramp" ? traceEv : {}),
      ],
      list_version: "OFAC-SDN-2026-06-14",
      audit_id: "aud_offline00",
      explanation: outcome === "NO_MATCH" ? "All corners clean." : `${outcome} (offline mock).`,
      timestamp: "2026-06-14T00:00:00+00:00",
    },
    policyVersion: "POL-real-v1",
    subject_id: subjectId,
    sanctioned_source: outcome === "NO_MATCH" ? null : sanctionedId,
    ownership_node: p.ownershipNode ?? null,
    subgraph: { nodes, edges },
    request: {
      scenario: p.scenario,
      rail,
      amount: p.amount ?? "0",
      asset: p.asset ?? null,
      currency: p.currency ?? null,
      originator: p.originator,
      beneficiary: p.beneficiary,
    },
  };
}
