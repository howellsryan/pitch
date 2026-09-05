# Pitch Contributor Guide

> Current, terse instructions for AI/human contributors. Update this guide in the same change when a load-bearing behaviour or programme status changes.

## 0) Current state — read first

- **Product:** free browser-first football career simulator, 9 leagues / 186 clubs, mobile-first, no forced account. It is **simulator-only**: do not add manual/on-pitch football controls. Broadcast is a watchable presentation of simulated football, not a playable match mode.
- **Live product:** `pitch-sim.com`. The app is built with Vite/Svelte 5 and deployed by **Cloudflare Workers Builds**, not GitHub Actions.
- **R0-R7 redesign is complete.** `docs/plan/07-redesign.md` remains the historical redesign reference. R8 quality/light-mode/PWA work remains a separate parallel quality stream.
- **Post-R7 programme:** `docs/plan/post-r7-career-depth-roadmap.md` is authoritative. **P0 — Football authenticity and career foundation is COMPLETE (30 Aug 2026). P1 — The Living Football World is COMPLETE (31 Aug 2026). P2 — Match Engine 2.0, Tactics and Manager DNA is COMPLETE (31 Aug 2026). P3 — Player Model 2.0 is COMPLETE (1 Sep 2026). P4 — Transfer Market and Contracts 2.0 is COMPLETE (1 Sep 2026). P5 — Scouting, Coaching, Training and Squad Planning is COMPLETE (1 Sep 2026). P6 — Manager Career and Living Manager Market is COMPLETE (2 Sep 2026). P7 — Club Identity, Finance, Board and Facilities is COMPLETE (3 Sep 2026). Next: P8 — Story Engine, Press, Fans and Rivalries.**
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

### Matchday squad: XI, bench, reserves

- `matchEngine.js` owns the whole selection contract: `MAX_MATCHDAY_BENCH` (9),
  `selectBench`, `selectReserves`, `pruneBenchToSquad`. `save.bench` is an
  additive array of player ids; **`null` means automatic**, an array means the
  manager named it and is honoured **exactly** — no back-filling, because a
  back-fill silently undoes a removal. A named substitute who is injured or
  suspended therefore leaves an empty seat (shown as such on the Squad strip),
  exactly as a real team sheet would.
- The automatic bench reserves its **last** seat for a goalkeeper. Substitutes
  are shifted off the *front* and a match can use only three, so this — and the
  9-cap itself — leaves every AI/background result bit-identical. Do not
  reorder the bench without re-checking that.
- `save.bench` is threaded through the same seams as `save.lineup`
  (`gameweek.js` league/cup/European, `cups.js`, `managerTactics.js`'s
  `buildManagedMatchInputs`, `MatchScreen`) via `simulateMatch`'s existing
  `options`; `deriveMatchSeed` does not read it, so seeded parity is unchanged.
- **Because the bench is honoured exactly, an unresolvable id costs a
  substitute rather than being ignored.** Every path that moves a player out of
  the managed squad must clear their seat: `db.js`'s deal settlement (keyed on
  where each player *ends up*, so a loan-back player is not evicted),
  `transfers.js`'s `acceptOffer`/`loanOutPlayer`, `contracts.js`,
  `startingFreeAgents.js`, `season.js` rollover (retirees excluded),
  `managerClubHandover.js`. `SquadScreen`'s load-time `pruneBenchToSquad` is the
  self-heal, not the mechanism. `src/game/matchdaySquad.js`'s
  `reconcileBenchWithLineup` keeps the bench in step when the XI changes.
- There is **no squad-size ceiling**. The old 30-senior cap
  (`buyer_squad_full`, `SQUAD_FULL`, `DESTINATION_SQUAD_FULL`) is gone from
  settlement, squad planning, academy promotion and loans. Only the *selling*
  side is still guarded, so a club can never be left unable to field a team or
  without a keeper. `simulateAITransfers`' own `>= 28` appetite check stays —
  that is a club choosing not to buy, not a validation.

