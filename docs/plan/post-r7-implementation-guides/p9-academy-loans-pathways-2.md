# P9 Implementation Guide — Academy, Loans and Development Pathways 2.0

> Planning document only. This guide assumes P1, P3, P4 and P5 are complete. It does not implement P9.

## Outcome

P9 gives every prospect and loaned player a real, continuous career path. Academy players become canonical player entities, youth scouting uses the shared uncertainty model, academy evidence feeds P3 development, and loans earn outcomes from actual P1 appearances, ratings, injuries, tactics and coaching context.

## Entry gate

Verify:

- P1 canonical results project appearances/minutes/ratings/injuries once;
- P3 owns player identity, effective level, growth profiles, potential uncertainty, position conversion and rehabilitation;
- P4 owns loan/option/recall agreement terms and atomic settlement;
- P5 owns scouting reports, coaches, plans and squad needs;
- P7 academy/training/scouting facilities have named selectors if they shipped;
- season rollover and player-history compaction are stable.

P9 must not create a second academy-only player model or an opaque loan boost.

## Current repository baseline

- User academy prospects live in save.youthCohort.
- AI prospects live as team.youthPlayers arrays.
- Promoted prospects are copied into the players store.
- Loans move the player to the receiving teamId and add loan metadata.
- P1 world fixtures can therefore generate real loan appearances, but loan development/reporting is shallow.
- season.js returns all loans at rollover.
- P1 season history records aggregate player totals and completed transfer moves.
- AcademyScreen.svelte and TransfersScreen.svelte are the main surfaces.

## Locked architecture decisions

1. Every academy, first-team, loaned and free-agent footballer is one canonical entity in the players store.
2. Keep player ID and history through every status/location transition. Promotion never creates a copy.
3. Preserve teamId as the currently registered/playing club for compatibility. Add explicit ownership/status fields:
   - owning/contract club;
   - current registration club;
   - academy/first-team/loan/free-agent status;
   - active agreement reference where applicable.
4. Academy players can use the existing by_team index by retaining their owning teamId while marked ineligible for senior selection. Add an index only if measured queries require it.
5. Youth scouting uses P5 assignments/reports and the calibrated P1 newgen/youth generation pipeline.
6. Academy match simulation is aggregate and non-playable; it cannot write senior fixtures/standings.
7. Loan development is derived from actual P1 participation, rating, tactical fit, P3 plans and P5/P7 context.
8. Loan placement begins with the receiving club's real squad need.
9. Player season history must distinguish club/spell contributions where a player changes registration.
10. World talent population/quality caps remain authoritative.

## Canonical status model

The exact field names must be finalised at plan gate, but transitions must be explicit:

academy → first team → loan registration → returned first team

Other legal paths include academy release, senior free agency, permanent transfer and loan option completion.

For every transition define:

- legal source/target states;
- ownership and registration changes;
- senior/youth eligibility;
- contract/agreement effects;
- active development plan handling;
- history event;
- idempotency key.

Do not infer state from a loose combination of isYouth, onLoan, loanedFrom and teamId after migration.

## Work packages

### WP1 — Canonical player-status migration

- Define player status/ownership/registration normalisers and selectors.
- Migrate save.youthCohort into players rows without changing IDs or displayed prospects.
- Migrate every team.youthPlayers entry.
- Convert existing first-team, free-agent and active-loan rows.
- Keep temporary projections for AcademyScreen until it reads canonical queries.
- Remove duplicate youth arrays only after migration/recovery tests pass.
- Preserve existing by_team behaviour and exclude academy-ineligible players from senior selection/world fixtures.

Gate: migrated academy counts, names, ratings, potential and club ownership match the pre-P9 save exactly.

### WP2 — Regional youth scouting

- Extend P5 scouting assignments with region/nation, position group and broad role/style briefs.
- Generate prospects through the shared calibrated pipeline with weighted context, never unconstrained talent.
- Create uncertainty through scouting observations rather than changing true ability after reveal.
- Use scouting facility/coach quality for capacity, speed and confidence within caps.
- Cap active assignments and candidate retention.

Gate: briefs influence distributions without guaranteeing a requested star.

### WP3 — Academy development and evidence

- Add explicit academy development plans through P3.
- Add lightweight scheduled academy fixtures/reports for form, minutes and role/position evidence.
- Keep youth statistics separate from senior P1 competition statistics while exposing compact current-season evidence.
- Feed evidence into the same P3 development selector with age/level caps.
- Add first-team readiness and pathway projections via P5 squad planning.
- Prevent repetitive weekly administration with automatic plans/lineups.

Gate: identical seeded academy contexts produce stable evidence and bounded development.

### WP4 — Promotion, release and registration

