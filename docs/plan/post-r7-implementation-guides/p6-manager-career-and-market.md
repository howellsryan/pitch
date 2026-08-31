# P6 Implementation Guide — Manager Career and Living Manager Market

> Planning document only. This guide assumes P1–P5 are complete. It does not implement P6.

## Outcome

P6 turns the saved career into the user's manager journey through one persistent football world. Managers become first-class entities, every club has an appointment, vacancies progress through a shared market, and changing jobs transfers control without resetting date, fixtures, tables, player history or competitions.

## Entry gate

Verify on the latest green main:

- P1 has one authoritative world clock, current/history ledgers and stable club/player IDs;
- P2 Manager DNA is derived from real selections/results and has a stable schema;
- P3 individual player state and playing-time agreements are canonical;
- P4 AI recruitment uses the shared squad-needs service;
- P5 staff and reports remain club-owned where appropriate;
- the user pending-event queue can be proven empty at a safe handover boundary.

Do not start user movement until the competition-control handoff described below is designed and tested.

## Current repository baseline

- The user manager exists mainly as save.managerName and save.managerDNA.
- AI club history falls back to team.managerName or a generic label.
- save.jobSecurity and save.sacked describe only the user's current job.
- team rows do not reference stable manager entities.
- save.userTeamId determines controlled club, league, lineup, cups, board objective and career metadata.
- Domestic/European state is split:
  - the controlled club uses save.cups and save.pendingEvents;
  - AI clubs use save.worldCompetitions.
- Fixtures/standings already cover the full living world.
- Career slots describe the current club but must continue representing the same manager career after movement.

## Locked architecture decisions

1. Managers are first-class persisted entities, including the user.
2. Teams reference managerId; the save references userManagerId and the currently controlled userTeamId.
3. A job change changes control, not world ownership. Date, season, fixtures, standings, player/team identities and history remain in place.
4. Vacancies, applications, approaches and appointments use one persisted state machine for user and AI.
5. All appointments occur at a safe completed-event boundary. Never switch control while save.pendingEvents contains an unresolved match.
6. Manager DNA belongs to the manager entity. Club staff, facilities, scouting knowledge and philosophy stay with the club unless explicitly manager-owned.
7. AI and user appointment scoring uses the same reputation, affordability, tactical fit and availability rules.
8. AI evaluation is bounded and scheduled; do not assess all managers after every fixture.
9. One manager cannot control two clubs and one club cannot have two active managers.
10. P6 must resolve the controlled-club competition split before enabling movement.

## Persistence design

P6 is the first remaining phase with a strong case for a dedicated store.

### Managers store

Increment the then-current DB_VERSION once through plan-gate and add a managers object store keyed by stable manager ID. Add only indexes that are required and exercised, such as current club/status.

Update:

- STORE_NAMES so export/cloud snapshots include managers;
- IndexedDB upgrade handling without recreating existing stores;
- restore/import handling for older snapshots with no managers collection;
- reset/delete/slot flows;
- deterministic migration/backfill tests.

### Save-owned manager market

Keep the bounded live market on the save row:

- vacancies and caretaker periods;
- applications and approaches;
- appointment processes and deadlines;
- user handover state;
- market version and last evaluation checkpoint.

Historical appointments belong on manager/club history summaries, not as an unbounded live queue.

## Manager contract

| Area | Required state |
|---|---|
| Identity | Stable ID, name, nationality/optional profile metadata |
| Employment | Current club, status, start date, contract/end terms |
| Career record | Matches, W-D-L, trophies, promotions, relegations, sackings, resignations |
| Reputation | Overall plus youth, tactical and financial dimensions |
| Identity | P2 Manager DNA and preferred tactical profile |
| History | Compact appointment/achievement records |
| Job state | Availability, retirement, caretaker eligibility |

Do not store display prose or computed fit scores.

## Critical design gate — transferring control of competitions

Today the user club's cup state is separate from AI world competitions. A mid-season move can otherwise duplicate, erase or freeze either club's cup run.

Before user movement ships, define one tested control-transfer operation that:

1. requires an empty save.pendingEvents queue;
2. snapshots the old controlled club's save.cups state;
3. writes that state back into the canonical AI/world competition representation;
4. reads the new club's existing domestic/European run from world competition state;
5. projects that run into save.cups and future user pending events;
6. preserves already-played results, seeds, aggregate legs and apply-once projection flags;
7. handles a new club with no active cup entry;
8. leaves league fixtures/standings untouched;
9. is idempotent on reload/retry.

If the current split cannot support this safely, first consolidate competition ownership behind a shared adapter. Do not create a third tournament path.

## Work packages

### WP1 — Manager entities and migration

- Define manager schema, normalisers and selectors.
- Add the managers store and export/import support.
- Convert the current user manager into a stable entity preserving name and Manager DNA.
- Generate deterministic initial AI manager entities for all clubs.
- Add managerId to every team.
- Rebuild P1 season-history manager references from IDs while retaining display snapshots.

Gate: every club has exactly one active manager or an explicit vacancy/caretaker.

### WP2 — Job security and vacancies

- Move user job security into the common manager/club appointment model while keeping compatibility projections.
- Add bounded club evaluation dates and triggers using results, board expectations and reputation.
- Add warning, review, dismissal, resignation, retirement and caretaker states.
- Prevent churn with minimum tenure, cooldown and affordability rules.
- Keep P7 as the future owner of richer board/club philosophy inputs.

