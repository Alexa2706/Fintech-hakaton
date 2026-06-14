// Mock implementation of the Engine contract. Serves the authored fixtures —
// no engine math. The real proportional-taint trace lands later behind this
// same interface; when it does, only `index.ts` changes.

import type {
  CaseSummary,
  DecisionPolicy,
  Engine,
  EntityProfile,
  Exposure,
  GraphData,
  Reason,
  Verdict,
} from "@/lib/engine/types";
import { CASES, EXTRA_PROFILES, POLICY, type MockCase } from "@/lib/mock/cases";

const caseById = new Map<string, MockCase>(CASES.map((c) => [c.summary.id, c]));

// node id -> profile / exposure, merged across every case (these are per-node,
// not per-case). Profiles/exposures are authored for each case's primary nodes.
const profileByNode = new Map<string, EntityProfile>();
const exposureByNode = new Map<string, Exposure>();
for (const c of CASES) {
  for (const p of c.profiles) profileByNode.set(p.id, p);
  for (const e of c.exposures) exposureByNode.set(e.node, e.exposure);
}
// fill in the remaining nodes (case-authored profiles take precedence)
for (const p of EXTRA_PROFILES) {
  if (!profileByNode.has(p.id)) profileByNode.set(p.id, p);
}

function requireCase(caseId: string): MockCase {
  const c = caseById.get(caseId);
  if (!c) throw new Error(`unknown caseId: ${caseId}`);
  return c;
}

// Graceful fallback for node ids without an authored profile (e.g. minor
// clean counterparties / banks) — keeps the contract total rather than throwing.
function fallbackProfile(nodeId: string): EntityProfile {
  return {
    id: nodeId,
    label: nodeId,
    rail: "crypto",
    category: "clean",
    rootRef: "—",
    sanctioned: false,
    stats: {},
  };
}

function fallbackExposure(): Exposure {
  return {
    receiving: [{ category: "clean", pct: 100, risk: "low" }],
    sending: [{ category: "clean", pct: 100, risk: "low" }],
  };
}

export const mockEngine: Engine = {
  listCases(): CaseSummary[] {
    return CASES.map((c) => c.summary);
  },

  getVerdict(caseId: string): Verdict {
    return requireCase(caseId).verdict;
  },

  getPath(caseId: string): GraphData {
    return requireCase(caseId).graph;
  },

  getEntity(nodeId: string): EntityProfile {
    return profileByNode.get(nodeId) ?? fallbackProfile(nodeId);
  },

  getExposure(nodeId: string): Exposure {
    return exposureByNode.get(nodeId) ?? fallbackExposure();
  },

  explainScore(caseId: string): {
    reasons: Reason[];
    policy: DecisionPolicy;
    taint: number;
  } {
    const { verdict } = requireCase(caseId);
    return { reasons: verdict.reasons, policy: POLICY, taint: verdict.taint };
  },

  draftSar(caseId: string): string {
    return requireCase(caseId).sar;
  },
};
