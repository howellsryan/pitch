import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCaretakerManager, createEmptyManagerMarket, createManager, createUserManager } from './managers.js';

const db = vi.hoisted(() => ({
  getAllTeams: vi.fn(async () => []),
  getFixturesByGW: vi.fn(async () => []),
  getManager: vi.fn(async () => null),
  getSave: vi.fn(async () => null),
  getTeam: vi.fn(async () => null),
  putManagersBulk: vi.fn(async () => {}),
  putSave: vi.fn(async () => {}),
  putTeamsBulk: vi.fn(async () => {}),
}));

vi.mock('./db.js', () => db);

import {
  applyForVacancy, getManagerCareerView, resignAsManager, respondToApproach, tryCompletePendingUserHandover,
} from './managerUserActions.js';

function team(id, overrides = {}) {
  return { id, name:id, league:'Premier League', reputation:70, managerId:null, ...overrides };
}

function baseSave(overrides = {}) {
  return {
    userTeamId:'old_club', userManagerId:'mgr_user', season:'2025/26', currentGameweek:5,
    currentDate:'2025-11-01T00:00:00.000Z', pendingEvents:[],
    managerMarket:createEmptyManagerMarket(),
    ...overrides,
  };
}

describe('resignAsManager', () => {
  beforeEach(() => vi.clearAllMocks());

  it('vacates the manager, hands the club to a caretaker, and records a vacancy', async () => {
    const save = baseSave();
    const userManager = createUserManager({ name:'Alex', currentClubId:'old_club' });
    db.getSave.mockResolvedValue(save);
    db.getManager.mockResolvedValue(userManager);
    db.getTeam.mockResolvedValue(team('old_club'));

    const result = await resignAsManager();
    expect(result.resignedManager.status).toBe('unemployed');
    expect(result.caretakerManager.currentClubId).toBe('old_club');
    expect(db.putManagersBulk).toHaveBeenCalledWith([result.resignedManager, result.caretakerManager]);
    expect(db.putTeamsBulk).toHaveBeenCalledWith([expect.objectContaining({ id:'old_club', managerId:result.caretakerManager.id })]);
    const [savedSave] = db.putSave.mock.calls[0];
    expect(savedSave.managerMarket.vacancies).toHaveLength(1);
  });

  it('throws (and persists nothing) when the event queue is not empty', async () => {
    const save = baseSave({ pendingEvents:[{ type:'league' }] });
    db.getSave.mockResolvedValue(save);
    db.getManager.mockResolvedValue(createUserManager({ currentClubId:'old_club' }));
    db.getTeam.mockResolvedValue(team('old_club'));
    await expect(resignAsManager()).rejects.toThrow();
    expect(db.putSave).not.toHaveBeenCalled();
  });
});

describe('applyForVacancy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('adds a pending application for an open vacancy', async () => {
    const vacancy = { id:'vac_weak', clubId:'weak', status:'caretaker' };
    const save = baseSave({ managerMarket:{ ...createEmptyManagerMarket(), vacancies:[vacancy] } });
    db.getSave.mockResolvedValue(save);
    db.getManager.mockResolvedValue(createManager({ id:'mgr_user', isUser:true, status:'unemployed' }));

    const application = await applyForVacancy('vac_weak');
    expect(application).toMatchObject({ clubId:'weak', vacancyId:'vac_weak', status:'pending', source:'application' });
    const [savedSave] = db.putSave.mock.calls[0];
    expect(savedSave.managerMarket.userApproaches).toHaveLength(1);
  });

  it('refuses a new application while an offer is already pending handover', async () => {
    const vacancy = { id:'vac_weak', clubId:'weak', status:'caretaker' };
    const save = baseSave({
      managerMarket:{ ...createEmptyManagerMarket(), vacancies:[vacancy], pendingUserHandover:{ clubId:'other', vacancyId:'vac_other', weekKey:'x' } },
    });
    db.getSave.mockResolvedValue(save);
    db.getManager.mockResolvedValue(createManager({ id:'mgr_user', isUser:true, status:'unemployed' }));
    await expect(applyForVacancy('vac_weak')).rejects.toThrow('ALREADY_HAVE_A_PENDING_JOB_OFFER');
    expect(db.putSave).not.toHaveBeenCalled();
  });

  it('refuses to apply again to a club already being pursued (approach or application)', async () => {
    const vacancy = { id:'vac_weak', clubId:'weak', status:'caretaker' };
    const existing = { id:'application_weak_old', clubId:'weak', vacancyId:'vac_weak', offeredWeekKey:'x', status:'pending', source:'application' };
    const save = baseSave({ managerMarket:{ ...createEmptyManagerMarket(), vacancies:[vacancy], userApproaches:[existing] } });
    db.getSave.mockResolvedValue(save);
    db.getManager.mockResolvedValue(createManager({ id:'mgr_user', isUser:true, status:'unemployed' }));

    await expect(applyForVacancy('vac_weak')).rejects.toThrow('ALREADY_PURSUING_THIS_CLUB');
    expect(db.putSave).not.toHaveBeenCalled();
  });
});

