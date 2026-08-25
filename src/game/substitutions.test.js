import { describe, expect, it } from 'vitest';
import { buildLiveMatchState } from '../modules/matchEngine.js';
import { applySubstitution, eligibleSubOutTargets, validateSubstitution } from './substitutions.js';

// Same player-shape used by src/validate.js's old "SUB FLOW" / "GK on Bench"
// regression checks (Phase 5, docs/plan/04-migration-phases.md) — kept
// identical so these tests cover exactly what those checks used to.
function squad(tid, { twoGKs = false } = {}) {
  const gks = twoGKs
    ? [
        { id: tid+'_gk1', name: 'GK Star',   position: 'GK', teamId: tid, attack:10, midfield:15, defence:20, goalkeeping:88, fitness:90, inSquad:true, injured:false, suspended:false },
        { id: tid+'_gk2', name: 'GK Backup', position: 'GK', teamId: tid, attack:10, midfield:15, defence:20, goalkeeping:72, fitness:90, inSquad:true, injured:false, suspended:false },
      ]
    : [
        { id: tid+'_gk', name: 'GK', position: 'GK', teamId: tid, attack:30, midfield:40, defence:55, goalkeeping:78, fitness:90, inSquad:true, injured:false, suspended:false },
      ];
  const outfield = ['CB','CB','RB','LB','CM','CM','CDM','RW','LW','ST'].map((pos, i) => ({
    id: tid+'_'+i, name: pos+i, position: pos, teamId: tid,
    attack: 65, midfield: 65, defence: 65, goalkeeping: 20, fitness: 90,
    inSquad: true, injured: false, suspended: false,
  }));
  const bench = [
    { id: tid+'_sub1', name: 'Sub1', position: 'CM', teamId: tid, attack:58, midfield:72, defence:50, goalkeeping:20, fitness:100, inSquad:true, injured:false, suspended:false },
    { id: tid+'_sub2', name: 'Sub2', position: 'ST', teamId: tid, attack:82, midfield:58, defence:28, goalkeeping:20, fitness:100, inSquad:true, injured:false, suspended:false },
    { id: tid+'_sub3', name: 'Sub3', position: 'CB', teamId: tid, attack:38, midfield:42, defence:69, goalkeeping:20, fitness:100, inSquad:true, injured:false, suspended:false },
  ];
  return [...gks, ...outfield, ...bench];
}

function makeLiveState(twoGKs = false) {
  const home = { id: 'h', name: 'Home', crest: 'H', reputation: 80 };
  const away = { id: 'a', name: 'Away', crest: 'A', reputation: 75 };
  return buildLiveMatchState(home, away, squad('h', { twoGKs }), squad('a', { twoGKs }), '4-3-3', '4-3-3');
}

describe('eligibleSubOutTargets', () => {
  it('offers only GKs when bringing on a GK', () => {
    const ls = makeLiveState(true);
    const benchGK = ls.hBenchLeft.find(p => p.position === 'GK');
    const targets = eligibleSubOutTargets(ls, true, benchGK);
    expect(targets.length).toBeGreaterThan(0);
    expect(targets.every(p => p.position === 'GK')).toBe(true);
  });

  it('offers only outfield players when bringing on an outfield player', () => {
    const ls = makeLiveState();
    const benchOutfield = ls.hBenchLeft.find(p => p.position !== 'GK');
    const targets = eligibleSubOutTargets(ls, true, benchOutfield);
    expect(targets.every(p => p.position !== 'GK')).toBe(true);
  });
});

describe('validateSubstitution', () => {
  it('allows GK to replace GK', () => {
    const ls = makeLiveState(true);
    const benchGK  = ls.hBenchLeft.find(p => p.position === 'GK');
    const activeGK = ls.hActive.find(p => p.position === 'GK');
    const result = validateSubstitution(ls, true, benchGK.id, activeGK.id);
    expect(result.ok).toBe(true);
  });

  it('blocks GK replacing an outfield player', () => {
    const ls = makeLiveState(true);
    const benchGK = ls.hBenchLeft.find(p => p.position === 'GK');
    const activeOutfield = ls.hActive.find(p => p.position !== 'GK');
    const result = validateSubstitution(ls, true, benchGK.id, activeOutfield.id);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('gk-outfield-mismatch');
  });

  it('blocks an outfield player replacing the GK', () => {
    const ls = makeLiveState(true);
    const benchOutfield = ls.hBenchLeft.find(p => p.position !== 'GK');
    const activeGK = ls.hActive.find(p => p.position === 'GK');
    const result = validateSubstitution(ls, true, benchOutfield.id, activeGK.id);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('gk-outfield-mismatch');
  });

  it('blocks bringing on an injured player', () => {
    const ls = makeLiveState();
    const benchPlayer = ls.hBenchLeft[0];
    benchPlayer.injured = true;
    const activeOutfield = ls.hActive.find(p => p.position !== 'GK');
    const result = validateSubstitution(ls, true, benchPlayer.id, activeOutfield.id);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('sub-in-injured');
  });

  it('blocks a 4th substitution once 3 have been used', () => {
    const ls = { ...makeLiveState(), hSubsLeft: 0 };
    const benchPlayer = ls.hBenchLeft[0];
    const activeOutfield = ls.hActive.find(p => p.position !== 'GK');
    const result = validateSubstitution(ls, true, benchPlayer.id, activeOutfield.id);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no-subs-left');
  });
});

