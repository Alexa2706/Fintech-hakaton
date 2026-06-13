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
    """Loads the Elliptic Bitcoin dataset into a GraphSource.

    Expected files in data_dir:
      - elliptic_txs_classes.csv    (txId, class: 1=illicit, 2=licit, "unknown")
      - elliptic_txs_edgelist.csv   (src_txId, dst_txId)
      - elliptic_txs_features.csv   (txId, feature_1 .. feature_166)  [no header]

    Download from: https://www.kaggle.com/datasets/ellipticco/elliptic-data-set
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

        classes_file = data / "elliptic_txs_classes.csv"
        with open(classes_file) as f:
            reader = csv.reader(f)
            next(reader, None)
            for row in reader:
                tx_id = row[0].strip()
                label = row[1].strip()
                labels = []
                if label == "1":
                    labels.append("illicit")
                    g._illicit.add(tx_id)
                elif label == "2":
                    labels.append("licit")
                g._nodes[tx_id] = Node(id=tx_id, type="transaction", labels=labels)

        edges_file = data / "elliptic_txs_edgelist.csv"
        with open(edges_file) as f:
            reader = csv.reader(f)
            next(reader, None)
            for row in reader:
                src, dst = row[0].strip(), row[1].strip()
                edge = Edge(src=src, dst=dst, kind="transaction")
                g._out_edges[src].append(edge)
                g._in_edges[dst].append(edge)

        print(f"CryptoGraph loaded: {len(g._nodes)} nodes, "
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
    """Loads a UBO / corporate ownership dataset into a GraphSource.

    Expected CSV columns (configurable):
      - owner_id, owner_name, company_id, company_name, ownership_pct

    Each row = edge: owner --owns--> company
    Traversal goes the other direction: from company, follow "in" to find owners.

    Download from: https://www.kaggle.com/datasets/sasanj/ultimate-beneficial-owners-companies-investments
    """

    def __init__(self, sanctioned_entity_ids: set[str] | None = None):
        self._nodes: dict[str, Node] = {}
        self._out_edges: dict[str, list[Edge]] = defaultdict(list)
        self._in_edges: dict[str, list[Edge]] = defaultdict(list)
        self._sanctioned: set[str] = sanctioned_entity_ids or set()

    @classmethod
    def from_csv(
        cls,
        path: str,
        sanctioned_entity_ids: set[str] | None = None,
        col_owner_id: str = "owner_id",
        col_owner_name: str = "owner_name",
        col_company_id: str = "company_id",
        col_company_name: str = "company_name",
        col_pct: str = "ownership_pct",
    ) -> OwnershipGraph:
        g = cls(sanctioned_entity_ids)

        with open(path) as f:
            reader = csv.DictReader(f)
            for row in reader:
                owner_id = row[col_owner_id].strip()
                company_id = row[col_company_id].strip()

                if owner_id not in g._nodes:
                    g._nodes[owner_id] = Node(
                        id=owner_id,
                        type="individual",
                        labels=[row.get(col_owner_name, "").strip()],
                    )
                if company_id not in g._nodes:
                    g._nodes[company_id] = Node(
                        id=company_id,
                        type="company",
                        labels=[row.get(col_company_name, "").strip()],
                    )

                pct_raw = row.get(col_pct, "").strip()
                pct = float(pct_raw) if pct_raw else None

                edge = Edge(
                    src=owner_id, dst=company_id, value=pct, kind="ownership"
                )
                g._out_edges[owner_id].append(edge)
                g._in_edges[company_id].append(edge)

        print(f"OwnershipGraph loaded: {len(g._nodes)} entities, "
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
    """Load sanctioned wallet addresses from a 0xB10C-format TXT file.

    One address per line. Download from:
    https://github.com/0xB10C/ofac-sanctioned-digital-currency-addresses

    Files: sanctioned_addresses_ETH.txt, sanctioned_addresses_XBT.txt, etc.
    """
    wallets = set()
    with open(path) as f:
        for line in f:
            addr = line.strip()
            if addr and not addr.startswith("#"):
                wallets.add(addr.lower())
    print(f"Loaded {len(wallets)} sanctioned wallets from {path}")
    return wallets
