# P4 Implementation Guide — Transfer Market and Contracts 2.0

> Planning document only. This guide assumes P3 is complete and defines a persisted, staged market. It does not implement P4.

## Outcome

P4 replaces instant modal-driven transfers with a game-time state machine. Clubs form needs, deals progress through seller and player negotiations, rival activity can change the outcome, and completion is atomic across the player, clubs, budget and history.

The result must remain accessible: more consequence and uncertainty, not repetitive negotiation administration.

## Entry gate

Start from a green P3 main and verify:

- effective level, squad role, playing-time expectation, position suitability and tactical fit have canonical selectors;
- one completed gameweek boundary exists for advancing weekly systems;
- P2 tactics and Manager DNA remain shared between user and AI;
- P1 transfer history and world player identities remain intact.

P4 must not recreate player state or tactical fit inside transfers.js.

## Current repository baseline

- transfers.js currently owns valuation, contracts, direct buying/selling, inbound offers, AI-to-AI transfers and loans.
- buyPlayer, sellPlayer and acceptOffer write the final player/team state immediately.
- save.inboundOffers and save.collapsedDeals are UI-shaped state.
- the transfers object store is an append-only completed-move history.
- runEndOfWorldGameweek currently calls offer generation, AI transfers and AI loans separately.
- season.js renews/releases contracts and returns loans at rollover.
- TransfersScreen.svelte is the main market surface; the inbound-offers sheet still uses a legacy UI adapter.
- team.budget is the current money source. P7 will replace it with a finance-ledger projection.

## Locked architecture decisions

1. Every transfer, loan and renewal is a persisted deal state machine. Modal state is never authoritative.
2. Keep active/current-window market state in a bounded save.transferMarket domain. Keep the existing transfers store as immutable completed history. Do not add a new store unless measured scale proves the bounded model inadequate.
3. One typed terms contract covers fee, installments, bonuses, clauses, exchanges, loans and player contract terms.
4. Deal transitions occur through domain commands with legal-transition and idempotency guards.
5. Progress the market once at the completed world-gameweek boundary, not once per pending user fixture.
6. Completion uses one IndexedDB transaction across the save, affected teams, player and transfer history. A tab close must never debit money without moving the player, or move the player twice.
7. P4 creates the minimal shared squad-needs service. P5 expands that exact service; it must not replace it.
8. Player interest is an explainable score plus hard blockers. User and AI clubs use the same rules.
9. Preserve current simple paths through sensible defaults: a user may delegate terms and receive a compact result.

## Deal lifecycle

Use a legal state graph with terminal states. The exact names can be adjusted during plan gate, but the responsibilities cannot.

| Stage | Meaning | Owner/action |
|---|---|---|
| Interest/enquiry | Candidate and initial club intent exist | User or AI |
| Seller terms | Selling club sets availability/terms | Market command |
| Club negotiation | Fee structure is exchanged | User/AI command |
| Player negotiation | Wage, duration, role and bonuses are agreed | User/AI command |
| Agreed/pending completion | All terms valid; budget/registration rechecked | System |
| Completed | Atomic settlement and history record | System |
| Rejected/withdrawn/expired/hijacked | Terminal with reason | System |

Every deal carries created/updated/expiry gameweek, participants, current proposal, decision log references, deterministic seed and an idempotency key. Store compact codes, not duplicated narrative prose.

## Terms contract

Support the high-value terms in deliberate slices:

- guaranteed fee and installment schedule;
- sell-on percentage;
- appearance/performance bonuses;
- player exchange;
- loan fee, wage contribution, recall flag and option/obligation to buy;
- contract wage, duration, squad role, signing bonus and appearance/goal/clean-sheet bonuses;
- promotion/relegation salary clauses.

Do not ship every clause at once. The first production slice should support guaranteed fee, installments, sell-on, loan-to-buy and the core player contract. Later structures must extend the same contract.

P7 will consume scheduled obligations. P4 must therefore store structured due dates/amounts rather than prose.

## Work packages

### WP1 — State machine and pure contracts

- Define deal types, states, legal transitions, expiry rules, terms validation and deterministic IDs.
- Add pure transition tests before persistence or UI.
- Define hard invariants:
  - one active deal per player/buyer/type where appropriate;
  - terminal deals cannot transition;
  - no negative amount or impossible installment schedule;
  - the buyer and seller cannot be the same club;
  - squad and registration safety are rechecked at completion.

Gate: invalid transitions fail without mutating state.

### WP2 — Persistence and legacy migration

- Add save.transferMarket with version, active deals, negotiation queue, reserved commitments and bounded terminal summaries.
- Migrate pending save.inboundOffers into seller-side deal instances.
- Preserve completed transfers store history unchanged.
- Keep compatibility projections for the old offers badge until the Svelte surface is migrated.
- Compact terminal instances after the transfer window into season history/summary references.

Gate: a P3 save with pending offers opens with the same actionable offers and no duplicate deal.

### WP3 — Atomic settlement

- Add a single transaction boundary for final transfer/loan/renewal settlement.
- Revalidate cash, reserved commitments, squad size, player ownership, contract eligibility and window status inside that boundary.
- Append the completed history record in the same transaction.
- Use idempotency keys so reload/retry returns the completed result instead of paying twice.
- Keep a compatibility team.budget projection for P7.

