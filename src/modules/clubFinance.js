/**
 * modules/clubFinance.js — P7 WP2 club-season finance ledger. Pure/DOM-free:
 * no IndexedDB or UI imports. `save.js` owns store-level backfill
 * orchestration; this module owns the ledger shape, commands and selectors.
 *
 * `team.budget` remains a temporary compatibility projection (read by every
 * pre-P7 consumer: squadPlanning.js, transfers.js's simple affordability
 * checks, etc.) — never an independent second balance. The invariant this
 * module exists to hold is: the ONLY way `budget` changes is through
 * `applyLedgerMovement`/`syncLedgerCash`, so it can never drift out of sync
 * with `finance.cash`. A caller that still reads `team.budget` directly gets
 * the exact same number as `team.finance.cash` — that's what makes it safe
 * to leave those reads unconverted for now.
 */

export const CLUB_FINANCE_VERSION = 1;
export const MAX_RECENT_LEDGER_ENTRIES = 20;

/** Documented reference list of categories in use across P7. Not enforced at runtime — a new category string is always legal, this just keeps naming consistent. */
export const FINANCE_CATEGORIES = Object.freeze([
  'transfer_fee_in', 'transfer_fee_out',
  'loan_fee_in', 'loan_fee_out',
  'wages', 'prize_money', 'operating_income',
  'academy_investment', 'coaching_costs', 'facility_investment',
  'other',
]);

export function createClubFinance(openingCash = 0) {
  return {
    version: CLUB_FINANCE_VERSION,
    cash: Math.round(Number(openingCash) || 0),
    seasonTotals: {},
    recentEntries: [],
    obligations: [],
  };
}

export function financeNeedsBackfill(save) {
  return !save || Number(save.clubFinanceVersion ?? 0) < CLUB_FINANCE_VERSION;
}

/**
 * Pure backfill builder — mirrors clubPhilosophy.js's pattern exactly.
 * Opening cash is the team's existing `budget` unchanged, so a migrated
 * career shows the same immediately available funds (no opening double
 * income). Only patches teams missing a current-version ledger, so a second
 * call against an already-migrated save never re-seeds a club whose ledger
 * has since moved.
 */
export function buildClubFinanceBackfill(save, teams = []) {
  if (!save) return { save, teamPatches:[] };
  const teamPatches = teams
    .filter(team => !team.finance || Number(team.finance.version ?? 0) < CLUB_FINANCE_VERSION)
    .map(team => ({ ...team, finance:createClubFinance(team.budget ?? 0) }));
  return {
    save:{ ...save, clubFinanceVersion:CLUB_FINANCE_VERSION },
    teamPatches,
  };
}

/**
 * The one ledger write command for an individually-attributable movement
 * (a transfer fee, a wage bill, a coaching hire). Every such call site
 * should route through this instead of hand-rolling `budget: team.budget +/-
 * x`, so `finance.cash`, season category totals and the capped recent-entry
 * audit trail stay consistent with the `budget` compatibility projection.
 * `amount` is signed: positive credits the club, negative debits it.
 */
/**
 * Normalizes an existing team's ledger to the current shape without a
 * version bump/re-backfill (which would discard a save's already-accrued
 * seasonTotals/recentEntries). A field added to `createClubFinance` after a
 * team was first backfilled — `obligations`, here — reads back as `[]`
 * rather than `undefined` for a team.finance object that predates it.
 */
function normalizedFinance(team) {
  const finance = team?.finance?.version === CLUB_FINANCE_VERSION ? team.finance : createClubFinance(team?.budget ?? 0);
  return { ...finance, obligations:finance.obligations ?? [] };
}

export function applyLedgerMovement(team, { category = 'other', amount = 0, description = null, weekKey = null } = {}) {
  const rounded = Math.round(Number(amount) || 0);
  const finance = normalizedFinance(team);
  const seasonTotals = { ...finance.seasonTotals, [category]:(finance.seasonTotals[category] ?? 0) + rounded };
  const entry = { category, amount:rounded, description, weekKey };
  const recentEntries = [entry, ...(finance.recentEntries ?? [])].slice(0, MAX_RECENT_LEDGER_ENTRIES);
  return {
    ...team,
    budget:(Number(team?.budget) || 0) + rounded,
    finance:{ ...finance, cash:finance.cash + rounded, seasonTotals, recentEntries },
  };
}

/**
 * Schedules a future payable/receivable without moving cash now — the P7
 * WP3 counterpart to `applyLedgerMovement`'s immediate movement. `amount` is
 * signed exactly like a movement (negative = this club owes it, positive =
 * this club is owed it). Used to defer a P4 deal's installments to their
 * `dueSeason`/`dueGameweek` instead of paying the full deal value upfront.
 */
export function scheduleObligation(team, { id, category = 'other', amount = 0, description = null, dueSeason = null, dueGameweek = null } = {}) {
  const finance = normalizedFinance(team);
  const obligation = { id, category, amount:Math.round(Number(amount) || 0), description, dueSeason, dueGameweek };
  return { ...team, finance:{ ...finance, obligations:[...finance.obligations, obligation] } };
}

