"use client";

import { useMemo, useState } from "react";
import { Plus, Minus, Maximize2 } from "lucide-react";
import type { Engine, GEdge, GNode, GraphData } from "@/lib/engine/types";
import { cn, truncMid } from "@/lib/utils";
import { Button } from "./ui/button";
import { NODE_ICON } from "./shared";

const VB_W = 800;
const VB_H = 500;
const NODE_R = 30; // viewBox units to trim edges back to the tile edge

type Pt = { x: number; y: number };

function trim(a: Pt, b: Pt, r: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  return {
    x1: a.x + ux * r,
    y1: a.y + uy * r,
    x2: b.x - ux * r,
    y2: b.y - uy * r,
  };
}

function edgeTone(
  e: GEdge,
  sanctionedSource: string | undefined,
): { stroke: string; marker: string; width: number } {
  if (e.tainted && e.from === sanctionedSource)
    return { stroke: "stroke-risk-high", marker: "url(#arrow-risk)", width: 2.5 };
  if (e.tainted)
    return { stroke: "stroke-accent", marker: "url(#arrow-accent)", width: 2.25 };
  return { stroke: "stroke-faint", marker: "url(#arrow-faint)", width: 1.25 };
}

function NodeTile({
  node,
  entityRef,
  hovered,
  highlighted,
  active,
  current,
}: {
  node: GNode;
  entityRef?: string;
  hovered: boolean;
  highlighted: boolean;
  active?: boolean; // reached by the replay so far
  current?: boolean; // the node the replay just lit
}) {
  const Icon = NODE_ICON[node.type];
  const tone =
    node.role === "san"
      ? "border-risk-high bg-risk-high-wash text-risk-high"
      : node.role === "dest"
        ? "border-accent text-accent ring-1 ring-accent"
        : "border-hairline text-muted";
  // crypto addresses are long -> truncate mid; registry ids are short -> show whole
  const refLabel =
    entityRef && (entityRef.length > 16 ? truncMid(entityRef, 8, 6) : entityRef);
  return (
    <div className="flex w-28 flex-col items-center">
      <div
        className={cn(
          "flex size-10 items-center justify-center rounded-[2px] border bg-surface2 transition-colors duration-300",
          tone,
          hovered && "border-line-strong",
          highlighted && "ring-2 ring-accent ring-offset-2 ring-offset-canvas",
          // keep the node's role colour (red/blue); ring the reached trail,
          // ring the current one harder
          active && !current && "ring-1 ring-accent-hi ring-offset-1 ring-offset-canvas",
          current && "ring-2 ring-accent-hi ring-offset-2 ring-offset-canvas",
        )}
      >
        <Icon className="size-5 stroke-[1.5]" />
      </div>
      <span
        className={cn(
          "mt-1 max-w-28 truncate text-center text-[11px] font-medium leading-tight",
          node.role === "san" ? "text-risk-high" : "text-muted",
          hovered && "text-text",
        )}
      >
        {node.label}
      </span>
      {refLabel && (
        <span className="max-w-28 truncate text-center font-mono text-[9px] leading-tight text-faint">
          {refLabel}
        </span>
      )}
    </div>
  );
}

