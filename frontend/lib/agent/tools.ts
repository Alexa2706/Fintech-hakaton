import type OpenAI from "openai";
import { engine } from "@/lib/engine";
import type { Engine } from "@/lib/engine/types";

// OpenAI/DeepSeek tool schemas — all READ-ONLY over the engine contract.
// caseId is optional on case-scoped tools: the route binds the active case, so
// the model can't read across cases even if it omits or guesses the id.
export const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_verdict",
      description:
        "Outcome, taint, hops, sanctionedSource, listVersion, policyVersion and decisionHash for the case.",
      parameters: {
        type: "object",
        properties: { caseId: { type: "string" } },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_path",
      description:
        "The case graph: nodes (id, label, type, role) and directed edges (from, to, label, tainted).",
      parameters: {
        type: "object",
        properties: { caseId: { type: "string" } },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_entity",
      description:
        "Identity, category, sanctioned flag, rootRef and stats for a node id (use the directory in the system prompt).",
      parameters: {
        type: "object",
        properties: { nodeId: { type: "string" } },
        required: ["nodeId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_exposure",
      description:
        "Receiving/sending exposure breakdown by category (sanctioned/mixer/darknet/high-risk/exchange/clean) for a node id.",
      parameters: {
        type: "object",
        properties: { nodeId: { type: "string" } },
        required: ["nodeId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "explain_score",
      description:
        "Decomposed reasons (code, detail, weight), the decision policy (review/block thresholds) and taint for the case.",
      parameters: {
        type: "object",
        properties: { caseId: { type: "string" } },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "draft_sar",
      description:
        "A DRAFT Suspicious Activity Report narrative assembled only from this case's evidence.",
      parameters: {
        type: "object",
        properties: { caseId: { type: "string" } },
        required: [],
      },
    },
  },
];

// Dispatch a tool call to the engine. `boundCaseId` is the active case (the
// model's caseId arg is ignored in favour of it for safety). Returns JSON.
export function runTool(
  name: string,
  args: Record<string, unknown>,
  boundCaseId: string,
  eng: Engine = engine,
): string {
  const nodeId = typeof args.nodeId === "string" ? args.nodeId : "";
  try {
    switch (name) {
      case "get_verdict":
        return JSON.stringify(eng.getVerdict(boundCaseId));
      case "get_path":
        return JSON.stringify(eng.getPath(boundCaseId));
      case "get_entity":
        return JSON.stringify(eng.getEntity(nodeId));
      case "get_exposure":
        return JSON.stringify(eng.getExposure(nodeId));
      case "explain_score":
        return JSON.stringify(eng.explainScore(boundCaseId));
      case "draft_sar":
        return JSON.stringify({ sar: eng.draftSar(boundCaseId) });
      default:
        return JSON.stringify({ error: `unknown tool: ${name}` });
    }
  } catch (e) {
    return JSON.stringify({
      error: e instanceof Error ? e.message : "tool error",
    });
  }
}
