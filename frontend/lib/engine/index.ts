// The single swap point. When real algorithms (name match, UBO ownership graph,
// crypto taint trace) or a Python HTTP service land behind the same contract,
// only this line changes — point `engine` at the real implementation.
import { mockEngine } from "@/lib/engine/mock";

export const engine = mockEngine;

export type {
  CaseSummary,
  DecisionPolicy,
  Engine,
  EntityProfile,
  Exposure,
  ExposureCategory,
  ExposureSlice,
  GEdge,
  GNode,
  GNodeType,
  GraphData,
  Outcome,
  Rail,
  Reason,
  Verdict,
} from "@/lib/engine/types";
