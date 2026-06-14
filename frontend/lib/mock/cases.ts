// Mock fixtures for the throughline screening console.
//
// These are authored to be STRUCTURALLY IDENTICAL to future real-engine output
// (so the swap behind the contract is invisible) and INTERNALLY COHERENT:
//
//   taint  ==  Σ (receiving exposure slices with risk === "high")
//   outcome falls out of POLICY thresholds (5% review / 50% block) — never authored against taint
//   tainted cases carry a sanctioned node + a traceable tainted edge path to the subject
//   verdict.sanctionedSource === that node id;  verdict.hops === path length
//   reason weights roughly sum to taint
//
// No engine math here — the values are authored; the mock just serves them.
// The real proportional ("haircut") backward-taint trace lands later behind the
// same contract.

import type {
  CaseSummary,
  DecisionPolicy,
  EntityProfile,
  Exposure,
  GraphData,
  Verdict,
} from "@/lib/engine/types";

// Single policy shared by every case. Outcomes are derived from this, never hand-set.
export const POLICY: DecisionPolicy = {
  version: "POL-2026.2",
  reviewAt: 0.05,
  blockAt: 0.5,
  rationale:
    "Block at >=50% sanctioned taint; route 5-50% to human review; release below 5%.",
};

// Internal fixture shape. Not part of the contract — the Engine methods below
// project this onto contract types. (corridor/time are authored case metadata
// the UI can surface later; no Engine method exposes them yet.)
export interface MockCase {
  summary: CaseSummary;
  corridor: string;
  time: string;
  verdict: Verdict;
  graph: GraphData;
  profiles: EntityProfile[]; // EntityProfile.id === node id
  exposures: { node: string; exposure: Exposure }[];
  sar: string;
}

// ---------------------------------------------------------------------------
// CASE 1 — CRYPTO · NO_MATCH · taint 1.8%
// Inbound is exchange/clean; a faint darknet trace dead-ends below the 5% line.
// No sanctioned node, no tainted edges.
// ---------------------------------------------------------------------------
const case0412: MockCase = {
  summary: {
    id: "CASE-2026-0412",
    party: "Northwind OTC Desk",
    rail: "crypto",
    amount: "12.4 BTC",
    outcome: "NO_MATCH",
  },
  corridor: "EU → AE",
  time: "2026-06-12 09:14 UTC",
  verdict: {
    caseId: "CASE-2026-0412",
    outcome: "NO_MATCH",
    taint: 0.018,
    hops: 0,
    reasons: [
      {
        code: "NO_SANCTIONED_PATH",
        detail:
          "No sanctioned source reachable within 6 hops of the subject address.",
        weight: 0,
      },
      {
        code: "LOW_RISK_RESIDUAL_EXPOSURE",
        detail:
          "1.8% of inbound value traces to a darknet-flagged P2P cluster; below the 5% review threshold and dead-ends without a sanctioned origin.",
        weight: 0.018,
      },
    ],
    listVersion: "OFAC-SDN-2026-06-10",
    policyVersion: "POL-2026.2",
    decisionHash: "sha256:1b7e…c40a",
  },
  graph: {
    nodes: [
      { id: "n1-user", label: "Northwind OTC Desk", role: "clean", type: "person", x: 720, y: 110 },
      { id: "n1-subj", label: "Northwind hot wallet", role: "dest", type: "wallet", x: 720, y: 270 },
      { id: "n1-ex1", label: "Kraken Hot Wallet", role: "clean", type: "exchange", x: 130, y: 150 },
      { id: "n1-ex2", label: "Coinbase Prime", role: "clean", type: "exchange", x: 130, y: 390 },
      { id: "n1-dn", label: "P2P Cluster (flagged)", role: "mid", type: "wallet", x: 410, y: 270 },
    ],
    edges: [
      { from: "n1-user", to: "n1-subj", label: "controls", tainted: false },
      { from: "n1-ex1", to: "n1-subj", label: "5.2 BTC", tainted: false },
      { from: "n1-ex2", to: "n1-subj", label: "6.0 BTC", tainted: false },
      { from: "n1-dn", to: "n1-subj", label: "0.22 BTC", tainted: false },
    ],
  },
  profiles: [
    {
      id: "n1-subj",
      label: "Northwind hot wallet",
      rail: "crypto",
      category: "exchange",
      rootRef: "bc1qar2k9hf3xq7l0v8m4t2pn6yj5wq3z8c0d4f7gh",
      sanctioned: false,
      stats: {
        balance: "18.40 BTC",
        sent: "402.16 BTC",
        received: "420.56 BTC",
        fees: "0.31 BTC",
        transfers: "1,284",
        deposits: "612",
        addresses: "47",
      },
    },
    {
      id: "n1-dn",
      label: "P2P Cluster (flagged)",
      rail: "crypto",
      category: "darknet",
      rootRef: "bc1q9f4d2x8m0lq7v3t6yn5pj2wq8z0c4h7gk3a1f6",
      sanctioned: false,
      stats: {
        balance: "2.07 BTC",
        sent: "88.92 BTC",
        received: "90.99 BTC",
        fees: "0.12 BTC",
        transfers: "640",
        deposits: "318",
        addresses: "129",
      },
    },
  ],
  exposures: [
    {
      node: "n1-subj",
      exposure: {
        receiving: [
          { category: "clean", pct: 80.2, risk: "low" },
          { category: "exchange", pct: 18.0, risk: "low" },
          { category: "darknet", pct: 1.8, risk: "high" },
        ],
        sending: [
          { category: "clean", pct: 71.0, risk: "low" },
          { category: "exchange", pct: 29.0, risk: "low" },
        ],
        tracedUsd: 812_000,
      },
    },
  ],
  sar: "DRAFT — Subject address (Northwind OTC Desk) received 12.4 BTC inbound across the review window, 98.2% sourced from regulated exchange and clean counterparties. A residual 1.8% (0.22 BTC) traces to a darknet-flagged P2P cluster but dead-ends with no sanctioned origin within six hops. Exposure sits below the POL-2026.2 review threshold (5%); screened against OFAC-SDN-2026-06-10 with no list hits. Recommendation: release; no filing warranted on current evidence.",
};

