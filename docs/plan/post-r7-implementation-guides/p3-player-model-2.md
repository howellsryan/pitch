# P3 Implementation Guide — Player Model 2.0

> Planning document only. This guide defines the execution route after P2. It does not implement P3.

## Outcome

P3 makes selection, rotation, development, morale, playing time and injury return read from one coherent player model. Durable football ability remains separate from short-term effective performance, and every consumer uses shared selectors rather than inventing its own rating.

P3 is complete when a player's baseline quality, effective level, potential uncertainty, growth path, morale, sharpness, squad role, positional suitability, traits and rehabilitation state survive save/import/season rollover and materially affect both managed and background matches.

## Entry gate

Do not start P3 until the P2 closeout confirms all of the following on the latest green main:

- matchEngine.js remains the only authoritative outcome engine;
- seeded/serialisable match RNG is stable across Quick Sim and segmented Broadcast;
- tactics.js owns the shared instruction and player-role schema;
- managerTactics.js supplies the same managed inputs to watched and quick-simmed matches;
- P2 migrations preserve existing formation, mentality and lineup;
- the roadmap and contributor guides mark the actual P2 completion state.

If any item is incomplete, finish P2 first. Do not build P3 around a temporary P2 adapter.

## Current repository baseline

| Concern | Current owner | P3 implication |
|---|---|---|
| Positional rating | matchEngine.primaryRating, with duplicates in potential.js, transfers.js and season.js | Replace duplicate calculations with one player-model selector |
| Durable attributes | Player rows: attack, midfield, defence, goalkeeping | Treat these as baseline ability; do not add a competing stored overall |
| Potential/development | potential.js: potentialRating, growthPoints, peakAge | Migrate behind growth-profile and uncertainty contracts |
| Form/stat history | world.js and worldRuntime.js | Reuse canonical P1 match records; never derive a second result history |
| Fitness/injury | matchEngine.js and injuries.js | Split energy, sharpness and rehabilitation without breaking injury cadence |
| User tactical roles | save.playerRoles | Keep tactical assignment manager-owned; positional suitability stays player-owned |
| Selection/UI | SquadScreen.svelte, TransfersScreen.svelte, AcademyScreen.svelte | All must consume the same selectors and labels |
| Persistence | Existing players store plus additive lazy backfills in save.js | Prefer additive row migration; DB_VERSION changes only for a required index/store |

## Locked architecture decisions

1. Add a pure, DOM-free player-model module as the canonical home for player schema defaults and selectors. It must not import matchEngine.js, IndexedDB or UI.
2. Existing attack/midfield/defence/goalkeeping values are the durable baseline attributes. Current effective level is derived, never independently persisted.
3. Keep distinct causes distinct:
   - form comes from recent canonical match performance;
   - confidence/morale comes from personal outcomes and promises;
   - sharpness comes from match/training exposure;
   - fitness remains physical energy;
   - rehabilitation describes medical availability and reinjury risk.
4. Squad role and playing-time expectation are explicit agreements with evaluation windows. They are not inferred each render from rating rank.
5. Position suitability is a persisted map. Position conversion changes suitability gradually and does not silently replace primary position.
6. Potential shown to the user is an estimate/range whose precision comes from knowledge/scouting. The durable ceiling can remain hidden.
7. P3 extends the P2 RNG discipline to development, decline, position conversion and reinjury. Statistical balance must be repeatable.
8. User and AI players share one player model. Background fixtures may use cheaper projections, but not different rules.

## Canonical player contract

Use one version marker for the P3 player contract. The exact field names may change during the plan gate, but the ownership must not.

