import { describe, expect, it } from 'vitest';
import {
  ATTRIBUTE_PROFILE_VERSION,
  DETAILED_ATTRIBUTE_KEYS,
  PLAYER_MODEL_VERSION,
  attributeProfileFromSeed,
  baselineLevel,
  detailedAttribute,
  effectiveDetailedAttribute,
  normalizePlayerModel,
  playerModelNeedsNormalization,
  syncDetailedProfileAfterHeadlineChange,
} from './playerModel.js';

function legacyPlayer(id = 'legacy', overrides = {}) {
  return {
    id,
    name:`Player ${id}`,
    position:'RW',
    attack:82,
    midfield:76,
    defence:41,
    goalkeeping:10,
    form:50,
    fitness:100,
    appearances:0,
    minutes:0,
    ...overrides,
  };
}

describe('T1 detailed player attribute profile', () => {
  it('versions the player model and deterministically backfills all six attributes without changing headlines', () => {
    expect(PLAYER_MODEL_VERSION).toBe(5);
    const legacy = legacyPlayer();
    const beforeHeadlines = {
      attack:legacy.attack,
      midfield:legacy.midfield,
      defence:legacy.defence,
      goalkeeping:legacy.goalkeeping,
    };

    const once = normalizePlayerModel(legacy);
    const twice = normalizePlayerModel(once);

    expect(once.attributeProfile.version).toBe(ATTRIBUTE_PROFILE_VERSION);
    expect(Object.keys(once.attributeProfile)).toEqual(['version', ...DETAILED_ATTRIBUTE_KEYS]);
    for (const attribute of DETAILED_ATTRIBUTE_KEYS) {
      expect(Number.isFinite(once.attributeProfile[attribute])).toBe(true);
      expect(once.attributeProfile[attribute]).toBeGreaterThanOrEqual(1);
      expect(once.attributeProfile[attribute]).toBeLessThanOrEqual(99);
    }
    expect({
      attack:once.attack,
      midfield:once.midfield,
      defence:once.defence,
      goalkeeping:once.goalkeeping,
    }).toEqual(beforeHeadlines);
    expect(twice.attributeProfile).toEqual(once.attributeProfile);
    expect(playerModelNeedsNormalization(legacy)).toBe(true);
    expect(playerModelNeedsNormalization(once)).toBe(false);
  });

  it('preserves an authoritative source profile exactly and exposes detailed selectors without affecting baseline ability', () => {
    const profile = {
      version:1,
      pace:91,
      shooting:77,
      passing:80,
      dribbling:89,
      defending:42,
      physical:73,
    };
    const player = normalizePlayerModel(legacyPlayer('source', { attributeProfile:profile }));

    expect(player.attributeProfile).toEqual(profile);
    expect(detailedAttribute(player, 'pace')).toBe(91);
    expect(detailedAttribute(player, 'unknown')).toBeUndefined();
    expect(baselineLevel(player)).toBe(82);
  });

  it('rescales a current seed shape around saved career ability while keeping the saved headline ratings unchanged', () => {
    const seed = normalizePlayerModel(legacyPlayer('same-id', {
      attack:78,
      midfield:72,
      defence:38,
      attributeProfile:{ version:1, pace:86, shooting:72, passing:75, dribbling:84, defending:38, physical:69 },
    }));
    const saved = legacyPlayer('same-id', { attack:82, midfield:76, defence:41 });
    const migrated = attributeProfileFromSeed(saved, seed);

    expect(migrated).toEqual({
      version:1,
      pace:90,
      shooting:76,
      passing:79,
      dribbling:88,
      defending:42,
      physical:73,
    });
    expect(saved.attack).toBe(82);
    expect(saved.midfield).toBe(76);
    expect(saved.defence).toBe(41);
  });

  it('mirrors an existing headline development change into one plan-relevant detailed attribute only', () => {
    const before = normalizePlayerModel(legacyPlayer('growth', {
      developmentPlan:{ id:'finishing' },
      attributeProfile:{ version:1, pace:86, shooting:75, passing:77, dribbling:84, defending:40, physical:72 },
    }));
    const afterHeadlineGrowth = { ...before, attack:before.attack + 1 };
    const after = syncDetailedProfileAfterHeadlineChange(before, afterHeadlineGrowth, '2026/27:4');
    const changed = DETAILED_ATTRIBUTE_KEYS.filter(
      attribute => after.attributeProfile[attribute] !== before.attributeProfile[attribute],
    );

    expect(after.attack).toBe(before.attack + 1);
    expect(after.midfield).toBe(before.midfield);
    expect(after.defence).toBe(before.defence);
    expect(changed).toHaveLength(1);
    expect(['shooting', 'dribbling', 'physical']).toContain(changed[0]);
    expect(after.attributeProfile[changed[0]]).toBe(before.attributeProfile[changed[0]] + 1);
  });

  it('projects transient player state onto detailed attributes without persisting a competing effective profile', () => {
    const neutral = normalizePlayerModel(legacyPlayer('effective', {
      attributeProfile:{ version:1, pace:88, shooting:79, passing:77, dribbling:86, defending:42, physical:71 },
    }));
    const inForm = { ...neutral, form:100 };
    const projected = effectiveDetailedAttribute(inForm, 'pace');

    expect(projected).toBeGreaterThan(neutral.attributeProfile.pace);
    expect(inForm.attributeProfile.pace).toBe(88);
  });
});