// ---------------------------------------------------------------------------
// CASE 2 — CRYPTO · REVIEW · taint 23%
// SDN wallet → mixer → bridge relay → subject (3 hops). Indirect exposure.
// ---------------------------------------------------------------------------
const case0418: MockCase = {
  summary: {
    id: "CASE-2026-0418",
    party: "Meridian OTC",
    rail: "crypto",
    amount: "8.7 BTC",
    outcome: "REVIEW",
  },
  corridor: "AE → KY",
  time: "2026-06-11 16:42 UTC",
  verdict: {
    caseId: "CASE-2026-0418",
    outcome: "REVIEW",
    taint: 0.23,
    hops: 3,
    sanctionedSource: "n2-san",
    reasons: [
      {
        code: "INDIRECT_SANCTIONED_EXPOSURE",
        detail:
          "23% of inbound value traces to an OFAC-SDN wallet three hops upstream via a mixing service.",
        weight: 0.15,
      },
      {
        code: "MIXER_HOP",
        detail:
          "Tainted flow passes through a high-throughput mixer, obscuring origin between the SDN source and the subject.",
        weight: 0.06,
      },
      {
        code: "STRUCTURING_PATTERN",
        detail:
          "Inbound split into sub-threshold tranches consistent with structuring.",
        weight: 0.02,
      },
    ],
    listVersion: "OFAC-SDN-2026-06-10",
    policyVersion: "POL-2026.2",
    decisionHash: "sha256:7a31…9be2",
  },
  graph: {
    nodes: [
      { id: "n2-sdnname", label: "Sergey Mendel (OFAC-SDN)", role: "san", type: "person", x: 95, y: 70 },
      { id: "n2-san", label: "SDN Wallet (Garantex-linked)", role: "san", type: "wallet", x: 95, y: 210 },
      { id: "n2-mix", label: "Mixer Pool", role: "mid", type: "mixer", x: 310, y: 150 },
      { id: "n2-relay", label: "Bridge Relayer", role: "mid", type: "wallet", x: 510, y: 220 },
      { id: "n2-subj", label: "Meridian hot wallet", role: "dest", type: "wallet", x: 720, y: 300 },
      { id: "n2-user", label: "Meridian OTC", role: "clean", type: "person", x: 720, y: 150 },
      { id: "n2-ex", label: "Binance Hot Wallet", role: "clean", type: "exchange", x: 320, y: 410 },
    ],
    edges: [
      { from: "n2-sdnname", to: "n2-san", label: "controls", tainted: false },
      { from: "n2-san", to: "n2-mix", label: "3.1 BTC", tainted: true },
      { from: "n2-mix", to: "n2-relay", label: "2.0 BTC", tainted: true },
      { from: "n2-relay", to: "n2-subj", label: "2.0 BTC", tainted: true },
      { from: "n2-user", to: "n2-subj", label: "controls", tainted: false },
      { from: "n2-ex", to: "n2-subj", label: "6.7 BTC", tainted: false },
    ],
  },
  profiles: [
    {
      id: "n2-subj",
      label: "Meridian hot wallet",
      rail: "crypto",
      category: "exchange",
      rootRef: "bc1qm3r1d8n0xq4l7v2t6yp5wj9z0c8h3k4a7f1g6d",
      sanctioned: false,
      stats: {
        balance: "9.12 BTC",
        sent: "611.40 BTC",
        received: "620.52 BTC",
        fees: "0.48 BTC",
        transfers: "2,041",
        deposits: "903",
        addresses: "76",
      },
    },
    {
      id: "n2-san",
      label: "SDN Wallet (Garantex-linked)",
      rail: "crypto",
      category: "sanctioned",
      rootRef: "bc1qg4r2n7x8t0lq3v6m9yp2wj5z8c0h4k7a1f3g6d",
      sanctioned: true,
      stats: {
        balance: "41.80 BTC",
        sent: "5,902.14 BTC",
        received: "5,943.94 BTC",
        fees: "1.37 BTC",
        transfers: "9,118",
        deposits: "6,402",
        addresses: "884",
      },
    },
  ],
  exposures: [
    {
      node: "n2-subj",
      exposure: {
        receiving: [
          { category: "sanctioned", pct: 11.0, risk: "high" },
          { category: "mixer", pct: 8.0, risk: "high" },
          { category: "darknet", pct: 4.0, risk: "high" },
          { category: "exchange", pct: 60.0, risk: "low" },
          { category: "clean", pct: 17.0, risk: "low" },
        ],
        sending: [
          { category: "exchange", pct: 64.0, risk: "low" },
          { category: "clean", pct: 36.0, risk: "low" },
        ],
        tracedUsd: 571_000,
      },
    },
    {
      node: "n2-san",
      exposure: {
        receiving: [
          { category: "sanctioned", pct: 58.0, risk: "high" },
          { category: "darknet", pct: 22.0, risk: "high" },
          { category: "mixer", pct: 12.0, risk: "high" },
          { category: "clean", pct: 8.0, risk: "low" },
        ],
        sending: [
          { category: "mixer", pct: 47.0, risk: "high" },
          { category: "exchange", pct: 33.0, risk: "low" },
          { category: "clean", pct: 20.0, risk: "low" },
        ],
        tracedUsd: 3_940_000,
      },
    },
  ],
  sar: "DRAFT — Subject (Meridian OTC) received 8.7 BTC inbound; 23% traces to an OFAC-SDN wallet (Garantex-linked) three hops upstream through a mixing service and a bridge relayer. Tainted tranches (2.0 BTC) were routed sub-threshold, consistent with structuring. Exposure (23%) sits in the POL-2026.2 review band (5–50%) — above release, below block. Screened against OFAC-SDN-2026-06-10. Recommendation: route to human review; corroborate the mixer attribution before disposition.",
};

