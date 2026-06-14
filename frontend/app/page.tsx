"use client";

import { useMemo, useRef, useState } from "react";
import {
  Search,
  PanelLeft,
  Download,
  ArrowDownUp,
  Waypoints,
  Play,
} from "lucide-react";
import type { GraphData, Outcome, Rail } from "@/lib/engine/types";
import { makeEngine } from "@/lib/screen/caseEngine";
import type { ScreenedCase } from "@/lib/screen/types";
import { DEMO_QUEUE } from "@/lib/mock/demoQueue";
import { Queue } from "@/components/Queue";
import { Graph } from "@/components/Graph";
import { Inspector } from "@/components/Inspector";
import { AgentDrawer } from "@/components/AgentDrawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Decision, ReviewAction } from "@/components/shared";
import { cn } from "@/lib/utils";

// the one-click demo jumps to the showcase case: a multi-hop crypto REVIEW —
// SDN person → SDN wallet → mixer → bridge relayer → subject, with a clean
// co-input. The densest, most legible case and the one the replay reads best on.
const SHOWCASE_ID = "CASE-2026-0418";

type RailFilter = "all" | Rail;
type OutcomeFilter = "all" | Outcome;
type SortMode = "queue" | "taint" | "severity";

const SEVERITY: Record<Outcome, number> = { MATCH: 0, REVIEW: 1, NO_MATCH: 2 };
const SORT_LABEL: Record<SortMode, string> = {
  queue: "Sort",
  taint: "Taint ↓",
  severity: "Severity",
};

