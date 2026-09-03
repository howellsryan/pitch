import { describe, expect, it } from 'vitest';
import { createCareerEventsState, createEventInstance, deriveFanContext, expireCareerEvents, selectCareerEvents } from './careerEvents.js';

const save = { season:'2026/27', currentGameweek:12, userTeamId:'user', jobSecurity:40 };
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

  it('only creates a derby press moment when rivalry context makes the fixture meaningful', () => {
    const snapshot = { save, players:[], standing:{ form:['L','L'] }, team:{ morale:40, budget:10_000_000 }, fanContext:{ pressure:56 }, nextOpponentIsRival:true, nextOpponentId:'rival', nextOpponentName:'Rival FC' };
    expect(selectCareerEvents(snapshot, createCareerEventsState()).some(item => item.templateId === 'press_derby')).toBe(true);
    expect(selectCareerEvents({ ...snapshot, nextOpponentIsRival:false }, createCareerEventsState()).some(item => item.templateId === 'press_derby')).toBe(false);
  });
});
