import type OpenAI from "openai";
import { engine } from "@/lib/engine";
import { splitGraphByRail } from "@/lib/engine/graph";
import { researchPolicy } from "@/lib/agent/policyResearch";
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
      name: "get_policy",
      description:
        "The decision policy this case was scored under: the review and block taint thresholds, the rationale, and the sanctions-list version + policy version the verdict is pinned to. Use it to state thresholds and versions instead of assuming them — they can differ between cases.",
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
      name: "get_graphs",
      description:
        "The case split into its two graphs: `crypto` (transaction graph — wallets/exchanges/mixers, edges = coin amounts) and `fiat` (beneficial-ownership graph — companies/people/banks, edges = ownership %). Each carries its own nodes + edges; a case may populate one or both (an on/off-ramp crosses both).",
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
  {
    type: "function",
    function: {
      name: "research_policy",
      description:
        "Research a sanctions / AML / stablecoin regulation by name (e.g. 'GENIUS Act', 'Travel Rule', 'OFAC 50% rule', 'MiCA', 'SAR') and get a plain-language brief: what it requires and how this engine already covers or versions its policy to meet it. The same tool answers 'where does the data come from' / data-strategy questions. Knowledge tool — not tied to the active case.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "a regulation name or a data-source question",
          },
        },
        required: ["query"],
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
      case "get_policy": {
        const { policy } = eng.explainScore(boundCaseId);
        const v = eng.getVerdict(boundCaseId);
        return JSON.stringify({
          version: policy.version,
          reviewAt: policy.reviewAt,
          blockAt: policy.blockAt,
          rationale: policy.rationale,
          listVersion: v.listVersion,
          policyVersion: v.policyVersion,
        });
      }
      case "get_graphs":
        return JSON.stringify(splitGraphByRail(eng.getPath(boundCaseId)));
      case "draft_sar":
        return JSON.stringify({ sar: eng.draftSar(boundCaseId) });
      case "research_policy": {
        const q = typeof args.query === "string" ? args.query : "";
        return JSON.stringify(researchPolicy(q));
      }
      default:
        return JSON.stringify({ error: `unknown tool: ${name}` });
    }
  } catch (e) {
    return JSON.stringify({
      error: e instanceof Error ? e.message : "tool error",
    });
  }
}