describe('respondToApproach', () => {
  beforeEach(() => vi.clearAllMocks());

  const vacancy = { id:'vac_weak', clubId:'weak', status:'caretaker', caretakerManagerId:'mgr_caretaker', previousManagerId:null, declinedCandidateIds:[] };
  const approach = { id:'approach_1', clubId:'weak', vacancyId:'vac_weak', fit:70, offeredWeekKey:'x', status:'pending' };

  it('accepting resolves the offer and records pendingUserHandover, clearing the approach', async () => {
    const save = baseSave({ managerMarket:{ ...createEmptyManagerMarket(), vacancies:[vacancy], userApproaches:[approach] } });
    db.getSave.mockResolvedValue(save);
    db.getManager.mockResolvedValue(createManager({ id:'mgr_user', isUser:true, status:'unemployed' }));

    const result = await respondToApproach('approach_1', 'accept');
    expect(result.accepted).toBe(true);
    expect(result.pendingUserHandover).toMatchObject({ clubId:'weak', vacancyId:'vac_weak' });
    const [savedSave] = db.putSave.mock.calls[0];
    expect(savedSave.managerMarket.userApproaches).toHaveLength(0);
    expect(savedSave.managerMarket.vacancies.find(v => v.id === 'vac_weak').status).toBe('completed');
  });

  it('refuses to accept a second offer while one is already pending handover', async () => {
    const save = baseSave({
      managerMarket:{
        ...createEmptyManagerMarket(), vacancies:[vacancy], userApproaches:[approach],
        pendingUserHandover:{ clubId:'other', vacancyId:'vac_other', weekKey:'x' },
      },
    });
    db.getSave.mockResolvedValue(save);
    db.getManager.mockResolvedValue(createManager({ id:'mgr_user', isUser:true, status:'unemployed' }));
    await expect(respondToApproach('approach_1', 'accept')).rejects.toThrow('ALREADY_HAVE_A_PENDING_JOB_OFFER');
    expect(db.putSave).not.toHaveBeenCalled();
  });

  it('refuses to accept an offer whose vacancy was already filled by someone else', async () => {
    const filledVacancy = { ...vacancy, status:'completed', hiredManagerId:'mgr_someone_else' };
    const save = baseSave({ managerMarket:{ ...createEmptyManagerMarket(), vacancies:[filledVacancy], userApproaches:[approach] } });
    db.getSave.mockResolvedValue(save);
    db.getManager.mockResolvedValue(createManager({ id:'mgr_user', isUser:true, status:'unemployed' }));
    await expect(respondToApproach('approach_1', 'accept')).rejects.toThrow('VACANCY_NO_LONGER_AVAILABLE');
  });

  it('declining returns the vacancy to candidates_assembled and clears the approach', async () => {
    const save = baseSave({ managerMarket:{ ...createEmptyManagerMarket(), vacancies:[vacancy], userApproaches:[approach] } });
    db.getSave.mockResolvedValue(save);
    db.getManager.mockResolvedValue(createManager({ id:'mgr_user', isUser:true, status:'unemployed' }));

    const result = await respondToApproach('approach_1', 'decline');
    expect(result.accepted).toBe(false);
    const [savedSave] = db.putSave.mock.calls[0];
    expect(savedSave.managerMarket.vacancies.find(v => v.id === 'vac_weak').status).toBe('candidates_assembled');
  });
});

