import { describe, expect, it, vi } from 'vitest';

const career = vi.hoisted(() => ({ teams:[], players:[], save:null, manager:null }));
vi.mock('./db.js', () => ({
  getAllTeams:async () => structuredClone(career.teams),
  getAllPlayers:async () => structuredClone(career.players),
  getSave:async () => structuredClone(career.save),
  getManager:async () => structuredClone(career.manager),
  putTeam:async team => {
    career.teams = career.teams.map(existing => existing.id === team.id ? structuredClone(team) : existing);
  },
}));

import { processLeagueChanges, runPlayoffs } from './promotion.js';

describe('English season movement settlement', () => {
  it('lets the AI manage the former club in playoffs when the user is between jobs', async () => {
    career.teams = Array.from({ length:24 }, (_, index) => ({
      id:`champ_${index + 1}`, name:`Club ${index + 1}`, league:'Championship', reputation:65,
    }));
    career.players = career.teams.flatMap(team => ['GK','RB','CB','CB','LB','CM','CM','CAM','RW','LW','ST'].map((position, index) => ({
      id:`${team.id}_p${index}`, name:`Player ${index}`, teamId:team.id, position,
      age:24, attack:65, midfield:65, defence:65,
      goalkeeping:position === 'GK' ? 65 : 10, fitness:100, inSquad:true,
    })));
    career.manager = { id:'user_manager', status:'unemployed', currentClubId:null };
    career.save = {
      season:'2025/26', userTeamId:'champ_3', userLeague:'Championship', userManagerId:'user_manager',
      formation:'3-5-2', mentality:'attacking', tactics:{ pressing:'aggressive', tempo:'fast' }, bench:[],
    };
    const standings = career.teams.map((team, index) => ({
      teamId:team.id, teamName:team.name, league:team.league,
      position:index + 1, points:24 - index, goalDifference:0, goalsFor:0,
    }));
    const expected = runPlayoffs(['champ_3','champ_4','champ_5','champ_6'], career.teams, career.players);
    const changes = await processLeagueChanges(standings, standings, 'champ_3');

    expect(changes.playoffResults.Championship).toEqual(expected.playoffResults);
  });

  it('moves four clubs between League One and League Two while preserving every division size', async () => {
    const definitions = [
      ['Premier League','pl',20], ['Championship','champ',24],
      ['League One','l1',24], ['League Two','l2',24],
    ];
    career.teams = definitions.flatMap(([league, prefix, size]) => Array.from({ length:size }, (_, index) => ({
      id:`${prefix}_${index + 1}`, name:`${prefix} ${index + 1}`, league, reputation:65,
    })));
    career.players = career.teams.flatMap(team => ['GK','RB','CB','CB','LB','CM','CM','CAM','RW','LW','ST'].map((position, index) => ({
      id:`${team.id}_p${index}`, name:`Player ${index}`, teamId:team.id, position,
      age:24, attack:65, midfield:65, defence:65,
      goalkeeping:position === 'GK' ? 65 : 10, fitness:100, inSquad:true,
    })));
    career.save = { season:'2025/26', userTeamId:'l1_21', userLeague:'League One', formation:'4-3-3' };
    const standings = definitions.flatMap(([league, prefix, size]) => Array.from({ length:size }, (_, index) => ({
      teamId:`${prefix}_${index + 1}`, teamName:`${prefix} ${index + 1}`, league,
      position:index + 1, points:size - index, goalDifference:0, goalsFor:0,
    })));
    const changes = await processLeagueChanges(standings.filter(row => row.league === 'League One'), standings, 'l1_21');

    expect(changes.movements.filter(move => move.from === 'League One' && move.to === 'League Two').map(move => move.teamId))
      .toEqual(['l1_21','l1_22','l1_23','l1_24']);
    const promoted = changes.movements.filter(move => move.from === 'League Two' && move.to === 'League One');
    expect(promoted).toHaveLength(4);
    expect(promoted.slice(0, 3).map(move => move.teamId)).toEqual(['l2_1','l2_2','l2_3']);
    expect(['l2_4','l2_5','l2_6','l2_7']).toContain(promoted[3].teamId);
    expect(changes.userRelInfo.relegated).toBe(true);
    for (const [league, , size] of definitions) expect(career.teams.filter(team => team.league === league)).toHaveLength(size);
  });
});
