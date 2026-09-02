# Pitch Contributor Guide

> Current, terse instructions for AI/human contributors. Update this guide in the same change when a load-bearing behaviour or programme status changes.

## 0) Current state — read first

- **Product:** free browser-first football career simulator, 9 leagues / 186 clubs, mobile-first, no forced account. It is **simulator-only**: do not add manual/on-pitch football controls. Broadcast is a watchable presentation of simulated football, not a playable match mode.
- **Live product:** `pitch-sim.com`. The app is built with Vite/Svelte 5 and deployed by **Cloudflare Workers Builds**, not GitHub Actions.
- **R0-R7 redesign is complete.** `docs/plan/07-redesign.md` remains the historical redesign reference. R8 quality/light-mode/PWA work remains a separate parallel quality stream.
- **Post-R7 programme:** `docs/plan/post-r7-career-depth-roadmap.md` is authoritative. **P0 — Football authenticity and career foundation is COMPLETE (30 Aug 2026). P1 — The Living Football World is COMPLETE (31 Aug 2026). P2 — Match Engine 2.0, Tactics and Manager DNA is COMPLETE (31 Aug 2026). P3 — Player Model 2.0 is COMPLETE (1 Sep 2026). P4 — Transfer Market and Contracts 2.0 is COMPLETE (1 Sep 2026). P5 — Scouting, Coaching, Training and Squad Planning is COMPLETE (1 Sep 2026). P6 — Manager Career and Club Movement is NEXT.**
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

### Player Model 2.0 — P3 foundation

- `src/modules/playerModel.js` owns the additive v4 player contract and shared baseline/effective-level selectors. Durable ability remains attack/midfield/defence/goalkeeping; effective level is derived and must not be persisted as a competing rating.
- `src/modules/playerPathways.js`, `playerDevelopment.js` and `playerRehabilitation.js` own position suitability/traits, seeded growth profiles and the explicit injury-return state machine. They are pure, DOM/DB-free dependencies loaded immediately before `playerModel.js` in the legacy bundle.
- Match selection, transfers, Squad and Academy consume the canonical selectors. Preserve exact XI/bench ordering when optimising hot rating paths; caches must be scoped to the player object/snapshot because world projection creates same-ID copies at different lifecycle states.
- P3 personal state and development settle once per completed world week. League projection settles completed background clubs, competition projection settles deferred cup/European clubs, and ordinary final P3 settlement loads only the managed squad. League-less/cup-only weeks retain the full-world P3 fallback.
- Existing careers receive an idempotent player-row/domain backfill without a `DB_VERSION` change, preserving baseline ability, IDs, ownership, loans, history, formation and lineup.

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
- Background simulation/persistence is performance-sensitive. The budgets are **<20s fresh-career load, <25s full world week, <50 MiB storage** at a 4× CPU throttle. The browser benchmark that used to assert them (`tests/p1-living-world-performance.spec.mjs`) was deleted with the E2E suite, so **these are now design constraints with no automated guard**: when you touch world simulation, persistence or a per-gameweek loop, reason about the cost explicitly and measure by hand in the running app before claiming it is fine. Historical baselines for reference: P1 12.33s / 18.50s / 2.76 MiB, P2 12.57s / 18.93s / 2.61 MiB, P3 13.108s / 7.301s / 3.41 MiB.

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
- P3 uses additive, idempotent player-row/domain backfills and does not increment `DB_VERSION` merely to add fields to existing rows. Preserve that pattern for compatible player-contract extensions.
- P6 (in progress) added a dedicated `managers` IndexedDB store (`DB_VERSION` 3→4, keyPath `id`, indexed `by_club`) via `src/modules/managers.js`. `save.js`'s `ensureP6Managers`/`buildManagersBackfill` give every club exactly one manager entity (the user's own manager, or a deterministically generated AI manager keyed by club ID) idempotently, gated by `save.managerModelVersion`; `save.managerName`/`save.managerDNA` remain as compatibility fields, not the source of truth. The bounded `save.managerMarket` (vacancies, review checkpoints, processed week keys) is the one save-owned manager-market structure per the phase guide — extend it rather than adding a second manager/job-market persistence path as later P6 work packages (appointments, control handover) land. `src/modules/managerCareer.js`/`p6Runtime.js` accrue league-only match records and run a bounded in-season review checkpoint (every `MANAGER_REVIEW_INTERVAL_GWS` world weeks) from the same safe boundary `p5Runtime.js`/`transfers.js` tick from in `gameweek.js`; a vacated AI role (dismissed, resigned or retired — `shouldRetire`/`shouldResign` are small seeded rolls, never per-match) is immediately handed to a caretaker, with `team.managerId` repointed at them the same tick, so no club is ever managerless. The user's own manager is only ever scored there (reputation/warning), never auto-vacated — real user job movement is deferred to WP5/WP6. `src/modules/managerAppointments.js` is the one shared appointment state machine (candidates -> offer -> accepted/declined -> completed) that both AI and (later) user hires must go through; `p6Runtime.js`'s `resolveOpenVacancies` drives it for AI every week with same-tick candidate reservations so two vacancies can never be awarded the same manager, and logs each resolution into the capped `managerMarket.recentAppointments`. Manager rows persisted before the `age` field existed fall back to `managers.js`'s `DEFAULT_MANAGER_AGE` rather than reading as age 0. `src/modules/managerUserJourney.js` is the user's own resignation/approach/application flow, reusing `managerAppointments.js`'s state machine (including its `isVacancyAvailableForNewCandidate` predicate, stricter than `isVacancyOpen`: excludes a vacancy already `offer_extended` for someone else) — it enforces the same empty-`pendingEvents` safe boundary as every other P6 control change, but deliberately stops at `save.managerMarket.pendingUserHandover` rather than touching `save.userTeamId`. It is not yet reachable from any UI action or runtime tick; WP7 wires it up now that WP6's atomic club-control handover exists.

