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
export function applyLedgerMovement(team, { category = 'other', amount = 0, description = null, weekKey = null } = {}) {
  const rounded = Math.round(Number(amount) || 0);
  const finance = team?.finance?.version === CLUB_FINANCE_VERSION ? team.finance : createClubFinance(team?.budget ?? 0);
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
  const finance = team?.finance?.version === CLUB_FINANCE_VERSION ? team.finance : createClubFinance(team?.budget ?? 0);
  return { ...team, budget:rounded, finance:{ ...finance, cash:rounded } };
}

/**
 * The one finance selector for spending power: current cash minus this
 * club's own active reserved transfer commitments (P4's
 * `transferMarket.reservedCommitments`). Reads `finance.cash` when present,
 * falling back to the legacy `budget` field for a team object that hasn't
 * been through the P7 backfill (a hand-built test team, or mid-migration).
 */
export function availableFunds(team, transferMarket = null, ignoreDealId = null) {
  const cash = Number(team?.finance?.cash ?? team?.budget ?? 0);
  const committed = (transferMarket?.reservedCommitments ?? [])
    .filter(item => item?.clubId === team?.id && item?.dealId !== ignoreDealId)
    .reduce((sum, item) => sum + Math.max(0, Number(item.amount) || 0), 0);
  return Math.max(0, cash - committed);
}

/**
 * Derived solvency state — not a free-standing meter, just a bounded
 * read of cash. WP3/WP4 deepen this against real wage commitments and board
 * financial objectives; this is the minimal honest signal available in WP2.
 */
export function financialPressure(team) {
  const cash = Number(team?.finance?.cash ?? team?.budget ?? 0);
  if (cash < 0) return 'critical';
  if (cash < 2_000_000) return 'strained';
  return 'stable';
}
