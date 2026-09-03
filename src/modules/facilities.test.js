import { describe, expect, it } from 'vitest';
import {
  FACILITIES_VERSION,
  FACILITY_LEAD_TIME_WEEKS,
  FACILITY_MAX_LEVEL,
  FACILITY_TRACKS,
  beginFacilityUpgrade,
  buildFacilitiesBackfill,
  completeDueFacilityUpgrades,
  createFacilities,
  decideAIFacilityInvestment,
  describeFacilityConsumer,
  facilitiesNeedBackfill,
  facilityUpgradeCost,
  isFacilityUpgradeDue,
  medicalRecoveryMultiplier,
  scoutingCapacityBonus,
  scoutingConfidenceMultiplier,
  trainingEfficiencyMultiplier,
} from './facilities.js';

function team(overrides = {}) {
  return { id:'club_a', budget:20_000_000, finance:{ version:1, cash:20_000_000, seasonTotals:{}, recentEntries:[], obligations:[] }, facilities:createFacilities(), ...overrides };
}

describe('createFacilities', () => {
  it('starts every track at level 1 with no upgrade in progress', () => {
    const facilities = createFacilities();
    expect(facilities.version).toBe(FACILITIES_VERSION);
    for (const track of FACILITY_TRACKS) expect(facilities.tracks[track]).toEqual({ level:1, upgrading:null });
  });
});

describe('facilitiesNeedBackfill / buildFacilitiesBackfill', () => {
  it('needs backfill for a missing save or stale version', () => {
    expect(facilitiesNeedBackfill(null)).toBe(true);
    expect(facilitiesNeedBackfill({})).toBe(true);
    expect(facilitiesNeedBackfill({ facilitiesVersion:FACILITIES_VERSION })).toBe(false);
  });

  it('patches only teams missing a current facilities block', () => {
    const already = { id:'a', facilities:createFacilities() };
    const missing = { id:'b' };
    const migration = buildFacilitiesBackfill({}, [already, missing]);
    expect(migration.teamPatches.map(t => t.id)).toEqual(['b']);
    expect(migration.save.facilitiesVersion).toBe(FACILITIES_VERSION);
  });

  it('is idempotent', () => {
    const first = buildFacilitiesBackfill({}, [{ id:'a' }]);
    const second = buildFacilitiesBackfill(first.save, first.teamPatches);
    expect(second.teamPatches).toEqual([]);
  });
});

describe('facilityUpgradeCost', () => {
  it('rises with the level being left', () => {
    expect(facilityUpgradeCost(2)).toBeGreaterThan(facilityUpgradeCost(1));
  });
});

describe('beginFacilityUpgrade', () => {
  it('debits the cost through the ledger and schedules the level change', () => {
    const before = team();
    const updated = beginFacilityUpgrade(before, 'training', { weekKey:'x', season:'2025/26', currentGameweek:5 });
    const cost = facilityUpgradeCost(1);
    expect(updated.budget).toBe(20_000_000 - cost);
    expect(updated.finance.cash).toBe(updated.budget);
    expect(updated.finance.seasonTotals.facility_investment).toBe(-cost);
    expect(updated.facilities.tracks.training.upgrading).toEqual({ targetLevel:2, dueSeason:'2025/26', dueGameweek:5 + FACILITY_LEAD_TIME_WEEKS });
    expect(updated.facilities.tracks.training.level).toBe(1); // unchanged until completion
  });

  it('does not touch the other tracks', () => {
    const updated = beginFacilityUpgrade(team(), 'medical', { weekKey:'x', season:'2025/26', currentGameweek:1 });
    expect(updated.facilities.tracks.training).toEqual({ level:1, upgrading:null });
    expect(updated.facilities.tracks.scouting).toEqual({ level:1, upgrading:null });
  });

  it('rejects an invalid track', () => {
    expect(() => beginFacilityUpgrade(team(), 'academy', {})).toThrow('INVALID_FACILITY_TRACK');
  });

  it('rejects a second upgrade on a track already in progress', () => {
    const mid = beginFacilityUpgrade(team(), 'training', { weekKey:'x', season:'2025/26', currentGameweek:1 });
    expect(() => beginFacilityUpgrade(mid, 'training', { weekKey:'y', season:'2025/26', currentGameweek:2 })).toThrow('UPGRADE_ALREADY_IN_PROGRESS');
  });

  it('rejects when the club cannot afford it', () => {
    const broke = team({ budget:1, finance:{ version:1, cash:1, seasonTotals:{}, recentEntries:[], obligations:[] } });
    expect(() => beginFacilityUpgrade(broke, 'training', {})).toThrow('INSUFFICIENT_FUNDS');
  });

  it('rejects upgrading past the max level', () => {
    const maxed = team();
    maxed.facilities = { ...maxed.facilities, tracks:{ ...maxed.facilities.tracks, training:{ level:FACILITY_MAX_LEVEL, upgrading:null } } };
    expect(() => beginFacilityUpgrade(maxed, 'training', {})).toThrow('FACILITY_AT_MAX_LEVEL');
  });
});

