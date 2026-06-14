"""
throughline screening service — HTTP wrapper around the existing pipeline.

Wraps screen() (resolver -> graph -> traverse -> fuse) behind a small FastAPI so
the Next.js console can screen a live payment and render the result. Graphs and
the resolver load ONCE at import (module-level), not per request.

The pipeline itself returns a verdict + corner evidence (paths). This service
ENRICHES that into what a UI needs: a positioned-agnostic subgraph (nodes/edges
with metadata + tainted flags), the subject node, and the sanctioned source.

Run:  uvicorn service:app --port 8000
"""
from __future__ import annotations

import re
import uuid
from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from rapidfuzz import fuzz

from adapters import (
    Direction,
    EntityIds,
    Participant,
    ParticipantType,
    Rail,
    ScreenRequest,
)
from resolver import Resolver, normalize_name
from graph import CryptoGraph, OwnershipGraph
from data import SANCTIONS_LIST
from main import screen

# ── load once ──────────────────────────────────────────────────────────────
CRYPTO_GRAPH = CryptoGraph.from_synthetic("data/synthetic")
OWNERSHIP_GRAPH = OwnershipGraph.from_synthetic("data/synthetic")
RESOLVER = Resolver(SANCTIONS_LIST)
LIST_VERSION = "OFAC-SDN-2026-06-14"
POLICY_VERSION = "POL-real-v1"

# company display-name -> ownership node id, for fiat name->UBO lookup
COMPANY_NAMES = {
    nid: (node.labels[0] if node.labels else nid)
    for nid, node in OWNERSHIP_GRAPH._nodes.items()
    if node.type == "company"
}

CRYPTO_CATEGORIES = ("sanctioned", "mixer", "darknet", "high-risk", "exchange", "clean")


# ── request / response models ──────────────────────────────────────────────
class PartyIn(BaseModel):
    name: Optional[str] = None
    wallet: Optional[str] = None
    country: Optional[str] = None
    reg_no: Optional[str] = None
    dob: Optional[str] = None
    nationality: Optional[str] = None


class ScreenIn(BaseModel):
    scenario: str = "off_ramp"  # on_ramp | off_ramp | fiat
    amount: Optional[str] = "0"
    asset: Optional[str] = None
    currency: Optional[str] = None
    originator: PartyIn = PartyIn()
    beneficiary: PartyIn = PartyIn()
    ownership_node: Optional[str] = None
    request_id: Optional[str] = None


class ResolveIn(BaseModel):
    name: Optional[str] = None
    type: str = "business"  # business | individual


app = FastAPI(title="throughline-engine")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── helpers ────────────────────────────────────────────────────────────────
def _to_participant(p: PartyIn, ptype: ParticipantType) -> Participant:
    return Participant(
        type=ptype,
        name=p.name,
        wallet=p.wallet,
        ids=EntityIds(
            dob=p.dob,
            nationality=p.nationality,
            country=p.country,
            reg_no=p.reg_no,
        ),
    )


def _find_ownership_node(name: Optional[str]) -> Optional[str]:
    """Best-effort: map a typed company name to a UBO graph node."""
    if not name:
        return None
    q = normalize_name(name)
    best, best_score = None, 0.0
    for nid, cname in COMPANY_NAMES.items():
        s = fuzz.token_set_ratio(q, normalize_name(cname)) / 100.0
        if s > best_score:
            best, best_score = nid, s
    return best if best_score >= 0.6 else None


def _node_label(node, nid: str) -> str:
    if node and node.labels:
        first = node.labels[0]
        if first and first not in CRYPTO_CATEGORIES and first not in ("licit", "illicit"):
            return first
    return nid


def _node_category(graph, nid: str, node) -> str:
    if graph.is_sanctioned(nid):
        return "sanctioned"
    labels = node.labels if node else []
    if "mixer" in labels:
        return "mixer"
    if node and node.type == "exchange":
        return "exchange"
    return "clean"


