import { describe, expect, it } from 'vitest';
import { playerStatusNeedsNormalization } from './playerStatus.js';

import {
  applyWorldPlayerStats,
  buildLivingWorldSeasonSummary,
  buildWorldBackfill,
  buildWorldLeagueSeason,
  compactPlayerRegistrationSpells,
  compactHistoricalSeason,
  omitIdleUnattachedHistory,
  compactAppliedLeagueRecord,
  generateReplacementNewgens,
  resetSeasonPlayerStats,
  resultFromCanonicalLeagueRecord,
  toCanonicalLeagueRecord,
} from './world.js';

function team(id, league, reputation = 70) {
  return { id, name:id.toUpperCase(), shortName:id.slice(0, 3).toUpperCase(), league, reputation, budget:10_000_000 };
}

describe('applied league payload compaction', () => {
  const goal = { type:'goal', minute:20, teamId:'a', playerId:'scorer', assistId:'assist' };
  const make = () => ({
    id:'fixture', worldRecordVersion:1, played:true, projectionsApplied:true,
    homeTeamId:'a', awayTeamId:'b', homeGoals:1, awayGoals:0, seed:123,
    homeTactics:{ pressing:'high' }, stats:{ shots:{ home:5, away:3 } },
    events:[goal, { type:'injury', playerId:'other' }], fitnessUpdates:[{ id:'scorer', newFitness:70 }],
  });

  it('retains the authoritative report fields while removing consumed AI player payloads', () => {
    const record = make();
    const compacted = compactAppliedLeagueRecord(record, 'managed');
    expect(compacted).toMatchObject({ homeGoals:1, awayGoals:0, seed:123, homeTactics:record.homeTactics, stats:record.stats, events:[goal], fitnessUpdates:[] });
    expect(record.events).toHaveLength(2);
    expect(compactAppliedLeagueRecord(compacted, 'managed')).toBe(compacted);
  });

  it('keeps pending recovery, current-club fixtures and previously managed reports detailed', () => {
    for (const record of [
      { ...make(), projectionsApplied:false }, { ...make(), homeTeamId:'managed' },
      { ...make(), tacticalAnalysis:{ version:1 } },
      { ...make(), projectionPayloadCompactedVersion:2 },
    ]) expect(compactAppliedLeagueRecord(record, 'managed')).toBe(record);
  });
});

function player(id, teamId, position = 'CM') {
  return {
    id,
    name:id,
    teamId,
    position,
    age:24,
    attack:68,
    midfield:72,
    defence:65,
    goalkeeping:position === 'GK' ? 74 : 12,
    appearances:0,
    starts:0,
    minutes:0,
    goals:0,
    assists:0,
    cleanSheets:0,
    yellowCards:0,
    form:50,
  };
}

