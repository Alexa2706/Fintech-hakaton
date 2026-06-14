# throughline — build context (CLAUDE.md)

Drop this at the repo root. Claude Code reads it as project context. Build in the phase order at the bottom.

## What we're building
A **sanctions-exposure screening console**. Thesis: *sanctions exposure is a weighted reachability problem — one engine, two graphs (crypto transaction graph + fiat beneficial-ownership graph), sub-second, fully explainable.* A payment comes in; the engine returns **MATCH** (block) / **REVIEW** (human) / **NO_MATCH** (release), with the traced path, decomposed reasons, and the exact list + policy version that produced the verdict. A grounded AI agent explains the case to the analyst.

## Scope RIGHT NOW (read carefully)
- **Mock data** for everything the engine produces (cases, entities, exposure, graphs).
- **Real agent**: DeepSeek `deepseek-v4-pro`, OpenAI-compatible, with tool-calling.
- **Real tools** that read the engine (which is mock now).
- **Algorithms come LATER** (teammates): name matching, company→UBO ownership, crypto taint. They plug in behind the engine contract — do **not** build them now, just the seam + mock.
- Not now: auth, persistence, multi-user, the Python engine service.

## Design target (DARK — Palantir Gotham graph console, built bespoke in shadcn/Tailwind)
> **Full design system + tokens live in [`DESIGN.md`](DESIGN.md). Read it before writing any UI.** This section is the summary.
>
> **Theme strategy (decided):** ship **dark-only** for the demo (one strong look, full focus — no toggle). But **token-first architecture** — every color goes through a CSS variable / semantic token, never a hardcoded hex — so a future light theme is a token flip, not a rewrite. **No per-rail theming** (crypto and fiat share one look; splitting the skin breaks the "one console" thesis).

**Reference: Palantir Gotham investigation graph** (dark canvas + node-link graph left, faceted "Histogram" inspector right). We are NOT using Blueprint — we recreate the Gotham *look* in shadcn/Tailwind so it's fully ours and not locked to their library. This single layout serves **both rails**: fiat UBO (company→owner nodes, edges = ownership %) and crypto (address nodes, edges = BTC/USDC). Same canvas, different node types + edge labels.

Two zones. **Left = graph canvas. Right = entity / faceted inspector.** The inspector is the product, the graph is the canvas.

- **Graph (canvas):** dark dense node-link network on a navy-charcoal field. Central entity highlighted; neighbor nodes as labeled icon tiles (person / company / bank / address / vehicle), thin desaturated links radiating out; directional edges labeled with values (BTC/USDC amounts or ownership %). Sanctioned node in red. Tainted path edges highlighted (brighter / accent). Top: dense toolbar strip; left: an artifact/search field; bottom-right: zoom controls — read the Gotham chrome.
- **Inspector (right panel):**
  - Identity row: entity name, category (with a colored category dot), root address / registry id (mono), sanctioned flag.
  - Stats grid: balance / sent / received / fees; transfers / deposits / addresses (crypto) or ownership stats (fiat).
  - Tabs: **Overview · Path · Counterparties · Exposure · Agent**.
  - **Faceted "Histogram" block (the Gotham signature):** like the reference's right panel — grouped facets with a count + a thin horizontal bar per row. `OBJECT TYPES` (Person / Company / Bank / Address … with counts), then `PROPERTY VALUES` facets (category, country, alias, cell-member-function, ownership %). This is the Gotham move that makes it read as a real intelligence console — and it *is* our exposure/category breakdown rendered as faceted bars.
  - **Exposure breakdown:** % of flow by category — sanctioned / mixer / darknet / high-risk / exchange / clean — split **receiving vs sending**. Render as clean horizontal bars consistent with the faceted Histogram block above (same bar language). *Sunburst is optional/later; the dark faceted bars ARE the look. Recharts is fine.*
  - **Decision policy ruler:** the taint plotted on a scale with the review (5%) and block (50%) thresholds marked. Shows which line the case crossed.
  - Verdict pill (MATCH/REVIEW/NO_MATCH + taint %), notes, audit line (list version, policy version, decision hash).
- **Aesthetic (DARK):** navy-charcoal canvas (`~#0e141d`), slightly lighter panels (`~#161e29`), hairline borders (`~#252e3b`), no soft consumer shadows. Text near-white (`~#c8d2de`) with muted gray secondary (`~#7c8796`). One restrained accent — desaturated indigo/cyan (`~#5b8def`) for selection + histogram bars. Semantic colors only as small dots/pills: red = sanctioned, amber = review, green = clean. **Density > whitespace** (Gotham is dense — invert the old "whitespace > density"). IBM Plex Sans (UI, institutional grotesque), IBM Plex Mono (addresses/ids/figures/%).
- **Mostly sharp corners.** `rounded-none` on panels, cards, buttons, inputs, pills, badges, the toolbar. The only allowed radius is a tiny `rounded-[2px]` on graph node icon tiles to match the Gotham reference. No soft consumer rounding anywhere else.
- **Must NOT look AI-generated.** Avoid the generic AI house style: no purple/violet gradients, no glassmorphism, no generic centered hero with a big gradient blob, no emoji icons, no evenly-rounded everything, no symmetric "feature card grid" filler. Reference real terminals (Chainalysis Reactor, Bloomberg, Linear, Vercel dashboard): dense information, deliberate typographic hierarchy, restrained color, real data shapes. Asymmetry where the data demands it. Borders and spacing do the work, not decoration.

