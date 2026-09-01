# P7 Implementation Guide — Club Identity, Finance, Board and Facilities

> Planning document only. This guide assumes P3–P6 are complete. It does not implement P7.

## Outcome

P7 gives clubs persistent identities and pressures. Budgets become projections from a lightweight club-season finance ledger, philosophies influence appointments/recruitment/objectives, boards review several measurable expectations, and facilities create timed investments with real downstream consumers.

## Entry gate

Verify:

- P4 deal terms expose structured current/future obligations;
- P5 coaching/scouting/training consumers exist;
- P6 manager entities, job security and appointment fit are canonical;
- P1 club/season histories can accept compact finance/philosophy summaries;
- team writes and world-week performance remain within P1 budgets.

P7 must not reinterpret transfer prose, duplicate P6 dismissal logic or reset the AI economy each season.

## Current repository baseline

- team.budget is a mutable scalar used by transfers, wages, academy investment and UI.
- payWeeklyWages subtracts wages directly from every club.
- season.js adds user prize money and resets non-user budgets from reputation.
- save.boardObjective is a single finish target; save.jobSecurity is the current user value.
- team.reputation and morale influence several systems.
- team.academyInvestment is the only persistent facility-like field.
- Competitions exposes other clubs' budget directly.
- P4 is expected to store installments/bonuses as structured obligations.
- P6 owns common manager dismissal/appointment flow.

## Locked architecture decisions

1. Each club has one canonical club-state contract on its team row. It includes philosophy, finance summary, board contract and facilities.
2. Finance uses a club-season ledger with current cash, reserved/committed amounts, category totals, scheduled obligations and a capped recent-entry list.
3. team.budget remains a temporary compatibility projection, then becomes read-only/derived. It is never an independent second balance.
4. Record aggregated weekly wages as one category movement per club, not one ledger entry per player.
5. Completed season ledgers compact into P1 club history; do not retain unbounded transaction detail.
6. Club philosophy is a small weighted trait set. It guides decisions without hard-locking behaviour.
7. Board objectives are weighted measurable contracts with review/warning states. P6 remains the sole owner of dismissal and appointments.
8. Facilities are four bounded levels: academy, training, medical/recovery and scouting. Upgrades have cost, lead time and named consumers.
9. No decorative currencies, sprawling upgrade tree or accounting screen.
10. AI uses the same affordability and solvency rules as the user.

## Club-state contract

### Philosophy

Use a stable versioned set of weighted traits, for example:

- youth pathway;
- buy-to-sell;
- financial caution;
- star recruitment;
- domestic priority;
- European ambition;
- possession identity;
- direct/high-intensity identity.

Weights influence:

- P6 manager fit and board tolerance;
- P4/P5 squad needs, recruitment and contract policy;
- P9 academy/loan choices;
- budget allocation and facility priorities.

### Finance

| Field group | Purpose |
|---|---|
| Cash position | Available cash at the current date |
| Reserved commitments | Active P4 agreements not yet completed |
| Payables/receivables | Installments, bonuses, sell-ons and loan obligations |
| Wage commitment | Current recurring payroll projection |
| Season totals | Aggregated income/expense categories |
| Recent entries | Small capped audit trail for user explanation |
| Financial pressure | Derived solvency state, not a free-standing meter |

### Board contract

A small weighted set of objectives across:

- league/cup/Europe performance;
- financial control or revenue;
- youth development/usage;
- squad/club philosophy commitments.

Each objective has target, weight, evaluation dates, progress selector and status. Use warning/review states before dismissal.

### Facilities

Each facility has level, upgrade state, completion date/gameweek and maintenance/cost context. Effects must name their consumer:

- academy → P9 intake/pathway;
- training → P3/P5 plan efficiency;
- medical → P3 recovery/reinjury;
- scouting → P5 assignment capacity/confidence.

## Work packages

### WP1 — Club philosophy

- Define philosophy traits, defaults and selectors.
- Seed clubs deterministically from existing reputation, league and squad profile.
- Preserve any current tactical identity; philosophy guides P2/P6 rather than replacing manager tactics.
- Add compact public-facing descriptions.
- Feed manager fit and AI squad/recruitment priorities.

Gate: clubs with different philosophies make measurably different but bounded decisions.

### WP2 — Finance ledger and migration

- Define ledger categories, obligations, recent-entry cap and rollover summary.
- Backfill current team.budget as opening cash without changing purchasing power.
- Convert all budget reads through one finance selector.
- Convert all writes into ledger commands.
- Keep team.budget synchronised only as a temporary compatibility projection.
- Remove the non-user reputation budget reset at rollover; replace it with operating/prize/commercial abstractions.

Gate: a migrated career shows the same immediately available funds and no opening double income.

### WP3 — Transfer, wage and income integration

