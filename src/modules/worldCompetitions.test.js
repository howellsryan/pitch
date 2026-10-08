import { describe, expect, it } from 'vitest';

import { getCompetitionRules } from './competitionRules.js';
import { scheduledWorldCompetitionTeamIds } from './worldRuntime.js';

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

function europeanTeams(count = 110) {
  const leagues = ['Premier League', 'La Liga', 'Bundesliga', 'Serie A', 'Ligue 1', 'Eredivisie'];
  return Array.from({ length:count }, (_, index) => team(
    `euro_${index}`,
    leagues[index % leagues.length],
    99 - index / 10,
  ));
}

describe('P1 living-world competitions', () => {
  it.each([
    ['dfb_pokal', 'Bundesliga', 18],
    ['coupe_de_france', 'Ligue 1', 18],
    ['knvb_beker', 'Eredivisie', 15],
  ])('plays exactly one %s final with a runner-up even with a reduced field', async (cupId, league, size) => {
    const teams = Array.from({ length:size }, (_, index) => team(`club_${index}`, league, 65));
    let state = buildWorldCompetitionState(teams, '2025/26', null);
    for (const gw of getCompetitionRules(cupId).roundGWs) {
      const advanced = await advanceWorldCompetitions(state, gw, teams, playersByTeam(teams));
      state = advanced.state;
    }
    const comp = state.competitions[cupId];
    const finals = comp.results.filter(record => record.roundName === 'Final');
    expect(finals).toHaveLength(1);
    expect(comp.winnerId).toBe(finals[0].winnerId);
    expect(comp.runnerUpId).toBeTruthy();
    expect(comp.runnerUpId).not.toBe(comp.winnerId);
  }, 20_000);

  it('reserves enough FA Cup places for later Premier League and Championship entrants', async () => {
    const teams = [
      ...Array.from({ length:46 }, (_, index) => team(`lower_${index}`, 'League One')),
      ...Array.from({ length:44 }, (_, index) => team(`upper_${index}`, 'Premier League')),
    ];
    let state = buildWorldCompetitionState(teams, '2025/26', null);
    for (const gw of getCompetitionRules('fa_cup').roundGWs) {
      state = (await advanceWorldCompetitions(state, gw, teams, playersByTeam(teams))).state;
    }
    const comp = state.competitions.fa_cup;
    expect(comp.results.filter(record => record.roundName === 'R3')).toHaveLength(32);
    expect(comp.results.filter(record => record.roundName === 'Final')).toHaveLength(1);
    expect(comp.runnerUpId).toBeTruthy();
  }, 20_000);

  it('predicts only the clubs that actually play while other clubs receive scheduled byes', async () => {
    const teams = Array.from({ length:18 }, (_, index) => team(`club_${index}`, 'Bundesliga'));
    let state = buildWorldCompetitionState(teams, '2025/26', null);
    expect([...scheduledWorldCompetitionTeamIds(state, 3)]).toEqual([]);
    state = (await advanceWorldCompetitions(state, 3, teams, playersByTeam(teams))).state;
    const expectedParticipants = [...scheduledWorldCompetitionTeamIds(state, 8)].sort();
    const advanced = await advanceWorldCompetitions(state, 8, teams, playersByTeam(teams));
    const actualParticipants = [...new Set(advanced.records.flatMap(record => [record.homeTeamId, record.awayTeamId]))].sort();
    expect(expectedParticipants).toHaveLength(4);
    expect(actualParticipants).toEqual(expectedParticipants);
  });

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

  it('aligns a migrated post-league-phase career to the next UEFA knockout round', () => {
    const world = buildWorldCompetitionState(europeanTeams(), '2025/26', null, 25);
    const ucl = world.competitions.ucl;

    expect(ucl.phase).toBe('knockout');
    expect(ucl.roundIndex).toBe(2);
    expect(ucl.activeTeamIds).toHaveLength(16);
    expect(ucl.activeTeamIds.every(teamId => ucl.progressByTeam[teamId]?.status === 'active')).toBe(true);
    expect(ucl.table.every((row, index) => row.position === index + 1)).toBe(true);
  });

  it('advances scheduled AI cup ties through the authoritative fast match engine', async () => {
    const teams = Array.from({ length:4 }, (_, index) => team(`club_${index}`, 'La Liga', 60 + index));
    const world = buildWorldCompetitionState(teams, '2025/26', null);
    const result = await advanceWorldCompetitions(world, 4, teams, playersByTeam(teams));
    const supercopa = result.state.competitions.supercopa;

    expect(result.records).toHaveLength(2);
    expect(result.records.every(record => record.competitionId === 'supercopa')).toBe(true);
    expect(result.records.every(record => record.projectionsApplied === false)).toBe(true);
    expect(supercopa.roundIndex).toBe(1);
    expect(supercopa.activeTeamIds).toHaveLength(2);
  });

  it('exposes pending canonical cup records and marks only the applied IDs', async () => {
    const teams = Array.from({ length:4 }, (_, index) => team(`club_${index}`, 'La Liga', 60 + index));
    const world = buildWorldCompetitionState(teams, '2025/26', null);
    const result = await advanceWorldCompetitions(world, 4, teams, playersByTeam(teams));
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