Gate: the same club cannot dismiss twice for one review and cannot remain managerless without a caretaker.

### WP3 — Appointment state machine

Define shared legal stages for:

- vacancy created;
- candidates assembled;
- application/approach;
- shortlist/interview decision;
- offer;
- accepted/declined/expired;
- handover completed.

- Use explainable fit inputs: Manager DNA, reputation, achievements, league level, youth/financial record and availability.
- AI and user follow the same hard blockers.
- Persist deadlines and idempotency keys.

Gate: appointment progress survives reload and completes only at a safe boundary.

### WP4 — AI manager movement

- Run bounded market evaluation monthly and on genuine vacancies, not every match.
- Support dismissal, resignation, poaching, retirement and caretaker promotion.
- Avoid vacancy cascades by processing appointments in deterministic order with temporary reservations.
- Update the club's P2 tactical identity and P4/P5 recruitment needs after appointment.
- Preserve club staff and player promises unless the new manager explicitly reviews them.

Gate: multi-season simulations show plausible tenure/movement without manager duplication or club starvation.

### WP5 — User resignation, applications and approaches

- Add voluntary resignation and job applications.
- Generate realistic approaches from vacancies and fit.
- Keep the world running if the user is unemployed; offer a bounded wait/advance path.
- Require explicit confirmation before leaving a club.
- Preserve the manager entity, career record and Manager DNA.
- Reset/review club-specific lineup, player-role assignments, promises and scouting context.

Gate: the user can leave one club, remain unemployed, join another and continue the same season.

### WP6 — Atomic club-control handover

At the safe boundary:

- transfer cup/competition control using the critical gate above;
- update save.userTeamId and userLeague;
- rebuild total gameweek/user event projections without moving the world clock;
- clear invalid lineup and playerRoles while preserving manager tactics and DNA;
- attach the new board objective/job-security context;
- update slot/cloud career summary metadata;
- refresh theme, navigation and screen state;
- emit one appointment history record and notification.

Implement this as one recoverable domain command with a checkpoint/idempotency key.

Gate: interruption/retry cannot leave mixed old/new club control.

### WP7 — Manager product surfaces

- Add a manager profile/history view within an existing surface or sheet.
- Add vacancy/job-market views and explain fit/rejection.
- Use Home/Inbox for actionable approaches, warnings and dismissal.
- Show the current manager on inspectable club profiles.
- Keep navigation lightweight; do not create a new permanent tab without product review.
- Ensure dismissal/unemployment always has a clear next action.

Gate: full resignation/application/appointment journey is usable at 390×844.

## Gameweek and season ordering

At a completed world week:

1. settle football, player and market systems;
2. update manager match records from canonical results;
3. evaluate only due job-security reviews;
4. open/advance vacancy processes;
5. reserve accepted appointments;
6. execute control/club assignments only with an empty user event queue;
7. refresh tactics/recruitment projections;
8. emit Inbox projections.

At season rollover:

- snapshot manager/club season records;
- apply achievement/reputation changes;
- process planned retirement/contract endings;
- carry vacancies and valid offers safely;
- do not reset the user's manager history.

## Compatibility and migration

- Existing careers gain the same current manager with no reputation penalty.
- Existing AI team.managerName values may seed display names but do not remain authoritative.
- Existing save.managerDNA moves to the manager entity and remains accessible through a temporary compatibility selector.
- V1/V2 import, cloud restore and all career-slot operations must include manager backfill.
- Old season summaries remain readable even if they contain manager names rather than IDs.
- A failed store migration must not orphan the active career.

## Test matrix

| Area | Required evidence |
|---|---|
| DB migration | Existing slot, V1 import, V2 import, cloud restore, delete/reset |
| Entity invariants | One manager per club, one club per active manager |
| Vacancies | Dismissal, resignation, caretaker, expiry, no duplicate review |
| Appointments | User and AI legal transitions, reservations, cooldown |
| Competition handoff | Domestic cup, UEFA league phase, two-leg tie, eliminated/no-entry |
| Safe boundary | Pending event blocks handover; empty queue permits it |
| User journey | Resign, unemployed advance, application, approach, join |
| History | Manager and club records survive seasons and later moves |
| Long horizon | Tenure, vacancy rate, unemployment and reputation distributions |
| UI | Mobile job journey and wide manager history |

## Commit and push plan

1. Manager schema/store migration and tests.
2. Team assignments and compatibility selectors.
3. Job security/vacancy state machine.
4. AI manager market.
5. User applications/approaches/unemployment.
6. Competition control-transfer adapter.
7. Atomic club handover.
8. Tactics/recruitment/history integration.
9. UI, E2E, long-horizon balance and documentation.

## Exit criteria

- every simulated club has a coherent manager assignment/history;
- changing club preserves one living world;
- competition state survives control transfer without duplication;
- the user event queue is never bypassed;
- manager movement changes tactics and recruitment through shared contracts;
- manager data survives all save paths;
- long-horizon and mobile acceptance evidence pass on the final SHA.

## Explicit deferrals

- Rich club philosophy, finance and board objectives belong to P7.
- Press conferences and rivalry narratives belong to P8.
- International manager jobs belong to P12.
