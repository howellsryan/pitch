import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ players:[], reads:[] }));
vi.mock('./db.js', () => ({
  getAllPlayers:async () => { state.reads.push('world'); return structuredClone(state.players); },
  getPlayersByTeam:async id => { state.reads.push(id); return structuredClone(state.players.filter(row => row.teamId === id)); },
  getPlayersByTeams:async ids => { state.reads.push(ids); return structuredClone(state.players.filter(row => ids.includes(row.teamId))); },
  getPlayer:async id => { state.reads.push(id); return structuredClone(state.players.find(row => row.id === id)); },
}));
import { readP5WeekPlayers } from './p5Runtime.js';
import { readMarketWeekPlayers } from './transfers.js';
import { advanceScoutingState, createScoutingAssignment, createScoutingState } from './scouting.js';
import { rankRecruitmentCandidates } from './squadPlanning.js';

beforeEach(() => {
  state.players = [
    { id:'home', teamId:'user', name:'Home', position:'ST', age:24, attack:70, potentialRating:80 },
    { id:'target', teamId:'seller', name:'Target', position:'ST', age:24, attack:75, potentialRating:85 },
    { id:'released', teamId:'free_agents' }, { id:'idle', teamId:'free_agents' },
  ];
  state.reads = [];
});
describe('weekly player read scope', () => {
  const teams = [{ id:'user' }, { id:'seller' }];
  it('reads the managed club alone when scouting has no live assignment', async () => {
    const save = { userTeamId:'user', season:'2026/27', currentGameweek:2, scouting:createScoutingState() };
    expect((await readP5WeekPlayers(save, teams)).map(row => row.id)).toEqual(['home']);
    expect(state.reads).toEqual(['user']);
  });
  it('keeps scouting reports identical to a full-world read for active assignments', async () => {
    const scouting = createScoutingAssignment(createScoutingState(), { type:'position', position:'ST' }, { season:'2026/27', gameweek:1 });
    const save = { userTeamId:'user', season:'2026/27', currentGameweek:2, scouting };
    const players = await readP5WeekPlayers(save, teams);
    const context = { season:save.season, gameweek:2, teamsById:new Map(teams.map(t => [t.id,t])) };
    expect(advanceScoutingState(scouting, { ...context, players })).toEqual(advanceScoutingState(scouting, { ...context, players:state.players }));
    expect(players.some(row => row.teamId === 'free_agents')).toBe(false);
    expect(state.reads).not.toContain('world');
  });
  it('keeps free-agent negotiation targets and both squads outside the transfer window', async () => {
    const save = { season:'2026/27', currentDate:'2026-11-01' };
    const market = { activeDeals:[{ state:'player_negotiation', playerId:'released', buyerTeamId:'user', sellerTeamId:'seller' }] };
    expect((await readMarketWeekPlayers(save, market, teams)).map(row => row.id).sort()).toEqual(['home','released','target']);
    expect(state.reads).not.toContain('world');
    expect(state.reads).toContain('released');
  });
  it('keeps open-window eligible recruitment rankings while excluding idle free agents', async () => {
    const save = { season:'2026/27', currentDate:'2026-08-20' };
    const players = await readMarketWeekPlayers(save, { activeDeals:[] }, teams);
    const context = { need:{ group:'ATT', position:'ST', maxBudget:5000000, targetAbilityBand:{ min:50, max:80 }, preferredAgeMax:28 }, buyer:{ id:'user', budget:5000000, reputation:70 }, teamsById:new Map(teams.map(team => [team.id,team])), marketValueFor:() => 1000000, canSign:() => true, observationFor:() => ({ confidence:1, current:{ min:70, max:80 }, future:{ min:75, max:85 } }) };
    const full = rankRecruitmentCandidates({ ...context, players:state.players });
    expect(full.length).toBeGreaterThan(0);
    expect(full.every(item => Number.isFinite(item.score))).toBe(true);
    expect(rankRecruitmentCandidates({ ...context, players })).toEqual(full);
    expect(state.reads).not.toContain('world');
    expect(players.some(row => row.teamId === 'free_agents')).toBe(false);
  });
  it('includes an active free-agent contract target during an open window', async () => {
    const save = { season:'2026/27', currentDate:'2026-08-20' };
    const market = { activeDeals:[{ state:'player_negotiation', playerId:'released', buyerTeamId:'user', sellerTeamId:'free_agents' }] };
    expect((await readMarketWeekPlayers(save, market, teams)).map(row => row.id)).toEqual(['home','target','released']);
    expect(state.reads).not.toContain('world');
  });
});
