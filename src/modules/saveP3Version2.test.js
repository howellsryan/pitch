import { describe, expect, it } from 'vitest';
import { buildP3PlayerModelBackfill } from './save.js';
import { PLAYER_MODEL_VERSION, baselineLevel } from './playerModel.js';

function v2Player(id, overrides = {}) {
  return {
    id,
    name:`Player ${id}`,
    position:'CM',
    attack:70,
    midfield:81,
    defence:66,
    goalkeeping:12,
    teamId:'club',
    appearances:21,
    minutes:1674,
    form:63,
    positionSuitability:{ CM:1 },
    traits:[],
    individualMorale:50,
    sharpness:50,
    squadRole:null,
    squadRoleSource:null,
    squadRoleTeamId:null,
    playingTimeAgreement:null,
    growthProfile:null,
    rehabilitation:null,
    personalStateAppearances:21,
    personalStateMinutes:1674,
    personalStateSettledKey:null,
    ...overrides,
  };
}

describe('P3 player contract v2 to final backfill', () => {
  it('adds final player state without changing durable football or personal-state history', () => {
    const before = v2Player('existing', {
      onLoan:true,
      loanOriginalTeamId:'parent',
      injuryName:'Calf strain',
      potentialRating:89,
    });
    const save = {
      playerModelVersion:2,
      userTeamId:'club',
      season:'2025/26',
      currentGameweek:24,
      lineup:['existing'],
      pendingEvents:[{ type:'cup', gw:24 }],
    };

    const migration = buildP3PlayerModelBackfill(save, [before], []);
    const [after] = migration.playerPatches;

    expect(PLAYER_MODEL_VERSION).toBe(5);
    expect(migration.save.playerModelVersion).toBe(PLAYER_MODEL_VERSION);
    expect(migration.save.lineup).toEqual(save.lineup);
    expect(migration.save.pendingEvents).toEqual(save.pendingEvents);
    expect(after.id).toBe(before.id);
    expect(after.teamId).toBe(before.teamId);
    expect(after.onLoan).toBe(true);
    expect(after.loanOriginalTeamId).toBe('parent');
    expect(after.injuryName).toBe(before.injuryName);
    expect(after.potentialRating).toBe(before.potentialRating);
    expect(after.personalStateAppearances).toBe(21);
    expect(after.personalStateMinutes).toBe(1674);
    expect(after.personalStateSettledKey).toBeNull();
    expect(after.squadRole).toBe('crucial');
    expect(after.squadRoleTeamId).toBe('club');
    expect(after.playingTimeAgreement).toMatchObject({ scope:'managed', teamId:'club', role:'crucial', status:'settling' });
    expect(after.growthProfile).toBeTruthy();
    expect(after.potentialKnowledge).toBeGreaterThan(0);
    expect(after.traits.length).toBeGreaterThan(0);
    expect(after.attributeProfile).toMatchObject({ version:1 });
    expect(after.attack).toBe(before.attack);
    expect(after.midfield).toBe(before.midfield);
    expect(after.defence).toBe(before.defence);
    expect(after.goalkeeping).toBe(before.goalkeeping);
    expect(baselineLevel(after)).toBe(baselineLevel(before));
  });

  it('does not rescan once the final P3 save marker is current', () => {
    const current = {
      ...v2Player('current'),
      attributeProfile:{ version:1, pace:75, shooting:70, passing:82, dribbling:79, defending:67, physical:73 },
      squadRole:'crucial',
      squadRoleSource:'auto',
      squadRoleTeamId:'club',
      playingTimeAgreement:{
        version:1, scope:'managed', teamId:'club', role:'crucial', status:'settling', history:[],
        appearanceShare:0, minuteShare:0, deliveryScore:1, lastEvaluatedKey:null,
      },
    };
    const save = { playerModelVersion:PLAYER_MODEL_VERSION, userTeamId:'club', lineup:['current'] };
    const migration = buildP3PlayerModelBackfill(save, [current], []);

    expect(migration.save).toBe(save);
    expect(migration.playerPatches).toEqual([]);
    expect(migration.teamPatches).toEqual([]);
  });
});