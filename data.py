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
    "individual_petrov": {
        "transaction_id": "zh_ind_001",
        "asset": "ETH",
        "network": "Ethereum",
        "amount": 8500.00,
        "participant": {"participant_code": "CUST-PETROV"},
        "destination": {"withdrawal_address": "0xSomeCleanWallet"},
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
    "clean": {
        "tx_ref": "tx_fiat_445566",
        "fiat_currency": "GBP",
        "total_value": 12000.00,
        "remitter": {"full_name": "Acme Global Solutions Ltd."},
        "payee": {"company_name": "Bob's Coffee Supply"},
    },
}
