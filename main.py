from adapters import ZeroHashAdapter, FiatBankAdapter
from resolver import Resolver
from graph import CryptoGraph, OwnershipGraph, load_ofac_wallets
from traverse import exposure, ExposureResult
from fuse import fuse
from data import (
    SANCTIONS_LIST, CRYPTO_PAYLOADS, FIAT_PAYLOADS,
    DEMO_SANCTIONED_PERSON, DEMO_SHELL_COMPANY, DEMO_SHARED_COMPANY,
)


def screen(request, resolver, crypto_graph, ownership_graph, ownership_node=None):

    orig_resolve = resolver.resolve(request.originator)
    benef_resolve = resolver.resolve(request.beneficiary)

    source_exp = ExposureResult()
    dest_exp = ExposureResult()
    own_exp = ExposureResult()

    src_wallet = request.originator.wallet
    dst_wallet = request.beneficiary.wallet

    if src_wallet and crypto_graph.node(src_wallet):
        source_exp = exposure(src_wallet, crypto_graph, direction="in")

    if dst_wallet and crypto_graph.node(dst_wallet):
        backward = exposure(dst_wallet, crypto_graph, direction="in")
        forward = exposure(dst_wallet, crypto_graph, direction="out")
        dest_exp = backward if backward.taint >= forward.taint else forward

    if ownership_node:
        own_exp = exposure(ownership_node, ownership_graph, direction="in")

    return fuse(
        request_id=request.request_id,
        originator_resolve=orig_resolve,
        beneficiary_resolve=benef_resolve,
        source_exposure=source_exp,
        dest_exposure=dest_exp,
        ownership_exposure=own_exp,
    )


def main():
    print("Loading datasets...\n")

    crypto_graph = CryptoGraph.from_elliptic("data/elliptic")
    ofac_wallets = load_ofac_wallets("data/ofac/sanctioned_addresses_ETH.txt")

    sanctioned_people = {DEMO_SANCTIONED_PERSON}
    ownership_graph = OwnershipGraph.from_ubo("data/ubo", sanctioned_entity_ids=sanctioned_people)

    resolver = Resolver(SANCTIONS_LIST)
    resolver._wallet_set |= ofac_wallets

    zh_adapter = ZeroHashAdapter()
    fiat_adapter = FiatBankAdapter()

    # ── Test 1: Crypto — direct OFAC wallet hit ──
    print("\n" + "=" * 60)
    print("Test 1: Crypto — direct OFAC wallet hit (Tornado Cash)")
    print("=" * 60)

    req = zh_adapter.parse(CRYPTO_PAYLOADS["sanctioned_wallet"])
    verdict = screen(req, resolver, crypto_graph, ownership_graph)
    _print_verdict(verdict)

    # ── Test 2: Crypto — tainted tx (graph traversal) ──
    print("\n" + "=" * 60)
    print("Test 2: Crypto — tainted tx (1 hop from illicit, 50% taint)")
    print("=" * 60)

    req = zh_adapter.parse(CRYPTO_PAYLOADS["tainted_tx"])
    verdict = screen(req, resolver, crypto_graph, ownership_graph)
    _print_verdict(verdict)

    # ── Test 3: Fiat — name match + secondary IDs ──
    print("\n" + "=" * 60)
    print("Test 3: Fiat — fuzzy name match (Darkflow Finance)")
    print("=" * 60)

    req = fiat_adapter.parse(FIAT_PAYLOADS["darkflow_match"])
    verdict = screen(req, resolver, crypto_graph, ownership_graph)
    _print_verdict(verdict)

    # ── Test 4: Fiat — shell company, 100% sanctioned UBO ──
    print("\n" + "=" * 60)
    print("Test 4: Fiat — clean name, 100% sanctioned UBO (shell company)")
    print("=" * 60)

    req = fiat_adapter.parse(FIAT_PAYLOADS["shell_company_full"])
    verdict = screen(req, resolver, crypto_graph, ownership_graph, ownership_node=DEMO_SHELL_COMPANY)
    _print_verdict(verdict)

    # ── Test 5: Fiat — partial ownership + partial name match ──
    print("\n" + "=" * 60)
    print("Test 5: Fiat — partial name match + 33% sanctioned UBO")
    print("=" * 60)

    req = fiat_adapter.parse(FIAT_PAYLOADS["shell_company_partial"])
    verdict = screen(req, resolver, crypto_graph, ownership_graph, ownership_node=DEMO_SHARED_COMPANY)
    _print_verdict(verdict)

    # ── Test 6: Fiat — clean ──
    print("\n" + "=" * 60)
    print("Test 6: Fiat — clean transaction (no match)")
    print("=" * 60)

    req = fiat_adapter.parse(FIAT_PAYLOADS["clean"])
    verdict = screen(req, resolver, crypto_graph, ownership_graph)
    _print_verdict(verdict)


def _print_verdict(v):
    print(f"\n  Verdict:  {v.verdict.value}  (score: {v.score})")
    print(f"  Explain:  {v.explanation}")
    print(f"  Audit:    {v.audit_id}")
    for c in v.corners:
        ev = f"  evidence={c.evidence}" if c.evidence else ""
        print(f"    [{c.signal.value:>7}] {c.corner}: {c.score}{ev}")


if __name__ == "__main__":
    main()
