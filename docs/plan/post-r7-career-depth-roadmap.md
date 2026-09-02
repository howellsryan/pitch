# Post-R7 Career Depth Roadmap

> Strategic continuation after the R0-R7 redesign. This roadmap targets a **free, browser-first football career simulator** with FIFA/EA SPORTS FC Career Mode accessibility and ambition, while remaining **simulator-only**: there is no manual on-pitch football gameplay.

**Baseline:** `main` after PR #14 (`767b31656d58f00acc42431cc3bca6df131b1b5b`) — R0-R7 shipped.

**Programme status:** **P0 complete (30 August 2026). P1 — The Living Football World complete (31 August 2026). P2 — Match Engine 2.0, Tactics and Manager DNA complete (31 August 2026). P3 — Player Model 2.0 complete (1 September 2026). P4 — Transfer Market and Contracts 2.0 complete (1 September 2026). P5 — Scouting, Coaching, Training and Squad Planning complete (1 September 2026). P6 — Manager Career and Club Movement is next.**

**Verification note:** the Playwright/E2E suite referenced by earlier phase gates
in this document has been removed from the repository. Those browser-suite
requirements are retired; verification is Vitest contracts, the legacy validator
bridge, lint, the accent/emoji audits and hands-on inspection of the running app.
Do not reintroduce a browser test suite.

**Benchmark reviewed:** EA SPORTS FC 27 Manager Career (Career Deep Dive, July 2026), with relevant Manager Market ideas carried forward from FC 26. This is not a parity checklist. Pitch should take the parts that create meaningful management decisions and, where a browser simulator has an advantage, go deeper systemically rather than imitate AAA presentation.

**Existing roadmap:** `ROADMAP.md` remains the historical/operational tracker for the gameplay-depth work already shipped (European ties, wages, contracts, board/job security, morale, academy investment, cloud save setup, etc.). This document is the strategic post-R7 continuation and folds the remaining old items into a dependency-aware programme.

---

## 1. Product direction

Pitch should become a **living football career**, not a collection of disconnected screens.

The strongest version of the game is:

- FIFA/EA SPORTS FC Career Mode-like in accessibility, pace and recognisable career loops;
- deeper than FIFA where simulation, history, tactics and consequences can be represented cheaply in data;
- much lighter than Football Manager in administration and UI burden;
- mobile-first and fast enough to play comfortably in a browser;
- fully usable without manually controlling footballers;
- capable of producing long-running careers whose stories emerge from the simulation rather than scripted linear content.

### Core rule: systems must feed systems

Every major new system should affect at least one other major system.

Examples:

- form affects match performance, morale, development, value and transfer interest;
- tactics affect results, fitness, recruitment fit and manager reputation;
- playing time affects morale, current level, contract behaviour and transfer requests;
- world results affect jobs, transfers, finances, stories and club reputation;
- scouting affects transfer risk rather than merely revealing decorative information;
- manager movement changes club tactics and therefore changes recruitment behaviour.

If an important number exists only to be displayed in the UI, it is probably not deep enough.

---

## 2. Simulator-only scope fence

Pitch does **not** want manual/live football play.

Do not roadmap:

- controller-based movement, shooting, passing or defending;
- playable set pieces;
- 11v11 manual training matches;
- skill games;
- Player Career gameplay;
- manual-match gameplay sliders whose only purpose is controller feel;
- cinematic features that do not change a management decision.

When FC introduces a manual-play feature that solves a useful management problem, translate the **purpose**, not the implementation. For example, FC's Practice Arena can inspire a simulated tactical scrimmage/report, not a playable training match.

The existing Broadcast match view remains a **watchable simulation/presentation layer**. It should become more causally faithful to the authoritative result engine, but it must not become manual football.

---

## 3. Post-R7 baseline: what Pitch already has

R0-R7 now provide a strong product shell and a meaningful career foundation:

- marketing entry, club selection and Continue/New Career flow;
- mobile-first navigation and responsive surfaces;
- Home season spine;
- combined Squad/Tactics surface;
- watchable Broadcast match presentation plus Quick Sim;
- dense Market and Table;
- Academy, Trophies, Settings and Inbox;
- 9 leagues / 186 clubs;
- English four-tier promotion/relegation and play-offs;
- domestic cups plus Champions League, Europa League and Conference League concepts;
- multi-season aging, retirement, player development and potential;
- injuries, fitness and form;
- 14 formation presets plus mentality controls;
- transfers, loans, inbound offers, AI-to-AI transfers and free agents;
- wages and contracts;
- board objectives and job security;
- stored team morale with gameplay effect;
- academy investment;
- trophy/honours history;
- local save/export/import and cloud-save infrastructure.

This is enough foundation to stop prioritising screen creation. The next programme should primarily add **simulation depth and interconnection**.

---

## 4. Correctness issues found during the final audit

These should be treated as roadmap input, not silently carried forward.

### 4.1 UEFA away-goals rule is obsolete

The existing European tie implementation/documentation uses an away-goals tiebreak. UEFA abolished the away-goals rule from the 2021/22 season. A level aggregate should proceed according to the current competition rules, without giving away goals extra value.

Reference: <https://www.uefa.com/news-media/news/026a-1298aeb73a7a-5b64cb68d920-1000--abolition-of-the-away-goals-rule-in-all-uefa-club-competi/>

### 4.2 UEFA league-phase formats need modernisation

Current UEFA club competitions use a 36-team league phase:

- Champions League: 8 league-phase matches;
- Europa League: 8 league-phase matches;
- Conference League: 6 league-phase matches;
- positions 1-8 advance directly to the round of 16;
- positions 9-24 enter two-legged knockout-phase play-offs;
- positions 25-36 are eliminated;
- later knockout placement is shaped by league-phase ranking/seeding.

Reference: <https://www.uefa.com/uefachampionsleague/accesslist/>

Pitch's European competition model should be data-driven enough that rule changes are not scattered through unrelated match/cup code.

### 4.3 Formation count is not the tactics gap

`matchEngine.js` already defines 14 formation presets. The gap is **tactical causality**: role instructions, pressing/build-up choices, tactical matchups, AI tactical identity and those choices materially changing simulation outcomes.

---

## 5. Gap matrix against the modern FC Career benchmark

| Area | Post-R7 Pitch | Strategic gap |
|---|---|---|
| Competition rules | P0 data-driven rule layer + current UEFA paths shipped | Foundation complete; future seasonal breadth remains |
| World simulation | P1 authoritative 9-league living world shipped | Foundation complete; later systems consume it |
| Historical world data | P1 current ledgers + compact player/club/competition season summaries shipped | Foundation complete; later systems enrich it |
| Formations | 14 presets | Low |
| Tactical instructions/roles | P2 shared team-instruction and player-role schema shipped | Foundation complete; future role/content tuning remains |
| Match-engine tactical causality | P2 bounded tactical trade-offs with seeded regression coverage shipped | Foundation complete; ongoing balance tuning remains |
| Player development | P3 seeded growth profiles and weekly canonical development shipped | Foundation complete; P9 deepens pathways |
| Dynamic current ability | P3 shared derived effective level shipped | Foundation complete; tune through regressions |
| Individual morale | P3 per-player morale/promise state shipped | Foundation complete; P8 adds narrative consequences |
| Squad roles / promises | P3 explicit roles and rolling playing-time agreements shipped | Foundation complete; P4 consumes them |
| Multiple positions | P3 suitability map, traits and conversion pathway shipped | Foundation complete; content tuning remains |
| Career growth profiles | P3 early/normal/late/extended/rapid profiles shipped | Foundation complete; population tuning remains |
| Injuries | Good catalogue/risk foundation | Medium |
| Return fitness / reinjury | P3 rehabilitation, medical availability and seeded reinjury shipped | Foundation complete |
| Transfers | Good basic market, values, negotiations and AI activity | Medium/high |
| Staged negotiations | Missing | High |
| Clauses / installments | Mostly missing | High |
| Player interest | Reputation-driven more than player-choice-driven | High |
| AI recruitment philosophy | Primarily rating/budget/squad logic | **Critical** |
| Club relationships/rivalries | Missing mechanically | Medium/high |
| Scouting | Market knowledge is too immediate/omniscient | **Critical** |
| Coaches/staff | Essentially absent | High |
| Training/development plans | Missing | High |
| Academy | Good intake/investment base | Medium |
| Loan development | Too shallow | High |
| Board/job security | Strong foundation | Low/medium |
| Manager career movement | Planned historically, not yet a full career market | **Critical** |
| AI managers | Missing | **Critical** |
| Club economy | Budgets/wages/prize money, limited operating model | High |
| Events/narratives | Inbox is informative rather than decision-driven | High |
| Press/fan pressure | Minimal | Medium/high |
| Career challenge creation | Missing | High replayability opportunity |
| Career save slots | P0 isolated local slots + versioned cloud slot contract shipped | Foundation complete |
| Simulation settings | Limited configurability | Medium |
| Content breadth | Strong 9-league base; non-English second tiers thin/missing | Medium |
| International management | Missing | Later breadth |
| Create-a-Club | Missing | Later breadth |

