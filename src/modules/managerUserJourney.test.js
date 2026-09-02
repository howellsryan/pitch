import { describe, expect, it } from 'vitest';
import {
  APPROACH_FIT_THRESHOLD,
  SAFE_BOUNDARY_ERROR_MESSAGE,
  acceptUserOffer,
  applyToVacancy,
  beginUserResignation,
  countPlausibleOpenings,
  declineUserOffer,
  generateUserApproaches,
  isSafeBoundaryError,
} from './managerUserJourney.js';
import { createManager, createUserManager } from './managers.js';

const team = { id:'old_club', league:'Premier League', reputation:70 };

describe('beginUserResignation', () => {
  it('throws when the pending event queue is not empty', () => {
    const save = { pendingEvents:[{ type:'league' }], currentDate:'2025-11-01T00:00:00.000Z' };
    const userManager = createUserManager({ name:'Alex', currentClubId:'old_club' });
    expect(() => beginUserResignation(save, userManager, team, { weekKey:'2025/26:10' })).toThrow(SAFE_BOUNDARY_ERROR_MESSAGE);
    try {
      beginUserResignation(save, userManager, team, { weekKey:'2025/26:10' });
    } catch (error) {
      expect(isSafeBoundaryError(error)).toBe(true);
    }
  });

  it('rejects a manager that is not the employed user manager', () => {
    const save = { pendingEvents:[], currentDate:'2025-11-01T00:00:00.000Z' };
    const notUser = createManager({ id:'m1', currentClubId:'old_club' });
    expect(() => beginUserResignation(save, notUser, team, { weekKey:'2025/26:10' })).toThrow();
  });

  it('rejects a team that does not match the user manager\'s own club', () => {
    const save = { pendingEvents:[], currentDate:'2025-11-01T00:00:00.000Z' };
    const userManager = createUserManager({ name:'Alex', currentClubId:'old_club' });
    const wrongTeam = { id:'some_other_club', league:'La Liga', reputation:60 };
    expect(() => beginUserResignation(save, userManager, wrongTeam, { weekKey:'2025/26:10' })).toThrow('TEAM_DOES_NOT_MATCH_USER_MANAGER_CLUB');
  });

  it('vacates the user manager and hands the club to a caretaker without touching userTeamId', () => {
    const save = { pendingEvents:[], currentDate:'2025-11-01T00:00:00.000Z', userTeamId:'old_club' };
    const userManager = createUserManager({ name:'Alex', currentClubId:'old_club' });
    const result = beginUserResignation(save, userManager, team, { weekKey:'2025/26:10' });
    expect(result.resignedManager.status).toBe('unemployed');
    expect(result.resignedManager.record.resignations).toBe(1);
    expect(result.caretakerManager.status).toBe('employed');
    expect(result.caretakerManager.currentClubId).toBe('old_club');
    expect(result.vacancy.clubId).toBe('old_club');
    expect(result.vacancy.reason).toBe('resigned');
    // Deliberately does not mutate save.userTeamId — WP6 owns that transition.
    expect(save.userTeamId).toBe('old_club');
  });
});

describe('generateUserApproaches', () => {
  const strongVacancy = { id:'vac_strong', clubId:'strong', status:'caretaker' };
  const weakVacancy = { id:'vac_weak', clubId:'weak', status:'caretaker' };
  const teamsById = new Map([
    ['strong', { id:'strong', league:'Premier League', reputation:75 }],
    ['weak', { id:'weak', league:'Premier League', reputation:20 }],
  ]);

  it('returns the existing list unchanged for an employed manager', () => {
    const employed = createUserManager({ currentClubId:'somewhere' });
    expect(generateUserApproaches(employed, [strongVacancy], teamsById, [], { weekKey:'x' })).toEqual([]);
  });

  it('adds at most one new approach per call, from the best-fitting open vacancy above the threshold', () => {
    const unemployed = createManager({ id:'mgr_user', isUser:true, status:'unemployed', reputation:{ overall:73, youth:60, tactical:60, financial:60 }, record:{ matches:20, wins:12, draws:4, losses:4 } });
    const approaches = generateUserApproaches(unemployed, [strongVacancy, weakVacancy], teamsById, [], { weekKey:'2025/26:10' });
    expect(approaches).toHaveLength(1);
    expect(approaches[0].clubId).toBe('strong');
    expect(approaches[0].fit).toBeGreaterThanOrEqual(APPROACH_FIT_THRESHOLD);
  });

  it('never approaches/counts a club whose vacancy already has a live offer out for someone else', () => {
    const midOffer = { id:'vac_strong', clubId:'strong', status:'offer_extended', offer:{ candidateManagerId:'mgr_ai_rival' } };
    const unemployed = createManager({ id:'mgr_user', isUser:true, status:'unemployed', reputation:{ overall:73, youth:60, tactical:60, financial:60 } });
    expect(generateUserApproaches(unemployed, [midOffer], teamsById, [], { weekKey:'2025/26:10' })).toEqual([]);
    expect(countPlausibleOpenings(unemployed, [midOffer], teamsById)).toBe(0);
    expect(() => applyToVacancy(unemployed, midOffer, { weekKey:'2025/26:10' })).toThrow('VACANCY_NOT_OPEN');
  });

  it('never re-approaches from a club that already has a pending approach', () => {
    const unemployed = createManager({ id:'mgr_user', isUser:true, status:'unemployed', reputation:{ overall:73, youth:60, tactical:60, financial:60 } });
    const existing = [{ id:'approach_strong_x', clubId:'strong', vacancyId:'vac_strong', fit:70, offeredWeekKey:'x', status:'pending' }];
    const approaches = generateUserApproaches(unemployed, [strongVacancy], teamsById, existing, { weekKey:'2025/26:20' });
    expect(approaches).toBe(existing);
  });

  it('caps the approach list at MAX_USER_APPROACHES', () => {
    const unemployed = createManager({ id:'mgr_user', isUser:true, status:'unemployed', reputation:{ overall:73, youth:60, tactical:60, financial:60 } });
    const manyVacancies = Array.from({ length:12 }, (_, i) => ({ id:`vac_${i}`, clubId:`club_${i}`, status:'caretaker' }));
    const manyTeams = new Map(manyVacancies.map((v, i) => [v.clubId, { id:v.clubId, league:'Premier League', reputation:75 }]));
    let approaches = [];
    for (let i = 0; i < 12; i++) {
      approaches = generateUserApproaches(unemployed, manyVacancies, manyTeams, approaches, { weekKey:`2025/26:${i}` });
    }
    expect(approaches.length).toBeLessThanOrEqual(8);
  });
});

