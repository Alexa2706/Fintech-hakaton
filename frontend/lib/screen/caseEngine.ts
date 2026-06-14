// Compose screened (live) cases with the static mock engine behind the same
// Engine contract. The UI reads through this so a live case renders exactly
// like a seed one; lookups check the screened set first, then fall back to mock.

import { mockEngine } from "@/lib/engine/mock";
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
import type { ScreenedCase } from "./types";

function explainOf(c: ScreenedCase): {
  reasons: Reason[];
  policy: DecisionPolicy;
  taint: number;
} {
  return { reasons: c.verdict.reasons, policy: c.policy, taint: c.verdict.taint };
}

// A single screened case wrapped as a full Engine (used server-side by the
// agent route, where the static mock engine has no knowledge of live cases).
export function engineForCase(c: ScreenedCase): Engine {
  const profiles = new Map(c.profiles.map((p) => [p.id, p]));
  const exposures = new Map(c.exposures.map((e) => [e.node, e.exposure]));
  const fallbackProfile = (id: string): EntityProfile => ({
    id,
    label: id,
    rail: c.summary.rail,
    category: "clean",
    rootRef: "—",
    sanctioned: false,
    stats: {},
  });
  return {
    listCases: () => [c.summary],
    getVerdict: () => c.verdict,
    getPath: () => c.graph,
    getEntity: (id) => profiles.get(id) ?? fallbackProfile(id),
    getExposure: (id) =>
      exposures.get(id) ?? {
        receiving: [{ category: "clean", pct: 100, risk: "low" }],
        sending: [{ category: "clean", pct: 100, risk: "low" }],
      },
    explainScore: () => explainOf(c),
    draftSar: () => c.sar,
  };
}

// The composite engine the console uses. `screened` is keyed by case id.
export function makeEngine(screened: Record<string, ScreenedCase>): Engine {
  const cases = Object.values(screened);
  const profileByNode = new Map<string, EntityProfile>();
  const exposureByNode = new Map<string, Exposure>();
  for (const c of cases) {
    for (const p of c.profiles) profileByNode.set(p.id, p);
    for (const e of c.exposures) exposureByNode.set(e.node, e.exposure);
  }

  return {
    listCases(): CaseSummary[] {
      // screened on top, newest first, then the seed queue
      return [...cases.map((c) => c.summary).reverse(), ...mockEngine.listCases()];
    },
    getVerdict(id: string): Verdict {
      return screened[id]?.verdict ?? mockEngine.getVerdict(id);
    },
    getPath(id: string): GraphData {
      return screened[id]?.graph ?? mockEngine.getPath(id);
    },
    getEntity(nodeId: string): EntityProfile {
      return profileByNode.get(nodeId) ?? mockEngine.getEntity(nodeId);
    },
    getExposure(nodeId: string): Exposure {
      return exposureByNode.get(nodeId) ?? mockEngine.getExposure(nodeId);
    },
    explainScore(id: string) {
      const c = screened[id];
      return c ? explainOf(c) : mockEngine.explainScore(id);
    },
    draftSar(id: string): string {
      return screened[id]?.sar ?? mockEngine.draftSar(id);
    },
  };
}
