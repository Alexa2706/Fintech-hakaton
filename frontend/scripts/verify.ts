// Runtime coherence gate for the Phase 0 fixtures. Proves the data actually
// agrees with itself — not just that it typechecks. Run: `npm run verify`.
//
// Checks, per case:
//   - outcome is DERIVED from taint vs policy (never trust the authored field)
//   - taint === Σ receiving slices with risk "high"
//   - each exposure side sums to ~100
//   - reason weights sum to ~taint
//   - tainted cases have a san node + tainted path + sanctionedSource + hops>0
//   - NO_MATCH cases have no san node, no tainted edges, no sanctionedSource, hops 0
//   - every edge references a real node
//   - getEntity/getExposure resolve subject + san nodes and fall back on unknown ids

import { engine } from "../lib/engine/index";
import type { Outcome } from "../lib/engine/types";

const APPROX = 0.005;
const fails: string[] = [];
const ok = (cond: boolean, msg: string) => {
  if (!cond) fails.push(msg);
};

function deriveOutcome(taint: number, reviewAt: number, blockAt: number): Outcome {
  if (taint >= blockAt) return "MATCH";
  if (taint >= reviewAt) return "REVIEW";
  return "NO_MATCH";
}

const rows: Record<string, string | number>[] = [];

for (const summary of engine.listCases()) {
  const id = summary.id;
  const v = engine.getVerdict(id);
  const graph = engine.getPath(id);
  const { reasons, policy, taint } = engine.explainScore(id);

  // outcome derived strictly from policy thresholds
  const derived = deriveOutcome(v.taint, policy.reviewAt, policy.blockAt);
  ok(derived === v.outcome, `${id}: outcome ${v.outcome} != derived ${derived} (taint ${v.taint})`);
  ok(taint === v.taint, `${id}: explainScore taint ${taint} != verdict taint ${v.taint}`);
  ok(v.policyVersion === policy.version, `${id}: policyVersion ${v.policyVersion} != ${policy.version}`);
  ok(!!v.decisionHash, `${id}: missing decisionHash`);
  ok(!!v.listVersion, `${id}: missing listVersion`);

  // reason weights ~ taint
  const wSum = reasons.reduce((a, r) => a + r.weight, 0);
  ok(Math.abs(wSum - v.taint) <= APPROX, `${id}: reason weights ${wSum.toFixed(3)} != taint ${v.taint}`);

  // exposure coherence on the subject node (role "dest")
  const subject = graph.nodes.find((n) => n.role === "dest");
  ok(!!subject, `${id}: no subject (role=dest) node`);
  let highSum = NaN;
  if (subject) {
    const exp = engine.getExposure(subject.id);
    const sumSide = (s: { pct: number }[]) => s.reduce((a, x) => a + x.pct, 0);
    const recv = sumSide(exp.receiving);
    const send = sumSide(exp.sending);
    ok(Math.abs(recv - 100) <= 0.5, `${id}: receiving sums to ${recv.toFixed(1)} (!=100)`);
    ok(Math.abs(send - 100) <= 0.5, `${id}: sending sums to ${send.toFixed(1)} (!=100)`);
    highSum = exp.receiving.filter((x) => x.risk === "high").reduce((a, x) => a + x.pct, 0);
    ok(
      Math.abs(highSum / 100 - v.taint) <= APPROX,
      `${id}: high-risk receiving ${highSum.toFixed(1)}% != taint ${(v.taint * 100).toFixed(1)}%`,
    );
    // subject profile must resolve (not the fallback)
    const prof = engine.getEntity(subject.id);
    ok(prof.id === subject.id && Object.keys(prof.stats).length > 0, `${id}: subject profile did not resolve`);
  }

  // edges reference real nodes
  const ids = new Set(graph.nodes.map((n) => n.id));
  for (const e of graph.edges) {
    ok(ids.has(e.from) && ids.has(e.to), `${id}: edge ${e.from}->${e.to} references missing node`);
  }

  // tainted vs NO_MATCH structural rules
  const san = graph.nodes.find((n) => n.role === "san");
  const taintedEdges = graph.edges.filter((e) => e.tainted);
  if (v.outcome === "NO_MATCH") {
    ok(!san, `${id}: NO_MATCH must not have a sanctioned node`);
    ok(taintedEdges.length === 0, `${id}: NO_MATCH must have no tainted edges`);
    ok(v.sanctionedSource === undefined, `${id}: NO_MATCH must not set sanctionedSource`);
    ok(v.hops === 0, `${id}: NO_MATCH hops must be 0`);
  } else {
    ok(!!san, `${id}: ${v.outcome} must have a sanctioned node`);
    ok(taintedEdges.length > 0, `${id}: ${v.outcome} must have a tainted edge path`);
    ok(!!v.sanctionedSource && ids.has(v.sanctionedSource), `${id}: sanctionedSource must reference a real node`);
    // the sanctionedSource (taint origin) must itself be a role:"san" node;
    // there may be additional san nodes (e.g. the SDN name controlling the wallet)
    const srcNode = graph.nodes.find((n) => n.id === v.sanctionedSource);
    ok(srcNode?.role === "san", `${id}: sanctionedSource ${v.sanctionedSource} must be a role:"san" node`);
    ok(v.hops > 0, `${id}: tainted case hops must be > 0`);
    if (v.sanctionedSource) {
      ok(
        engine.getEntity(v.sanctionedSource).sanctioned === true,
        `${id}: sanctioned source entity must be sanctioned=true`,
      );
    }
  }

  rows.push({
    id,
    rail: summary.rail,
    outcome: v.outcome,
    taint: `${(v.taint * 100).toFixed(1)}%`,
    "high%": Number.isNaN(highSum) ? "—" : `${highSum.toFixed(1)}%`,
    hops: v.hops,
    Σw: wSum.toFixed(3),
    nodes: graph.nodes.length,
  });
}

// unknown-id fallback must not throw
const fb = engine.getEntity("does-not-exist");
ok(fb.id === "does-not-exist" && Object.keys(fb.stats).length === 0, "fallback profile shape wrong");
const fbx = engine.getExposure("does-not-exist");
ok(fbx.receiving.length > 0 && fbx.sending.length > 0, "fallback exposure shape wrong");

console.table(rows);

if (fails.length) {
  console.error(`\n✗ ${fails.length} coherence failure(s):`);
  for (const f of fails) console.error("  - " + f);
  process.exit(1);
}
console.log(`\n✓ all ${rows.length} cases coherent (taint ↔ outcome ↔ policy ↔ graph ↔ exposure ↔ reasons)`);
