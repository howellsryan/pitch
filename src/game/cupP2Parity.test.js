import { describe, expect, it } from 'vitest';
import { createUserTacticalPlan, getAITacticalProfile } from '../modules/tactics.js';
import {
  resolveCupProgress,
  resolveSingleLegKnockout,
  simulateCupRound,
} from '../modules/cups.js';

function player(id, teamId, position, rating = 78) {
  return {
    id,
    teamId,
    name:id,
    position,
    age:25,
    attack:['ST','RW','LW'].includes(position) ? rating : rating - 10,
    midfield:['CM','CDM','CAM','RW','LW'].includes(position) ? rating : rating - 8,
    defence:['CB','RB','LB','CDM'].includes(position) ? rating : rating - 15,
    goalkeeping:position === 'GK' ? rating : 8,
    fitness:90,
    injured:false,
    suspended:false,
    inSquad:true,
  };
}

function squad(teamId) {
  const positions = ['GK','CB','CB','RB','LB','CDM','CM','CAM','RW','LW','ST','GK','CB','CM','RW'];
  return positions.map((position, index) => player(`${teamId}_${index}`, teamId, position, 76 + index % 4));
}

describe('P2 cup parity', () => {
  it('resolves a tied single-leg knockout deterministically without fabricating a regulation goal', () => {
    const a = resolveSingleLegKnockout(1, 1, 'same-match-seed');
    const b = resolveSingleLegKnockout(1, 1, 'same-match-seed');

    expect(a).toEqual(b);
    expect(a.penalties).toBe(true);
    expect(a.extraTime).toBe(true);
    expect(typeof a.userWon).toBe('boolean');
  });

  it('uses the same deterministic aggregate tiebreak for the same watched/quick seed', () => {
    const cupState = {
      results:[{ userGoals:1, oppGoals:0, userIsHome:true }],
    };
    const first = resolveCupProgress('ucl', 'R16 (Leg 2)', 3, cupState, 0, 1, false, false, 98765);
    const second = resolveCupProgress('ucl', 'R16 (Leg 2)', 3, cupState, 0, 1, false, false, 98765);

    expect(first.aggregate).toEqual(second.aggregate);
    expect(first.aggregate.penalties).toBe(true);
    expect(first.aggregate.extraTime).toBe(true);
  });

  it('keeps the saved user formation and lets the AI use its P2 identity in cup simulation', () => {
    const userTeam = {
      id:'user', name:'User', league:'Premier League', reputation:82,
      tacticalPlan:createUserTacticalPlan({ buildUp:'direct', pressing:'aggressive', transition:'counter' }),
    };
    const opponent = { id:'opp', name:'Opponent', league:'Premier League', reputation:78 };
    const userPlayers = squad('user').map((p, index) => ({ ...p, tacticalRole:index === 10 ? 'poacher' : null }));
    const oppPlayers = squad('opp');
    const playersByTeam = new Map([['user', userPlayers], ['opp', oppPlayers]]);
    const lineup = userPlayers.slice(0, 11).map(p => p.id);
    const result = simulateCupRound(
      userTeam,
      userPlayers,
      [userTeam, opponent],
      playersByTeam,
      'fa_cup',
      'Round 3',
      {
        opponentId:'opp', opponentName:'Opponent', userIsHome:true,
        userFormation:'4-2-3-1', userLineup:lineup, userMentality:'attacking',
      },
    );
    const expectedAI = getAITacticalProfile(opponent, userTeam, false);

    expect(result.homeFormation).toBe('4-2-3-1');
    expect(result.homeMentality).toBe('attacking');
    expect(result.homeTactics.pressing).toBe('aggressive');
    expect(result.awayFormation).toBe(expectedAI.formation);
    expect(result.awayMentality).toBe(expectedAI.mentality);
    expect(result.seed).toBeTypeOf('number');
  });
});
