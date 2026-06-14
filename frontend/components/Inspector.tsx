"use client";

import { useMemo } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import type {
  Corner,
  Engine,
  ExposureCategory,
  GEdge,
  GNode,
  GraphData,
} from "@/lib/engine/types";
import { cn, truncMid } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import {
  ACTION_STYLE,
  Bar,
  CAT_DOT,
  RISK_DOT,
  SectionLabel,
  type Decision,
  type ReviewAction,
} from "./shared";
import { PolicyRuler } from "./PolicyRuler";
import { ExposureBars } from "./ExposureBars";
import { Histogram } from "./Histogram";
import { AgentHandover } from "./AgentHandover";

function humanize(k: string): string {
  return k
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

// shortest tainted path (BFS) from the sanctioned source to the subject node
function taintedPath(graph: GraphData, source: string): GEdge[] {
  const target = graph.nodes.find((n) => n.role === "dest");
  if (!target) return [];
  const adj = new Map<string, GEdge[]>();
  for (const e of graph.edges) {
    if (!e.tainted) continue;
    const list = adj.get(e.from) ?? [];
    list.push(e);
    adj.set(e.from, list);
  }
  const queue: { node: string; path: GEdge[] }[] = [{ node: source, path: [] }];
  const seen = new Set<string>([source]);
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

function StatsGrid({ stats }: { stats: Record<string, string> }) {
  const entries = Object.entries(stats);
  if (entries.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-b border-hairline p-4">
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between gap-2">
          <span className="shrink-0 truncate text-[11px] text-muted">
            {humanize(k)}
          </span>
          <span className="truncate text-right font-mono text-[12px] tnum text-text">
            {v}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Inspector({
  eng,
  caseId,
  focusNodeId,
  onOpenAgent,
  decision,
  onDecide,
}: {
  eng: Engine;
  caseId: string;
  focusNodeId: string;
  onOpenAgent: () => void;
  decision?: Decision;
  onDecide: (action: ReviewAction, via: "agent" | "analyst") => void;
}) {
  const verdict = eng.getVerdict(caseId);
  const { reasons, policy } = eng.explainScore(caseId);
  const graph = eng.getPath(caseId);
  const entity = eng.getEntity(focusNodeId);
  const exposure = eng.getExposure(focusNodeId);

  const nodeById = useMemo(() => {
    const m = new Map<string, GNode>();
    for (const n of graph.nodes) m.set(n.id, n);
    return m;
  }, [graph]);

  const path = verdict.sanctionedSource
    ? taintedPath(graph, verdict.sanctionedSource)
    : [];

  const incident = graph.edges.filter(
    (e) => e.from === focusNodeId || e.to === focusNodeId,
  );

  const maxWeight = reasons.reduce((m, r) => Math.max(m, r.weight), 0);
  const catDot = CAT_DOT[entity.category as ExposureCategory];

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-surface">
      {/* identity */}
      <div className="flex items-start justify-between gap-2 border-b border-hairline p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {catDot && (
              <span className={cn("size-2 shrink-0", catDot)} aria-hidden />
            )}
            <h2 className="truncate text-[15px] font-medium text-text">
              {entity.label}
            </h2>
          </div>
          <div className="mt-1 flex items-center gap-2 font-mono text-[11px] text-faint">
            <span className="capitalize text-muted">{entity.category}</span>
            <span>·</span>
            <span title={entity.rootRef}>{truncMid(entity.rootRef, 8, 5)}</span>
            <span>·</span>
            <span className="uppercase">{entity.rail}</span>
          </div>
        </div>
        {entity.sanctioned ? (
          <span className="shrink-0 border border-risk-high/40 bg-risk-high-wash px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-risk-high">
            Sanctioned
          </span>
        ) : (
          <span className="shrink-0 border border-hairline px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-faint">
            Cleared
          </span>
        )}
      </div>

      {/* verdict + policy ruler + audit (always present) */}
      <div className="border-b border-hairline p-4">
        <PolicyRuler verdict={verdict} policy={policy} />
      </div>

      {/* agent handover — ONLY on REVIEW (the human-in-the-loop case).
          MATCH/NO_MATCH are decided by the engine; the agent stays out. */}
      {verdict.outcome === "REVIEW" ? (
        <div className="flex flex-col gap-3 border-b border-hairline p-4">
          <AgentHandover
            eng={eng}
            caseId={caseId}
            focusNodeId={focusNodeId}
            onAsk={onOpenAgent}
            decision={decision}
            onDecide={onDecide}
          />
          {decision && (
            <div className="flex flex-wrap items-center gap-2 border-l-2 border-l-line-strong pl-2.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-faint">
                Disposition
              </span>
              <span
                className={cn(
                  "border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em]",
                  ACTION_STYLE[decision.action].solid,
                )}
              >
                {decision.action}
              </span>
              <span className="font-mono text-[10px] text-faint">
                {decision.at} · via {decision.via} · {verdict.decisionHash}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 border-b border-hairline px-4 py-2.5">
          <CheckCircle2 className="size-3.5 shrink-0 stroke-[1.5] text-risk-low" />
          <span className="text-[12px] text-muted">
            Engine auto-decided — no analyst review required.
          </span>
        </div>
      )}

      {/* stats */}
      <StatsGrid stats={entity.stats} />

      {/* tabs */}
      <Tabs defaultValue="overview" className="flex flex-col">
        <TabsList className="sticky top-0 z-10 px-2">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="path">Path</TabsTrigger>
          <TabsTrigger value="counterparties">Counterparties</TabsTrigger>
          <TabsTrigger value="exposure">Exposure</TabsTrigger>
        </TabsList>

        {/* OVERVIEW: four-corner decomposition + reasons + faceted histogram */}
        <TabsContent value="overview" className="flex flex-col">
          {verdict.corners && verdict.corners.length > 0 && (
            <div className="flex flex-col gap-2 border-b border-hairline p-4">
              <SectionLabel>Four-corner decomposition</SectionLabel>
              <CornerPanel corners={verdict.corners} />
            </div>
          )}
          <div className="flex flex-col gap-2.5 border-b border-hairline p-4">
            <SectionLabel>Decision reasons</SectionLabel>
            {reasons.map((r) => (
              <div key={r.code} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-[11px] text-accent">
                    {r.code}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] tnum text-muted">
                    {(r.weight * 100).toFixed(1)}%
                  </span>
                </div>
                <Bar value={r.weight} max={maxWeight} />
                <p className="text-[12px] leading-snug text-muted">{r.detail}</p>
              </div>
            ))}
          </div>
          <div className="p-4 pt-2">
            <Histogram eng={eng} nodes={graph.nodes} />
          </div>
        </TabsContent>

        {/* PATH: traced tainted route */}
        <TabsContent value="path" className="p-4">
          {path.length === 0 ? (
            <div className="flex flex-col gap-1">
              <SectionLabel>Trace</SectionLabel>
              <p className="text-[12px] leading-snug text-muted">
                No sanctioned path. Released below the{" "}
                {(policy.reviewAt * 100).toFixed(0)}% review threshold — no
                sanctioned source reachable from the subject.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <div className="mb-1 flex items-center justify-between">
                <SectionLabel>Tainted trace</SectionLabel>
                <span className="font-mono text-[11px] tnum text-faint">
                  {path.length} hops
                </span>
              </div>
              {/* origin */}
              <PathNode node={nodeById.get(verdict.sanctionedSource ?? "")} />
              {path.map((e, i) => (
                <div key={i} className="flex flex-col">
                  <div className="flex items-center gap-2 py-1 pl-3">
                    <ArrowRight className="size-3.5 shrink-0 stroke-[1.5] text-faint" />
                    <span className="font-mono text-[11px] tnum text-muted">
                      {e.label}
                    </span>
                    {e.tainted && (
                      <span className="size-1.5 bg-accent" aria-hidden />
                    )}
                  </div>
                  <PathNode node={nodeById.get(e.to)} />
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* COUNTERPARTIES: edges incident to the focused node */}
        <TabsContent value="counterparties" className="p-4">
          <div className="mb-1 flex items-center justify-between">
            <SectionLabel>Counterparties</SectionLabel>
            <span className="font-mono text-[11px] tnum text-faint">
              {incident.length}
            </span>
          </div>
          <div className="flex flex-col">
            {incident.map((e, i) => {
              const outbound = e.from === focusNodeId;
              const other = nodeById.get(outbound ? e.to : e.from);
              return (
                <div
                  key={i}
                  className="flex h-8 items-center gap-2 border-b border-hairline"
                >
                  <span
                    className={cn(
                      "font-mono text-[11px]",
                      outbound ? "text-faint" : "text-accent",
                    )}
                  >
                    {outbound ? "OUT" : "IN"}
                  </span>
                  <span className="flex-1 truncate text-[12px] text-text">
                    {other?.label ?? "—"}
                  </span>
                  {e.tainted && (
                    <span
                      className="size-1.5 shrink-0 bg-risk-high"
                      aria-hidden
                    />
                  )}
                  <span className="shrink-0 font-mono text-[12px] tnum text-muted">
                    {e.label}
                  </span>
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* EXPOSURE */}
        <TabsContent value="exposure" className="p-4">
          <ExposureBars exposure={exposure} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// The real engine's four-corner risk decomposition (originator identity ·
// source funds · beneficiary identity · destination). Each corner carries its
// own signal + score; this is the move that reads as a real screening engine.
const CORNER_SIGNAL: Record<
  Corner["signal"],
  { dot: string; fill: string; text: string }
> = {
  flagged: { dot: "bg-risk-high", fill: "bg-risk-high", text: "text-risk-high" },
  review: { dot: "bg-risk-med", fill: "bg-risk-med", text: "text-risk-med" },
  low: { dot: "bg-line-strong", fill: "bg-line-strong", text: "text-muted" },
  clean: { dot: "bg-risk-low", fill: "bg-risk-low/60", text: "text-faint" },
};

function CornerPanel({ corners }: { corners: Corner[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-3">
      {corners.map((c) => {
        const s = CORNER_SIGNAL[c.signal];
        return (
          <div key={c.key} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-1.5">
              <span className="flex items-center gap-1.5 truncate text-[11px] text-muted">
                <span className={cn("size-1.5 shrink-0", s.dot)} aria-hidden />
                {c.label}
              </span>
              <span className={cn("shrink-0 font-mono text-[11px] tnum", s.text)}>
                {(c.score * 100).toFixed(0)}%
              </span>
            </div>
            <div className="h-1 w-full bg-hairline">
              <div
                className={cn("h-full", s.fill)}
                style={{ width: `${Math.max(2, Math.min(100, c.score * 100))}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PathNode({ node }: { node: GNode | undefined }) {
  if (!node) return null;
  const tone =
    node.role === "san"
      ? "border-risk-high/40 bg-risk-high-wash"
      : node.role === "dest"
        ? "border-accent/40 bg-accent-wash"
        : "border-hairline bg-surface2";
  return (
    <div
      className={cn(
        "flex items-center gap-2 border px-2 py-1.5",
        tone,
      )}
    >
      <span
        className={cn(
          "size-1.5 shrink-0",
          node.role === "san"
            ? RISK_DOT.high
            : node.role === "dest"
              ? "bg-accent"
              : "bg-faint",
        )}
        aria-hidden
      />
      <span className="flex-1 truncate text-[12px] text-text">
        {node.label}
      </span>
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.04em] text-faint">
        {node.role === "san"
          ? "sanctioned"
          : node.role === "dest"
            ? "subject"
            : node.role === "mid"
              ? "intermediary"
              : "clean"}
      </span>
    </div>
  );
}