---

## 5.1 Delivery contract for future agents

**P0-P5 are implemented and verified. P6-P12 remain programme phases**, not instructions to implement an entire phase in one pull request. Each remaining phase below has a high-level delivery route and suggested delivery slices so a later agent can pick it up without reopening the main product and architecture decisions.

**Detailed execution guides:** [P3–P12 implementation guide index](post-r7-implementation-guides/README.md). Use the roadmap for priority and scope, then the phase guide for contracts, migration, work packages, verification and commit boundaries.

### Phase packaging

- Start each phase from the latest agreed green baseline. Prefer a dedicated branch/PR, but an existing programme PR may continue when that is the explicit delivery path.
- Treat each numbered work package as independently reviewable. Do not mix a later roadmap phase into the current phase merely because adjacent code is visible.
- Before changing IndexedDB, the event queue, simulation maths, module ordering or the data pipeline, run the repository's `plan-gate` process and record the affected invariants in the pull request.
- Reconcile `AGENTS.md` with the live plan at phase kickoff if its status is stale; do not create a second competing architecture guide.
- Keep every pushed commit runnable and every completed work package playable. Temporary adapters are acceptable only when they preserve existing saves and both Quick Sim and Broadcast flows.

### Commit and push cadence

Commit by **coherent delivery value**, not by file or by an arbitrary checklist checkpoint.

- A commit should represent a meaningful, reviewable behaviour/contract slice that is ready to keep.
- Do not intentionally commit or push a known-broken build, failing test scaffold or half-wired migration merely to create a checkpoint.
- It is fine to write failing tests while developing locally; make the commit only after the implementation slice is runnable and its relevant verification is green.
- Keep related code, tests and small supporting documentation together when separating them would create artificial or broken commits.
- Split persistence, simulation, UI or migration work when they are independently valuable and independently green—not simply because they touch different files.
- Push after a meaningful green slice so CI and the preview can provide another verification layer.

Do not claim a phase complete until the final pushed SHA is green and its affected mobile flows have been exercised.

### Programme-wide definition of done

A phase is complete only when:

- old saves migrate or fail safely with an actionable recovery path;
- Quick Sim and Broadcast consume the same authoritative football outcome;
- deterministic unit/regression coverage exists for new domain rules;
- the 390px mobile journey works, with wider responsive checks where the surface changed;
- long-career storage and performance budgets have not regressed materially;
- `AGENTS.md`, the phase status and user-facing help/settings are updated where behaviour changed;
- the pull request explains shipped scope, deferred scope, migration impact and the next work package.

# 6. Priority roadmap

The order below is dependency-driven. A later phase may be designed early, but should not be fully implemented before the systems it depends on exist.

## P0 — Football authenticity and career foundation

**Status: ✅ COMPLETE — 30 August 2026.**

**Priority:** completed correctness/foundation pass; **P1 is now unblocked.**

### Build

- [x] Remove obsolete away-goals tiebreak behaviour from UEFA competitions.
- [x] Move UEFA competitions to the current 36-team league-phase structures, including knockout-phase play-offs and ranking/seeding rules.
- [x] Audit domestic cup entry, replay/extra-time, two-leg and qualification assumptions rather than fixing UEFA only.
- [x] Introduce a clear competition-rules/data layer so tournament structure is not hard-coded across multiple unrelated modules.
- [x] Add proper multiple career slots locally and make the cloud save contract slot-aware without another future format rewrite.
- [x] Make each slot clearly show manager, club, season, current league position and last played date, with Continue / Export / Delete.
- [x] Add save-version/migration discipline before the next major schema expansion.

### Acceptance

- [x] Current European two-legged ties never use away goals as a tiebreak.
- [x] UEFA league phases and qualification paths match the configured P0 rules, including direct R16 / play-off / elimination routes and seeded home-leg ordering.
- [x] Starting a second career does not require destroying/exporting the first, and deleting the legacy first career cannot strand surviving slots.
- [x] Existing `.pitch` V1 saves remain importable through explicit migration/version handling.

### Shipped in P0

- `src/modules/competitionRules.js` is the shared competition-format source consumed by cups/gameweek/season logic; current UEFA league-phase match counts, qualification routes, two-leg rules and seeding no longer live as scattered assumptions.
- Aggregate UEFA ties no longer use away goals; level aggregates resolve through extra-time/penalty semantics.
- UCL/UEL/UECL league-phase state models 36-team ranking routes (8/8/6 user fixtures respectively), including positions 1-8 direct, 9-24 play-off and 25-36 elimination.
- End-of-season European finance derives progress from named rule stages rather than raw round indexes, avoiding prize drift when competition formats change.
- IndexedDB careers use stable slot IDs. The pre-P0 `pitch_fc` database remains the discoverable `legacy` compatibility slot; deleting/resetting that career clears it in place, while generated career databases remain physically isolated.
- Save envelope V2 adds schema version + slot metadata with an ordered V1 migration path. Local export/import and cloud backup share that envelope contract.
- Cloud saves are keyed by `(user_id, slot_id)` with summary metadata, preserving existing rows as `legacy` through the D1 migration.
- Career Menu supports multiple saved careers with manager/club/season/position/last-played metadata plus Continue, Export, Delete and isolated New Career flows.

### Completion evidence

P0's final delivery loop passed both functional and rendered-mobile verification before this status was changed:

- legacy build + compatibility validator bridge passed, with **22 deterministic P0 replacement-contract tests** green;
- production Vite build and ESLint passed;
- **95/95 Vitest tests** passed;
- **186/186 club accent checks** passed;
- **15/15 Playwright tests** passed at the repo's 390×844 mobile target, including two-career switching/deletion and the three-career legacy-fallback regression;
- the retained **390×844 Career Menu screenshot** was visually inspected: both career cards render opaque/readable, active state and metadata are clear, all Continue / Export / Delete controls are visible without clipping, and New Career remains reachable.

### Delivery plan (historical implementation route)

**Locked decisions**

- Deliver competition rules and save architecture as two separate P0 work packages; both must finish before P1 expands persistent world state.
- Competition behaviour comes from one versioned rules definition consumed by fixtures, cups, standings and season rollover. Do not add a second tournament engine.
- Introduce a versioned save envelope with a stable `slotId`; existing careers migrate into a default first slot. Local and cloud storage share the same slot metadata contract even if cloud activation remains optional.
- New Career creates isolated records for the selected slot rather than relying on the current single-save assumption or clearing another career's data.

