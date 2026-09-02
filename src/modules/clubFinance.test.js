import { describe, expect, it } from 'vitest';
import {
  CLUB_FINANCE_VERSION,
  applyLedgerMovement,
  availableFunds,
  buildClubFinanceBackfill,
  createClubFinance,
  financeNeedsBackfill,
  financialPressure,
  syncLedgerCash,
} from './clubFinance.js';

describe('createClubFinance', () => {
  it('opens cash at the given amount with empty totals/entries', () => {
    const finance = createClubFinance(10_000_000);
    expect(finance).toEqual({ version:CLUB_FINANCE_VERSION, cash:10_000_000, seasonTotals:{}, recentEntries:[] });
  });

  it('defaults a missing/invalid opening amount to zero', () => {
    expect(createClubFinance().cash).toBe(0);
    expect(createClubFinance(NaN).cash).toBe(0);
  });
});

describe('financeNeedsBackfill / buildClubFinanceBackfill', () => {
  it('needs backfill for a missing save or stale version', () => {
    expect(financeNeedsBackfill(null)).toBe(true);
    expect(financeNeedsBackfill({})).toBe(true);
    expect(financeNeedsBackfill({ clubFinanceVersion:CLUB_FINANCE_VERSION })).toBe(false);
  });

  it('opens ledger cash at exactly the existing budget — no opening double income', () => {
    const team = { id:'club_a', budget:25_000_000 };
    const migration = buildClubFinanceBackfill({}, [team]);
    expect(migration.teamPatches[0].finance.cash).toBe(25_000_000);
    expect(migration.teamPatches[0].budget).toBe(25_000_000);
    expect(migration.save.clubFinanceVersion).toBe(CLUB_FINANCE_VERSION);
  });

  it('is idempotent — a second call against the migrated save patches nothing', () => {
    const first = buildClubFinanceBackfill({}, [{ id:'club_a', budget:10_000_000 }]);
    const second = buildClubFinanceBackfill(first.save, first.teamPatches);
    expect(second.teamPatches).toEqual([]);
  });

  it('returns no patches for a null save', () => {
    expect(buildClubFinanceBackfill(null, [{ id:'x', budget:1 }])).toEqual({ save:null, teamPatches:[] });
  });
});

describe('applyLedgerMovement', () => {
  it('credits cash and budget together, and records a capped audit entry', () => {
    const team = { id:'club_a', budget:10_000_000, finance:createClubFinance(10_000_000) };
    const updated = applyLedgerMovement(team, { category:'prize_money', amount:2_000_000, description:'Season prize money', weekKey:null });
    expect(updated.budget).toBe(12_000_000);
    expect(updated.finance.cash).toBe(12_000_000);
    expect(updated.finance.seasonTotals.prize_money).toBe(2_000_000);
    expect(updated.finance.recentEntries[0]).toEqual({ category:'prize_money', amount:2_000_000, description:'Season prize money', weekKey:null });
  });

  it('debits with a negative amount', () => {
    const team = { id:'club_a', budget:10_000_000, finance:createClubFinance(10_000_000) };
    const updated = applyLedgerMovement(team, { category:'transfer_fee_out', amount:-3_000_000 });
    expect(updated.budget).toBe(7_000_000);
    expect(updated.finance.cash).toBe(7_000_000);
  });

  it('accumulates the same category across repeated movements', () => {
    let team = { id:'club_a', budget:0, finance:createClubFinance(0) };
    team = applyLedgerMovement(team, { category:'wages', amount:-50_000 });
    team = applyLedgerMovement(team, { category:'wages', amount:-60_000 });
    expect(team.finance.seasonTotals.wages).toBe(-110_000);
  });

  it('caps recent entries at MAX_RECENT_LEDGER_ENTRIES, newest first', () => {
    let team = { id:'club_a', budget:0, finance:createClubFinance(0) };
    for (let i = 0; i < 25; i++) team = applyLedgerMovement(team, { category:'other', amount:1, description:`entry_${i}` });
    expect(team.finance.recentEntries).toHaveLength(20);
    expect(team.finance.recentEntries[0].description).toBe('entry_24');
  });

  it('seeds a ledger from the legacy budget for a team without one yet', () => {
    const team = { id:'club_a', budget:5_000_000 };
    const updated = applyLedgerMovement(team, { category:'other', amount:1_000_000 });
    expect(updated.finance.cash).toBe(6_000_000);
    expect(updated.budget).toBe(6_000_000);
  });
});

describe('syncLedgerCash', () => {
  it('sets both budget and finance.cash to the new figure without an audit entry', () => {
    const team = { id:'club_a', budget:10_000_000, finance:createClubFinance(10_000_000) };
    const updated = syncLedgerCash(team, 8_500_000);
    expect(updated.budget).toBe(8_500_000);
    expect(updated.finance.cash).toBe(8_500_000);
    expect(updated.finance.recentEntries).toEqual([]);
  });
});

describe('availableFunds', () => {
  it('reads finance.cash when present', () => {
    const team = { id:'club_a', budget:1, finance:{ version:1, cash:9_000_000, seasonTotals:{}, recentEntries:[] } };
    expect(availableFunds(team)).toBe(9_000_000);
  });

  it('falls back to legacy budget when finance is absent', () => {
    expect(availableFunds({ id:'club_a', budget:5_000_000 })).toBe(5_000_000);
  });

  it('subtracts this club\'s own reserved commitments, ignoring other clubs\' and an excluded deal', () => {
    const team = { id:'club_a', budget:10_000_000 };
    const market = { reservedCommitments:[
      { dealId:'d1', clubId:'club_a', amount:3_000_000 },
      { dealId:'d2', clubId:'club_a', amount:2_000_000 },
      { dealId:'d3', clubId:'club_b', amount:9_000_000 },
    ] };
    expect(availableFunds(team, market)).toBe(5_000_000);
    expect(availableFunds(team, market, 'd2')).toBe(7_000_000);
  });

  it('never goes negative', () => {
    const team = { id:'club_a', budget:1_000_000 };
    const market = { reservedCommitments:[{ dealId:'d1', clubId:'club_a', amount:5_000_000 }] };
    expect(availableFunds(team, market)).toBe(0);
  });
});

describe('financialPressure', () => {
  it('reads critical for negative cash, strained just below the floor, stable above it', () => {
    expect(financialPressure({ finance:{ cash:-1 } })).toBe('critical');
    expect(financialPressure({ finance:{ cash:1_999_999 } })).toBe('strained');
    expect(financialPressure({ finance:{ cash:2_000_000 } })).toBe('stable');
  });
});
