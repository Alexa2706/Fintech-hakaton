"use client";

import type { Exposure, ExposureSlice } from "@/lib/engine/types";
import { Bar, CAT_BAR, CAT_ORDER, CategoryDot, SectionLabel } from "./shared";

function fmtUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
}

function sortSlices(slices: ExposureSlice[]): ExposureSlice[] {
  return [...slices].sort(
    (a, b) => CAT_ORDER.indexOf(a.category) - CAT_ORDER.indexOf(b.category),
  );
}

function Side({ label, slices }: { label: string; slices: ExposureSlice[] }) {
  const sorted = sortSlices(slices);
  return (
    <div className="flex flex-col gap-1.5">
      <SectionLabel>{label}</SectionLabel>
      <div className="flex flex-col">
        {sorted.map((s) => (
          <div key={s.category} className="flex h-7 items-center gap-2">
            <CategoryDot category={s.category} />
            <span className="w-20 shrink-0 truncate text-[12px] capitalize text-text">
              {s.category}
            </span>
            <div className="flex-1">
              <Bar value={s.pct} max={100} fill={CAT_BAR[s.category]} />
            </div>
            <span className="w-12 shrink-0 text-right font-mono text-[12px] tnum text-muted">
              {s.pct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ExposureBars({ exposure }: { exposure: Exposure }) {
  return (
    <div className="flex flex-col gap-4">
      {exposure.tracedUsd !== undefined && (
        <div className="flex items-center justify-between border-b border-hairline pb-2">
          <span className="text-[12px] text-muted">Traced value</span>
          <span className="font-mono text-[13px] tnum text-text">
            {fmtUsd(exposure.tracedUsd)}
          </span>
        </div>
      )}
      <Side label="Receiving" slices={exposure.receiving} />
      <Side label="Sending" slices={exposure.sending} />
    </div>
  );
}
