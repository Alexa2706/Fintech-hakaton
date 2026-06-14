// Extra REVIEW cases revealed one-by-one as the analyst decides (Release/Block)
// on the current case — so the demo plays like a real screening queue. Each is a
// hand-laid crypto trace, a step richer than the seed showcase: SDN person →
// SDN wallet → mixer → two relayers → subject, plus the controlling KYC'd party
// and a clean exchange co-input. 4-hop tainted path = a longer node-by-node replay.

import type {
  EntityProfile,
  Exposure,
  GEdge,
  GNode,
  Reason,
} from "@/lib/engine/types";
import type { ScreenedCase } from "@/lib/screen/types";

const LIST = "OFAC-SDN-2026-06-10";
const POLICY = {
  version: "POL-2026.2",
  reviewAt: 0.05,
  blockAt: 0.5,
  rationale:
    "Block at >=50% sanctioned taint; route 5-50% to human review; release below 5%.",
};

interface ReviewSpec {
  id: string;
  party: string; // subject wallet name (and queue label)
  amount: string;
  time: string;
  taint: number; // 0.05..0.50
  hash: string;
  sdnPerson: string;
  sdnPersonRef: string;
  nameMatch: string;
  sdnWallet: string;
  sdnWalletRef: string;
  mixer: string;
  mixerRef: string;
  relay1: string;
  relay1Ref: string;
  relay2: string;
  relay2Ref: string;
  subjectRef: string;
  controller: string;
  controllerRef: string;
  cleanEx: string;
  cleanExRef: string;
  amts: [string, string, string, string]; // wallet→mix, mix→r1, r1→r2, r2→subj
  cleanAmt: string;
  reasons: Reason[];
}

