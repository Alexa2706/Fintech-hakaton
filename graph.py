from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Optional
from pydantic import BaseModel
import csv
from pathlib import Path
from collections import defaultdict


class Node(BaseModel):
    id: str
    type: str  # "transaction", "address", "company", "individual"
    labels: list[str] = []  # e.g. ["illicit", "mixer"]


class Edge(BaseModel):
    src: str
    dst: str
    value: Optional[float] = None
    kind: str = "transaction"  # "transaction", "ownership"


class GraphSource(ABC):
    @abstractmethod
    def neighbors(self, node_id: str, direction: str, limit: int = 50) -> list[Edge]:
        """One hop. direction = 'in' | 'out'."""

    @abstractmethod
    def node(self, node_id: str) -> Optional[Node]:
        ...

    @abstractmethod
    def is_sanctioned(self, node_id: str) -> bool:
        ...


class CryptoGraph(GraphSource):
    """Loads the Elliptic Bitcoin dataset.

    Download: https://www.kaggle.com/datasets/ellipticco/elliptic-data-set
    Run setup_data.sh to download automatically.
    """

    def __init__(self):
        self._nodes: dict[str, Node] = {}
        self._out_edges: dict[str, list[Edge]] = defaultdict(list)
        self._in_edges: dict[str, list[Edge]] = defaultdict(list)
        self._illicit: set[str] = set()

    @classmethod
    def from_elliptic(cls, data_dir: str) -> CryptoGraph:
        g = cls()
        data = Path(data_dir)

        classes_file = _find_file(data, "elliptic_txs_classes.csv")
        edges_file = _find_file(data, "elliptic_txs_edgelist.csv")

        with open(classes_file) as f:
            reader = csv.DictReader(f)
            for row in reader:
                tx_id = row["txId"].strip()
                label = row["class"].strip()
                labels = []
                if label == "1":
                    labels.append("illicit")
                    g._illicit.add(tx_id)
                elif label == "2":
                    labels.append("licit")
                g._nodes[tx_id] = Node(id=tx_id, type="transaction", labels=labels)

        with open(edges_file) as f:
            reader = csv.DictReader(f)
            for row in reader:
                src, dst = row["txId1"].strip(), row["txId2"].strip()
                edge = Edge(src=src, dst=dst, kind="transaction")
                g._out_edges[src].append(edge)
                g._in_edges[dst].append(edge)

        print(f"CryptoGraph: {len(g._nodes)} nodes, "
              f"{sum(len(v) for v in g._out_edges.values())} edges, "
              f"{len(g._illicit)} illicit")

        return g

    def neighbors(self, node_id: str, direction: str, limit: int = 50) -> list[Edge]:
        if direction == "in":
            return self._in_edges.get(node_id, [])[:limit]
        return self._out_edges.get(node_id, [])[:limit]

    def node(self, node_id: str) -> Optional[Node]:
        return self._nodes.get(node_id)

    def is_sanctioned(self, node_id: str) -> bool:
        return node_id in self._illicit


class OwnershipGraph(GraphSource):
    """Loads UBO dataset (companies.csv, people.csv, investments.csv).

    Download: https://www.kaggle.com/datasets/sasanj/ultimate-beneficial-owners-companies-investments
    Run setup_data.sh to download automatically.

    Graph structure:
      - Nodes: companies + people
      - Edges: person --owns(pct)--> company  (from investments.csv)
      - Traversal: from a company, follow "in" edges to find owners/UBOs
    """

    def __init__(self, sanctioned_entity_ids: set[str] | None = None):
        self._nodes: dict[str, Node] = {}
        self._out_edges: dict[str, list[Edge]] = defaultdict(list)
        self._in_edges: dict[str, list[Edge]] = defaultdict(list)
        self._sanctioned: set[str] = sanctioned_entity_ids or set()

    @classmethod
    def from_ubo(cls, data_dir: str, sanctioned_entity_ids: set[str] | None = None) -> OwnershipGraph:
        g = cls(sanctioned_entity_ids)
        data = Path(data_dir)

        companies_file = _find_file(data, "companies.csv")
        with open(companies_file) as f:
            reader = csv.DictReader(f)
            for row in reader:
                cid = f"c_{row['company_id'].strip()}"
                g._nodes[cid] = Node(
                    id=cid,
                    type="company",
                    labels=[row.get("simplified_legal_form", "").strip()],
                )

        people_file = _find_file(data, "people.csv")
        with open(people_file) as f:
            reader = csv.DictReader(f)
            for row in reader:
                pid = f"p_{row['person_id'].strip()}"
                if pid not in g._nodes:
                    g._nodes[pid] = Node(
                        id=pid,
                        type="individual",
                        labels=[row.get("birthplace", "").strip()],
                    )

        investments_file = _find_file(data, "investments.csv")
        with open(investments_file) as f:
            reader = csv.DictReader(f)
            for row in reader:
                pid = f"p_{row['person_id'].strip()}"
                cid = f"c_{row['company_id'].strip()}"
                pct_raw = row.get("normalized_shares", "").strip()
                pct = float(pct_raw) if pct_raw else None
                role = row.get("role", "owner").strip()

                edge = Edge(src=pid, dst=cid, value=pct, kind=role)
                g._out_edges[pid].append(edge)
                g._in_edges[cid].append(edge)

        print(f"OwnershipGraph: {len(g._nodes)} entities, "
              f"{sum(len(v) for v in g._out_edges.values())} ownership links, "
              f"{len(g._sanctioned)} sanctioned")

        return g

    def neighbors(self, node_id: str, direction: str, limit: int = 50) -> list[Edge]:
        if direction == "in":
            return self._in_edges.get(node_id, [])[:limit]
        return self._out_edges.get(node_id, [])[:limit]

    def node(self, node_id: str) -> Optional[Node]:
        return self._nodes.get(node_id)

    def is_sanctioned(self, node_id: str) -> bool:
        return node_id in self._sanctioned


def load_ofac_wallets(path: str) -> set[str]:
    """Load sanctioned wallet addresses from a 0xB10C TXT file.

    Download: https://github.com/0xB10C/ofac-sanctioned-digital-currency-addresses
    Run setup_data.sh to download automatically.
    """
    wallets = set()
    with open(path) as f:
        for line in f:
            addr = line.strip()
            if addr and not addr.startswith("#"):
                wallets.add(addr.lower())
    print(f"OFAC wallets: {len(wallets)} addresses from {path}")
    return wallets


def _find_file(base: Path, filename: str) -> Path:
    """Find a file in base dir or any subfolder (handles Kaggle nested unzips)."""
    direct = base / filename
    if direct.exists():
        return direct
    found = list(base.rglob(filename))
    if not found:
        raise FileNotFoundError(f"{filename} not found in {base}. Run setup_data.sh first.")
    return found[0]
