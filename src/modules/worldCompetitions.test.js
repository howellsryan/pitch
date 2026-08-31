import { describe, expect, it } from 'vitest';

import {
  advanceWorldCompetitions,
  buildWorldCompetitionHistory,
  buildWorldCompetitionState,
  markWorldCompetitionRecordsApplied,
  pendingWorldCompetitionRecords,
  worldCompetitionRunsForTeam,
} from './worldCompetitions.js';

function team(id, league = 'League Two', reputation = 60) {
  return { id, name:id, league, reputation, crest:'x' };
}

function squad(teamId, rating = 70) {
  const positions = ['GK','RB','CB','CB','LB','CM','CM','CAM','RW','LW','ST'];
  return positions.map((position, index) => ({
    id:`${teamId}_p${index}`,
    name:`${teamId} Player ${index}`,
    teamId,
    position,
    attack:position === 'GK' ? 20 : rating,
    midfield:position === 'GK' ? 20 : rating,
    defence:position === 'GK' ? 20 : rating,
    goalkeeping:position === 'GK' ? rating : 10,
    fitness:100,
    age:24,
    inSquad:true,
  }));
}

function playersByTeam(teams) {
  return new Map(teams.map(item => [item.id, squad(item.id, item.reputation ?? 70)]));
}

describe('P1 living-world competitions', () => {
  it('seeds supported domestic and European competitions without duplicating the managed club', () => {
    const teams = [
      team('user', 'Premier League', 96),
      ...Array.from({ length:39 }, (_, index) => team(`top_${index}`, index % 2 ? 'La Liga' : 'Premier League', 95 - index / 10)),
      ...Array.from({ length:4 }, (_, index) => team(`l2_${index}`, 'League Two', 55 + index)),
    ];

    const world = buildWorldCompetitionState(teams, '2025/26', 'user');

    expect(world.competitions.fa_cup).toBeTruthy();
    expect(world.competitions.league_cup).toBeTruthy();
    expect(world.competitions.copa_del_rey).toBeTruthy();
    expect(world.competitions.dfb_pokal).toBeTruthy();
    expect(world.competitions.coppa_italia).toBeTruthy();
    expect(world.competitions.coupe_de_france).toBeTruthy();
    expect(world.competitions.knvb_beker).toBeTruthy();
    expect(world.competitions.ucl).toBeTruthy();
    expect(world.competitions.uel).toBeTruthy();
    expect(world.competitions.uecl).toBeTruthy();
    expect(Object.values(world.competitions).some(comp => comp.progressByTeam?.user)).toBe(false);
  });

  it('advances scheduled AI cup ties through the authoritative fast match engine', async () => {
    const teams = Array.from({ length:4 }, (_, index) => team(`l2_${index}`, 'League Two', 60 + index));
    const world = buildWorldCompetitionState(teams, '2025/26', null);
    const result = await advanceWorldCompetitions(world, 1, teams, playersByTeam(teams));
    const leagueCup = result.state.competitions.league_cup;

    expect(result.records).toHaveLength(2);
    expect(result.records.every(record => record.competitionId === 'league_cup')).toBe(true);
    expect(result.records.every(record => record.projectionsApplied === false)).toBe(true);
    expect(leagueCup.roundIndex).toBe(1);
    expect(leagueCup.activeTeamIds).toHaveLength(2);
  });

  it('exposes pending canonical cup records and marks only the applied IDs', async () => {
    const teams = Array.from({ length:4 }, (_, index) => team(`l2_${index}`, 'League Two', 60 + index));
    const world = buildWorldCompetitionState(teams, '2025/26', null);
    const result = await advanceWorldCompetitions(world, 1, teams, playersByTeam(teams));
    const pending = pendingWorldCompetitionRecords(result.state);

    expect(pending).toHaveLength(2);
    const applied = markWorldCompetitionRecordsApplied(result.state, [pending[0].id]);
    expect(pendingWorldCompetitionRecords(applied)).toHaveLength(1);
    expect(pendingWorldCompetitionRecords(applied)[0].id).toBe(pending[1].id);
  });

  it('keeps inspectable per-club cup progress', async () => {
    const teams = Array.from({ length:4 }, (_, index) => team(`l2_${index}`, 'League Two', 60 + index));
    const world = buildWorldCompetitionState(teams, '2025/26', null);
    const result = await advanceWorldCompetitions(world, 1, teams, playersByTeam(teams));
    const selected = teams[0].id;
    const runs = worldCompetitionRunsForTeam(result.state, selected);

    expect(runs.league_cup).toBeTruthy();
    expect(['active','eliminated']).toContain(runs.league_cup.status);
  });

  it('compacts competition history to winners/leaders instead of copying another ledger', () => {
    const player = { id:'p1', name:'Top Scorer', teamId:'a' };
    const world = {
      version:1,
      season:'2025/26',
      competitions:{
        cup:{
          id:'cup', winnerId:'a', runnerUpId:'b',
          results:[{
            events:[{ type:'goal', playerId:'p1', assistId:null }],
          }],
        },
      },
    };
    const history = buildWorldCompetitionHistory(world, [player]);

    expect(history).toEqual([expect.objectContaining({
      competition:'cup', winner:'a', runnerUp:'b', matches:1,
      topScorer:expect.objectContaining({ playerId:'p1', name:'Top Scorer', value:1 }),
    })]);
    expect(history[0]).not.toHaveProperty('results');
  });
});
