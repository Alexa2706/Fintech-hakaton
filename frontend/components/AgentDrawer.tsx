"use client";

import { useEffect, useRef, useState } from "react";
import { X, ArrowUp, Crosshair, Copy, ShieldCheck, Loader2, Play } from "lucide-react";
import type { Engine } from "@/lib/engine/types";
import type { ScreenedCase } from "@/lib/screen/types";
import {
  runAgent,
  suggestionsFor,
  routeText,
  type AgentTurn,
  type Citation,
} from "@/lib/agent/scripted";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Sheet,
  SheetContent,
  SheetClose,
  SheetTitle,
  SheetDescription,
} from "./ui/sheet";
import {
  ACTION_STYLE,
  OutcomePill,
  SectionLabel,
  type Decision,
  type ReviewAction,
} from "./shared";

type Msg =
  | { id: number; role: "you"; text: string }
  | { id: number; role: "agent"; turn: AgentTurn };

type ApiMsg = { role: "user" | "assistant"; content: string };

const ACTIONS: ReviewAction[] = ["RELEASE", "BLOCK"];

// Provenance chips, computed from the engine, so live answers keep the same
// grounded/clickable citations the scripted ones had.
function deriveCitations(
  eng: Engine,
  caseId: string,
  toolsRead: string[],
  text: string,
): Citation[] {
  const v = eng.getVerdict(caseId);
  const graph = eng.getPath(caseId);
  const { reasons } = eng.explainScore(caseId);
  const out: Citation[] = [];
  const src = v.sanctionedSource
    ? graph.nodes.find((n) => n.id === v.sanctionedSource)
    : undefined;
  if (src) out.push({ kind: "node", label: "source", ref: src.label, nodeId: src.id });
  for (const r of reasons)
    if (text.includes(r.code)) out.push({ kind: "reason", label: "reason", ref: r.code });
  out.push({ kind: "list", label: "list", ref: v.listVersion });
  out.push({ kind: "policy", label: "policy", ref: v.policyVersion });
  return out;
}

