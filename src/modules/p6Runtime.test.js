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
  putTeamsBulk: vi.fn(async () => {}),
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

  it('dismisses an underperforming tenured AI manager, and — with no other candidate available — confirms the caretaker permanently in the same tick', async () => {
    const save = baseSave({ currentGameweek:MANAGER_REVIEW_INTERVAL_GWS });
    db.getSave.mockResolvedValue(save);
    db.getAllTeams.mockResolvedValue([
      { id:'strong', league:'Premier League', reputation:90, managerId:'mgr_user' },
      { id:'weak', league:'Premier League', reputation:50, managerId:'mgr_weak' },
    ]);
    db.getAllManagers.mockResolvedValue([
      createManager({ id:'mgr_user', currentClubId:'strong', isUser:true, startDate:'2025-01-01T00:00:00.000Z' }),
      createManager({ id:'mgr_weak', currentClubId:'weak', startDate:'2025-01-01T00:00:00.000Z', age:40, retirementAge:65 }),
    ]);
    db.getAllStandings.mockResolvedValue([
      { teamId:'strong', position:20, form:['L','L','L','L','L'] },
      { teamId:'weak', position:15, form:['L','L','L','D','L'] },
    ]);
    db.getFixturesByGW.mockResolvedValue([]);

    const result = await advanceP6ManagerCareerWeek(save);
    expect(result.dismissed).toHaveLength(1);
    expect(result.dismissed[0].clubId).toBe('weak');
    expect(['dismissed', 'resigned']).toContain(result.dismissed[0].reason);

    // No other unemployed manager exists in this fixture, so the caretaker
    // is the only eligible candidate and gets confirmed in the same tick.
    expect(result.hired).toHaveLength(1);
    expect(result.hired[0]).toMatchObject({ clubId:'weak', wasCaretaker:true });
    expect(result.save.managerMarket.vacancies).toHaveLength(0);

    const [written] = db.putManagersBulk.mock.calls.at(-1);
    const byId = new Map(written.map(m => [m.id, m]));
    expect(byId.get('mgr_weak').status).toBe('unemployed');
    const confirmedCaretaker = written.find(m => m.currentClubId === 'weak' && m.status === 'employed');
    expect(confirmedCaretaker.availability.caretakerEligible).toBe(false);

    // team.managerId must already have moved to the caretaker at dismissal
    // time, not stayed pointed at the departed manager.
    expect(db.putTeamsBulk).toHaveBeenCalledTimes(1);
    const [writtenTeams] = db.putTeamsBulk.mock.calls[0];
    const weakTeam = writtenTeams.find(t => t.id === 'weak');
    expect(weakTeam.managerId).toBe(confirmedCaretaker.id);

    // The user's manager is scored (reputation moves) but never auto-vacated.
    const userManagerAfter = byId.get('mgr_user');
    expect(userManagerAfter.status).toBe('employed');
    expect(userManagerAfter.currentClubId).toBe('strong');
    expect(userManagerAfter.reputation.overall).toBeLessThan(60);
  });

  it('hires an available unemployed manager over the caretaker when one is a better fit, and returns the caretaker to the pool', async () => {
    const save = baseSave({ currentGameweek:1 });
    db.getSave.mockResolvedValue(save);
    const vacancy = {
      id:'vac_weak_x', clubId:'weak', openedWeekKey:'2025/26:0', reason:'dismissed',
      previousManagerId:'mgr_old', caretakerManagerId:'mgr_caretaker_weak', status:'caretaker',
      declinedCandidateIds:[], offer:null, hiredManagerId:null,
    };
    db.getAllTeams.mockResolvedValue([{ id:'weak', league:'Premier League', reputation:50, managerId:'mgr_caretaker_weak' }]);
    db.getAllManagers.mockResolvedValue([
      createManager({ id:'mgr_caretaker_weak', currentClubId:'weak', status:'employed', caretakerEligible:true, reputation:{ overall:35, youth:45, tactical:45, financial:45 } }),
      createManager({ id:'mgr_free_agent', status:'unemployed', currentClubId:null, reputation:{ overall:52, youth:50, tactical:50, financial:50 }, record:{ matches:30, wins:15, draws:8, losses:7, trophies:[], promotions:0, relegations:0, sackings:0, resignations:0 } }),
      createManager({ id:'mgr_old', status:'unemployed', currentClubId:null }), // previous manager: must never be re-hired here
    ]);
    db.getFixturesByGW.mockResolvedValue([]);
    const seededSave = { ...save, managerMarket:{ ...createEmptyManagerMarket(), vacancies:[vacancy] } };

    const result = await advanceP6ManagerCareerWeek(seededSave);
    expect(result.hired).toHaveLength(1);
    expect(result.hired[0]).toMatchObject({ clubId:'weak', managerId:'mgr_free_agent', wasCaretaker:false });
    expect(result.save.managerMarket.vacancies).toHaveLength(0);

    const [writtenManagers] = db.putManagersBulk.mock.calls.at(-1);
    const byId = new Map(writtenManagers.map(m => [m.id, m]));
    expect(byId.get('mgr_free_agent').status).toBe('employed');
    expect(byId.get('mgr_free_agent').currentClubId).toBe('weak');
    expect(byId.get('mgr_caretaker_weak').status).toBe('unemployed');

    expect(db.putTeamsBulk).toHaveBeenCalledTimes(1);
    const [writtenTeams] = db.putTeamsBulk.mock.calls[0];
    expect(writtenTeams).toEqual([expect.objectContaining({ id:'weak', managerId:'mgr_free_agent' })]);

    // The displaced caretaker must no longer read as caretaker-eligible once
    // back in the unemployed pool — otherwise a later genuine permanent hire
    // would incorrectly carry the flag forward.
    expect(byId.get('mgr_caretaker_weak').availability.caretakerEligible).toBe(false);
    // History entries use one consistent shape for both arrivals and departures.
    const arrival = byId.get('mgr_free_agent').history.at(-1);
    expect(arrival).toMatchObject({ clubId:'weak', startedWeekKey:expect.any(String), endedWeekKey:null, endReason:null });
  });

  it('never re-hires the manager who was just dismissed from that same vacancy', async () => {
    const save = baseSave({ currentGameweek:1 });
    db.getSave.mockResolvedValue(save);
    const vacancy = {
      id:'vac_weak_y', clubId:'weak', openedWeekKey:'2025/26:0', reason:'dismissed',
      previousManagerId:'mgr_old', caretakerManagerId:'mgr_caretaker_weak', status:'caretaker',
      declinedCandidateIds:[], offer:null, hiredManagerId:null,
    };
    db.getAllTeams.mockResolvedValue([{ id:'weak', league:'Premier League', reputation:50, managerId:'mgr_caretaker_weak' }]);
    db.getAllManagers.mockResolvedValue([
      createManager({ id:'mgr_caretaker_weak', currentClubId:'weak', status:'employed', caretakerEligible:true }),
      // mgr_old is unemployed (just dismissed) — must not be eligible for the vacancy it was just dismissed from.
      createManager({ id:'mgr_old', status:'unemployed', currentClubId:null, reputation:{ overall:90, youth:90, tactical:90, financial:90 } }),
    ]);
    db.getFixturesByGW.mockResolvedValue([]);
    const seededSave = { ...save, managerMarket:{ ...createEmptyManagerMarket(), vacancies:[vacancy] } };

    const result = await advanceP6ManagerCareerWeek(seededSave);
    // Only the caretaker is eligible (mgr_old is excluded), so the caretaker is confirmed.
    expect(result.hired).toEqual([{ clubId:'weak', managerId:'mgr_caretaker_weak', wasCaretaker:true }]);
  });

  it('keeps exactly one active manager per club across many checkpoints, with no duplicate assignment or managerless club', async () => {
    const clubIds = ['a', 'b', 'c', 'd', 'e'];
    let teams = clubIds.map(id => ({ id, league:'Premier League', reputation:50 + clubIds.indexOf(id) * 5, managerId:`mgr_${id}` }));
    let managers = clubIds.map(id => createManager({ id:`mgr_${id}`, currentClubId:id, startDate:'2020-01-01T00:00:00.000Z', reputation:{ overall:40, youth:40, tactical:40, financial:40 } }));
    let managerMarket = createEmptyManagerMarket();
    // Persist in-memory across ticks via the mocked db, mirroring what real IndexedDB round-tripping would do.
    db.getAllTeams.mockImplementation(async () => teams);
    db.putTeamsBulk.mockImplementation(async patched => {
      const byId = new Map(teams.map(t => [t.id, t]));
      for (const t of patched) byId.set(t.id, t);
      teams = [...byId.values()];
    });
    db.getAllManagers.mockImplementation(async () => managers);
    db.putManagersBulk.mockImplementation(async patched => {
      const byId = new Map(managers.map(m => [m.id, m]));
      for (const m of patched) byId.set(m.id, m);
      managers = [...byId.values()];
    });
    db.getFixturesByGW.mockResolvedValue([]);
    db.getAllStandings.mockResolvedValue(clubIds.map((id, i) => ({ teamId:id, position:i + 1, form:['L', 'L', 'L', 'L', 'L'] })));

    for (let gw = 1; gw <= MANAGER_REVIEW_INTERVAL_GWS * 4; gw++) {
      const save = { season:'2025/26', currentGameweek:gw, currentDate:'2025-11-01T00:00:00.000Z', managerMarket };
      db.getSave.mockResolvedValue(save);
      const result = await advanceP6ManagerCareerWeek(save);
      managerMarket = result.save.managerMarket;
    }

    const employedByClub = managers.filter(m => m.status === 'employed');
    const clubsSeen = employedByClub.map(m => m.currentClubId);
    expect(new Set(clubsSeen).size).toBe(clubsSeen.length); // no club has two active managers
    for (const id of clubIds) {
      const team = teams.find(t => t.id === id);
      const employed = employedByClub.find(m => m.currentClubId === id);
      expect(employed).toBeTruthy(); // every club has exactly one active manager
      expect(team.managerId).toBe(employed.id); // team.managerId always tracks who actually runs it
    }
  });
});
