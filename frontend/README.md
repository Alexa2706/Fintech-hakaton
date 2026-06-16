# throughline — frontend

Sanctions-exposure screening console. A payment comes in; the engine returns
**MATCH** (block) / **REVIEW** (human) / **NO_MATCH** (release) with the traced
path, decomposed reasons, and the exact list + policy version behind the verdict.
A grounded agent explains the case to the analyst.

Next.js (App Router, TypeScript) · React · Tailwind · shadcn/ui · Recharts.

## Run it (mock data, no backend)

```bash
npm install
npm run dev
# open http://localhost:3000
```

The console runs **entirely on mock data** — no Python service, no database, no
network. Everything you see (queue, graph canvas, inspector, exposure bars,
policy ruler, verdicts) is produced by `lib/mock/cases.ts` behind the engine
contract. The swap seam is a single line in `lib/engine/index.ts`:

```ts
export const engine = mockEngine; // ← point at the real engine / Python service later
```

When teammates ship the real algorithms (name match, UBO ownership, crypto
taint) behind the same `Engine` contract (`lib/engine/types.ts`), only that line
changes — the UI and agent are unaffected.

## The agent

- **Inline handover + scripted briefs** (`lib/agent/scripted.ts`) work with **no
  configuration** — deterministic and grounded on the case evidence + the policy
  library. Open a REVIEW case and the analyst gets an instant brief, no API call.
- **Policy-research tool** (`lib/agent/policyResearch.ts`) — deterministic,
  grounded regulation briefs (GENIUS Act, FATF Travel Rule, OFAC 50% Rule, MiCA,
  BSA/SAR) plus the data strategy, exposed to the agent as a tool. No network; it
  answers "what does this rule require and how does the engine cover it" from
  curated, true-to-engine mappings.
- **Live conversational agent** (DeepSeek, `app/api/agent/route.ts`) needs a key:

  ```bash
  cp .env.example .env.local   # then set DEEPSEEK_API_KEY
  ```

  Without the key, `/api/agent` returns a "not configured" error; the scripted
  brief above still works. `DEEPSEEK_API_KEY` is server-only — never shipped to
  the client.

## Scripts

| script              | what it does                          |
| ------------------- | ------------------------------------- |
| `npm run dev`       | dev server on :3000                   |
| `npm run build`     | production build                      |
| `npm run start`     | serve the production build            |
| `npm run typecheck` | `tsc --noEmit`                        |
| `npm run verify`    | `tsx scripts/verify.ts` (engine self-check) |

## Grounding (non-negotiable)

The agent **explains and drafts; it never makes the screening decision** — the
engine does. It answers only from tool outputs (engine + policy library), never
from its own knowledge of who is sanctioned, and always cites the reason code,
list version, and policy version. See `lib/agent/system.ts`.
