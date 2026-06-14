from __future__ import annotations
from enum import Enum
from typing import Optional
from pydantic import BaseModel
import datetime
import uuid

from resolver import ResolveResult
from traverse import ExposureResult


class Signal(str, Enum):
    CLEAN = "clean"
    LOW = "low"
    FLAGGED = "flagged"
    REVIEW = "review"


class VerdictType(str, Enum):
    MATCH = "MATCH"
    REVIEW = "REVIEW"
    NO_MATCH = "NO_MATCH"


class Corner(BaseModel):
    corner: str
    signal: Signal
    score: float
    evidence: dict = {}


class Policy(BaseModel):
    version: str = "v1"
    match_threshold: float = 0.85
    review_threshold: float = 0.40
    weights: dict[str, float] = {
        "originator_identity": 0.25,
        "source_funds": 0.30,
        "beneficiary_identity": 0.25,
        "destination": 0.20,
    }


class Verdict(BaseModel):
    request_id: str
    verdict: VerdictType
    score: float
    corners: list[Corner]
    list_version: str
    audit_id: str
    explanation: str
    timestamp: str


DEFAULT_POLICY = Policy()


def _corner_score_identity(resolve: ResolveResult) -> tuple[float, dict]:
    score = resolve.name_score
    if resolve.sanctioned_wallet:
        score = max(score, 1.0)

    evidence = {}
    if resolve.matched_entity:
        evidence["matched_entity"] = resolve.matched_entity
        evidence["name_score"] = resolve.name_score
        evidence["fields_matched"] = resolve.fields_matched
    if resolve.sanctioned_wallet:
        evidence["wallet_hit"] = True

    return round(score, 4), evidence


def _corner_score_exposure(exp: ExposureResult, graph_name: str) -> tuple[float, dict]:
    score = exp.taint
    if exp.mixer_detected:
        score = max(score, 0.3)

    evidence = {}
    if exp.path:
        evidence["graph"] = graph_name
        evidence["path"] = exp.path
        evidence["hops"] = exp.hops
        evidence["taint_pct"] = exp.taint
    if exp.mixer_detected:
        evidence["mixer_detected"] = True
    if exp.sources:
        evidence["sources"] = exp.sources

    return round(score, 4), evidence


def _signal_from_score(score: float, policy: Policy) -> Signal:
    if score >= policy.match_threshold:
        return Signal.FLAGGED
    if score >= policy.review_threshold:
        return Signal.REVIEW
    if score > 0.1:
        return Signal.LOW
    return Signal.CLEAN


def fuse(
    request_id: str,
    originator_resolve: ResolveResult,
    beneficiary_resolve: ResolveResult,
    source_exposure: ExposureResult,
    dest_exposure: ExposureResult,
    ownership_exposure: ExposureResult,
    list_version: str = "ofac-latest",
    policy: Policy = DEFAULT_POLICY,
) -> Verdict:
    orig_score, orig_evidence = _corner_score_identity(originator_resolve)
    benef_score, benef_evidence = _corner_score_identity(beneficiary_resolve)
    source_score, source_evidence = _corner_score_exposure(source_exposure, "crypto")

    dest_raw, dest_evidence = _corner_score_exposure(dest_exposure, "crypto")
    own_raw, own_evidence = _corner_score_exposure(ownership_exposure, "ownership")
    dest_score = max(dest_raw, own_raw)
    if own_evidence:
        dest_evidence = {**dest_evidence, **own_evidence}

    corners = [
        Corner(
            corner="originator_identity",
            signal=_signal_from_score(orig_score, policy),
            score=orig_score,
            evidence=orig_evidence,
        ),
        Corner(
            corner="source_funds",
            signal=_signal_from_score(source_score, policy),
            score=source_score,
            evidence=source_evidence,
        ),
        Corner(
            corner="beneficiary_identity",
            signal=_signal_from_score(benef_score, policy),
            score=benef_score,
            evidence=benef_evidence,
        ),
        Corner(
            corner="destination",
            signal=_signal_from_score(dest_score, policy),
            score=dest_score,
            evidence=dest_evidence,
        ),
    ]

    w = policy.weights
    
    # This is really compilcated to do
    weighted = (
        w["originator_identity"] * orig_score
        + w["source_funds"] * source_score
        + w["beneficiary_identity"] * benef_score
        + w["destination"] * dest_score
    )
    max_corner = max(c.score for c in corners)
    final_score = round(max(weighted, max_corner * 0.6 + weighted * 0.4), 4)
    final_score = min(final_score, 1.0)

    has_wallet_hit = originator_resolve.sanctioned_wallet or beneficiary_resolve.sanctioned_wallet

    if has_wallet_hit:
        verdict_type = VerdictType.MATCH
        final_score = max(final_score, 1.0)
    elif max_corner >= policy.match_threshold:
        verdict_type = VerdictType.MATCH
        final_score = max(final_score, max_corner)
    elif final_score >= policy.match_threshold:
        verdict_type = VerdictType.MATCH
    elif final_score >= policy.review_threshold or max_corner >= policy.review_threshold:
        verdict_type = VerdictType.REVIEW
    else:
        verdict_type = VerdictType.NO_MATCH

    parts = []
    for c in corners:
        if c.signal in (Signal.FLAGGED, Signal.REVIEW):
            parts.append(f"{c.corner}: {c.signal.value} (score {c.score})")
    explanation = "; ".join(parts) if parts else "All corners clean."

    return Verdict(
        request_id=request_id,
        verdict=verdict_type,
        score=final_score,
        corners=corners,
        list_version=list_version,
        audit_id=f"aud_{uuid.uuid4().hex[:8]}",
        explanation=explanation,
        timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),
    )
