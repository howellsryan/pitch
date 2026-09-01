import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TEAM_INSTRUCTIONS,
  buildOppositionInsight,
  createManagerDNA,
  createUserTacticalPlan,
  getAITacticalProfile,
  getCompatibleRoles,
  getTacticalModifiers,
  normalizeTeamInstructions,
  roleSuitability,
  summarizeManagerDNA,
  updateManagerDNA,
} from './tactics.js';

describe('P2 tactical schema', () => {
  it('normalizes invalid or missing instruction values to safe defaults', () => {
    expect(normalizeTeamInstructions({ pressing:'wild', buildUp:'direct', width:'wide' })).toEqual({
      ...DEFAULT_TEAM_INSTRUCTIONS,
      buildUp:'direct',
      width:'wide',
    });
    expect(createUserTacticalPlan({ pressing:'aggressive' })).toMatchObject({
      version:1,
      source:'user',
      instructions:{ pressing:'aggressive' },
    });
  });

  it('makes tactical advantages carry explicit counters and costs', () => {
    const balanced = getTacticalModifiers({}, {});
    const directCounter = getTacticalModifiers(
      { buildUp:'direct', transition:'counter', tempo:'fast' },
      { defensiveLine:'high', pressing:'aggressive' },
    );
    expect(directCounter.goalProbMult).toBeGreaterThan(balanced.goalProbMult);
    expect(directCounter.midShareBoost).toBeLessThan(balanced.midShareBoost);
    expect(directCounter.fitnessDrainMult).toBeGreaterThan(balanced.fitnessDrainMult);

    const aggressive = getTacticalModifiers({ pressing:'aggressive' }, { buildUp:'patient' });
    const passive = getTacticalModifiers({ pressing:'passive' }, { buildUp:'patient' });
    expect(aggressive.midShareBoost).toBeGreaterThan(passive.midShareBoost);
    expect(aggressive.fitnessDrainMult).toBeGreaterThan(passive.fitnessDrainMult);
    expect(aggressive.yellowRiskMult).toBeGreaterThan(passive.yellowRiskMult);

    const highLineVsCounter = getTacticalModifiers(
      { defensiveLine:'high' },
      { transition:'counter', buildUp:'direct' },
    );
    const highLineVsPatient = getTacticalModifiers(
      { defensiveLine:'high' },
      { transition:'hold_shape', buildUp:'patient' },
    );
    expect(highLineVsCounter.defResistMult).toBeLessThan(highLineVsPatient.defResistMult);

    const narrowVsWide = getTacticalModifiers(
      { width:'narrow' },
      { width:'wide', chanceCreation:'early_delivery' },
    );
    const narrowVsNarrow = getTacticalModifiers(
      { width:'narrow' },
      { width:'narrow', chanceCreation:'work_ball' },
    );
    expect(narrowVsWide.defResistMult).toBeLessThan(narrowVsNarrow.defResistMult);
  });
});

describe('P2 player roles', () => {
  const striker = { id:'st', position:'ST', attack:90, midfield:68, defence:25, goalkeeping:5 };

  it('only offers position-compatible roles and penalizes invalid assignments', () => {
    const roleIds = getCompatibleRoles(striker).map(role => role.id);
    expect(roleIds).toContain('poacher');
    expect(roleIds).toContain('false_nine');
    expect(roleIds).not.toContain('ball_playing_cb');
    expect(roleSuitability(striker, 'poacher')).toBeGreaterThan(roleSuitability(striker, 'ball_playing_cb'));
    expect(roleSuitability(striker, 'ball_playing_cb')).toBe(0.72);
  });
});

describe('P2 AI manager profiles and opposition insight', () => {
  it('is deterministic per club but varied across the football world', () => {
    const opponent = { id:'opp', reputation:80 };
    const profile = getAITacticalProfile({ id:'club_a', league:'Premier League', reputation:78 }, opponent, false);
    expect(getAITacticalProfile({ id:'club_a', league:'Premier League', reputation:78 }, opponent, false)).toEqual(profile);

    const ids = new Set(Array.from({ length:16 }, (_, index) =>
      getAITacticalProfile({ id:`club_${index}`, league:'Premier League', reputation:75 + index % 4 }, opponent, true).id
    ));
    expect(ids.size).toBeGreaterThanOrEqual(3);
  });

  it('turns a real profile/form/key-player input into inspectable pre-match insight', () => {
    const team = { id:'pressers', name:'Pressers', reputation:82 };
    const profile = getAITacticalProfile(team, { id:'user', reputation:80 }, false);
    const insight = buildOppositionInsight({
      team,
      profile,
      form:[{ result:'W' },{ result:'D' },{ result:'L' }],
      keyPlayer:{ name:'A. Player', position:'CAM' },
    });
    expect(insight.shape).toBe(profile.formation);
    expect(insight.style).toBe(profile.label);
    expect(insight.formText).toBe('WDL');
    expect(insight.threat.length).toBeGreaterThan(20);
    expect(insight.weakness.length).toBeGreaterThan(20);
    expect(insight.keyPlayer).toContain('A. Player');
  });
});

describe('P2 Manager DNA', () => {
  it('aggregates real choices/results and deduplicates the same committed match', () => {
    const sample = {
      fingerprint:'s1-gw1-fixture-a',
      formation:'4-3-3', mentality:'attacking',
      instructions:{ buildUp:'direct', pressing:'aggressive', defensiveLine:'high', defensiveApproach:'front_foot' },
      outcome:'win', possession:47, youthStarts:2,
    };
    const once = updateManagerDNA(createManagerDNA(), sample);
    const twice = updateManagerDNA(once, sample);
    expect(once.matches).toBe(1);
    expect(twice).toEqual(once);
    expect(once.wins).toBe(1);
    expect(once.youthStarts).toBe(2);

    const next = updateManagerDNA(once, {
      fingerprint:'s1-gw2-fixture-b', formation:'4-2-3-1', mentality:'possession',
      instructions:{ buildUp:'patient', pressing:'standard', defensiveLine:'mid', defensiveApproach:'balanced' },
      outcome:'draw', possession:61,
    });
    const summary = summarizeManagerDNA(next);
    expect(summary.matches).toBe(2);
    expect(summary.winRate).toBe(50);
    expect(summary.averagePossession).toBe(54);
    expect(summary.preferredFormation).toBeTruthy();
  });
});