function makeCase(s: ReviewSpec): ScreenedCase {
  const node = (
    id: string,
    label: string,
    role: GNode["role"],
    type: GNode["type"],
    x: number,
    y: number,
  ): GNode => ({ id: `${s.id}-${id}`, label, role, type, x, y });

  const nodes: GNode[] = [
    node("sdnname", s.sdnPerson, "san", "person", 90, 70),
    node("san", s.sdnWallet, "san", "wallet", 90, 220),
    node("mix", s.mixer, "mid", "mixer", 260, 140),
    node("r1", s.relay1, "mid", "wallet", 430, 210),
    node("r2", s.relay2, "mid", "wallet", 600, 130),
    node("subj", s.party, "dest", "wallet", 725, 300),
    node("user", s.controller, "clean", "person", 725, 150),
    node("ex", s.cleanEx, "clean", "exchange", 350, 410),
  ];

  const edge = (
    from: string,
    to: string,
    label: string,
    tainted: boolean,
  ): GEdge => ({ from: `${s.id}-${from}`, to: `${s.id}-${to}`, label, tainted });

  const edges: GEdge[] = [
    edge("sdnname", "san", "controls", false),
    edge("san", "mix", s.amts[0], true),
    edge("mix", "r1", s.amts[1], true),
    edge("r1", "r2", s.amts[2], true),
    edge("r2", "subj", s.amts[3], true),
    edge("user", "subj", "controls", false),
    edge("ex", "subj", s.cleanAmt, false),
  ];

  const prof = (
    id: string,
    label: string,
    category: string,
    rootRef: string,
    sanctioned: boolean,
    stats: Record<string, string> = {},
  ): EntityProfile => ({
    id: `${s.id}-${id}`,
    label,
    rail: "crypto",
    category,
    rootRef,
    sanctioned,
    stats,
  });

  const taintPct = Math.round(s.taint * 100);
  const profiles: EntityProfile[] = [
    prof("sdnname", s.sdnPerson, "sanctioned", s.sdnPersonRef, true, {
      type: "Individual",
      nameMatch: s.nameMatch,
    }),
    prof("san", s.sdnWallet, "sanctioned", s.sdnWalletRef, true, {
      role: "Sanctioned wallet",
    }),
    prof("mix", s.mixer, "mixer", s.mixerRef, false, { role: "Mixing service" }),
    prof("r1", s.relay1, "high-risk", s.relay1Ref, false, {}),
    prof("r2", s.relay2, "high-risk", s.relay2Ref, false, {}),
    prof("subj", s.party, "exchange", s.subjectRef, false, {
      taint: `${taintPct}.0%`,
    }),
    prof("user", s.controller, "clean", s.controllerRef, false, {
      role: "Controlling party",
    }),
    prof("ex", s.cleanEx, "exchange", s.cleanExRef, false, {}),
  ];

  const subjectExposure: Exposure = {
    receiving: [
      { category: "sanctioned", pct: taintPct, risk: "high" },
      { category: "clean", pct: 100 - taintPct, risk: "low" },
    ],
    sending: [{ category: "clean", pct: 100, risk: "low" }],
  };

  const sar = [
    `DRAFT — Suspicious Activity Report`,
    `Subject: ${s.party}`,
    `Transaction: ${s.amount} · crypto off-ramp`,
    `Engine verdict: REVIEW — about ${taintPct}% of the incoming money traces back to a sanctioned source over 4 steps.`,
    ``,
    `Basis: funds move from ${s.sdnWallet} (controlled by ${s.sdnPerson}, on the sanctions list) through ${s.mixer} and two relayers into ${s.party}.`,
    ``,
    `List ${LIST} · policy ${POLICY.version}. Machine-assembled from engine evidence only; requires analyst validation.`,
  ].join("\n");

  return {
    summary: {
      id: s.id,
      party: s.party,
      rail: "crypto",
      amount: s.amount,
      outcome: "REVIEW",
    },
    corridor: "Crypto → Fiat (off-ramp)",
    time: s.time,
    verdict: {
      caseId: s.id,
      outcome: "REVIEW",
      taint: s.taint,
      reasons: s.reasons,
      hops: 4,
      sanctionedSource: `${s.id}-san`,
      listVersion: LIST,
      policyVersion: POLICY.version,
      decisionHash: `sha256:${s.hash}`,
    },
    graph: { nodes, edges },
    profiles,
    exposures: [{ node: `${s.id}-subj`, exposure: subjectExposure }],
    policy: POLICY,
    sar,
    subjectId: `${s.id}-subj`,
    via: "mock",
  };
}

