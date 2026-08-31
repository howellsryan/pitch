# Pitch Contributor Guide

> Current, terse instructions for AI/human contributors. Update this guide in the same change when a load-bearing behaviour or programme status changes.

## 0) Current state — read first

- **Product:** free browser-first football career simulator, 9 leagues / 186 clubs, mobile-first, no forced account. It is **simulator-only**: do not add manual/on-pitch football controls. Broadcast is a watchable presentation of simulated football, not a playable match mode.
- **Live product:** `pitch-sim.com`. The app is built with Vite/Svelte 5 and deployed by **Cloudflare Workers Builds**, not GitHub Actions.
- **R0-R7 redesign is complete.** `docs/plan/07-redesign.md` remains the historical redesign reference. R8 quality/light-mode/PWA work remains a separate parallel quality stream.
- **Post-R7 programme:** `docs/plan/post-r7-career-depth-roadmap.md` is authoritative. **P0 — Football authenticity and career foundation is COMPLETE (30 Aug 2026). P1 — The Living Football World is COMPLETE (31 Aug 2026). P2 — Match Engine 2.0, Tactics and Manager DNA is COMPLETE (31 Aug 2026). P3 — Player Model 2.0 is NEXT / ACTIVE.**
- Detailed P3-P12 execution guides live under `docs/plan/post-r7-implementation-guides/`; use the roadmap for product priority and the phase guide for execution seams.
- Read the live roadmap before non-trivial work. If this guide and the roadmap disagree, fix this guide in the same change.

## 1) Load-bearing architecture

### Authoritative football outcome

- `src/modules/matchEngine.js` owns football outcomes.
- `src/game/broadcastSimulation.js` is a deterministic spatial/presentation layer. It may visualise an authoritative result/event plan but must never invent a conflicting score, scorer or result.
- Quick Sim and Broadcast must consume the same authoritative football outcome.
- P1 background fixtures also use the authoritative fast match engine. Never run Broadcast simulation for the background world.

### Tactics and Manager DNA — P2 foundation

- `src/modules/tactics.js` owns the shared team-instruction/player-role schema, defaults/normalisation, tactical modifiers, AI tactical profiles and role suitability. Do not create a second user-only or AI-only tactics model.
- `src/modules/managerTactics.js` owns the managed-match adapter: persisted user tactics/roles are decorated onto the controlled side, AI formation/mentality remains engine-resolved, opposition insight comes from the same AI profile, and Manager DNA samples authoritative match choices/results idempotently.
- `matchEngine.js` has seeded/serialisable RNG. Whole-match Quick Sim and segmented Broadcast must remain reproducible from the same seed and inputs.
- Tactical effects are bounded trade-offs, never hidden universal rating boosts. Preserve the statistical regression envelope when adding P3 player-state inputs.
- Existing P2 careers backfill tactic defaults, player-role assignments and Manager DNA without changing formation, mentality or lineup.

### Gameweek event queue

- `save.pendingEvents`, built/drained in `src/modules/gameweek.js`, is load-bearing.
- One advance action resolves one pending league/cup/European event.
- The gameweek advances only after the queue is empty.
- Cup/European opponents and event details are fixed when the event is built; do not bypass the queue with a second tournament path.
- P1's world clock settles background leagues/competitions around this queue; it must not create a parallel user-match lifecycle.

### Competition rules — P0 foundation

- `src/modules/competitionRules.js` is the shared source for competition format/round/schedule/entry/two-leg/UEFA qualification rules.
- `src/modules/cups.js`, `src/modules/gameweek.js` and `src/modules/season.js` consume that layer. Do not reintroduce scattered round-index magic or a second competition engine.
- P0 removed UEFA away-goals semantics.
- P0 models current UEFA 36-team league-phase routes: UCL/UEL 8 user league-phase fixtures, UECL 6; positions 1-8 direct R16, 9-24 knockout play-off, 25-36 eliminated; seeded placement drives relevant home-leg ordering.
- P1 extends the living world across supported domestic and associated competition state; future format changes still belong in the shared rules layer.

### Living world — P1 foundation

- `src/modules/world.js` owns the canonical living-world match/stat ledger contract. A completed fixture is written once; player/club/competition projections derive from that authoritative record.
- `src/modules/worldRuntime.js` applies persisted canonical results with apply-once semantics. Fixture projection flags, standings and changed player rows commit atomically; do not split that boundary into independent writes.
- `src/modules/worldCompetitions.js` owns background domestic/European competition state and its compactable result ledger. Cup projection writes only participant-club players; do not return to full-world rewrites.
- Current-season player statistics include appearances, starts/minutes, goals, assists, clean sheets, cards/suspensions, injuries, form and ratings. `LeagueScreen.svelte` exposes inspectable living-world club profiles.
- Season rollover persists compact historical summaries and creates the next season's fresh world/competition state. Do not retain an unbounded detailed match ledger across seasons.
- P1 newgens replace retirements from calibrated cohorts; avoid cloning retired players or unconstrained talent inflation.
- Background simulation/persistence is performance-sensitive. `tests/p1-living-world-performance.spec.mjs` is a regression guard, not a UX target: 4× CPU throttle, <20s fresh-career load, <25s full world week, <50 MiB storage. Final P1 baseline was 12.33s / 18.50s / 2.76 MiB on a shared CI runner; P2 closeout remained within those guards at 12.57s / 18.93s / 2.61 MiB.