describe('tryCompletePendingUserHandover', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does nothing when there is no pending handover', async () => {
    db.getSave.mockResolvedValue(baseSave());
    const result = await tryCompletePendingUserHandover();
    expect(result.completed).toBe(false);
    expect(db.putSave).not.toHaveBeenCalled();
  });

  it('does nothing when the event queue is not empty, even with a pending handover', async () => {
    const save = baseSave({
      pendingEvents:[{ type:'league' }],
      managerMarket:{ ...createEmptyManagerMarket(), pendingUserHandover:{ clubId:'new_club', vacancyId:'vac_new', weekKey:'2025/26:5' } },
    });
    db.getSave.mockResolvedValue(save);
    const result = await tryCompletePendingUserHandover();
    expect(result.completed).toBe(false);
  });

  it('executes the handover when a completed offer and empty queue both hold', async () => {
    const userManager = createUserManager({ name:'Alex', currentClubId:null });
    const caretaker = createCaretakerManager(team('new_club'), { weekKey:'2025/26:4', currentDate:'2025-11-01T00:00:00.000Z' });
    const vacancy = { id:'vac_new', clubId:'new_club', status:'completed', hiredManagerId:userManager.id, caretakerManagerId:caretaker.id, previousManagerId:'mgr_old', declinedCandidateIds:[] };
    const save = baseSave({
      userTeamId:'old_club',
      managerMarket:{ ...createEmptyManagerMarket(), vacancies:[vacancy], pendingUserHandover:{ clubId:'new_club', vacancyId:'vac_new', weekKey:'2025/26:5' } },
    });
    db.getSave.mockResolvedValue(save);
    db.getManager.mockImplementation(async id => (id === userManager.id ? userManager : id === caretaker.id ? caretaker : null));
    db.getAllTeams.mockResolvedValue([team('old_club'), team('new_club')]);

    const result = await tryCompletePendingUserHandover();
    expect(result.completed).toBe(true);
    expect(result.save.userTeamId).toBe('new_club');
    expect(db.putSave).toHaveBeenCalledWith(result.save);
  });
});

describe('getManagerCareerView', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null without a save', async () => {
    db.getSave.mockResolvedValue(null);
    expect(await getManagerCareerView()).toBeNull();
  });

  it('reports unemployed state, resign eligibility and open vacancies with resolved team objects', async () => {
    const vacancy = { id:'vac_weak', clubId:'weak', status:'caretaker' };
    const save = baseSave({ managerMarket:{ ...createEmptyManagerMarket(), vacancies:[vacancy] } });
    db.getSave.mockResolvedValue(save);
    db.getManager.mockResolvedValue(createUserManager({ currentClubId:'old_club' }));
    db.getAllTeams.mockResolvedValue([team('old_club'), team('weak')]);

    const view = await getManagerCareerView();
    expect(view.isUnemployed).toBe(false);
    expect(view.canResign).toBe(true);
    expect(view.currentTeam.id).toBe('old_club');
    expect(view.openVacancies).toHaveLength(1);
    expect(view.openVacancies[0].team.id).toBe('weak');
  });

  it('separates club-initiated approaches from the user\'s own applications, and excludes a pursued club from openVacancies', async () => {
    const approachedVacancy = { id:'vac_strong', clubId:'strong', status:'caretaker' };
    const appliedVacancy = { id:'vac_weak', clubId:'weak', status:'caretaker' };
    const untouchedVacancy = { id:'vac_mid', clubId:'mid', status:'caretaker' };
    const save = baseSave({
      managerMarket:{
        ...createEmptyManagerMarket(),
        vacancies:[approachedVacancy, appliedVacancy, untouchedVacancy],
        userApproaches:[
          { id:'approach_1', clubId:'strong', vacancyId:'vac_strong', fit:80, offeredWeekKey:'x', status:'pending', source:'approach' },
          { id:'application_1', clubId:'weak', vacancyId:'vac_weak', offeredWeekKey:'x', status:'pending', source:'application' },
        ],
      },
    });
    db.getSave.mockResolvedValue(save);
    db.getManager.mockResolvedValue(createManager({ id:'mgr_user', isUser:true, status:'unemployed' }));
    db.getAllTeams.mockResolvedValue([team('strong'), team('weak'), team('mid')]);

    const view = await getManagerCareerView();
    expect(view.approaches).toHaveLength(1);
    expect(view.approaches[0].team.id).toBe('strong');
    expect(view.applications).toHaveLength(1);
    expect(view.applications[0].team.id).toBe('weak');
    // Only the untouched vacancy remains offered for a fresh application.
    expect(view.openVacancies).toHaveLength(1);
    expect(view.openVacancies[0].team.id).toBe('mid');
  });
});
