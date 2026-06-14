# throughline — design guidelines

The visual contract for the screening console. **Read this before writing any UI.** Pairs with `CLAUDE.md` (build context). If a component disagrees with this doc, the doc wins.

---

## 0. North star (one sentence)
Recreate the **Palantir Gotham** investigation-graph *look* — dark, dense, institutional — in **our own stack (shadcn + Tailwind)**, so it's fully ours (not Blueprint, not default shadcn). One console for both rails: crypto addresses and fiat UBO.

**Smell test for every screen:** *would a Gotham analyst read this as a peer tool, or does it look like "a dashboard built with shadcn"?* If the latter, it's not done.

---

## 1. Theme strategy (decided)
- **Ship dark-only for the demo.** One strong look, full focus. No theme toggle in the demo.
- **But architect token-first.** Every color goes through a CSS variable / semantic token — never a hardcoded hex in a component. So a future light theme is a *token flip*, not a rewrite.
- **No per-rail theming.** Crypto and fiat share one look. The thesis is "one engine, one console" — splitting the skin by rail breaks that and looks like two apps.

Rule: if you're about to type `#`, `bg-[#…]`, or a raw Tailwind color like `bg-zinc-900` inside a component — stop. Use a token (`bg-surface`, `text-muted`, `border-hairline`).

---

## 2. Design tokens
Raw palette → semantic tokens. Define once in `app/globals.css`, consume everywhere via Tailwind.

### Raw palette (dark)
| Token | Hex | Use |
|---|---|---|
| `--canvas` | `#0e141d` | graph canvas, app base (deepest) |
| `--surface` | `#161e29` | panels, toolbar, inspector |
| `--surface-2` | `#1b2430` | raised rows, cards inside panels, hover |
| `--hairline` | `#252e3b` | 1px borders, dividers, bar tracks |
| `--line-strong` | `#313c4c` | stronger separators, focused borders |
| `--text` | `#c8d2de` | primary text |
| `--text-muted` | `#7c8796` | secondary text, labels |
| `--text-faint` | `#586374` | tertiary, disabled, watermarks |
| `--accent` | `#5b8def` | selection, links, histogram bars (the one accent) |
| `--accent-hi` | `#74a0f5` | accent hover/active |
| `--accent-wash` | `rgba(91,141,239,.12)` | selected-row bg, accent fills |
| `--risk-high` | `#e5484d` | sanctioned / MATCH / block |
| `--risk-med` | `#e6a23c` | review / REVIEW threshold |
| `--risk-low` | `#3fb950` | clean / NO_MATCH / release |

Category dots (exposure facets): sanctioned `#e5484d` · mixer `#d6803a` · darknet `#9a6bd6` · high-risk `#e6a23c` · exchange `#5b8def` · clean `#3fb950`. Used **only** as small dots/pills, never as fills of large areas.

### globals.css (paste, then wire Tailwind)
```css
:root {
  --canvas:#0e141d; --surface:#161e29; --surface-2:#1b2430;
  --hairline:#252e3b; --line-strong:#313c4c;
  --text:#c8d2de; --text-muted:#7c8796; --text-faint:#586374;
  --accent:#5b8def; --accent-hi:#74a0f5; --accent-wash:rgba(91,141,239,.12);
  --risk-high:#e5484d; --risk-med:#e6a23c; --risk-low:#3fb950;

  /* shadcn semantic mapping (dark is the only theme we ship) */
  --background:var(--canvas); --foreground:var(--text);
  --card:var(--surface); --card-foreground:var(--text);
  --popover:var(--surface-2); --popover-foreground:var(--text);
  --primary:var(--accent); --primary-foreground:#0b0f16;
  --secondary:var(--surface-2); --secondary-foreground:var(--text);
  --muted:var(--surface-2); --muted-foreground:var(--text-muted);
  --accent-color:var(--accent); --accent-foreground:#0b0f16;
  --destructive:var(--risk-high); --destructive-foreground:#fff;
  --border:var(--hairline); --input:var(--hairline); --ring:var(--accent);
  --radius:0px;
}
```
Map these into `tailwind.config` `theme.extend.colors` (e.g. `canvas`, `surface`, `surface2`, `hairline`, `text`, `muted`, `faint`, `accent`, `risk-high/med/low`) so utilities like `bg-surface text-muted border-hairline` exist.