// ---------------------------------------------------------------------------
// CASE 3 — CRYPTO · MATCH · taint 68%
// Direct SDN counterparty (3.2 BTC) plus 18 BTC from the same source via mixer.
// ---------------------------------------------------------------------------
const case0421: MockCase = {
  summary: {
    id: "CASE-2026-0421",
    party: "Apex Trading",
    rail: "crypto",
    amount: "31.2 BTC",
    outcome: "MATCH",
  },
  corridor: "RU → AE",
  time: "2026-06-13 11:05 UTC",
  verdict: {
    caseId: "CASE-2026-0421",
    outcome: "MATCH",
    taint: 0.68,
    hops: 1,
    sanctionedSource: "n3-san",
    reasons: [
      {
        code: "DIRECT_SANCTIONED_COUNTERPARTY",
        detail:
          "Subject received 3.2 BTC directly from an OFAC-SDN wallet (one hop, no intermediary).",
        weight: 0.42,
      },
      {
        code: "MIXER_HOP",
        detail:
          "A further 18.0 BTC from the same SDN source reached the subject through the Sinbad mixer.",
        weight: 0.2,
      },
      {
        code: "HIGH_VALUE_SANCTIONED_FLOW",
        detail:
          "Sanctioned-origin value exceeds 21 BTC — 68% of total inbound to the subject.",
        weight: 0.06,
      },
    ],
    listVersion: "OFAC-SDN-2026-06-10",
    policyVersion: "POL-2026.2",
    decisionHash: "sha256:c0d9…4f18",
  },
  graph: {
    nodes: [
      { id: "n3-sdnname", label: "Roman Sayko (OFAC-SDN)", role: "san", type: "person", x: 95, y: 110 },
      { id: "n3-san", label: "SDN Wallet (Hydra-linked)", role: "san", type: "wallet", x: 95, y: 270 },
      { id: "n3-mix", label: "Sinbad Mixer", role: "mid", type: "mixer", x: 390, y: 130 },
      { id: "n3-subj", label: "Apex hot wallet", role: "dest", type: "wallet", x: 720, y: 280 },
      { id: "n3-user", label: "Apex Trading", role: "clean", type: "person", x: 720, y: 120 },
      { id: "n3-ex", label: "OKX Hot Wallet", role: "clean", type: "exchange", x: 390, y: 410 },
    ],
    edges: [
      { from: "n3-sdnname", to: "n3-san", label: "controls", tainted: false },
      { from: "n3-san", to: "n3-mix", label: "18.0 BTC", tainted: true },
      { from: "n3-mix", to: "n3-subj", label: "18.0 BTC", tainted: true },
      { from: "n3-san", to: "n3-subj", label: "3.2 BTC", tainted: true },
      { from: "n3-user", to: "n3-subj", label: "controls", tainted: false },
      { from: "n3-ex", to: "n3-subj", label: "10.0 BTC", tainted: false },
    ],
  },
  profiles: [
    {
      id: "n3-subj",
      label: "Apex hot wallet",
      rail: "crypto",
      category: "exchange",
      rootRef: "bc1qap3x7t2n0lq8v4m6yp9wj1z5c3h0k4a7f2g6d",
      sanctioned: false,
      stats: {
        balance: "44.10 BTC",
        sent: "1,204.55 BTC",
        received: "1,248.65 BTC",
        fees: "0.84 BTC",
        transfers: "3,912",
        deposits: "1,087",
        addresses: "214",
      },
    },
    {
      id: "n3-san",
      label: "SDN Wallet (Hydra-linked)",
      rail: "crypto",
      category: "sanctioned",
      rootRef: "bc1qhy2d8r4x0tq6l3v9m2yp7wj4z0c8h1k5a3f7g",
      sanctioned: true,
      stats: {
        balance: "12.30 BTC",
        sent: "8,420.00 BTC",
        received: "8,432.30 BTC",
        fees: "2.11 BTC",
        transfers: "12,884",
        deposits: "9,210",
        addresses: "1,043",
      },
    },
  ],
  exposures: [
    {
      node: "n3-subj",
      exposure: {
        receiving: [
          { category: "sanctioned", pct: 50.0, risk: "high" },
          { category: "mixer", pct: 12.0, risk: "high" },
          { category: "darknet", pct: 6.0, risk: "high" },
          { category: "exchange", pct: 25.0, risk: "low" },
          { category: "clean", pct: 7.0, risk: "low" },
        ],
        sending: [
          { category: "exchange", pct: 55.0, risk: "low" },
          { category: "clean", pct: 45.0, risk: "low" },
        ],
        tracedUsd: 2_046_000,
      },
    },
    {
      node: "n3-san",
      exposure: {
        receiving: [
          { category: "sanctioned", pct: 64.0, risk: "high" },
          { category: "darknet", pct: 26.0, risk: "high" },
          { category: "mixer", pct: 6.0, risk: "high" },
          { category: "clean", pct: 4.0, risk: "low" },
        ],
        sending: [
          { category: "mixer", pct: 52.0, risk: "high" },
          { category: "exchange", pct: 30.0, risk: "low" },
          { category: "clean", pct: 18.0, risk: "low" },
        ],
        tracedUsd: 552_800_000,
      },
    },
  ],
  sar: "DRAFT — Subject (Apex Trading) received 31.2 BTC inbound; 68% traces to an OFAC-SDN wallet (Hydra-linked). 3.2 BTC arrived directly from the SDN address (one hop) and a further 18.0 BTC via the Sinbad mixer from the same source. Sanctioned-origin value exceeds 21 BTC. Exposure (68%) clears the POL-2026.2 block threshold (50%). Screened against OFAC-SDN-2026-06-10. Recommendation: block and file; direct sanctioned counterparty present.",
};

