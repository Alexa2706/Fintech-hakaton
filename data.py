import re
from pathlib import Path

from resolver import SanctionsEntry
from screen_sdn import clean_value, load_sdn


SDN_CSV_PATH = Path(__file__).with_name("sdn.csv")


def _extract_digital_currency_addresses(remarks: str) -> list[str]:
    addresses: list[str] = []
    pattern = re.compile(
        r"(?:alt\.\s*)?Digital Currency Address\s*-\s*[A-Z0-9]+\s+([^;.\s]+)",
        re.IGNORECASE,
    )
    for match in pattern.finditer(remarks or ""):
        addresses.append(match.group(1))
    return addresses


def _sanctions_entry_from_sdn(record) -> SanctionsEntry:
    aliases = [
        alias["name"]
        for alias in record.aliases
        if clean_value(alias.get("name"))
    ]
    sdn_type = clean_value(record.sdn_type)

    return SanctionsEntry(
        name=record.name,
        aliases=aliases,
        entity_type="individual" if sdn_type == "individual" else "business",
        wallets=_extract_digital_currency_addresses(record.remarks),
    )


def _load_sdn_sanctions_entries(path: Path = SDN_CSV_PATH) -> list[SanctionsEntry]:
    if not path.exists():
        return []
    return [_sanctions_entry_from_sdn(record) for record in load_sdn(path)]


DEMO_SANCTIONS_LIST = [
    SanctionsEntry(
        name="Oligarch Xander Petrov",
        aliases=["Xander P. Petrov", "Aleksandr Petrov"],
        entity_type="individual",
        dob="1968-03-15",
        nationality="RU",
        country="RU",
        wallets=["0xOFAC_BLOCKED_1"],
    ),
    SanctionsEntry(
        name="Darkflow Finance Ltd",
        aliases=["Darkflow Finance", "Dark Flow LLC"],
        entity_type="business",
        reg_no="DF-99821",
        country="AE",
        wallets=["0xDARKFLOW_WALLET"],
    ),
    SanctionsEntry(
        name="Al-Rashid Trading Company",
        aliases=["Al Rashid Trading", "AlRashid Co"],
        entity_type="business",
        country="SY",
        wallets=[],
    ),
    SanctionsEntry(
        name="Tornado Cash",
        aliases=["Tornado"],
        entity_type="business",
        wallets=[
            "0x722122df12d4e14e13ac3b6895a86e84145b6967",
            "0xd90e2f925da726b50c4ed8d0fb90ad053324f31b",
        ],
    ),
]

SANCTIONS_LIST = DEMO_SANCTIONS_LIST + _load_sdn_sanctions_entries()

DEMO_SANCTIONED_PERSON = "p_0"
DEMO_SHELL_COMPANY = "c_3278"
DEMO_SHARED_COMPANY = "c_83810"

CRYPTO_PAYLOADS = {
    "direct_hit": {
        "transaction_id": "zh_direct_001",
        "asset": "USDC",
        "network": "Ethereum",
        "amount": 25000.00,
        "participant": {"participant_code": "CUST-9921"},
        "destination": {"withdrawal_address": "0xSANC_TORNADO"},
    },
    "high_taint": {
        "transaction_id": "zh_high_001",
        "asset": "USDC",
        "network": "Ethereum",
        "amount": 18000.00,
        "participant": {"participant_code": "CUST-CLEAN"},
        "destination": {"withdrawal_address": "0xHIGH_TAINT"},
    },
    "low_taint": {
        "transaction_id": "zh_low_001",
        "asset": "ETH",
        "network": "Ethereum",
        "amount": 5000.00,
        "participant": {"participant_code": "CUST-CLEAN"},
        "destination": {"withdrawal_address": "0xLOW_TAINT"},
    },
    "medium_2hop": {
        "transaction_id": "zh_med_001",
        "asset": "USDC",
        "network": "Ethereum",
        "amount": 30000.00,
        "participant": {"participant_code": "CUST-CLEAN"},
        "destination": {"withdrawal_address": "0xMED_TAINT"},
    },
    "mixer_path": {
        "transaction_id": "zh_mixer_001",
        "asset": "ETH",
        "network": "Ethereum",
        "amount": 12000.00,
        "participant": {"participant_code": "CUST-CLEAN"},
        "destination": {"withdrawal_address": "0xMIXER_PATH"},
    },
    "deep_3hop": {
        "transaction_id": "zh_deep_001",
        "asset": "USDC",
        "network": "Ethereum",
        "amount": 8000.00,
        "participant": {"participant_code": "CUST-CLEAN"},
        "destination": {"withdrawal_address": "0xDEEP_TAINT"},
    },
    "forward_exposure": {
        "transaction_id": "zh_fwd_001",
        "asset": "USDC",
        "network": "Ethereum",
        "amount": 20000.00,
        "participant": {"participant_code": "CUST-CLEAN"},
        "destination": {"withdrawal_address": "0xFWD_EXPOSED"},
    },
    "clean": {
        "transaction_id": "zh_clean_001",
        "asset": "USDC",
        "network": "Ethereum",
        "amount": 10000.00,
        "participant": {"participant_code": "CUST-CLEAN"},
        "destination": {"withdrawal_address": "0xCLEAN_WALLET"},
    },
}

FIAT_PAYLOADS = {
    "darkflow_match": {
        "tx_ref": "tx_fiat_112233",
        "fiat_currency": "EUR",
        "total_value": 5000.50,
        "remitter": {"full_name": "Meridian Trading Ltd."},
        "payee": {
            "company_name": "Dark Flow Finance Limited",
            "company_reg_no": "DF-99821",
            "country": "AE",
        },
    },
    "shell_company_full": {
        "tx_ref": "tx_fiat_shell_001",
        "fiat_currency": "EUR",
        "total_value": 120000.00,
        "remitter": {"full_name": "Meridian Trading Ltd."},
        "payee": {
            "company_name": "Horizon Consulting SARL",
        },
    },
    "shell_company_partial": {
        "tx_ref": "tx_fiat_shell_002",
        "fiat_currency": "EUR",
        "total_value": 75000.00,
        "remitter": {"full_name": "Al-Rasheed Trading Co"},
        "payee": {
            "company_name": "Baltic Logistics SARL",
        },
    },
    "clean": {
        "tx_ref": "tx_fiat_445566",
        "fiat_currency": "GBP",
        "total_value": 12000.00,
        "remitter": {"full_name": "Acme Global Solutions Ltd."},
        "payee": {"company_name": "Bob's Coffee Supply"},
    },
}