---

## 3. Typography
- **UI:** IBM Plex Sans — institutional grotesque, reads engineered. (`next/font` → CSS var `--font-sans`.)
- **Data:** IBM Plex Mono — every address, id, figure, %, count, version, hash. (`--font-mono`.)
- Never put figures in the sans face. Mono = "this is data."

| Role | Size / weight | Notes |
|---|---|---|
| Section label (`OBJECT TYPES`) | 11px / 600 | uppercase, `tracking-[0.08em]`, `text-muted` |
| Entity title | 15px / 500 | sans |
| Body / row label | 13px / 400 | sans |
| Data / figures | 12–13px / 400 | **mono**, `tabular-nums`, often right-aligned |
| Node label (canvas) | 11px / 500 | sans, `text-muted` |
| Micro (audit line, versions) | 11px / 400 | mono, `text-faint` |

All numeric columns: `tabular-nums`. Addresses truncate mid: `0x1a2b…f9c4`, registry ids mono.

---

## 4. Shape, border, elevation
- **Corners sharp.** `--radius:0`. `rounded-none` on panels, cards, buttons, inputs, pills, badges, tabs, the toolbar. **Only exception:** graph node icon tiles get `rounded-[2px]` (matches Gotham).
- **Borders do the work.** 1px `--hairline` everywhere; `--line-strong` for emphasis/focus. This is how zones separate — not shadows.
- **No soft shadows.** No `shadow-lg`, no glow except an optional 1px accent ring on the selected node. Elevation is communicated by surface step (`canvas → surface → surface-2`), not blur.
- **Dividers over gaps.** Dense sections separated by hairlines, not large whitespace.

---

## 5. Color as signal, not decoration
- **One accent** (`--accent`): selection state, links, histogram/exposure bar fills, focus ring. Nothing else is blue.
- **Semantic colors** (`risk-high/med/low` + category dots): only as **small dots, pills, single bars, or node outlines** — never as large background fills.
- Default surface is neutral dark; color appears *only where it carries meaning* (a risk, a selection, a category). If a color isn't telling the analyst something, remove it.
- Sanctioned node: red fill/outline on canvas. Tainted edge: brighter/accent stroke vs. the thin desaturated default links.

---

## 6. Layout — the console shell
Full-bleed, no page margins, no hero. Three structural zones:

```
┌────────────────────────────────────────────────────────────┐
│ TOOLBAR STRIP  (dense: search · organize · styling · status)│  ~44px, bg surface, hairline-bottom
├──────────────┬──────────────────────────────┬───────────────┤
│ QUEUE rail   │     GRAPH CANVAS             │  INSPECTOR    │
│ (cases)      │     (dark, node-link)        │  (faceted)    │
│ optional/    │                              │               │
│ collapsible  │     zoom ctrls ┘ bottom-right│  docked right │
│ ~260px       │     flex-1                   │  ~360–400px   │
└──────────────┴──────────────────────────────┴───────────────┘
```
- Toolbar: small icon-buttons grouped with hairline dividers, a mono search field on the left, save/status on the right. Dense like the reference.
- Canvas: `bg-canvas`, fills remaining space, zoom controls bottom-right (square icon buttons).
- Inspector: docked right, `bg-surface`, scrolls independently. **This is the product.**
- Density target: panel padding `p-3`/`p-4`, facet/list rows ~28–32px tall, gaps tight (`gap-1`/`gap-2`).

---

## 7. Signature components (where the design budget goes)
These four are bespoke (SVG/Recharts) and are what make it *not* look generated. Polish these over the chrome.