// ---------------------------------------------------------------------------
// CASE 4 — FIAT · NO_MATCH · taint 0.9%
// Clean two-person UBO chain; residual <1% from a high-risk jurisdiction tie.
// ---------------------------------------------------------------------------
const case0407: MockCase = {
  summary: {
    id: "CASE-2026-0407",
    party: "Brightwater Trading GmbH",
    rail: "fiat",
    amount: "€2,450,000",
    outcome: "NO_MATCH",
  },
  corridor: "DE → NL",
  time: "2026-06-09 10:20 UTC",
  verdict: {
    caseId: "CASE-2026-0407",
    outcome: "NO_MATCH",
    taint: 0.009,
    hops: 0,
    reasons: [
      {
        code: "NO_SANCTIONED_UBO",
        detail:
          "No beneficial owner at or above 10% appears on any screened sanctions list.",
        weight: 0,
      },
      {
        code: "CLEAN_OWNERSHIP_CHAIN",
        detail:
          "UBO chain fully resolved to two natural persons (DE/NL); 0.9% residual risk from a minority owner's high-risk-jurisdiction tie, below the 5% review threshold.",
        weight: 0.009,
      },
    ],
    listVersion: "OFAC-SDN-2026-06-10",
    policyVersion: "POL-2026.2",
    decisionHash: "sha256:2e64…b8a1",
  },
  graph: {
    nodes: [
      { id: "n4-o1", label: "Lena Brandt", role: "clean", type: "person", x: 90, y: 110 },
      { id: "n4-brandt", label: "Brandt Beteiligungen GmbH", role: "clean", type: "company", x: 360, y: 130 },
      { id: "n4-o2", label: "Markus Feld", role: "clean", type: "person", x: 90, y: 330 },
      { id: "n4-feld", label: "Feld Invest Ltd", role: "clean", type: "company", x: 360, y: 330 },
      { id: "n4-subj", label: "Brightwater Trading GmbH", role: "dest", type: "company", x: 620, y: 230 },
      { id: "n4-bank", label: "Commerzbank AG", role: "clean", type: "bank", x: 765, y: 230 },
    ],
    edges: [
      { from: "n4-o1", to: "n4-brandt", label: "100%", tainted: false },
      { from: "n4-brandt", to: "n4-subj", label: "60%", tainted: false },
      { from: "n4-o2", to: "n4-feld", label: "100%", tainted: false },
      { from: "n4-feld", to: "n4-subj", label: "40%", tainted: false },
      { from: "n4-subj", to: "n4-bank", label: "settlement", tainted: false },
    ],
  },
  profiles: [
    {
      id: "n4-subj",
      label: "Brightwater Trading GmbH",
      rail: "fiat",
      category: "clean",
      rootRef: "DE-HRB-08842",
      sanctioned: false,
      stats: {
        entityType: "GmbH",
        incorporated: "2017-04-19",
        jurisdictions: "DE · NL",
        directOwnership: "100% resolved",
        beneficialOwners: "2",
        registry: "DE-HRB-08842",
      },
    },
    {
      id: "n4-o2",
      label: "Markus Feld",
      rail: "fiat",
      category: "high-risk",
      rootRef: "NL-PERSON-44021",
      sanctioned: false,
      stats: {
        nationality: "NL",
        directOwnership: "40%",
        listing: "none",
        pepStatus: "minority association",
        dob: "1979-11-02",
        jurisdictions: "NL · AE",
      },
    },
  ],
  exposures: [
    {
      node: "n4-subj",
      exposure: {
        receiving: [
          { category: "clean", pct: 99.1, risk: "low" },
          { category: "high-risk", pct: 0.9, risk: "high" },
        ],
        sending: [{ category: "clean", pct: 100.0, risk: "low" }],
        tracedUsd: 2_640_000,
      },
    },
  ],
  sar: "DRAFT — Subject (Brightwater Trading GmbH, DE-HRB-08842) ownership fully resolved to two natural persons in DE/NL, with no beneficial owner at or above 10% on any screened list. A 0.9% residual exposure stems from a minority (40%) owner's high-risk-jurisdiction tie, dead-ending below the 5% review threshold. Screened against OFAC-SDN-2026-06-10 with no list hits. Recommendation: release; no filing warranted on current evidence.",
};

