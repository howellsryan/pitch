import { describe, expect, it } from 'vitest';
import {
  CLUB_PHILOSOPHY_VERSION,
  PHILOSOPHY_TRAITS,
  buildClubPhilosophyBackfill,
  clubPhilosophiesNeedBackfill,
  clubPhilosophyTraitValue,
  defaultClubPhilosophy,
  describeClubPhilosophy,
  evolveClubPhilosophy,
  generateClubPhilosophy,
  normalizeClubPhilosophy,
} from './clubPhilosophy.js';
import { OBJECTIVE_STATUS } from './boardContract.js';

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

describe('evolveClubPhilosophy', () => {
  const philosophy = { version:CLUB_PHILOSOPHY_VERSION, traits:{ ...defaultClubPhilosophy().traits, financialCaution:50, youthPathway:50, starRecruitment:50 } };

  it('nudges a trait up by exactly the per-season amount when its objective is ok', () => {
    const result = { objectives:[{ kind:'financial', status:'ok' }] };
    const evolved = evolveClubPhilosophy(philosophy, result);
    expect(evolved.traits.financialCaution).toBe(52);
  });

  it('nudges a trait down when its objective is in review', () => {
    const result = { objectives:[{ kind:'youth', status:'review' }] };
    const evolved = evolveClubPhilosophy(philosophy, result);
    expect(evolved.traits.youthPathway).toBe(48);
  });

  it('does not move a trait for a warning status (only ok/review are decisive)', () => {
    const result = { objectives:[{ kind:'financial', status:'warning' }] };
    const evolved = evolveClubPhilosophy(philosophy, result);
    expect(evolved.traits.financialCaution).toBe(50);
  });

  it('only nudges starRecruitment up on a met sporting objective, never down', () => {
    const met = evolveClubPhilosophy(philosophy, { objectives:[{ kind:'sporting', status:'ok' }] });
    expect(met.traits.starRecruitment).toBe(52);
    const missed = evolveClubPhilosophy(philosophy, { objectives:[{ kind:'sporting', status:'review' }] });
    expect(missed.traits.starRecruitment).toBe(50);
  });

  it('never moves a trait by more than the fixed per-season amount, even starting near the [0,100] edge', () => {
    const nearCeiling = { ...philosophy, traits:{ ...philosophy.traits, financialCaution:99 } };
    const evolved = evolveClubPhilosophy(nearCeiling, { objectives:[{ kind:'financial', status:'ok' }] });
    expect(evolved.traits.financialCaution).toBe(100);

    const nearFloor = { ...philosophy, traits:{ ...philosophy.traits, youthPathway:1 } };
    const low = evolveClubPhilosophy(nearFloor, { objectives:[{ kind:'youth', status:'review' }] });
    expect(low.traits.youthPathway).toBe(0);
  });

  it('never exceeds [0, 100] even after many consecutive seasons of the same outcome', () => {
    let evolved = philosophy;
    for (let i = 0; i < 30; i++) evolved = evolveClubPhilosophy(evolved, { objectives:[{ kind:'financial', status:'ok' }] });
    expect(evolved.traits.financialCaution).toBe(100);
  });

  it('is a no-op for a missing philosophy or malformed board-contract result', () => {
    expect(evolveClubPhilosophy(null, { objectives:[] })).toBeNull();
    expect(evolveClubPhilosophy(philosophy, null)).toBe(philosophy);
    expect(evolveClubPhilosophy(philosophy, {})).toBe(philosophy);
  });

  it('returns the exact same reference when nothing actually moves — a caller can use !== to decide whether to persist', () => {
    expect(evolveClubPhilosophy(philosophy, { objectives:[{ kind:'financial', status:'warning' }] })).toBe(philosophy);
    expect(evolveClubPhilosophy(philosophy, { objectives:[{ kind:'sporting', status:'review' }] })).toBe(philosophy);
    expect(evolveClubPhilosophy(philosophy, { objectives:[] })).toBe(philosophy);

    const atCeiling = { ...philosophy, traits:{ ...philosophy.traits, financialCaution:100 } };
    expect(evolveClubPhilosophy(atCeiling, { objectives:[{ kind:'financial', status:'ok' }] })).toBe(atCeiling);
  });

  it('reads the same status strings boardContract.js actually produces — a rename there must fail this test, not silently desync', () => {
    expect(OBJECTIVE_STATUS.OK).toBe('ok');
    expect(OBJECTIVE_STATUS.REVIEW).toBe('review');
  });
});