describe('applyToVacancy', () => {
  it('creates a pending application regardless of fit', () => {
    const unemployed = createManager({ id:'mgr_user', isUser:true, status:'unemployed' });
    const vacancy = { id:'vac_weak', clubId:'weak', status:'caretaker' };
    const application = applyToVacancy(unemployed, vacancy, { weekKey:'2025/26:10' });
    expect(application).toMatchObject({ clubId:'weak', vacancyId:'vac_weak', status:'pending' });
  });

  it('rejects applying while employed or to a completed vacancy', () => {
    const employed = createUserManager({ currentClubId:'x' });
    const unemployed = createManager({ id:'mgr_user', isUser:true, status:'unemployed' });
    expect(() => applyToVacancy(employed, { id:'v', clubId:'x', status:'caretaker' })).toThrow();
    expect(() => applyToVacancy(unemployed, { id:'v', clubId:'x', status:'completed' })).toThrow();
  });
});

describe('accept/decline user offer', () => {
  const vacancy = { id:'vac_weak', clubId:'weak', status:'caretaker' };

  it('accepting resolves the vacancy to completed and records a pending handover', () => {
    const { vacancy:resolved, pendingUserHandover } = acceptUserOffer(vacancy, 'mgr_user', { weekKey:'2025/26:10' });
    expect(resolved.status).toBe('completed');
    expect(pendingUserHandover).toEqual({ clubId:'weak', vacancyId:'vac_weak', weekKey:'2025/26:10' });
  });

  it('declining returns the vacancy to candidates_assembled with the user excluded going forward', () => {
    const declined = declineUserOffer(vacancy, 'mgr_user', { weekKey:'2025/26:10' });
    expect(declined.status).toBe('candidates_assembled');
    expect(declined.declinedCandidateIds).toEqual(['mgr_user']);
  });

  it('refuses to accept or decline an offer that already belongs to a different candidate', () => {
    const offeredToSomeoneElse = { ...vacancy, status:'offer_extended', offer:{ candidateManagerId:'mgr_ai_rival', extendedWeekKey:'2025/26:10' } };
    expect(() => acceptUserOffer(offeredToSomeoneElse, 'mgr_user', { weekKey:'2025/26:10' })).toThrow('OFFER_NOT_FOR_THIS_CANDIDATE');
    expect(() => declineUserOffer(offeredToSomeoneElse, 'mgr_user', { weekKey:'2025/26:10' })).toThrow('OFFER_NOT_FOR_THIS_CANDIDATE');
  });
});

describe('countPlausibleOpenings', () => {
  const teamsById = new Map([
    ['strong', { id:'strong', league:'Premier League', reputation:75 }],
    ['weak', { id:'weak', league:'Premier League', reputation:20 }],
  ]);

  it('is zero for an employed manager', () => {
    const employed = createUserManager({ currentClubId:'x' });
    expect(countPlausibleOpenings(employed, [{ id:'v', clubId:'strong', status:'caretaker' }], teamsById)).toBe(0);
  });

  it('counts only vacancies clearing the fit threshold', () => {
    const unemployed = createManager({ id:'mgr_user', isUser:true, status:'unemployed', reputation:{ overall:73, youth:60, tactical:60, financial:60 }, record:{ matches:20, wins:12, draws:4, losses:4 } });
    const vacancies = [
      { id:'v1', clubId:'strong', status:'caretaker' },
      { id:'v2', clubId:'weak', status:'caretaker' },
    ];
    expect(countPlausibleOpenings(unemployed, vacancies, teamsById)).toBe(1);
  });
});