/** An obligation is due once its gameweek is reached in the season it was scheduled for, or — the catch-up safety net — once the save has moved past that season entirely without it ever coming due (a deal made late enough in a season that dueGameweek would fall after season rollover). */
export function isObligationDue(obligation, save) {
  if (!obligation?.dueSeason) return true;
  if (String(obligation.dueSeason) !== String(save?.season ?? '')) return true;
  return Number(save?.currentGameweek ?? 0) >= Number(obligation.dueGameweek ?? 0);
}

/**
 * Pays every due obligation on this team in one pass, folding each into the
 * normal ledger (so it shows up in seasonTotals/recentEntries exactly like
 * an immediate movement) and removing it from the pending list. Removal IS
 * the idempotency guard: a second call against the same team object with no
 * newly-due obligations is a no-op, and a re-run after a partial failure
 * simply finds fewer (or no) obligations left to settle.
 */
export function settleDueObligations(team, save) {
  const finance = normalizedFinance(team);
  const due = finance.obligations.filter(item => isObligationDue(item, save));
  if (!due.length) return team;
  let updated = { ...team, finance:{ ...finance, obligations:finance.obligations.filter(item => !isObligationDue(item, save)) } };
  for (const obligation of due) {
    updated = applyLedgerMovement(updated, { category:obligation.category, amount:obligation.amount, description:obligation.description, weekKey:`${save.season}:${save.currentGameweek}` });
  }
  return updated;
}

/**
 * Cheap mirror-only sync for a batch/simulation path (AI-vs-AI transfers and
 * loans) that computes a final cash figure across many synthetic deals in an
 * in-memory map before one bulk write. These deals aren't individually
 * attributable to a club the user is managing, and per WP7's product-surface
 * design other clubs' exact finances stay abstracted anyway — so this keeps
 * `finance.cash` truthfully in sync with the new `budget` without recording
 * a recent-entry per synthetic deal.
 */
export function syncLedgerCash(team, newCash) {
  const rounded = Math.round(Number(newCash) || 0);
  const finance = normalizedFinance(team);
  return { ...team, budget:rounded, finance:{ ...finance, cash:rounded } };
}

/**
 * The one finance selector for spending power: current cash minus this
 * club's own active reserved transfer commitments (P4's
 * `transferMarket.reservedCommitments`, deals not yet completed) and its own
 * scheduled-but-unpaid payables (completed deals' deferred installments —
 * a negative-amount `finance.obligations` entry). Reads `finance.cash` when
 * present, falling back to the legacy `budget` field for a team object that
 * hasn't been through the P7 backfill (a hand-built test team, or
 * mid-migration).
 */
export function availableFunds(team, transferMarket = null, ignoreDealId = null) {
  const cash = Number(team?.finance?.cash ?? team?.budget ?? 0);
  const committed = (transferMarket?.reservedCommitments ?? [])
    .filter(item => item?.clubId === team?.id && item?.dealId !== ignoreDealId)
    .reduce((sum, item) => sum + Math.max(0, Number(item.amount) || 0), 0);
  const payables = (team?.finance?.obligations ?? [])
    .reduce((sum, item) => sum + Math.max(0, -Number(item.amount) || 0), 0);
  return Math.max(0, cash - committed - payables);
}

/**
 * A club's simple recurring commercial/operating income for one season,
 * scaled by reputation (a top club's global commercial deals/sponsorship
 * dwarf a lower-league club's matchday-only revenue). Deterministic — no
 * variance — since this replaces the old `reputationBudget()` formula's
 * unseeded-`Math.random()` annual reset, not another random draw. Applied
 * identically to every club (P7's own "AI uses the same affordability and
 * solvency rules as the user" decision), on top of whatever cash a club
 * already carries — this is income, not a reset toward a target.
 */
export function operatingIncomeFor(reputation = 65) {
  const rep = Math.max(1, Number(reputation) || 65);
  return Math.round(
    rep >= 90 ? 20_000_000 + (rep - 90) * 2_000_000 :
    rep >= 80 ? 10_000_000 + (rep - 80) * 1_000_000 :
    rep >= 70 ? 5_000_000  + (rep - 70) *   500_000 :
    rep >= 60 ? 2_500_000  + (rep - 60) *   250_000 :
                1_000_000  + rep * 25_000
  );
}

/**
 * Derived solvency state — not a free-standing meter, just a bounded read of
 * cash minus this club's own unpaid payable obligations (the same reserved
 * figure `availableFunds` already computes, so a club sitting on cash that's
 * already spoken for by scheduled installments doesn't read as falsely
 * healthy). WP4 deepens this against real board financial objectives; this
 * is the minimal honest signal available in WP3.
 */
export function financialPressure(team) {
  const cash = Number(team?.finance?.cash ?? team?.budget ?? 0);
  const payables = (team?.finance?.obligations ?? [])
    .reduce((sum, item) => sum + Math.max(0, -Number(item.amount) || 0), 0);
  const net = cash - payables;
  if (net < 0) return 'critical';
  if (net < 2_000_000) return 'strained';
  return 'stable';
}
