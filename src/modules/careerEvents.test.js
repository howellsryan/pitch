import { describe, expect, it } from 'vitest';
import {
  advanceCareerEventFollowUps,
  createCareerEventFollowUp,
  createCareerEventsState,
  createEventInstance,
  deriveFanContext,
  expireCareerEvents,
  invalidateCareerEvents,
  selectCareerEvents,
} from './careerEvents.js';

const save = { season:'2026/27', currentGameweek:12, currentDate:'2026-11-01T12:00:00.000Z', userTeamId:'user', jobSecurity:40 };
const player = { id:'captain', teamId:'user', name:'Captain', individualMorale:24, playingTimeAgreement:{ status:'broken' } };

describe('P8 deterministic story selection', () => {
  it('selects a real broken-promise event deterministically and never reselects its active instance', () => {
    const snapshot = { save, players:[player], standing:{ form:['L','L','L'] }, team:{ morale:35, budget:10_000_000 }, fanContext:deriveFanContext({ form:['L','L','L'], jobSecurity:40, teamMorale:35 }) };
    const first = selectCareerEvents(snapshot, createCareerEventsState());
    expect(first[0]).toMatchObject({ templateId:'broken_promise', participantIds:{ playerId:'captain' } });
    const active = createEventInstance(first[0], save);
    expect(selectCareerEvents(snapshot, { ...createCareerEventsState(), active:[active] }).some(item => item.templateId === 'broken_promise')).toBe(false);
  });

  it('uses cooldowns and stable priority rather than randomness', () => {
    const snapshot = { save, players:[player], standing:{ form:[] }, team:{ morale:50, budget:10_000_000 }, fanContext:{ pressure:0 } };
    const state = { ...createCareerEventsState(), cooldowns:{ 'broken_promise:captain':10 } };
    expect(selectCareerEvents(snapshot, state)).toEqual([]);
  });

  it('expires an untouched decision once and compacts it into the resolved history', () => {
    const event = { id:'event_x', templateId:'board_pressure', status:'pending', expiryGameweek:11, participantIds:{} };
    const result = expireCareerEvents({ ...createCareerEventsState(), active:[event] }, save);
    expect(result.expired).toEqual([event]);
    expect(result.state.active).toEqual([]);
    expect(result.state.resolved[0]).toMatchObject({ id:'event_x', status:'expired', resolutionCode:'expired' });
  });

  it('expires by persisted date across a season rollover instead of leaving last-season decisions immortal', () => {
    const created = createEventInstance({ templateId:'board_pressure', participantIds:{}, tokens:{} }, { ...save, currentGameweek:38, currentDate:'2027-05-20T12:00:00.000Z' });
    const nextSeason = { ...save, season:'2027/28', currentGameweek:1, currentDate:'2027-06-10T12:00:00.000Z' };
    const result = expireCareerEvents({ ...createCareerEventsState(), active:[created] }, nextSeason);
    expect(result.expired.map(item => item.id)).toEqual([created.id]);
  });

  it('only creates a derby press moment when rivalry context makes the fixture meaningful', () => {
    const snapshot = { save, players:[], standing:{ form:['L','L'] }, team:{ morale:40, budget:10_000_000 }, fanContext:{ pressure:56 }, nextOpponentIsRival:true, nextOpponentId:'rival', nextOpponentName:'Rival FC' };
    expect(selectCareerEvents(snapshot, createCareerEventsState()).some(item => item.templateId === 'press_derby')).toBe(true);
    expect(selectCareerEvents({ ...snapshot, nextOpponentIsRival:false }, createCareerEventsState()).some(item => item.templateId === 'press_derby')).toBe(false);
  });

  it('creates the next state-driven player and manager stories only from canonical state', () => {
    const youngster = {
      id:'prospect', teamId:'user', name:'Prospect', age:19, squadRole:'prospect', potentialRating:86,
      playingTimeAgreement:{ status:'at_risk', deliveryScore:.55 },
    };
    const star = { id:'star', teamId:'user', name:'Star', squadRole:'crucial', value:45_000_000, contractExpiry:2027 };
    const managerSave = {
      ...save,
      managerMarket:{ userApproaches:[{ id:'approach_big', clubId:'big', vacancyId:'vac_big', source:'approach', status:'pending', fit:82 }] },
    };
    const employedSnapshot = {
      save:{ ...managerSave, managerMarket:{ userApproaches:[] } },
      userManager:{ id:'user_manager', status:'employed' },
      players:[youngster, star],
      teams:[{ id:'big', name:'Big Club' }],
      standing:{ form:[] },
      team:{ morale:55, budget:12_000_000 },
      fanContext:{ pressure:0 },
    };
    expect(selectCareerEvents(employedSnapshot, createCareerEventsState()).map(item => item.templateId)).toEqual(['star_contract','youngster_loan']);

    const unemployedSnapshot = {
      ...employedSnapshot,
      save:managerSave,
      userManager:{ id:'user_manager', status:'unemployed' },
    };
    const selected = selectCareerEvents(unemployedSnapshot, createCareerEventsState());
    expect(selected.map(item => item.templateId)).toEqual(['manager_approach']);
    expect(selected[0].tokens.clubName).toBe('Big Club');
  });

  it('invalidates stale participant stories when a player moves or the manager leaves the club', () => {
    const playerEvent = createEventInstance({ templateId:'broken_promise', participantIds:{ playerId:'captain' }, tokens:{ playerName:'Captain' } }, save);
    const boardEvent = createEventInstance({ templateId:'board_pressure', participantIds:{}, tokens:{} }, save);
    const result = invalidateCareerEvents(
      { ...createCareerEventsState(), active:[playerEvent, boardEvent] },
      { save, userManager:{ status:'unemployed' }, players:[{ ...player, teamId:'elsewhere' }] },
    );
    expect(result.state.active).toEqual([]);
    expect(result.invalid.map(item => item.resolutionCode)).toEqual(['participant_moved','manager_unemployed']);
  });
});

