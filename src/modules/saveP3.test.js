import { describe, expect, it } from 'vitest';
import { buildP3PlayerModelBackfill } from './save.js';
import { PLAYER_MODEL_VERSION, playerModelNeedsNormalization } from './playerModel.js';
import { generateYouthPlayer } from './youthAcademy.js';
import { generateReplacementNewgens } from './world.js';

function legacyPlayer(id, overrides = {}) {
  return {
    id,
    name:`Player ${id}`,
    position:'CM',
    age:24,
    attack:70,
    midfield:78,
    defence:66,
    goalkeeping:12,
    potentialRating:84,
    growthPoints:9,
    peakAge:28,
    fitness:87,
    form:61,
    appearances:14,
    minutes:942,
    goals:3,
    assists:5,
    injuryName:null,
    contractExpiry:2028,
    transferHistory:[{ from:'old', to:'current', fee:4_000_000 }],
    ...overrides,
  };
}

describe('P3 additive player-model migration', () => {
  it('normalises persisted players, save youth and team youth while preserving P2 state', () => {
    const lineup = Array.from({ length:11 }, (_, index) => `p${index + 1}`);
    const saveYouth = legacyPlayer('academy_user', { teamId:null, youthTeamId:'user', isYouth:true });
    const teamYouth = legacyPlayer('academy_ai', { teamId:null, youthTeamId:'ai', isYouth:true });
    const save = {
      userTeamId:'user',
      season:'2025/26',
      currentGameweek:17,
      formation:'4-2-3-1',
      mentality:'attacking',
      lineup,
      pendingEvents:[{ id:'cup_17' }],
      worldCompetitions:{ season:'2025/26', competitions:{ ucl:{} } },
      youthCohort:[saveYouth],
    };
    const players = [
      legacyPlayer('active', { teamId:'user' }),
      legacyPlayer('free', { teamId:'free_agents', contractExpiry:null }),
      legacyPlayer('loan', { teamId:'loan_club', onLoan:true, loanOriginalTeamId:'parent', loanedFrom:'parent' }),
      legacyPlayer('newgen', { teamId:'ai', generated:true, generatedSeason:'2025/26' }),
    ];
    const teams = [
      { id:'user', youthPlayers:[] },
      { id:'ai', reputation:78, youthPlayers:[teamYouth] },
    ];

    const migration = buildP3PlayerModelBackfill(save, players, teams);

    expect(migration.save.playerModelVersion).toBe(PLAYER_MODEL_VERSION);
    expect(migration.save.lineup).toEqual(lineup);
    expect(migration.save.pendingEvents).toEqual(save.pendingEvents);
    expect(migration.save.worldCompetitions).toEqual(save.worldCompetitions);
    expect(migration.save.currentGameweek).toBe(17);
    expect(migration.save.youthCohort[0].id).toBe(saveYouth.id);
    expect(playerModelNeedsNormalization(migration.save.youthCohort[0])).toBe(false);

    expect(migration.playerPatches).toHaveLength(players.length);
    for (const migrated of migration.playerPatches) {
      const before = players.find(player => player.id === migrated.id);
      expect(migrated).toMatchObject(before);
      expect(migrated.transferHistory).toEqual(before.transferHistory);
      expect(playerModelNeedsNormalization(migrated)).toBe(false);
    }
    expect(migration.playerPatches.find(player => player.id === 'loan')).toMatchObject({
      teamId:'loan_club',
      onLoan:true,
      loanOriginalTeamId:'parent',
      loanedFrom:'parent',
    });
    expect(migration.playerPatches.find(player => player.id === 'free').teamId).toBe('free_agents');

    expect(migration.teamPatches).toHaveLength(1);
    expect(migration.teamPatches[0].id).toBe('ai');
    expect(migration.teamPatches[0].reputation).toBe(78);
    expect(playerModelNeedsNormalization(migration.teamPatches[0].youthPlayers[0])).toBe(false);
  });

  it('does no migration work once the save-level domain marker is current', () => {
    const currentSave = { playerModelVersion:PLAYER_MODEL_VERSION, lineup:['existing'] };
    const result = buildP3PlayerModelBackfill(
      currentSave,
      [legacyPlayer('would_require_scan')],
      [{ id:'ai', youthPlayers:[legacyPlayer('would_require_team_scan')] }],
    );

    expect(result.save).toBe(currentSave);
    expect(result.playerPatches).toEqual([]);
    expect(result.teamPatches).toEqual([]);
  });

  it('converges after an interrupted write by skipping rows already normalised before the marker is set', () => {
    const first = buildP3PlayerModelBackfill(
      { season:'2025/26' },
      [legacyPlayer('old')],
      [{ id:'ai', youthPlayers:[legacyPlayer('academy')] }],
    );
    const interruptedSave = { season:'2025/26' };
    const second = buildP3PlayerModelBackfill(
      interruptedSave,
      first.playerPatches,
      first.teamPatches,
    );

    expect(second.playerPatches).toEqual([]);
    expect(second.teamPatches).toEqual([]);
    expect(second.save.playerModelVersion).toBe(PLAYER_MODEL_VERSION);
  });
});

describe('P3 player creation adapters', () => {
  it('creates academy prospects on the canonical player contract', () => {
    const prospect = generateYouthPlayer('club', 75, '2025/26', 0, 'Premier League', false);
    expect(playerModelNeedsNormalization(prospect)).toBe(false);
    expect(prospect.positionSuitability[prospect.position]).toBe(1);
  });

  it('creates replacement newgens on the canonical player contract', () => {
    const [newgen] = generateReplacementNewgens([
      legacyPlayer('retired', { teamId:'club', position:'ST', attack:82, age:37 }),
    ], [
      { id:'club', league:'Premier League', reputation:80 },
    ], '2026/27');

    expect(newgen).toBeTruthy();
    expect(playerModelNeedsNormalization(newgen)).toBe(false);
    expect(newgen.generated).toBe(true);
    expect(newgen.positionSuitability[newgen.position]).toBe(1);
  });
});