export function Graph({
  eng,
  data,
  sanctionedSource,
  taintOnly = false,
  highlightId,
  activeNodes,
  activeNode,
  agentOpen = false,
  onNodeSelect,
}: {
  eng: Engine;
  data: GraphData;
  sanctionedSource?: string;
  taintOnly?: boolean; // toolbar "taint path" mode — isolate the tainted route
  highlightId?: string; // emphasized node (e.g. clicked from an agent citation)
  activeNodes?: string[]; // agent "visualize" replay — nodes reached so far
  activeNode?: string; // the node the replay just lit (extra emphasis)
  agentOpen?: boolean; // drawer open -> zoom out + shift left so the whole graph clears it
  onNodeSelect?: (nodeId: string) => void; // stubbed wiring; full focus is Phase 3
}) {
  const [zoom, setZoom] = useState(1);
  const [hovered, setHovered] = useState<string | null>(null);
  const activeSet = useMemo(() => new Set(activeNodes ?? []), [activeNodes]);
  const replaying = activeSet.size > 0;

  const nodeById = useMemo(() => {
    const m = new Map<string, GNode>();
    for (const n of data.nodes) m.set(n.id, n);
    return m;
  }, [data]);

  // attributed name lives on the node; the address / registry id comes from the
  // entity profile — crypto nodes show both (name + on-chain address)
  const refById = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of data.nodes) {
      const r = eng.getEntity(n.id).rootRef;
      if (r && r !== "—") m.set(n.id, r);
    }
    return m;
  }, [data, eng]);

  const connected = useMemo(() => {
    if (!hovered) return null;
    const ids = new Set<string>();
    for (const e of data.edges) {
      if (e.from === hovered || e.to === hovered) {
        ids.add(e.from);
        ids.add(e.to);
      }
    }
    return ids;
  }, [hovered, data]);

  // when the agent drawer overlays the right, zoom out + push left so the full
  // graph (incl. the rightmost subject) stays visible during the replay
  const effZoom = agentOpen ? Math.min(zoom, 0.78) : zoom;
  const shiftX = agentOpen ? -55 : 0;
  const transform = `translate(${VB_W / 2 + shiftX} ${VB_H / 2}) scale(${effZoom}) translate(${-VB_W / 2} ${-VB_H / 2})`;

  return (
    <div className="relative h-full w-full overflow-hidden bg-canvas">
      {/* faint technical dot-grid — institutional canvas, not decoration */}
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            "radial-gradient(var(--hairline) 0.5px, transparent 0.5px)",
          backgroundSize: "26px 26px",
        }}
        aria-hidden
      />

      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMidYMid meet"
        className="relative h-full w-full"
      >
        <defs>
          {(
            [
              ["arrow-faint", "var(--text-faint)"],
              ["arrow-accent", "var(--accent)"],
              ["arrow-risk", "var(--risk-high)"],
            ] as const
          ).map(([id, fill]) => (
            <marker
              key={id}
              id={id}
              markerWidth="7"
              markerHeight="7"
              refX="6"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L6,3 L0,6 z" fill={fill} />
            </marker>
          ))}
        </defs>

        <g transform={transform}>
          {/* edges */}
          {data.edges.map((e, i) => {
            const a = nodeById.get(e.from);
            const b = nodeById.get(e.to);
            if (!a || !b) return null;
            const { x1, y1, x2, y2 } = trim(a, b, NODE_R);
            const tone = edgeTone(e, sanctionedSource);
            const faded = taintOnly && !e.tainted;
            const dim =
              connected && !(connected.has(e.from) && connected.has(e.to));
            const bothActive =
              activeSet.has(e.from) && activeSet.has(e.to);
            // leave the rest of the graph untouched — only the replayed path
            // changes (no dimming of anything else)
            const opacity = faded
              ? "opacity-[0.06]"
              : dim
                ? "opacity-20"
                : "opacity-100";
            // the reached tainted segment brightens + thickens during the replay
            const activeEdge = replaying && bothActive && e.tainted;
            const stroke = activeEdge
              ? e.from === sanctionedSource
                ? "stroke-risk-high"
                : "stroke-accent-hi"
              : tone.stroke;
            return (
              <line
                key={`e-${i}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                strokeWidth={activeEdge ? 3 : tone.width}
                markerEnd={tone.marker}
                className={cn(stroke, "transition-all duration-300", opacity)}
              />
            );
          })}

          {/* edge value chips */}
          {data.edges.map((e, i) => {
            const a = nodeById.get(e.from);
            const b = nodeById.get(e.to);
            if (!a || !b) return null;
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            const faded = taintOnly && !e.tainted;
            const dim =
              connected && !(connected.has(e.from) && connected.has(e.to));
            return (
              <foreignObject
                key={`l-${i}`}
                x={mx - 32}
                y={my - 9}
                width="64"
                height="18"
                className={cn(
                  "overflow-visible transition-opacity",
                  faded ? "opacity-0" : dim ? "opacity-20" : "opacity-100",
                )}
              >
                <div className="flex justify-center">
                  <span
                    className={cn(
                      "border px-1 font-mono text-[10px] leading-4 tnum",
                      e.tainted
                        ? "border-hairline bg-surface text-text"
                        : "border-hairline bg-surface text-faint",
                    )}
                  >
                    {e.label}
                  </span>
                </div>
              </foreignObject>
            );
          })}

          {/* replay pulse ring on the node the agent just lit (SVG-native) */}
          {activeNode &&
            (() => {
              const n = nodeById.get(activeNode);
              if (!n) return null;
              return (
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={24}
                  fill="none"
                  stroke="var(--accent-hi)"
                  strokeWidth={2}
                  className="replay-ring"
                />
              );
            })()}

          {/* nodes */}
          {data.nodes.map((n) => (
            <foreignObject
              key={n.id}
              x={n.x - 56}
              y={n.y - 22}
              width="112"
              height="84"
              className={cn(
                "overflow-visible transition-opacity duration-300",
                // nothing dims during replay — only the path nodes get rings
                taintOnly && n.role === "clean" ? "opacity-30" : "opacity-100",
              )}
              onMouseEnter={() => setHovered(n.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onNodeSelect?.(n.id)}
            >
              <div className="cursor-pointer">
                <NodeTile
                  node={n}
                  entityRef={refById.get(n.id)}
                  hovered={hovered === n.id}
                  highlighted={highlightId === n.id}
                  active={activeSet.has(n.id)}
                  current={activeNode === n.id}
                />
              </div>
            </foreignObject>
          ))}
        </g>
      </svg>

      {/* zoom controls bottom-right */}
      <div className="absolute bottom-3 right-3 flex flex-col border border-hairline bg-surface">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setZoom((z) => Math.min(2, +(z + 0.2).toFixed(2)))}
          aria-label="zoom in"
        >
          <Plus className="size-3.5 stroke-[1.5]" />
        </Button>
        <div className="h-px bg-hairline" />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(2)))}
          aria-label="zoom out"
        >
          <Minus className="size-3.5 stroke-[1.5]" />
        </Button>
        <div className="h-px bg-hairline" />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setZoom(1)}
          aria-label="reset zoom"
        >
          <Maximize2 className="size-3.5 stroke-[1.5]" />
        </Button>
      </div>

      {/* canvas legend — quiet, bottom-left */}
      <div className="absolute bottom-3 left-3 flex items-center gap-3 border border-hairline bg-surface px-2 py-1 font-mono text-[10px] text-faint">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-risk-high" />
          tainted→sanctioned
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-accent" />
          tainted
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-px w-4 bg-faint" />
          clean
        </span>
      </div>
    </div>
  );
}
