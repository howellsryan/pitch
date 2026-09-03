import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClubFinance, scheduleObligation } from './clubFinance.js';

const db = vi.hoisted(() => ({
  getAllTeams: vi.fn(async () => []),
  putTeamsBulk: vi.fn(async () => {}),
}));

vi.mock('./db.js', () => db);

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
    expect(result).toEqual({ settledTeamIds:[] });
    expect(db.getAllTeams).not.toHaveBeenCalled();
  });
});
