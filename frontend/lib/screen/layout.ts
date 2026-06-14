// Auto-layout for a screened subgraph. Python returns nodes + directed edges
// but no positions. Two strategies:
//   • backbone — when there's a sanctioned→subject tainted path, lay the path
//     out as a left→right spine and hang clean inputs/branches off it. Reads as
//     a money trail and animates cleanly node-by-node.
//   • grid — otherwise (hubs, clean cases): a column-major grid sized so tiles
//     never overlap.

import type { GraphData, GEdge, GNode } from "@/lib/engine/types";

const VB_W = 800;
const VB_H = 500;
const MARGIN_X = 70;
const MARGIN_Y = 64;
const ROWS_MAX = 4;
const BRANCH_GAP = 116; // vertical gap for branches hung off the spine

export interface LayoutNodeInput {
  id: string;
  label: string;
  role: GNode["role"];
  type: GNode["type"];
}
export interface LayoutEdgeInput {
  from: string;
  to: string;
  label: string;
  tainted: boolean;
}

export function layoutGraph(
  nodes: LayoutNodeInput[],
  edges: LayoutEdgeInput[],
): GraphData {
  if (nodes.length === 0) return { nodes: [], edges: [] };

  const spine = computeSpine(nodes, edges);
  const pos =
    spine.length >= 2
      ? backboneLayout(nodes, edges, spine)
      : gridLayout(nodes, edges);

  const gnodes: GNode[] = nodes.map((n) => ({
    id: n.id,
    label: n.label,
    role: n.role,
    type: n.type,
    x: Math.round(pos.get(n.id)?.x ?? VB_W / 2),
    y: Math.round(pos.get(n.id)?.y ?? VB_H / 2),
  }));
  const gedges: GEdge[] = edges.map((e) => ({
    from: e.from,
    to: e.to,
    label: e.label,
    tainted: e.tainted,
  }));
  return { nodes: gnodes, edges: gedges };
}

// the sanctioned→subject path along tainted edges (the replay spine)
function computeSpine(
  nodes: LayoutNodeInput[],
  edges: LayoutEdgeInput[],
): string[] {
  const source = nodes.find((n) => n.role === "san")?.id;
  const subject = nodes.find((n) => n.role === "dest")?.id;
  if (!source || !subject) return [];
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!e.tainted) continue;
    adj.set(e.from, [...(adj.get(e.from) ?? []), e.to]);
  }
  const queue: string[][] = [[source]];
  const seen = new Set<string>([source]);
  while (queue.length) {
    const path = queue.shift()!;
    const cur = path[path.length - 1];
    if (cur === subject) return path;
    for (const nxt of adj.get(cur) ?? []) {
      if (seen.has(nxt)) continue;
      seen.add(nxt);
      queue.push([...path, nxt]);
    }
  }
  return [];
}

function backboneLayout(
  nodes: LayoutNodeInput[],
  edges: LayoutEdgeInput[],
  spine: string[],
): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();
  const usableW = VB_W - 2 * MARGIN_X;
  const colX = (i: number) =>
    spine.length === 1
      ? VB_W * 0.3
      : MARGIN_X + (i / (spine.length - 1)) * usableW;

  const spineCol = new Map<string, number>();
  spine.forEach((id, i) => {
    spineCol.set(id, i);
    pos.set(id, { x: colX(i), y: VB_H / 2 });
  });

  // undirected adjacency to find each branch node's anchor on the spine
  const nbr = new Map<string, string[]>();
  for (const e of edges) {
    nbr.set(e.from, [...(nbr.get(e.from) ?? []), e.to]);
    nbr.set(e.to, [...(nbr.get(e.to) ?? []), e.from]);
  }

  // group non-spine nodes by the spine column they attach to
  const byCol = new Map<number, string[]>();
  for (const n of nodes) {
    if (spineCol.has(n.id)) continue;
    let anchor = 0;
    for (const m of nbr.get(n.id) ?? []) {
      if (spineCol.has(m)) {
        anchor = spineCol.get(m)!;
        break;
      }
    }
    byCol.set(anchor, [...(byCol.get(anchor) ?? []), n.id]);
  }

  // hang branches above/below the spine row, alternating outward
  for (const [col, ids] of byCol) {
    const x = colX(col);
    ids.forEach((id, k) => {
      const step = Math.floor(k / 2) + 1;
      const dir = k % 2 === 0 ? -1 : 1;
      const y = clamp(VB_H / 2 + dir * step * BRANCH_GAP, MARGIN_Y, VB_H - MARGIN_Y);
      // nudge x slightly so the branch isn't dead-center under the spine node
      pos.set(id, { x: x + dir * 18, y });
    });
  }
  return pos;
}

function gridLayout(
  nodes: LayoutNodeInput[],
  edges: LayoutEdgeInput[],
): Map<string, { x: number; y: number }> {
  // order left→right by longest-path depth from funding sources
  const fwd = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const n of nodes) indeg.set(n.id, 0);
  for (const e of edges) {
    if (!indeg.has(e.from) || !indeg.has(e.to)) continue;
    fwd.set(e.from, [...(fwd.get(e.from) ?? []), e.to]);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }
  let roots = nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  if (roots.length === 0) roots = [nodes[0].id];
  const depth = new Map<string, number>();
  for (const r of roots) depth.set(r, 0);
  const queue = [...roots];
  let guard = 0;
  while (queue.length && guard++ < 5000) {
    const u = queue.shift()!;
    const d = depth.get(u) ?? 0;
    for (const v of fwd.get(u) ?? []) {
      if (!depth.has(v) || d + 1 > (depth.get(v) ?? 0)) {
        depth.set(v, d + 1);
        queue.push(v);
      }
    }
  }
  for (const n of nodes) if (!depth.has(n.id)) depth.set(n.id, 0);

  const ordered = [...nodes].sort(
    (a, b) => (depth.get(a.id)! - depth.get(b.id)!) || a.id.localeCompare(b.id),
  );
  const total = ordered.length;
  const cols = Math.min(5, Math.max(1, Math.ceil(total / ROWS_MAX)));
  const rows = Math.max(1, Math.ceil(total / cols));
  const usableW = VB_W - 2 * MARGIN_X;
  const usableH = VB_H - 2 * MARGIN_Y;
  const pos = new Map<string, { x: number; y: number }>();
  ordered.forEach((n, k) => {
    const col = Math.floor(k / rows);
    const row = k % rows;
    const colCount = Math.min(rows, total - col * rows);
    const x = cols === 1 ? VB_W / 2 : MARGIN_X + (col / (cols - 1)) * usableW;
    const y =
      colCount === 1 ? VB_H / 2 : MARGIN_Y + (row / (colCount - 1)) * usableH;
    pos.set(n.id, { x, y });
  });
  return pos;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
