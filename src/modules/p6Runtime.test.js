import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyManagerMarket, createManager } from './managers.js';
import { MANAGER_REVIEW_INTERVAL_GWS } from './managerCareer.js';

const db = vi.hoisted(() => ({
  getAllManagers: vi.fn(async () => []),
  getAllStandings: vi.fn(async () => []),
  getAllTeams: vi.fn(async () => []),
  getFixturesByGW: vi.fn(async () => []),
  getSave: vi.fn(async () => null),
  putManagersBulk: vi.fn(async () => {}),
  putSave: vi.fn(async () => {}),
}));

vi.mock('./db.js', () => db);

import { advanceP6ManagerCareerWeek } from './p6Runtime.js';

function baseSave(overrides = {}) {
  return {
    season:'2025/26',
    currentGameweek:1,
    currentDate:'2025-11-01T00:00:00.000Z',
    managerMarket:createEmptyManagerMarket(),
    ...overrides,
  };
}

describe('advanceP6ManagerCareerWeek', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accrues match records for the settled week and marks the week processed', async () => {
    const save = baseSave();
    db.getSave.mockResolvedValue(save);
    db.getAllManagers.mockResolvedValue([
      createManager({ id:'m1', currentClubId:'a', startDate:'2024-01-01T00:00:00.000Z' }),
      createManager({ id:'m2', currentClubId:'b', startDate:'2024-01-01T00:00:00.000Z' }),
    ]);
    db.getFixturesByGW.mockResolvedValue([
      { played:true, homeTeamId:'a', awayTeamId:'b', homeGoals:2, awayGoals:0 },
    ]);

    const result = await advanceP6ManagerCareerWeek(save);
    expect(result.alreadyProcessed).toBe(false);
    expect(db.putManagersBulk).toHaveBeenCalledTimes(1);
    const [written] = db.putManagersBulk.mock.calls[0];
    const byId = new Map(written.map(m => [m.id, m]));
    expect(byId.get('m1').record).toMatchObject({ matches:1, wins:1 });
    expect(byId.get('m2').record).toMatchObject({ matches:1, losses:1 });
    expect(result.save.managerMarket.processedWeekKeys).toContain('2025/26:1');
  });

  it('is a no-op on a second call for the same already-processed week', async () => {
    const save = baseSave({ managerMarket:{ ...createEmptyManagerMarket(), processedWeekKeys:['2025/26:1'] } });
    db.getSave.mockResolvedValue(save);

    const result = await advanceP6ManagerCareerWeek(save);
    expect(result.alreadyProcessed).toBe(true);
    expect(db.putManagersBulk).not.toHaveBeenCalled();
    expect(db.putSave).not.toHaveBeenCalled();
  });

  it('dismisses an underperforming tenured AI manager at a due checkpoint and hands the club to a caretaker, but never auto-dismisses the user', async () => {
    const save = baseSave({ currentGameweek:MANAGER_REVIEW_INTERVAL_GWS });
    db.getSave.mockResolvedValue(save);
    db.getAllTeams.mockResolvedValue([
      { id:'strong', league:'Premier League', reputation:90 },
      { id:'mid', league:'Premier League', reputation:70 },
      { id:'weak', league:'Premier League', reputation:50 },
    ]);
    db.getAllManagers.mockResolvedValue([
      createManager({ id:'mgr_user', currentClubId:'strong', isUser:true, startDate:'2025-01-01T00:00:00.000Z' }),
      createManager({ id:'mgr_weak', currentClubId:'weak', startDate:'2025-01-01T00:00:00.000Z' }),
    ]);
    db.getAllStandings.mockResolvedValue([
      { teamId:'strong', position:20, form:['L','L','L','L','L'] },
      { teamId:'weak', position:15, form:['L','L','L','D','L'] },
    ]);
    db.getFixturesByGW.mockResolvedValue([]);

    const result = await advanceP6ManagerCareerWeek(save);
    expect(result.dismissed).toHaveLength(1);
    expect(result.dismissed[0].clubId).toBe('weak');
    const [written] = db.putManagersBulk.mock.calls.at(-1);
    const byId = new Map(written.map(m => [m.id, m]));
    expect(byId.get('mgr_weak').status).toBe('unemployed');
    // The user's manager is scored (reputation moves) like any other club,
    // but a 'dismiss' outcome is never acted on for them — they keep the job.
    const userManagerAfter = byId.get('mgr_user');
    expect(userManagerAfter).toBeTruthy();
    expect(userManagerAfter.status).toBe('employed');
    expect(userManagerAfter.currentClubId).toBe('strong');
    expect(userManagerAfter.reputation.overall).toBeLessThan(60);
    const caretakerEntry = written.find(m => m.currentClubId === 'weak' && m.status === 'employed');
    expect(caretakerEntry).toBeTruthy();
    expect(result.save.managerMarket.vacancies).toHaveLength(1);
    expect(result.save.managerMarket.vacancies[0].clubId).toBe('weak');
  });
});