export default function ConsolePage() {
  const [screened, setScreened] = useState<Record<string, ScreenedCase>>({});
  const eng = useMemo(() => makeEngine(screened), [screened]);
  const CASES = useMemo(() => eng.listCases(), [eng]);

  const [selectedId, setSelectedId] = useState(CASES[0].id);
  const [queueOpen, setQueueOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [rail, setRail] = useState<RailFilter>("all");
  const [outcome, setOutcome] = useState<OutcomeFilter>("all");
  const [sort, setSort] = useState<SortMode>("queue");
  const [taintOnly, setTaintOnly] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentResetKey, setAgentResetKey] = useState(0);
  const [highlightId, setHighlightId] = useState<string | undefined>(undefined);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [demoIdx, setDemoIdx] = useState(0); // next pending REVIEW case to reveal

  // agent "visualize" replay — nodes lit so far + the current one
  const [activeNodes, setActiveNodes] = useState<string[]>([]);
  const [activeNode, setActiveNode] = useState<string | undefined>(undefined);
  const replayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function stopReplay() {
    if (replayTimer.current) clearTimeout(replayTimer.current);
    replayTimer.current = null;
    setActiveNodes([]);
    setActiveNode(undefined);
  }

  function selectCase(id: string) {
    stopReplay();
    setSelectedId(id);
    setAgentOpen(false);
    setHighlightId(undefined);
  }

  function onScreened(c: ScreenedCase) {
    stopReplay();
    setScreened((s) => ({ ...s, [c.summary.id]: c }));
    setSelectedId(c.summary.id);
    setAgentOpen(false);
    setHighlightId(undefined);
  }

  function runDemo() {
    stopReplay();
    setSelectedId(SHOWCASE_ID);
    setHighlightId(undefined);
    setQueueOpen(false); // hide the queue — focus on the graph
    setAgentResetKey((k) => k + 1); // fresh Bobby chat for when it's opened
    setAgentOpen(false); // don't auto-open Bobby — just show the case + graph
  }

  // walk the tainted source→subject path, lighting one node every ~850ms
  function visualizeTransfer() {
    const seq = taintedNodeSequence(graph, verdict.sanctionedSource);
    if (seq.length === 0) return;
    stopReplay();
    let i = 0;
    const step = () => {
      setActiveNodes(seq.slice(0, i + 1));
      setActiveNode(seq[i]);
      i += 1;
      if (i < seq.length) {
        replayTimer.current = setTimeout(step, 850);
      } else {
        // hold the fully-lit path a beat, then settle back to the clean graph
        replayTimer.current = setTimeout(() => stopReplay(), 1600);
      }
    };
    step();
  }
  function recordDecision(action: ReviewAction, via: "agent" | "analyst") {
    const firstDecision = !decisions[selectedId];
    setDecisions((d) => ({
      ...d,
      [selectedId]: { action, at: new Date().toISOString().slice(0, 19) + "Z", via },
    }));
    // deciding a REVIEW case reveals the next one — keeps the analyst working a
    // live queue. Only the first decision on a case advances (re-deciding won't).
    if (firstDecision && demoIdx < DEMO_QUEUE.length) {
      const next = DEMO_QUEUE[demoIdx];
      stopReplay();
      setScreened((s) => ({ ...s, [next.summary.id]: next }));
      setDemoIdx((i) => i + 1);
      setSelectedId(next.summary.id);
      setHighlightId(undefined);
      setAgentResetKey((k) => k + 1);
    }
  }

  // every toolbar control actually drives the queue or the canvas
  const view = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = CASES.filter((c) => {
      if (rail !== "all" && c.rail !== rail) return false;
      if (outcome !== "all" && c.outcome !== outcome) return false;
      if (!q) return true;
      return (
        c.party.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        c.amount.toLowerCase().includes(q) ||
        c.outcome.toLowerCase().includes(q)
      );
    });
    if (sort === "taint") {
      list = [...list].sort(
        (a, b) => eng.getVerdict(b.id).taint - eng.getVerdict(a.id).taint,
      );
    } else if (sort === "severity") {
      list = [...list].sort(
        (a, b) => SEVERITY[a.outcome] - SEVERITY[b.outcome],
      );
    }
    return list;
  }, [query, rail, outcome, sort, CASES, eng]);

  const graph = eng.getPath(selectedId);
  const verdict = eng.getVerdict(selectedId);
  const subject =
    graph.nodes.find((n) => n.role === "dest") ?? graph.nodes[0];
  const decision = decisions[selectedId];
  const selectedVia: "live" | "mock" = screened[selectedId]?.via ?? "mock";

  function exportCase() {
    const payload = {
      summary: CASES.find((c) => c.id === selectedId),
      verdict,
      path: graph,
      subject: eng.getEntity(subject.id),
      exposure: eng.getExposure(subject.id),
      explanation: eng.explainScore(selectedId),
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-canvas">
      {/* TOOLBAR STRIP */}
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-hairline bg-surface px-2">
        {/* brand */}
        <div className="flex items-center gap-2 pl-1 pr-1">
          <span className="size-3 bg-accent" aria-hidden />
          <span className="text-[13px] font-medium tracking-tight text-text">
            throughline
          </span>
        </div>

        <div className="h-5 w-px bg-hairline" />

        <Button
          variant="ghost"
          size="icon"
          aria-label="toggle queue"
          onClick={() => setQueueOpen((o) => !o)}
          className={cn(queueOpen && "text-text")}
        >
          <PanelLeft className="size-4 stroke-[1.5]" />
        </Button>

        {/* search */}
        <div className="relative w-56">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 stroke-[1.5] text-faint" />
          <Input
            className="pl-7"
            placeholder="search party · address · id"
            aria-label="search cases"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {/* rail filter */}
        <Seg
          value={rail}
          onChange={(v) => setRail(v as RailFilter)}
          options={[
            { value: "all", label: "All" },
            { value: "crypto", label: "Crypto" },
            { value: "fiat", label: "Fiat" },
          ]}
        />

        {/* outcome filter */}
        <Seg
          value={outcome}
          onChange={(v) => setOutcome(v as OutcomeFilter)}
          options={[
            { value: "all", label: "All" },
            { value: "MATCH", label: "Match", dot: "bg-risk-high" },
            { value: "REVIEW", label: "Review", dot: "bg-risk-med" },
            { value: "NO_MATCH", label: "Clear", dot: "bg-risk-low" },
          ]}
        />

        {/* sort cycle */}
        <Button
          variant="ghost"
          onClick={() =>
            setSort((s) =>
              s === "queue" ? "taint" : s === "taint" ? "severity" : "queue",
            )
          }
          className={cn(
            "border border-hairline",
            sort !== "queue" && "bg-accent-wash text-text",
          )}
          aria-label="sort queue"
        >
          <ArrowDownUp className="size-3.5 stroke-[1.5]" />
          {SORT_LABEL[sort]}
        </Button>

        {/* taint-path toggle (canvas) */}
        <Button
          variant="ghost"
          onClick={() => setTaintOnly((t) => !t)}
          className={cn(
            "border border-hairline",
            taintOnly && "bg-accent-wash text-text",
          )}
          aria-label="isolate tainted path"
          title="isolate the tainted path on the canvas"
        >
          <Waypoints className="size-3.5 stroke-[1.5]" />
          Taint path
        </Button>

        {/* primary action: jump to the showcase demo case + open the agent */}
        <Button
          variant="ghost"
          onClick={runDemo}
          className="gap-1.5 border border-accent/40 bg-accent-wash text-accent hover:bg-accent-wash hover:text-accent-hi"
          aria-label="run demo case"
        >
          <Play className="size-3.5 stroke-[1.5]" />
          Demo
        </Button>

        {/* status right */}
        <div className="ml-auto flex items-center gap-2">
          <span className="font-mono text-[11px] tnum text-faint">
            {view.length}/{CASES.length}
          </span>
          <span className="flex items-center gap-1.5 border border-hairline px-2 py-1 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
            <span
              className={cn(
                "size-1.5",
                selectedVia === "live" ? "bg-accent" : "bg-risk-low",
              )}
              aria-hidden
            />
            engine: {selectedVia}
          </span>
          <span className="hidden border border-hairline px-2 py-1 font-mono text-[10px] text-faint 2xl:inline">
            {verdict.listVersion}
          </span>
          <span className="hidden border border-hairline px-2 py-1 font-mono text-[10px] text-faint 2xl:inline">
            {verdict.policyVersion}
          </span>
          <div className="h-5 w-px bg-hairline" />
          <Button
            variant="secondary"
            size="icon"
            aria-label="export case json"
            title="export case as JSON"
            onClick={exportCase}
          >
            <Download className="size-3.5 stroke-[1.5]" />
          </Button>
        </div>
      </header>

      {/* THREE ZONES */}
      <div className="flex min-h-0 flex-1">
        {queueOpen && (
          <aside className="w-[260px] shrink-0 border-r border-hairline">
            <Queue
              cases={view}
              selectedId={selectedId}
              onSelect={selectCase}
            />
          </aside>
        )}

        <section className="min-w-0 flex-1">
          {/* key forces a clean re-mount of zoom/hover state per case */}
          <Graph
            key={selectedId}
            eng={eng}
            data={graph}
            sanctionedSource={verdict.sanctionedSource}
            taintOnly={taintOnly}
            highlightId={highlightId}
            activeNodes={activeNodes}
            activeNode={activeNode}
            agentOpen={agentOpen}
          />
        </section>

        <aside className="w-[380px] shrink-0 border-l border-hairline">
          <Inspector
            eng={eng}
            caseId={selectedId}
            focusNodeId={subject.id}
            onOpenAgent={() => setAgentOpen(true)}
            decision={decision}
            onDecide={recordDecision}
          />
        </aside>
      </div>

      {/* grounded agent — slide-over, non-modal so the graph stays live */}
      <AgentDrawer
        eng={eng}
        caseId={selectedId}
        screenedCase={screened[selectedId]}
        resetKey={agentResetKey}
        open={agentOpen}
        onOpenChange={setAgentOpen}
        decision={decision}
        onDecide={recordDecision}
        onCiteNode={setHighlightId}
        onVisualize={visualizeTransfer}
      />
    </main>
  );
}

