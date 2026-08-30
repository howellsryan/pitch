# Pitch Contributor Guide

> Current, terse instructions for AI/human contributors. Update this guide in the same change when a load-bearing behaviour or programme status changes.

## 0) Current state — read first

- **Product:** free browser-first football career simulator, 9 leagues / 186 clubs, mobile-first, no forced account. It is **simulator-only**: do not add manual/on-pitch football controls. Broadcast is a watchable presentation of simulated football, not a playable match mode.
- **Live product:** `pitch-sim.com`. The app is built with Vite/Svelte 5 and deployed by **Cloudflare Workers Builds**, not GitHub Actions.
- **R0-R7 redesign is complete.** `docs/plan/07-redesign.md` remains the historical redesign reference. R8 quality/light-mode/PWA work remains a separate parallel quality stream.
- **Post-R7 programme:** `docs/plan/post-r7-career-depth-roadmap.md` is authoritative. **P0 — Football authenticity and career foundation is COMPLETE (30 Aug 2026). P1 — The Living Football World is NEXT.**
- Read the live roadmap before non-trivial work. If this guide and the roadmap disagree, fix this guide in the same change.

## 1) Load-bearing architecture

### Authoritative football outcome

- `src/modules/matchEngine.js` owns football outcomes.
- `src/game/broadcastSimulation.js` is a deterministic spatial/presentation layer. It may visualise an authoritative result/event plan but must never invent a conflicting score, scorer or result.
- Quick Sim and Broadcast must consume the same authoritative football outcome.

### Gameweek event queue

- `save.pendingEvents`, built/drained in `src/modules/gameweek.js`, is load-bearing.
- One advance action resolves one pending league/cup/European event.
- The gameweek advances only after the queue is empty.
- Cup/European opponents and event details are fixed when the event is built; do not bypass the queue with a second tournament path.

### Competition rules — P0 foundation

- `src/modules/competitionRules.js` is the shared source for competition format/round/schedule/entry/two-leg/UEFA qualification rules.
- `src/modules/cups.js`, `src/modules/gameweek.js` and `src/modules/season.js` consume that layer. Do not reintroduce scattered round-index magic or a second competition engine.
- P0 removed UEFA away-goals semantics.
- P0 models current UEFA 36-team league-phase routes: UCL/UEL 8 user league-phase fixtures, UECL 6; positions 1-8 direct R16, 9-24 knockout play-off, 25-36 eliminated; seeded placement drives relevant home-leg ordering.
- Full canonical world-wide UEFA participant/results simulation is P1 work, not a reason to fork P0's rule layer.

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

## 2) UI / product boundaries

- `src/lib/ui/` contains real Svelte 5 components mounted from `src/main.js`; avoid new screen-level `innerHTML` renderers.
- Entry/new-career UI lives in `EntryScreen.svelte`; saved-career selection lives in `CareerMenu.svelte`.
- `EntryScreen` remains mounted behind the game shell and is reused for P0 New Career. Busy/loading state must therefore be reset after successful transitions, not only on errors.
- Mobile navigation and the main game surfaces are already redesigned. Do not reopen R0-R7 visual decisions incidentally during gameplay-system work.
- Any new/restyled surface must be verified from an actual rendered screenshot at the affected viewport; CSS reading correctly is not visual verification.
- Preserve accessibility basics: 44px touch targets where applicable, focus-visible states, reduced-motion support, readable contrast, safe-area spacing.

## 3) Build, validation and deployment

Two build paths intentionally coexist:

```bash
npm run dev              # Vite dev server
npm run build            # legacy validation path + Vite app
npm run build:legacy     # src/build.py -> legacy bundle + validate_p0 bridge
npm run build:app        # Vite -> dist/
npm run test             # Vitest + UI emoji audit
npm run check:accents    # all 186 clubs
npm run test:e2e         # Playwright, mobile target 390x844
npm run lint             # ESLint + eslint-plugin-svelte
```

- Vite `dist/` is the deployed artifact.
- `src/build.py` remains because the legacy validator asserts against concatenated raw source. P0 routes that gate through `src/validate_p0.py`, which permits only an explicit allow-list of superseded pre-P0 assertions and requires deterministic replacement contracts. Do not interpret the legacy validator's allow-listed failure count as a green-by-itself result; the bridge must pass.
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
- Before major P2 simulation balancing, establish/extend deterministic or injectable RNG and statistical regression coverage. A green UI/build suite cannot prove goal rates or tactical balance are sane.

## 6) Required skills / workflow

Use the repo skills under `.claude/skills/`:

- **delivery-loop** for implementation: Plan → Build → Code Review → Verify. A failed review or verification returns to Build.
- **plan-gate** before IndexedDB schema/lifecycle changes, event-queue changes, simulation maths, module ordering or data-pipeline changes.
- **scope-fence** to stop adjacent cleanup from silently expanding the task.
- **systematic-debugging** for broken behaviour: reproduce/root-cause before changing code; do not rerun failures until randomness turns green.
- **verification-before-completion** before any claim that work is done/fixed/passing. Fresh evidence on the latest pushed SHA is mandatory.
- **memory-hygiene** when changing this guide or another long-lived instruction source.

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
- CI is green on the final pushed SHA.

### P0 completion baseline

P0's completion gate established the current safety floor:

- deterministic P0 contract suites for competition rules/integration, save migration and UEFA finance;
- full Vitest suite;
- 186-club accent audit;
- 15-test Playwright mobile suite including multi-career switching/deletion and legacy-slot fallback;
- retained/inspected 390x844 Career Menu screenshot.

Do not weaken those regressions to make later work pass.

## 8) End-of-session handoff

Whenever code is committed/pushed:

- wait for CI on the final SHA before reporting completion;
- confirm the Cloudflare branch preview corresponds to the final SHA where a preview is expected;
- visually inspect changed UI rather than inferring it from source;
- report: what changed, verification/test counts, PR link, direct live preview link, next milestone, and any check that could not be completed.

**Next roadmap milestone after P0:** `P1 — The Living Football World` in `docs/plan/post-r7-career-depth-roadmap.md`.