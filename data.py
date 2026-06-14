from resolver import SanctionsEntry

SANCTIONS_LIST = [
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

DEMO_TAINTED_TX = "294575834"

# UBO graph IDs for demo scenarios
# p_0 = sanctioned person ("Oligarch Xander Petrov")
# c_3278 = 100% owned by p_0 (shell company)
# c_83810 = 33% owned by p_0 (shared ownership)
# c_32098 = 50% owned by p_0
DEMO_SANCTIONED_PERSON = "p_0"
DEMO_SHELL_COMPANY = "c_3278"
DEMO_SHARED_COMPANY = "c_83810"

CRYPTO_PAYLOADS = {
    "sanctioned_wallet": {
        "transaction_id": "zh_998877",
        "asset": "USDC",
        "network": "Ethereum",
        "amount": 25000.00,
        "participant": {"participant_code": "CUST-9921"},
        "destination": {
            "withdrawal_address": "0x722122df12d4e14e13ac3b6895a86e84145b6967"
        },
    },
    "tainted_tx": {
        "transaction_id": "zh_taint_001",
        "asset": "BTC",
        "network": "Bitcoin",
        "amount": 15000.00,
        "participant": {"participant_code": "CUST-CLEAN"},
        "destination": {"withdrawal_address": DEMO_TAINTED_TX},
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
        "remitter": {"full_name": "Al Rashid Trading Co."},
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