**Route**

1. Characterise current domestic and UEFA behaviour with deterministic rule tests, then remove away goals and correct aggregate/extra-time/penalty handling.
2. Extract competition format, entry, scheduling, tiebreak and advancement rules behind the existing event-queue flow; add the 36-team UEFA league phases without bypassing that queue.
3. Add the save envelope, ordered migrators and import/export compatibility before changing IndexedDB stores or keys.
4. Add slot-aware local repositories and then the Continue / New Career / Export / Delete UI. Extend the Worker/D1 contract only after local migration and rollback paths are proven.
5. Run multi-season competition tests, old-save fixtures, slot-isolation tests and mobile entry-flow E2E coverage.

**Commit/push slices delivered:** rule characterisation; competition rules layer; UEFA format; save envelope/migrators; local slots; cloud-compatible contract; slot UI/E2E; completion evidence/docs.

---

## P1 — The Living Football World

**Status: ✅ COMPLETE — 31 August 2026.**

**Priority:** completed living-world foundation; **P2 and P3 consume it and later phases must reuse it.**

This is the most important foundation for everything that follows.

Pitch should continuously simulate its football world, not merely manufacture enough context for the user's club.

### Build

For every supported league and associated competition, maintain real ongoing:

- fixtures and results;
- standings;
- cup progress;
- appearances and minutes;
- goals and assists;
- clean sheets;
- cards/suspensions;
- injuries;
- player form and match ratings;
- transfers and loans;
- club form;
- season awards.

Persist historical records by season:

**Player history**

- club(s);
- appearances/minutes;
- goals/assists/clean sheets;
- average rating;
- major injuries;
- transfer history;
- trophies and individual awards.

**Club history**

- league finish;
- manager;
- cup/European runs;
- trophies;
- record/significant transfers;
- seasonal budget/reputation trajectory.

**Competition history**

- champion/winner;
- promoted/relegated clubs;
- top scorer;
- top assists;
- clean sheets;
- player/team records where affordable to store.

### World longevity

Add a balanced generated-player/newgen pipeline so retirement does not slowly empty the world or inflate/deflate average quality. Generated players should inherit believable nationality, position, growth-profile and ability distributions from their football context rather than being arbitrary replacements.

### Performance constraint

Nine leagues are an advantage only if the browser remains fast. World simulation must be incremental/batched and benchmarked on mobile-class hardware. Do not run hundreds of Broadcast simulations; background fixtures use the authoritative fast match engine.

### Acceptance

If the user is managing Arsenal in October and inspects Barcelona, Dortmund or Ajax, that club has actually played a coherent season with inspectable form, players and statistics. A manager can make scouting and job decisions from real simulated history.

### Shipped in P1

- All 9 supported leagues / 186 clubs advance through one shared world clock using the authoritative fast match engine; background football never runs Broadcast simulation.
- `src/modules/world.js` defines canonical match/stat records, and `src/modules/worldRuntime.js` applies them once so fixtures, standings and player state cannot independently invent or double-count outcomes.
- Background domestic and European competition state is persisted through `src/modules/worldCompetitions.js`, including a compactable result ledger and participant-only cup player projection.
- Current-season projections maintain league/cup progress, appearances, starts/minutes, goals, assists, clean sheets, cards/suspensions, injuries, form/ratings, club form, transfers/loans and awards from the same simulated world.
- Season rollover writes compact player, club and competition history summaries, retains transfer/award context, compacts the outgoing detailed competition ledger and creates a fresh next-season world state.
- Retirement replacement uses calibrated newgen cohorts rather than cloning retired players or adding unconstrained talent.
- P0/legacy careers gain living-world state through the existing migration/backfill path rather than requiring a destructive restart.
- `LeagueScreen.svelte` exposes inspectable living-world club profiles and real current-season form/statistics across leagues.
- P1 closeout removed two major scale regressions: cup projection no longer rewrites every world player, and league projection persists only changed player rows while keeping fixture apply-once flags, standings and those changes atomic.

### Completion evidence

P1's final delivery loop passed code review, deterministic verification, performance verification and rendered responsive checks before this status was changed:

- legacy build + compatibility bridge passed, with **55 deterministic P0/P1 replacement-contract tests** green inside that bridge;
- production Vite build, ESLint and the UI emoji audit passed;
- **128/128 Vitest tests** passed across 20 test files;
- **186/186 club accent checks** passed;
- **17/17 Playwright tests** passed;
- the full playable app was audited at **390×844** across Home, Squad, Transfers, Competitions, Academy, Trophies, Settings, Inbox and Match, with no document horizontal overflow, unnamed visible controls, unintended right-edge clipping or floating-nav interaction overlap on the affected P1 surface;
- a dedicated **1280×800** P1 acceptance journey completed an authoritative world week and successfully inspected Barcelona, Borussia Dortmund and Ajax, confirming each exposed real form, player appearances and a recent canonical result without horizontal overflow;
- the retained **390×844 Competitions screenshot** was visually inspected: hierarchy/table readability, club identity, active row, selector scrolling and floating-nav clearance are all intact;
- the final throttled shared-runner benchmark measured **12.33s fresh 186-club career load, 18.50s authoritative full-world week and 2.76 MiB browser storage at 4× CPU throttle**. CI retains conservative regression ceilings of `<20s` load, `<25s` world week and `<50 MiB` storage; these are regression guards, not UX targets.

### Delivery plan (historical implementation route)

**Locked decisions**

- A completed fixture writes one canonical match record. Standings, player statistics, form, history, awards and stories derive from that record instead of independently inventing results.
- All supported leagues advance through the same world clock. Background fixtures use the fast authoritative engine; Broadcast remains user-match presentation only.
- Store detailed current-season ledgers and compact immutable season summaries. Retention/compaction rules must be explicit so a 15-season mobile save stays viable.
- Generate new players from calibrated league/nation/position cohorts at season rollover; never clone retired players or add unbounded talent.

**Route**

1. Define the canonical match/stat ledger and idempotent “apply result once” boundary.
2. Expand the gameweek pipeline to simulate scheduled world fixtures in bounded batches while preserving the user's load-bearing pending-event queue.
3. Build current-season player/club/competition projections, then season-close summaries and inspectable history.
4. Add awards, transfers/loans and injury/form updates as consumers of the same ledger.
5. Add cohort-based newgens and long-horizon population/quality checks.
6. Benchmark gameweek time, career load time and IndexedDB growth on mobile-class targets before enabling full breadth by default.

**Commit/push slices delivered:** ledger contract/tests; batched world clock; current stats; historical summaries; awards/injuries/transfers integration; newgens; performance/E2E/docs.

---

## P2 — Match Engine 2.0, Tactics and Manager DNA

**Status: ✅ COMPLETE — 31 August 2026.**

**Priority:** completed simulator-depth foundation; **P3 consumed it and P4 now builds on the combined player/tactics contracts.**

Because Pitch is simulator-only, tactical decision quality is core gameplay.

### Keep the architecture boundary

- `matchEngine.js` remains authoritative for football outcomes.
- Broadcast remains a deterministic presentation/spatial layer around authoritative events.
- Do not let prettier Broadcast behaviour fabricate a different football result.

### Add team instructions

Examples:

- build-up: patient / balanced / direct;
- tempo: slow / balanced / fast;
- defensive line: low / mid / high;
- pressing: passive / standard / aggressive;
- width: narrow / balanced / wide;
- transition: hold shape / counter;
- chance creation: work ball / balanced / early delivery;
- defensive approach: compact / balanced / front-foot;
- set-piece priorities.

### Add player roles

Examples:

