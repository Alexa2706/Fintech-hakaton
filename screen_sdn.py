#!/usr/bin/env python3
"""
Hackathon-friendly OFAC SDN name screening demo.

Input: a transaction sender name and receiver name.
Output: MATCH, REVIEW, or NOT_MATCH for each name.

Optional quality improvement:
    pip install rapidfuzz unidecode

The core code works without external APIs and without those libraries, but
RapidFuzz gives better fuzzy matching behavior and faster scoring.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import unicodedata
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Iterable

try:
    from rapidfuzz import fuzz, process
except ImportError:  # pragma: no cover - exercised only when dependency missing
    fuzz = None
    process = None

try:
    from unidecode import unidecode
except ImportError:  # pragma: no cover - exercised only when dependency missing
    unidecode = None


SDN_COLUMNS = [
    "sdn_id",
    "name",
    "type",
    "program",
    "title",
    "call_sign",
    "vessel_type",
    "tonnage",
    "gross_registered_tonnage",
    "vessel_flag",
    "vessel_owner",
    "remarks",
]

# These are intentionally conservative starting thresholds for a sanctions demo.
# A score of 92+ usually means exact/near-exact identity after normalization or a
# very strong token-set match. A score of 80-91 can catch missing middle names,
# reordered parts, transliteration differences, and minor typos, but should go
# to a human reviewer because false positives are more likely.
MATCH_THRESHOLD = 92.0
REVIEW_THRESHOLD = 80.0
FAST_PREFILTER_LIMIT = 250
FAST_PREFILTER_CUTOFF = 55.0

LEGAL_SUFFIXES = {
    "ag",
    "co",
    "company",
    "corp",
    "corporation",
    "gmbh",
    "inc",
    "incorporated",
    "jsc",
    "llc",
    "ltd",
    "limited",
    "llp",
    "plc",
    "s a",
    "sa",
    "sarl",
}


@dataclass(frozen=True)
class NameCandidate:
    value: str
    kind: str  # "primary_name" or alias marker like "a.k.a."
    normalized: str
    tokens: tuple[str, ...]


@dataclass
class SDNRecord:
    sdn_id: str
    name: str
    sdn_type: str
    program: str
    title: str = ""
    call_sign: str = ""
    vessel_type: str = ""
    tonnage: str = ""
    gross_registered_tonnage: str = ""
    vessel_flag: str = ""
    vessel_owner: str = ""
    remarks: str = ""
    aliases: list[dict[str, str]] = field(default_factory=list)
    candidates: list[NameCandidate] = field(default_factory=list)

    def summary(self) -> dict[str, Any]:
        """Return useful review fields without dumping the full raw row."""
        return {
            "sanctions_id": self.sdn_id,
            "primary_name": self.name,
            "type": clean_value(self.sdn_type),
            "program": clean_value(self.program),
            "title": clean_value(self.title),
            "vessel_flag": clean_value(self.vessel_flag),
            "vessel_owner": clean_value(self.vessel_owner),
            "aliases": self.aliases[:20],
        }


@dataclass(frozen=True)
class IndexedCandidate:
    record: SDNRecord
    candidate: NameCandidate


@dataclass(frozen=True)
class CandidateSearchIndex:
    entries: list[IndexedCandidate]
    normalized_names: list[str]


_CANDIDATE_INDEX_CACHE: dict[int, CandidateSearchIndex] = {}


def clean_value(value: str | None) -> str | None:
    """Convert OFAC's '-0-' empty marker and blank strings into None."""
    if value is None:
        return None
    value = value.strip()
    if not value or value == "-0-":
        return None
    return value


