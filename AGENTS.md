# Pitch contributor contract

This is the canonical guide for all contributors. `CLAUDE.md` points here.
Keep durable rules here; keep changing programme status in the roadmap and detailed
contracts in the references below. Update the owning source when behaviour changes.

## Product and ownership

Pitch is a free, browser-first football career simulator, mobile-first and usable
without an account. Live product: `pitch-sim.com`. The main-branch product is
simulator-only; do not introduce manual football controls incidentally. Explicit
feature work follows its approved plan and target branch.

- `src/modules/matchEngine.js` owns football outcomes. Quick Sim and Broadcast
  consume the same result; presentation must not invent a score, scorer or result.
- `src/modules/` stays DOM-free. UI lives in Svelte 5 components under `src/lib/ui/`;
  shared presentation/computation belongs in `src/game/`. Use existing owners.
- `save.pendingEvents` is the one gameweek event queue: one advance resolves one
  event; the world week advances only once it is empty. Preserve seeded parity.
- IndexedDB access belongs in `src/modules/db.js`. Preserve career-slot isolation,
  versioned save migration and atomic writes; no second persistence lifecycle.
- `functions/` owns server/cloud functionality and D1 migrations. Core single-player
  simulation does not need new server authority. Never commit secrets.
- Use existing data/reconciliation pipelines; respect asset/data provenance.

## Load only what the task needs

Read each relevant reference before changing its domain; follow cross-domain
boundaries too. Paths in the referenced code examples are repository-relative.
This table is explicit loading guidance for CLI and GitHub-only sessions; it does
not assume that `.claude/rules/` is automatically loaded in every host.

| Task / affected area | Required reference |
| --- | --- |
| Non-trivial product or roadmap work | [Roadmap](docs/plan/post-r7-career-depth-roadmap.md): orientation, status and relevant phase; then that phase's guide under `docs/plan/post-r7-implementation-guides/` |
| Match, tactics, queue, competition, world simulation | [Simulation](docs/engineering/simulation.md); [Broadcast](docs/plan/live-broadcast.md) when presentation changes |
| Player model, bench, scouting, transfers | [Players and market](docs/engineering/players-market.md) |
| Save, IndexedDB, migrations, cloud or club handover | [Persistence](docs/engineering/persistence.md) |
| Managers, finance, board, facilities, season settlement | [Club management](docs/engineering/club-management.md) |
| UI, styling, Svelte components | [UI](docs/engineering/ui.md) and [Svelte 5](.claude/rules/svelte5.md) |
| Data pipelines, player ratings or world writes | [Data](docs/engineering/data.md) |
| Verification, commit, PR or deployment | [Verification](docs/engineering/verification.md) |
| Instruction or workflow changes | [Workflow contract](docs/agent-workflows.md) |

[Historical baselines](docs/engineering/delivery-baselines.md) retain behavioural
regression contracts and dated evidence; read the affected phase when changing
those contracts. Do not load all phase histories for every task or treat their
old test counts as fresh evidence.

## Shared workflows

Before implementation or instruction edits run `python3 tools/agent-skills.py`,
then `python3 tools/agent-skills.py --check`. Read each applicable
`.agents/skills/<name>/SKILL.md` in full, plus required references (`delivery-loop`
requires `steps.md`). Exact revisions are in [the lock](.agents/skills.lock.json).
The same generated dependencies appear under `.claude/skills/`; never edit or
commit installed caches or enable duplicate marketplace copies.

Use `delivery-loop` for implementation; `plan-gate` for novel/multi-system work,
save lifecycle, event queue, simulation maths, module ordering or data pipelines;
`scope-fence` for modifications; `systematic-debugging` for broken behaviour;
`verification-before-completion` before completion claims; `memory-hygiene` for
persistent instructions. [Workflow contract](docs/agent-workflows.md) provides
GitHub-only exact-revision loading when bootstrap is unavailable. Disclose a
missing dependency instead of claiming its workflow ran.

## Verification and delivery floor

- Run `npm run build`, `npm run test`, `npm run lint`, `npm run check:accents`.
  Keep `npm run balance:match:deep:check` and all statistical guardrails unchanged.
  The legacy replacement-contract bridge must pass; an allow-listed failure count
  alone is not success. Full commands and conditional checks are in the reference.
- No E2E/browser test suite, dependencies or CI browser job. Use Vitest contracts
  and hands-on inspection. Do not add Playwright/Puppeteer/Cypress/browser Vitest.
- UI changes require an inspected render and the affected 390px mobile journey;
  inspect wider widths when affected. A passing build is not visual evidence.
- Preserve performance budgets at 4× CPU throttle: fresh career <20s, full world
  week <25s, storage <50 MiB. Measure by hand for simulation/persistence hot paths;
  the former browser benchmark is retired. A 15-season career must remain practical.
- Preserve migrations, seeded behaviour, accessibility and regression coverage.
  Never weaken gates, quarantine a failure or rerun until chance produces green.
- Commit coherent, verified delivery slices. Never intentionally push known-broken
  code or half-wired work. Failed review/verification returns to Build and Review.
- Cloudflare Workers Builds owns deployment and previews (`npm run build:app`,
  `dist/`). GitHub Actions verifies; do not add a competing deployment mechanism.
- Final handoff: changed behaviour, fresh checks, PR link, direct live preview link
  verified against the final pushed SHA, next milestone and unverified items.
  Wait for required CI/preview checks before reporting completion; never guess URLs.

## Context maintenance

Keep one coherent task in one session. Read narrowly, preserve sufficient caller
context, reuse unchanged material still in context, and append new evidence.
Keep full logs out of routine tool summaries without hiding failures. Compact or
re-read when needed for correctness. API cache controls are host-owned; no cache
hit or credit reduction is guaranteed by these files. Preserve useful handoff
information while keeping routine updates concise.