- poacher;
- target forward;
- false nine;
- inside forward;
- wide creator;
- advanced playmaker;
- deep playmaker;
- box-to-box midfielder;
- ball winner/anchor;
- ball-playing centre-back;
- stopper/cover defender;
- overlapping/inverted/full-back roles;
- goalkeeper/sweeper-keeper concepts where the engine can support them.

Roles should be constrained by the player's attributes/positions and should not be cosmetic labels.

### Tactical causality

Examples of desired trade-offs:

- high line increases territory/pressure but is vulnerable to pace/direct balls;
- aggressive press can create turnovers but costs fitness and can increase late-match vulnerability;
- narrow shape protects central zones but yields width/crossing opportunities;
- direct play can bypass midfield pressure but lowers possession/control;
- overlapping full-backs add attacking width but expose transition space;
- player-role suitability affects the value of a tactic.

### Opposition and AI

Give AI managers tactical profiles and allow them to adapt within sensible limits. Create pre-match opposition insights from actual world data: common shape, threat areas, form, likely style and key performers.

### Manager DNA

Track a manager's emerging identity from actual choices/results: preferred shapes, press intensity, possession/directness, youth use and risk profile. This later feeds job suitability, club identity and recruitment.

### Testability requirement

Simulation changes must gain deterministic/injectable RNG support and statistical regression tests. The existing standing risk — stochastic balance without a reliable automated gate — becomes unacceptable once tactics materially alter results.

### Shipped in P2

- `matchEngine.js` owns seeded, serialisable RNG so whole-match Quick Sim and segmented Broadcast runs can reproduce one authoritative result stream.
- `tactics.js` owns the shared instruction and player-role schema, validation/defaults, tactical modifiers, AI tactical identities and role suitability.
- `managerTactics.js` is the shared managed-match adapter for persisted user tactics/roles, AI tactical identity, opposition insight and idempotent Manager DNA sampling.
- Tactical choices create bounded trade-offs rather than universal rating boosts, including pressing, line height, width, build-up/transition/chance creation and role effects.
- Team News exposes the same AI tactical profile that the match engine consumes.
- Existing careers receive additive P2 defaults while preserving formation, mentality and lineup exactly.
- Quick Sim, league/cup paths and watched Broadcast use the same authoritative tactical inputs/outcome boundary.

### Completion evidence

P2's closeout passed the delivery gate on exact head `de7de8a8fbfaddf00979a64306450be99023740b` before P3 began:

- legacy compatibility bridge passed with deterministic P0/P1/P2 replacement contracts;
- production Vite build and ESLint passed;
- **150/150 Vitest tests** passed, including seeded match-engine regression, tactical schema/manager adapter, save backfill and venue/parity contracts;
- **186/186 club accent checks** passed;
- **19/19 Playwright tests** passed, including the 390×844 P2 tactics/opposition-insight/watched-result journey and a wider 1280×800 P2 acceptance journey;
- retained P2 mobile/wide screenshots were generated and inspected for the affected tactics and Team News surfaces;
- P1 performance regression remained inside its guardrails at **12.57s fresh career load, 18.93s authoritative world week and 2.61 MiB storage** on the closeout run;
- GitHub Actions **Build and validate** passed on the exact head SHA;
- Cloudflare Workers reported **Deployment successful** for the same `de7de8a8` commit and branch preview.

### Delivery plan (historical implementation route)

**Locked decisions**

- Seeded/injectable RNG and a repeatable simulation benchmark land before tactical balance changes.
- Represent tactics as a small config-driven set of orthogonal team instructions plus position-compatible player roles. Avoid free-form combinations that cannot be explained or tested.
- Tactical effects are bounded trade-offs applied inside the authoritative match engine; no instruction is a universal rating boost.
- AI tactical profiles and Manager DNA use the same tactic schema as the user. Broadcast visualises the authoritative event plan and never recalculates score, scorer or timing.

**Route**

1. Introduce the RNG boundary, deterministic fixtures and statistical baseline reports for goals, results, cards, possession and home advantage.
2. Add the tactic/role schema, validation, defaults and save migration while preserving existing formation/mentality careers.
3. Add engine modifiers one tactical dimension at a time, each with matchup tests and fitness/risk consequences.
4. Add role suitability and AI manager profiles, then pre-match insights sourced from P1 history.
5. Persist Manager DNA as an aggregate of actual selections and outcomes, not a user-selected badge.
6. Map authoritative events into Broadcast and verify watched and quick-simmed results remain identical.

**Delivery slices completed:** deterministic harness; tactic schema/migration; team instructions; player roles; AI profiles/insights; Manager DNA; Broadcast parity/statistical regression; responsive acceptance and closeout evidence.

---

## P3 — Player Model 2.0

**Status: ✅ COMPLETE — 1 September 2026.**

**Priority:** completed player-state foundation; **P4 — Transfer Market and Contracts 2.0 is now next.**

Make squad selection and rotation produce consequences beyond energy and static potential.

### Separate player concepts

1. **Baseline ability** — durable football quality.
2. **Current effective level** — what the player is capable of now.
3. **Potential** — long-term ceiling, not perfectly known.
4. **Growth profile** — shape of development/peak/decline.
5. **Form** — recent performance.
6. **Individual morale/confidence** — personal state.
7. **Match fitness/sharpness** — preparedness separate from raw energy.
8. **Squad role** — crucial / important / rotation / squad / prospect.
9. **Playing-time expectation** — promised vs delivered involvement.
10. **Preferred positions** — multiple playable positions with varying suitability.
11. **Traits/style characteristics** — enough distinction that equal ratings do not imply identical players.

### Dynamic current level

Adopt the useful principle behind FC27 Dynamic OVR without copying it mechanically. Current performance should respond to form, morale, match fitness, injuries, minutes and competition for places while preserving an underlying baseline ability.

### Development

Evolve the current potential/growth-point system so sustained performance can influence long-term development and different players follow different growth profiles: early peak, normal, late development, extended peak, rapid decline, etc.

Potential should become an estimate/range in relevant UI rather than a perfectly known immutable truth.

### Injury return pathway

Move from binary injured/healthy to:

`injured -> rehabilitation -> medically available/high reinjury risk -> match fit`

The manager can accelerate a return at a meaningful risk rather than waiting for a boolean to flip.

### Acceptance

Rotation, development, selection, contracts, transfers and injuries all read from the same coherent player state rather than independent meters.

### Shipped in P3

- `playerModel.js` is the pure canonical v4 player contract. Existing attack/midfield/defence/goalkeeping values remain durable baseline ability; current effective level is derived from bounded position fit, form, morale, sharpness, fitness, rehabilitation and trait inputs.
- Additive, idempotent backfill covers persisted player rows, youth cohorts and embedded youth players without changing `DB_VERSION`, player identity, ownership, loan/history state, formation or XI/bench ordering.
- Explicit squad roles and rolling playing-time agreements feed individual morale, while position suitability, a bounded trait set and gradual conversion distinguish equal-baseline players.
- `playerDevelopment.js` replaces per-match unseeded growth with deterministic weekly growth/decline profiles; population and 15-season regression coverage guard world-quality inflation.
- `playerRehabilitation.js` owns injured → rehabilitation → medically available/high risk → match-fit transitions and seeded reinjury risk.
- Match selection, transfer value/ranking, Squad and Academy consume shared player-model selectors. Effective-level caching is object/snapshot scoped so same-ID projection copies cannot contaminate one another.
- Canonical league projection settles completed background clubs' P3 state in the write it already performs; background cup/European projection settles deferred participants. Ordinary final P3 settlement therefore reads only the managed squad, while genuine league-less/cup-only weeks preserve the full-world P3 path.
- Squad player detail exposes baseline/current level, potential range, form, morale, sharpness, position/traits, playing-time role and tactical role at mobile and wide viewports without adding a new dashboard surface.