def _build_subgraph(verdict, subject_id, subject_graph):
    """Render-ready subgraph centred on the trace: the sanctioned-path edges
    (tainted) plus the clean co-inputs feeding each non-sanctioned node on the
    path (the haircut split). Sanctioned nodes are terminal sources — we don't
    pull their neighbours, so they sit cleanly at the left of the layout."""
    nodes: dict[str, dict] = {}
    edges: dict[tuple, dict] = {}

    def add_node(graph, nid: str):
        if nid in nodes:
            return
        node = graph.node(nid)
        nodes[nid] = {
            "id": nid,
            "label": _node_label(node, nid),
            "type": node.type if node else "address",
            "sanctioned": graph.is_sanctioned(nid),
            "category": _node_category(graph, nid, node),
        }

    def add_edge(graph, e, tainted: bool):
        key = (e.src, e.dst)
        if key not in edges:
            edges[key] = {"src": e.src, "dst": e.dst, "value": e.value, "kind": e.kind, "tainted": tainted}
        elif tainted:
            edges[key]["tainted"] = True
        add_node(graph, e.src)
        add_node(graph, e.dst)

    def find_edge(graph, a: str, b: str):
        for e in graph.neighbors(a, "out", limit=50):
            if e.dst == b:
                return e
        for e in graph.neighbors(a, "in", limit=50):
            if e.src == b:
                return e
        return None

    def clean_inputs(graph, nid: str):
        if graph.is_sanctioned(nid):
            return  # terminal source
        for e in graph.neighbors(nid, "in", limit=6):
            add_edge(graph, e, False)

    # seed with the subject so clean cases still show contributors
    if subject_id and subject_graph.node(subject_id):
        add_node(subject_graph, subject_id)
        clean_inputs(subject_graph, subject_id)

    for corner in verdict.corners:
        ev = corner.evidence or {}
        path = ev.get("path") or []
        if not path:
            continue
        graph = OWNERSHIP_GRAPH if ev.get("graph") == "ownership" else CRYPTO_GRAPH
        for nid in path:
            add_node(graph, nid)
        for i in range(len(path) - 1):
            e = find_edge(graph, path[i], path[i + 1])
            if e:
                add_edge(graph, e, True)
        for nid in path:
            clean_inputs(graph, nid)

    return {"nodes": list(nodes.values()), "edges": list(edges.values())}


def _identity_graph(verdict, body: "ScreenIn"):
    """Fallback graph for fiat name-match / clean cases that have no traversal
    path: an Originator -> Beneficiary payment, plus a tainted edge to the
    matched sanctioned entity when identity screening fired. Keeps the canvas
    meaningful even when there is no on-chain / ownership trace."""
    orig_id, benef_id = "party_orig", "party_benef"
    nodes = [
        {"id": orig_id, "label": body.originator.name or "Originator",
         "type": "company", "sanctioned": False, "category": "clean"},
        {"id": benef_id, "label": body.beneficiary.name or "Beneficiary",
         "type": "company", "sanctioned": False, "category": "clean"},
    ]
    amt = (body.amount or "0")
    pay_label = f"{amt} {body.currency}".strip() if body.currency else amt
    edges = [{"src": orig_id, "dst": benef_id, "value": None,
              "label_override": pay_label, "tainted": False, "kind": "payment"}]

    subject_id, sanctioned_source = benef_id, None
    for corner in verdict.corners:
        if corner.corner not in ("originator_identity", "beneficiary_identity"):
            continue
        ev = corner.evidence or {}
        matched = ev.get("matched_entity")
        if corner.score <= 0 or not matched:
            continue
        party = orig_id if corner.corner == "originator_identity" else benef_id
        slug = re.sub(r"[^a-z0-9]", "", matched.lower())[:14] or "entity"
        san_id = f"san_{slug}"
        nodes.append({"id": san_id, "label": matched, "type": "company",
                      "sanctioned": True, "category": "sanctioned"})
        score = ev.get("name_score") or corner.score
        edges.append({"src": party, "dst": san_id, "value": None,
                      "label_override": f"{round(score * 100)}% name",
                      "tainted": True, "kind": "identity"})
        subject_id, sanctioned_source = party, san_id

    return {"nodes": nodes, "edges": edges}, subject_id, sanctioned_source


