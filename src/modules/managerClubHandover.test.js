import { describe, expect, it } from 'vitest';
import { assertHandoverSafeBoundary, transferClubControl } from './managerClubHandover.js';
import { createCaretakerManager, createEmptyManagerMarket, createUserManager } from './managers.js';

function team(id, overrides = {}) {
  return { id, name:id, league:'Premier League', reputation:70, budget:10_000_000, managerId:null, ...overrides };
}

function baseSave(overrides = {}) {
  return {
    userTeamId:'old_club',
    userLeague:'Premier League',
    season:'2025/26',
    currentGameweek:5,
    currentDate:'2025-11-01T00:00:00.000Z',
    pendingEvents:[],
    cups:{},
    worldCompetitions:{ version:1, season:'2025/26', competitions:{} },
    lineup:['p1', 'p2'],
    playerRoles:{ p1:'poacher' },
    tactics:{ source:'user', instructions:{} },
    formation:'4-3-3',
    mentality:'balanced',
    managerDNA:{ matches:12 },
    scouting:{ assignments:['old-assignment'] },
    inboundOffers:[{ id:'offer1' }],
    collapsedDeals:[{ id:'deal1' }],
    boardObjective:{ id:'title', label:'Win the league', kind:'position', target:1 },
    jobSecurity:20,
    sacked:false,
    managerMarket:{ ...createEmptyManagerMarket(), pendingUserHandover:{ clubId:'new_club', vacancyId:'vac_new', weekKey:'2025/26:5' } },
    ...overrides,
  };
}

describe('assertHandoverSafeBoundary', () => {
  it('throws when the event queue is not empty', () => {
    expect(() => assertHandoverSafeBoundary({ pendingEvents:[{ type:'league' }] })).toThrow();
  });

  it('does not throw for an empty queue', () => {
    expect(() => assertHandoverSafeBoundary({ pendingEvents:[] })).not.toThrow();
  });
});

describe('transferClubControl', () => {
  const allTeams = [team('old_club', { managerId:'mgr_user' }), team('new_club', { managerId:'mgr_caretaker_new' })];
  const userManager = createUserManager({ name:'Alex', currentClubId:null, currentDate:'2025-11-01T00:00:00.000Z' });
  const caretakerManager = createCaretakerManager(team('new_club'), { weekKey:'2025/26:4', currentDate:'2025-11-01T00:00:00.000Z' });
  const vacancy = {
    id:'vac_new', clubId:'new_club', status:'completed', hiredManagerId:userManager.id,
    caretakerManagerId:caretakerManager.id, previousManagerId:'mgr_old', declinedCandidateIds:[],
  };

  it('throws when the event queue is not empty, before mutating anything', () => {
    const save = baseSave({ pendingEvents:[{ type:'league' }] });
    expect(() => transferClubControl(save, { allTeams, newTeamId:'new_club', vacancy, userManager, caretakerManager, weekKey:'2025/26:5' })).toThrow();
  });

  it('rejects a vacancy that is not actually completed for this manager', () => {
    const save = baseSave();
    const notCompleted = { ...vacancy, status:'offer_extended' };
    expect(() => transferClubControl(save, { allTeams, newTeamId:'new_club', vacancy:notCompleted, userManager, caretakerManager, weekKey:'2025/26:5' })).toThrow();
  });

  it('swaps userTeamId/league, resets squad-specific state, and preserves tactics/DNA', () => {
    const save = baseSave();
    const result = transferClubControl(save, { allTeams, newTeamId:'new_club', vacancy, userManager, caretakerManager, weekKey:'2025/26:5' });

    expect(result.alreadyCompleted).toBe(false);
    expect(result.save.userTeamId).toBe('new_club');
    expect(result.save.userLeague).toBe('Premier League');
    expect(result.save.lineup).toBeNull();
    expect(result.save.playerRoles).toEqual({});
    expect(result.save.inboundOffers).toEqual([]);
    expect(result.save.collapsedDeals).toEqual([]);
    // Manager's own tactical identity travels with them.
    expect(result.save.tactics).toEqual(save.tactics);
    expect(result.save.formation).toBe('4-3-3');
    expect(result.save.managerDNA).toEqual(save.managerDNA);
    // Board/job security reattached fresh for the new club.
    expect(result.save.jobSecurity).toBe(65);
    expect(result.save.sacked).toBe(false);
    expect(result.save.boardObjective).toBeTruthy();
    // Pending handover marker cleared, one history record added.
    expect(result.save.managerMarket.pendingUserHandover).toBeNull();
    expect(result.save.managerMarket.recentAppointments).toHaveLength(1);
    expect(result.save.managerMarket.recentAppointments[0]).toMatchObject({ clubId:'new_club', managerId:userManager.id });
  });

  it('patches team.managerId to the user and displaces the caretaker', () => {
    const save = baseSave();
    const result = transferClubControl(save, { allTeams, newTeamId:'new_club', vacancy, userManager, caretakerManager, weekKey:'2025/26:5' });
    expect(result.teamPatches).toEqual([expect.objectContaining({ id:'new_club', managerId:userManager.id })]);
    expect(result.managerPatches.find(m => m.id === userManager.id)).toMatchObject({ status:'employed', currentClubId:'new_club' });
    expect(result.managerPatches.find(m => m.id === caretakerManager.id)).toMatchObject({ status:'unemployed', currentClubId:null });
  });

  it('is idempotent: a second call once userTeamId already matches and the pending marker is cleared is a no-op', () => {
    const save = baseSave();
    const first = transferClubControl(save, { allTeams, newTeamId:'new_club', vacancy, userManager, caretakerManager, weekKey:'2025/26:5' });
    const second = transferClubControl(first.save, { allTeams, newTeamId:'new_club', vacancy, userManager, caretakerManager, weekKey:'2025/26:5' });
    expect(second.alreadyCompleted).toBe(true);
    expect(second.save).toBe(first.save);
    expect(second.teamPatches).toEqual([]);
    expect(second.managerPatches).toEqual([]);
  });

  it('never touches player/fixture/standing state — only save fields, team patches and manager patches are returned', () => {
    const save = baseSave();
    const result = transferClubControl(save, { allTeams, newTeamId:'new_club', vacancy, userManager, caretakerManager, weekKey:'2025/26:5' });
    expect(Object.keys(result)).toEqual(['save', 'teamPatches', 'managerPatches', 'alreadyCompleted']);
  });
});