### Completion evidence

P3's final delivery gate passed before this status changed:

- legacy compatibility bridge, production Vite build and ESLint passed;
- **242/242 Vitest tests** passed across 41 files, plus the UI emoji audit;
- **186/186 club accent checks** passed;
- **21/21 Playwright tests** passed, including the retained and inspected 390×844 and 1280×800 P3 player-detail journeys;
- the unchanged 4×-CPU performance guards passed at **13.108s fresh-career load, 7.301s authoritative world week and 3.41 MiB storage**; the world-week regression had been 41.66s before duplicate final-closeout work and hot selector scans were removed;
- GitHub Actions and Cloudflare Workers succeeded on the final promoted roadmap SHA.

### Delivery plan (high level)

**Locked decisions**

- Persist durable baseline ability, potential/growth profile, position suitability and personal state; derive current effective level through one shared selector rather than storing competing “current rating” values.
- Form, morale, sharpness and injury recovery are bounded inputs with distinct causes and decay. They must not all become aliases for recent match results.
- Squad roles and playing-time promises are explicit agreements evaluated on scheduled checkpoints, feeding morale, contracts and transfer behaviour.
- Multiple positions use a suitability map; conversion changes that map gradually and never silently rewrites a player's primary identity.

**Route**

1. Add a versioned player-state contract and shared selectors while adapting existing screens/engine calls to the old values through a compatibility layer.
2. Introduce effective-level calculation and deterministic boundary tests, then individual morale, sharpness and promise evaluation.
3. Add multi-position suitability and traits as engine/recruitment inputs.
4. Replace uniform development with config-driven growth profiles and uncertain potential presentation.
5. Add rehabilitation, medical availability and reinjury risk as an explicit state machine.
6. Remove compatibility reads only after match, squad, market, academy, season rollover and import paths all consume the canonical model.

**Suggested delivery slices:** player contract/selectors; migration/adapters; effective level; morale/roles/promises; positions/traits; growth profiles; rehabilitation/reinjury; UI/E2E/docs. These are review boundaries, not instructions to commit known-broken intermediate states.

---

## P4 — Transfer Market and Contracts 2.0

**Status: ✅ COMPLETE — 1 September 2026.**

**Priority:** completed recurring squad-building loop; **P5 now expands the shared need projection into scouting, coaching, training and multi-season squad planning.**

**Completion evidence:** versioned/bounded `save.transferMarket` migration; deterministic legal deal transitions and typed fee/loan/contract terms; explainable player interest, rival offers and need-first AI targeting; one idempotent market tick at the completed world-week boundary; atomic four-store settlement with immutable history and retry keys; season rollover compaction; persisted Deals, Market, Loans, Contracts and history projections including mobile layouts.

The current transfer foundation is useful; now turn deals into an evolving process and make AI recruitment intentional.

### Staged deals

A transfer should progress through time, for example:

`interest/enquiry -> seller terms -> club negotiation -> player negotiation -> completion`

Deals should be capable of:

- rival bids;
- hijack attempts;
- changed asking prices;
- expiring offers;
- deadline pressure;
- a player choosing another club.

### Deal structures

Prioritise the structures that create decisions:

- installments;
- sell-on percentage;
- player exchange;
- loan-to-buy;
- loan-back;
- release clause;
- performance/appearance bonuses;
- future transfer arrangements where technically sensible.

### Contract negotiation

Add meaningful negotiation around:

- base wage;
- contract length;
- squad role;
- signing bonus;
- appearance/goal/clean-sheet bonuses;
- optional promotion/relegation salary clauses.

### Player interest

Interest should combine:

- club reputation;
- league/competition prestige;
- European football;
- wages;
- promised role;
- likelihood of minutes;
- manager/tactical fit;
- current club status;
- age/career stage;
- transfer request/unhappiness;
- selected rivalry/club-relationship constraints.

### AI recruitment

AI clubs should create needs before targets. Example:

> left-footed CB, under 25, strong enough for a high line, budget <= £30m

rather than simply buying one of the best affordable players.

Inputs should include squad depth, aging, contracts, injuries, tactical identity, club philosophy, finances and current performance.

### Transfer world

Maintain season-long transfer history, rumours/shortlist stories and visible competing activity so the market feels like a world rather than the user's shopping catalogue.

### Delivery plan (high level)

**Locked decisions**

- Model every transfer/renewal as a persisted state machine advanced by explicit user actions or gameweek deadlines; do not encode negotiation progress in modal state.
- Use one typed terms model for fees, installments, clauses, bonuses, exchanges and loans. Finance P7 will consume its scheduled obligations rather than reinterpret deal text.
- Player interest is a transparent scored decision with hard blockers and explainable reasons. AI clubs use the same rules.
- AI recruitment starts from squad needs supplied by the shared squad-planning service, then ranks candidates by fit, affordability and likelihood—not raw overall alone.

**Route**

1. Define deal states, legal transitions, expiry/idempotency rules and the common terms contract.
2. Migrate current instant offers and contracts into the new state machine without breaking existing pending offers.
3. Add staged club/player negotiation and only the highest-value deal structures first; gate later clauses behind the same contract.
4. Add player-interest explanations, rival bids and deadline progression.
5. Add a minimal shared squad-depth/need projection on P1/P2/P3 data, then use it for AI candidate selection with budget and squad-legality guards. P5 expands this same service into the full squad planner.
6. Rebuild the existing transfer sheets as projections/commands over deal state, then add transfer history and rumour stories.

**Commit/push slices:** state machine/tests; terms/migration; staged negotiation; priority clauses; interest/rival bids; AI needs/recruitment; UI/history/E2E/docs.

---

## P5 — Scouting, Coaching, Training and Squad Planning

**Priority:** #5.

Reduce omniscience without creating Football Manager-style admin overload.

### Scouting reports

Use a compact staged report model:

- **Current:** how good/effective is the player now?
- **Tactical:** how well would they fit our system/roles?
- **Future:** likely ceiling and growth profile, expressed with uncertainty;
- **Financial:** expected fee/wages/clauses;
- **Status:** happiness, likely availability and interest in joining.

Better scouts narrow uncertainty and complete reports faster. Do not hide every basic attribute purely to create grind.

### Coaches

Keep staffing deliberately lightweight. Coaching departments can map to Goalkeeping / Defence / Midfield / Attack, with quality and tactical/development specialisms.

Coaches should affect assessment and development quality, not provide giant arbitrary rating boosts.

### Training/development plans

Allow a player to focus on a small number of meaningful plans: finishing, creation, defensive work, physical development, role conversion, position conversion, recovery/sharpness etc.

### Squad planner

Add present and projected depth views:

- current XI/rotation/depth by role;
- contract expiry risks;
- aging risk;
- loaned players returning;
- academy players approaching first-team level;
- projected gaps in 1-3 seasons.

This should feed the recruitment model for both user and AI clubs.

### Simulator translation of Practice Arena

Optional: a **simulated tactical scrimmage/lab** against reserves that returns a report on shape, chance profile, possession, fatigue and vulnerabilities. Never make it manually playable.

### Delivery plan (high level)

**Locked decisions**

- Scouting stores time-stamped observations and produces uncertain reports; it does not mutate or duplicate the player's authoritative attributes.
- One squad-planning service produces depth, succession and recruitment needs for both user-facing views and AI recruitment.
- Coaches remain four lightweight departments with quality and specialism. They change assessment confidence, plan effectiveness and recovery within caps—not raw permanent bonuses.
- Training is a gameweek allocation with safe automatic defaults. Users may intervene, but the system must not require repetitive weekly administration.

