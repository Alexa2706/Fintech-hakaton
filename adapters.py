from typing import Optional, Dict, Any
from enum import Enum
from pydantic import BaseModel, Field
import uuid
import datetime


class ParticipantType(str, Enum):
    INDIVIDUAL = "individual"
    BUSINESS = "business"


class Rail(str, Enum):
    CRYPTO = "crypto"
    FIAT = "fiat"


class Direction(str, Enum):
    WITHDRAWAL = "withdrawal"
    DEPOSIT = "deposit"
    TRANSFER = "transfer"


class EntityIds(BaseModel):
    dob: Optional[str] = None
    nationality: Optional[str] = None
    country: Optional[str] = None
    passport_no: Optional[str] = None
    reg_no: Optional[str] = None


class Participant(BaseModel):
    type: ParticipantType
    name: Optional[str] = None
    ids: EntityIds = Field(default_factory=EntityIds)
    participant_ref: Optional[str] = None
    wallet: Optional[str] = None
    account_no: Optional[str] = None


class ScreenRequest(BaseModel):
    request_id: str
    provider: str
    direction: Direction
    rail: Rail
    asset: Optional[str] = None
    chain: Optional[str] = None
    currency: Optional[str] = None
    amount: str
    originator: Participant
    beneficiary: Participant

class BaseAdapter:
    def parse(self, payload: Dict[str, Any]) -> ScreenRequest:
        raise NotImplementedError("Subclasses must implement this method.")

class ZeroHashAdapter(BaseAdapter):
    def parse(self, payload: Dict[str, Any]) -> ScreenRequest:
        
        return ScreenRequest(
            request_id=payload.get("transaction_id", f"inv_{uuid.uuid4().hex[:8]}"),
            provider="zerohash",
            direction=Direction.WITHDRAWAL,
            rail=Rail.CRYPTO,
            asset=payload.get("asset"),
            chain=payload.get("network", "ethereum").lower(),
            currency=None,
            amount=str(payload.get("amount")),
            originator=Participant(
                type=ParticipantType.BUSINESS,
                participant_ref=payload["participant"]["participant_code"],
            ),
            beneficiary=Participant(
                type=ParticipantType.BUSINESS,
                wallet=payload["destination"]["withdrawal_address"],
            )
        )

class FiatBankAdapter(BaseAdapter):
    def parse(self, payload: Dict[str, Any]) -> ScreenRequest:
        
        return ScreenRequest(
            request_id=payload.get("tx_ref", f"inv_{uuid.uuid4().hex[:8]}"),
            provider="sokin_fiat_direct",
            direction=Direction.TRANSFER,
            rail=Rail.FIAT,
            asset=None,
            chain=None,
            currency=payload.get("fiat_currency"),
            amount=str(payload.get("total_value")),
            originator=Participant(
                type=ParticipantType.BUSINESS,
                name=payload["remitter"]["full_name"],
            ),
            beneficiary=Participant(
                type=ParticipantType.BUSINESS,
                name=payload["payee"]["company_name"],
                ids=EntityIds(
                    reg_no=payload["payee"].get("company_reg_no"),
                    country=payload["payee"].get("country"),
                ),
            )
        )

if __name__ == "__main__":
    
    zerohash_payload = {
        "transaction_id": "zh_998877",
        "asset": "USDC",
        "network": "Ethereum",
        "amount": 25000.00,
        "participant": {"participant_code": "CUST-9921"},
        "destination": {"withdrawal_address": "0x123abc999"}
    }

    fiat_payload = {
        "tx_ref": "tx_fiat_112233",
        "fiat_currency": "EUR",
        "total_value": 5000.50,
        "remitter": {"full_name": "Meridian Trading Ltd."},
        "payee": {"company_name": "Acme Global Solutions", "company_reg_no": "83810"}
    }

    zh_adapter = ZeroHashAdapter()
    fiat_adapter = FiatBankAdapter()

    canonical_crypto = zh_adapter.parse(zerohash_payload)
    canonical_fiat = fiat_adapter.parse(fiat_payload)

    print("--- CRYPTO REQUEST ---")
    print(canonical_crypto.model_dump_json(indent=2))
    
    print("\n--- FIAT REQUEST ---")
    print(canonical_fiat.model_dump_json(indent=2))