- Consume P4 installments, bonuses, clauses and sell-ons on due dates.
- Reserve active commitments when affordability is checked.
- Aggregate weekly wage expense once per club.
- Post competition/prize income from P0/P1 rules and transfer revenue from P4 completion.
- Add a simple operating/commercial income abstraction driven by reputation/league.
- Make failed obligations create pressure and consequences, not negative-infinite balances.

Gate: every transfer cash flow is traceable and paid once.

### WP4 — Multi-objective board contract

- Replace the single finish target with weighted sporting, financial and youth objectives.
- Migrate the existing target as the main sporting objective.
- Evaluate at documented checkpoints and season close.
- Produce confidence changes and warning/review states.
- Send dismissal recommendations to P6; never directly switch managers.
- Adjust expectations after promotion/relegation, financial shocks and reputation change.

Gate: the same objective checkpoint cannot be applied twice after reload.

### WP5 — Manager/club fit and evolving identity

- Feed philosophy, finances and board priorities into P6 appointment scoring.
- Let sustained manager outcomes nudge selected philosophy weights within caps.
- Keep club identity more stable than manager tenure.
- Recompute P4/P5 recruitment needs after meaningful identity change.
- Store compact identity/finance trajectory in season history.

Gate: a manager change affects decisions without instantly rewriting the club's long-term identity.

### WP6 — Facilities

- Add the four bounded facility tracks.
- Require cash, lead time and no conflicting active upgrade.
- Complete upgrades at the world-week boundary.
- Connect each level to the named P3/P5/P9 consumer through capped selectors.
- Migrate academyInvestment into the academy facility without losing the user's spend.
- Give AI clubs a conservative investment policy based on philosophy/solvency.

Gate: every facility effect is observable in a consumer and every cost is ledgered.

### WP7 — Product surfaces

- Expand the Home objective card into a compact board summary/action sheet.
- Add club finance and facilities to an existing management surface.
- Show available cash, committed amount and key future obligations without full accounting.
- Keep other clubs' exact private finances appropriately abstracted in Competitions.
- Use Inbox for warnings, reviews, due obligations and upgrade completion.
- Preserve mobile-safe actions and plain-language trade-offs.

Gate: a user can understand why available funds differ from cash and what the board is reviewing.

## World-week and season ordering

At world-week close:

1. settle completed P4 transfers and new obligations;
2. post wages and due obligations once;
3. post scheduled income/prize movements;
4. complete due facility upgrades;
5. evaluate due board checkpoints;
6. derive available budget/financial pressure;
7. pass job-security consequences to P6;
8. emit compact notifications.

At season rollover:

- close and compact the outgoing ledger;
- retain future obligations;
- post season prize/operating adjustments through the new ledger;
- create the next board contract and finance period;
- archive philosophy/facility/finance trajectory in P1 history;
- never reset AI cash to a reputation formula.

## Persistence and compatibility

- Prefer nested versioned club state on team rows; add a new store only if plan-gate benchmarks show team-row persistence is untenable.
- Update only changed team rows.
- Migration must cover academyInvestment, budget, objective and job-security compatibility.
- Export/import/cloud restore includes all obligations and upgrades.
- Old season summaries remain readable.
- A P6 club handover changes which club the user sees, not club-state ownership.
- Keep recent ledger entries capped and season summaries compact for 15-season mobile saves.

## Test matrix

| Area | Required evidence |
|---|---|
| Migration | Opening cash/objective/academy investment equivalence |
| Ledger | Every category, reservation, due date, idempotency |
| Transfers | Installments, sell-ons, bonuses, loans, failed completion |
| Wages/income | One posting per club/week and correct rollover |
| Board | Weighted progress, warnings, review and P6 handoff |
| Facilities | Cost, lead time, completion and each consumer |
| AI economy | Solvency, spending and facility distributions over 15 seasons |
| Persistence | Export/import/cloud and interrupted week recovery |
| UI | Mobile finance/board/facility journey and wide dense view |
| Performance | World week, team writes, storage growth against P1 budgets |

## Commit and push plan

1. Philosophy contract/defaults.
2. Finance ledger contract and migration.
3. Budget compatibility selectors and command conversion.
4. P4 obligations, wages and income integration.
5. Board contract/reviews and P6 handoff.
6. Manager/club fit and history.
7. Facilities and academy-investment migration.
8. Product surfaces.
9. Multi-season balance, performance, E2E and documentation.

## Exit criteria

- team.budget is no longer an independently editable source;
- every obligation/income is applied once and explainable;
- AI clubs no longer receive a destructive annual budget reset;
- board dismissal flows only through P6;
- every facility has a real capped consumer;
- 15-season solvency/storage and mobile acceptance evidence pass.

## Explicit deferrals

- Chained narrative choices, fan pressure and takeovers belong to P8.
- Deep academy/loan pathways belong to P9.
- Finance/board difficulty controls belong to P10.
