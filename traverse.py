from __future__ import annotations
from pydantic import BaseModel
from graph import GraphSource


class ExposureResult(BaseModel):
    taint: float = 0.0
    path: list[str] = []
    hops: int = 0
    mixer_detected: bool = False


DECAY = 0.85
MAX_FRONTIER = 200


def exposure(
    query: str,
    graph: GraphSource,
    direction: str = "in",
    max_hops: int = 3,
) -> ExposureResult:
    """Haircut traversal from query node toward sanctioned nodes.

    direction="in"  → trace source of funds (backward)
    direction="out" → trace destination (forward)
    """
    if graph.is_sanctioned(query):
        return ExposureResult(taint=1.0, path=[query], hops=0)

    best_taint = 0.0
    best_path: list[str] = []
    mixer_hit = False

    frontier: list[tuple[str, float, list[str]]] = [(query, 1.0, [query])]

    for _ in range(max_hops):
        nxt: list[tuple[str, float, list[str]]] = []

        for node_id, frac, path in frontier:
            edges = graph.neighbors(node_id, direction, limit=50)
            if not edges:
                continue

            total_value = sum(e.value for e in edges if e.value) or len(edges)
            use_uniform = all(e.value is None for e in edges)

            for e in edges:
                neighbor = e.src if direction == "in" else e.dst
                if neighbor in path:
                    continue

                if use_uniform:
                    share = 1.0 / len(edges)
                else:
                    share = (e.value or 0) / total_value

                new_frac = frac * share

                neighbor_node = graph.node(neighbor)
                if neighbor_node and "mixer" in neighbor_node.labels:
                    mixer_hit = True
                    continue

                new_path = path + [neighbor]

                if graph.is_sanctioned(neighbor):
                    if new_frac > best_taint:
                        best_taint = new_frac
                        best_path = new_path
                else:
                    nxt.append((neighbor, new_frac * DECAY, new_path))

        nxt.sort(key=lambda x: x[1], reverse=True)
        frontier = nxt[:MAX_FRONTIER]

        if not frontier:
            break

    return ExposureResult(
        taint=round(best_taint, 4),
        path=best_path,
        hops=max(len(best_path) - 1, 0),
        mixer_detected=mixer_hit,
    )