### 7.1 Graph canvas
- Dark field, node-link. Nodes = icon tiles (`rounded-[2px]`, ~40px): person / company / bank / address / vehicle / org — label below in 11px sans.
- Central entity emphasized (accent ring). Neighbors radiate; links are thin `--text-faint` strokes; **tainted path** links are `--accent` (or `--risk-high` near the sanctioned source), thicker.
- Edge labels: mono, the value (BTC/USDC amount or ownership %).
- Sanctioned node: `--risk-high` outline/fill. Selected node: accent ring + the inspector focuses it.
- Positions hardcoded from mock layout for now (`x/y` in the data). Hover → highlight + tooltip; click → inspector focus.

### 7.2 Faceted "Histogram" inspector (the Gotham signature)
The reference's right panel. Grouped facets, each a section-label + rows; **every row = label · count · thin horizontal bar**.
- `OBJECT TYPES` — Person / Company / Bank / Address … (count + bar, bar width ∝ count, fill `--accent`, track `--hairline`).
- `PROPERTY VALUES` — category, country, alias, cell-member-function, ownership %, etc.
- Collapsible groups (chevron), `Show more…` truncation when long.
- Row: `h-7`, label `text-13 truncate`, count `mono text-muted` right-aligned, bar a 1px-tall-ish slim track under or beside. Keep it tight and quiet — the density is the point.

### 7.3 Exposure bars
- % of flow by category, split **receiving vs sending**. Same bar language as the Histogram facets (consistency = polish).
- Horizontal stacked or per-category bars; category dot + label + mono % + bar. Sanctioned/mixer/darknet up top.
- Recharts ok, but match the token colors and the slim, sharp, dark style — not Recharts defaults.

### 7.4 Policy ruler + verdict
- **Policy ruler:** a horizontal scale 0–100% taint with **review (5%)** and **block (50%)** threshold ticks marked; the case's taint plotted as a marker. Shows which line it crossed. Zones tinted faintly with `risk-low/med/high` washes; ticks labeled mono.
- **Verdict pill:** `MATCH` (risk-high) / `REVIEW` (risk-med) / `NO_MATCH` (risk-low) + taint %. Sharp, small, mono %, semantic bg at low opacity + solid text.
- **Audit line:** mono, `text-faint`, one line: `list <ver> · policy <ver> · hash <…>`. Always present — it's what makes the verdict reproducible/credible.

---

## 8. shadcn usage
- Init with the dark CSS-var theme above; `--radius:0`.
- Use shadcn for plumbing only: `Tabs` (Overview · Path · Counterparties · Exposure · Agent), `Button`, `Input`, `Badge`, `ScrollArea`, `Tooltip`, `Separator`, `Collapsible`.
- Override every component to the tokens + sharp corners. If a shadcn default (radius, ring, shadow, color) shows through, fix it. shadcn is the skeleton, not the skin.
- Buttons: small, square, hairline border, ghost/secondary by default; accent only for the one primary action per context.

---

## 9. Icons & motion
- **Icons:** lucide, `size-4`/`size-3.5`, `stroke-[1.5]`, `text-muted` by default. Sparing. **No emoji.** Node-type glyphs may be slightly larger inside tiles.
- **Motion:** restrained, functional. 120–180ms ease for hover/selection/panel transitions. The one place to spend animation: the **decision moment** (verdict resolving, taint marker sliding onto the ruler) and node focus. No decorative looping animation, no parallax, no gradient shimmer.

---

## 10. Anti-generic checklist (gate before "done")
- [ ] No `rounded-lg`/soft corners anywhere except node tiles (`rounded-[2px]`).
- [ ] No light surfaces, no purple/violet gradients, no glassmorphism, no glow.
- [ ] No centered hero / marketing layout — it's a full-bleed console.
- [ ] Every figure/address/% is **mono + tabular-nums**.
- [ ] Color appears only where it's signal (risk, selection, category).
- [ ] Borders/surface-steps separate zones, not shadows.
- [ ] Inspector is dense (facet rows, counts, bars) — reads like the Gotham reference.
- [ ] No hardcoded hex in components — tokens only.
- [ ] Passes the smell test in §0.
