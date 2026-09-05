import { describe, expect, it } from 'vitest';
import { buildLiveMatchState } from '../modules/matchEngine.js';
import { createUserTacticalPlan } from '../modules/tactics.js';
import { applyFormationChange, applyMentalityChange, applyTeamInstructionChange } from './formationChange.js';

function squad(tid) {
  const gks = [
    { id: tid+'_gk1', name: 'GK Star',   position: 'GK', teamId: tid, attack:10, midfield:15, defence:20, goalkeeping:88, fitness:90, inSquad:true, injured:false, suspended:false },
    { id: tid+'_gk2', name: 'GK Backup', position: 'GK', teamId: tid, attack:10, midfield:15, defence:20, goalkeeping:72, fitness:90, inSquad:true, injured:false, suspended:false },
  ];
  const outfield = ['CB','CB','RB','LB','CM','CM','CDM','RW','LW','ST','CB','CM','ST'].map((pos, i) => ({
    id: tid+'_'+i, name: pos+i, position: pos, teamId: tid,
    attack:65, midfield:65, defence:65, goalkeeping:20, fitness:90,
    inSquad:true, injured:false, suspended:false,
  }));
  return [...gks, ...outfield];
}

function makeLiveState() {
  const home = {
    id:'h', name:'Home', crest:'H', reputation:80,
    tacticalPlan:createUserTacticalPlan(),
  };
  const away = {
    id:'a', name:'Away', crest:'A', reputation:75,
    tacticalPlan:createUserTacticalPlan(),
  };
  return buildLiveMatchState(
    home, away, squad('h'), squad('a'),
    '4-3-3', '4-3-3', null, null, 'balanced', 'balanced',
  );
}

describe('applyFormationChange', () => {
  it('updates the formation and keeps 11 players active', () => {
    const ls = makeLiveState();
    const after = applyFormationChange(ls, true, '4-4-2');
    expect(after.homeFormation).toBe('4-4-2');
    expect(after.hActive).toHaveLength(11);
    expect(typeof after.hStr.attack).toBe('number');
    expect(after.hMidShare).toBeGreaterThanOrEqual(0);
    expect(after.hMidShare).toBeLessThanOrEqual(1);
  });

  it('leaves the opponent formation untouched', () => {
    const ls = makeLiveState();
    const after = applyFormationChange(ls, true, '4-4-2');
    expect(after.awayFormation).toBe(ls.awayFormation);
  });

  it('keeps the backup GK on the bench after a formation change', () => {
    const ls = makeLiveState();
    const after = applyFormationChange(ls, true, '4-4-2');
    expect(after.hBenchLeft.some(p => p.position === 'GK')).toBe(true);
    expect(after.hActive.filter(p => p.position === 'GK')).toHaveLength(1);
  });

  it('can change formation back and forth', () => {
    const ls = makeLiveState();
    const changed = applyFormationChange(ls, true, '4-4-2');
    const back = applyFormationChange(changed, true, '4-3-3');
    expect(back.homeFormation).toBe('4-3-3');
    expect(back.hActive).toHaveLength(11);
  });

  it('never treats a formation change as a free substitution', () => {
    const ls = makeLiveState();
    const activeIds = ls.hActive.map(player => player.id).sort();
    const benchIds = ls.hBenchLeft.map(player => player.id).sort();
    const after = applyFormationChange(ls, true, '3-5-2');
    expect(after.hActive.map(player => player.id).sort()).toEqual(activeIds);
    expect(after.hBenchLeft.map(player => player.id).sort()).toEqual(benchIds);
    expect(after.hSubsLeft).toBe(3);
  });
});

describe('applyMentalityChange', () => {
  it('updates the user side modifiers and possession weighting immediately', () => {
    const ls = makeLiveState();
    const after = applyMentalityChange(ls, true, 'attacking');

    expect(after.homeMentality).toBe('attacking');
    expect(after.awayMentality).toBe(ls.awayMentality);
    expect(after.hMods.goalProbMult).toBeGreaterThan(ls.hMods.goalProbMult);
    expect(after.hMidShare).toBeGreaterThan(ls.hMidShare);
  });

  it('changes the away side without altering the home mentality', () => {
    const ls = makeLiveState();
    const after = applyMentalityChange(ls, false, 'defensive');

    expect(after.homeMentality).toBe(ls.homeMentality);
    expect(after.awayMentality).toBe('defensive');
    expect(after.aMods.defResistMult).toBeGreaterThan(ls.aMods.defResistMult);
  });
});

describe('applyTeamInstructionChange', () => {
  it('changes only the controlled side and preserves the shared normalized v2 shape', () => {
    const ls = makeLiveState();
    const awayBefore = { ...ls.awayTactics };
    const after = applyTeamInstructionChange(ls, true, 'useOfSpace', 'pass_into_space');

    expect(after.homeTactics.useOfSpace).toBe('pass_into_space');
    expect(after.awayTactics).toEqual(awayBefore);
    expect(after.homeTactics.attackingWidth).toBe('balanced');
    expect(after.homeTactics.defensiveWidth).toBe('balanced');
    expect(after.homeTactics.transition).toBe(after.homeTactics.onWin);
  });

  it('supports asymmetric attacking and defensive widths in live state', () => {
    const ls = makeLiveState();
    const wideAttack = applyTeamInstructionChange(ls, true, 'attackingWidth', 'wide');
    const compactBlock = applyTeamInstructionChange(wideAttack, true, 'defensiveWidth', 'narrow');

    expect(compactBlock.homeTactics.attackingWidth).toBe('wide');
    expect(compactBlock.homeTactics.defensiveWidth).toBe('narrow');
    expect(compactBlock.awayTactics.attackingWidth).toBe('balanced');
    expect(compactBlock.awayTactics.defensiveWidth).toBe('balanced');
  });

  it('refreshes authoritative tactical modifiers immediately', () => {
    const ls = makeLiveState();
    const after = applyTeamInstructionChange(ls, true, 'pressing', 'aggressive');

    expect(after.homeTactics.pressing).toBe('aggressive');
    expect(after.hMods.fitnessDrainMult).toBeGreaterThan(ls.hMods.fitnessDrainMult);
    expect(after.hMods.yellowRiskMult).toBeGreaterThan(ls.hMods.yellowRiskMult);
    expect(after.aMods).toEqual(ls.aMods);
  });

  it('normalizes invalid values instead of allowing them into authoritative state', () => {
    const ls = makeLiveState();
    const after = applyTeamInstructionChange(ls, false, 'shotSelection', 'always-score');

    expect(after.awayTactics.shotSelection).toBe('balanced');
    expect(after.homeTactics).toEqual(ls.homeTactics);
  });
});