### Anti-generic execution (locked direction: PALANTIR GOTHAM DARK, in shadcn/Tailwind)
The goal is the Palantir Gotham *look* recreated in our own stack — credible institutional density, not Blueprint, not default shadcn. Hard rules, not aspirations:
- **The differentiation lives in the bespoke signature visuals, not the chrome.** Spend the design budget on: the **dark graph canvas** (taint-traced node-link with icon tiles), the **faceted Histogram inspector**, the **exposure bars**, the **policy ruler**, and the **verdict treatment**. These are custom SVG/Recharts — library-agnostic. shadcn tabs/buttons/inputs are just quiet plumbing around them.
- **Kill every shadcn default that signals "AI-generated":** default `rounded-lg` → `rounded-none` (graph node tiles only: `rounded-[2px]`); light theme → the dark Gotham palette above; default `border` → true hairline (`~#252e3b`/1px); soft shadows → none; lucide default sizing/stroke → smaller, thinner, sparing; default Inter → IBM Plex Sans (UI) + IBM Plex Mono (every address/id/figure/%).
- **No centered marketing layout.** A working console: dense toolbar strip on top, graph canvas filling the center, faceted inspector docked right, zoom controls bottom-right — full-bleed, dense, no hero, no landing-page whitespace.
- **Real data shapes everywhere.** Mono figures right-aligned, addresses truncated mid (`0x1a2b…f9`), %s and BTC/USDC with units, list/policy versions visible, every facet row carries a count + thin bar. Tabular-nums. Density is what reads as a real analyst tool.
- **One accent, used as signal not decoration.** Desaturated indigo/cyan for selection + histogram bars only; semantic red/amber/green only as small dots/pills on actual risk. Color is information, never garnish.
- Smell test before shipping any screen: *would a Gotham analyst recognize this as a peer tool, or does it look like "a dashboard built with shadcn"?* If the latter, it's not done.
- **Human-in-the-loop:** on REVIEW, analyst can Release / Escalate / Block; the action updates status and writes to the audit line. The agent hands over the machine's finished work so the analyst **validates**, never re-investigates (no double-processing).

## Stack
- **Next.js (App Router, TypeScript) + React + Tailwind + shadcn/ui.** UI + API routes in one app. No raw HTML/CSS pages — everything is React components. shadcn/ui as the component base (Card, Tabs, Button, Badge, etc.), styled to the aesthetic below.
- **shadcn config:** dark Gotham theme via CSS-variable tokens (see [`DESIGN.md`](DESIGN.md) §2). `--radius: 0` (sharp corners; node tiles only `rounded-[2px]`). Token-first — no hardcoded hex in components.
- **Agent**: OpenAI SDK pointed at DeepSeek in a Next API route.
- **Graph**: SVG (or a lightweight lib). Hardcoded/laid-out positions over mock data for now.
- **Charts**: Recharts.

## File structure
```
app/
  page.tsx                 # console: <Queue/> + <Graph/> + <Inspector/>
  api/agent/route.ts       # DeepSeek tool-calling loop (server-only; key in env)
lib/
  engine/
    types.ts               # THE CONTRACT (seam). Mock now, Python service later.
    mock.ts                # mock implementation of the contract
    index.ts               # export const engine = mockEngine  (swap here later)
  agent/
    tools.ts               # OpenAI tool schemas + handlers -> call lib/engine
    system.ts              # grounded system prompt
  mock/
    cases.ts               # demo cases + entities + exposure + graph layouts
components/
  Queue.tsx  Graph.tsx  Inspector.tsx  PolicyRuler.tsx  ExposureBars.tsx  AgentDrawer.tsx
```