**WP6 — the competition control-transfer adapter and atomic club handover.** `save.cups[cupId]` (the controlled club's own single-perspective progress, with synthetic UEFA opponents) and `save.worldCompetitions.competitions[cupId]` (every other club's real progress) are genuinely different shapes — a full unification was judged higher-risk than a bounded, explicit projection, so `src/modules/managerCompetitionHandoff.js` is that projection, not a merge. `swapClubCompetitionControl` is the one orchestrator: it resolves any pending tie the arriving club is mid-way through via a coin-flip walkover *before* projecting their footprint (so their fresh `save.cups` entry reflects the resolved outcome, never a stale mid-tie state with no real leg-1 score), removes them from world tracking (never touch `activeTeamIds` after this — the background engine must never simulate a second result for a now-user-controlled club, P2's authoritative-outcome boundary), and splices the departing club's own `save.cups` progress back into the world. `src/modules/managerClubHandover.js`'s `transferClubControl` is the one place `save.userTeamId` may change: it requires the same empty-`pendingEvents` safe boundary as every other P6 control change, requires an already-completed vacancy offer for the user's manager (from `managerUserJourney.js`'s `acceptUserOffer`), rebuilds `pendingEvents` via `gameweek.js`'s own `buildPendingEvents`, resets squad-specific state (lineup/playerRoles/scouting) while preserving the manager's own tactics/formation/DNA, reattaches a fresh board objective/job security, and is idempotent (a retried call once `userTeamId` already matches is a no-op). `managerAppointments.js`'s `applyHireOutcome` is shared between WP4's AI hiring and this user handover so both apply the identical caretaker-confirm/displace rule. Known, disclosed limitations rather than oversights: full match-by-match cup history doesn't survive the shape boundary; a UEFA league-phase transfer mid-season shifts future round-robin pairings for other clubs (`activeTeamIds` mutation); a returning club's historical league-phase stats aren't recoverable once they've moved past that phase. Not yet reachable from any UI action — WP7 wires the Resign/Apply/Accept flow that actually calls this.

Legacy-bundler note for any future P6/P7 module: `src/build.py`'s `strip_modules` only rewrites `export function`/`export const`/`export {...}`, not `export class` (use a plain `Error` factory instead — see `managerUserJourney.js`), and every top-level `const`/`function` name must be unique **across the whole bundle**, not just within its own file, since the legacy build concatenates every module into one flat script scope (two unrelated modules independently declaring `const MAX_X = 40` will collide) — verified by actually grepping `.build/bundle_final.js` for the functions you added, not just trusting a green `npm run build`.

## 2) UI / product boundaries

- `src/lib/ui/` contains real Svelte 5 components mounted from `src/main.js`; avoid new screen-level `innerHTML` renderers.
- Entry/new-career UI lives in `EntryScreen.svelte`; saved-career selection lives in `CareerMenu.svelte`; living-world table/profile inspection lives in `LeagueScreen.svelte`.
- `EntryScreen` remains mounted behind the game shell and is reused for P0 New Career. Busy/loading state must therefore be reset after successful transitions, not only on errors.
- Mobile navigation and the main game surfaces are already redesigned. Do not reopen R0-R7 visual decisions incidentally during gameplay-system work.
- Any new/restyled surface must be verified from an actual rendered screenshot at the affected viewport; CSS reading correctly is not visual verification.
- Preserve accessibility basics: 44px touch targets where applicable, focus-visible states, reduced-motion support, readable contrast, safe-area spacing.
- P3 player state enriches existing Squad/Market/Academy surfaces rather than creating permanent dashboard clutter.

## 3) Build, validation and deployment

Two build paths intentionally coexist:

```bash
npm run dev              # Vite dev server
npm run build            # legacy validation path + Vite app
npm run build:legacy     # src/build.py -> legacy bundle + validate_p0 bridge
npm run build:app        # Vite -> dist/
npm run test             # Vitest + UI emoji audit
npm run check:accents    # all 186 clubs
npm run lint             # ESLint + eslint-plugin-svelte
```

**There is no end-to-end/browser test suite, and one must not be added.** The
Playwright suite, its config and its opt-in workflow were deliberately deleted:
they cost more to run and maintain than they caught. Do not add `@playwright/test`,
a `test:e2e` script, a `tests/` spec directory, Puppeteer, Cypress, `vitest
--browser`, or a CI job that drives a real browser. If a change needs proof it
works in the browser, open the app and look at it — see §7's visual rule.

- Vite `dist/` is the deployed artifact.
- `src/build.py` remains because the legacy validator asserts against concatenated raw source. P0+ route that gate through `src/validate_p0.py`, which permits only an explicit allow-list of superseded source-shape assertions and requires deterministic replacement contracts. Do not interpret the legacy validator's allow-listed failure count as a green-by-itself result; the bridge must pass.
- CI (`.github/workflows/deploy.yml`) **does not deploy**. Its per-commit gate runs both builds, lint, Vitest and the accent audit — that is the whole gate; there is no browser job to add to it. Cloudflare's Git integration owns production and branch previews.
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
- P2 established seeded/injectable RNG and statistical regression coverage; P3 extends it through development, decline, position conversion and reinjury. Later balance paths must not reintroduce unseeded randomness.
- P3's player-model modules are pure/DOM-free and must not import `matchEngine.js`, IndexedDB or UI. Durable baseline ability remains the existing attack/midfield/defence/goalkeeping data; derived effective level must not be separately persisted.

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

The P0-P4 baselines below are a historical record of what each phase actually
shipped against. Where one cites a Playwright/browser count, that is history:
the suite has since been deleted and those bullets are retired, not targets to
reproduce. Every other bullet still stands.

A phase is not complete until, where applicable:

- old saves migrate or fail safely with an actionable recovery path;
- authoritative Quick Sim/Broadcast outcome boundaries are preserved;
- deterministic regression tests cover new domain rules — as Vitest unit/contract tests over `src/modules/` and `src/game/`, never as browser specs;
- the affected 390px mobile journey is exercised by hand in a running app, with wider responsive checks when the surface changed;
- rendered screenshots are inspected for new/restyled UI;
- storage/performance budgets have not materially regressed (reasoned about and, for simulation/persistence work, measured by hand — there is no automated benchmark any more);
- this guide and the roadmap status are current;
- the PR explains shipped scope, migration impact, deferred scope and the next milestone;
- CI and the Cloudflare branch preview are green on the final pushed SHA.

### P0 completion baseline

P0's completion gate established the initial safety floor:

- deterministic P0 contract suites for competition rules/integration, save migration and UEFA finance;
- full Vitest suite;
- 186-club accent audit;
- retained/inspected 390x844 Career Menu screenshot.

### P1 completion baseline

P1 extends that floor; do not weaken these regressions:

- deterministic world ledger, world competition, atomic projection, season-history/rollover and injury-cadence contracts;
- **128/128 Vitest tests** green on the implementation-complete SHA;
- **186/186 club accent checks** green;
- retained/inspected **390×844 Competitions screenshot**;
- throttled P1 benchmark baseline: **12.33s career load, 18.50s authoritative 186-club world week, 2.76 MiB storage at 4× CPU throttle** on shared CI.

### P2 completion baseline

P2 adds the simulator-depth safety floor; do not weaken it to make P3 pass:

- seeded/serialisable RNG and exact whole-match vs segmented-Broadcast parity contracts;
- shared tactic/role schema, managed-match adapter, AI tactical profile/opposition insight and idempotent Manager DNA contracts;
- additive P2 save backfill preserving formation, mentality and lineup;
- **150/150 Vitest tests** green on `de7de8a8`;
- **186/186 club accent checks** green;
- retained/inspected P2 tactics and Team News screenshots;
- P1 performance regression still within guardrails at **12.57s / 18.93s / 2.61 MiB**;
- GitHub Actions and Cloudflare Workers successful on the same exact head SHA.

### P3 completion baseline

P3 adds the player-state safety floor; do not fork these contracts in P4/P5:

- additive player-model v4 backfill plus canonical baseline/effective-level, potential-range, position/trait, role/promise and rehabilitation contracts;
- idempotent weekly personal-state/development settlement coalesced into bounded league/competition projection writes;
- match selection and transfer valuation consume the shared selector, with regression coverage preserving the previous XI/bench ordering exactly;
- **242/242 Vitest tests** green across 41 files, plus the UI emoji audit;
- **186/186 club accent checks** green;
- throttled P1 regression at **13.108s career load, 7.301s authoritative world week and 3.41 MiB storage**, inside the unchanged ceilings;
- GitHub Actions and Cloudflare Workers successful on the final promoted roadmap SHA.

## 8) End-of-session handoff

Whenever code is committed/pushed:

- wait for CI on the final SHA before reporting completion;
- confirm the Cloudflare branch preview corresponds to the final SHA where a preview is expected;
- visually inspect changed UI rather than inferring it from source;
- report: what changed, verification/test counts, PR link, direct live preview link, next milestone, and any check that could not be completed.

### P4 completion baseline

- bounded/versioned `save.transferMarket` with additive legacy-offer migration and immutable completed history;
- deterministic legal transitions, typed fee/loan/contract terms, transparent interest reasons and rival/hijack outcomes;
- need-first AI recruitment through the shared minimal squad-planning service;
- exactly one idempotent market tick per completed world week plus unique deadline-hour ticks;
- atomic settlement across save, teams, players and transfers, including retry keys, exchange and loan-back execution;
- persisted Deals/Market/Loans/Contracts/history UI with no modal-owned negotiation state;
- **257/257 Vitest tests** green across 44 files, plus the UI emoji audit and legacy replacement contracts.

### P5 completion baseline

- pure `scouting.js` / `coaching.js` / `training.js` / `squadPlanning.js` domain layer with a bounded, versioned `save.scouting` and per-club coaching departments;
- one idempotent P5 settlement per completed world week, keyed so a reload cannot double-apply it;
- a dedicated scout returns an exact report after one completed gameweek and that certainty is scoped to the season it was gathered in — last season's scouts and reports are retired, never carried forward;
- reports store observations against canonical player ids only; they never copy or mutate authoritative attributes or potential.

**Next roadmap milestone after P5:** `P6 — Manager Career and Club Movement`, building on P5's scouting/coaching state rather than replacing it.

### Testing policy (supersedes any earlier phase wording)

Verification is Vitest contracts plus hands-on inspection of the running app.
There is no browser/E2E suite and none is to be introduced — see §3.
