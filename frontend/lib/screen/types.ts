// Types for the live screening path (send a payment -> engine verdict).
// ScreenedCase is structurally identical to a lib/mock MockCase plus a little
// provenance, so the Queue/Graph/Inspector render a live case exactly like a
// seed one.

import type {
  CaseSummary,
  DecisionPolicy,
  EntityProfile,
  Exposure,
  GraphData,
  Verdict,
} from "@/lib/engine/types";

export type ScreenScenario = "on_ramp" | "off_ramp" | "fiat";

export interface ScreenParty {
  name?: string;
  wallet?: string;
  country?: string;
  reg_no?: string;
}

// what the form POSTs to /api/screen
export interface ScreenPayload {
  scenario: ScreenScenario;
  amount?: string;
  asset?: string; // crypto
  currency?: string; // fiat
  originator: ScreenParty;
  beneficiary: ScreenParty;
  ownershipNode?: string; // explicit UBO node (preset); else looked up by name
  requestId?: string; // stable id (e.g. the demo case) so re-runs replace, not pile up
}

// ── raw shapes returned by the Python service ──────────────────────────────
export interface LiveCorner {
  corner: string;
  signal: string;
  score: number;
  evidence: Record<string, unknown>;
}
export interface LiveVerdict {
  request_id: string;
  verdict: "MATCH" | "REVIEW" | "NO_MATCH";
  score: number;
  corners: LiveCorner[];
  list_version: string;
  audit_id: string;
  explanation: string;
  timestamp: string;
}
export interface LiveNode {
  id: string;
  label: string;
  type: string;
  sanctioned: boolean;
  category: string;
}
export interface LiveEdge {
  src: string;
  dst: string;
  value: number | null;
  kind: string;
  tainted: boolean;
  label_override?: string;
}
export interface LiveScreenResponse {
  verdict: LiveVerdict;
  policyVersion: string;
  subject_id: string | null;
  sanctioned_source: string | null;
  ownership_node: string | null;
  subgraph: { nodes: LiveNode[]; edges: LiveEdge[] };
  request: {
    scenario: ScreenScenario;
    rail: "crypto" | "fiat";
    amount: string;
    asset: string | null;
    currency: string | null;
    originator: ScreenParty;
    beneficiary: ScreenParty;
  };
}

// ── the mapped, UI-ready case ──────────────────────────────────────────────
export interface ScreenedCase {
  summary: CaseSummary;
  corridor: string;
  time: string;
  verdict: Verdict; // carries corners
  graph: GraphData;
  profiles: EntityProfile[];
  exposures: { node: string; exposure: Exposure }[];
  policy: DecisionPolicy;
  sar: string;
  subjectId: string;
  via: "live" | "mock";
}
