# Club management contracts

Read for manager careers, finance, board, facilities, club handover or season
settlement. Paths below are repository-relative. Detailed slice-by-slice reasons
and then-known limitations are in [the historical record](manager-finance-history.md);
consult the relevant paragraph when changing its mechanism, not the whole history.
Current code and the roadmap establish delivery status.

## Managers and control handover

- `managers.js` owns manager entities; the dedicated store uses id/keyed club lookup.
  `ensureP6Managers` backfills idempotently, preserving compatibility fields rather
  than making them another source of truth. Manager age advances at season rollover.
- `save.managerMarket` is the bounded shared market. `managerAppointments.js` owns
  both AI and user appointment transitions, with same-tick candidate reservations.
  Preserve caretaker assignment so clubs do not become managerless.
- `managerUserJourney.js` distinguishes approaches from applications and excludes
  offers already extended to another candidate. User movement requires an empty
  `pendingEvents` queue and an accepted/completed appointment.
- `managerClubHandover.js` owns the atomic, idempotent change to `save.userTeamId`.
  Rebuild pending events with the existing queue builder; clear club-specific squad
  state while retaining manager tactics, formation, DNA, record and honors.
- `managerCompetitionHandoff.js` explicitly projects between user cups and world
  competition shapes. Resolve pending arriving-club ties before projection; remove
  the arriving club from background simulation and restore the departing club.
  Do not silently unify these different schemas or simulate the managed club twice.
- UI commands in `managerUserActions.js` complete pending handovers at safe boundaries,
  including reload recovery. Do not import the handover path into `p6Runtime.js`:
  its dependency on `gameweek.js` creates a cycle. Dismissal uses `dismissAndCaretake`
  and preserves the career; never restore the destructive season-end new-save reset.
- `managerEmployment.js` owns club-management authority. `save.userTeamId` remains
  a competition projection while unemployed; only the persisted user manager's
  employment at that club authorizes squad, market, academy and facility commands.
  Home provides vacancies and a world-week advance between jobs. That advance
  drains the existing one-event queue to the next week, with former-club matches
  using AI choices and no samples added to the user's Manager DNA. Former-club
  transfer negotiations return to AI staff on the next market tick. Season rollover
  continues the world while between clubs, without a former-club board review,
  another dismissal, new user honors or targets. Archive the club's actual manager;
  the season modal and inbox must not present former-club results as user achievements.
  Academy rollover likewise treats the former club as AI-managed. AI promotion
  considers keepers before outfield prospects fill the senior limit; a club with
  no senior keeper may promote an adult academy keeper below the usual potential
  threshold, including one emergency seat above the normal 30-player limit.

## Finance, board and facilities

- `clubFinance.js` owns cash. Every mutation uses `applyLedgerMovement` or
  `syncLedgerCash`; `team.budget` is a compatibility projection, not another balance.
  Use `availableFunds`/`financialPressure`, accounting for reservations and unpaid
  payables. Keep paired payable/receivable installments and one idempotent weekly
  settlement after transfer-market work and before wages; due obligations catch up
  across season rollover. Do not bump finance versions in ways that wipe accrued data.
  Future-season installments remain reserved until their scheduled season/week;
  only overdue obligations from earlier seasons use the catch-up rule.
- Fixed weekly operating revenue is seeded once from the shipped club roster's
  wage bill, default coaching and a reputation-based surplus. The separate
  operating-income version backfills that baseline without changing ledger cash,
  obligations or accrued totals. Later signings and staff hires increase costs
  without increasing this revenue. Weekly income and salaries share one team-row
  write and retry key; season rollover resets category totals after archiving,
  preserves cash and obligations, and awards every club the same position-based
  league prize. Do not add a second annual operating-income credit.
- Player contracts expire at the ending calendar year of the outgoing season
  (`2026` expires when `2025/26` closes). Use canonical free-agency transitions,
  retain academy rows without professional contracts, and prune departed lineup
  and bench IDs. Archive outgoing player registrations and board youth evidence
  before returning loans to their parent clubs. Return loans through
  `transitionPlayerStatus`, closing the borrowing spell and restoring both canonical
  ownership and registration; clearing compatibility loan flags alone is insufficient.
- `boardContract.js` owns sporting/financial/youth objectives. Keep its dependency
  direction toward `season.js` acyclic. Financial/youth misses must not be blended
  into the old sporting job-security score; the dismissal recommendation requires
  sporting review plus a poor overall score. Season-end UI must retain soft dismissal.
- `clubPhilosophy.js` seeds bounded traits deterministically and defaults absent
  state to neutral behaviour. Evolution runs once after the board verdict and
  before next-season targets; preserve bounded changes and same-reference no-ops.
  Keep enum compatibility tests when avoiding imports to prevent cycles.
- `facilities.js` owns three level-1-to-5 tracks: training, medical and scouting.
  Reuse `academyInvestment` for academy rather than creating a competing system.
  Debit upgrades via the ledger, finish at the scheduled boundary, retain neutral
  level-one effects and existing training/rehabilitation/scouting bounds. Do not
  enable AI investment until the AI players receive the actual facility effects.
- Preserve additive/idempotent backfills and existing legacy bundle constraints:
  top-level names must be globally unique; `strip_modules` does not handle exported
  classes. The apparently unused `reputationBudget` still has a legacy-validator
  caller; inspect that before deletion.

## Known limitations are evidence to re-check

The original delivery record disclosed unemployment-unaware screens, missing
facility/obligation inbox events, inert AI facilities and deferred contract bonuses/
sell-on terms. Verify current owners and tests before treating any as still open.
Do not silently expand an unrelated change to address them.
