from __future__ import annotations

from collections import deque
from typing import Optional

from pydantic import BaseModel

from graph import GraphSource


# ─────────────────────────── tunables ───────────────────────────
DEFAULT_MAX_HOPS = 3
DEFAULT_LIMIT = 50          # max in/out edges considered per node (caps hub fan-out)
MIXER_PASSTHROUGH = 0.5     # taint retained when a path crosses a mixer (0.0 == legacy hard-stop)
HOP_DECAY = 1.0             # 1.0 == principled haircut; 0.85 ≈ reproduces the legacy per-hop decay
MAX_SEED_BREAKDOWN = 8      # cap per-seed decomposition (keeps dense-graph queries bounded)
EPS = 1e-9


class TaintContribution(BaseModel):
    """One sanctioned source's share of the query's value, with its evidence chain."""

    seed: str
    taint: float
    path: list[str]
    via_mixer: bool = False


class ExposureResult(BaseModel):
    # ── legacy contract (unchanged — fuse.py / main.py depend on these) ──
    taint: float = 0.0
    path: list[str] = []
    hops: int = 0
    mixer_detected: bool = False
    # ── additive: richer, fully-explainable output ──
    confidence: float = 1.0
    contributions: list[TaintContribution] = []
    seeds_reached: int = 0
    nodes_explored: int = 0
    taint_model: str = "haircut"


# node-local edge metadata, computed once during cone discovery: (edges, total_value, use_uniform)
_Meta = tuple[list, float, bool]


def _other(edge, direction: str) -> str:
    """The node on the far side of an edge, in trace direction."""
    return edge.src if direction == "in" else edge.dst


def _weight(edge, n_edges: int, total: float, uniform: bool) -> float:
    """Proportional share of this edge in its node's in/out flow."""
    if uniform:
        return 1.0 / n_edges
    return (edge.value or 0.0) / total


def _discover_cone(query, graph, direction, max_hops, limit):
    """BFS the depth-bounded reachability cone once.

    Each distinct node is visited a single time (unlike per-path enumeration),
    and sanctioned nodes are absorbing — we never trace past them. Returns the
    visit order, cached per-node edge metadata, the sanctioned seeds and mixers
    reached, and a depth map.
    """
    depth = {query: 0}
    meta: dict[str, _Meta] = {}
    seeds: set[str] = set()
    mixers: set[str] = set()
    order = [query]
    dq = deque([query])

    while dq:
        v = dq.popleft()
        d = depth[v]
        if d >= max_hops or graph.is_sanctioned(v):
            continue  # boundary or absorbing → don't expand past it
        edges = graph.neighbors(v, direction, limit=limit)
        if not edges:
            continue
        total = sum(e.value for e in edges if e.value) or len(edges)
        uniform = all(e.value is None for e in edges)
        meta[v] = (edges, total, uniform)
        for e in edges:
            u = _other(e, direction)
            if u in depth:
                continue
            depth[u] = d + 1
            order.append(u)
            if graph.is_sanctioned(u):
                seeds.add(u)
            node = graph.node(u)
            if node and "mixer" in node.labels:
                mixers.add(u)
            dq.append(u)

    return order, meta, seeds, mixers, depth


def _propagate(order, meta, pin, direction, mixers, mixer_passthrough, hop_decay, max_hops):
    """Bounded value iteration of the absorbing-chain haircut model:

        t[v] = Σ_u  weight(u→v) · passthrough(u) · t[u]

    Seeds are held fixed (``pin``); ``max_hops`` Jacobi sweeps propagate taint up
    to ``max_hops`` edges from a source. Cycle-safe — it is a contraction toward
    the absorbing-chain fixpoint, so revisits converge instead of looping.
    """
    t = {n: 0.0 for n in order}
    for n, val in pin.items():
        if n in t:
            t[n] = val

    for _ in range(max_hops):
        prev = t
        t = dict(prev)
        changed = False
        for v in order:
            if v in pin:
                continue  # absorbing / fixed source
            m = meta.get(v)
            if m is None:
                continue  # cone boundary — upstream not traced, stays clean
            edges, total, uniform = m
            acc = 0.0
            for e in edges:
                u = _other(e, direction)
                tu = prev.get(u, 0.0)
                if tu <= 0.0:
                    continue
                c = _weight(e, len(edges), total, uniform) * tu * hop_decay
                if u in mixers:
                    c *= mixer_passthrough
                acc += c
            if abs(acc - t[v]) > EPS:
                changed = True
            t[v] = acc
        if not changed:
            break
    return t


