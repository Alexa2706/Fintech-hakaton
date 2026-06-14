# Sanctions Screening Engine

One engine, two graphs. Unified sanctions screening across crypto transactions and corporate ownership.

## Quick Start

```bash
pip install -r requirements.txt
kaggle auth login
./setup_data.sh
python main.py
```

## Architecture

```
[Provider payload] → ADAPTER → ScreenRequest
                                    ↓
                                 RESOLVE  (entity resolution → name match + wallet match)
                                    ↓
                                TRAVERSE  (exposure over crypto graph + ownership graph)
                                    ↓
                                  FUSE    (weighted score + policy thresholds)
                                    ↓
                                 Verdict  (MATCH / REVIEW / NO_MATCH)
```

## Input / Output

### Input: ScreenRequest

Adapters convert provider-specific payloads into a canonical `ScreenRequest`:

```json
{
  "request_id": "zh_998877",
  "provider": "zerohash",
  "direction": "withdrawal",
  "rail": "crypto",
  "asset": "USDC",
  "chain": "ethereum",
  "amount": "25000.0",
  "originator": {
    "type": "business",
    "name": "Meridian Trading Ltd.",
    "wallet": "0x<src>"
  },
  "beneficiary": {
    "type": "business",
    "name": "Acme Global Solutions Ltd.",
    "wallet": "0x<dst>"
  }
}
```

Each adapter (`ZeroHashAdapter`, `FiatBankAdapter`) maps a provider's native format into this structure. New provider = new adapter, nothing else changes.

### Output: Verdict

```json
{
  "request_id": "zh_998877",
  "verdict": "REVIEW",
  "score": 0.62,
  "corners": [
    {"corner": "originator_identity", "signal": "clean", "score": 0.0},
    {"corner": "source_funds", "signal": "flagged", "score": 0.7,
     "evidence": {"graph": "crypto", "path": ["tx1", "tx2", "illicit_tx"], "hops": 2}},
    {"corner": "beneficiary_identity", "signal": "review", "score": 0.45,
     "evidence": {"matched_entity": "...", "name_score": 0.88}},
    {"corner": "destination", "signal": "low", "score": 0.1}
  ],
  "list_version": "ofac-2026-06-14T01:00Z",
  "audit_id": "aud_a1b2c3",
  "explanation": "source_funds: flagged (score 0.7); beneficiary_identity: review (score 0.45)",
  "timestamp": "2026-06-14T01:40:11Z"
}
```

Four corners are scored independently, then combined via weighted sum. Policy thresholds determine the verdict:
- `>= 0.85` → **MATCH** (block the transaction)
- `0.40 - 0.85` → **REVIEW** (queue for analyst)
- `< 0.40` → **NO_MATCH** (proceed)

## Datasets

### Crypto Transaction Graph (Elliptic)

**Source:** [Elliptic Data Set on Kaggle](https://www.kaggle.com/datasets/ellipticco/elliptic-data-set)

203,769 Bitcoin transactions as graph nodes, connected by 234,355 edges representing money flow between transactions.

| File | Description |
|---|---|
| `elliptic_txs_classes.csv` | `txId, class` — each transaction labeled as `1` (illicit), `2` (licit), or `unknown` |
| `elliptic_txs_edgelist.csv` | `txId1, txId2` — directed edge meaning funds flowed from txId1 to txId2 |
| `elliptic_txs_features.csv` | `txId, f1..f166` — 166 anonymized numerical features per transaction |

**How the graph is built:** Each row in the edgelist becomes a directed edge in `CryptoGraph`. Nodes with `class=1` (4,545 illicit transactions, ~2%) are marked as sanctioned seed nodes. These represent known scams, malware, Ponzi schemes, and terrorist financing.

**How we traverse it:** `exposure(query, graph, direction="in")` runs a haircut BFS backward from a query transaction. At each hop, the taint fraction splits proportionally across incoming edges (uniform split since Elliptic features are anonymized). If a path reaches an illicit node, we record the taint percentage and the full path. This answers: "how much illicit money could have flowed into this transaction?"

Forward traversal (`direction="out"`) answers the reverse: "where did money from this transaction end up?"

### Corporate Ownership Graph (UBO)

**Source:** [UBO Register Dataset on Kaggle](https://www.kaggle.com/datasets/sasanj/ultimate-beneficial-owners-companies-investments)

96,505 companies and 71,459 people linked by 194,852 ownership/management relationships.

| File | Description |
|---|---|
| `companies.csv` | `company_id, address, legal_form, nace_label, ...` — company registry data |
| `people.csv` | `person_id, birthplace, nationalities, birthdate` — anonymized individuals |
| `investments.csv` | `person_id, company_id, role, normalized_shares, ...` — ownership links with percentage |

**How the graph is built:** Each row in `investments.csv` becomes a directed edge: `person --owns(pct%)--> company`. Roles are either `Beneficial Owner` or `Managing Official`. Node IDs are prefixed (`p_` for people, `c_` for companies) to avoid collisions. A set of `sanctioned_entity_ids` is provided at load time to mark specific people as sanctioned.

**How we traverse it:** `exposure(company_id, graph, direction="in")` walks backward from a company through its ownership chain. At each hop, taint splits by ownership percentage (`normalized_shares`). If an owner is in the sanctioned set, we record the path. This catches the scenario name matching misses: a clean-named shell company whose UBO is a sanctioned individual.

### OFAC Sanctioned Wallet Addresses

**Source:** [0xB10C/ofac-sanctioned-digital-currency-addresses](https://github.com/0xB10C/ofac-sanctioned-digital-currency-addresses)

~700 wallet addresses extracted from the OFAC SDN list, covering ETH, BTC, USDT, USDC. Updated nightly.

These are **not** a graph. They are a flat lookup set used by the Resolver for exact wallet matching: "is this specific address on the OFAC list?" This is separate from graph traversal — a direct hit here means the address itself is sanctioned, regardless of what the transaction graph shows.

### Sanctions Names (Mock)

Defined in `data.py`. A small hand-crafted list of sanctioned entities with names, aliases, DOBs, and wallet addresses. Used by the Resolver for fuzzy name matching (Jaro-Winkler via rapidfuzz). In production, this would be replaced by the full OFAC SDN XML or OpenSanctions dataset.