### Recruitment lists: scouted keys, not canonical rows

- `scoutingView.js`'s `projectScoutedListKey` is what the Buy list sorts and
  filters on. Filtering or ordering a world-sized list on canonical attributes
  both contradicts the fogged figures on screen and leaks true ability through
  the sort order, so **every ability/fee/potential predicate reads the key**.
  `scoutingView.test.js` asserts the key equals the full projection field for
  field, including across the confidence-rounding step boundaries; a field
  added to `currentEffectiveLevel`/`potentialEstimate` and not to the key's shim
  fails that test rather than skewing the market quietly.
- `scouting.js`'s `observedPlayerBands` is the single implementation of the
  report arithmetic; `buildScoutingReport` is that plus the tactical/status
  prose. Do not fork it for a cheaper caller.
- Only one page (`src/game/marketPagination.js`, 100 rows) is ever projected in
  full. Projecting the whole world cost ~330 ms per load and was why the list
  could fail to appear; it is ~90 ms now. `coachingEffects` normalises only the
  department it needs, which was the single biggest cost in building a report.

### Who negotiates personal terms

- `transferMarket.js`'s `managedBuyerOwnsPersonalTerms` decides this: the
  manager negotiates a player's wage **only** when their own club is buying and
  the deal is not delegated. Selling a player, or watching two AI clubs trade,
  resolves through `resolveBuyerLedContractResponse` — the buying club meets the
  demands (bounded by `BUYER_WAGE_STRETCH`, a wage-against-wage judgement, never
  the transfer-fee `budget`) or the move collapses. This also fixed a real
  pre-existing defect: AI-vs-AI and user-as-seller deals whose player countered
  were parked on `awaiting:'user'` forever, which `advanceTransferMarketWeek`
  skips. `transferMarket.test.js` sweeps the parameter space asserting no
  seller-side deal is ever parked on the manager.

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

**P7 is complete.** WP7 wired the previously-unwired backend into product surfaces and closed the phase's one real design gap. `home_transfers.js`'s existing end-of-season "Board Objective" section (already live, pre-P7) now shows the real 3-objective breakdown (`summary.boardContract.objectives`) using the semantic status colors (`--color-live`/`--acc2`/`--acc3`, never the club accent, per `.claude/rules/svelte5.md`), alongside the pre-existing single-line MET/MISSED verdict left byte-identical. `SettingsScreen.svelte` gained a "Club" card mirroring the existing Manager Career card's patterns: available funds (`availableFunds`), the board's own financial-health read (`financialPressure`), the last 4 ledger entries, and a row per facility track with its level, upgrade cost or in-progress ETA, and an Upgrade button wired to `p7Runtime.js`'s previously-unreachable `startFacilityUpgrade` IO command. The phase's substantive decision was resolving `dismissalRecommended`: `season.js`'s `processEndOfSeason` now computes `const dismissed = sacked || dismissalRecommended` and, when true, calls the same `dismissAndCaretake(userManagerRow, caretaker, { weekKey, reason:'dismissed' })` P6 already built for voluntary resignation — a caretaker takes the club immediately, the user's manager becomes a free agent with career/honors intact, and a vacancy opens in `save.managerMarket` for Settings' Manager Career card to surface. This replaced the old `summary.sacked` -> `resetForNewCareer()` hard save-wipe, discovered mid-phase to be a real, previously-undocumented inconsistency with P6's own soft unemployment model (see the WP4 paragraph below for the full discovery/reasoning). `resetForNewCareer()` is no longer reachable from the season-end flow; it remains only as Settings' own, unrelated, user-initiated "Start New Career" reset. **Known, disclosed limitations, not fixed this phase:** Home/Squad/Transfers/League are not yet unemployment-aware (only `SettingsScreen.svelte` reads `userManager.status`), so the old club stays nominally playable from Home until a new job is accepted — inherited from P6's resignation flow, not introduced here; Inbox posts for facility-upgrade completion and obligations settling are not yet wired (the Inbox system itself is real and already used for season/transfer/injury/academy news); and per this session's own process, this specific WP7 UI (the Club card, the board breakdown, the rewritten sacked modal) was **not hand-verified with a rendered screenshot** — the user explicitly chose to skip that step, a real gap against §7's own visual-verification rule worth a follow-up pass.

