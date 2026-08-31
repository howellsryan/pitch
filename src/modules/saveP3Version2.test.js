import { describe, expect, it } from 'vitest';
import { buildP3PlayerModelBackfill } from './save.js';
import { PLAYER_MODEL_VERSION, baselineLevel } from './playerModel.js';

function v1Player(id, overrides = {}) {
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
    playingTimeAgreement:null,
    growthProfile:null,
    rehabilitation:null,
    ...overrides,
  };
}

describe('P3 player contract v1 to v2 backfill', () => {
  it('seeds personal-state snapshots from current cumulative stats without changing football state', () => {
    const before = v1Player('existing', {
      onLoan:true,
      loanOriginalTeamId:'parent',
      injuryName:'Calf strain',
      potentialRating:89,
    });
    const save = {
      playerModelVersion:1,
      currentGameweek:24,
      lineup:['existing'],
      pendingEvents:[{ type:'cup', gw:24 }],
    };

    const migration = buildP3PlayerModelBackfill(save, [before], []);
    const [after] = migration.playerPatches;

    expect(PLAYER_MODEL_VERSION).toBe(2);
    expect(migration.save.playerModelVersion).toBe(2);
    expect(migration.save.lineup).toEqual(save.lineup);
    expect(migration.save.pendingEvents).toEqual(save.pendingEvents);
    expect(after).toMatchObject(before);
    expect(after.personalStateAppearances).toBe(21);
    expect(after.personalStateMinutes).toBe(1674);
    expect(after.personalStateSettledGameweek).toBeNull();
    expect(baselineLevel(after)).toBe(baselineLevel(before));
  });

  it('does not rewrite a v2 player or rescan once the save marker is current', () => {
    const current = {
      ...v1Player('current'),
      personalStateAppearances:21,
      personalStateMinutes:1674,
      personalStateSettledGameweek:null,
    };
    const save = { playerModelVersion:PLAYER_MODEL_VERSION, lineup:['current'] };
    const migration = buildP3PlayerModelBackfill(save, [current], []);

    expect(migration.save).toBe(save);
    expect(migration.playerPatches).toEqual([]);
    expect(migration.teamPatches).toEqual([]);
  });
});
