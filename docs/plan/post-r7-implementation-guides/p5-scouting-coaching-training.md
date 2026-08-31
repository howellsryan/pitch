# P5 Implementation Guide — Scouting, Coaching, Training and Squad Planning

> Planning document only. This guide assumes P3 and P4 are complete. It does not implement P5.

## Outcome

P5 reduces omniscience and turns recruitment/development into planning without creating Football Manager-style weekly administration. The user sees staged, uncertain reports; clubs understand present and future squad gaps; lightweight coaches and development plans influence evidence-based growth.

## Entry gate

Verify on the latest green main:

- P3 exposes canonical effective-level, potential-range, growth-profile, position-fit and personal-state selectors;
- P4 owns one shared squad-needs service and all transfer activity uses it;
- P4 active deals and completed history are stable across gameweek/reload;
- player development settles at one known weekly boundary;
- P2 provides seeded fast simulation suitable for a non-playable tactical report.

P5 must expand these contracts, not fork them.

## Current repository baseline

- Transfers currently reveal authoritative player attributes and potential labels immediately.
- potential.js applies development directly from match results.
- youthAcademy.js generates prospects and investment effects without scouts/coaches.
- team rows already carry academyInvestment and budget.
- TransfersScreen, SquadScreen and AcademyScreen are the relevant Svelte surfaces.
- There is no staff store or scouting report model.
- P4 is expected to leave a minimal squad-planning service ready for expansion.

## Locked architecture decisions

1. Scouting observations reference canonical players; they never copy or mutate the player's true attributes.
2. Reports expose ranges, confidence, age of observation and reasons. Stale knowledge can become less reliable.
3. One squad planner serves the user UI and AI recruitment.
4. Coaches are four lightweight departments: Goalkeeping, Defence, Midfield and Attack.
5. Coaching quality/specialism affects assessment confidence, plan efficiency, recovery and development within caps. It never grants unexplained permanent rating boosts.
6. Training is allocated per gameweek with safe automatic defaults. No repetitive mandatory task.
7. User-specific scouting assignments/reports stay in a bounded save domain. Stable club staff configuration belongs on team rows so manager movement preserves the club.
8. The tactical lab is a seeded, read-only fast-engine report. It cannot change results, stats, fatigue or injury state.

## Domain ownership

| Domain | Canonical owner | Persisted where |
|---|---|---|
| Squad depth/needs | Existing P4 squad-planning service | Derived; optional compact cached snapshot |
| Scouting assignments/reports | New pure scouting domain + commands | save.scouting |
| True player attributes | P3 player model | players store |
| Coaching departments | New coaching domain | team row |
| Development/training plan | P3 player-development contract | player row for explicit plans; deterministic default otherwise |
| Tactical lab result | P2 match engine adapter | Ephemeral or bounded recent reports |

Avoid a generic staff-management subsystem. P5 is deliberately small.

## Scouting report contract

A report should contain observations in five sections:

- Current: effective ability range and evidence quality.
- Tactical: role/position/instruction fit.
- Future: potential range and growth-profile confidence.
- Financial: likely fee, wage and clause expectations from P4.
- Status: availability, happiness and joining-interest indicators.

Each observation records source, observed gameweek/date, confidence and range. Display the newest valid projection; retain only bounded history needed to explain change.

Basic public facts such as name, age, primary position, club and visible appearances remain available. Do not hide everything to manufacture grind.

## Work packages

### WP1 — Expand the shared squad planner

- Extend P4 coverage into current XI, rotation and depth by P2 role.
- Add contract expiry, age curve, injury/rehab, loan return and academy-readiness risks.
- Add 1–3 season projections using P3 growth profiles.
- Produce explainable need records consumed by user and AI.
- Keep the service pure and deterministic from a supplied world snapshot.

Gate: user and AI views return the same need priorities for the same club state.

### WP2 — Scouting observations and uncertainty

- Define assignment, observation, report stage, confidence and expiry contracts.
- Generate deterministic ranges around canonical P3 selectors based on scout quality, time and evidence.
- Support player, position/role, region/league and shortlist assignments.
- Advance assignments once per completed world week.
- Cap concurrent assignments and retained reports.
- Backfill existing saves with a documented default knowledge level so P5 does not make a current shortlist unusable overnight.

Gate: more time/quality narrows uncertainty without changing the player.

### WP3 — Coaching departments

- Add four department slots with quality, specialism, wage/cost and contract state.
- Generate sensible default staff for existing and new clubs.
- Add a lightweight hiring/replacement flow using the current budget projection.
- Expose capped effects through selectors consumed by scouting confidence, P3 development and recovery.
- Keep AI staffing periodic and bounded.

