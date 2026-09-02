# Post-R7 Implementation Guides — P3 to P12

> Execution companion to ../post-r7-career-depth-roadmap.md. These files are implementation plans only; they contain no application code.

## Purpose

The strategic roadmap explains why the phases exist and their order. This guide set explains how a future agent should safely deliver each phase against the latest completed programme baseline.

The guides are deliberately separate so each phase can be revised, reviewed and implemented without turning the roadmap into a monolith.

## Authority and drift rule

Use sources in this order:

1. Live repository and latest agreed green phase baseline for factual implementation state.
2. AGENTS.md and CLAUDE.md for load-bearing architecture/workflow.
3. post-r7-career-depth-roadmap.md for product priority, scope and dependencies.
4. The relevant phase guide in this directory for the planned delivery route.

If live code contradicts a file/module claim in a guide, live code wins. Stop before editing, update the guide/plan with the verified seam, then continue. Do not quietly route around stale documentation.

## P2 baseline closed for these guides

P2 was closed on branch `roadmap/post-r7-career-depth` at `de7de8a8fbfaddf00979a64306450be99023740b` before P3 implementation began. The verified baseline includes:

- seeded and serialisable match RNG in `matchEngine.js`;
- one tactical instruction/role schema in `tactics.js`;
- shared managed-match adapters in `managerTactics.js`;
- AI tactical identities and opposition insight;
- Manager DNA derived from committed match choices/results;
- saved tactic/role/DNA backfill preserving formation, mentality and lineup;
- deterministic league/cup and Quick Sim/Broadcast parity work;
- 150/150 Vitest, 186/186 accent checks and 19/19 Playwright acceptance tests green;
- mobile and wide P2 rendered evidence inspected;
- GitHub Actions and Cloudflare Workers green on the same closeout SHA.

P3 should treat these contracts as the stable foundation. If a later rebase or merge changes them, re-run the handoff gate before continuing.

## P2 → P3 handoff gate

**Satisfied on 31 August 2026 for the current programme branch.** P3 may proceed while these invariants remain true:

- P2 is merged or otherwise the agreed phase baseline;
- the roadmap and contributor guides reflect the real P2 status;
- Quick Sim and Broadcast use one authoritative outcome and managed-input contract;
- seeded statistical baselines are green;
- P2 save migration/backfill is proven on old careers;
- P2 mobile and wider affected journeys were rendered and inspected;
- CI and the Cloudflare preview are green on the same final SHA.

If any invariant regresses later, close the regression before building P3 on top of it.

## P3 baseline closed for P4

P3 was closed on branch `roadmap/post-r7-career-depth` on 1 September 2026. The verified baseline adds:

- one additive v4 player contract and shared baseline/effective-level selectors in `playerModel.js`;
- pure pathway, seeded development and rehabilitation modules shared by user and AI players;
- idempotent roles/promises, position suitability, traits, potential ranges and weekly player-state settlement;
- canonical selectors in match selection, transfer valuation, Squad and Academy, with exact XI/bench ordering locked by regression tests;
- bounded P3 world-week persistence: completed background clubs settle during league/competition projection, ordinary final P3 settlement reads only the managed squad, and league-less/cup-only weeks retain the full-world P3 fallback;
- 242/242 Vitest, 186/186 accent checks and 21/21 Playwright tests green;
- mobile/wide P3 player-detail evidence inspected;
- the unchanged P1 performance guards green at 13.108s load, 7.301s world week and 3.41 MiB storage at 4× CPU throttle;
- GitHub Actions and Cloudflare Workers green on the final promoted roadmap SHA.

P4 consumed these contracts rather than rebuilding a transfer-only rating, role or player-interest model; P5 then expanded its shared squad-needs service.

## Guide index