def _pick_sanctioned_source(verdict) -> Optional[str]:
    best, best_score = None, -1.0
    for corner in verdict.corners:
        ev = corner.evidence or {}
        path = ev.get("path") or []
        if not path:
            continue
        graph = OWNERSHIP_GRAPH if ev.get("graph") == "ownership" else CRYPTO_GRAPH
        last = path[-1]
        if graph.is_sanctioned(last) and corner.score > best_score:
            best, best_score = last, corner.score
    return best


# ── routes ─────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"ok": True, "service": "throughline-engine", "listVersion": LIST_VERSION}


@app.post("/resolve")
def resolve(body: ResolveIn):
    """Lightweight name screen for the live readout — no graph traversal."""
    if not body.name:
        return {"matched_entity": None, "name_score": 0.0}
    ptype = ParticipantType.INDIVIDUAL if body.type == "individual" else ParticipantType.BUSINESS
    result = RESOLVER.resolve(Participant(type=ptype, name=body.name))
    return {
        "matched_entity": result.matched_entity,
        "name_score": result.name_score,
        "fields_matched": result.fields_matched,
    }


@app.post("/screen")
def screen_endpoint(body: ScreenIn):
    scenario = body.scenario
    if scenario == "on_ramp":
        direction, rail = Direction.DEPOSIT, Rail.CRYPTO
    elif scenario == "fiat":
        direction, rail = Direction.TRANSFER, Rail.FIAT
    else:  # off_ramp (default)
        scenario, direction, rail = "off_ramp", Direction.WITHDRAWAL, Rail.CRYPTO

    request = ScreenRequest(
        request_id=body.request_id or f"LIVE-{uuid.uuid4().hex[:6].upper()}",
        provider="console",
        direction=direction,
        rail=rail,
        asset=body.asset,
        currency=body.currency,
        amount=str(body.amount or "0"),
        originator=_to_participant(body.originator, ParticipantType.BUSINESS),
        beneficiary=_to_participant(body.beneficiary, ParticipantType.BUSINESS),
    )

    ownership_node = body.ownership_node
    if rail == Rail.FIAT and not ownership_node:
        ownership_node = _find_ownership_node(body.beneficiary.name)

    verdict = screen(request, RESOLVER, CRYPTO_GRAPH, OWNERSHIP_GRAPH, ownership_node=ownership_node)
    verdict.list_version = LIST_VERSION

    if scenario == "off_ramp":
        subject_id = request.originator.wallet
        subject_graph = CRYPTO_GRAPH
    elif scenario == "on_ramp":
        subject_id = request.beneficiary.wallet
        subject_graph = CRYPTO_GRAPH
    else:
        subject_id = ownership_node
        subject_graph = OWNERSHIP_GRAPH

    subgraph = _build_subgraph(verdict, subject_id, subject_graph)
    sanctioned_source = _pick_sanctioned_source(verdict)

    # no on-chain / ownership trace (name-match or clean) -> synthesize a
    # minimal identity/payment graph so the canvas is never empty.
    if not subgraph["nodes"]:
        subgraph, subject_id, sanctioned_source = _identity_graph(verdict, body)

    return {
        "verdict": verdict.model_dump(),
        "policyVersion": POLICY_VERSION,
        "subject_id": subject_id,
        "sanctioned_source": sanctioned_source,
        "ownership_node": ownership_node,
        "subgraph": subgraph,
        "request": {
            "scenario": scenario,
            "rail": rail.value,
            "amount": str(body.amount or "0"),
            "asset": body.asset,
            "currency": body.currency,
            "originator": body.originator.model_dump(),
            "beneficiary": body.beneficiary.model_dump(),
        },
    }
