// Plain-language regulation briefs + the project's data strategy, exposed to the
// grounded agent as a research tool. This is the "adapt to new policies" claim
// made concrete: the agent can look up a regulation and say, in human language,
// what it requires and how throughline's four-corner engine already covers — or
// versions its policy to meet — it.
//
// The demo serves curated, grounded briefs (deterministic, no hallucinated law).
// Behind the SAME tool, DeepSeek can do live web research later — same shape, so
// the seam doesn't change. Every mapping below is true to what the engine does.

export interface PolicyBrief {
  id: string;
  name: string;
  jurisdiction: string;
  status: string;
  requires: string[]; // what the law demands, plain language
  coveredBy: string; // how this engine already addresses it
}

export const POLICY_LIBRARY: PolicyBrief[] = [
  {
    id: "genius-act",
    name: "GENIUS Act",
    jurisdiction: "United States (federal)",
    status:
      "Enacted; payment-stablecoin issuers must meet identity & AML duties on a phased schedule, with the issuer-compliance deadline landing in 2026.",
    requires: [
      "Verify the identity of stablecoin customers (KYC).",
      "Track and screen every transaction for sanctions and financial crime.",
      "Block dealings tied to sanctioned parties.",
    ],
    coveredBy:
      "Identity is the originator and beneficiary corners (name + KYC match); transaction tracing is the source-of-funds and destination corners over the crypto graph; OFAC sanctions screening is built in. One screen returns block / review / release with the traced path and the list and policy versions it used.",
  },
  {
    id: "travel-rule",
    name: "FATF Travel Rule",
    jurisdiction: "Global (FATF Recommendation 16)",
    status: "In force across FATF member jurisdictions.",
    requires: [
      "Originator and beneficiary information must travel with a transfer above the threshold, and both must be screened.",
    ],
    coveredBy:
      "The originator-identity and beneficiary-identity corners model exactly the sender and the receiver, resolved to named parties — the two ends the Travel Rule asks you to carry and screen.",
  },
  {
    id: "ofac-50",
    name: "OFAC 50 Percent Rule",
    jurisdiction: "United States (OFAC)",
    status: "Standing OFAC guidance.",
    requires: [
      "An entity owned 50% or more in aggregate by sanctioned persons is itself blocked, even when it is not named on any list.",
    ],
    coveredBy:
      "The fiat beneficial-ownership graph computes effective percentage ownership through intermediate holders, so a hidden controller is surfaced; the block threshold sits on the 50% control line. (The Volga Resource Partners case: 55% effective sanctioned control through a shell, decided as a block.)",
  },
  {
    id: "mica",
    name: "MiCA",
    jurisdiction: "European Union",
    status: "In force for crypto-asset service providers.",
    requires: [
      "Crypto-asset service providers must run AML controls and carry transfer-of-funds information for crypto transfers.",
    ],
    coveredBy:
      "The same unified engine runs on the crypto rail; the sanctions-list version and the decision policy are configurable per jurisdiction, so meeting an EU rule is a versioned policy swap, not a new system.",
  },
  {
    id: "bsa-sar",
    name: "BSA / SAR filing",
    jurisdiction: "United States (FinCEN)",
    status: "In force.",
    requires: [
      "File a Suspicious Activity Report when screening surfaces suspicious activity.",
    ],
    coveredBy:
      "The draft_sar tool assembles a DRAFT report from the case evidence — verdict, traced path, list and policy versions — for an analyst to validate and file. The machine drafts; the human signs.",
  },
];

export interface DataStrategy {
  sources: string[];
  alreadyWired: string[];
  adapts: string;
  thesis: string;
}

// The honest answer to "is your data real / where does it come from". The point:
// the hard part is the engine, not the data — the data already exists.
export const DATA_STRATEGY: DataStrategy = {
  sources: [
    "The firm's existing customer / KYC master — identities are already collected at onboarding.",
    "The firm's transaction ledger and payment rails — every payment is already recorded.",
    "Corporate-registry and beneficial-ownership feeds for the fiat side.",
    "Public on-chain transaction graphs for the crypto side.",
    "Public sanctions lists (OFAC SDN and equivalents).",
  ],
  alreadyWired: [
    "The OFAC SDN list (19,000+ entries) ships and is screened directly.",
    "Crypto transaction graphs and beneficial-ownership graphs are read behind one engine contract — the same shape whether the source is a file, a feed, or a live service.",
  ],
  adapts:
    "A new regulation does not mean new plumbing. The agent researches the rule, and the decision policy is re-versioned — taint thresholds, corner weights and the sanctions-list version are all configuration, and every verdict is pinned to those versions for audit and reproducibility.",
  thesis:
    "The hard, defensible part is the unified four-corner reasoning engine and the grounded agent — those exist. Data is an integration layer into sources a compliance desk already holds in structured form. Data is the smallest problem here, not the differentiator.",
};

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type ResearchResult =
  | { kind: "data_strategy"; strategy: DataStrategy }
  | { kind: "policy"; brief: PolicyBrief }
  | {
      kind: "catalogue";
      available: { id: string; name: string }[];
      note: string;
    };

// The research tool's brain. Routes a free-text query to the data-strategy brief
// or the best-matching regulation; falls back to the catalogue so the agent is
// never left guessing about a law from memory.
export function researchPolicy(query: string): ResearchResult {
  const q = norm(query || "");
  if (/\b(data|dataset|datasets|source|sources|provenance|real)\b/.test(q)) {
    return { kind: "data_strategy", strategy: DATA_STRATEGY };
  }
  const hit = POLICY_LIBRARY.find((p) => {
    const hay = norm(`${p.name} ${p.id} ${p.jurisdiction}`);
    return q.split(" ").some((w) => w.length >= 3 && hay.includes(w));
  });
  if (hit) return { kind: "policy", brief: hit };
  return {
    kind: "catalogue",
    available: POLICY_LIBRARY.map((p) => ({ id: p.id, name: p.name })),
    note: "No exact match. Ask about one of these by name, or ask how the engine handles a specific requirement (identity, transaction tracing, ownership %, SAR filing).",
  };
}