- Replace copy-based promotion with a status transition on the same player row.
- Add first professional contract through P4 terms.
- Recheck squad registration/size and playing-time expectation.
- Define release to free agent, including ownership and report visibility.
- Keep academy history on the player.
- Update AcademyScreen to command these transitions.

Gate: promotion/release retries do not duplicate or delete a player.

### WP5 — Loan placement and agreements

- Build loan needs from P4/P5 squad planning.
- Score destination from expected minutes, role/position fit, league level, coaching/facilities, tactic and affordability.
- Use the P4 agreement state machine for wage split, fee, duration, recall and option/obligation.
- Support AI requests for genuine needs.
- Make expected-role promises explicit.
- Avoid moving a player until the agreement atomically completes.

Gate: no receiving club accepts a loan it cannot register, afford or reasonably play.

### WP6 — Live loan participation and development

- Ensure loaned players participate in the receiving club's canonical P1 fixtures.
- Track appearances, minutes, ratings, injuries, form, morale and role fit.
- Segment the season's player history by registration club/spell.
- Settle loan development from real evidence; no flat bonus.
- Trigger P3 rehabilitation at the current club while preserving contract ownership.
- Feed performance into P4 option decisions and P5 reports.

Gate: a player with no loan minutes receives no appearance-based development.

### WP7 — Reports, recall, option and return

- Generate periodic compact loan reports from canonical stats.
- Allow recall only when the agreement/window/rules permit it.
- Process options/obligations through P4 settlement.
- Return players on due date with ownership/status/history intact.
- Re-evaluate squad role, plan and registration on return.
- Handle parent/loan club manager changes and relegation without orphaning agreements.

Gate: season rollover cannot return an already-sold option player or duplicate a return.

### WP8 — Product surfaces

- Rebuild AcademyScreen from canonical players and assignments.
- Add pathways/readiness, development plan and evidence views.
- Add loan destination comparison and live reports to Transfers/Squad.
- Use Inbox for genuinely actionable promotion, recall, option or pathway decisions.
- Keep uncertainty language consistent with P5.
- Preserve fast mobile list/detail interactions.

Gate: scout → inspect → promote/loan → report → return works at 390×844.

## Weekly and seasonal ordering

At world-week close:

1. project senior and background P1 results;
2. project loaned-player participation from those same results;
3. simulate bounded academy evidence;
4. settle P3/P5 development and rehabilitation;
5. progress scouting assignments and loan reports;
6. evaluate recall/option/pathway actions;
7. emit compact notifications.

At season rollover:

- close/compact academy and loan spell summaries;
- process due loan return/options once;
- age academy players and enforce eligibility limits;
- generate calibrated intake through active assignments/facilities;
- preserve player IDs and historical spells;
- re-run population/quality guards.

## Persistence and compatibility

- Retire save.youthCohort and team.youthPlayers only after an idempotent migration and compatibility reader.
- Additive player fields do not require DB_VERSION unless a new index is approved.
- If an index is added, upgrade the existing players store in place; never recreate it.
- Export/import/cloud restore includes all statuses, agreements, assignments and reports.
- Existing loan metadata migrates to an explicit agreement or a safe legacy agreement.
- P1 history remains readable; new history may add spell segmentation without rewriting old seasons.
- Keep academy/loan report retention bounded.

## Test matrix

| Area | Required evidence |
|---|---|
| Migration | User youth, AI youth, promoted, free agent and active loan |
| Identity | No copied/lost IDs through promotion, loan, option or return |
| Eligibility | Academy excluded from senior selection; correct registration |
| Scouting | Brief distributions, uncertainty, caps and facilities |
| Academy sim | Seeded evidence and no senior-stat pollution |
| Loans | Need/fit, agreement, appearances, injury, recall, option, return |
| Development | Actual minutes/ratings versus zero-minute loan |
| History | Multi-club spell summaries and transfer records |
| Long horizon | Population, quality, academy counts and loan volume |
| UI/performance | Mobile full pathway and P1 world-week/storage budgets |

## Commit and push plan

1. Player-status contract/migration tests.
2. Canonical academy migration and compatibility projections.
3. Regional scouting/briefs.
4. Academy evidence and development plans.
5. Promotion/release state transitions.
6. Loan needs/agreements/placement.
7. Live loan stats/development and history segmentation.
8. Reports/recall/options/returns.
9. UI, long-horizon balance, E2E and documentation.

## Exit criteria

- all prospects and loanees are canonical player rows;
- promotion/loan/return preserve identity and history;
- loan outcomes come from actual world participation;
- youth talent remains calibrated over long careers;
- no senior event queue or result engine is duplicated;
- report/storage/performance caps hold;
- mobile and full-suite evidence pass on the final SHA.

## Explicit deferrals

- Difficulty and youth/loan activity settings belong to P10.
- Creator challenge academy-only rules belong to P11.
- New league content belongs to P12.