// tainted source→subject node sequence (BFS along tainted edges) — drives the
// node-by-node replay
function taintedNodeSequence(graph: GraphData, source?: string): string[] {
  const subject = graph.nodes.find((n) => n.role === "dest");
  if (!source || !subject) return [];
  const adj = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (!e.tainted) continue;
    adj.set(e.from, [...(adj.get(e.from) ?? []), e.to]);
  }
  const queue: string[][] = [[source]];
  const seen = new Set<string>([source]);
  while (queue.length) {
    const path = queue.shift()!;
    const cur = path[path.length - 1];
    if (cur === subject.id) return path;
    for (const nxt of adj.get(cur) ?? []) {
      if (seen.has(nxt)) continue;
      seen.add(nxt);
      queue.push([...path, nxt]);
    }
  }
  return [];
}

function Seg({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string; dot?: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex border border-hairline">
      {options.map((o, i) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex h-7 items-center gap-1.5 px-2.5 font-mono text-[11px] uppercase tracking-[0.04em] outline-none transition-colors",
            i > 0 && "border-l border-hairline",
            value === o.value
              ? "bg-accent-wash text-text"
              : "text-muted hover:text-text",
          )}
        >
          {o.dot && <span className={cn("size-1.5", o.dot)} aria-hidden />}
          {o.label}
        </button>
      ))}
    </div>
  );
}
