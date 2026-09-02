import { describe, expect, it } from 'vitest';
import {
  CLUB_PHILOSOPHY_VERSION,
  PHILOSOPHY_TRAITS,
  buildClubPhilosophyBackfill,
  clubPhilosophiesNeedBackfill,
  clubPhilosophyTraitValue,
  defaultClubPhilosophy,
  describeClubPhilosophy,
  generateClubPhilosophy,
  normalizeClubPhilosophy,
} from './clubPhilosophy.js';

const bigClub = { id:'club_big', name:'Big FC', league:'Premier League', reputation:88 };
const smallClub = { id:'club_small', name:'Small FC', league:'League Two', reputation:40 };

describe('generateClubPhilosophy', () => {
  it('is deterministic for the same club', () => {
    const a = generateClubPhilosophy(bigClub, bigClub.league);
    const b = generateClubPhilosophy(bigClub, bigClub.league);
    expect(a).toEqual(b);
  });

  it('every trait is bounded [0, 100]', () => {
    const philosophy = generateClubPhilosophy(bigClub, bigClub.league);
    for (const trait of PHILOSOPHY_TRAITS) {
      expect(philosophy.traits[trait]).toBeGreaterThanOrEqual(0);
      expect(philosophy.traits[trait]).toBeLessThanOrEqual(100);
    }
    expect(philosophy.version).toBe(CLUB_PHILOSOPHY_VERSION);
  });

  it('produces measurably different traits for clubs with different reputations', () => {
    const big = generateClubPhilosophy(bigClub, bigClub.league);
    const small = generateClubPhilosophy(smallClub, smallClub.league);
    expect(big.traits.starRecruitment).toBeGreaterThan(small.traits.starRecruitment);
    expect(big.traits.financialCaution).toBeLessThan(small.traits.financialCaution);
  });

  it('different clubs seed different values even with identical inputs', () => {
    const clubA = generateClubPhilosophy({ id:'club_a', league:'Serie A', reputation:65 }, 'Serie A');
    const clubB = generateClubPhilosophy({ id:'club_b', league:'Serie A', reputation:65 }, 'Serie A');
    expect(clubA).not.toEqual(clubB);
  });
});

describe('normalizeClubPhilosophy', () => {
  it('passes through an already-current philosophy unchanged in shape', () => {
    const philosophy = generateClubPhilosophy(bigClub, bigClub.league);
    const normalized = normalizeClubPhilosophy(philosophy, bigClub, bigClub.league);
    expect(normalized.traits).toEqual(philosophy.traits);
  });

  it('re-seeds a missing philosophy deterministically', () => {
    const normalized = normalizeClubPhilosophy(null, bigClub, bigClub.league);
    expect(normalized).toEqual(generateClubPhilosophy(bigClub, bigClub.league));
  });

  it('re-seeds a stale-versioned philosophy', () => {
    const normalized = normalizeClubPhilosophy({ version:0, traits:{} }, bigClub, bigClub.league);
    expect(normalized).toEqual(generateClubPhilosophy(bigClub, bigClub.league));
  });
});

describe('describeClubPhilosophy', () => {
  it('describes a balanced philosophy as balanced', () => {
    expect(describeClubPhilosophy(defaultClubPhilosophy())).toBe('Balanced club identity');
  });

  it('names the club\'s most extreme traits, capped at max', () => {
    const philosophy = { version:1, traits:{ ...defaultClubPhilosophy().traits, youthPathway:90, financialCaution:85, buyToSell:80 } };
    const description = describeClubPhilosophy(philosophy, { max:2 });
    expect(description.split(', ')).toHaveLength(2);
    expect(description).toContain('Youth Pathway');
  });

  it('describes a low trait distinctly from a high one', () => {
    const philosophy = { version:1, traits:{ ...defaultClubPhilosophy().traits, possessionIdentity:10 } };
    expect(describeClubPhilosophy(philosophy, { max:1 })).toBe('Low Possession Play');
  });
});

describe('clubPhilosophyTraitValue', () => {
  it('reads a stored trait', () => {
    const philosophy = { version:1, traits:{ youthPathway:77 } };
    expect(clubPhilosophyTraitValue(philosophy, 'youthPathway')).toBe(77);
  });

  it('defaults a missing philosophy/trait to neutral 50', () => {
    expect(clubPhilosophyTraitValue(null, 'youthPathway')).toBe(50);
    expect(clubPhilosophyTraitValue({ version:1, traits:{} }, 'youthPathway')).toBe(50);
  });
});

describe('clubPhilosophiesNeedBackfill', () => {
  it('is true for a missing save or a stale version', () => {
    expect(clubPhilosophiesNeedBackfill(null)).toBe(true);
    expect(clubPhilosophiesNeedBackfill({})).toBe(true);
    expect(clubPhilosophiesNeedBackfill({ clubPhilosophyVersion:0 })).toBe(true);
  });

  it('is false once the save is current', () => {
    expect(clubPhilosophiesNeedBackfill({ clubPhilosophyVersion:CLUB_PHILOSOPHY_VERSION })).toBe(false);
  });
});

describe('buildClubPhilosophyBackfill', () => {
  it('patches only teams missing a current philosophy', () => {
    const already = { id:'club_a', league:'Premier League', reputation:70, philosophy:generateClubPhilosophy({ id:'club_a', league:'Premier League', reputation:70 }, 'Premier League') };
    const missing = { id:'club_b', league:'Championship', reputation:55 };
    const migration = buildClubPhilosophyBackfill({}, [already, missing]);
    expect(migration.teamPatches.map(t => t.id)).toEqual(['club_b']);
    expect(migration.teamPatches[0].philosophy.version).toBe(CLUB_PHILOSOPHY_VERSION);
    expect(migration.save.clubPhilosophyVersion).toBe(CLUB_PHILOSOPHY_VERSION);
  });

  it('is idempotent — a second call against the already-migrated save patches nothing', () => {
    const missing = { id:'club_b', league:'Championship', reputation:55 };
    const first = buildClubPhilosophyBackfill({}, [missing]);
    const migratedTeam = first.teamPatches[0];
    const second = buildClubPhilosophyBackfill(first.save, [migratedTeam]);
    expect(second.teamPatches).toEqual([]);
  });

  it('returns no patches for a null save', () => {
    expect(buildClubPhilosophyBackfill(null, [smallClub])).toEqual({ save:null, teamPatches:[] });
  });
});
