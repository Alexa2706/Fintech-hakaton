from adapters import ZeroHashAdapter, FiatBankAdapter
from resolver import Resolver
from graph import CryptoGraph, OwnershipGraph
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

    crypto_graph = CryptoGraph.from_synthetic("data/synthetic")

    sanctioned_people = {DEMO_SANCTIONED_PERSON}
    ownership_graph = OwnershipGraph.from_ubo("data/ubo", sanctioned_entity_ids=sanctioned_people)

    resolver = Resolver(SANCTIONS_LIST)

    zh_adapter = ZeroHashAdapter()
    fiat_adapter = FiatBankAdapter()

    # ── Crypto tests ──

    print("\n" + "=" * 60)
    print("Test 1: Crypto — direct sanctioned wallet")
    print("=" * 60)
    req = zh_adapter.parse(CRYPTO_PAYLOADS["direct_hit"])
    verdict = screen(req, resolver, crypto_graph, ownership_graph)
    _print_verdict(verdict)

    print("\n" + "=" * 60)
    print("Test 2: Crypto — 1 hop, ~80% taint")
    print("=" * 60)
    req = zh_adapter.parse(CRYPTO_PAYLOADS["high_taint"])
    verdict = screen(req, resolver, crypto_graph, ownership_graph)
    _print_verdict(verdict)

    print("\n" + "=" * 60)
    print("Test 3: Crypto — 1 hop, ~10% taint")
    print("=" * 60)
    req = zh_adapter.parse(CRYPTO_PAYLOADS["low_taint"])
    verdict = screen(req, resolver, crypto_graph, ownership_graph)
    _print_verdict(verdict)

    print("\n" + "=" * 60)
    print("Test 4: Crypto — 2 hops, ~25% taint")
    print("=" * 60)
    req = zh_adapter.parse(CRYPTO_PAYLOADS["medium_2hop"])
    verdict = screen(req, resolver, crypto_graph, ownership_graph)
    _print_verdict(verdict)

    print("\n" + "=" * 60)
    print("Test 5: Crypto — mixer blocks traversal")
    print("=" * 60)
    req = zh_adapter.parse(CRYPTO_PAYLOADS["mixer_path"])
    verdict = screen(req, resolver, crypto_graph, ownership_graph)
    _print_verdict(verdict)

    print("\n" + "=" * 60)
    print("Test 6: Crypto — 3 hops, deep taint ~13%")
    print("=" * 60)
    req = zh_adapter.parse(CRYPTO_PAYLOADS["deep_3hop"])
    verdict = screen(req, resolver, crypto_graph, ownership_graph)
    _print_verdict(verdict)

    print("\n" + "=" * 60)
    print("Test 7: Crypto — forward exposure ~60%")
    print("=" * 60)
    req = zh_adapter.parse(CRYPTO_PAYLOADS["forward_exposure"])
    verdict = screen(req, resolver, crypto_graph, ownership_graph)
    _print_verdict(verdict)

    print("\n" + "=" * 60)
    print("Test 8: Crypto — clean wallet")
    print("=" * 60)
    req = zh_adapter.parse(CRYPTO_PAYLOADS["clean"])
    verdict = screen(req, resolver, crypto_graph, ownership_graph)
    _print_verdict(verdict)

    # ── Fiat tests ──

    print("\n" + "=" * 60)
    print("Test 9: Fiat — fuzzy name match (Darkflow Finance)")
    print("=" * 60)
    req = fiat_adapter.parse(FIAT_PAYLOADS["darkflow_match"])
    verdict = screen(req, resolver, crypto_graph, ownership_graph)
    _print_verdict(verdict)

    print("\n" + "=" * 60)
    print("Test 10: Fiat — clean name, 100% sanctioned UBO")
    print("=" * 60)
    req = fiat_adapter.parse(FIAT_PAYLOADS["shell_company_full"])
    verdict = screen(req, resolver, crypto_graph, ownership_graph, ownership_node=DEMO_SHELL_COMPANY)
    _print_verdict(verdict)

    print("\n" + "=" * 60)
    print("Test 11: Fiat — partial name match + 33% sanctioned UBO")
    print("=" * 60)
    req = fiat_adapter.parse(FIAT_PAYLOADS["shell_company_partial"])
    verdict = screen(req, resolver, crypto_graph, ownership_graph, ownership_node=DEMO_SHARED_COMPANY)
    _print_verdict(verdict)

    print("\n" + "=" * 60)
    print("Test 12: Fiat — clean transaction")
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