describe('P8 follow-up chains', () => {
  it('schedules a compact finite follow-up and promotes it when the underlying issue remains', () => {
    const base = createEventInstance({ templateId:'broken_promise', participantIds:{ playerId:'captain' }, tokens:{ playerName:'Captain' } }, save);
    const followUp = createCareerEventFollowUp(base, 'recommit', save);
    expect(followUp).toMatchObject({ templateId:'promise_review', sourceEventId:base.id, sourceChoiceId:'recommit' });

    const laterSave = { ...save, currentGameweek:14, currentDate:'2026-11-15T12:00:00.000Z' };
    const result = advanceCareerEventFollowUps(
      { ...createCareerEventsState(), pendingFollowUps:[followUp] },
      { save:laterSave, players:[player], team:{ budget:10_000_000 } },
    );
    expect(result.promoted).toHaveLength(1);
    expect(result.promoted[0]).toMatchObject({ templateId:'promise_review', participantIds:{ playerId:'captain' }, followUpState:{ sourceEventId:base.id } });
    expect(result.state.pendingFollowUps).toEqual([]);
  });

  it('auto-resolves a due follow-up when real state shows the issue recovered', () => {
    const base = createEventInstance({ templateId:'broken_promise', participantIds:{ playerId:'captain' }, tokens:{ playerName:'Captain' } }, save);
    const followUp = createCareerEventFollowUp(base, 'recommit', save);
    const laterSave = { ...save, currentGameweek:14, currentDate:'2026-11-15T12:00:00.000Z' };
    const recovered = { ...player, playingTimeAgreement:{ status:'fulfilled', appearanceShare:.8 } };
    const result = advanceCareerEventFollowUps(
      { ...createCareerEventsState(), pendingFollowUps:[followUp] },
      { save:laterSave, players:[recovered], team:{ budget:10_000_000 } },
    );
    expect(result.promoted).toEqual([]);
    expect(result.autoResolved[0]).toMatchObject({ templateId:'promise_review', resolutionCode:'promise_recovered' });
  });

  it('keeps a due follow-up queued when the active cap is full rather than losing the chain', () => {
    const base = createEventInstance({ templateId:'budget_pressure', participantIds:{}, tokens:{ cash:1_000_000 } }, save);
    const followUp = createCareerEventFollowUp(base, 'protect_squad', save);
    const active = ['a','b','c'].map((id, index) => ({ id, templateId:'board_pressure', category:'board', status:'pending', participantIds:{ clubId:`club${index}` } }));
    const laterSave = { ...save, currentGameweek:14, currentDate:'2026-11-15T12:00:00.000Z' };
    const result = advanceCareerEventFollowUps(
      { ...createCareerEventsState(), active, pendingFollowUps:[followUp] },
      { save:laterSave, players:[], team:{ budget:1_000_000 } },
    );
    expect(result.promoted).toEqual([]);
    expect(result.state.pendingFollowUps).toHaveLength(1);
  });
});