describe('isFacilityUpgradeDue / completeDueFacilityUpgrades', () => {
  it('is due once the gameweek is reached in the scheduled season', () => {
    const save = { season:'2025/26', currentGameweek:11 };
    expect(isFacilityUpgradeDue({ dueSeason:'2025/26', dueGameweek:11 }, save)).toBe(true);
    expect(isFacilityUpgradeDue({ dueSeason:'2025/26', dueGameweek:12 }, save)).toBe(false);
  });

  it('is due as a catch-up once the save has moved to a different season', () => {
    expect(isFacilityUpgradeDue({ dueSeason:'2025/26', dueGameweek:40 }, { season:'2026/27', currentGameweek:1 })).toBe(true);
  });

  it('is never due without an upgrade in progress', () => {
    expect(isFacilityUpgradeDue(null, { season:'2025/26', currentGameweek:5 })).toBe(false);
  });

  it('completes only the due tracks, leaving others in progress', () => {
    let t = beginFacilityUpgrade(team(), 'training', { weekKey:'x', season:'2025/26', currentGameweek:1 });
    t = beginFacilityUpgrade(t, 'scouting', { weekKey:'x', season:'2025/26', currentGameweek:1 });
    // Force training due now, leave scouting scheduled far in the future.
    t = { ...t, facilities:{ ...t.facilities, tracks:{ ...t.facilities.tracks, training:{ ...t.facilities.tracks.training, upgrading:{ ...t.facilities.tracks.training.upgrading, dueGameweek:5 } } } } };
    const settled = completeDueFacilityUpgrades(t, { season:'2025/26', currentGameweek:5 });
    expect(settled.facilities.tracks.training).toEqual({ level:2, upgrading:null });
    expect(settled.facilities.tracks.scouting.upgrading).not.toBeNull();
  });

  it('returns the same reference when nothing is due', () => {
    const t = beginFacilityUpgrade(team(), 'training', { weekKey:'x', season:'2025/26', currentGameweek:1 });
    expect(completeDueFacilityUpgrades(t, { season:'2025/26', currentGameweek:1 })).toBe(t);
  });
});

describe('consumer selectors default to neutral at baseline level 1', () => {
  it('training/medical multipliers are exactly 1 at level 1', () => {
    expect(trainingEfficiencyMultiplier(team())).toBe(1);
    expect(medicalRecoveryMultiplier(team())).toBe(1);
    expect(scoutingConfidenceMultiplier(team())).toBe(1);
    expect(scoutingCapacityBonus(team())).toBe(0);
  });

  it('a team with no facilities field at all also reads as neutral (pre-backfill safety)', () => {
    expect(trainingEfficiencyMultiplier({})).toBe(1);
    expect(scoutingCapacityBonus({})).toBe(0);
  });

  it('multipliers increase with level, capped modestly', () => {
    const upgraded = team();
    upgraded.facilities = { ...upgraded.facilities, tracks:{ ...upgraded.facilities.tracks, training:{ level:FACILITY_MAX_LEVEL, upgrading:null } } };
    const boosted = trainingEfficiencyMultiplier(upgraded);
    expect(boosted).toBeGreaterThan(1);
    expect(boosted).toBeLessThan(1.2);
  });
});

describe('describeFacilityConsumer', () => {
  it('names the real P3/P5 consumer for each track', () => {
    expect(describeFacilityConsumer('training')).toMatch(/development/i);
    expect(describeFacilityConsumer('medical')).toMatch(/recovery/i);
    expect(describeFacilityConsumer('scouting')).toMatch(/scouting/i);
    expect(describeFacilityConsumer('academy')).toBeNull();
  });
});

describe('decideAIFacilityInvestment', () => {
  it('never invests when the club is not financially stable', () => {
    const strained = team({ budget:100_000, finance:{ version:1, cash:100_000, seasonTotals:{}, recentEntries:[], obligations:[] } });
    expect(decideAIFacilityInvestment(strained, { season:'2025/26', currentGameweek:1 })).toBeNull();
  });

  it('is deterministic for the same club/season — same call twice gives the same answer', () => {
    const t = team({ id:'club_deterministic' });
    const a = decideAIFacilityInvestment(t, { season:'2025/26', currentGameweek:1 });
    const b = decideAIFacilityInvestment(t, { season:'2025/26', currentGameweek:1 });
    expect(a).toEqual(b);
  });

  it('when it does invest, it is always a valid beginFacilityUpgrade result on a real track', () => {
    // Try many club ids until one rolls under the invest threshold, proving the code path is reachable and correct.
    let found = null;
    for (let i = 0; i < 500 && !found; i++) {
      const t = team({ id:`club_${i}` });
      const result = decideAIFacilityInvestment(t, { season:'2025/26', currentGameweek:1 });
      if (result) found = result;
    }
    expect(found).not.toBeNull();
    expect(FACILITY_TRACKS.some(track => found.facilities.tracks[track].upgrading)).toBe(true);
  });
});