**Route**

1. Expand P4's shared depth/need projection into role, succession and 1-3 season planning for both user-facing views and AI recruitment.
2. Add scouting assignments, observations, report stages and uncertainty narrowing.
3. Add coaching departments and hiring/replacement rules using the existing club budget until P7 expands finance.
4. Add development, conversion, sharpness and recovery plans as commands over the P3 player model.
5. Feed squad needs and scouted confidence into P4 user/AI recruitment without restoring omniscient candidate ranking.
6. Add the optional tactical lab only as a fast-engine report using P2; it remains non-playable.

**Commit/push slices:** squad-planner service/tests; report model; assignments/uncertainty; coaches; training/development plans; recruitment integration; UI/E2E/docs.

---

## P6 — Manager Career and Living Manager Market

**Priority:** #6.

This absorbs and expands the old `ROADMAP.md` Manager Career Progression item.

### Manager profile

Persist:

- reputation;
- current club;
- clubs managed;
- matches / W-D-L;
- trophies;
- promotions/relegations;
- sackings/resignations;
- tactical DNA;
- youth-development reputation;
- financial/transfer reputation;
- notable achievements.

### User movement

Support:

- resignation;
- sacking;
- club approaches;
- applications;
- realistic vacancy offers;
- changing clubs without resetting football-world history.

### AI managers

AI clubs should have managers with tactical identity, reputation and job security. Managers can be sacked, poached, resign, retire or take new jobs.

A manager change should alter meaningful club behaviour:

`manager -> tactics -> squad-role fit -> recruitment needs -> transfers -> results`

This is where P1/P2/P4 become a single living system rather than separate features.

### Delivery plan (high level)

**Locked decisions**

- Managers are first-class persisted entities, including the user's manager. Clubs reference a `managerId`; career identity is no longer embedded only in the current club/save.
- Job changes preserve the same world, date, history and manager record. Moving clubs changes control, not ownership of the football universe.
- Vacancies and applications use one state machine. AI and user appointments obey the same reputation, fit, affordability and timing rules.
- Manager changes take effect at safe event-queue boundaries; never switch club ownership midway through an unresolved fixture.

**Route**

1. Add the manager entity/profile and migrate the current user manager into it.
2. Add club-manager assignments, job security and vacancy records for all simulated clubs.
3. Add AI dismissal, caretaker/appointment, poaching, retirement and movement on bounded evaluation dates.
4. Add user resignation, approaches, applications and appointment handover without resetting fixtures or records.
5. Expose a manager-fit contract using Manager DNA, reputation and current club attributes so appointments alter tactics and recruitment. P7 enriches this contract with persistent club philosophy.
6. Add manager history/profile views and multi-season labour-market tests.

**Commit/push slices:** manager contract/migration; club assignments; vacancy state machine; AI movement; user movement/handover; tactics/recruitment integration; UI/E2E/docs.

---

## P7 — Club Identity, Finance, Board and Facilities

**Priority:** #7.

Make clubs behave differently over many seasons.

### Club philosophy

Examples:

- youth factory;
- buy-to-sell;
- financially cautious;
- superstar recruitment;
- domestic-first;
- European ambition;
- possession identity;
- direct/high-intensity identity.

Club philosophy influences board objectives, manager fit, budgets and AI recruitment.

### Lightweight club economy

Track enough to create consequences without becoming an accounting simulator:

- transfer budget/cash position;
- wage bill;
- future transfer installments;
- competition/prize income;
- base/commercial income abstraction;
- debt/financial pressure;
- transfer revenue;
- academy/facility spending.

### Board evolution

Expand from one finish objective to a small weighted set of sporting, financial and youth expectations. Add warning states before dismissal and let club circumstances change expectations.

### Facilities

Optional persistent upgrades with clear mechanics:

- academy;
- training;
- medical/recovery;
- scouting network.

Avoid decorative upgrade trees that only add percentages without meaningful trade-offs.

### Delivery plan (high level)

**Locked decisions**

- Use one club-season finance ledger for cash movements and future obligations. Budgets and wage room are projections from that ledger, not independently edited counters.
- Club philosophy is stable, data-driven identity with a small number of weighted traits. It guides decisions but does not hard-lock every club into one behaviour forever.
- Board objectives are weighted, measurable contracts with warning/review states; dismissal remains part of P6's shared job-security flow.
- Facilities are a small set of persistent levels with costs, lead times and explicit consumers. No decorative upgrade currency or sprawling skill tree.

**Route**

1. Define club philosophy and migrate existing reputation/objective assumptions to shared selectors.
2. Add the finance ledger and scheduled obligations, then connect P4 installments, wages, prize money and operating-income abstractions.
3. Replace the single board target with weighted sporting, financial and youth objectives plus review cadence.
4. Add manager/club fit and evolving expectations based on reputation, finances and recent history.
5. Add academy, training, medical and scouting facility upgrades only after P5/P9 consumers exist.
6. Run multi-season solvency, obligation and AI spending simulations to prevent runaway wealth/debt.

**Commit/push slices:** philosophy contract; finance ledger/migration; transfer/wage integration; board objectives/reviews; manager-fit integration; facilities; balance/UI/E2E/docs.

---

## P8 — Story Engine, Press, Fans and Rivalries

**Priority:** #8.

R7's Inbox is the correct delivery surface. Turn it from a news log into a state-driven decision engine.

### Event design

Events should be triggered by real conditions wherever possible:

- captain repeatedly dropped;
- promised minutes not delivered;
- youngster wants a loan;
- star wants a new contract;
- player requests a transfer;
- teammate objects to a sale;
- dressing-room disagreement;
- disciplinary/training issue;
- early return from injury decision;
- owner changes expectations;
- budget cut or financial problem;
- points deduction/appeal scenario;
- supporter anger after major sale/derby run;
- board pressure after poor form;
- takeover/investment event;
- manager/club rivalry narrative.

Events may chain across several weeks and remember previous decisions.

### Choices

Avoid obvious good/bad dialogue options. Decisions should trade one benefit against another: player vs squad, short-term performance vs injury risk, finances vs morale, star retention vs wage structure, youth minutes vs immediate results.

### Press

Use press moments sparingly at genuinely important points: derby, final, title/relegation run-in, major transfer saga, serious internal event. Answers should connect to real player/squad/board state.

### Fan/media pressure

Keep these mostly as inputs, not permanent dashboard clutter. They can influence board confidence, event probability and narrative tone.

### Delivery plan (high level)

**Locked decisions**

- Stories come from a deterministic, rule-based event engine over real game state; do not require an LLM or server call for core career progression.
- Event templates declare trigger, cooldown, priority, participants, choices, effects and follow-up states. Effects execute through domain commands rather than editing save objects from the Inbox.
- A career stores event instances and decisions, not duplicated prose-heavy histories. Templates can evolve independently through versioned identifiers.
- Press, fan sentiment and rivalries are contextual inputs/outputs of the same engine, not additional always-visible management meters.

**Route**

1. Define the event/template schema, eligibility evaluator, cooldown/deduplication and deterministic priority rules.
2. Add a small vertical slice of events across P3 player state, P6 job security and P7 board/finance using real triggers.
3. Add trade-off choices and chained follow-ups with idempotent effect handling.
4. Turn Inbox into the projection/action surface for pending, resolved and expired events.
5. Add sparse press moments, rivalry state and fan-pressure inputs only where they alter decisions or event likelihood.
6. Add replay/golden tests proving the same seeded career produces the same event sequence and that expired actions cannot apply twice.

**Commit/push slices:** event schema/evaluator; first vertical slice; effects/follow-ups; Inbox integration; press/fans/rivalries; replay/E2E/content-authoring docs.

---