### Persistence / career slots — P0 foundation

- IndexedDB access lives in `src/modules/db.js`; domain code should not open ad-hoc databases.
- Save envelope is **V2** with `schemaVersion` and stable `slotId`. Existing V1 `.pitch` saves migrate explicitly; future persistent changes must extend the ordered migration path rather than rely on ad-hoc backfills.
- Multiple careers are isolated by slot:
  - `legacy` keeps the original physical `pitch_fc` database so pre-P0 browsers remain discoverable;
  - deleting/resetting the legacy career **clears its stores in place** — do not physically delete/recreate that compatibility database;
  - generated career slots use separate `pitch_fc_slot_<slotId>` databases and may be physically deleted.
- New Career allocates an isolated slot only when a career/import is actually committed. Backing out must leave the existing active career untouched.
- Career Menu metadata contract: manager, club, season, league, league position, gameweek, last played, save schema version; UI adds active state separately.
- Local export/import and cloud save use the same versioned envelope/slot metadata contract.
- Cloud save API/D1 is slot-aware: rows are keyed by `(user_id, slot_id)`; pre-P0 cloud rows migrate to `legacy`.
- P1 legacy/current careers backfill living-world state through the existing migration/backfill path; do not require users to destroy a P0 career to gain the world model.
- P3 should prefer additive, idempotent player-row/domain backfills and must not increment `DB_VERSION` merely to add fields to existing rows.

## 2) UI / product boundaries

- `src/lib/ui/` contains real Svelte 5 components mounted from `src/main.js`; avoid new screen-level `innerHTML` renderers.
- Entry/new-career UI lives in `EntryScreen.svelte`; saved-career selection lives in `CareerMenu.svelte`; living-world table/profile inspection lives in `LeagueScreen.svelte`.
- `EntryScreen` remains mounted behind the game shell and is reused for P0 New Career. Busy/loading state must therefore be reset after successful transitions, not only on errors.
- Mobile navigation and the main game surfaces are already redesigned. Do not reopen R0-R7 visual decisions incidentally during gameplay-system work.
- Any new/restyled surface must be verified from an actual rendered screenshot at the affected viewport; CSS reading correctly is not visual verification.
- Preserve accessibility basics: 44px touch targets where applicable, focus-visible states, reduced-motion support, readable contrast, safe-area spacing.
- P3 player state should enrich existing Squad/Market/Academy surfaces rather than creating permanent dashboard clutter.

## 3) Build, validation and deployment

Two build paths intentionally coexist:

```bash
npm run dev              # Vite dev server
npm run build            # legacy validation path + Vite app
npm run build:legacy     # src/build.py -> legacy bundle + validate_p0 bridge
npm run build:app        # Vite -> dist/
npm run test             # Vitest + UI emoji audit
npm run check:accents    # all 186 clubs
npm run test:e2e         # Playwright, mobile target 390x844 + targeted wider checks
npm run lint             # ESLint + eslint-plugin-svelte
```

- Vite `dist/` is the deployed artifact.
- `src/build.py` remains because the legacy validator asserts against concatenated raw source. P0+ route that gate through `src/validate_p0.py`, which permits only an explicit allow-list of superseded source-shape assertions and requires deterministic replacement contracts. Do not interpret the legacy validator's allow-listed failure count as a green-by-itself result; the bridge must pass.
- CI (`.github/workflows/deploy.yml`) **does not deploy**. It runs both builds, lint, Vitest, accent audit and Playwright. Cloudflare's Git integration owns production and branch previews.
- Do not re-add a GitHub Actions deploy step; two deploy systems racing the same Worker is a known failure mode.
- Cloudflare build command is `npm run build:app`; `wrangler.jsonc` serves `./dist`.

## 4) Server/cloud boundary

- `functions/` is Pitch's only server-side code: Worker request routing, Google OAuth/session support and D1 cloud saves.
- Pitch remains playable without an account; server authority is not required for core single-player simulation.
- `functions/_worker.js` manually dispatches API routes then falls through to `env.ASSETS.fetch(request)`.
- D1 migrations live in `migrations/`; P0 added the slot-aware saves migration. Treat migration order as production data history.
- Never put secrets in the repo. Cloudflare bindings/secrets are deployment configuration.

## 5) Data and simulation hygiene