| Concept | Persisted on player | Derived |
|---|---:|---:|
| Baseline attributes and primary position | Yes | Baseline positional level |
| Potential ceiling and growth profile | Yes | Potential range/label |
| Position suitability map | Yes | Effective level for a selected position |
| Traits/style identifiers | Yes, bounded list | Trait effects and explanations |
| Individual morale/confidence | Yes | Bounded performance/development modifier |
| Sharpness | Yes | Preparedness modifier |
| Squad role and playing-time agreement | Yes | Promise status |
| Recent form and P1 stats | Existing fields | Form modifier |
| Injury/rehabilitation state | Yes | Availability and reinjury risk |
| Current effective level | No | One selector used everywhere |

Keep the persisted form compact. Do not store explanatory strings, computed labels or duplicate ratings.

## Work packages

### WP1 — Contract, selectors and migration

- Introduce the pure player-model contract, normalisers and selectors.
- Centralise positional rating and effective-level calculation.
- Keep temporary compatibility exports in existing modules while callers migrate.
- Add an idempotent P3 backfill for:
  - all persisted player rows;
  - save.youthCohort;
  - team.youthPlayers;
  - generated/newgen and free-agent rows.
- Record a domain version so the migration does not scan/write the full world on every load.

Gate: an old P2 save opens with identical baseline ratings, fixture state, lineup and world history.

### WP2 — Effective level, morale and sharpness

- Define bounded contributions from baseline level, position fit, form, confidence/morale, sharpness, fitness and injury recovery.
- Feed effective values into selection, team strength, role suitability, transfer valuation and player detail projections.
- Update personal state once per settled world gameweek from canonical participation/results.
- Apply decay/recovery even when the user has no fixture.
- Keep team morale as a compatibility input until all consumers intentionally migrate; do not silently delete it.

Gate: changing one input has an explainable bounded effect, and the same player receives the same effective level in Squad, Market and match simulation.

### WP3 — Squad roles and playing-time promises

- Define crucial, important, rotation, squad and prospect expectations.
- Set default roles from age, ability rank and contract context during migration/new-career creation.
- Track scheduled starts/minutes over rolling checkpoints, not a single match.
- Produce fulfilled, at-risk and broken states.
- Feed results into individual morale, renewal interest and later P4 transfer behaviour.
- Supply safe automatic defaults so the system does not create weekly admin.

Gate: promise evaluation is idempotent for a gameweek and cannot count a replayed canonical result twice.

### WP4 — Multiple positions and traits

- Persist suitability by supported position, including the primary position at full suitability.
- Make lineup slot fit explicit in selectEleven and manual selection warnings.
- Add a deliberately small, config-driven first trait set with engine/recruitment consumers.
- Use P2 roles and team instructions when explaining fit; do not duplicate P2 role definitions.
- Add position-conversion progress as a development pathway, not an instant edit.

Gate: an out-of-position player is usable with a visible, deterministic cost; a completed conversion survives transfer and season rollover.

### WP5 — Growth profiles and potential uncertainty

- Replace uniform age thresholds with config-driven profiles such as early peak, normal, late developer, extended peak and rapid decline.
- Refactor weekly development to consume P1 minutes/ratings and the P3 personal state exactly once.
- Use seeded randomness for gains/declines and add population-level regression bands.
- Keep true potential private; expose a range and confidence suitable for the current club knowledge.
- Ensure youth/newgen generation assigns calibrated profiles without inflating world quality.
- Update value only from canonical selectors, not from a separate transfer-only rating formula.

Gate: multi-season simulations stay within agreed rating, age and potential distributions.

### WP6 — Rehabilitation and reinjury

Implement the explicit state path:

injured → rehabilitation → medically available/high risk → match fit.

- Preserve current injury type and duration data.
- Add recovery progress, medical availability, sharpness loss and reinjury risk.
- Allow an early-return decision only when medically available.
- Make early return affect selection warnings and the seeded injury roll.
- Ensure ordinary recovery remains automatic for users who do not intervene.
- Carry serious-injury history into P1 season summaries without retaining unbounded detail.

Gate: a recovered player is not instantly 100% match fit, and reload cannot advance rehabilitation twice.

### WP7 — Product integration and retirement of adapters

