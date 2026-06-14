"use client";

import { MessageSquare } from "lucide-react";
import type { Engine } from "@/lib/engine/types";
import { cn } from "@/lib/utils";
import {
  ACTION_STYLE,
  SectionLabel,
  type Decision,
  type ReviewAction,
} from "./shared";

// Shown ONLY on REVIEW cases — the single human-in-the-loop moment. MATCH and
// NO_MATCH are decided cleanly by the engine, so the agent stays out of the way
// (no double-processing). Here it hands the analyst a plain-language brief +
// the considerations to weigh, opens the conversational agent, and turns the
// decision into an auditable action. The agent never decides — it explains; the
// human picks. Brief is deterministic from engine evidence (live DeepSeek in P2).

const ACTIONS: ReviewAction[] = ["RELEASE", "BLOCK"];

export function AgentHandover({
  eng,
  caseId,
  focusNodeId,
  onAsk,
  decision,
  onDecide,
}: {
  eng: Engine;
  caseId: string;
  focusNodeId: string;
  onAsk: () => void;
  decision?: Decision;
  onDecide: (action: ReviewAction, via: "agent" | "analyst") => void;
}) {
  const verdict = eng.getVerdict(caseId);
  const { reasons, policy } = eng.explainScore(caseId);
  const graph = eng.getPath(caseId);
  const subject = eng.getEntity(focusNodeId);

  const sourceLabel =
    (verdict.sanctionedSource &&
      graph.nodes.find((n) => n.id === verdict.sanctionedSource)?.label) ||
    "a sanctioned source";

  const taintPct = (verdict.taint * 100).toFixed(1);
  const reviewPct = (policy.reviewAt * 100).toFixed(0);
  const blockPct = (policy.blockAt * 100).toFixed(0);
  const flow =
    subject.rail === "crypto" ? "of inbound value" : "of beneficial ownership";
  const hop = `${verdict.hops} hop${verdict.hops === 1 ? "" : "s"}`;

  const brief = `About ${taintPct}% of the money reaching ${subject.label} traces back to ${sourceLabel}, ${verdict.hops} step${verdict.hops === 1 ? "" : "s"} away. That's the grey zone — the engine can't decide on its own, so it's your call.`;

  const pointers = reasons.slice(0, 2);

  return (
    <div className="border border-hairline border-t-2 border-t-accent bg-surface2">
      {/* header */}
      <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text">
          Bobby
        </span>
        <span className="border border-risk-med/40 bg-risk-med-wash px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-risk-med">
          Needs your review
        </span>
      </div>

      <div className="flex flex-col gap-3.5 p-3">
        {/* plain-language brief */}
        <p className="text-[13px] leading-relaxed text-text">{brief}</p>

        {/* considerations — cite the engine's reason codes */}
        <div className="flex flex-col gap-2">
          <SectionLabel>Weigh this</SectionLabel>
          {pointers.map((p) => (
            <div key={p.code} className="border-l border-hairline pl-2.5">
              <span className="font-mono text-[11px] text-accent">{p.code}</span>
              <p className="mt-0.5 text-[12px] leading-snug text-muted">
                {p.detail}
              </p>
            </div>
          ))}
        </div>

        {/* interrogate — open the grounded conversational agent */}
        <button
          onClick={onAsk}
          className="flex items-center justify-center gap-2 border border-accent bg-accent-wash py-2 text-[12px] font-medium text-accent transition-colors hover:bg-accent/20"
        >
          <MessageSquare className="size-3.5 stroke-[1.5]" />
          Ask Bobby
        </button>

        {/* decision affordances — engine flagged it, the human decides */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <SectionLabel>Your decision</SectionLabel>
            <span className="font-mono text-[10px] text-faint">
              writes to audit line
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {ACTIONS.map((a) => {
              const active = decision?.action === a;
              return (
                <button
                  key={a}
                  onClick={() => onDecide(a, "analyst")}
                  className={cn(
                    "h-7 border text-[11px] font-medium uppercase tracking-[0.04em] transition-colors",
                    active
                      ? ACTION_STYLE[a].solid
                      : cn("bg-canvas", ACTION_STYLE[a].outline),
                  )}
                >
                  {a}
                </button>
              );
            })}
          </div>
        </div>

        {/* grounding footer */}
        <div className="border-t border-hairline pt-2 font-mono text-[10px] text-faint">
          grounded in engine evidence · {verdict.listVersion} ·{" "}
          {verdict.policyVersion}
        </div>
      </div>
    </div>
  );
}
