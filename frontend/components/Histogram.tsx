"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Engine, ExposureCategory, GNode, GNodeType } from "@/lib/engine/types";
import { cn } from "@/lib/utils";
import { Bar, CAT_DOT, SectionLabel } from "./shared";

type Row = { label: string; count: number; dot?: string };

const TYPE_LABEL: Record<GNodeType, string> = {
  person: "Person",
  company: "Company",
  bank: "Bank",
  wallet: "Wallet",
  exchange: "Exchange",
  mixer: "Mixer",
  address: "Address",
  vehicle: "Vehicle",
  org: "Organization",
};

const ROLE_LABEL: Record<GNode["role"], string> = {
  san: "Sanctioned source",
  mid: "Intermediary",
  dest: "Subject",
  clean: "Clean party",
};

// tally a list of keys into ordered { label, count } rows, biggest first
function tally<T extends string>(
  keys: T[],
  label: (k: T) => string,
  dot?: (k: T) => string | undefined,
): Row[] {
  const counts = new Map<T, number>();
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  return [...counts.entries()]
    .map(([k, count]) => ({ label: label(k), count, dot: dot?.(k) }))
    .sort((a, b) => b.count - a.count);
}

function Facet({ title, rows }: { title: string; rows: Row[] }) {
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0);
  const LIMIT = 6;
  const shown = expanded ? rows : rows.slice(0, LIMIT);
  const hidden = rows.length - shown.length;

  return (
    <div className="border-b border-hairline py-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between outline-none"
      >
        <SectionLabel>{title}</SectionLabel>
        <ChevronDown
          className={cn(
            "size-3.5 stroke-[1.5] text-faint transition-transform",
            !open && "-rotate-90",
          )}
        />
      </button>

      {open && (
        <div className="mt-1.5 flex flex-col">
          {shown.map((r) => (
            <div key={r.label} className="flex h-7 items-center gap-2">
              {r.dot && (
                <span className={cn("size-1.5 shrink-0", r.dot)} aria-hidden />
              )}
              <span className="w-28 shrink-0 truncate text-[13px] text-text">
                {r.label}
              </span>
              <div className="flex-1">
                <Bar value={r.count} max={max} />
              </div>
              <span className="w-6 shrink-0 text-right font-mono text-[12px] tnum text-muted">
                {r.count}
              </span>
            </div>
          ))}
          {hidden > 0 && (
            <button
              onClick={() => setExpanded(true)}
              className="mt-1 self-start text-[11px] text-accent hover:text-accent-hi"
            >
              Show {hidden} more…
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function Histogram({ eng, nodes }: { eng: Engine; nodes: GNode[] }) {
  const facets = useMemo(() => {
    const types = tally<GNodeType>(
      nodes.map((n) => n.type),
      (k) => TYPE_LABEL[k],
    );
    const roles = tally<GNode["role"]>(
      nodes.map((n) => n.role),
      (k) => ROLE_LABEL[k],
    );
    const categories = tally<ExposureCategory>(
      nodes.map((n) => eng.getEntity(n.id).category as ExposureCategory),
      (k) => k,
      (k) => CAT_DOT[k],
    );
    return { types, roles, categories };
  }, [nodes, eng]);

  return (
    <div className="flex flex-col">
      <Facet title="Object types" rows={facets.types} />
      <Facet title="Role" rows={facets.roles} />
      <Facet title="Category" rows={facets.categories} />
    </div>
  );
}