describe('P1 living-world contracts', () => {
  it('creates a full double round-robin schedule and table for every supported league', () => {
    const teams = [
      team('a1', 'League A'), team('a2', 'League A'), team('a3', 'League A'), team('a4', 'League A'),
      team('b1', 'League B'), team('b2', 'League B'), team('b3', 'League B'), team('b4', 'League B'),
    ];

    const world = buildWorldLeagueSeason(teams, 2025);

    expect(world.fixtures).toHaveLength(24);
    expect(world.standings).toHaveLength(8);
    expect(new Set(world.fixtures.map(f => f.league))).toEqual(new Set(['League A', 'League B']));
    expect(world.fixtures.filter(f => f.league === 'League A')).toHaveLength(12);
    expect(world.fixtures.filter(f => f.league === 'League B')).toHaveLength(12);
    expect(world.standings.filter(row => row.league === 'League A').map(row => row.position)).toEqual([1, 2, 3, 4]);
    expect(world.standings.filter(row => row.league === 'League B').map(row => row.position)).toEqual([1, 2, 3, 4]);
  });

  it('backfills missing leagues without replacing an existing P0 league schedule', () => {
    const teams = [
      team('a1', 'League A'), team('a2', 'League A'),
      team('b1', 'League B'), team('b2', 'League B'),
    ];
    const existingFixture = {
      id:'legacy_a', competition:'league', gameweek:1, homeTeamId:'a1', awayTeamId:'a2', played:true,
    };
    const existingStanding = { teamId:'a1', teamName:'A1', played:1, points:3 };

    const patch = buildWorldBackfill(teams, [existingFixture], [existingStanding], 2025);

    expect(patch.fixturesToAdd.some(f => f.id === 'legacy_a')).toBe(true);
    expect(patch.fixturesToAdd.find(f => f.id === 'legacy_a')).toMatchObject({ league:'League A', played:true });
    expect(patch.fixturesToAdd.filter(f => f.league === 'League B')).toHaveLength(2);
    expect(patch.standingsToAdd.find(row => row.teamId === 'a1')).toMatchObject({ league:'League A', points:3 });
    expect(patch.standingsToAdd.some(row => row.teamId === 'b1')).toBe(true);
    expect(patch.standingsToAdd.some(row => row.teamId === 'b2')).toBe(true);
  });

  it('round-trips one canonical match record without inventing another result', () => {
    const fixture = {
      id:'gw1_a_b', competition:'league', gameweek:1, league:'League A', homeTeamId:'a', awayTeamId:'b', played:false,
    };
    const result = {
      homeTeamId:'a', awayTeamId:'b', homeGoals:2, awayGoals:1,
      homeScorers:[{ type:'goal', playerId:'a9', assistId:'a8' }],
      awayScorers:[{ type:'goal', playerId:'b9' }],
      events:[{ type:'yellow', minute:40, teamId:'b', playerId:'b4' }],
      fitnessUpdates:[{ id:'a9', teamId:'a', newFitness:72 }],
      stats:{ shots:{ home:12, away:8 } },
      seed:'saved-match-seed',
      homeTactics:{ pressing:'high' }, awayTactics:{ pressing:'low' },
      tacticalAnalysis:{ version:1, phases:[] },
      actionLedger:{ phases:[{ large:'private authoritative ledger' }] },
    };

    const canonical = toCanonicalLeagueRecord(fixture, result, '2025/26');
    const restored = resultFromCanonicalLeagueRecord(canonical);

    expect(canonical).toMatchObject({ played:true, projectionsApplied:false, season:'2025/26', homeGoals:2, awayGoals:1 });
    expect(restored).toMatchObject({ fixtureId:fixture.id, homeTeamId:'a', awayTeamId:'b', homeGoals:2, awayGoals:1, gameweek:1 });
    expect(restored.events).toEqual(result.events);
    expect(restored).toMatchObject({ seed:result.seed, homeTactics:result.homeTactics, awayTactics:result.awayTactics, tacticalAnalysis:result.tacticalAnalysis });
    expect(canonical).not.toHaveProperty('actionLedger');
  });

  it('derives appearances, minutes, goals, assists, cards, ratings and goalkeeper clean sheets from one result', () => {
    const cache = new Map([
      ['gk', player('gk', 'a', 'GK')],
      ['starter', player('starter', 'a', 'ST')],
      ['creator', player('creator', 'a', 'CM')],
      ['sub', player('sub', 'a', 'RW')],
      ['opp', player('opp', 'b', 'ST')],
    ]);
    const result = {
      homeTeamId:'a', awayTeamId:'b', homeGoals:1, awayGoals:0, gameweek:4,
      fitnessUpdates:[
        { id:'gk', teamId:'a', newFitness:80 },
        { id:'starter', teamId:'a', newFitness:68 },
        { id:'creator', teamId:'a', newFitness:70 },
        { id:'opp', teamId:'b', newFitness:67 },
      ],
      events:[
        { type:'sub', minute:60, teamId:'a', outId:'creator', inId:'sub' },
        { type:'goal', minute:75, teamId:'a', playerId:'starter', assistId:'sub' },
        { type:'yellow', minute:82, teamId:'b', playerId:'opp' },
      ],
    };

    applyWorldPlayerStats(cache, [result]);

    expect(cache.get('starter')).toMatchObject({ appearances:1, starts:1, minutes:90, goals:1 });
    expect(cache.get('creator')).toMatchObject({ appearances:1, starts:1, minutes:60 });
    expect(cache.get('sub')).toMatchObject({ appearances:1, starts:0, minutes:30, assists:1 });
    expect(cache.get('gk')).toMatchObject({ appearances:1, cleanSheets:1 });
    expect(cache.get('opp')).toMatchObject({ appearances:1, yellowCards:1 });
    expect(cache.get('starter').averageRating).toBeGreaterThan(6);
  });

  it('resets only season projections while keeping the durable player identity intact', () => {
    const original = { ...player('p1', 'a'), goals:12, assists:7, minutes:2200, averageRating:7.2, yellowCards:5 };
    const reset = resetSeasonPlayerStats(original);

    expect(reset).toMatchObject({ id:'p1', teamId:'a', goals:0, assists:0, minutes:0, yellowCards:0, averageRating:null });
  });

  it('stores compact league, club and player history from the same season projections', () => {
    const teams = [team('a', 'League A'), team('b', 'League A')];
    const standings = [
      { teamId:'a', teamName:'A', league:'League A', position:1, points:80, form:['W','W'] },
      { teamId:'b', teamName:'B', league:'League A', position:2, points:70, form:['L','W'] },
    ];
    const players = [
      { ...player('ace', 'a', 'ST'), appearances:30, minutes:2500, goals:21, assists:4, averageRating:7.8, ratingApps:30 },
      { ...player('maker', 'b', 'CM'), appearances:28, minutes:2300, goals:5, assists:12, averageRating:7.4, ratingApps:28 },
    ];
    const transfers = [{ playerId:'ace', fromTeamId:'b', toTeamId:'a', fee:25_000_000, type:'buy', date:'2025-08-20' }];

    const history = buildLivingWorldSeasonSummary({
      save:{ season:'2025/26', userTeamId:'a', managerName:'Manager' },
      teams, standings, players, transfers,
    });

    expect(history.competitionHistory[0]).toMatchObject({ competition:'League A', champion:'a' });
    expect(history.competitionHistory[0].topScorer).toMatchObject({ playerId:'ace', value:21 });
    expect(history.competitionHistory[0].topAssists).toMatchObject({ playerId:'maker', value:12 });
    expect(history.clubHistory.find(row => row.teamId === 'a')).toMatchObject({ finish:1, manager:'Manager' });
    expect(history.playerHistory.find(row => row.playerId === 'ace').transfers).toHaveLength(1);
  });

  it('P9 stores separate academy and loan registration spells without changing aggregate season totals', () => {
    const p = {
      ...player('pathway', 'loan_club', 'CM'),
      appearances:8, starts:6, minutes:540, ratingTotal:49, ratingApps:8, averageRating:6.13,
      registrationSpells:[
        {
          id:'spell-academy', status:'academy', contractTeamId:'parent', registeredTeamId:'parent',
          startSeason:'2025/26', startGameweek:1, endSeason:'2025/26', endGameweek:5,
          startStats:{ appearances:0, starts:0, minutes:0, goals:0, assists:0, cleanSheets:0, ratingTotal:0, ratingApps:0 },
          endStats:{ appearances:0, starts:0, minutes:0, goals:0, assists:0, cleanSheets:0, ratingTotal:0, ratingApps:0 },
          startAcademyEvidence:{ appearances:0, starts:0, minutes:0, goals:0, assists:0, cleanSheets:0, ratingTotal:0, ratingApps:0 },
          endAcademyEvidence:{ appearances:2, starts:2, minutes:170, goals:0, assists:1, cleanSheets:0, ratingTotal:13.6, ratingApps:2 },
        },
        {
          id:'spell-loan', status:'loan', contractTeamId:'parent', registeredTeamId:'loan_club',
          startSeason:'2025/26', startGameweek:8, endSeason:null, endGameweek:null,
          startStats:{ appearances:0, starts:0, minutes:0, goals:0, assists:0, cleanSheets:0, ratingTotal:0, ratingApps:0 },
          startAcademyEvidence:null,
        },
      ],
    };

    const spells = compactPlayerRegistrationSpells(p, '2025/26');
    expect(spells).toHaveLength(2);
    expect(spells[0]).toMatchObject({ status:'academy', registeredTeamId:'parent', academy:{ appearances:2, minutes:170, assists:1, averageRating:6.8 } });
    expect(spells[0].senior.appearances).toBe(0);
    expect(spells[1]).toMatchObject({ status:'loan', registeredTeamId:'loan_club', senior:{ appearances:8, starts:6, minutes:540 } });

    const history = buildLivingWorldSeasonSummary({
      save:{ season:'2025/26', userTeamId:'parent', managerName:'Manager' },
      teams:[team('parent', 'League A'), team('loan_club', 'League A')],
      standings:[],
      players:[p],
    });
    const row = history.playerHistory[0];
    expect(row.appearances).toBe(8);
    expect(row.spells).toEqual(spells);
  });

  it('compacts older world detail while preserving manager records and every football contribution', () => {
    const managed = { playerId:'captain', clubs:['parent'], appearances:32, spells:[{ status:'first_team', senior:{ appearances:32 } }], majorInjuries:[{ name:'Knee' }] };
    const opponent = { playerId:'opponent', clubs:['other'], appearances:28, goals:7, spells:[{ status:'first_team', senior:{ appearances:28 } }], majorInjuries:[{ name:'Ankle' }] };
    const youth = { playerId:'youth', clubs:['other'], appearances:0, spells:[{ status:'academy', academy:{ appearances:20, minutes:1400, goals:2, ratingTotal:130, ratingApps:20 } }] };
    const idle = { playerId:'idle', clubs:['free_agents'], appearances:0, goals:0, spells:[], transfers:[], individualAwards:[] };
    const source = { id:7, season:'2026/27', userTeamId:'parent', champion:'other', competitionHistory:[{ champion:'other' }], playerHistory:[managed, opponent, youth, idle] };
    const compact = compactHistoricalSeason(source);
    expect(compact).toMatchObject({ id:7, season:'2026/27', champion:'other', competitionHistory:source.competitionHistory });
    expect(compact.playerHistory).toHaveLength(3);
    expect(compact.playerHistory[0]).toBe(managed);
    expect(compact.playerHistory[1]).toMatchObject({ playerId:'opponent', clubs:['other'], appearances:28, goals:7, majorInjuryCount:1 });
    expect(compact.playerHistory[1].spells).toBeUndefined();
    expect(compact.playerHistory[2].academy).toMatchObject({ appearances:20, minutes:1400, goals:2, averageRating:6.5 });
    expect(source.playerHistory).toHaveLength(4);
    expect(opponent.spells).toHaveLength(1);
    expect(compactHistoricalSeason(compact)).toBe(compact);
  });

  it('identifies the managed club in an older archive without an explicit club id', () => {
    const row = { playerId:'captain', clubs:['parent'], spells:[{ status:'first_team' }] };
    const compact = compactHistoricalSeason({ season:'2025/26', userFinish:2, table:[{ teamId:'other' }, { teamId:'parent' }], playerHistory:[row] });
    expect(compact.playerHistory[0]).toBe(row);
  });

  it('omits only idle unattached archive rows without losing registrations or football history', () => {
    const idle = { playerId:'idle', clubs:['free_agents'], appearances:0, spells:[{ status:'free_agent', registeredTeamId:'free_agents', contractTeamId:null, senior:{ appearances:0 }, academy:{ appearances:0 } }] };
    const retained = [
      { ...idle, playerId:'released', spells:[{ status:'first_team', registeredTeamId:'club', senior:{} }, ...idle.spells] },
      { ...idle, playerId:'injured', majorInjuries:[{ name:'Knee' }] },
      { ...idle, playerId:'moved', transfers:[{ fromTeamId:'club' }] },
      { ...idle, playerId:'senior', appearances:1 },
      { ...idle, playerId:'academy', spells:[{ ...idle.spells[0], academy:{ minutes:30 } }] },
      { ...idle, playerId:'award', individualAwards:['top_scorer'] },
      { ...idle, playerId:'registered', clubs:['club'] },
    ];
    const source = { season:'2038/39', playerHistory:[idle, ...retained] };
    const result = omitIdleUnattachedHistory(source);
    expect(result.playerHistory).toEqual(retained);
    for (let i=0; i<retained.length; i++) expect(result.playerHistory[i]).toBe(retained[i]);
    expect(source.playerHistory).toHaveLength(8);
    expect(omitIdleUnattachedHistory(result)).toBe(result);
  });

  it('tolerates sparse legacy archive rows without blocking career boot', () => {
    const compact = compactHistoricalSeason({ playerHistory:[null, { playerId:'legacy', appearances:3, clubs:0, spells:{} }] });
    expect(compact.playerHistory).toEqual([{ playerId:'legacy', appearances:3, clubs:0 }]);
  });

  it('keeps three recent seasons of world totals and lifelong manager and award records', () => {
    const manager = { playerId:'captain', clubs:['parent'], appearances:30, spells:[] };
    const winner = { playerId:'winner', clubs:['other'], appearances:30, goals:20, individualAwards:['top_scorer'] };
    const ordinary = { playerId:'ordinary', clubs:['other'], appearances:30, goals:3 };
    const source = { season:'2026/27', userTeamId:'parent', champion:'other', playerHistory:[manager, winner, ordinary] };
    expect(compactHistoricalSeason(source, 2029).playerHistory).toHaveLength(3);
    const old = compactHistoricalSeason(compactHistoricalSeason(source, 2029), 2030);
    expect(old.playerHistory.map(row => row.playerId)).toEqual(['captain', 'winner']);
    expect(old.champion).toBe('other');
    expect(old.playerHistorySummaryOnly).toBe(true);
    expect(compactHistoricalSeason(old, 2031)).toBe(old);
  });

  it('does not credit past academy games to another season or registration type', () => {
    for (const status of ['academy', 'first_team', 'loan', 'free_agent']) {
      const archived = compactPlayerRegistrationSpells({
        ...player('alumnus', status === 'free_agent' ? 'free_agents' : 'other'),
        academyEvidence:{ season:'2025/26', appearances:20, minutes:1400 },
        registrationSpells:[{ id:'spell', status, startSeason:'2025/26', endSeason:null }],
      }, '2026/27');
      expect(archived[0].academy).toMatchObject({ appearances:0, minutes:0 });
    }
  });

  it('replaces retirees one-for-one with context-calibrated generated players', () => {
    const teams = [team('a', 'League A', 85), team('b', 'League B', 60)];
    const retirees = [
      { ...player('old_a', 'a', 'ST'), age:37, attack:84 },
      { ...player('old_b', 'b', 'GK'), age:38, goalkeeping:66 },
    ];

    const generated = generateReplacementNewgens(retirees, teams, '2026/27');

    expect(generated).toHaveLength(2);
    expect(generated[0]).toMatchObject({ teamId:'a', position:'ST', generated:true, generatedSeason:'2026/27' });
    expect(generated[1]).toMatchObject({ teamId:'b', position:'GK', generated:true, generatedSeason:'2026/27' });
    expect(generated.every(p => p.age >= 17 && p.age <= 20)).toBe(true);
    expect(new Set(generated.map(p => p.id)).size).toBe(2);
    for (const player of generated) {
      expect(playerStatusNeedsNormalization(player)).toBe(false);
      expect(player).toMatchObject({
        playerStatus:'first_team', contractTeamId:player.teamId,
        registeredTeamId:player.teamId, inSquad:true, onLoan:false,
      });
      expect(player.registrationSpells).toHaveLength(1);
      expect(player.registrationSpells[0]).toMatchObject({
        status:'first_team', contractTeamId:player.teamId,
        registeredTeamId:player.teamId, startSeason:'2026/27',
        startGameweek:1, endSeason:null, reason:'retirement_replacement',
      });
    }
  });
});
