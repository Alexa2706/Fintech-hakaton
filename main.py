from adapters import (
    ZeroHashAdapter,
    FiatBankAdapter,
    EntityIds,
    ParticipantType,
    Participant,
)
from resolver import Resolver
from data import SANCTIONS_LIST, CRYPTO_PAYLOADS, FIAT_PAYLOADS


def main():
    resolver = Resolver(SANCTIONS_LIST)
    zh_adapter = ZeroHashAdapter()
    fiat_adapter = FiatBankAdapter()

    print("=" * 60)
    print("Test 1: Crypto withdrawal to a sanctioned wallet ")
    print("=" * 60)

    req = zh_adapter.parse(CRYPTO_PAYLOADS["sanctioned_wallet"])
    print(f"\nScreenRequest: {req.rail.value} | {req.direction.value} | {req.amount} {req.asset}")

    orig_result = resolver.resolve(req.originator)
    benef_result = resolver.resolve(req.beneficiary)

    print(f"\n  Originator resolve:  entity={orig_result.matched_entity}  "
          f"name_score={orig_result.name_score}  wallet_hit={orig_result.sanctioned_wallet}")
    print(f"  Beneficiary resolve: entity={benef_result.matched_entity}  "
          f"name_score={benef_result.name_score}  wallet_hit={benef_result.sanctioned_wallet}")

    print("\n" + "=" * 60)
    print("Test 2: Fiat transfer — name close to sanctioned entity ")
    print("=" * 60)

    req = fiat_adapter.parse(FIAT_PAYLOADS["darkflow_match"])
    print(f"\nScreenRequest: {req.rail.value} | {req.direction.value} | {req.amount} {req.currency}")

    orig_result = resolver.resolve(req.originator)
    benef_result = resolver.resolve(req.beneficiary)

    print(f"\n  Originator resolve:  entity={orig_result.matched_entity}  "
          f"name_score={orig_result.name_score}  fields={orig_result.fields_matched}")
    print(f"  Beneficiary resolve: entity={benef_result.matched_entity}  "
          f"name_score={benef_result.name_score}  fields={benef_result.fields_matched}")

    print("\n" + "=" * 60)
    print("Test 3: Fiat transfer, no match ")
    print("=" * 60)

    req = fiat_adapter.parse(FIAT_PAYLOADS["clean"])
    print(f"\nScreenRequest: {req.rail.value} | {req.direction.value} | {req.amount} {req.currency}")

    orig_result = resolver.resolve(req.originator)
    benef_result = resolver.resolve(req.beneficiary)

    print(f"\n  Originator resolve:  entity={orig_result.matched_entity}  "
          f"name_score={orig_result.name_score}")
    print(f"  Beneficiary resolve: entity={benef_result.matched_entity}  "
          f"name_score={benef_result.name_score}")

    # Test 4: Individual with secondary ID boost 
    print("\n" + "=" * 60)
    print("Test 4: Individual with secondary ID boost ")
    print("=" * 60)

    req = zh_adapter.parse(CRYPTO_PAYLOADS["individual_petrov"])
    req.originator = Participant(
        type=ParticipantType.INDIVIDUAL,
        name="Aleksandr Petrov",
        ids=EntityIds(dob="1968-03-15", nationality="RU"),
    )
    print(f"\nScreenRequest: {req.rail.value} | {req.direction.value} | {req.amount} {req.asset}")

    orig_result = resolver.resolve(req.originator)
    benef_result = resolver.resolve(req.beneficiary)

    print(f"\n  Originator resolve:  entity={orig_result.matched_entity}  "
          f"name_score={orig_result.name_score}  fields={orig_result.fields_matched}")
    print(f"  Beneficiary resolve: entity={benef_result.matched_entity}  "
          f"name_score={benef_result.name_score}  wallet_hit={benef_result.sanctioned_wallet}")


if __name__ == "__main__":
    main()
