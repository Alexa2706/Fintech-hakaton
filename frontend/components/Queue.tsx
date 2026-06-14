"use client";

import type { CaseSummary } from "@/lib/engine/types";
import { cn } from "@/lib/utils";
import { OutcomePill, OUTCOME_RISK, RISK_DOT, SectionLabel } from "./shared";

export function Queue({
  cases,
  selectedId,
  onSelect,
}: {
  cases: CaseSummary[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-hairline px-3">
        <SectionLabel>Queue</SectionLabel>
        <span className="font-mono tnum text-[11px] text-faint">
          {cases.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {cases.map((c) => {
          const active = c.id === selectedId;
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={cn(
                "relative flex w-full flex-col gap-1 border-b border-hairline px-3 py-2 text-left outline-none transition-colors",
                active
                  ? "bg-accent-wash"
                  : "hover:bg-surface2 focus-visible:bg-surface2",
              )}
            >
              {/* selected accent edge */}
              {active && (
                <span className="absolute inset-y-0 left-0 w-0.5 bg-accent" />
              )}
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "size-1.5 shrink-0",
                    RISK_DOT[OUTCOME_RISK[c.outcome]],
                  )}
                  aria-hidden
                />
                <span className="flex-1 truncate text-[13px] text-text">
                  {c.party}
                </span>
                <span className="font-mono tnum text-[12px] text-text">
                  {c.amount}
                </span>
              </div>
              <div className="flex items-center justify-between pl-3.5">
                <div className="flex items-center gap-2">
                  <span className="border border-hairline px-1 font-mono text-[10px] uppercase tracking-[0.06em] text-faint">
                    {c.rail}
                  </span>
                  <span className="font-mono text-[10px] text-faint">
                    {c.id}
                  </span>
                </div>
                <OutcomePill outcome={c.outcome} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