## The engine contract (the seam — do this first)
`lib/engine/types.ts`:
```ts
export type Outcome = "MATCH" | "REVIEW" | "NO_MATCH";
export type Rail = "crypto" | "fiat";

export interface Verdict {
  caseId: string;
  outcome: Outcome;
  taint: number;                 // 0..1 fraction of value/ownership tracing to a sanctioned source
  reasons: Reason[];
  hops: number;
  sanctionedSource?: string;     // node id
  listVersion: string;           // pins verdict to a dated list (reproducibility)
  policyVersion: string;         // pins verdict to a documented threshold policy
}
export interface Reason { code: string; detail: string; weight: number; }

export interface GraphData { nodes: GNode[]; edges: GEdge[]; }
export interface GNode { id: string; label: string; role: "san"|"mid"|"dest"|"clean"; x: number; y: number; }
export interface GEdge { from: string; to: string; label: string; tainted: boolean; }

export interface EntityProfile {
  id: string; label: string; rail: Rail; category: string;
  rootRef: string;              // address (crypto) or registry id (fiat)
  sanctioned: boolean;
  stats: Record<string, string>;
}
export interface Exposure {                       // the Reactor breakdown
  receiving: ExposureSlice[]; sending: ExposureSlice[];
  tracedUsd?: number;
}
export interface ExposureSlice { category: string; pct: number; risk: "high"|"medium"|"low"; }

export interface DecisionPolicy { version: string; reviewAt: number; blockAt: number; rationale: string; }

// the engine the UI + agent talk to. mock now; real (or Python HTTP) later — same shape.
export interface Engine {
  listCases(): CaseSummary[];
  getVerdict(caseId: string): Verdict;
  getPath(caseId: string): GraphData;
  getEntity(nodeId: string): EntityProfile;
  getExposure(nodeId: string): Exposure;
  explainScore(caseId: string): { reasons: Reason[]; policy: DecisionPolicy; taint: number };
  draftSar(caseId: string): string;
}
export interface CaseSummary { id: string; party: string; rail: Rail; amount: string; outcome: Outcome; }
```
`mock.ts` implements `Engine` from `lib/mock/cases.ts`. `index.ts` exports `engine = mockEngine`. **When teammates ship real algorithms, only `index.ts` changes** (point at the real impl / a fetch to the Python service). Reference for the real engine math already exists: proportional ("haircut") backward taint trace + thresholds-as-policy + list-version pinning (see throughline_engine.py).

## The agent (DeepSeek, grounded)
`lib/agent/deepseek.ts`:
```ts
import OpenAI from "openai";
export const ds = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com" });
// model: "deepseek-v4-pro"  (agentic/tool-calling). NOT deepseek-chat (deprecated 2026-07-24).
```
Tool-calling loop in `api/agent/route.ts`: send messages + `tools`; if the response has `tool_calls`, run each handler (from `lib/agent/tools.ts`, which calls `engine`), append `{role:"tool", tool_call_id, content}`, call again; repeat until no tool calls; stream the final text.

**Tools** (all read-only over the engine):
- `get_verdict(caseId)` → outcome, taint, hops, listVersion, policyVersion
- `get_path(caseId)` → nodes + edges with shares, which are sanctioned
- `get_entity(nodeId)` → identity, category, sanctioned flag, stats
- `get_exposure(nodeId)` → receiving/sending category breakdown
- `explain_score(caseId)` → decomposed reasons + how taint maps to the policy thresholds
- `draft_sar(caseId)` → structured SAR draft from the evidence

**Grounding rules (in system.ts — non-negotiable):**
1. You explain and draft. You **never** make the screening decision — the engine does that.
2. Answer **only** from tool outputs. **Never** use your own knowledge about who is sanctioned or about real-world entities. If something isn't in the evidence, say you can only speak to the engine's findings.
3. Always cite the evidence: the reason code, the list version, the policy version.
4. SAR drafts use only the case evidence; label them DRAFT.
5. Analyst tone: tight, concrete, no filler.

## Mock data shape (`lib/mock/cases.ts`)
~6 cases spanning all outcomes and both rails. Each: id, party, rail, amount, corridor, time, outcome, taint, reasons[], graph (nodes+edges with hardcoded x/y), per-entity profiles, receiving/sending exposure slices, sar text. Make the data structurally identical to real engine output so the swap is invisible.

## Build order
- **Phase 0** — `types.ts` (contract) + `mock/cases.ts` (fixtures). Mock `engine` returns them.
- **Phase 1** — UI shell: Queue + Graph (node-link) + Inspector (Reactor layout, tabs, stats, ExposureBars, PolicyRuler), reading the mock engine. This is the demo's face — make it premium.
- **Phase 2** — DeepSeek agent route + tools over the mock engine; AgentDrawer with grounded answers + SAR; human-in-the-loop actions.
- **Phase 3** — polish: node hover/click → inspector focus, timeline, notes, exposure sunburst (if time), decision animations.
- **Later (teammates)** — replace the mock engine in `index.ts` with real algorithms (name match, UBO ownership graph, crypto taint), possibly a Python service behind the same contract.

## Guardrails
- The agent never decides; thresholds live in a versioned `DecisionPolicy`; every verdict carries path + reasons + listVersion + policyVersion.
- Keep the engine behind the contract — no engine logic leaking into components or the agent route.
- `DEEPSEEK_API_KEY` is server-only (API route), never shipped to the client.