// ---------------------------------------------------------------------------
// CASE 5 — FIAT · REVIEW · taint 18%
// SDN individual →30%→ Cyprus nominee →60%→ subject. Effective 18%.
// ---------------------------------------------------------------------------
const case0415: MockCase = {
  summary: {
    id: "CASE-2026-0415",
    party: "Stellaris Holdings Ltd",
    rail: "fiat",
    amount: "$1,800,000",
    outcome: "REVIEW",
  },
  corridor: "CY → AE",
  time: "2026-06-10 14:30 UTC",
  verdict: {
    caseId: "CASE-2026-0415",
    outcome: "REVIEW",
    taint: 0.18,
    hops: 2,
    sanctionedSource: "n5-san",
    reasons: [
      {
        code: "UBO_SANCTIONED_INDIRECT",
        detail:
          "An OFAC-SDN individual holds an effective 18% beneficial interest (30% of a 60% intermediate holder).",
        weight: 0.15,
      },
      {
        code: "OPAQUE_NOMINEE_STRUCTURE",
        detail:
          "Beneficial ownership is routed through a Cyprus nominee trust, obscuring the controlling party.",
        weight: 0.02,
      },
      {
        code: "HIGH_RISK_JURISDICTION",
        detail:
          "Intermediate holding incorporated in a jurisdiction with elevated sanctions-evasion risk.",
        weight: 0.01,
      },
    ],
    listVersion: "OFAC-SDN-2026-06-10",
    policyVersion: "POL-2026.2",
    decisionHash: "sha256:9f3c…a210",
  },
  graph: {
    nodes: [
      { id: "n5-san", label: "Arkady Volkov (OFAC-SDN)", role: "san", type: "person", x: 90, y: 90 },
      { id: "n5-petrov", label: "Dmitri Petrov", role: "clean", type: "person", x: 90, y: 230 },
      { id: "n5-nom", label: "Nicosia Nominee Trust", role: "mid", type: "company", x: 360, y: 150 },
      { id: "n5-o2", label: "Eleni Pappas", role: "clean", type: "person", x: 90, y: 400 },
      { id: "n5-pappas", label: "Pappas Holdings Ltd", role: "clean", type: "company", x: 360, y: 400 },
      { id: "n5-subj", label: "Stellaris Holdings Ltd", role: "dest", type: "company", x: 700, y: 270 },
    ],
    edges: [
      { from: "n5-san", to: "n5-nom", label: "30%", tainted: true },
      { from: "n5-petrov", to: "n5-nom", label: "50%", tainted: false },
      { from: "n5-nom", to: "n5-subj", label: "60%", tainted: true },
      { from: "n5-o2", to: "n5-pappas", label: "100%", tainted: false },
      { from: "n5-pappas", to: "n5-subj", label: "40%", tainted: false },
    ],
  },
  profiles: [
    {
      id: "n5-subj",
      label: "Stellaris Holdings Ltd",
      rail: "fiat",
      category: "high-risk",
      rootRef: "CY-HE-418207",
      sanctioned: false,
      stats: {
        entityType: "Private Ltd",
        incorporated: "2019-08-22",
        jurisdictions: "CY · AE · RU",
        directOwnership: "60% nominee / 40% natural",
        beneficialOwners: "2 (1 via nominee)",
        registry: "CY-HE-418207",
      },
    },
    {
      id: "n5-san",
      label: "Arkady Volkov (OFAC-SDN)",
      rail: "fiat",
      category: "sanctioned",
      rootRef: "RU-PERSON-SDN-1183",
      sanctioned: true,
      stats: {
        nationality: "RU",
        listing: "OFAC-SDN",
        sdnRef: "RU-PERSON-SDN-1183",
        effectiveInterest: "18%",
        dob: "1971-05-14",
        role: "Indirect beneficial owner",
      },
    },
    {
      id: "n5-nom",
      label: "Nicosia Nominee Trust",
      rail: "fiat",
      category: "high-risk",
      rootRef: "CY-HE-330145",
      sanctioned: false,
      stats: {
        entityType: "Nominee Trust",
        incorporated: "2015-02-11",
        jurisdictions: "CY",
        directOwnership: "60% of subject",
        beneficialOwners: "1 (Volkov, 30%)",
        registry: "CY-HE-330145",
      },
    },
  ],
  exposures: [
    {
      node: "n5-subj",
      exposure: {
        receiving: [
          { category: "sanctioned", pct: 18.0, risk: "high" },
          { category: "clean", pct: 82.0, risk: "low" },
        ],
        sending: [
          { category: "clean", pct: 88.0, risk: "low" },
          { category: "high-risk", pct: 12.0, risk: "high" },
        ],
        tracedUsd: 324_000,
      },
    },
    {
      node: "n5-san",
      exposure: {
        receiving: [
          { category: "sanctioned", pct: 71.0, risk: "high" },
          { category: "high-risk", pct: 22.0, risk: "high" },
          { category: "clean", pct: 7.0, risk: "low" },
        ],
        sending: [
          { category: "high-risk", pct: 60.0, risk: "high" },
          { category: "clean", pct: 40.0, risk: "low" },
        ],
        tracedUsd: 1_180_000,
      },
    },
  ],
  sar: "DRAFT — Subject (Stellaris Holdings Ltd, CY-HE-418207) is 60% held by a Cyprus nominee trust which is 30% beneficially owned by an OFAC-SDN individual (Arkady Volkov), yielding an effective 18% sanctioned interest. The nominee structure obscures the controlling party and the intermediate holding sits in an elevated-risk jurisdiction. Effective interest (18%) falls in the POL-2026.2 review band (5–50%), below the 50% control threshold. Screened against OFAC-SDN-2026-06-10. Recommendation: route to human review; obtain nominee disclosure before disposition.",
};