**P7 WP6 — facilities.** `src/modules/facilities.js` adds three bounded, integer-tiered (1-5) infrastructure tracks — `training`, `medical`, `scouting` — each with cost (rises with level, £4M/level), a fixed 6-week lead time, and a real P3/P5 consumer. **Academy (the guide's 4th track) is deliberately not built here**: `team.academyInvestment` (P3) already is a working, tested, instant-buy 0-100 mechanic with a real consumer (`youthAcademy.js`'s cohort generation); duplicating it as a second lead-time-gated mechanic would split one number into two competing sources of truth for no present benefit, especially since academy's deeper P9 consumer doesn't exist yet. `beginFacilityUpgrade`/`completeDueFacilityUpgrades` mirror WP3's obligations exactly (cost debited immediately via `applyLedgerMovement`, category `facility_investment`; level change scheduled via the same `dueSeason`/`dueGameweek` + season-rollover catch-up pattern as `isObligationDue`; `completeDueFacilityUpgrades` returns the same team reference when nothing's due, same `!==` contract as WP5's `evolveClubPhilosophy`); wired into `p7Runtime.js`'s existing weekly tick alongside `settleDueObligations`, one combined `bulkPut`. Every consumer selector (`trainingEfficiencyMultiplier`, `medicalRecoveryMultiplier`, `scoutingCapacityBonus`, `scoutingConfidenceMultiplier`) returns exactly the neutral value at level 1 (the pre-upgrade/pre-backfill baseline), so an existing career sees zero behaviour change until it actually upgrades something. Consumer wiring — researched via a dedicated subagent pass to find the exact minimal hook points, deliberately avoiding `matchEngine.js` and any world-wide-scope P3 settlement function — reaches only the **user's own managed squad**: `p5Runtime.js`'s `refreshPlanContext` folds `trainingEfficiencyMultiplier` into `coachingMultiplier` (absorbed by `training.js`'s existing `[.91,1.09]` clamp, so it can't widen the pre-existing bounded envelope); a new pure `applyMedicalFacilityMultiplier(player, recoveryMultiplier)` sets a bounded `player.rehabilitation.facilityRecoveryMultiplier` field that `playerRehabilitation.js`'s `settleRehabilitation` reads back (that file stays import-free by its own architectural rule — deliberately does **not** touch `matchEngine.js`'s live in-match reinjury-risk roll, judged too risky to rush into the authoritative match engine's hot path for this slice); `scouting.js`'s `createScoutingAssignment` gains an optional `context.assignmentCap` (defaults to the unchanged `MAX_SCOUTING_ASSIGNMENTS`) and `buildScoutingReport`'s existing confidence calc folds in `scoutingConfidenceMultiplier` using the `userTeam` context it already receives. **AI clubs' facilities are deliberately inert for now**: `decideAIFacilityInvestment` (deterministic, `financialCaution`-damped, solvency-gated) is fully built and tested but **not called** from `season.js` — code review caught that calling it would have AI clubs spend real ledgered money on upgrades with zero gameplay effect, since none of the consumer wiring above reaches a background AI club's players (that would need threading a facility multiplier through the world-wide P3 settlement path, a separate, larger piece of work). `team.facilities` is backfilled idempotently exactly like every other P7 field (`save.facilitiesVersion` gate, `ensureP7Facilities`). A new `startFacilityUpgrade(track)` IO command in `p7Runtime.js` is ready but not yet called from anywhere — WP7 wires it to a product surface.

