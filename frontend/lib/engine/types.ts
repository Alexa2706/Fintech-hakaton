// THE CONTRACT (the seam). Mock now, real algorithms / Python HTTP service later —
// same shapes. When teammates ship real engines, only `lib/engine/index.ts` changes;
// nothing that consumes these types should need to.

export type Outcome = "MATCH" | "REVIEW" | "NO_MATCH";
export type Rail = "crypto" | "fiat";

export interface Verdict {
  caseId: string;
  outcome: Outcome;
  taint: number; // 0..1 fraction of value/ownership tracing to a sanctioned source
  reasons: Reason[];
  hops: number;
  sanctionedSource?: string; // node id; absent on NO_MATCH (no sanctioned path)
  listVersion: string; // pins verdict to a dated list (reproducibility)
  policyVersion: string; // pins verdict to a documented threshold policy
  // CONTRACT EXTENSION (beyond CLAUDE.md): reproducibility hash over
  // (path + reasons + listVersion + policyVersion). The DESIGN.md audit line
  // surfaces it; a real engine emits one too. Kept on the contract so the
  // mock→real swap stays invisible.
  decisionHash: string;
  // CONTRACT EXTENSION: the real engine's four-corner decomposition
  // (originator identity · source funds · beneficiary identity · destination).
  // Optional — seed/mock cases use `reasons` only; live verdicts carry both.
  corners?: Corner[];
}

// The four-corner risk decomposition emitted by the real (fuse) engine.
export type CornerSignal = "clean" | "low" | "review" | "flagged";
export interface Corner {
  key: string; // "originator_identity" | "source_funds" | "beneficiary_identity" | "destination"
  label: string; // human label
  signal: CornerSignal;
  score: number; // 0..1
  detail?: string; // one-line evidence summary
}

export interface Reason {
  code: string;
  detail: string;
  weight: number; // contribution to taint (tainted reasons roughly sum to `taint`)
}

export interface GraphData {
  nodes: GNode[];
  edges: GEdge[];
}

// Node icon type for the Gotham canvas. CONTRACT EXTENSION explicitly sanctioned
// by the Phase 0 prompt (person/company/bank/address/vehicle/org).
export type GNodeType =
  | "person" // a named/KYC'd party — what name-matching screens
  | "company"
  | "bank"
  | "wallet" // a crypto vault/address — what taint-tracing hops between
  | "exchange"
  | "mixer"
  | "address" // legacy alias for wallet
  | "vehicle"
  | "org";

export interface GNode {
  id: string;
  label: string;
  role: "san" | "mid" | "dest" | "clean";
  type: GNodeType;
  x: number; // 0..800 layout space
  y: number; // 0..500 layout space
}

export interface GEdge {
  from: string;
  to: string;
  label: string; // BTC/USDC amount (crypto) or ownership % (fiat)
  tainted: boolean;
  // CONTRACT EXTENSION: which of the two graphs this edge belongs to —
  // "transaction" = crypto value flow, "ownership" = fiat UBO %. Optional:
  // seed fixtures omit it (rail is inferred from label/node type in
  // lib/engine/graph.ts); the live engine emits it exactly. Lets the agent
  // reason over the crypto graph and the fiat graph separately.
  kind?: "transaction" | "ownership";
}

export interface EntityProfile {
  id: string;
  label: string;
  rail: Rail;
  category: string;
  rootRef: string; // address (crypto) or registry id (fiat)
  sanctioned: boolean;
  stats: Record<string, string>; // mono-friendly, display-as-is figures
}

export interface Exposure {
  // the Reactor-style breakdown: % of flow by category, split by direction.
  receiving: ExposureSlice[];
  sending: ExposureSlice[];
  tracedUsd?: number;
}

export type ExposureCategory =
  | "sanctioned"
  | "mixer"
  | "darknet"
  | "high-risk"
  | "exchange"
  | "clean";

export interface ExposureSlice {
  category: ExposureCategory;
  pct: number; // each side sums to ~100
  risk: "high" | "medium" | "low";
}

export interface DecisionPolicy {
  version: string;
  reviewAt: number; // taint >= reviewAt  -> REVIEW
  blockAt: number; // taint >= blockAt   -> MATCH (block)
  rationale: string;
}

export interface CaseSummary {
  id: string;
  party: string;
  rail: Rail;
  amount: string;
  outcome: Outcome;
}

// The engine the UI + agent talk to. Mock now; real (or Python HTTP) later — same shape.
export interface Engine {
  listCases(): CaseSummary[];
  getVerdict(caseId: string): Verdict;
  getPath(caseId: string): GraphData;
  getEntity(nodeId: string): EntityProfile;
  getExposure(nodeId: string): Exposure;
  explainScore(caseId: string): {
    reasons: Reason[];
    policy: DecisionPolicy;
    taint: number;
  };
  draftSar(caseId: string): string;
}
