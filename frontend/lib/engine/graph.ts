// Split a case graph into its two constituent graphs — the crypto transaction
// graph and the fiat beneficial-ownership graph. The thesis is "one engine, two
// graphs": a cross-rail case (an on/off-ramp) carries edges of both kinds. The
// agent's get_graphs tool serves each separately so it can explain the money
// trail (crypto) and the ownership trail (fiat) on their own terms.

import type { GEdge, GNode, GraphData } from "./types";

const CRYPTO_TYPES = new Set(["wallet", "exchange", "mixer", "address"]);
const FIAT_TYPES = new Set(["company", "bank", "org", "vehicle"]);
const PERCENT = /%/;
const CRYPTO_UNIT = /\b(BTC|ETH|USDC|USDT|SOL|XMR|BNB|TRX)\b/i;

// Which graph an edge belongs to. Trust an explicit `kind` (live engine emits
// it); otherwise infer: a "%" label is ownership, a coin-unit label is a
// transaction, and structural labels ("controls"/"settlement") fall back to the
// rail implied by the node types the edge touches.
export function edgeRail(
  e: GEdge,
  nodeById: Map<string, GNode>,
): "crypto" | "fiat" {
  if (e.kind === "ownership") return "fiat";
  if (e.kind === "transaction") return "crypto";
  if (PERCENT.test(e.label)) return "fiat";
  if (CRYPTO_UNIT.test(e.label)) return "crypto";
  const ends = [nodeById.get(e.from), nodeById.get(e.to)];
  if (ends.some((n) => n && CRYPTO_TYPES.has(n.type))) return "crypto";
  if (ends.some((n) => n && FIAT_TYPES.has(n.type))) return "fiat";
  return "crypto"; // last resort
}

export interface SplitGraphs {
  crypto: GraphData;
  fiat: GraphData;
}

// Partition into { crypto, fiat }. Each subgraph carries only the nodes its own
// edges touch; the subject can appear in both when the case bridges rails.
export function splitGraphByRail(graph: GraphData): SplitGraphs {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const cryptoEdges: GEdge[] = [];
  const fiatEdges: GEdge[] = [];
  for (const e of graph.edges) {
    (edgeRail(e, nodeById) === "fiat" ? fiatEdges : cryptoEdges).push(e);
  }
  const collect = (edges: GEdge[]): GraphData => {
    const ids = new Set<string>();
    for (const e of edges) {
      ids.add(e.from);
      ids.add(e.to);
    }
    return { nodes: graph.nodes.filter((n) => ids.has(n.id)), edges };
  };
  return { crypto: collect(cryptoEdges), fiat: collect(fiatEdges) };
}