// ---------------------------------------------------------------------------
// CASE 6 — FIAT · MATCH · taint 55%
// SDN individual →100%→ UAE shell →55%→ subject. Effective 55% — over control line.
// ---------------------------------------------------------------------------
const case0419: MockCase = {
  summary: {
    id: "CASE-2026-0419",
    party: "Volga Resource Partners LLC",
    rail: "fiat",
    amount: "$6,200,000",
    outcome: "MATCH",
  },
  corridor: "RU → KY",
  time: "2026-06-13 08:15 UTC",
  verdict: {
    caseId: "CASE-2026-0419",
    outcome: "MATCH",
    taint: 0.55,
    hops: 2,
    sanctionedSource: "n6-san",
    reasons: [
      {
        code: "UBO_SANCTIONED_CONTROL",
        detail:
          "An OFAC-SDN individual holds an effective 55% controlling interest through a single intermediate shell.",
        weight: 0.45,
      },
      {
        code: "SHELL_LAYERING",
        detail:
          "Control is routed through a UAE free-zone shell with no operating substance.",
        weight: 0.07,
      },
      {
        code: "SANCTIONED_CONTROL_THRESHOLD",
        detail:
          "Effective ownership exceeds the 50% OFAC control threshold, triggering a blocking determination.",
        weight: 0.03,
      },
    ],
    listVersion: "OFAC-SDN-2026-06-10",
    policyVersion: "POL-2026.2",
    decisionHash: "sha256:a47b…0f93",
  },
  graph: {
    nodes: [
      { id: "n6-san", label: "Dmitri Karpov (OFAC-SDN)", role: "san", type: "person", x: 90, y: 110 },
      { id: "n6-shell", label: "Caspian Logistics Ltd", role: "mid", type: "company", x: 380, y: 130 },
      { id: "n6-o2", label: "Yusuf Rahman", role: "clean", type: "person", x: 90, y: 300 },
      { id: "n6-nadia", label: "Nadia Karim", role: "clean", type: "person", x: 90, y: 430 },
      { id: "n6-rahman", label: "Rahman Holdings Ltd", role: "clean", type: "company", x: 380, y: 380 },
      { id: "n6-subj", label: "Volga Resource Partners LLC", role: "dest", type: "company", x: 700, y: 260 },
    ],
    edges: [
      { from: "n6-san", to: "n6-shell", label: "100%", tainted: true },
      { from: "n6-shell", to: "n6-subj", label: "55%", tainted: true },
      { from: "n6-o2", to: "n6-rahman", label: "40%", tainted: false },
      { from: "n6-nadia", to: "n6-rahman", label: "60%", tainted: false },
      { from: "n6-rahman", to: "n6-subj", label: "45%", tainted: false },
    ],
  },
  profiles: [
    {
      id: "n6-subj",
      label: "Volga Resource Partners LLC",
      rail: "fiat",
      category: "high-risk",
      rootRef: "KY-RC-339201",
      sanctioned: false,
      stats: {
        entityType: "LLC",
        incorporated: "2021-03-08",
        jurisdictions: "KY · AE · RU",
        directOwnership: "55% shell / 45% natural",
        beneficialOwners: "2 (1 via shell)",
        registry: "KY-RC-339201",
      },
    },
    {
      id: "n6-san",
      label: "Dmitri Karpov (OFAC-SDN)",
      rail: "fiat",
      category: "sanctioned",
      rootRef: "RU-PERSON-SDN-0974",
      sanctioned: true,
      stats: {
        nationality: "RU",
        listing: "OFAC-SDN",
        sdnRef: "RU-PERSON-SDN-0974",
        effectiveInterest: "55%",
        dob: "1968-09-30",
        role: "Controlling beneficial owner",
      },
    },
    {
      id: "n6-shell",
      label: "Caspian Logistics Ltd",
      rail: "fiat",
      category: "high-risk",
      rootRef: "AE-FZ-77120",
      sanctioned: false,
      stats: {
        entityType: "Free-zone Ltd",
        incorporated: "2020-12-01",
        jurisdictions: "AE",
        directOwnership: "55% of subject",
        beneficialOwners: "1 (Karpov, 100%)",
        registry: "AE-FZ-77120",
      },
    },
  ],
  exposures: [
    {
      node: "n6-subj",
      exposure: {
        receiving: [
          { category: "sanctioned", pct: 55.0, risk: "high" },
          { category: "clean", pct: 45.0, risk: "low" },
        ],
        sending: [
          { category: "high-risk", pct: 38.0, risk: "high" },
          { category: "clean", pct: 62.0, risk: "low" },
        ],
        tracedUsd: 3_410_000,
      },
    },
    {
      node: "n6-san",
      exposure: {
        receiving: [
          { category: "sanctioned", pct: 80.0, risk: "high" },
          { category: "high-risk", pct: 15.0, risk: "high" },
          { category: "clean", pct: 5.0, risk: "low" },
        ],
        sending: [
          { category: "high-risk", pct: 73.0, risk: "high" },
          { category: "clean", pct: 27.0, risk: "low" },
        ],
        tracedUsd: 6_200_000,
      },
    },
  ],
  sar: "DRAFT — Subject (Volga Resource Partners LLC, KY-RC-339201) is 55% held through a UAE free-zone shell (Caspian Logistics Ltd) that is 100% owned by an OFAC-SDN individual (Dmitri Karpov), yielding an effective 55% controlling interest. The intermediate shell has no operating substance, consistent with layering. Effective control (55%) exceeds the 50% OFAC threshold and clears the POL-2026.2 block line. Screened against OFAC-SDN-2026-06-10. Recommendation: block and file; sanctioned individual holds controlling ownership.",
};

