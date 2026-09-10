import { describe, expect, it } from 'vitest';
import {
  COMPETITION_SHOOTOUT_VERSION,
  isVersionedShootoutEvent,
  resolveVersionedKnockout,
} from './competitionShootouts.js';

function player(id, position, rating = 80) {
  return {
    id,
    name:id,
    position,
    matchPosition:position,
    attack:rating,
    midfield:rating,
    defence:rating,
    goalkeeping:position === 'GK' ? rating : 8,
    fitness:90,
    form:50,
    individualMorale:50,
    sharpness:50,
    attributeProfile:{
      shooting:rating,
      physical:rating,
      passing:rating,
      pace:rating,
      dribbling:rating,
      defending:rating,
    },
  };
}

function side(prefix, rating = 80) {
  return [
    player(`${prefix}-gk`, 'GK', rating),
    ...Array.from({ length:10 }, (_, index) => player(`${prefix}-${index + 1}`, index < 2 ? 'ST' : 'CM', rating - index)),
  ];
}

const HOME = side('home', 84);
const AWAY = side('away', 78);

function resolve(overrides = {}) {
  return resolveVersionedKnockout({
    shootoutVersion:COMPETITION_SHOOTOUT_VERSION,
    seed:987654,
    userTeamId:'home',
    homeTeamId:'home',
    awayTeamId:'away',
    userIsHome:true,
    homeGoals:1,
    awayGoals:1,
    homePlayers:HOME,
    awayPlayers:AWAY,
    ...overrides,
  });
}

describe('Phase 7 competition shootout adapter', () => {
  it('ignores legacy/unversioned events so old saves retain their existing resolver', () => {
    expect(resolveVersionedKnockout({ shootoutVersion:null })).toBeNull();
    expect(isVersionedShootoutEvent({ shootoutVersion:1 })).toBe(true);
    expect(isVersionedShootoutEvent({})).toBe(false);
  });

  it('does not create a shootout for a decisive single-leg result', () => {
    expect(resolve({ homeGoals:2, awayGoals:1 })).toMatchObject({
      userWon:true,
      penalties:false,
      extraTime:false,
      userAgg:2,
      oppAgg:1,
      shootout:null,
    });
  });

  it('runs one deterministic per-kick shootout for a level single-leg tie', () => {
    const first = resolve();
    const second = resolve();
    expect(first).toEqual(second);
    expect(first.penalties).toBe(true);
    expect(first.extraTime).toBe(true);
    expect(first.shootout.status).toBe('complete');
    expect(first.shootout.kicks.length).toBeGreaterThanOrEqual(6);
    expect(first.shootout.winnerTeamId).toBe(first.userWon ? 'home' : 'away');
  });

  it('keeps a tied first leg open instead of inventing a penalty verdict', () => {
    expect(resolve({ isFirstLeg:true })).toMatchObject({
      tieComplete:false,
      penalties:false,
      extraTime:false,
      userAgg:1,
      oppAgg:1,
      shootout:null,
    });
  });

  it('uses aggregate score for the second leg and avoids penalties when aggregate is decisive', () => {
    expect(resolve({
      previousLeg:{ userGoals:3, oppGoals:1 },
      homeGoals:0,
      awayGoals:1,
    })).toMatchObject({
      userWon:true,
      penalties:false,
      userAgg:3,
      oppAgg:2,
      shootout:null,
    });
  });

  it('uses the same shootout domain when a two-leg aggregate is tied', () => {
    const result = resolve({
      previousLeg:{ userGoals:2, oppGoals:1 },
      homeGoals:0,
      awayGoals:1,
    });
    expect(result.userAgg).toBe(2);
    expect(result.oppAgg).toBe(2);
    expect(result.penalties).toBe(true);
    expect(result.shootout.status).toBe('complete');
  });

  it('maps venue score correctly when the managed team is away in the deciding leg', () => {
    const result = resolve({
      userTeamId:'away',
      userIsHome:false,
      previousLeg:{ userGoals:1, oppGoals:0 },
      homeGoals:2,
      awayGoals:1,
    });
    expect(result.userAgg).toBe(2);
    expect(result.oppAgg).toBe(2);
    expect(result.penalties).toBe(true);
    expect(result.shootout.winnerTeamId).toBe(result.userWon ? 'away' : 'home');
  });

  it('requires explicit eligible final participants when a shootout is actually needed', () => {
    expect(() => resolve({ homePlayers:[], awayPlayers:[] })).toThrow(/SHOOTOUT/);
  });
});