Gate: removing/replacing a coach changes future effectiveness, never rewrites existing player attributes.

### WP4 — Training and development plans

- Define a compact plan catalogue: finishing, creation, defending, physical, role training, position conversion, sharpness and recovery.
- Apply plans through the P3 weekly development boundary.
- Resolve conflicts: rehabilitation/recovery can override intense development work.
- Provide automatic recommendations from the squad planner.
- Preserve identity/history when a player transfers; the receiving club reviews rather than blindly inherits a club-specific plan.

Gate: skipping manual configuration still produces safe balanced development.

### WP5 — Recruitment integration

- Rank user candidates from report knowledge, not hidden true ratings.
- Let uncertainty affect risk/explanation rather than secretly changing a player's actual transfer value.
- Feed scouted confidence and squad need into P4 candidate ranking.
- Give AI clubs a bounded internal observation process so they do not have perfect global targeting.
- Ensure P4 player-interest and negotiation rules remain authoritative.

Gate: an unscouted player cannot appear as a perfectly ranked bargain solely because the engine knows true potential.

### WP6 — Product surfaces

- Add current/future depth and needs to Squad or Transfers as a compact planner view.
- Add report stages and assignments to Transfers without breaking virtualised browsing.
- Add development plans to Squad player detail.
- Add coach summary/hiring in an existing management surface; do not create permanent top-level navigation without a product review.
- Add Academy handoff links where P9 will later expand youth assignments.
- Use plain-language consequences and defaults.

Gate: the primary actions fit at 390×844 and do not create nested horizontal page overflow.

### WP7 — Optional tactical lab

- Run both tactical plans through the seeded fast engine over a fixed sample budget.
- Return possession, chance profile, fatigue, vulnerabilities and uncertainty.
- Label it as a simulated report, not a prediction guarantee.
- Never write fixtures, player stats, injuries, form, Manager DNA or world history.
- Defer if the performance budget or causal explanation is not credible.

Gate: repeated identical input/seed is stable and leaves the save byte-for-byte unchanged.

## Weekly ordering

After football and P3 player-state settlement, but before P4 opens new candidate activity:

1. progress training/development plans;
2. progress scouting assignments and observations;
3. refresh squad-planning needs;
4. let P4 recruitment consume needs and known confidence;
5. emit bounded report/plan notifications.

Coaching contracts/hiring and manual assignment actions are commands; their passive effects still settle at this boundary.

## Persistence and migration

- Prefer additive save/team/player fields; do not create an object store for a small bounded domain.
- Store report observations, not copies of player objects.
- Add explicit version markers for scouting, staff and plan contracts.
- Migrate existing saves to the same default behaviour they had before P5, then let new uncertainty apply prospectively.
- Export/import/cloud restore must preserve assignments, reports, staff and plans.
- Season rollover ages reports, renews staff state and keeps explicit player plans where still applicable.
- Manager movement in P6 must leave club staff with the club.

## Test matrix

| Area | Required evidence |
|---|---|
| Squad planner | Role depth, injuries, contracts, loans, academy, future gaps |
| Scouting | Confidence narrowing, staleness, caps, deterministic ranges |
| Migration | Existing shortlist/market remains usable |
| Coaches | Capped effects, hire/replace, club persistence |
| Training | Once-per-week settlement, conflicts, defaults, transfer review |
| Recruitment | User/AI consume needs and report confidence |
| Tactical lab | Determinism, no save mutation, performance |
| UI | Mobile assignments/report/development plan; wide planner |
| Long horizon | Report storage bounds, staff cost and development distribution |

## Commit and push plan

1. Expanded squad-planner contracts/tests.
2. Scouting schema, migration and assignment clock.
3. Staged reports and uncertainty.
4. Coaching departments and hiring.
5. Training/development-plan integration.
6. P4 user/AI recruitment integration.
7. Product surfaces.
8. Optional tactical lab.
9. Balance, E2E, performance and documentation.

## Exit criteria

- there is one squad-needs projection for user and AI;
- reports are uncertain projections over canonical player state;
- weekly training/scouting advances exactly once;
- automatic defaults keep the game approachable;
- AI recruitment is no longer globally omniscient;
- staff/report persistence stays bounded over long careers;
- mobile/wide acceptance and the full repository verification suite pass.

## Explicit deferrals

- AI manager employment and user club movement belong to P6.
- Facilities and deeper finance belong to P7.
- Story choices belong to P8.
- Regional academy intake and full loan reports belong to P9.
- Difficulty controls may expose these settings in P10, but P5 ships one balanced default.