| Phase | Guide | Depends on | Main result |
|---:|---|---|---|
| P3 ✅ | [Player Model 2.0](p3-player-model-2.md) | P1, P2 | One coherent durable/effective player state |
| P4 ✅ | [Transfer Market and Contracts 2.0](p4-transfer-market-and-contracts-2.md) | P3 | Persisted staged deals and need-led AI recruitment |
| P5 ✅ | [Scouting, Coaching, Training and Squad Planning](p5-scouting-coaching-training.md) | P3, P4 | Uncertain knowledge and one shared squad planner |
| P6 — NEXT | [Manager Career and Living Manager Market](p6-manager-career-and-market.md) | P1–P5 | Manager entities and club movement in one world |
| P7 | [Club Identity, Finance, Board and Facilities](p7-club-finance-board-facilities.md) | P4–P6 | Persistent club identity and lightweight economy |
| P8 | [Story Engine, Press, Fans and Rivalries](p8-story-press-fans-rivalries.md) | P3, P6, P7 | Deterministic decisions from real state |
| P9 | [Academy, Loans and Development Pathways 2.0](p9-academy-loans-pathways-2.md) | P1, P3–P5 | Canonical prospects and evidence-based loans |
| P10 | [Career Setup, Difficulty and Simulation Controls](p10-career-settings-controls.md) | Cross-cutting | Explicit settings and fair presets |
| P11 | [Creator Challenges and Live Starts](p11-creator-challenges-live-starts.md) | P0–P10 | Safe local scenario creation/sharing |
| P12 | [Long-term Content Expansion](p12-long-term-content-expansion.md) | Systemic depth | Second-tier packs before wider breadth |

## Programme dependency rules

- P3 centralises player selectors; P4/P5 must consume them for dynamic ability and suitability.
- P4 owns the first squad-needs service; P5 expands it rather than replacing it.
- P6 must solve transfer of controlled-club competition state before mid-season job movement.
- P7 sends dismissal consequences to P6; it never creates a second manager/job system.
- P8 uses P3/P4/P6/P7 domain commands; it never edits save objects from Inbox choices.
- P9 migrates youth into canonical players and uses P4 agreements/P5 reports.
- P10 can land its settings contract early, but each control ships with its subsystem adapter and default-equivalence test.
- P11 uses allow-listed commands/settings and a normal isolated career factory; it never imports raw IndexedDB state.
- P12 adds one generic content/tier foundation and one country pack at a time.
- R8 accessibility/PWA/device quality remains a parallel quality stream and cannot be regressed.

## Shared architecture guardrails

### Authoritative football

- `matchEngine.js` owns results.
- Broadcast presents the authoritative event stream.
- Background fixtures use the fast authoritative engine.
- No later phase may create a second result engine.

### World and event lifecycle

- P1 canonical records project standings/player history once.
- `save.pendingEvents` remains the football queue.
- A world week settles only after that queue is empty.
- Weekly systems such as player state, market, managers, finance, stories and pathways advance once at the completed world-week boundary.

### Persistence

- IndexedDB access stays in `db.js`.
- Add fields to existing rows through idempotent, versioned domain backfills where possible.
- Increment `DB_VERSION` only for an approved store/index change, and upgrade existing stores in place.
- Update `STORE_NAMES` and import/export/cloud coverage whenever a store is added.
- Use the ordered save-envelope migrator when import semantics become incompatible.
- Never make a full-world write part of an ordinary screen load.
- Persist durable state; derive ratings, fit, explanations, projections and labels.

### State machines and commands

Use explicit legal transitions and idempotency for:

- P3 rehabilitation/promises;
- P4 deals/contracts;
- P6 vacancies/appointments;
- P7 board reviews/upgrades/obligations;
- P8 event instances/effects;
- P9 status/loan agreements;
- P10 queued setting changes;
- P11 challenge creation/completion.

UI is a projection/action surface. It is never the source of lifecycle state.

### Simulator-only fence

Never add:

- controller/manual on-pitch play;
- playable training or set pieces;
- Player Career gameplay;
- cinematic work with no management consequence;
- result scripting for difficulty, stories or challenges.

The P5 tactical lab and P9 academy matches are fast simulated reports, not playable modes.

## Required phase kickoff

Before the first implementation edit:

1. Start from the latest agreed green phase baseline. Prefer a dedicated branch/PR; continuing an existing programme PR is acceptable when explicitly chosen.
2. Read AGENTS.md, CLAUDE.md, the strategic roadmap and the phase guide.
3. Re-verify every file/module named in the guide.
4. Run the repository plan-gate and record:
   - goal;
   - unknowns and how each will be verified;
   - touched modules/UI;
   - success criteria;
   - explicit out-of-scope items.
5. Characterise current behaviour with deterministic tests before changing schemas/maths/lifecycles.
6. Keep every pushed commit runnable and playable.

If reality changes a locked decision, stop and re-plan. Do not silently improvise a new architecture halfway through a phase.

## Commit policy

Commit by coherent delivery value, not by file count or by blindly mirroring the work-package list.

- Failing tests may exist while developing locally, but do not intentionally commit/push a known-red checkpoint.
- A commit should contain a meaningful behaviour/contract slice plus the tests/supporting documentation needed to make that slice reviewable.
- Separate persistence, domain, UI or migration work when each is independently useful and green; keep them together when splitting would create artificial or broken history.
- Push after a meaningful green slice so CI and Cloudflare can verify the exact commit.
- If CI exposes a problem that local/reasoned verification missed, fix it before beginning the next delivery slice.

## Standard implementation shape

Each phase should normally progress through these concerns, without requiring one commit per line:

1. Contract and deterministic characterisation/tests.
2. Persistence/backfill/adapters.
3. Pure domain behaviour.
4. Weekly/season lifecycle integration.
5. Cross-system consumers.
6. Svelte product surface.
7. Compatibility adapter removal.
8. Balance/performance/manual-browser/documentation closeout.

The phase guide may refine this order. Do not combine a later roadmap phase merely because adjacent code is visible.

## Standard verification floor

Run fresh on the final implementation SHA:

- `npm run build`
- `npm run lint`
- `npm run test`
- `npm run check:accents`

There is no `test:e2e` — the Playwright/E2E suite was removed and must not be
reintroduced. Browser behaviour is verified by driving the running app yourself.

Also require:

- new deterministic domain tests, as Vitest specs beside the code they cover;
- old-save and export/import/cloud coverage for persistent changes;
- Quick Sim/Broadcast parity when player/tactic/match inputs change;
- the affected 390×844 journey, exercised by hand;
- a wider responsive journey for dense content;
- rendered screenshot inspection for every new/restyled surface;
- console-error check after driving the real flow;
- P1 world-week/load/storage regression benchmarks;
- a multi-season distribution/solvency/population test where balance changes;
- CI and Cloudflare preview on the same final pushed SHA.

A green build alone does not prove balance, migration, rendering or lifecycle safety.

## Performance and retention floor

The P1 shared-runner baseline was:

- 12.33s fresh 186-club career load at 4× CPU throttle;
- 18.50s authoritative full-world week at 4× CPU throttle;
- 2.76 MiB storage after a fresh career plus world week.

P2 closeout remained inside the guardrails at 12.57s / 18.93s / 2.61 MiB. P3 closeout passed at 13.108s / 7.301s / 3.41 MiB after removing a duplicate full-world final scan. The existing conservative CI ceilings remain regression guards, not targets. When a later phase regresses them:

1. inspect full-world scans/writes;
2. bound retained detail;
3. batch/compact at the canonical lifecycle boundary;
4. measure again;
5. only reconsider a ceiling with a documented product decision.

Every phase that adds persistent history must sample a 15-season mobile career.

## Documentation closeout

Before marking a phase complete:

- update the strategic roadmap status and shipped/evidence section;
- update AGENTS.md and CLAUDE.md only for load-bearing responsibilities/status;
- update the relevant guide if implementation changed a locked seam;
- document migration impact and deferred scope in the PR;
- name the next phase/work package;
- report the PR and direct branch preview;
- state exactly what was and was not verified.

Do not turn AGENTS.md/CLAUDE.md into changelogs. Durable architecture and constraints belong there; phase execution detail stays in this directory.