// Stream the live DeepSeek route (ndjson: {type:"tool"|"text"|"error"}). Tool
// reads and text tokens arrive progressively. Throws on transport/agent error
// so the caller can fall back to the scripted brain.
async function streamAgent(
  caseId: string,
  caseData: ScreenedCase | undefined,
  history: ApiMsg[],
  question: string,
  cb: { onText: (delta: string) => void; onTool: (name: string) => void },
): Promise<void> {
  const res = await fetch("/api/agent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      caseId,
      caseData, // present for live/screened cases the static engine can't see
      stream: true,
      messages: [...history, { role: "user", content: question }],
    }),
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}) as { error?: string });
    throw new Error(data.error || `status ${res.status}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let ev: { type: string; delta?: string; name?: string; error?: string };
      try {
        ev = JSON.parse(line);
      } catch {
        continue;
      }
      if (ev.type === "text" && ev.delta) cb.onText(ev.delta);
      else if (ev.type === "tool" && ev.name) cb.onTool(ev.name);
      else if (ev.type === "error") throw new Error(ev.error || "agent error");
    }
  }
}

function CiteChip({
  c,
  onCiteNode,
}: {
  c: Citation;
  onCiteNode?: (nodeId: string) => void;
}) {
  const base =
    "inline-flex items-center gap-1 border px-1 py-0.5 font-mono text-[10px] leading-none";
  if (c.kind === "node")
    return (
      <button
        onClick={() => c.nodeId && onCiteNode?.(c.nodeId)}
        className={cn(base, "border-accent/40 text-accent hover:bg-accent-wash")}
        title="highlight on graph"
      >
        <Crosshair className="size-2.5 stroke-[1.5]" />
        {c.ref}
      </button>
    );
  if (c.kind === "reason")
    return <span className={cn(base, "border-accent/30 text-accent")}>{c.ref}</span>;
  return (
    <span className={cn(base, "border-hairline text-faint")}>
      {c.label} {c.ref}
    </span>
  );
}

function SarBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-1 border border-hairline bg-canvas">
      <div className="flex items-center justify-between border-b border-hairline px-2 py-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-faint">
          SAR · draft
        </span>
        <button
          onClick={() => {
            void navigator.clipboard?.writeText(text);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
          }}
          className="flex items-center gap-1 font-mono text-[10px] text-muted hover:text-text"
        >
          <Copy className="size-2.5 stroke-[1.5]" />
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <p className="p-2 text-[12px] leading-relaxed text-muted">{text}</p>
    </div>
  );
}

// Light renderer: paragraphs + **bold** (the agent bolds entity names). We
// steer it away from tables/headers/bullets in the system prompt.
function renderInline(p: string) {
  return p.split(/\*\*(.+?)\*\*/g).map((seg, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-text">
        {seg}
      </strong>
    ) : (
      <span key={i}>{seg}</span>
    ),
  );
}

function Rich({ text }: { text: string }) {
  const paras = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, " ").trim())
    .filter(Boolean);
  return (
    <div className="flex flex-col gap-2">
      {paras.map((p, i) => (
        <p key={i} className="text-[13px] leading-relaxed text-text">
          {renderInline(p)}
        </p>
      ))}
    </div>
  );
}

function AgentMessage({
  turn,
  onCiteNode,
}: {
  turn: AgentTurn;
  onCiteNode?: (nodeId: string) => void;
}) {
  const empty = turn.streaming && !turn.text && turn.toolsRead.length === 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
          Bobby
        </span>
        {turn.fallback && (
          <span className="font-mono text-[9px] uppercase tracking-[0.04em] text-faint">
            · offline · grounded fallback
          </span>
        )}
      </div>
      {empty ? (
        <div className="flex items-center gap-1.5 text-faint">
          <Loader2 className="size-3.5 animate-spin stroke-[1.5] text-accent" />
          <span className="font-mono text-[11px]">reading the case…</span>
        </div>
      ) : (
        <>
          {turn.toolsRead.length > 0 && (
            <div className="font-mono text-[10px] text-faint">
              ↳ read {turn.toolsRead.join(" · ")}
            </div>
          )}
          <Rich text={turn.text} />
          {turn.sar && <SarBlock text={turn.sar} />}
          {turn.citations.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {turn.citations.map((c, i) => (
                <CiteChip key={i} c={c} onCiteNode={onCiteNode} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function AgentDrawer({
  eng,
  caseId,
  screenedCase,
  resetKey,
  open,
  onOpenChange,
  decision,
  onDecide,
  onCiteNode,
  onVisualize,
}: {
  eng: Engine;
  caseId: string;
  screenedCase?: ScreenedCase;
  resetKey?: number; // bump to force a fresh chat (e.g. the Demo button)
  open: boolean;
  onOpenChange: (open: boolean) => void;
  decision?: Decision;
  onDecide: (action: ReviewAction, via: "agent" | "analyst") => void;
  onCiteNode?: (nodeId: string) => void;
  onVisualize?: () => void; // agent "visualize" command — drives the canvas replay
}) {
  const verdict = eng.getVerdict(caseId);
  const graph = eng.getPath(caseId);
  const subject = graph.nodes.find((n) => n.role === "dest");
  const entity = subject ? eng.getEntity(subject.id) : undefined;

  const idRef = useRef(0);
  const nextId = () => ++idRef.current;
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // fresh thread per case — instant scripted brief (no API call on open)
  useEffect(() => {
    idRef.current = 0;
    setMessages([{ id: nextId(), role: "agent", turn: runAgent(eng, caseId, "brief") }]);
    setInput("");
    setBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, resetKey]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const suggestions = suggestionsFor(eng, caseId);

  function toApiHistory(msgs: Msg[]): ApiMsg[] {
    return msgs.flatMap((m): ApiMsg[] =>
      m.role === "you"
        ? [{ role: "user", content: m.text }]
        : [{ role: "assistant", content: m.turn.text }],
    );
  }

  async function ask(question: string) {
    if (busy) return;
    const history = toApiHistory(messages);
    const userId = nextId();
    const liveId = nextId();
    const update = (fn: (t: AgentTurn) => AgentTurn) =>
      setMessages((m) =>
        m.map((x) =>
          x.id === liveId && x.role === "agent" ? { ...x, turn: fn(x.turn) } : x,
        ),
      );
    setMessages((m) => [
      ...m,
      { id: userId, role: "you", text: question },
      {
        id: liveId,
        role: "agent",
        turn: { text: "", toolsRead: [], citations: [], streaming: true },
      },
    ]);
    setBusy(true);
    try {
      await streamAgent(caseId, screenedCase, history, question, {
        onText: (d) => update((t) => ({ ...t, text: t.text + d })),
        onTool: (name) =>
          update((t) => ({ ...t, toolsRead: [...t.toolsRead, name] })),
      });
      update((t) => ({
        ...t,
        streaming: false,
        citations: deriveCitations(eng, caseId, t.toolsRead, t.text),
        sar: t.toolsRead.includes("draft_sar")
          ? eng.draftSar(caseId)
          : undefined,
      }));
    } catch {
      const turn = { ...runAgent(eng, caseId, routeText(question)), fallback: true };
      setMessages((m) =>
        m.map((x) => (x.id === liveId ? { id: liveId, role: "agent", turn } : x)),
      );
    } finally {
      setBusy(false);
    }
  }

  function send() {
    const t = input.trim();
    if (!t || busy) return;
    setInput("");
    void ask(t);
  }

  // the "visualize" command: drive the canvas replay + a short scripted
  // narration (deterministic, no API round-trip so the animation fires instantly)
  function visualize() {
    if (busy) return;
    onVisualize?.();
    setMessages((m) => [
      ...m,
      { id: nextId(), role: "agent", turn: runAgent(eng, caseId, "visualize") },
    ]);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent>
        {/* header */}
        <div className="flex items-start justify-between gap-2 border-b border-hairline p-3">
          <div className="min-w-0">
            <SheetTitle className="text-[14px] font-medium text-text">
              Bobby
            </SheetTitle>
            <SheetDescription className="mt-1 flex items-center gap-2 font-mono text-[11px] text-faint">
              <span className="truncate text-muted">{entity?.label}</span>
              <span>·</span>
              <OutcomePill outcome={verdict.outcome} taint={verdict.taint} />
            </SheetDescription>
          </div>
          <SheetClose asChild>
            <Button variant="ghost" size="icon" aria-label="close Bobby">
              <X className="size-4 stroke-[1.5]" />
            </Button>
          </SheetClose>
        </div>

        {/* guardrail */}
        <div className="flex items-center gap-1.5 border-b border-hairline bg-surface2 px-3 py-1.5 font-mono text-[10px] text-faint">
          <ShieldCheck className="size-3 stroke-[1.5] text-risk-low" />
          DeepSeek · grounded — answers only from this case&apos;s engine evidence.
        </div>

        {/* conversation */}
        <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
          {messages.map((m) =>
            m.role === "you" ? (
              <div key={m.id} className="flex flex-col items-end gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">
                  You
                </span>
                <div className="max-w-[85%] border border-hairline bg-surface2 px-2.5 py-1.5 text-[13px] text-text">
                  {m.text}
                </div>
              </div>
            ) : (
              <AgentMessage key={m.id} turn={m.turn} onCiteNode={onCiteNode} />
            ),
          )}
        </div>

        {/* suggested prompts */}
        <div className="flex flex-wrap gap-1.5 border-t border-hairline p-3 pb-2">
          {suggestions.map((s) =>
            s.intent === "visualize" ? (
              <button
                key={s.label}
                disabled={busy}
                onClick={visualize}
                className="flex items-center gap-1.5 border border-accent/40 bg-accent-wash px-2 py-1 text-[11px] font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-40"
              >
                <Play className="size-3 stroke-[1.5]" />
                {s.label}
              </button>
            ) : (
              <button
                key={s.label}
                disabled={busy}
                onClick={() => void ask(s.label)}
                className="border border-hairline px-2 py-1 text-[11px] text-muted transition-colors hover:border-line-strong hover:text-text disabled:opacity-40"
              >
                {s.label}
              </button>
            ),
          )}
        </div>

        {/* composer */}
        <div className="flex items-center gap-1.5 px-3 pb-3">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="ask Bobby about this case…"
            className="font-sans"
            aria-label="ask Bobby"
          />
          <Button
            variant="accent"
            size="icon"
            onClick={send}
            disabled={!input.trim() || busy}
            aria-label="send"
          >
            <ArrowUp className="size-4 stroke-[1.5]" />
          </Button>
        </div>

        {/* decision handoff — the auditable action */}
        <div className="border-t border-hairline bg-surface2 p-3">
          <div className="mb-1.5 flex items-center justify-between">
            <SectionLabel>Your decision</SectionLabel>
            <span className="font-mono text-[10px] text-faint">writes to audit line</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {ACTIONS.map((a) => {
              const active = decision?.action === a;
              return (
                <button
                  key={a}
                  onClick={() => onDecide(a, "agent")}
                  className={cn(
                    "h-8 border text-[11px] font-semibold uppercase tracking-[0.04em] transition-colors",
                    active ? ACTION_STYLE[a].solid : cn("bg-canvas", ACTION_STYLE[a].outline),
                  )}
                >
                  {a}
                </button>
              );
            })}
          </div>
          {decision && (
            <div className="mt-2 font-mono text-[10px] text-muted">
              <span className="text-text">{decision.action}</span> · {decision.at} ·
              via {decision.via} · {verdict.policyVersion} · {verdict.decisionHash}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