export const CASES: MockCase[] = [
  case0412,
  case0418,
  case0421,
  case0407,
  case0415,
  case0419,
];

// Profiles for the remaining graph nodes (exchanges, mixers, relays, clean
// counterparties) so EVERY node resolves to a real name + address/registry ref.
// Crypto nodes carry both an attributed name and their on-chain address; fiat
// nodes carry a registry/person id. Merged into the node→profile lookup in
// mock.ts (case-authored profiles win on id collision).
export const EXTRA_PROFILES: EntityProfile[] = [
  // crypto USERS (name-screened parties controlling the wallets)
  {
    id: "n1-user",
    label: "Northwind OTC Desk",
    rail: "crypto",
    category: "clean",
    rootRef: "KYC-NW-3382",
    sanctioned: false,
    stats: {
      entityType: "OTC desk",
      nameMatch: "no hit",
      jurisdictions: "EU · AE",
      kyc: "verified",
    },
  },
  {
    id: "n2-user",
    label: "Meridian OTC",
    rail: "crypto",
    category: "clean",
    rootRef: "KYC-MR-5519",
    sanctioned: false,
    stats: {
      entityType: "OTC desk",
      nameMatch: "no hit",
      jurisdictions: "AE · KY",
      kyc: "verified",
    },
  },
  {
    id: "n3-user",
    label: "Apex Trading",
    rail: "crypto",
    category: "clean",
    rootRef: "KYC-AP-8830",
    sanctioned: false,
    stats: {
      entityType: "OTC desk",
      nameMatch: "no hit",
      jurisdictions: "RU · AE",
      kyc: "review",
    },
  },
  // crypto SDN NAMES (name-match hits controlling the sanctioned wallets)
  {
    id: "n2-sdnname",
    label: "Sergey Mendel (OFAC-SDN)",
    rail: "crypto",
    category: "sanctioned",
    rootRef: "RU-PERSON-SDN-2207",
    sanctioned: true,
    stats: {
      nationality: "RU",
      listing: "OFAC-SDN",
      nameMatch: "0.94",
      dob: "1977-02-19",
      controls: "Garantex-linked wallet",
    },
  },
  {
    id: "n3-sdnname",
    label: "Roman Sayko (OFAC-SDN)",
    rail: "crypto",
    category: "sanctioned",
    rootRef: "RU-PERSON-SDN-1502",
    sanctioned: true,
    stats: {
      nationality: "RU",
      listing: "OFAC-SDN",
      nameMatch: "0.96",
      dob: "1969-08-04",
      controls: "Hydra-linked wallet",
    },
  },
  // CASE-2026-0412 (crypto)
  {
    id: "n1-ex1",
    label: "Kraken Hot Wallet",
    rail: "crypto",
    category: "exchange",
    rootRef: "bc1qkr4k2n8x0tq6l3v9m2yp7wj4z0c8h1k5a3f7g",
    sanctioned: false,
    stats: {
      balance: "812.40 BTC",
      sent: "44,201.10 BTC",
      received: "45,013.50 BTC",
      transfers: "182,447",
      addresses: "9,204",
    },
  },
  {
    id: "n1-ex2",
    label: "Coinbase Prime",
    rail: "crypto",
    category: "exchange",
    rootRef: "bc1qcb5e8x2m0lq7v3t6yn5pj2wq8z0c4h7gk3a1f",
    sanctioned: false,
    stats: {
      balance: "1,204.85 BTC",
      sent: "61,902.00 BTC",
      received: "63,106.85 BTC",
      transfers: "240,118",
      addresses: "12,880",
    },
  },
  // CASE-2026-0418 (crypto)
  {
    id: "n2-mix",
    label: "Mixer Pool",
    rail: "crypto",
    category: "mixer",
    rootRef: "bc1qmx7p2t9n0lq4v8m6yj5wq3z8c0d4f7gh2k1a",
    sanctioned: false,
    stats: {
      balance: "58.20 BTC",
      sent: "9,440.00 BTC",
      received: "9,498.20 BTC",
      transfers: "21,905",
      addresses: "4,118",
    },
  },
  {
    id: "n2-relay",
    label: "Bridge Relayer",
    rail: "crypto",
    category: "high-risk",
    rootRef: "bc1qbr3l9v2t8x0q6m4yp7wj1z5c3h0k4a7f2g6d",
    sanctioned: false,
    stats: {
      balance: "12.70 BTC",
      sent: "2,041.00 BTC",
      received: "2,053.70 BTC",
      transfers: "6,442",
      addresses: "1,203",
    },
  },
  {
    id: "n2-ex",
    label: "Binance Hot Wallet",
    rail: "crypto",
    category: "exchange",
    rootRef: "bc1qbn6y4w8z0c4h7gk3a1f6d2x8m0lq7v3t6yn5",
    sanctioned: false,
    stats: {
      balance: "3,402.10 BTC",
      sent: "120,440.00 BTC",
      received: "123,842.10 BTC",
      transfers: "612,008",
      addresses: "41,920",
    },
  },
  // CASE-2026-0421 (crypto)
  {
    id: "n3-mix",
    label: "Sinbad Mixer",
    rail: "crypto",
    category: "mixer",
    rootRef: "bc1qsb8d0c4h7gk3a1f6d2x8m0lq7v3t6yn5pj2w",
    sanctioned: false,
    stats: {
      balance: "88.40 BTC",
      sent: "14,200.00 BTC",
      received: "14,288.40 BTC",
      transfers: "33,914",
      addresses: "7,560",
    },
  },
  {
    id: "n3-ex",
    label: "OKX Hot Wallet",
    rail: "crypto",
    category: "exchange",
    rootRef: "bc1qok9h3k4a7f2g6d2x8m0lq7v3t6yn5pj2wq8z",
    sanctioned: false,
    stats: {
      balance: "2,108.55 BTC",
      sent: "88,120.00 BTC",
      received: "90,228.55 BTC",
      transfers: "410,772",
      addresses: "28,140",
    },
  },
  // CASE-2026-0407 (fiat)
  {
    id: "n4-o1",
    label: "Lena Brandt",
    rail: "fiat",
    category: "clean",
    rootRef: "DE-PERSON-22980",
    sanctioned: false,
    stats: {
      nationality: "DE",
      directOwnership: "100% of Brandt Bet.",
      listing: "none",
      dob: "1982-06-15",
    },
  },
  {
    id: "n4-bank",
    label: "Commerzbank AG",
    rail: "fiat",
    category: "clean",
    rootRef: "DE-BIC-COBADEFF",
    sanctioned: false,
    stats: {
      entityType: "Bank",
      jurisdictions: "DE",
      bic: "COBADEFF",
      role: "Settlement bank",
    },
  },
  // CASE-2026-0415 (fiat)
  {
    id: "n5-o2",
    label: "Eleni Pappas",
    rail: "fiat",
    category: "clean",
    rootRef: "CY-PERSON-55310",
    sanctioned: false,
    stats: {
      nationality: "CY",
      directOwnership: "100% of Pappas Hold.",
      listing: "none",
      dob: "1975-03-28",
    },
  },
  // CASE-2026-0419 (fiat)
  {
    id: "n6-o2",
    label: "Yusuf Rahman",
    rail: "fiat",
    category: "clean",
    rootRef: "AE-PERSON-77841",
    sanctioned: false,
    stats: {
      nationality: "AE",
      directOwnership: "40% of Rahman Holdings",
      listing: "none",
      dob: "1980-09-12",
    },
  },
  // ---- UBO network nodes (connected companies + co-owners) ----------------
  // CASE-2026-0407 (fiat)
  {
    id: "n4-brandt",
    label: "Brandt Beteiligungen GmbH",
    rail: "fiat",
    category: "clean",
    rootRef: "DE-HRB-11904",
    sanctioned: false,
    stats: {
      entityType: "GmbH",
      incorporated: "2012-03-15",
      jurisdictions: "DE",
      directOwnership: "60% of subject",
      beneficialOwners: "1 (Lena Brandt)",
    },
  },
  {
    id: "n4-feld",
    label: "Feld Invest Ltd",
    rail: "fiat",
    category: "clean",
    rootRef: "NL-KVK-55021",
    sanctioned: false,
    stats: {
      entityType: "BV",
      incorporated: "2014-09-30",
      jurisdictions: "NL · AE",
      directOwnership: "40% of subject",
      beneficialOwners: "1 (Markus Feld)",
    },
  },
  // CASE-2026-0415 (fiat)
  {
    id: "n5-petrov",
    label: "Dmitri Petrov",
    rail: "fiat",
    category: "clean",
    rootRef: "CY-PERSON-61204",
    sanctioned: false,
    stats: {
      nationality: "CY",
      directOwnership: "50% of nominee trust",
      listing: "none",
      dob: "1968-11-03",
    },
  },
  {
    id: "n5-pappas",
    label: "Pappas Holdings Ltd",
    rail: "fiat",
    category: "clean",
    rootRef: "CY-HE-502118",
    sanctioned: false,
    stats: {
      entityType: "Holding",
      incorporated: "2016-05-09",
      jurisdictions: "CY",
      directOwnership: "40% of subject",
      beneficialOwners: "1 (Eleni Pappas)",
    },
  },
  // CASE-2026-0419 (fiat)
  {
    id: "n6-rahman",
    label: "Rahman Holdings Ltd",
    rail: "fiat",
    category: "clean",
    rootRef: "AE-FZ-88204",
    sanctioned: false,
    stats: {
      entityType: "Holding",
      incorporated: "2018-07-22",
      jurisdictions: "AE",
      directOwnership: "45% of subject",
      beneficialOwners: "2 (Rahman, Karim)",
    },
  },
  {
    id: "n6-nadia",
    label: "Nadia Karim",
    rail: "fiat",
    category: "clean",
    rootRef: "AE-PERSON-90113",
    sanctioned: false,
    stats: {
      nationality: "AE",
      directOwnership: "60% of Rahman Holdings",
      listing: "none",
      dob: "1985-01-17",
    },
  },
];