Gate: forced interruption/retry tests cannot create money, duplicate history or orphan a player.

### WP4 — Seller and player negotiation

- Advance seller responses over game time with clear response deadlines.
- Add player interest using P3 role/minutes/morale/career stage, P2 tactical fit, reputation, league prestige, Europe, wage and rivalry constraints.
- Return concise reasons: hard blocker, strongest positives, strongest concern and negotiable terms.
- Add delegated/default negotiation for casual play.
- Add contract-renewal and free-agent flows through the same player-terms model.

Gate: the same inputs and seed produce the same choice; interest never becomes a hidden coin flip.

### WP5 — Rival bids, deadline and market tick

- Replace the three independent gameweek market calls with one ordered market tick.
- Advance expiries, rival bids, AI decisions and completions exactly once after the world week settles.
- Increase urgency on deadline day without bypassing legal transitions.
- Model a player's choice between agreed offers.
- Keep active volume capped by club, player and window to protect mobile performance.

Gate: a week with multiple user fixtures advances deals once; resuming after reload does not repeat rival bids.

### WP6 — Shared squad needs and AI recruitment

Create a pure squad-planning service that initially provides:

- position/role coverage;
- age and contract risk;
- injury availability;
- tactical role gaps;
- target ability band;
- affordability and registration guards.

AI recruitment must:

1. create a ranked need;
2. build a candidate set;
3. score fit, affordability and likelihood;
4. open a deal;
5. obey the same negotiation/settlement rules.

Do not build P5 scouting reports here. P4 may use authoritative data internally for AI candidate generation while exposing only explainable market knowledge to the user.

Gate: AI clubs do not buy a sixth striker while leaving an identified goalkeeper/centre-back gap, except when club strategy explicitly justifies it.

### WP7 — Transfers product surface

- Rebuild TransfersScreen projections around active deals, deadlines and history.
- Replace or adapt the legacy inbound-offers sheet so it dispatches domain commands only.
- Show the current stage, next decision, deadline, competing interest, reserved budget and concise player-interest reasons.
- Keep search/browse performance and current virtualisation.
- Add a compact transfer-world view for completed and notable active activity.
- Avoid celebratory/cinematic work that does not change a decision.

Gate: a full buy, sell, renewal and loan journey works at 390×844 without clipped terms or browser-chrome collisions.

## Gameweek and season ordering

At gameweek close:

1. settle all football events and P3 player state;
2. refresh squad needs;
3. advance active negotiations and deadlines;
4. generate bounded new AI/user inbound interest;
5. atomically complete eligible agreements;
6. emit compact Inbox/news projections;
7. persist the next gameweek.

At season rollover:

- resolve/expire deals whose dates cannot cross the boundary;
- execute contract expiries through the common contract rules;
- return/end loans through their agreement;
- carry valid future installments/options;
- compact terminal market state into season history.

Never advance a deal inside buildPendingEvents or between two user fixtures in the same world week.

## Persistence and migration rules

- A backward-compatible additive save field does not by itself require DB_VERSION or save-envelope version changes.
- If the settlement transaction needs a new DB helper, keep the store list unchanged unless a genuinely new store is approved through plan-gate.
- Imported older saves must produce deterministic deal IDs.
- Cloud and local export include active negotiations and reserved commitments.
- Existing completed transfer rows remain readable; enrich new rows rather than rewriting the entire historical store.
- P7 must be able to consume future obligations without parsing labels.

## Test matrix

| Area | Required evidence |
|---|---|
| State graph | Every legal transition and rejected illegal transition |
| Validation | Fees, clauses, contracts, exchanges, loans and squad safety |
| Migration | Pending inbound offers, no offers, old contracts, active loans |
| Atomicity | Retry/interruption/no double debit/no duplicate player/history |
| Interest | Explainable boundary cases and hard blockers |
| AI needs | Position, age, contract, tactic and budget scenarios |
| Time | Ordinary week, multiple user events, deadline day, expiry, rollover |
| Long horizon | Multi-window transfer volume, squad legality, rating/age distribution |
| UI | Full buy/sell/loan/renewal at mobile and wide view |
| Performance | Market tick and saved active-market size under agreed caps |

## Commit and push plan

1. Pure terms/state machine and failing tests.
2. save.transferMarket migration and compatibility projections.
3. Atomic settlement boundary.
4. Seller negotiation and priority fee structures.
5. Player contracts and interest explanations.
6. Rival bids/deadline/weekly market tick.
7. Minimal squad-needs service and AI recruitment.
8. Transfers UI and legacy-offer retirement.
9. Long-horizon balance, E2E, docs and cleanup.

## Exit criteria

- no live transfer is represented only by modal state;
- every completion is atomic/idempotent;
- AI recruitment begins with an identified squad need;
- contract, loan and transfer progress survive reload/export/cloud restore;
- gameweek and event-queue invariants remain intact;
- P1 world history records completed activity coherently;
- mobile journeys and long-window balance evidence pass on the final SHA.

## Explicit deferrals

- Full scouting uncertainty, staff and 1–3 year squad planning belong to P5.
- Club finance ledgers and accounting of obligations belong to P7; P4 only records structured commitments.
- Transfer sagas and press choices belong to P8.
- Full loan development and reports belong to P9.
