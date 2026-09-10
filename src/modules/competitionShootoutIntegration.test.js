import { describe, expect, it } from 'vitest';
import { CUP_META, deriveFinalShootoutParticipants, hasCommittedShootoutResult, resolveCupProgress } from './cups.js';
import { buildPendingEvents, resolveManagedKnockoutDecision } from './gameweek.js';
import { COMPETITION_SHOOTOUT_VERSION } from './competitionShootouts.js';

function player(id, teamId, position, rating = 80) {
  return {
    id,
    name:id,
    teamId,
    position,
    attack:rating,
    midfield:rating,
    defence:rating,
    goalkeeping:position === 'GK' ? rating : 8,
    fitness:90,
    inSquad:true,
    injured:false,
    suspended:false,
    attributeProfile:{ shooting:rating, physical:rating, passing:rating, pace:rating, dribbling:rating, defending:rating },
  };
}

function squad(teamId, prefix, rating = 80) {
  const positions = ['GK','CB','CB','RB','LB','CM','CM','CDM','RW','LW','ST','CM','ST','GK','CB'];
  return positions.map((position, index) => player(`${prefix}${index}`, teamId, position, rating - index));
}

const HOME = squad('home', 'h', 86);
const AWAY = squad('away', 'a', 79);

describe('Phase 7 competition integration', () => {
  it('versions newly-created knockout events but leaves league events alone', () => {
    const gw = CUP_META.fa_cup.roundGWs[0];
    const events = buildPendingEvents(
      gw,
      'home',
      [{ id:'league-fixture', competition:'league', gameweek:gw, homeTeamId:'home', awayTeamId:'away', played:false }],
      { fa_cup:{ id:'fa_cup', status:'active', roundIndex:0, results:[] } },
      [{ id:'home', name:'Home', league:'League Two' }, { id:'away', name:'Away', league:'League Two' }],
    );
    expect(events.find(event => event.type === 'league')?.shootoutVersion).toBeUndefined();
    expect(events.find(event => event.type === 'cup')).toMatchObject({
      type:'cup',
      cupId:'fa_cup',
      roundName:'R1',
      shootoutVersion:COMPETITION_SHOOTOUT_VERSION,
    });
  });

  it('keeps legacy pending knockout events on the old resolver boundary', () => {
    expect(resolveManagedKnockoutDecision({
      event:{ type:'cup', cupId:'fa_cup', roundName:'R1' },
      cupState:{ results:[] },
      userTeamId:'home', userIsHome:true,
      homeTeamId:'home', awayTeamId:'away', homeGoals:1, awayGoals:1,
    })).toBeNull();
  });

  it('accepts a committed watched-match shootout only when it belongs to the exact fixture', () => {
    const event = { type:'cup', cupId:'fa_cup', roundName:'R1', shootoutVersion:1 };
    const summary = {
      version:1, shootoutId:'shootout:1:test', status:'complete', phase:'complete',
      homeTeamId:'home', awayTeamId:'away', winnerTeamId:'away', loserTeamId:'home',
      homeScore:3, awayScore:4, kicks:[],
    };
    const decision = resolveManagedKnockoutDecision({
      event,
      cupState:{ results:[] },
      userTeamId:'home', userIsHome:true,
      homeTeamId:'home', awayTeamId:'away', homeGoals:1, awayGoals:1,
      seed:42, committedShootout:summary,
    });
    expect(decision).toMatchObject({ userWon:false, penalties:true, shootout:summary });
    expect(() => resolveManagedKnockoutDecision({
      event,
      cupState:{ results:[] },
      userTeamId:'home', userIsHome:true,
      homeTeamId:'home', awayTeamId:'away', homeGoals:1, awayGoals:1,
      committedShootout:{ ...summary, awayTeamId:'other' },
    })).toThrow('COMPETITION_SHOOTOUT_COMMITTED_RESULT_INVALID');
  });

  it('resolves a quick-sim tie through the same per-kick shootout domain', () => {
    const decision = resolveManagedKnockoutDecision({
      event:{ type:'cup', cupId:'fa_cup', roundName:'R1', shootoutVersion:1 },
      cupState:{ results:[] },
      userTeamId:'home', userIsHome:true,
      homeTeamId:'home', awayTeamId:'away', homeGoals:2, awayGoals:2,
      seed:9981, homePlayers:HOME.slice(0, 11), awayPlayers:AWAY.slice(0, 11),
    });
    expect(decision.penalties).toBe(true);
    expect(decision.shootout.status).toBe('complete');
    expect(decision.shootout.winnerTeamId).toBe(decision.userWon ? 'home' : 'away');
  });

  it('uses aggregate score before starting a two-leg UEFA shootout', () => {
    const event = { type:'cup', cupId:'ucl', roundName:'R16 (Leg 2)', shootoutVersion:1 };
    const cupState = { results:[{ roundName:'R16 (Leg 1)', userGoals:2, oppGoals:1, userIsHome:false }] };
    const decisive = resolveManagedKnockoutDecision({
      event, cupState, userTeamId:'home', userIsHome:true,
      homeTeamId:'home', awayTeamId:'away', homeGoals:0, awayGoals:0,
      seed:8, homePlayers:HOME.slice(0, 11), awayPlayers:AWAY.slice(0, 11),
    });
    expect(decisive).toMatchObject({ userAgg:2, oppAgg:1, penalties:false, userWon:true });

    const tied = resolveManagedKnockoutDecision({
      event, cupState, userTeamId:'home', userIsHome:true,
      homeTeamId:'home', awayTeamId:'away', homeGoals:0, awayGoals:1,
      seed:8, homePlayers:HOME.slice(0, 11), awayPlayers:AWAY.slice(0, 11),
    });
    expect(tied).toMatchObject({ userAgg:2, oppAgg:2, penalties:true });
    expect(tied.shootout.status).toBe('complete');
  });

  it('projects the real final XI after substitutions and current fitness', () => {
    const players = squad('home', 'p', 84);
    const initial = deriveFinalShootoutParticipants(players, '4-3-3', null, 'home');
    const outgoing = initial.find(playerRow => playerRow.position !== 'GK');
    const incoming = players.find(playerRow => !initial.some(active => active.id === playerRow.id) && playerRow.position !== 'GK');
    const final = deriveFinalShootoutParticipants(
      players,
      '4-3-3',
      null,
      'home',
      [{ type:'sub', teamId:'home', outId:outgoing.id, inId:incoming.id }],
      [{ id:incoming.id, teamId:'home', newFitness:77 }],
    );
    expect(final).toHaveLength(11);
    expect(final.some(playerRow => playerRow.id === outgoing.id)).toBe(false);
    expect(final.find(playerRow => playerRow.id === incoming.id)?.fitness).toBe(77);
  });

  it('uses a versioned aggregate verdict in cup progression and stores the shootout exactly once', () => {
    const summary = { shootoutId:'shootout:1:aggregate', status:'complete', winnerTeamId:'home' };
    const state = { results:[{ userGoals:1, oppGoals:0, userIsHome:false }] };
    const versioned = {
      version:1, userWon:true, penalties:true, extraTime:true,
      userAgg:2, oppAgg:2, shootout:summary,
    };
    const progress = resolveCupProgress('ucl', 'R16 (Leg 2)', 3, state, 1, 2, true, true, 1, versioned);
    expect(progress.aggregate).toEqual({
      userWon:true, penalties:true, extraTime:true, userAgg:2, oppAgg:2, shootout:summary,
    });
    expect(progress.roundIndex).toBe(4);
    expect(hasCommittedShootoutResult({ results:[{ shootout:summary }] }, summary.shootoutId)).toBe(true);
    expect(hasCommittedShootoutResult({ results:[{ aggregate:{ shootout:summary } }] }, summary.shootoutId)).toBe(true);
  });
});
