from typing import Optional
from pydantic import BaseModel
import unicodedata
import re
from rapidfuzz import fuzz
from adapters import Participant


class ResolveResult(BaseModel):
    matched_entity: Optional[str] = None
    entity_type: Optional[str] = None
    name_score: float = 0.0
    fields_matched: list[str] = []
    sanctioned_wallet: bool = False


COMPANY_SUFFIXES = re.compile(
    r"\b(ltd|llc|gmbh|inc|corp|co|plc|sa|ag|pty|limited|incorporated|company)\b\.?",
    re.IGNORECASE,
)


def normalize_name(name: str) -> str:
    decomposed = unicodedata.normalize("NFKD", name)
    ascii_name = decomposed.encode("ascii", "ignore").decode("ascii")
    lower = ascii_name.lower().strip()
    no_suffix = COMPANY_SUFFIXES.sub("", lower)
    return re.sub(r"\s+", " ", no_suffix).strip()


class SanctionsEntry(BaseModel):
    name: str
    aliases: list[str] = []
    entity_type: str  # "individual" or "business"
    dob: Optional[str] = None
    nationality: Optional[str] = None
    reg_no: Optional[str] = None
    country: Optional[str] = None
    wallets: list[str] = []


class Resolver:
    def __init__(
        self,
        entries: list[SanctionsEntry],
        name_threshold: float = 0.82,
    ):
        self.entries = entries
        self.name_threshold = name_threshold
        self._wallet_set: set[str] = set()
        self._normalized_cache: list[tuple[SanctionsEntry, list[str]]] = []

        for entry in entries:
            for w in entry.wallets:
                self._wallet_set.add(w.lower())

            norms = [normalize_name(entry.name)]
            for alias in entry.aliases:
                norms.append(normalize_name(alias))
            self._normalized_cache.append((entry, norms))

    def _check_wallet(self, wallet: Optional[str]) -> bool:
        if not wallet:
            return False
        return wallet.lower() in self._wallet_set

    def _score_name(self, query: str, candidates: list[str]) -> float:
        if not query:
            return 0.0
        q = normalize_name(query)
        best = 0.0
        for c in candidates:
            score = fuzz.WRatio(q, c) / 100.0
            if score > best:
                best = score
        return best

    def _boost_secondary(
        self, participant: Participant, entry: SanctionsEntry
    ) -> tuple[float, list[str]]:
        boost = 0.0
        fields = []

        if participant.ids.dob and entry.dob:
            if participant.ids.dob == entry.dob:
                boost += 0.08
                fields.append("dob")

        if participant.ids.nationality and entry.nationality:
            if participant.ids.nationality.lower() == entry.nationality.lower():
                boost += 0.03
                fields.append("nationality")

        if participant.ids.reg_no and entry.reg_no:
            if participant.ids.reg_no == entry.reg_no:
                boost += 0.06
                fields.append("reg_no")

        if participant.ids.country and entry.country:
            if participant.ids.country.lower() == entry.country.lower():
                boost += 0.03
                fields.append("country")

        return boost, fields

    def resolve(self, participant: Participant) -> ResolveResult:
        wallet_hit = self._check_wallet(participant.wallet)
        if not participant.name:
            return ResolveResult(sanctioned_wallet=wallet_hit)

        best_score = 0.0
        best_entry: Optional[SanctionsEntry] = None
        best_fields: list[str] = []

        for entry, normalized_names in self._normalized_cache:
            name_score = self._score_name(participant.name, normalized_names)
            if name_score < self.name_threshold:
                continue

            boost, secondary_fields = self._boost_secondary(participant, entry)
            total = min(name_score + boost, 1.0)

            if total > best_score:
                best_score = total
                best_entry = entry
                best_fields = ["name"] + secondary_fields

        if best_entry is None:
            return ResolveResult(sanctioned_wallet=wallet_hit)

        return ResolveResult(
            matched_entity=best_entry.name,
            entity_type=best_entry.entity_type,
            name_score=round(best_score, 3),
            fields_matched=best_fields,
            sanctioned_wallet=wallet_hit,
        )


