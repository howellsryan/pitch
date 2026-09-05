import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TEAM_INSTRUCTIONS,
  TACTICS_PLAN_VERSION,
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

describe('T4 tactical schema v2', () => {
  it('normalizes invalid values and migrates legacy v1 choices into independent v2 dimensions', () => {
    const normalized = normalizeTeamInstructions({
      pressing:'wild',
      buildUp:'direct',
      width:'wide',
      transition:'counter',
      chanceCreation:'work_ball',
    });

    expect(normalized).toMatchObject({
      ...DEFAULT_TEAM_INSTRUCTIONS,
      buildUp:'direct',
      pressing:'standard',
      attackingWidth:'wide',
      defensiveWidth:'wide',
      onWin:'counter',
      shotSelection:'work_into_box',
      deliveryTiming:'balanced',
      width:'wide',
      transition:'counter',
      chanceCreation:'work_ball',
    });

    expect(createUserTacticalPlan({ pressing:'aggressive' })).toMatchObject({
      version:TACTICS_PLAN_VERSION,
      source:'user',
      instructions:{ pressing:'aggressive' },
    });
  });

  it('preserves explicit v2 choices instead of allowing legacy aliases to overwrite them', () => {
    const normalized = normalizeTeamInstructions({
      width:'wide',
      attackingWidth:'narrow',
      defensiveWidth:'wide',
      transition:'counter',
      onWin:'hold_shape',
      chanceCreation:'work_ball',
      shotSelection:'shoot_on_sight',
      deliveryTiming:'early',
    });

    expect(normalized.attackingWidth).toBe('narrow');
    expect(normalized.defensiveWidth).toBe('wide');
    expect(normalized.onWin).toBe('hold_shape');
    expect(normalized.shotSelection).toBe('shoot_on_sight');
    expect(normalized.deliveryTiming).toBe('early');
    expect(normalized.width).toBe('narrow');
    expect(normalized.transition).toBe('hold_shape');
    expect(normalized.chanceCreation).toBe('early_delivery');
  });

  it('makes tactical advantages carry explicit counters and costs', () => {
    const balanced = getTacticalModifiers({}, {});
    const directCounter = getTacticalModifiers(
      { buildUp:'direct', onWin:'counter', tempo:'fast', useOfSpace:'pass_into_space' },
      { defensiveLine:'high', pressing:'aggressive' },
    );
    expect(directCounter.goalProbMult).toBeGreaterThan(balanced.goalProbMult);
    expect(directCounter.midShareBoost).toBeLessThan(balanced.midShareBoost);
    expect(directCounter.fitnessDrainMult).toBeGreaterThan(balanced.fitnessDrainMult);

    const aggressive = getTacticalModifiers({ pressing:'aggressive', defensiveTransition:'counter_press' }, { buildUp:'patient' });
    const passive = getTacticalModifiers({ pressing:'passive', defensiveTransition:'regroup' }, { buildUp:'patient' });
    expect(aggressive.midShareBoost).toBeGreaterThan(passive.midShareBoost);
    expect(aggressive.fitnessDrainMult).toBeGreaterThan(passive.fitnessDrainMult);
    expect(aggressive.yellowRiskMult).toBeGreaterThan(passive.yellowRiskMult);

    const highLineVsCounter = getTacticalModifiers(
      { defensiveLine:'high' },
      { onWin:'counter', buildUp:'direct' },
    );
    const highLineVsPatient = getTacticalModifiers(
      { defensiveLine:'high' },
      { onWin:'hold_shape', buildUp:'patient' },
    );
    expect(highLineVsCounter.defResistMult).toBeLessThan(highLineVsPatient.defResistMult);

    const narrowVsWide = getTacticalModifiers(
      { defensiveWidth:'narrow' },
      { attackingWidth:'wide', deliveryTiming:'early' },
    );
    const narrowVsNarrow = getTacticalModifiers(
      { defensiveWidth:'narrow' },
      { attackingWidth:'narrow', shotSelection:'work_into_box' },
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

describe('T4 AI manager profiles and opposition insight', () => {
  it('is deterministic per club but varied across the football world', () => {
    const opponent = { id:'opp', reputation:80 };
    const profile = getAITacticalProfile({ id:'club_a', league:'Premier League', reputation:78 }, opponent, false);
    expect(getAITacticalProfile({ id:'club_a', league:'Premier League', reputation:78 }, opponent, false)).toEqual(profile);
    expect(profile.version).toBe(TACTICS_PLAN_VERSION);

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

describe('T4 Manager DNA', () => {
  it('extends old histories with v2 dimensions and deduplicates the same committed match', () => {
    const sample = {
      fingerprint:'s1-gw1-fixture-a',
      formation:'4-3-3', mentality:'attacking',
      instructions:{
        buildUp:'direct', pressing:'aggressive', defensiveLine:'high', defensiveApproach:'front_foot',
        useOfSpace:'pass_into_space', ballCarrying:'run_at_defence', shotSelection:'shoot_on_sight',
        defensiveTransition:'counter_press', lineOfEngagement:'high', attackingWidth:'wide', defensiveWidth:'narrow',
      },
      outcome:'win', possession:47, youthStarts:2,
    };
    const once = updateManagerDNA(createManagerDNA(), sample);
    const twice = updateManagerDNA(once, sample);
    expect(once.version).toBe(2);
    expect(once.matches).toBe(1);
    expect(twice).toEqual(once);
    expect(once.wins).toBe(1);
    expect(once.youthStarts).toBe(2);
    expect(once.spaceTotal).toBeGreaterThan(0);
    expect(once.carryingTotal).toBeGreaterThan(0);
    expect(once.engagementTotal).toBeGreaterThan(0);

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