- Update Squad player detail, lineup warnings and role controls.
- Update Transfers and Academy to show effective level and uncertain potential consistently.
- Add compact Home/Inbox signals only for actionable promise or rehabilitation decisions.
- Migrate match engine, potential, transfers, season and youth callers to shared selectors.
- Remove duplicate rating helpers only after repo-wide search proves no live caller remains.
- Update help copy and contributor documentation.

Gate: mobile selection remains usable at 390×844 with no extra permanent dashboard clutter.

## Lifecycle ordering

At one completed world-gameweek boundary:

1. project canonical match results and participation;
2. apply fitness/injury events;
3. update form, sharpness, individual morale and promise evidence;
4. settle development/conversion once;
5. advance rehabilitation for the elapsed week;
6. persist only changed player rows;
7. evaluate actionable notifications.

Do not insert these steps inside each pending league/cup event. One user week may contain multiple events and must still settle personal state once.

## Persistence and compatibility

- Do not increment DB_VERSION merely to add fields to existing player rows.
- If no store/index is required, use a versioned additive domain backfill and bounded bulk writes.
- Keep the V2 save envelope if the exported snapshot remains backward-compatible; bump it only if import semantics require an ordered migrator.
- Never mutate source league data to hold career state.
- Migration must preserve player IDs, team ownership, loan metadata, season statistics, injuries and transfer history.
- New career, old local career, V1 import, V2 export/import and cloud restore all need coverage.
- If migration is interrupted, rerunning it must converge on the same state.

## Deterministic test matrix

| Area | Required evidence |
|---|---|
| Selectors | Boundary tests for each modifier, caps and position fit |
| Migration | P2 player, youth, free-agent, loan and newgen fixtures |
| Promise engine | Delivered, at-risk, broken, transfer and season rollover cases |
| Development | Seeded single-player cases plus multi-season distribution bands |
| Injury return | Every legal transition, early return and reinjury |
| Match parity | Quick Sim and Broadcast consume the same effective inputs/outcome |
| World projection | Background and user players update once from canonical results |
| Persistence | Export/import/cloud round-trip keeps P3 state |
| Performance | P1 mobile benchmark remains under existing ceilings; add a 15-season size sample |

## UI acceptance

At 390×844:

- the Squad surface still fits the pitch/bench workspace;
- player detail distinguishes baseline, current level, form, sharpness and morale without meter overload;
- out-of-position and rehabilitation warnings are readable before kickoff;
- role/promise editing has 44×44 touch targets;
- Transfers and Academy use the same potential language;
- no horizontal document overflow or hidden action under browser chrome.

Retain and inspect screenshots for the changed Squad and player-detail states. Also run a wider view for dense comparison content.

## Commit and push plan

1. Contract/selectors and failing deterministic tests.
2. Additive migration/adapters.
3. Effective level, morale and sharpness.
4. Roles and playing-time promises.
5. Position suitability and traits.
6. Growth profiles/potential uncertainty.
7. Rehabilitation/reinjury.
8. UI integrations and adapter removal.
9. Regression, performance, screenshots and documentation.

Every pushed slice must remain playable. Do not defer migration or Quick Sim/Broadcast parity to a cleanup commit.

## Exit criteria

P3 is done only when:

- every rating consumer has an intentional shared-selector path;
- personal state advances exactly once per world week;
- old saves migrate without changing durable ability or history;
- seeded balance reports pass;
- no full-world rewrite was added to ordinary screen loads;
- mobile and wide affected journeys were rendered and inspected;
- the complete repository verification suite and Cloudflare preview are green on the final SHA.

## Explicit deferrals

- Staged transfer negotiation and player joining decisions belong to P4.
- Full scouting uncertainty and coaches belong to P5.
- Decision-driven narrative events belong to P8.
- Academy fixtures and real loan-development reports belong to P9.
- Difficulty multipliers belong to P10; P3 exposes config seams but keeps current default behaviour.