def _trace(query, t, meta, direction, graph, mixers, mixer_passthrough, max_hops):
    """Greedy dominant evidence chain: at each step follow the neighbor that
    contributes the most taint, until a sanctioned source is reached."""
    path = [query]
    seen = {query}
    cur = query
    via_mixer = False
    for _ in range(max_hops):
        if graph.is_sanctioned(cur):
            break
        m = meta.get(cur)
        if m is None:
            break
        edges, total, uniform = m
        best_u, best_c = None, 0.0
        for e in edges:
            u = _other(e, direction)
            if u in seen:
                continue
            tu = t.get(u, 0.0)
            if tu <= 0.0:
                continue
            c = _weight(e, len(edges), total, uniform) * tu
            if u in mixers:
                c *= mixer_passthrough
            if c > best_c:
                best_c, best_u = c, u
        if best_u is None:
            break
        if best_u in mixers:
            via_mixer = True
        path.append(best_u)
        seen.add(best_u)
        cur = best_u
    return path, via_mixer


def exposure(
    query: str,
    graph: GraphSource,
    direction: str = "in",
    max_hops: int = DEFAULT_MAX_HOPS,
    *,
    limit: int = DEFAULT_LIMIT,
    mixer_passthrough: float = MIXER_PASSTHROUGH,
    hop_decay: float = HOP_DECAY,
    breakdown: bool = True,
    max_seed_breakdown: int = MAX_SEED_BREAKDOWN,
) -> ExposureResult:
    """Proportional ("haircut") sanctions-exposure trace — weighted reachability
    over a value-flow graph, modelled as absorption in an absorbing Markov chain.

    direction="in"  → source-of-funds: how much of the query's *inflow* traces
                      back to a sanctioned source.
    direction="out" → destination: how much of the query's *outflow* reaches one.

    Returns the aggregate taint (sum over *all* tainted paths, no double-count),
    the dominant evidence chain, and a per-seed breakdown — in the same
    ``ExposureResult`` shape the rest of the engine already consumes.
    """
    if graph.is_sanctioned(query):
        return ExposureResult(
            taint=1.0,
            path=[query],
            hops=0,
            seeds_reached=1,
            nodes_explored=1,
            contributions=[TaintContribution(seed=query, taint=1.0, path=[query])],
        )

    order, meta, seeds, mixers, depth = _discover_cone(query, graph, direction, max_hops, limit)

    if not seeds:
        return ExposureResult(nodes_explored=len(order), mixer_detected=bool(mixers))

    # aggregate taint: every seed absorbing at 1.0, so each unit of value is
    # credited to its *nearest* sanctioned source (no path double-counting).
    t_all = _propagate(
        order, meta, {s: 1.0 for s in seeds}, direction, mixers, mixer_passthrough, hop_decay, max_hops
    )
    taint = t_all.get(query, 0.0)
    dom_path, _ = _trace(query, t_all, meta, direction, graph, mixers, mixer_passthrough, max_hops)

    # per-seed decomposition — additive by linearity: pin one seed at 1.0 and the
    # rest at 0.0, so each unit is attributed to exactly its nearest source and
    # Σ contributions == aggregate taint.
    contributions: list[TaintContribution] = []
    if breakdown and taint > EPS:
        chosen = sorted(seeds, key=lambda s: depth[s])[:max_seed_breakdown]
        for s in chosen:
            pin = {x: (1.0 if x == s else 0.0) for x in seeds}
            t_s = _propagate(order, meta, pin, direction, mixers, mixer_passthrough, hop_decay, max_hops)
            val = t_s.get(query, 0.0)
            if val <= EPS:
                continue
            p_s, via = _trace(query, t_s, meta, direction, graph, mixers, mixer_passthrough, max_hops)
            contributions.append(
                TaintContribution(seed=s, taint=round(val, 4), path=p_s, via_mixer=via)
            )
        contributions.sort(key=lambda c: c.taint, reverse=True)

    mixers_on_dom = sum(1 for n in dom_path if n in mixers)
    confidence = round(mixer_passthrough ** mixers_on_dom, 4) if mixers_on_dom else 1.0

    return ExposureResult(
        taint=round(taint, 4),
        path=dom_path,
        hops=max(len(dom_path) - 1, 0),
        mixer_detected=bool(mixers),
        confidence=confidence,
        contributions=contributions,
        seeds_reached=len(seeds),
        nodes_explored=len(order),
        taint_model="haircut",
    )