## P9 — Academy, Loans and Development Pathways 2.0

**Priority:** #9.

Build on the existing Academy and investment systems.

### Youth scouting

Allow regional assignments and broad briefs such as position group, physical/technical preference or tactical role. Quality should be uncertain until observed/developed.

### Academy development

Add:

- development plans;
- academy/youth match simulation;
- form/development evidence;
- role/position growth;
- clearer path to first-team readiness.

### Loans

A loaned player should actually live inside the world simulation:

- appearances/minutes;
- match ratings;
- form/morale;
- development;
- injuries;
- club tactical fit.

Provide periodic loan reports and recall rules where agreements allow.

AI clubs should request loans to solve genuine squad needs.

### Delivery plan (high level)

**Locked decisions**

- Academy players and loaned players remain normal canonical player entities. Their location/status changes; their development and history do not move into a second player model.
- Youth scouting produces prospects through the calibrated P1 newgen pipeline with regional/brief weighting and uncertainty, preserving world talent budgets.
- Academy/youth matches may be aggregate simulations, but their evidence feeds the same P3 development, form and readiness rules.
- Loan development is earned from actual P1 appearances, ratings, tactical fit and coaching context. No opaque “loan boost.”

**Route**

1. Extend squad status/location and eligibility rules for academy, first team and loans while preserving identity/history.
2. Add regional youth assignments and briefs on top of the shared scouting/report model.
3. Add lightweight youth fixtures/reports and P3 development-plan integration.
4. Add loan agreement rules, placement scoring from real AI squad needs and world-fixture participation.
5. Add periodic loan reports, recall/option handling and season-return transitions through P4 contracts.
6. Add population, minutes and development-distribution tests across several simulated seasons.

**Commit/push slices:** player-status contract/migration; youth scouting; academy simulation/plans; loan agreements/placement; live loan stats/reports; return/recall flow; balance/UI/E2E/docs.

---

## P10 — Career Setup, Difficulty and Simulation Controls

**Priority:** #10, with pieces allowed to land alongside earlier phases.

Depth should be configurable rather than forcing every user into maximum simulation complexity.

### Presets

- Casual;
- Authentic;
- Hardcore;
- Custom.

### Candidate controls

- simulation variance;
- injury frequency;
- reinjury severity;
- transfer strictness/activity;
- board strictness;
- financial pressure;
- scouting uncertainty;
- development speed;
- event frequency;
- AI transfer activity;
- optional world-simulation breadth if performance requires it.

All presets must be documented/config-driven so balance can be changed without branching game logic everywhere.

### Delivery plan (high level)

**Locked decisions**

- Persist a versioned `careerSettings` object in the P0 save envelope. A preset resolves to explicit values at career creation so later preset tuning does not silently rewrite existing careers.
- Difficulty changes decision pressure, uncertainty and AI behaviour—not hidden penalties to the user's players or scripted results.
- All supported leagues still produce coherent fixtures/results. “Simulation breadth” may reduce stored detail and processing frequency, but never creates a fake or frozen football world.
- Accessibility, tutorials and presentation settings may change anytime; balance-affecting career rules change only at safe gameweek boundaries and are recorded in career metadata.

**Route**

1. Define config keys, ranges, defaults, preset expansion and migration for existing careers.
2. Route existing balance constants through a central settings selector without changing default behaviour.
3. Add controls one subsystem at a time, alongside that subsystem's deterministic regression tests.
4. Add Casual / Authentic / Hardcore summaries that explain consequences in plain language, plus Custom validation/reset.
5. Add optional history-detail/performance controls only after P1 benchmarks establish meaningful budgets.
6. Test export/import, cloud backup, changed settings at safe boundaries and equivalence of old saves to the Authentic defaults.

**Commit/push slices:** settings contract/migration; default-equivalence adapters; subsystem controls; presets/custom validation; Settings UI/help; persistence/E2E/docs.

---

## P11 — Creator Challenges and Live Starts

**Priority:** #11; major replayability/community opportunity.

Pitch's browser/data-driven nature makes this unusually suitable.

### Challenge definition

A challenge can define:

- club;
- season/date/gameweek;
- table position/points;
- squad edits/injuries/suspensions;
- budget/debt;
- transfer embargo;
- points deduction;
- nationality/age/signing restrictions;
- academy-only or homegrown rules;
- tactical restrictions;
- objectives and completion conditions.

Examples:

- survive with six matches left and five points to recover;
- take a League Two club into Europe using academy graduates only;
- recover from administration with debt and a transfer embargo;
- win Europe without signing anyone over 23;
- save a giant from relegation;
- sell every player over 30 and rebuild.

### Sharing

Start with a compact versioned JSON definition. Later add Cloudflare-backed short share codes, discovery, completion counts and voting/moderation if the community feature proves useful.

### Live starts

Real-world live start points are a later extension of the same architecture, but require a reliable, legal and maintainable current-data pipeline before becoming a product promise.

### Delivery plan (high level)

**Locked decisions**

- “Live Starts” means starting a simulated management career from a dated real-world snapshot; it never means manual or live on-pitch football.
- Challenges use a versioned, schema-validated definition that references approved domain commands and identifiers. Do not import arbitrary raw save/IndexedDB objects.
- Challenge setup and completion evaluation are pure and deterministic, with the source definition and career-setting overrides retained in career metadata.
- Ship local file/text sharing first. Cloudflare short codes, discovery and moderation are a later service slice only after the local format proves stable.
- Live-start ingestion is a separate, replaceable data-adapter pipeline with provenance/licensing checks; it is not required to ship creator challenges.

**Route**

1. Define the challenge schema, constraints, migration policy and validation/error model.
2. Build a deterministic career factory that applies approved scenario mutations to a normal new career.
3. Add objective/completion evaluators and progress projection, with impossible-condition validation.
4. Add creator/import/export flows and a small curated challenge pack.
5. Add optional short-code storage and abuse/moderation controls without making accounts mandatory.
6. Prototype live-start snapshots only after establishing a maintainable legal data source and date/version lifecycle.

**Commit/push slices:** schema/validator; career factory; objectives/completion; creator UI; local sharing/curated pack; optional cloud codes; later live-start adapter; security/E2E/docs.

---

## P12 — Long-term content expansion

**Priority:** after systemic depth.

### First expansion: non-English second tiers

Prioritise second divisions in Spain, Germany, Italy and France ahead of simply adding more top-flight-only countries. They dramatically improve manager-career movement, promotion stories and the living world.

The repo already has/prepares data concepts for several additional second tiers; complete them with the same reconciliation/data-quality standards as existing leagues.

### Later candidates

- international management with qualification and major tournaments;
- Create-a-Club using bespoke/unlicensed visual identity;
- more leagues where data quality can be maintained;
- women's club football as a deliberate content expansion;
- deeper continental qualification/coefficient systems.

Content breadth must not outrun simulation quality or data maintenance capacity.

### Delivery plan (high level)

**Locked decisions**

- Expand systemic depth before raw league count. Spain, Germany, Italy and France second tiers are the first content pack because they strengthen promotion, transfers and the manager market.
- New divisions use the same competition-rules, data-reconciliation and validation pipelines as existing leagues; do not add country-specific conditionals across season code.
- Add content in independently enableable/versioned packs so save migration, download/build size and long-career performance remain measurable.
- International management, Create-a-Club and women's club football are separate product work packages, not one combined “content” implementation.
- Create-a-Club uses bespoke/unlicensed identity assets. Every external dataset or asset requires provenance and maintenance ownership.

**Route**