**P7 WP5 — manager/club fit and evolving identity.** `clubPhilosophy.js`'s `evolveClubPhilosophy(philosophy, boardContractResult)` lets a season's board-contract outcome nudge specific trait weights by exactly +/-2 (financial objective ok/review -> `financialCaution` +/-2, youth ok/review -> `youthPathway` +/-2, sporting met only -> `starRecruitment` +2, never decremented on a miss), clamped to plain [0, 100] — never a narrower band, so a single season's move is always exactly ±2 regardless of the trait's current value, avoiding a code-review-caught edge case where a value seeded near a narrower clamp band would otherwise jump by more than one season's worth in one go. It returns the *same* `philosophy` reference when nothing actually moves (another review catch: the first version always produced a same-value copy, defeating a caller's `!==` check and causing an unconditional, pointless `putTeam` write every season) — `season.js`'s `processEndOfSeason` uses exactly that `!==` check before persisting. The evolution runs once per season, right after `boardContractResult` is computed and before `nextBoardContract`/`nextBoardObjective` are generated for the following season (so the new season's youth-appearance target already reflects any shift), and a compact `summary.clubIdentity` snapshot (`{philosophy, financialPressure, cash}`) is recorded in the immutable per-season history alongside it. `evolveClubPhilosophy` reads `boardContractResult.objectives[].status` as bare `'ok'/'review'` string literals rather than importing `boardContract.js`'s `OBJECTIVE_STATUS` enum (importing it would cycle, since `boardContract.js` already imports from `clubPhilosophy.js`) — `clubPhilosophy.test.js` cross-checks the literals against the real enum values so a future rename in `boardContract.js` fails a test instead of silently desyncing. `managerAppointments.js`'s `philosophyFit` (WP1) now also weighs financial fit more heavily when the club is genuinely under financial pressure (`financialWeight` 0.6/0.45/⅓ for critical/strained/stable, reusing WP3's `financialPressure`) — hoisted to compute once per vacancy in `assembleCandidates` rather than once per candidate (a review-caught, if minor, waste since every candidate was scored against the identical unchanged `team`). `squadPlanning.js`'s `buildSquadNeeds` already re-reads `team.philosophy` fresh on every call with no caching (confirmed by grep, not by adding code) — so "recompute P4/P5 recruitment needs after meaningful identity change" was already satisfied structurally by WP1's original no-cache design; there was nothing to build for that bullet.

**P7 WP4 — multi-objective board contract.** `src/modules/boardContract.js` replaces the single sporting finish-target with a weighted 3-objective contract (sporting 0.5, financial 0.25, youth 0.25). `generateBoardObjective`/`evaluateBoardObjective` were **moved** here from `season.js` (not duplicated) — the dependency had to become one-directional (`boardContract.js` -> nothing in `season.js`; `season.js` -> `boardContract.js`) since `season.js`'s `processEndOfSeason` needs to call the new season-close evaluator, and `boardContract.js` needs the sporting objective's own generator/evaluator; every prior import site (`save.js`, `managerClubHandover.js`) was repointed at `boardContract.js`. The youth objective's target (4-12 season-total U21-league-appearances) scales with the club's own WP1 `youthPathway` philosophy trait; the financial objective reads WP3's `financialPressure(team)`; `youthAppearancesFor` sums the existing P1 `player.appearances` field for age-≤21 squad players — no new player schema. `save.boardContract`/`save.boardContractVersion` are backfilled idempotently via `save.js`'s `ensureP7BoardContract` (same pattern as WP1-3), called after `ensureP7ClubFinance`; `save.boardObjective` (the old single-target field) is kept untouched, so `liveBoardConfidence`/every pre-P7 consumer is unaffected — verified by hand: a fresh career's Home screen renders byte-identical to pre-WP4. `evaluateBoardContractSeasonClose` is a pure function scoring each objective ok/warning/review and a weighted 0-1 score; `dismissalRecommended` is true only when the **sporting** objective is itself `review` AND the overall score is poor (missing one minor objective alone never risks the job). Code review caught two real bugs before this shipped: (1) an initial version blended the weighted score into `nextJobSecurity`'s inputs, which meant a title-winning-but-cash-strapped club could show "Objective: MET" while job security tanked as if it had been missed — reverted, so `nextJobSecurity`/`sacked` are driven **only** by the single sporting objective exactly as pre-WP4, and the board contract's judgment is surfaced (`summary.boardContract`, `summary.dismissalRecommended`) but never blended into that live number; (2) `evaluateBoardObjective`'s fixed ±3 margin for `avoid_relegation` meant a club relegated in dead last scored the same mild severity as one relegated on the final day — fixed by resolving the actual position target the same way `liveBoardContractConfidence` already did and computing severity from the real position gap. **Correction to an earlier version of this paragraph:** an incomplete repo-wide grep (it missed `src/ui/*.js` entirely, a real, still-live legacy layer distinct from `src/lib/ui/`) previously and wrongly claimed the Inbox was an unconsumed stub and that nothing read `summary.sacked`. That is false: `src/main.js` imports `src/ui/inbox.js` and `src/ui/home_transfers.js` for side effects, and `home_transfers.js`'s `handleEndOfSeason()` already reads `summary.sacked` to show a real modal, posting `newsSeasonEnd`/`newsPromotion`/`newsRelegation`/`newsYouthIntake` to a real, working Inbox. That discovery surfaced a genuine architectural conflict this guide's earlier text used to justify leaving `dismissalRecommended` unexecuted: `summary.sacked` (pre-dating P6) used to drive a **hard** reset — the sacked modal's only action was `resetForNewCareer()`, discarding the save's whole manager career — while P6's own `dismissAndCaretake`/job-market flow (used only for the user's *voluntary* resignation, via `managerUserActions.js`) is a **soft** transition to unemployed-and-browsing-vacancies. **P7 WP7 resolves this by unifying the two onto the soft path**, since it's the one consistent with P6's own manager-career premise (a sacked manager's career continues; a wiped save does not) and `dismissAndCaretake`'s `reason:'dismissed'` branch (incrementing `record.sackings`) already existed for exactly this case, just unused. `season.js`'s `processEndOfSeason` now computes `const dismissed = sacked || dismissalRecommended` (the pre-existing job-security trigger OR the new board-contract judgment — the latter can never fire when the sporting objective was actually met, since `dismissalRecommended` requires that objective's own status to be `review`, so this can't reintroduce the "MET but fired" bug code review caught above) and, when true, calls the same `dismissAndCaretake(userManagerRow, caretaker, { weekKey, reason:'dismissed' })` P6 built for resignation: a caretaker takes the club immediately, the user's manager becomes a free agent with honors/career history intact, and a vacancy is appended to `save.managerMarket` so the user can be approached/apply from Settings' Manager Career card, exactly like resigning. `resetForNewCareer()` is no longer reachable from this flow (it remains as SettingsScreen's own, unrelated, explicitly-user-initiated "Start New Career" reset). `home_transfers.js`'s sacked modal now says so and offers "Continue →" (the same `renderHome()` continuation as a normal season-complete) instead of a destructive reset, and posts a new `newsManagerDismissed` inbox item. **Known, disclosed limitation, inherited from P6 rather than introduced here:** Home/Squad/Transfers/League are not yet unemployment-aware — only `SettingsScreen.svelte` reads `userManager.status` (confirmed by grep) — so after *any* unemployment (this new dismissal path, or the pre-existing voluntary resignation) the old club's fixtures stay nominally playable from Home until the user accepts a new job. Making every screen unemployment-aware (gating Play, showing a dedicated unemployed state) is a separate, larger multi-screen feature, not a P7 wiring task.

