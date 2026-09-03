import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClubFinance, scheduleObligation } from './clubFinance.js';
import { beginFacilityUpgrade, createFacilities } from './facilities.js';

const db = vi.hoisted(() => ({
  getAllTeams: vi.fn(async () => []),
  getSave: vi.fn(async () => null),
  getTeam: vi.fn(async () => null),
  putTeam: vi.fn(async () => {}),
  putTeamsBulk: vi.fn(async () => {}),
}));

const pathways = vi.hoisted(() => ({
  advanceP9PreDevelopmentWeek: vi.fn(async save => ({ save, scoutingCompleted:[], prospectsAdded:[] })),
  advanceP9PostMarketWeek: vi.fn(async () => ({ loanReports:[] })),
}));

vi.mock('./db.js', () => db);
vi.mock('./p9Runtime.js', () => pathways);

import { advanceP7ClubFinanceWeek } from './p7Runtime.js';

describe('advanceP7ClubFinanceWeek', () => {
  beforeEach(() => vi.clearAllMocks());

  it('pays due obligations and leaves not-yet-due ones scheduled', async () => {
    let due = { id:'club_due', budget:10_000_000, finance:createClubFinance(10_000_000) };
    due = scheduleObligation(due, { id:'ob1', category:'transfer_fee_out', amount:-2_000_000, dueSeason:'2025/26', dueGameweek:5 });
    let notDue = { id:'club_not_due', budget:5_000_000, finance:createClubFinance(5_000_000) };
    notDue = scheduleObligation(notDue, { id:'ob2', category:'transfer_fee_out', amount:-1_000_000, dueSeason:'2025/26', dueGameweek:20 });

    db.getAllTeams.mockResolvedValue([due, notDue]);

    const save = { season:'2025/26', currentGameweek:5 };
    const result = await advanceP7ClubFinanceWeek(save);

    expect(result.settledTeamIds).toEqual(['club_due']);
    const patch = db.putTeamsBulk.mock.calls[0][0];
    expect(patch).toHaveLength(1);
    expect(patch[0].id).toBe('club_due');
    expect(patch[0].budget).toBe(8_000_000);
    expect(patch[0].finance.obligations).toEqual([]);
  });

  it('runs P9 academy/scouting and loan reporting once from the post-market boundary', async () => {
    const save = { season:'2025/26', currentGameweek:5 };
    pathways.advanceP9PreDevelopmentWeek.mockResolvedValue({ scoutingCompleted:[{ id:'scout-1' }], prospectsAdded:[{ id:'y1' }] });
    pathways.advanceP9PostMarketWeek.mockResolvedValue({ loanReports:[{ id:'report-1' }] });

    const result = await advanceP7ClubFinanceWeek(save);

    expect(pathways.advanceP9PreDevelopmentWeek).toHaveBeenCalledWith(save);
    expect(pathways.advanceP9PostMarketWeek).toHaveBeenCalledTimes(1);
    expect(result.academyScoutingCompleted).toEqual([{ id:'scout-1' }]);
    expect(result.academyProspectsAdded).toEqual([{ id:'y1' }]);
    expect(result.loanReports).toEqual([{ id:'report-1' }]);
  });

  it('is a no-op write when nothing is due anywhere', async () => {
    let notDue = { id:'club_a', budget:5_000_000, finance:createClubFinance(5_000_000) };
    notDue = scheduleObligation(notDue, { id:'ob1', category:'transfer_fee_out', amount:-1_000_000, dueSeason:'2025/26', dueGameweek:30 });
    db.getAllTeams.mockResolvedValue([notDue]);

    await advanceP7ClubFinanceWeek({ season:'2025/26', currentGameweek:5 });
    expect(db.putTeamsBulk).not.toHaveBeenCalled();
  });

  it('skips teams with no obligations at all without touching them', async () => {
    db.getAllTeams.mockResolvedValue([{ id:'club_a', budget:1_000_000, finance:createClubFinance(1_000_000) }]);
    const result = await advanceP7ClubFinanceWeek({ season:'2025/26', currentGameweek:5 });
    expect(result.settledTeamIds).toEqual([]);
    expect(db.putTeamsBulk).not.toHaveBeenCalled();
  });

  it('returns an empty result for a missing save rather than throwing', async () => {
    const result = await advanceP7ClubFinanceWeek(null);
    expect(result).toEqual({
      settledTeamIds:[], facilityUpgradesCompleted:[],
      academyScoutingCompleted:[], academyProspectsAdded:[], loanReports:[],
    });
    expect(db.getAllTeams).not.toHaveBeenCalled();
    expect(pathways.advanceP9PreDevelopmentWeek).not.toHaveBeenCalled();
  });

  it('completes a due facility upgrade and leaves a not-yet-due one in progress', async () => {
    let team = { id:'club_a', budget:20_000_000, finance:createClubFinance(20_000_000), facilities:createFacilities() };
    team = beginFacilityUpgrade(team, 'training', { weekKey:'x', season:'2025/26', currentGameweek:1 });
    team = { ...team, facilities:{ ...team.facilities, tracks:{ ...team.facilities.tracks, training:{ ...team.facilities.tracks.training, upgrading:{ ...team.facilities.tracks.training.upgrading, dueGameweek:5 } } } } };
    db.getAllTeams.mockResolvedValue([team]);

    const result = await advanceP7ClubFinanceWeek({ season:'2025/26', currentGameweek:5 });
    expect(result.facilityUpgradesCompleted).toEqual(['club_a']);
    const patch = db.putTeamsBulk.mock.calls[0][0][0];
    expect(patch.facilities.tracks.training).toEqual({ level:2, upgrading:null });
  });

  it('settles obligations and completes facility upgrades for the same team in one pass', async () => {
    let team = { id:'club_a', budget:20_000_000, finance:createClubFinance(20_000_000), facilities:createFacilities() };
    team = scheduleObligation(team, { id:'ob1', category:'transfer_fee_out', amount:-1_000_000, dueSeason:'2025/26', dueGameweek:5 });
    team = beginFacilityUpgrade(team, 'medical', { weekKey:'x', season:'2025/26', currentGameweek:1 });
    team = { ...team, facilities:{ ...team.facilities, tracks:{ ...team.facilities.tracks, medical:{ ...team.facilities.tracks.medical, upgrading:{ ...team.facilities.tracks.medical.upgrading, dueGameweek:5 } } } } };
    db.getAllTeams.mockResolvedValue([team]);

    const result = await advanceP7ClubFinanceWeek({ season:'2025/26', currentGameweek:5 });
    expect(result.settledTeamIds).toEqual(['club_a']);
    expect(result.facilityUpgradesCompleted).toEqual(['club_a']);
    const patch = db.putTeamsBulk.mock.calls[0][0][0];
    expect(patch.finance.obligations).toEqual([]);
    expect(patch.facilities.tracks.medical.level).toBe(2);
  });
});