- `src/data/` contains league/team/player data; use the existing CSV/reconciliation tooling rather than hand-editing generated league JS when a pipeline exists.
- Preserve licensing/provenance discipline. Do not copy protected game assets/data to close content gaps.
- P1 onward must be benchmarked for long-career IndexedDB growth, gameweek processing and mobile load time. A 15-season career must remain practical on a phone.
- Avoid full-world writes when only a bounded subset changed. P1 deliberately narrows cup persistence to participating clubs and league persistence to changed player rows.
- P2 established seeded/injectable RNG and statistical regression coverage. P3 development, decline, position conversion and reinjury randomness must extend that discipline rather than reintroducing unseeded balance paths.
- P3's player-model module must be pure/DOM-free and must not import `matchEngine.js`, IndexedDB or UI. Durable baseline ability remains the existing attack/midfield/defence/goalkeeping data; derived effective level must not be separately persisted.

## 6) Required skills / workflow

Use the repo skills under `.claude/skills/`:

- **delivery-loop** for implementation: Plan → Build → Code Review → Verify. A failed review or verification returns to Build.
- **plan-gate** before IndexedDB schema/lifecycle changes, event-queue changes, simulation maths, module ordering or data-pipeline changes.
- **scope-fence** to stop adjacent cleanup from silently expanding the task.
- **systematic-debugging** for broken behaviour: reproduce/root-cause before changing code; do not rerun failures until randomness turns green.
- **verification-before-completion** before any claim that work is done/fixed/passing. Fresh evidence on the latest pushed SHA is mandatory.
- **memory-hygiene** when changing this guide or another long-lived instruction source.

### Commit policy

- Commit by coherent delivery value, not by file count or arbitrary phase checklist steps.
- Do not intentionally commit or push a known-broken build, failing test scaffold or half-wired migration merely as a checkpoint.
- Failing tests are useful while developing locally; commit the slice when the related implementation is runnable and relevant verification is green.
- Keep code, tests and small supporting docs together when separating them would create artificial or broken commits.
- Push meaningful green slices so CI/Cloudflare provide an additional verification layer; a push is not a substitute for the delivery-loop Verify gate.

## 7) Definition of done for roadmap phases

A phase is not complete until, where applicable:

- old saves migrate or fail safely with an actionable recovery path;
- authoritative Quick Sim/Broadcast outcome boundaries are preserved;
- deterministic regression tests cover new domain rules;
- the affected 390px mobile journey is exercised, with wider responsive checks when the surface changed;
- rendered screenshots are inspected for new/restyled UI;
- storage/performance budgets have not materially regressed;
- this guide and the roadmap status are current;
- the PR explains shipped scope, migration impact, deferred scope and the next milestone;
- CI and the Cloudflare branch preview are green on the final pushed SHA.

### P0 completion baseline

P0's completion gate established the initial safety floor:

- deterministic P0 contract suites for competition rules/integration, save migration and UEFA finance;
- full Vitest suite;
- 186-club accent audit;
- Playwright mobile suite including multi-career switching/deletion and legacy-slot fallback;
- retained/inspected 390x844 Career Menu screenshot.

### P1 completion baseline

P1 extends that floor; do not weaken these regressions:

- deterministic world ledger, world competition, atomic projection, season-history/rollover and injury-cadence contracts;
- **128/128 Vitest tests** green on the implementation-complete SHA;
- **186/186 club accent checks** green;
- **17/17 Playwright tests** green, including the full 390×844 playable-app audit and the 1280×800 Barcelona / Borussia Dortmund / Ajax living-world inspection acceptance journey;
- retained/inspected **390×844 Competitions screenshot**;
- throttled P1 benchmark baseline: **12.33s career load, 18.50s authoritative 186-club world week, 2.76 MiB storage at 4× CPU throttle** on shared CI.

### P2 completion baseline

P2 adds the simulator-depth safety floor; do not weaken it to make P3 pass:

- seeded/serialisable RNG and exact whole-match vs segmented-Broadcast parity contracts;
- shared tactic/role schema, managed-match adapter, AI tactical profile/opposition insight and idempotent Manager DNA contracts;
- additive P2 save backfill preserving formation, mentality and lineup;
- **150/150 Vitest tests** green on `de7de8a8`;
- **186/186 club accent checks** green;
- **19/19 Playwright tests** green, including 390×844 and 1280×800 P2 acceptance journeys;
- retained/inspected P2 tactics and Team News screenshots;
- P1 performance regression still within guardrails at **12.57s / 18.93s / 2.61 MiB**;
- GitHub Actions and Cloudflare Workers successful on the same exact head SHA.

## 8) End-of-session handoff

Whenever code is committed/pushed:

- wait for CI on the final SHA before reporting completion;
- confirm the Cloudflare branch preview corresponds to the final SHA where a preview is expected;
- visually inspect changed UI rather than inferring it from source;
- report: what changed, verification/test counts, PR link, direct live preview link, next milestone, and any check that could not be completed.

**Next roadmap milestone after P2:** `P3 — Player Model 2.0`, starting with the canonical player contract/selectors and additive compatibility path in `docs/plan/post-r7-implementation-guides/p3-player-model-2.md`.