const SPECS: ReviewSpec[] = [
  {
    id: "CASE-2026-0423",
    party: "Cobalt hot wallet",
    amount: "8.7 BTC",
    time: "2026-06-14 11:02 UTC",
    taint: 0.28,
    hash: "9c41…e0a2",
    sdnPerson: "Roman Sayko (OFAC-SDN)",
    sdnPersonRef: "RU-PERSON-2207",
    nameMatch: "0.94",
    sdnWallet: "SDN Wallet (Hydra-linked)",
    sdnWalletRef: "bc1qsk9d…h2x9",
    mixer: "Sinbad Mixer",
    mixerRef: "bc1qmx7p…8f1a",
    relay1: "Swap Relay",
    relay1Ref: "bc1qr1ab…3a7b",
    relay2: "Bridge Relayer",
    relay2Ref: "bc1qr2cd…9c2d",
    subjectRef: "bc1qcb7e…7f1g",
    controller: "Cobalt OTC",
    controllerRef: "KYC-CB-4471",
    cleanEx: "Binance Hot Wallet",
    cleanExRef: "bc1qbn6y…3t6y",
    amts: ["2.4 BTC", "2.2 BTC", "2.0 BTC", "2.0 BTC"],
    cleanAmt: "5.1 BTC",
    reasons: [
      {
        code: "INDIRECT_SANCTIONED_EXPOSURE",
        detail: "Most of the inbound value traces to a sanctioned wallet.",
        weight: 0.18,
      },
      {
        code: "MIXER_HOP",
        detail: "The path runs through a mixing service that obscures origin.",
        weight: 0.07,
      },
      {
        code: "MULTI_HOP_LAYERING",
        detail: "Two relayers between the mixer and the subject — classic layering.",
        weight: 0.03,
      },
    ],
  },
  {
    id: "CASE-2026-0427",
    party: "Aurora hot wallet",
    amount: "14.2 BTC",
    time: "2026-06-14 11:08 UTC",
    taint: 0.19,
    hash: "3b7f…c104",
    sdnPerson: "Yelena Drozd (OFAC-SDN)",
    sdnPersonRef: "BY-PERSON-1185",
    nameMatch: "0.91",
    sdnWallet: "SDN Wallet (Suex-linked)",
    sdnWalletRef: "bc1qsx4k…k4m2",
    mixer: "Tornado Pool",
    mixerRef: "bc1qtp2h…2h9c",
    relay1: "Chain Hop",
    relay1Ref: "bc1qch5d…5d1e",
    relay2: "Peel Relay",
    relay2Ref: "bc1qpl7a…7a3f",
    subjectRef: "bc1qau3k…3k8h",
    controller: "Aurora Capital",
    controllerRef: "KYC-AU-9920",
    cleanEx: "Kraken Hot Wallet",
    cleanExRef: "bc1qkr4k…5a3f",
    amts: ["3.1 BTC", "2.8 BTC", "2.6 BTC", "2.6 BTC"],
    cleanAmt: "11.6 BTC",
    reasons: [
      {
        code: "INDIRECT_SANCTIONED_EXPOSURE",
        detail: "Part of the inbound value traces to a sanctioned wallet.",
        weight: 0.12,
      },
      {
        code: "MIXER_HOP",
        detail: "Funds pass through a mixing pool before reaching the subject.",
        weight: 0.05,
      },
      {
        code: "STRUCTURING_PATTERN",
        detail: "Near-equal hops suggest deliberate structuring.",
        weight: 0.02,
      },
    ],
  },
  {
    id: "CASE-2026-0431",
    party: "Vega hot wallet",
    amount: "6.3 BTC",
    time: "2026-06-14 11:15 UTC",
    taint: 0.34,
    hash: "f2da…b88e",
    sdnPerson: "Pavel Orlov (OFAC-SDN)",
    sdnPersonRef: "RU-PERSON-3390",
    nameMatch: "0.96",
    sdnWallet: "SDN Wallet (Garantex-linked)",
    sdnWalletRef: "bc1qgx5m…m5n1",
    mixer: "ChipMixer",
    mixerRef: "bc1qcm4t…4t2k",
    relay1: "Bridge Relayer",
    relay1Ref: "bc1qbr8s…8s6d",
    relay2: "Swap Relay",
    relay2Ref: "bc1qsw1f…1f4g",
    subjectRef: "bc1qvg9h…9h2k",
    controller: "Vega Markets",
    controllerRef: "KYC-VG-3318",
    cleanEx: "Coinbase Prime",
    cleanExRef: "bc1qcb5e…gk3a",
    amts: ["1.9 BTC", "1.7 BTC", "1.6 BTC", "1.6 BTC"],
    cleanAmt: "3.0 BTC",
    reasons: [
      {
        code: "INDIRECT_SANCTIONED_EXPOSURE",
        detail: "A third of the inbound value traces to a sanctioned wallet.",
        weight: 0.22,
      },
      {
        code: "MIXER_HOP",
        detail: "The route runs through a mixing service.",
        weight: 0.09,
      },
      {
        code: "MULTI_HOP_LAYERING",
        detail: "Multiple relayers layer the funds before cash-out.",
        weight: 0.03,
      },
    ],
  },
];

// the queue of cases revealed one per analyst decision
export const DEMO_QUEUE: ScreenedCase[] = SPECS.map(makeCase);
