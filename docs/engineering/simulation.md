# Simulation contracts

Read when changing these domains; do not load for unrelated work. Paths in code
spans are repository-relative. These are maintained constraints; verify volatile
implementation details against the current checkout.

### Authoritative football outcome

- `src/modules/matchEngine.js` owns football outcomes.
- Current Broadcast consumes each authoritative action-ledger phase and waits for its scene to complete before advancing; speed/pause affect both clocks. Lineup visuals change after the active scene. See `docs/plan/live-broadcast.md`.
- `src/game/broadcastSimulation.js` is a deterministic spatial/presentation layer. It may visualise an authoritative result/event plan but must never invent a conflicting score, scorer or result.
- Quick Sim and Broadcast must consume the same authoritative football outcome.
- P1 background fixtures also use the authoritative fast match engine. Never run Broadcast simulation for the background world.


### Match simulation versioning and T7 balance gate

- A new fixture owns one coherent simulation tuple: `matchEngineVersion`, `actionResolverVersion`, `actionLedgerVersion`, `rngPacketVersion`. `buildLiveMatchState()` stamps it once. `simulateMatchSegment()` validates it before advancing; partial or unsupported tuples fail explicitly. Do **not** silently relabel an already-started match to the currently loaded simulator. Intentionally unversioned legacy/manual states retain only their documented compatibility path.
- Public/historical match results never retain the authoritative `actionLedger`. Managed results may retain the compact `tacticalAnalysis` projection only; its deterministic regression budget is **<12 KiB**, and AI-v-AI background results keep `tacticalAnalysis:null`.
- CI keeps the unchanged standard 3,000-simulation balance gate and also runs `npm run balance:match:deep:check`: **25 scenarios × 100 paired seeds = 5,000 authoritative simulations**. The T7 guardrails protect relationships rather than pinning one calibration snapshot: player quality must remain stronger than any single reviewed tactic swing, tactics must keep contextual costs/counters, specialists must move their causal domains, fatigue must matter, and every paired scenario must preserve its seed stream. Never widen these guardrails merely to get green.
- World/career browser budgets remain **<20s fresh-career load / <25s full-world week / <50 MiB storage at 4× CPU throttle**, but the old browser benchmark was removed with E2E. Treat the P3 measurements **13.108s / 7.301s / 3.41 MiB** as historical evidence only; re-measure by hand when changing world simulation, persistence or a per-gameweek hot loop.

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
- Persist the initialized queue's season/week even when it is empty. Managed outcome, cup participant projections, cup progress and Manager DNA commit with queue consumption before world closeout; retrying closeout must not rebuild or replay a resolved event. European league-phase matchdays use the indexed scheduled gameweek.
- Quick Sim cup projections consume the report's authoritative home/away team IDs, score, events and fitness updates, matching Broadcast. Broadcast completion validates the pending event and both participants; a matching saved receipt resumes closeout without applying football twice.
- P1's world clock settles background leagues/competitions around this queue; it must not create a parallel user-match lifecycle.

### Competition rules — P0 foundation

- `src/modules/competitionRules.js` is the shared source for competition format/round/schedule/entry/two-leg/UEFA qualification rules.
- `src/modules/cups.js`, `src/modules/gameweek.js` and `src/modules/season.js` consume that layer. Do not reintroduce scattered round-index magic or a second competition engine.
- P0 removed UEFA away-goals semantics.
- P0 models current UEFA 36-team league-phase routes: UCL/UEL 8 user league-phase fixtures, UECL 6; positions 1-8 direct R16, 9-24 knockout play-off, 25-36 eliminated; seeded placement drives relevant home-leg ordering.
- P1 extends the living world across supported domestic and associated competition state; future format changes still belong in the shared rules layer.
- Reduced background domestic fields use `competitionRules.buildKnockoutRoundDraw`: scheduled byes preserve later bracket stages and reserve places for clubs entering in later rounds. The competition simulator and weekly participant prediction consume the same draw, so a bye creates neither a fictional match nor deferred player exposure. A two-legged tie counts as one elimination stage.
- `promotion.js` owns English movement rules: Championship has two automatic promotion places, positions 3–6 in the play-offs and three relegation places; League One has the same promotion route and four relegation places; League Two has three automatic places and positions 4–7 in the play-offs. League Two has no relegation route while the National League is outside the supported world. Named table zones consume these same rules.
- Promotion play-off football uses `matchEngine.simulateMatch` for both semifinal legs and the final, with actual eligible squads and an employed manager's existing lineup, bench, formation, mentality and tactical plan. Rollover resolves these matches before loan returns, aging and medical resets. The former club remains AI-controlled between jobs. Aggregate ties have no away-goals rule and draw decisions use the authoritative match seed. Compact playoff result shapes remain compatible; the old Poisson helpers are retained only for legacy callers, not career progression.

### Living world — P1 foundation

- `src/modules/world.js` owns the canonical living-world match/stat ledger contract. A completed fixture is written once; player/club/competition projections derive from that authoritative record.
- `src/modules/worldRuntime.js` applies persisted canonical results with apply-once semantics. Fixture projection flags, standings and changed player rows commit atomically; do not split that boundary into independent writes.
- Recovery finishes every canonical league fixture for the world week before projecting its batch, so global recovery, form and suspensions settle once. An already-played managed fixture reuses its canonical outcome, seed, tactics and compact tactical report; it is never resimulated or relabelled.
- `src/modules/worldCompetitions.js` owns background domestic/European competition state and its compactable result ledger. Cup projection writes only participant-club players; do not return to full-world rewrites.
- Football inputs use indexed club snapshots in primary-key order; free agents remain in the global personal-state, market and development lifecycles. Cup projection reads only participating clubs. Applied background cup records discard fitness/card/injury projection payloads and full tactical objects in the same transaction as player projection; scores, seeds, versions, goal events, aggregate progress and history leaders remain. Pending records keep their complete recovery payload. Existing careers compact only already-applied records during living-world backfill.
- Current-season player statistics include appearances, starts/minutes, goals, assists, clean sheets, cards/suspensions, injuries, form and ratings. `LeagueScreen.svelte` exposes inspectable living-world club profiles.
- Season rollover persists compact historical summaries and creates the next season's fresh world/competition state. Do not retain an unbounded detailed match ledger across seasons.
- P1 newgens replace retirements from calibrated cohorts; avoid cloning retired players or unconstrained talent inflation.
- Background simulation/persistence is performance-sensitive. The budgets are **<20s fresh-career load, <25s full world week, <50 MiB storage** at a 4× CPU throttle. The browser benchmark that used to assert them (`tests/p1-living-world-performance.spec.mjs`) was deleted with the E2E suite, so **these are now design constraints with no automated guard**: when you touch world simulation, persistence or a per-gameweek loop, reason about the cost explicitly and measure by hand in the running app before claiming it is fine. Historical baselines for reference: P1 12.33s / 18.50s / 2.76 MiB, P2 12.57s / 18.93s / 2.61 MiB, P3 13.108s / 7.301s / 3.41 MiB.