**P7 WP3 — transfer/wage/income integration.** `clubFinance.js` gains `finance.obligations` (an additive field on the existing ledger shape — no `CLUB_FINANCE_VERSION` bump, since bumping it would trigger a re-backfill that discards a save's already-accrued `seasonTotals`/`recentEntries`; a `normalizedFinance()` helper defaults a missing `obligations` array to `[]` instead) plus `scheduleObligation`/`isObligationDue`/`settleDueObligations`. P4's transfer-fee installments (`terms.fee.installments`, each with `dueSeason`/`dueGameweek`, already normalized and settable from `TransfersScreen.svelte` but previously **paid entirely upfront at settlement despite the due-date fields** — a real gap this WP closes) are now genuinely deferred: `db.js`'s `settleTransferMarketDealAtomic` pays only `upfrontFee + signingBonus + loanWages` immediately and schedules each installment as a paired obligation (buyer payable, seller receivable) via `scheduleObligation`. `src/modules/p7Runtime.js`'s `advanceP7ClubFinanceWeek` — wired into `gameweek.js`'s `runEndOfWorldGameweek` after `advanceTransferMarketWeek` and before `payWeeklyWages` — pays every team's due obligations once per completed world gameweek; removal from the array is the idempotency guard (no separate weekKey tracking needed, since a re-run naturally finds nothing left to pay). `isObligationDue` has a catch-up safety net: an obligation is due once its gameweek is reached in its scheduled season, OR once the save has moved to a different season entirely (a deal made late enough that its due gameweek would fall after that season's rollover would otherwise never match `dueSeason` again and orphan silently). `availableFunds` (and now `financialPressure`) subtract a club's own unpaid payables, not just active-deal reservations — `db.js`'s affordability check was fixed during code review to actually use `availableFunds` instead of raw `budget`, closing a real gap where a club could serially agree to more installment debt than it could ever service. `clubFinance.js`'s new `operatingIncomeFor(reputation)` — deterministic, no `Math.random()` — replaces WP2's interim 25%-convergence placeholder with a real recurring commercial-income credit applied to every club each season, the user's own included (previously excluded; P7's "AI uses the same affordability and solvency rules as the user" decision requires symmetry). The old `reputationBudget()` formula is now dead code in every real call path but is deliberately kept, not deleted: removing it crashes `src/validate.js`'s legacy "Budget Scaling" section with an uncaught `ReferenceError` rather than a clean, allow-listable `FAIL` line. **Explicitly deferred**, per the guide's own bullet list being larger than installments alone: bonus payments (appearance/goals/clean-sheets/promotion/trophy-triggered, `terms.contract`/`normalizeBonuses` already exist but are unconsumed) and sell-on percentages (a cross-club future-transfer revenue share) — both need their own dedicated design pass, not a rushed extension of this slice.

**P7 WP2 — club finance ledger.** `src/modules/clubFinance.js` adds a new additive, versioned `team.finance` ledger (`cash`, `seasonTotals` by category, a capped `recentEntries` audit trail) via the same idempotent-backfill pattern as WP1/P6 — `save.clubFinanceVersion` gates `ensureP7ClubFinance`, called from `initApp()` after `ensureP7ClubPhilosophy`. Opening cash is seeded from the existing `team.budget` unchanged (no opening double income). `team.budget` stays exactly as the guide's locked decision requires — "a temporary compatibility projection... never an independent second balance" — and the invariant that makes that safe is structural: **every** budget-mutating write in the codebase now routes through `applyLedgerMovement` (an individually-attributable debit/credit, used by `transfers.js`'s `buyPlayer`/`sellPlayer`/`acceptOffer`/`loanOutPlayer`/`loanInPlayer`, `db.js`'s `settleTransferMarketDealAtomic`, `season.js`'s `payWeeklyWages`/prize-money credit, `p5Runtime.js`'s coaching costs, `youthAcademy.js`'s `investInAcademy`) or `syncLedgerCash` (a mirror-only sync for `transfers.js`'s two AI-vs-AI batch functions, `simulateAITransfers`/`simulateAILoans`, which accumulate deltas in an in-memory map across many synthetic deals before one `bulkPut` — those deals aren't user-attributable and per WP7's own design other clubs' exact finances stay abstracted, so no per-deal ledger entry is recorded there). Nothing else may write `budget` directly — a code review during this slice caught exactly one remaining raw-arithmetic site (`db.js`'s deal settlement) that would have silently drifted `finance.cash` from `budget` the first time any club completed a P4 negotiated deal; `transferMarketRuntime.test.js` now guards against that regression by source-inspection. The existing `squadPlanning.js` `transferAvailableBudget` selector — already every AI/UI affordability check's entry point — now delegates to `clubFinance.js`'s `availableFunds`, so there's one spending-power selector, not two. **Explicitly deferred to WP3** (per the guide's own work-package split, "Transfer, wage and income integration"): the P4 negotiated-deal's *installment/due-date scheduling* (only the upfront settlement amount is ledgered so far), and season.js's non-user AI budget reset — the old code force-reset every AI club's budget to a fresh reputation formula every season, discarding all in-season spending; WP2 replaces it with a bounded 25%-per-season convergence toward that same reputation-implied target via `applyLedgerMovement`, avoiding both a jarring one-time wealth swing and runaway wealth/debt drift, as an interim placeholder ahead of WP3's fuller operating/commercial income abstraction.

**P7 WP1 — club philosophy.** `src/modules/clubPhilosophy.js` adds a new additive, versioned `team.philosophy` field (8 weighted 0-100 traits: `youthPathway`, `buyToSell`, `financialCaution`, `starRecruitment`, `domesticPriority`, `europeanAmbition`, `possessionIdentity`, `directIntensity`) via the same idempotent-backfill pattern as P6's `managers.js` — `save.clubPhilosophyVersion` gates `save.js`'s `ensureP7ClubPhilosophy`/`buildClubPhilosophyBackfill`, called from `initApp()` right after `ensureP6Managers`. No `DB_VERSION` bump, no new store: `philosophy` is just a new field on the existing `teams` store, seeded deterministically (`tactics.js`'s `stableStringHash`, never `Math.random()`) from reputation/league/the club's existing AI tactical archetype (`getAITacticalProfile`) so possession/directness identity never contradicts the formation the club already plays with. Two bounded consumers land in this same slice: `managerAppointments.js`'s `scoreCandidateFit` gets a `clubFit` component (reweighted 0.55/0.30/0.15 -> 0.48/0.27/0.10/0.15) comparing philosophy traits against the candidate's existing `reputation.{youth,financial,overall}`, and `squadPlanning.js`'s `buildSquadNeeds` nudges budget-share allocation (`starRecruitment`/`financialCaution`) and preferred recruitment age (`youthPathway`) by a capped amount. Both consumers default to exactly the pre-P7 neutral value when `team.philosophy` is absent, so a team object built without one (an old save mid-migration, or an existing test) behaves identically to before this slice landed — verified by dedicated tests in both files' `*.test.js`. Deeper identity evolution (manager outcomes nudging philosophy weights, board/finance consuming it) is P7 WP4/WP5, not this slice.

**P6 is complete.** `src/modules/managerUserActions.js` is the thin IO command layer (`getManagerCareerView`, `resignAsManager`, `applyForVacancy`, `respondToApproach`, `tryCompletePendingUserHandover`) a UI calls; it deliberately does not run from `p6Runtime.js`'s tick — `managerClubHandover.js` imports `gameweek.js` for `buildPendingEvents`, and `gameweek.js` imports `p6Runtime.js`, so importing the handover module from the tick would be a real cycle the legacy bundler cannot express. Executing an accepted offer therefore happens from the UI layer: right after accepting, and opportunistically on every app load — every screen's Svelte component mounts unconditionally at boot (`src/main.js`), so `SettingsScreen.svelte`'s own `$effect`-driven `load()` (which calls `tryCompletePendingUserHandover`) runs on boot regardless of which screen is visually active, giving the "complete at the next safe boundary" guarantee without a dedicated app-level hook. `save.managerMarket.userApproaches` entries carry a `source: 'approach' | 'application'` — a club-initiated approach (has a fit score) and the user's own proactive application (does not) are never conflated in the UI, and a club already being pursued is excluded from the open-vacancies list. The one UI surface is a "Manager Career" card + sheet on `SettingsScreen.svelte` (profile, resign with a safe-boundary-gated confirm step, approaches/applications/open-jobs for the unemployed case) — verified by hand at 390×844 against the built `dist/` (not the Vite dev server directly: `root: 'web'` with a `../src/main.js` relative entry needs the SPA-fallback-aware production build/preview to resolve correctly for a scripted browser check; `npm run dev` is fine for a human in an actual browser). Manager `age` now increments by one at every `processEndOfSeason` rollover (`season.js`) — without this, `shouldRetire` could never fire for a manager who started below their `retirementAge`, across any number of seasons.

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

### P6 completion baseline

- a dedicated `managers` IndexedDB store (`DB_VERSION` 3→4) with an idempotent, `managerModelVersion`-gated backfill giving every club exactly one manager entity;
- a bounded, versioned `save.managerMarket` (vacancies, review checkpoints, processed week keys, capped recent-appointments, user approaches/applications, pending handover) with no second manager/job-market persistence path;
- one shared appointment state machine (`managerAppointments.js`) driving both AI hiring and the user's own resignation/approach/application/accept flow, with same-tick candidate reservations so two vacancies can never be awarded the same manager;
- a bounded projection adapter (`managerCompetitionHandoff.js`) reconciling the `save.cups` vs `save.worldCompetitions` shape mismatch on club-control transfer, rather than a riskier full unification;
- an atomic, idempotent club-control handover (`managerClubHandover.js`) gated on the same empty-`pendingEvents` safe boundary as every other P6 control change;
- a "Manager Career" card + sheet on `SettingsScreen.svelte` (profile, safe-boundary-gated resignation, approaches/applications/open-jobs) verified by hand at 390×844 against the built `dist/`;
- manager `age` increments at every season rollover so age-based retirement can actually fire over a multi-season career;
- **471/471 Vitest tests** green, plus the UI emoji audit and 186/186 club accent checks.

### P7 completion baseline

- an additive, versioned `team.philosophy` (8 weighted traits, deterministically seeded) and `team.finance` ledger (cash, seasonTotals, capped audit trail, scheduled obligations) — every budget-mutating write in the codebase routes through one `applyLedgerMovement`/`syncLedgerCash` pair so the legacy `team.budget` field can never drift from `finance.cash`;
- a weighted 3-objective board contract (`boardContract.js`, sporting/financial/youth) replacing the old single finish-target, with a season-close verdict and a `dismissalRecommended` judgment that is now actually executed, not just surfaced;
- three bounded, integer-tiered facility tracks (`facilities.js`: training/medical/scouting) with real, capped consumers for the user's own managed squad, and one weekly runtime tick (`p7Runtime.js`) settling obligations and completing facility upgrades;
- board-driven dismissal and the pre-existing job-security trigger unified onto the one soft `dismissAndCaretake` handover P6 already built for resignation — replacing a hard `resetForNewCareer()` save-wipe that was inconsistent with P6's own manager-career premise;
- product surfaces: the season-end board-objective breakdown, and a "Club" card (finance + facility upgrades) on `SettingsScreen.svelte`;
- **591/591 Vitest tests** green, plus the UI emoji audit, 186/186 club accent checks, and the legacy `build.py`/`validate_p0.py` bridge (92/92 deterministic replacement contracts);
- disclosed, not fixed this phase: AI clubs' facilities are inert (no consumer wiring reaches background clubs yet); Inbox isn't yet fed by facility/obligation events; Home/Squad/Transfers/League aren't unemployment-aware; this phase's own final WP7 UI (the Club card, board breakdown, rewritten sacked modal) was not hand-verified with a rendered screenshot.

**Next roadmap milestone after P7:** `P8 — Story Engine, Press, Fans and Rivalries`, building on P7's club-identity/finance/board state rather than replacing it.

### Testing policy (supersedes any earlier phase wording)

Verification is Vitest contracts plus hands-on inspection of the running app.
There is no browser/E2E suite and none is to be introduced — see §3.
