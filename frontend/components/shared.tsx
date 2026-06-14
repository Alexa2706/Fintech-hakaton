// Shared design-token maps + tiny presentational atoms used across the
// signature visuals. Everything here routes through semantic tokens — no hex.

import {
  Building2,
  Landmark,
  User,
  Wallet,
  Car,
  Network,
  ArrowRightLeft,
  Shuffle,
  type LucideIcon,
} from "lucide-react";
import type {
  ExposureCategory,
  GNodeType,
  Outcome,
} from "@/lib/engine/types";
import { cn } from "@/lib/utils";

// node type -> lucide glyph (Gotham icon tiles)
export const NODE_ICON: Record<GNodeType, LucideIcon> = {
  person: User,
  company: Building2,
  bank: Landmark,
  wallet: Wallet,
  exchange: ArrowRightLeft,
  mixer: Shuffle,
  address: Wallet,
  vehicle: Car,
  org: Network,
};

// exposure category -> dot background class (small dots only, never large fills)
export const CAT_DOT: Record<ExposureCategory, string> = {
  sanctioned: "bg-cat-sanctioned",
  mixer: "bg-cat-mixer",
  darknet: "bg-cat-darknet",
  "high-risk": "bg-cat-high-risk",
  exchange: "bg-cat-exchange",
  clean: "bg-cat-clean",
};

// exposure category -> bar fill class (slim bars in ExposureBars)
export const CAT_BAR: Record<ExposureCategory, string> = {
  sanctioned: "bg-cat-sanctioned",
  mixer: "bg-cat-mixer",
  darknet: "bg-cat-darknet",
  "high-risk": "bg-cat-high-risk",
  exchange: "bg-cat-exchange",
  clean: "bg-cat-clean",
};

// stable display order: risk-bearing categories on top
export const CAT_ORDER: ExposureCategory[] = [
  "sanctioned",
  "mixer",
  "darknet",
  "high-risk",
  "exchange",
  "clean",
];

// human-in-the-loop disposition (REVIEW cases)
export type ReviewAction = "RELEASE" | "ESCALATE" | "BLOCK";
export interface Decision {
  action: ReviewAction;
  at: string; // ISO timestamp
  via: "agent" | "analyst";
}
export const ACTION_STYLE: Record<
  ReviewAction,
  { outline: string; solid: string }
> = {
  RELEASE: {
    outline: "border-risk-low/50 text-risk-low hover:bg-risk-low-wash",
    solid: "bg-risk-low-wash text-risk-low border-risk-low/50",
  },
  ESCALATE: {
    outline: "border-risk-med/50 text-risk-med hover:bg-risk-med-wash",
    solid: "bg-risk-med-wash text-risk-med border-risk-med/50",
  },
  BLOCK: {
    outline: "border-risk-high/50 text-risk-high hover:bg-risk-high-wash",
    solid: "bg-risk-high-wash text-risk-high border-risk-high/50",
  },
};

export type RiskLevel = "high" | "med" | "low";

export const OUTCOME_RISK: Record<Outcome, RiskLevel> = {
  MATCH: "high",
  REVIEW: "med",
  NO_MATCH: "low",
};

// verdict pill: faint semantic wash bg + solid semantic text (DESIGN §7.4)
export const RISK_PILL: Record<RiskLevel, string> = {
  high: "bg-risk-high-wash text-risk-high border-risk-high/40",
  med: "bg-risk-med-wash text-risk-med border-risk-med/40",
  low: "bg-risk-low-wash text-risk-low border-risk-low/40",
};

export const RISK_DOT: Record<RiskLevel, string> = {
  high: "bg-risk-high",
  med: "bg-risk-med",
  low: "bg-risk-low",
};

// --- atoms -----------------------------------------------------------------

// section label (`OBJECT TYPES`) — 11px/600 uppercase tracked, muted
export function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "select-none text-[11px] font-semibold uppercase tracking-[0.08em] text-muted",
        className,
      )}
    >
      {children}
    </div>
  );
}

// slim horizontal bar with a hairline track — the shared bar language
export function Bar({
  value,
  max,
  fill = "bg-accent",
  className,
}: {
  value: number;
  max: number;
  fill?: string;
  className?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={cn("h-1 w-full bg-hairline", className)}>
      <div className={cn("h-full", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function CategoryDot({ category }: { category: ExposureCategory }) {
  return (
    <span
      className={cn("inline-block size-1.5 shrink-0", CAT_DOT[category])}
      aria-hidden
    />
  );
}

// outcome pill — faint semantic wash + solid text, optional mono taint %
export function OutcomePill({
  outcome,
  taint,
  className,
}: {
  outcome: Outcome;
  taint?: number;
  className?: string;
}) {
  const risk = OUTCOME_RISK[outcome];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em]",
        RISK_PILL[risk],
        className,
      )}
    >
      {outcome}
      {taint !== undefined && (
        <span className="font-mono tnum font-normal opacity-80">
          {(taint * 100).toFixed(1)}%
        </span>
      )}
    </span>
  );
}