describe('applySubstitution', () => {
  it('moves the player on/off, decrements subsLeft, and records the event', () => {
    const ls = makeLiveState();
    const subIn  = ls.hBenchLeft[0];
    const subOut = ls.hActive.find(p => p.position !== 'GK');
    const subsBefore = ls.hSubsLeft;

    const { ok, liveState: after, event } = applySubstitution(ls, true, subIn.id, subOut.id, 60, 'h');

    expect(ok).toBe(true);
    expect(after.hActive).toHaveLength(11);
    expect(after.hActive.some(p => p.id === subIn.id)).toBe(true);
    expect(after.hActive.some(p => p.id === subOut.id)).toBe(false);
    expect(after.hBenchLeft.some(p => p.id === subIn.id)).toBe(false);
    expect(after.hSubsLeft).toBe(subsBefore - 1);
    expect(after.hMidShare).toBeGreaterThanOrEqual(0);
    expect(after.hMidShare).toBeLessThanOrEqual(1);
    expect(event).toMatchObject({ type: 'sub', inId: subIn.id, outId: subOut.id, minute: 60, teamId: 'h' });
  });

  it('allows three substitutions (exhausting the bench) then blocks a fourth', () => {
    let ls = makeLiveState();
    expect(ls.hBenchLeft).toHaveLength(3); // squad() gives exactly 3 outfield subs
    for (let i = 0; i < 3; i++) {
      const subIn  = ls.hBenchLeft[0];
      const subOut = ls.hActive.find(p => p.position !== 'GK');
      const res = applySubstitution(ls, true, subIn.id, subOut.id, 10 + i, 'h');
      expect(res.ok).toBe(true);
      ls = res.liveState;
    }
    expect(ls.hSubsLeft).toBe(0);
    expect(ls.hBenchLeft).toHaveLength(0);

    // A 4th attempt is blocked on subsLeft before it even needs a bench player.
    const anyOnPitch = ls.hActive.find(p => p.position !== 'GK');
    const fourth = applySubstitution(ls, true, 'not-on-bench', anyOnPitch.id, 80, 'h');
    expect(fourth.ok).toBe(false);
    expect(fourth.reason).toBe('no-subs-left');
  });

  it('leaves the away side untouched when subbing the home side', () => {
    const ls = makeLiveState();
    const subIn  = ls.hBenchLeft[0];
    const subOut = ls.hActive.find(p => p.position !== 'GK');
    const { liveState: after } = applySubstitution(ls, true, subIn.id, subOut.id, 60, 'h');
    expect(after.aActive).toBe(ls.aActive);
    expect(after.aSubsLeft).toBe(ls.aSubsLeft);
  });

  it('does not mutate the original liveState object references (except the fitness Map)', () => {
    const ls = makeLiveState();
    const originalActive = ls.hActive;
    const subIn  = ls.hBenchLeft[0];
    const subOut = ls.hActive.find(p => p.position !== 'GK');
    applySubstitution(ls, true, subIn.id, subOut.id, 60, 'h');
    expect(ls.hActive).toBe(originalActive);
  });
});

describe('backup GK stays on the bench (not filtered out)', () => {
  it('buildLiveMatchState keeps a backup GK in hBenchLeft/aBenchLeft', () => {
    const ls = makeLiveState(true);
    expect(ls.hBenchLeft.some(p => p.position === 'GK')).toBe(true);
    expect(ls.aBenchLeft.some(p => p.position === 'GK')).toBe(true);
    expect(ls.hActive.filter(p => p.position === 'GK')).toHaveLength(1);
  });
});
