import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * P7 WP2 replacement for three retired legacy-bundle string-shape checks
 * ('LOAN: loan club deducted total cost', 'LOAN: parent club receives loan
 * fee', 'LOAN: user loan-out gives full wage relief' — see
 * src/validate_p0.py's SUPERSEDED_LEGACY_CHECKS). Those assertions matched
 * the literal `budget - totalCost` / `budget + fee` / `budget + fee +
 * wageCost` expressions transfers.js used to write directly; loanOutPlayer/
 * loanInPlayer now route through clubFinance.js's applyLedgerMovement, so
 * this exercises the same financial outcomes against the real functions
 * instead of a source-text match.
 */

const db = vi.hoisted(() => ({
  addTransfer: vi.fn(async () => {}),
  bulkPut: vi.fn(async () => {}),
  getAllPlayers: vi.fn(async () => []),
  getAllTeams: vi.fn(async () => []),
  getPlayer: vi.fn(async () => null),
  getSave: vi.fn(async () => null),
  getTeam: vi.fn(async () => null),
  putPlayer: vi.fn(async () => {}),
  putSave: vi.fn(async () => {}),
  putTeam: vi.fn(async () => {}),
  settleTransferMarketDealAtomic: vi.fn(async () => {}),
}));

vi.mock('./db.js', () => db);

import { loanInPlayer, loanOutPlayer } from './transfers.js';

function team(id, overrides = {}) {
  return { id, name:id, reputation:65, budget:20_000_000, ...overrides };
}

function player(id, teamId, overrides = {}) {
  return { id, name:id, teamId, age:20, value:4_000_000, wage:20_000, isYouth:false, onLoan:false, loanedFrom:null, signedThisSeason:false, ...overrides };
}

function baseSave(overrides = {}) {
  return { userTeamId:'user_club', currentDate:'2025-08-15T00:00:00.000Z', totalGameweeks:38, currentGameweek:1, season:'2025/26', ...overrides };
}

describe('loanOutPlayer financial outcome', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deducts the full loan fee + wage cost from the loan club, and credits the same total to the user (full wage relief)', async () => {
    const save = baseSave();
    const userTeam = team('user_club', { reputation:70 });
    const loanClub = team('loan_club', { reputation:60, budget:20_000_000 });
    const kid = player('kid', 'user_club', { value:5_000_000, wage:10_000, age:19 });

    db.getSave.mockResolvedValue(save);
    db.getPlayer.mockResolvedValue(kid);
    db.getAllTeams.mockResolvedValue([userTeam, loanClub]);
    db.getTeam.mockResolvedValue(userTeam);

    const fee = Math.round(kid.value * 0.10);
    const gwsRemaining = save.totalGameweeks - save.currentGameweek + 1;
    const wageCost = kid.wage * gwsRemaining;
    const totalCost = fee + wageCost;

    const result = await loanOutPlayer('kid');
    expect(result).toMatchObject({ success:true, fee, wageCost, totalCost });

    const loanClubPatch = db.putTeam.mock.calls.find(call => call[0].id === 'loan_club')[0];
    const userPatch = db.putTeam.mock.calls.find(call => call[0].id === 'user_club')[0];

    expect(loanClubPatch.budget).toBe(20_000_000 - totalCost);
    expect(loanClubPatch.finance.cash).toBe(loanClubPatch.budget);

    expect(userPatch.budget).toBe(20_000_000 + fee + wageCost);
    expect(userPatch.finance.cash).toBe(userPatch.budget);
  });
});

describe('loanInPlayer financial outcome', () => {
  beforeEach(() => vi.clearAllMocks());

  it('debits the user the full loan fee + wage cost, and credits the parent club only the loan fee', async () => {
    const save = baseSave();
    const userTeam = team('user_club', { reputation:70, budget:30_000_000 });
    const parentTeam = team('parent_club', { reputation:55 });
    const kid = player('kid', 'parent_club', { value:6_000_000, wage:15_000, age:20 });

    db.getSave.mockResolvedValue(save);
    db.getPlayer.mockResolvedValue(kid);
    db.getTeam.mockImplementation(async id => (id === 'parent_club' ? parentTeam : userTeam));

    const fee = Math.round(kid.value * 0.10);
    const gwsRemaining = save.totalGameweeks - save.currentGameweek + 1;
    const wageCost = kid.wage * gwsRemaining;
    const totalCost = fee + wageCost;

    const result = await loanInPlayer('kid');
    expect(result).toMatchObject({ success:true, fee, wageCost, totalCost });

    const userPatch = db.putTeam.mock.calls.find(call => call[0].id === 'user_club')[0];
    const parentPatch = db.putTeam.mock.calls.find(call => call[0].id === 'parent_club')[0];

    expect(userPatch.budget).toBe(30_000_000 - totalCost);
    expect(userPatch.finance.cash).toBe(userPatch.budget);

    // Asymmetric by design (pre-existing behaviour, unchanged by the ledger
    // conversion): the parent club receives only the fee, not wage relief.
    expect(parentPatch.budget).toBe(20_000_000 + fee);
    expect(parentPatch.finance.cash).toBe(parentPatch.budget);
  });
});
