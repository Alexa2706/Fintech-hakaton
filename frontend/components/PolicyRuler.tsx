"use client";

import type { DecisionPolicy, Outcome, Verdict } from "@/lib/engine/types";
import { cn } from "@/lib/utils";
import { OUTCOME_RISK, OutcomePill, type RiskLevel } from "./shared";

const DIRECTIVE: Record<Outcome, string> = {
  MATCH: "Block",
  REVIEW: "Route to review",
  NO_MATCH: "Release",
};

const MARKER_LINE: Record<RiskLevel, string> = {
  high: "bg-risk-high",
  med: "bg-risk-med",
  low: "bg-risk-low",
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export function PolicyRuler({
  verdict,
  policy,
}: {
  verdict: Verdict;
  policy: DecisionPolicy;
}) {
  const risk = OUTCOME_RISK[verdict.outcome];
  const pct = verdict.taint * 100;
  const reviewPct = policy.reviewAt * 100;
  const blockPct = policy.blockAt * 100;
  const chipLeft = clamp(pct, 7, 93); // keep the marker chip on-canvas

  const ticks: { p: number; label: string; line: string; text: string }[] = [
    { p: reviewPct, label: "review", line: "bg-risk-med", text: "text-risk-med" },
    { p: blockPct, label: "block", line: "bg-risk-high", text: "text-risk-high" },
  ];

  return (
    <div className="flex flex-col gap-2.5">
      {/* verdict header */}
      <div className="flex items-center justify-between">
        <OutcomePill outcome={verdict.outcome} taint={verdict.taint} />
        <div className="flex items-center gap-2 font-mono text-[11px] tnum text-faint">
          <span className="text-muted">{DIRECTIVE[verdict.outcome]}</span>
          <span className="text-hairline">·</span>
          <span>{verdict.hops} hops</span>
        </div>
      </div>

      {/* ruler */}
      <div className="relative h-12 select-none">
        {/* marker chip */}
        <div
          className="absolute top-0 -translate-x-1/2"
          style={{ left: `${chipLeft}%` }}
        >
          <span
            className={cn(
              "whitespace-nowrap border px-1 font-mono text-[10px] tnum",
              risk === "high"
                ? "border-risk-high/40 bg-risk-high-wash text-risk-high"
                : risk === "med"
                  ? "border-risk-med/40 bg-risk-med-wash text-risk-med"
                  : "border-risk-low/40 bg-risk-low-wash text-risk-low",
            )}
          >
            {pct.toFixed(1)}%
          </span>
        </div>

        {/* zone bar */}
        <div className="absolute inset-x-0 top-[26px] flex h-1.5">
          <div className="bg-risk-low-wash" style={{ width: `${reviewPct}%` }} />
          <div
            className="bg-risk-med-wash"
            style={{ width: `${blockPct - reviewPct}%` }}
          />
          <div className="flex-1 bg-risk-high-wash" />
        </div>

        {/* threshold ticks + labels */}
        {ticks.map((t) => (
          <div key={t.label}>
            <div
              className={cn("absolute top-[22px] h-3.5 w-px", t.line)}
              style={{ left: `${t.p}%` }}
            />
            <div
              className={cn(
                "absolute top-[38px] -translate-x-1/2 font-mono text-[10px] tnum",
                t.text,
              )}
              style={{ left: `${t.p}%` }}
            >
              {t.p.toFixed(0)}%
            </div>
          </div>
        ))}

        {/* taint marker line */}
        <div
          className={cn("absolute top-[18px] h-[22px] w-0.5", MARKER_LINE[risk])}
          style={{ left: `${pct}%` }}
        />
      </div>

      {/* audit line — always present */}
      <div className="truncate border-t border-hairline pt-2 font-mono text-[11px] text-faint">
        list {verdict.listVersion} · policy {verdict.policyVersion} ·{" "}
        {verdict.decisionHash}
      </div>
    </div>
  );
}
