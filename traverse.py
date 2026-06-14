from __future__ import annotations
from collections import defaultdict
from pydantic import BaseModel
from graph import GraphSource


class ExposureResult(BaseModel):
    taint: float = 0.0
    path: list[str] = []
    hops: int = 0
    mixer_detected: bool = False
    sources: dict[str, float] = {}


MIXER_PASSTHROUGH = 0.4
MAX_ITERATIONS = 50
CONVERGENCE_EPS = 1e-6


def exposure(
    query: str,
    graph: GraphSource,
    direction: str = "in",
    max_hops: int = 3,
) -> ExposureResult:
    if graph.is_sanctioned(query):
        return ExposureResult(taint=1.0, path=[query], hops=0, sources={query: 1.0})

    reachable = {query}
    frontier = [query]
    for _ in range(max_hops):
        nxt = []
        for nid in frontier:
            for e in graph.neighbors(nid, direction):
                nb = e.src if direction == "in" else e.dst
                if nb not in reachable:
                    reachable.add(nb)
                    nxt.append(nb)
        frontier = nxt
        if not frontier:
            break

    sanctioned = set()
    mixer_detected = False
    for v in reachable:
        if graph.is_sanctioned(v):
            sanctioned.add(v)
        node = graph.node(v)
        if node and "mixer" in node.labels:
            mixer_detected = True

    if not sanctioned:
        return ExposureResult(mixer_detected=mixer_detected)

    taint: dict[str, dict[str, float]] = {v: {} for v in reachable}
    for s in sanctioned:
        taint[s] = {s: 1.0}

    for _ in range(MAX_ITERATIONS):
        max_delta = 0.0
        for v in reachable:
            if v in sanctioned:
                continue
            edges = graph.neighbors(v, direction)
            if not edges:
                continue

            total_val = sum(e.value for e in edges if e.value) or len(edges)
            uniform = all(e.value is None for e in edges)

            new_t: dict[str, float] = defaultdict(float)
            for e in edges:
                nb = e.src if direction == "in" else e.dst
                share = (1.0 / len(edges)) if uniform else ((e.value or 0) / total_val)

                alpha = 1.0
                if nb not in sanctioned:
                    nb_node = graph.node(nb)
                    if nb_node and "mixer" in nb_node.labels:
                        alpha = MIXER_PASSTHROUGH

                for s, c in taint.get(nb, {}).items():
                    new_t[s] += share * alpha * c

            old_sum = sum(taint[v].values())
            new_sum = sum(new_t.values())
            max_delta = max(max_delta, abs(new_sum - old_sum))
            taint[v] = dict(new_t)

        if max_delta < CONVERGENCE_EPS:
            break

    path = _trace_path(query, graph, taint, direction, max_hops)

    q_taint = taint.get(query, {})
    total = min(sum(q_taint.values()), 1.0)

    return ExposureResult(
        taint=round(total, 4),
        path=path,
        hops=max(len(path) - 1, 0),
        mixer_detected=mixer_detected,
        sources={
            s: round(c, 4)
            for s, c in sorted(q_taint.items(), key=lambda x: -x[1])
            if c > 0.0001
        },
    )


def _trace_path(
    query: str,
    graph: GraphSource,
    taint: dict[str, dict[str, float]],
    direction: str,
    max_hops: int,
) -> list[str]:
    path = [query]
    cur = query
    for _ in range(max_hops):
        edges = graph.neighbors(cur, direction)
        if not edges:
            break
        total_val = sum(e.value for e in edges if e.value) or len(edges)
        uniform = all(e.value is None for e in edges)

        best_nb, best_score = None, 0.0
        for e in edges:
            nb = e.src if direction == "in" else e.dst
            if nb in path:
                continue
            share = (1.0 / len(edges)) if uniform else ((e.value or 0) / total_val)
            score = share * sum(taint.get(nb, {}).values())
            if score > best_score:
                best_score = score
                best_nb = nb

        if best_nb is None:
            break
        path.append(best_nb)
        if graph.is_sanctioned(best_nb):
            break
        cur = best_nb

    return path