def strip_accents_standard_library(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def normalize_name(name: str) -> str:
    """
    Normalize names before matching:
    - transliterate accents/diacritics where possible
    - lowercase
    - remove punctuation differences
    - normalize whitespace
    """
    text = unidecode(name) if unidecode else strip_accents_standard_library(name)
    text = text.lower()
    text = text.replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def name_tokens(normalized_name: str) -> tuple[str, ...]:
    return tuple(tok for tok in normalized_name.split() if tok not in LEGAL_SUFFIXES)


def extract_aliases(remarks: str) -> list[dict[str, str]]:
    """
    Extract common OFAC alias markers from the remarks column.

    Examples in this SDN CSV include:
      a.k.a. 'BNC'
      f.k.a. 'SAND SWAN'
      d.b.a. '...'
      n.k.a. '...'
    """
    aliases: list[dict[str, str]] = []
    pattern = re.compile(
        r"\b(?P<kind>a\.k\.a\.|f\.k\.a\.|n\.k\.a\.|d\.b\.a\.)\s*'(?P<name>[^']+)'",
        re.IGNORECASE,
    )
    for match in pattern.finditer(remarks or ""):
        alias_name = match.group("name").strip()
        if alias_name:
            aliases.append({"kind": match.group("kind").lower(), "name": alias_name})
    return aliases


def make_candidate(value: str, kind: str) -> NameCandidate:
    normalized = normalize_name(value)
    return NameCandidate(
        value=value,
        kind=kind,
        normalized=normalized,
        tokens=name_tokens(normalized),
    )


def load_sdn(path: str | Path) -> list[SDNRecord]:
    """
    Load the local OFAC SDN CSV.

    This supports the no-header 12-column SDN CSV shape present in this repo:
    ID, name, type, program, title, call sign, vessel fields, remarks.
    """
    records: list[SDNRecord] = []
    with Path(path).open(newline="", encoding="utf-8-sig", errors="replace") as f:
        reader = csv.reader(f)
        for row_number, row in enumerate(reader, start=1):
            if len(row) == 1 and not row[0].strip():
                continue
            if len(row) != len(SDN_COLUMNS):
                # Keep the demo permissive: skip malformed/footer rows rather
                # than failing the full screen.
                continue

            data = dict(zip(SDN_COLUMNS, (cell.strip() for cell in row)))
            aliases = extract_aliases(data["remarks"])
            candidates = [make_candidate(data["name"], "primary_name")]
            candidates.extend(make_candidate(a["name"], a["kind"]) for a in aliases)

            records.append(
                SDNRecord(
                    sdn_id=data["sdn_id"],
                    name=data["name"],
                    sdn_type=data["type"],
                    program=data["program"],
                    title=data["title"],
                    call_sign=data["call_sign"],
                    vessel_type=data["vessel_type"],
                    tonnage=data["tonnage"],
                    gross_registered_tonnage=data["gross_registered_tonnage"],
                    vessel_flag=data["vessel_flag"],
                    vessel_owner=data["vessel_owner"],
                    remarks=data["remarks"],
                    aliases=aliases,
                    candidates=candidates,
                )
            )
    return records


def get_candidate_index(records: list[SDNRecord]) -> CandidateSearchIndex:
    cache_key = id(records)
    cached = _CANDIDATE_INDEX_CACHE.get(cache_key)
    if cached is not None:
        return cached

    entries = [
        IndexedCandidate(record=record, candidate=candidate)
        for record in records
        for candidate in record.candidates
    ]
    indexed = CandidateSearchIndex(
        entries=entries,
        normalized_names=[item.candidate.normalized for item in entries],
    )
    _CANDIDATE_INDEX_CACHE[cache_key] = indexed
    return indexed


def _ratio(a: str, b: str) -> float:
    if fuzz:
        return float(fuzz.ratio(a, b))
    return SequenceMatcher(None, a, b).ratio() * 100.0


def _partial_ratio(a: str, b: str) -> float:
    if fuzz:
        return float(fuzz.partial_ratio(a, b))
    shorter, longer = sorted((a, b), key=len)
    if not shorter:
        return 0.0
    if shorter in longer:
        return 100.0
    return _ratio(shorter, longer)


def _token_sort_ratio(tokens_a: Iterable[str], tokens_b: Iterable[str]) -> float:
    return _ratio(" ".join(sorted(tokens_a)), " ".join(sorted(tokens_b)))


def _token_set_ratio(tokens_a: Iterable[str], tokens_b: Iterable[str]) -> float:
    if fuzz:
        return float(fuzz.token_set_ratio(" ".join(tokens_a), " ".join(tokens_b)))

    set_a = set(tokens_a)
    set_b = set(tokens_b)
    if not set_a or not set_b:
        return 0.0

    intersection = sorted(set_a & set_b)
    diff_a = sorted(set_a - set_b)
    diff_b = sorted(set_b - set_a)
    if not intersection:
        return _token_sort_ratio(set_a, set_b)

    combined_a = " ".join(intersection + diff_a)
    combined_b = " ".join(intersection + diff_b)
    intersection_text = " ".join(intersection)
    return max(_ratio(combined_a, combined_b), _ratio(intersection_text, combined_a), _ratio(intersection_text, combined_b))


def score_candidate(
    input_name: str,
    candidate: NameCandidate,
    normalized_input: str | None = None,
    input_tokens: tuple[str, ...] | None = None,
) -> dict[str, Any]:
    normalized_input = normalized_input if normalized_input is not None else normalize_name(input_name)
    input_tokens = input_tokens if input_tokens is not None else name_tokens(normalized_input)
    exact_normalized = normalized_input == candidate.normalized
    token_set = _token_set_ratio(input_tokens, candidate.tokens)
    token_sort = _token_sort_ratio(input_tokens, candidate.tokens)
    raw_ratio = _ratio(normalized_input, candidate.normalized)
    partial = _partial_ratio(normalized_input, candidate.normalized)

    score = max(raw_ratio, token_sort, token_set)

    # Missing middle names and reordered name parts are common; a very strong
    # partial/token-set score is useful, but still cap it below MATCH if the raw
    # strings differ substantially.
    if partial >= 96.0 and token_set >= 92.0:
        score = max(score, min(91.0, partial))

    # Prevent very short aliases such as "AL-" or "PAT" from becoming review
    # or match hits inside longer names unless the user input is that alias.
    candidate_token_chars = sum(len(tok) for tok in candidate.tokens)
    if candidate_token_chars < 5 and not exact_normalized:
        score = min(score, 70.0)

    return {
        "score": round(score, 2),
        "component_scores": {
            "raw_ratio": round(raw_ratio, 2),
            "token_sort_ratio": round(token_sort, 2),
            "token_set_ratio": round(token_set, 2),
            "partial_ratio": round(partial, 2),
        },
        "normalized_input": normalized_input,
        "normalized_candidate": candidate.normalized,
        "input_tokens": input_tokens,
        "candidate_tokens": candidate.tokens,
    }


def verdict_for_score(score: float) -> str:
    if score >= MATCH_THRESHOLD:
        return "MATCH"
    if score >= REVIEW_THRESHOLD:
        return "REVIEW"
    return "NOT_MATCH"


def shortlist_candidates(
    normalized_input: str,
    input_tokens: tuple[str, ...],
    candidate_index: CandidateSearchIndex,
) -> list[IndexedCandidate]:
    if not candidate_index.entries:
        return []

    if process and fuzz:
        hits = process.extract(
            normalized_input,
            candidate_index.normalized_names,
            scorer=fuzz.WRatio,
            processor=None,
            limit=FAST_PREFILTER_LIMIT,
            score_cutoff=FAST_PREFILTER_CUTOFF,
        )
        if not hits:
            best = process.extractOne(
                normalized_input,
                candidate_index.normalized_names,
                scorer=fuzz.WRatio,
                processor=None,
            )
            hits = [best] if best else []
        return [candidate_index.entries[index] for _, _, index in hits]

    input_token_set = set(input_tokens)
    if not input_token_set:
        return candidate_index.entries
    shortlisted = [
        item
        for item in candidate_index.entries
        if input_token_set & set(item.candidate.tokens)
    ]
    return shortlisted or candidate_index.entries


def format_remark_context(record: SDNRecord, matched_kind: str | None) -> str:
    """Summarize useful human-readable context from the OFAC remarks column."""
    context_parts: list[str] = []

    aliases = [alias["name"] for alias in record.aliases if clean_value(alias.get("name"))]
    if aliases:
        alias_text = ", ".join(f"'{alias}'" for alias in aliases[:4])
        more = " and other aliases" if len(aliases) > 4 else ""
        if matched_kind and matched_kind != "primary_name":
            context_parts.append(f"the matched name is listed as an alias for '{record.name}'")
        else:
            context_parts.append(f"it also lists aliases {alias_text}{more}")

    for raw_part in (record.remarks or "").split(";"):
        part = raw_part.strip().rstrip(".")
        if not clean_value(part):
            continue

        lower_part = part.lower()
        if any(marker in lower_part for marker in ("a.k.a.", "f.k.a.", "n.k.a.", "d.b.a.")):
            continue
        if lower_part.startswith("secondary sanctions risk"):
            continue
        if lower_part.startswith("additional sanctions information"):
            continue
        if any(
            sensitive in lower_part
            for sensitive in (
                "passport",
                "ssn",
                "national id",
                "identification number",
                "cedula",
                "tax id",
                "digital currency address",
                "mmsi",
            )
        ):
            continue

        context_parts.append(part)
        if len(context_parts) >= 3:
            break

    if not context_parts:
        return ""

    return "; ".join(context_parts)


def build_clear_explanation(
    input_name: str,
    verdict: str,
    score: float,
    record: SDNRecord | None,
    matched_name: str | None,
    matched_kind: str | None,
    component_scores: dict[str, float] | None = None,
) -> str:
    """
    Create a concise deterministic explanation.

    If you later want LLM-written explanations, keep that optional and call it
    from here or replace only this function. The matching logic does not depend
    on any external API.
    """
    if verdict == "NOT_MATCH" or record is None:
        return f"No OFAC sanctions-list hit for '{input_name}'."

    program = clean_value(record.program)
    alias_phrase = "name" if matched_kind == "primary_name" else "alias"
    program_phrase = f" ({program})" if program else ""
    remark_context = format_remark_context(record, matched_kind)
    detail = f" OFAC: {remark_context}." if remark_context else ""
    action = "Disallow." if verdict == "MATCH" else "Review."
    return f"{action} '{input_name}' matches OFAC {alias_phrase} '{matched_name}'{program_phrase}.{detail}"


def screen_name(name: str, sdn_records: list[SDNRecord]) -> dict[str, Any]:
    best: dict[str, Any] | None = None
    review_candidates: list[dict[str, Any]] = []
    normalized_input = normalize_name(name)
    input_tokens = name_tokens(normalized_input)
    candidate_index = get_candidate_index(sdn_records)
    shortlisted = shortlist_candidates(normalized_input, input_tokens, candidate_index)

    for indexed in shortlisted:
        record = indexed.record
        candidate = indexed.candidate
        scored = score_candidate(name, candidate, normalized_input, input_tokens)
        result = {
            "score": scored["score"],
            "record": record,
            "candidate": candidate,
            "component_scores": scored["component_scores"],
            "normalized_input": scored["normalized_input"],
            "normalized_candidate": scored["normalized_candidate"],
        }
        if best is None or result["score"] > best["score"]:
            best = result
        if result["score"] >= REVIEW_THRESHOLD:
            review_candidates.append(result)

    if best is None:
        return {
            "input_name": name,
            "verdict": "NOT_MATCH",
            "confidence_score": 0.0,
            "matched_sanctions_record": None,
            "matched_name_or_alias": None,
            "explanation": "No sanctions records were loaded.",
            "review_info": {"top_candidates": []},
        }

    verdict = verdict_for_score(best["score"])
    record = best["record"]
    candidate = best["candidate"]

    top_candidates = sorted(review_candidates or [best], key=lambda item: item["score"], reverse=True)[:5]
    review_info = {
        "normalized_input": best["normalized_input"],
        "matched_normalized_name": best["normalized_candidate"],
        "component_scores": best["component_scores"],
        "thresholds": {
            "match": MATCH_THRESHOLD,
            "review": REVIEW_THRESHOLD,
        },
        "top_candidates": [
            {
                "score": item["score"],
                "sanctions_id": item["record"].sdn_id,
                "primary_name": item["record"].name,
                "matched_name": item["candidate"].value,
                "matched_name_type": item["candidate"].kind,
                "program": clean_value(item["record"].program),
                "type": clean_value(item["record"].sdn_type),
            }
            for item in top_candidates
        ],
    }

    return {
        "input_name": name,
        "verdict": verdict,
        "confidence_score": best["score"],
        "matched_sanctions_record": record.summary() if verdict != "NOT_MATCH" else None,
        "matched_name_or_alias": (
            {"name": candidate.value, "kind": candidate.kind}
            if verdict != "NOT_MATCH"
            else None
        ),
        "explanation": build_clear_explanation(
            input_name=name,
            verdict=verdict,
            score=best["score"],
            record=record if verdict != "NOT_MATCH" else None,
            matched_name=candidate.value if verdict != "NOT_MATCH" else None,
            matched_kind=candidate.kind if verdict != "NOT_MATCH" else None,
            component_scores=best["component_scores"],
        ),
        "review_info": review_info,
    }


def screen_transaction(
    sender_name: str,
    receiver_name: str,
    sdn_records: list[SDNRecord],
) -> dict[str, Any]:
    sender = screen_name(sender_name, sdn_records)
    receiver = screen_name(receiver_name, sdn_records)
    transaction_verdict = "ALLOW"
    if sender["verdict"] == "MATCH" or receiver["verdict"] == "MATCH":
        transaction_verdict = "DISALLOW"
    elif sender["verdict"] == "REVIEW" or receiver["verdict"] == "REVIEW":
        transaction_verdict = "REVIEW"

    return {
        "transaction_verdict": transaction_verdict,
        "sender": sender,
        "receiver": receiver,
    }


def main() -> None:
    parser = argparse.ArgumentParser(prog="screen", description="Screen transaction party names against a local OFAC sanctions CSV.")
    parser.add_argument("--sanctions-file", dest="sdn", metavar="PATH", default="sdn.csv", help="Path to local OFAC sanctions CSV.")
    parser.add_argument("--sdn", dest="sdn", metavar="PATH", help=argparse.SUPPRESS)
    parser.add_argument("--sender", default="Banco Nacional de Cuba", help="Sender name to screen.")
    parser.add_argument("--receiver", default="Example Coffee Shop LLC", help="Receiver name to screen.")
    args = parser.parse_args()

    sdn_records = load_sdn(args.sdn)
    result = screen_transaction(args.sender, args.receiver, sdn_records)
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
