"""Verification harness for the rewritten traverse.exposure().

Runs the new node-level haircut against an inline copy of the legacy beam-BFS on
(1) the real synthetic crypto graph and (2) a fan-in stress graph that exposes
the legacy single-best-path under-reporting. Not a unit test — a demo/diff.
"""
import time

from graph import CryptoGraph, Node, Edge
from traverse import exposure, ExposureResult


# ── verbatim copy of the ORIGINAL algorithm (incl. its pydantic return), for an
#    honest apples-to-apples delta — same model-construction cost on both sides ──
DECAY = 0.85
MAX_FRONTIER = 200


def legacy(query, graph, direction="in", max_hops=3):
    if graph.is_sanctioned(query):
        return ExposureResult(taint=1.0, path=[query], hops=0)
    best_taint, best_path, mixer_hit = 0.0, [], False
    frontier = [(query, 1.0, [query])]
    for _ in range(max_hops):
        nxt = []
        for node_id, frac, path in frontier:
            edges = graph.neighbors(node_id, direction, limit=50)
            if not edges:
                continue
            total = sum(e.value for e in edges if e.value) or len(edges)
            uni = all(e.value is None for e in edges)
            for e in edges:
                nb = e.src if direction == "in" else e.dst
                if nb in path:
                    continue
                share = (1.0 / len(edges)) if uni else (e.value or 0) / total
                nf = frac * share
                nn = graph.node(nb)
                if nn and "mixer" in nn.labels:
                    mixer_hit = True
                    continue
                npath = path + [nb]
                if graph.is_sanctioned(nb):
                    if nf > best_taint:
                        best_taint, best_path = nf, npath
                else:
                    nxt.append((nb, nf * DECAY, npath))
        nxt.sort(key=lambda x: x[1], reverse=True)
        frontier = nxt[:MAX_FRONTIER]
        if not frontier:
            break
    return ExposureResult(taint=round(best_taint, 4), path=best_path,
                          hops=max(len(best_path) - 1, 0), mixer_detected=mixer_hit)


def short(path):
    return " → ".join(p.replace("0x", "") for p in path) if path else "—"


# ─────────────────────── 1. real synthetic graph ───────────────────────
g = CryptoGraph.from_synthetic("data/synthetic")

cases = [
    ("direct_hit", "0xSANC_TORNADO", "in"),
    ("high_taint", "0xHIGH_TAINT", "in"),
    ("low_taint", "0xLOW_TAINT", "in"),
    ("medium_2hop", "0xMED_TAINT", "in"),
    ("mixer_path", "0xMIXER_PATH", "in"),
    ("deep_3hop", "0xDEEP_TAINT", "in"),
    ("forward_out", "0xFWD_EXPOSED", "out"),
    ("clean", "0xCLEAN_WALLET", "in"),
]

print("\n=== synthetic crypto graph: legacy vs new ===")
print(f"{'case':<13}{'dir':<5}{'legacy':>8}{'new':>8}{'Δ':>9}   evidence / notes")
for name, node, d in cases:
    lt = legacy(node, g, d).taint
    r = exposure(node, g, d)
    notes = []
    if r.mixer_detected:
        notes.append(f"mixer conf={r.confidence}")
    if r.seeds_reached > 1:
        notes.append(f"{r.seeds_reached} sources")
    print(
        f"{name:<13}{d:<5}{lt:>8}{r.taint:>8}{r.taint - lt:>+9.4f}   "
        f"{short(r.path)}  {'· '.join(notes)}"
    )


# ─────────────── 2. fan-in stress: multi-path under-reporting ───────────────
def fanin(n_sanctioned, n_clean):
    g = CryptoGraph()
    q = "0xQUERY"
    g._nodes[q] = Node(id=q, type="address")
    for i in range(n_sanctioned):
        s = f"0xSANC_{i}"
        g._nodes[s] = Node(id=s, type="address", labels=["sanctioned"])
        g._illicit.add(s)
        e = Edge(src=s, dst=q, value=1.0, kind="transaction")
        g._out_edges[s].append(e)
        g._in_edges[q].append(e)
    for i in range(n_clean):
        c = f"0xCLEAN_{i}"
        g._nodes[c] = Node(id=c, type="address")
        e = Edge(src=c, dst=q, value=1.0, kind="transaction")
        g._out_edges[c].append(e)
        g._in_edges[q].append(e)
    return g, q


print("\n=== fan-in stress: 20 sanctioned + 20 clean sources, all equal value ===")
gs, q = fanin(20, 20)
lt = legacy(q, gs, "in").taint
r = exposure(q, gs, "in")
print(f"  true taint    = 0.5  (20 of 40 equal-value sources are sanctioned)")
print(f"  legacy        = {lt}   ← keeps only the single best path")
print(f"  new           = {r.taint}   ← aggregates all paths "
      f"({r.seeds_reached} seeds, breakdown capped at {len(r.contributions)})")


# ── wide layered DAG: heavy path-sharing, where node-DP beats path-enumeration ──
def wide_dag(width, layers):
    """layer 0 = query; each node in layer k has an edge from every node in
    layer k+1; the top layer is sanctioned. #distinct query→top paths grows as
    width^(layers-1) — legacy re-walks shared sub-paths, node-DP visits once."""
    g = CryptoGraph()
    prev = ["0xQUERY"]
    g._nodes["0xQUERY"] = Node(id="0xQUERY", type="address")
    for k in range(1, layers + 1):
        cur = []
        sanc = k == layers
        for i in range(width):
            nid = f"0xL{k}_{i}"
            g._nodes[nid] = Node(id=nid, type="address",
                                 labels=["sanctioned"] if sanc else [])
            if sanc:
                g._illicit.add(nid)
            cur.append(nid)
        for child in prev:                 # child is downstream (closer to query)
            for parent in cur:             # parent is upstream (source side)
                e = Edge(src=parent, dst=child, value=1.0, kind="transaction")
                g._out_edges[parent].append(e)
                g._in_edges[child].append(e)
        prev = cur
    return g, "0xQUERY"


def bench(fn, *args, n, **kw):
    t0 = time.perf_counter()
    for _ in range(n):
        fn(*args, **kw)
    return (time.perf_counter() - t0) / n * 1e6  # µs/call


print("\n=== perf: shallow synthetic cone (deep_3hop, max_hops=3) ===")
N = 3000
print(f"  legacy            = {bench(legacy, '0xDEEP_TAINT', g, 'in', n=N):7.1f} µs/call")
print(f"  new (full)        = {bench(exposure, '0xDEEP_TAINT', g, 'in', n=N):7.1f} µs/call")
print(f"  new (no breakdown)= {bench(exposure, '0xDEEP_TAINT', g, 'in', n=N, breakdown=False):7.1f} µs/call")

gd, qd = wide_dag(width=8, layers=5)
print(f"\n=== perf: wide DAG (width=8, 5 layers, heavy path-sharing, max_hops=5) ===")
print(f"  cone size = {len(gd._nodes)} nodes;  legacy frontier path-enumerates, capped at {MAX_FRONTIER}")
print(f"  legacy            = {bench(legacy, qd, gd, 'in', 5, n=500):7.1f} µs/call   taint={legacy(qd, gd, 'in', 5).taint}")
rr = exposure(qd, gd, 'in', 5, breakdown=False)
print(f"  new (no breakdown)= {bench(exposure, qd, gd, 'in', 5, n=500, breakdown=False):7.1f} µs/call   taint={rr.taint}")

print("\nback-compat fields present:", all(hasattr(r, f) for f in
      ("taint", "path", "hops", "mixer_detected")))