1. Generalise tier links, promotion/relegation, cup entry and club movement around P0 rules configuration.
2. Add and validate one second-tier country end to end before repeating the pipeline for the remaining three.
3. Re-run P1 world-performance/population tests and P6/P4 movement/recruitment tests after each content pack.
4. Plan international calendars, selection and dual club/national manager state as a separate extension of P0/P1/P6.
5. Plan Create-a-Club as configuration plus bespoke identity generation on top of normal club rules, never as a privileged special club.
6. Treat women's club football as a deliberate competition/data expansion with its own researched structures and quality bar.

**Commit/push slices:** generic tier/rules support; one country pack per commit/PR slice; validation/performance after each; then separate design spikes and branches for internationals, Create-a-Club and women's football.

---

# 7. Existing roadmap items: where they now live

| Existing `ROADMAP.md` item | Treatment |
|---|---|
| Two-legged European knockouts | P0 corrected the shipped foundation and removed away-goals semantics |
| Wages | Keep shipped; expand economy in P7 |
| Contracts | Keep shipped; expand negotiation/clauses in P4 |
| Board objectives/job security | Keep shipped; expand in P7 and feed P6/P8 |
| Team morale | Keep shipped; add individual morale in P3 |
| Academy investment | Keep shipped; expand pathways in P9 |
| Cloud save / Google | Operational setup remains in `ROADMAP.md`; P0 shipped the slot-aware save/API/D1 contract |
| Manager career progression | Superseded/expanded by P6 |
| Data completeness polish | Ongoing hygiene; major league breadth moves to P12 |
| Club badges | Visual polish can ship opportunistically; not a blocker for systemic phases |

---

# 8. R8 quality/PWA remains a parallel quality stream

The redesign plan already defines R8 as quality floor, light mode and PWA work. Keep that separate from P0-P12 rather than renumbering it into gameplay depth.

R8 should continue to cover:

- light-mode token set;
- PWA install/offline expectations;
- real-device iOS/Android passes;
- reduced motion;
- focus-visible/accessibility;
- 320/390/768/1280 responsive validation;
- club accent contrast checks.

Gameplay phases must not be allowed to regress this quality floor.

---

# 9. Engineering guardrails for the programme

## 9.1 Preserve authoritative simulation boundaries

Broadcast may visualise outcomes; it must not become a second conflicting result engine.

## 9.2 Deterministic balance testing before deeper simulation maths

Injectable/seeded RNG and statistical regression tests are established by P2 and must be extended before large P3+ simulation/development changes. A green UI/build suite cannot prove goal rates, tactical advantages or development distributions are sane.

## 9.3 Use the P0 persistence migration path

P0 established a versioned save envelope and explicit V1→V2 migration. P2 onward must extend that ordered migration discipline rather than returning to ad-hoc backfills.

## 9.4 Mobile performance is a product requirement

Benchmark world-simulation batches, IndexedDB size and career-load time as history grows. A 15-season career must remain usable on a phone.

## 9.5 Avoid unnecessary server authority

Pitch is primarily a single-player simulator. Keep deterministic gameplay/local simulation client-side unless server authority is required for community/shared features, account data, abuse prevention or future competitive systems.

## 9.6 Data/licensing discipline

Do not solve content gaps by importing assets/data that create licensing risk. Bespoke club identity and maintainable data pipelines are preferable to copying protected game assets.

## 9.7 Every phase ends playable

Follow the existing plan discipline: no phase may leave the career half-migrated or one route dependent on unfinished follow-up work. Build, lint and unit tests must pass, and the affected browser journeys must be exercised and visually inspected by hand, before a phase is considered complete.

---

# 10. Recommended execution order

| Order | Phase | Primary payoff |
|---:|---|---|
| ✅ | **P0 — authenticity + save/migration foundation (COMPLETE)** | Correctness and safe foundation |
| ✅ | **P1 — Living Football World (COMPLETE)** | Persistent football universe and historical data spine |
| ✅ | **P2 — Match Engine 2.0 + Tactics/Manager DNA (COMPLETE)** | Core simulator gameplay depth |
| ✅ | **P3 — Player Model 2.0 (COMPLETE)** | Meaningful selection, rotation and development |
| ✅ | **P4 — Transfer Market and Contracts 2.0 (COMPLETE)** | Staged deals, contracts and need-led AI recruitment |
| ✅ | **P5 — Scouting/Coaching/Training/Squad Planning (COMPLETE)** | Less omniscience and strategic long-term planning |
| 1 | **P6 — Manager Career + AI Manager Market (NEXT)** | A career across clubs, not one club forever |
| 2 | P7 — Club/Finance/Board ecosystem | Clubs gain persistent identities and pressures |
| 3 | P8 — Story/Press/Fans/Rivalries | Systems turn into memorable narratives |
| 4 | P9 — Academy/Loans 2.0 | Deep long-term player pathways |
| 5 | P10 — Career settings | Depth remains approachable/configurable |
| 6 | P11 — Creator Challenges/Live starts | Replayability and community sharing |
| 7 | P12 — Second tiers/internationals/Create-a-Club/content | Breadth after depth |

---

## 10.1 Dependency checkpoints and safe parallel work

- **P0 hard gate is satisfied:** save migration/slots and configurable competition rules are stable foundations for persistent world expansion.
- **P1 shared data spine is satisfied:** P2 and P3 consume its canonical match/history records rather than recreating world state.
- **P2 tactics/simulation gate is satisfied:** seeded RNG, one authoritative managed-input contract, tactical causality, Manager DNA and Quick Sim/Broadcast parity form the stable baseline for P3.
- **P2 + P3 market-loop gate is satisfied:** P4 owns the minimal shared squad-needs projection; P5 expands it rather than replacing it.
- **P4 + P5 unlock career movement:** P6 can ship manager entities and movement with a basic fit contract; P7 later enriches club identity and finance.
- **P3 + P6 + P7 unlock narrative consequences:** P8 should not invent placeholder morale, job or finance state.
- **P1 + P3 + P5 unlock development pathways:** P9 reuses canonical players, reports and match histories.
- **P10 is cross-cutting:** its settings contract may land early, while individual controls land with the subsystem they configure.
- **P11 and P12 remain after systemic depth:** schema/design spikes may happen earlier, but production breadth must not bypass the same migration, performance and deterministic-test gates.
- **R8 remains parallel:** accessibility, PWA, responsive and quality-floor work can proceed independently, but any overlapping file must be coordinated through separate reviewable commits.

# 11. North-star career test

A mature version of this roadmap should make the following career possible without special scripting:

> A manager starts at a League Two club, develops a late-blooming academy midfielder, builds a pressing identity, earns promotion, loses the midfielder to a richer rival after a staged transfer saga, gets recruited by a struggling Championship club whose previous manager was sacked, changes their recruitment to fit the new tactic, reaches the Premier League, later takes a Bundesliga job, finds the former academy player has developed into an international-level star in another simulated league, and eventually meets his club in Europe — with every table, transfer, manager move and player season having actually occurred inside the saved football world.

If Pitch can routinely produce stories like that from interacting systems, it will have moved materially toward the best parts of modern FIFA/EA SPORTS FC Career Mode while retaining a distinct simulator identity.

---

# 12. Benchmark references

These references are for product benchmarking and football-rule verification, not implementation copying:

- EA SPORTS FC 27 Career Deep Dive: <https://www.ea.com/games/ea-sports-fc/fc-27/news/pitch-notes-fc27-career-mode-deep-dive>
- UEFA away-goals abolition: <https://www.uefa.com/news-media/news/026a-1298aeb73a7a-5b64cb68d920-1000--abolition-of-the-away-goals-rule-in-all-uefa-club-competi/>
- UEFA current club competition league-phase overview: <https://www.uefa.com/uefachampionsleague/accesslist/>

Re-review the external benchmark before implementing later phases: FC features and real competition formats will continue to change, while this document's product principles should remain stable.
