import { describe, expect, it } from 'vitest';
import { automaticPlanRecommendation } from './training.js';
import { automaticPlanRecommendationDetail } from './trainingTacticalRecommendation.js';

const possessionProfile = {
  id:'controller', formation:'4-3-3', mentality:'possession', version:2,
  instructions:{
    buildUp:'patient', tempo:'balanced', useOfSpace:'to_feet', ballCarrying:'balanced',
    shotSelection:'work_into_box', deliveryTiming:'balanced', attackingWidth:'wide',
    onWin:'hold_shape', defensiveTransition:'balanced', defensiveLine:'mid',
    lineOfEngagement:'mid', pressing:'standard', defensiveWidth:'balanced',
    defensiveApproach:'balanced', setPieces:'balanced',
  },
};

const pressProfile = {
  id:'vertical_press', formation:'4-2-3-1', mentality:'attacking', version:2,
  instructions:{
    buildUp:'direct', tempo:'fast', useOfSpace:'pass_into_space', ballCarrying:'run_at_defence',
    shotSelection:'balanced', deliveryTiming:'balanced', attackingWidth:'balanced',
    onWin:'counter', defensiveTransition:'counter_press', defensiveLine:'high',
    lineOfEngagement:'high', pressing:'aggressive', defensiveWidth:'balanced',
    defensiveApproach:'front_foot', setPieces:'attack',
  },
};

function player(position = 'CM', overrides = {}) {
  return {
    id:'p1', name:'Player', teamId:'user', position, age:23,
    attack:78, midfield:82, defence:76, goalkeeping:8,
    fitness:100, form:50, individualMorale:50, sharpness:70,
    injured:false, traits:[],
    attributeProfile:{ version:1, pace:80, shooting:76, passing:84, dribbling:82, defending:78, physical:80 },
    ...overrides,
  };
}

describe('T5.4 action-aware training recommendations', () => {
  it('preserves recovery, sharpness and position-conversion priorities ahead of tactics', () => {
    expect(automaticPlanRecommendationDetail(player('CM', { injured:true }), { tacticalProfile:possessionProfile, roleId:'advanced_playmaker' }).id).toBe('recovery');
    expect(automaticPlanRecommendationDetail(player('CM', { sharpness:20 }), { tacticalProfile:pressProfile, roleId:'ball_winner' }).id).toBe('sharpness');
    expect(automaticPlanRecommendationDetail(player('CM', { positionConversion:{ targetPosition:'CDM' } }), { tacticalProfile:pressProfile, roleId:'ball_winner' }).id).toBe('position_conversion');
  });

  it('keeps the pre-T5.4 positional recommendation when no tactical context is supplied', () => {
    expect(automaticPlanRecommendation(player('ST'))).toBe('finishing');
    expect(automaticPlanRecommendation(player('CB'))).toBe('defending');
    expect(automaticPlanRecommendation(player('CM'))).toBe('creation');
    expect(automaticPlanRecommendation(player('GK', { goalkeeping:82 }))).toBe('role');
    expect(automaticPlanRecommendationDetail(player('CM')).id).toBe('creation');
  });

  it('can recommend different development families for the same midfielder under different assigned roles', () => {
    const subject = player('CM');
    const creator = automaticPlanRecommendationDetail(subject, { tacticalProfile:possessionProfile, roleId:'advanced_playmaker' });
    const ballWinner = automaticPlanRecommendationDetail(subject, { tacticalProfile:pressProfile, roleId:'ball_winner' });

    expect(creator.id).toBe('creation');
    expect(ballWinner.id).toBe('defending');
    expect(creator.roleId).toBe('advanced_playmaker');
    expect(ballWinner.roleId).toBe('ball_winner');
    expect(creator.reason).not.toBe(ballWinner.reason);
  });

  it('uses a finishing-heavy striker role to recommend finishing work', () => {
    const subject = player('ST', { attack:86, midfield:68, defence:40 });
    const recommendation = automaticPlanRecommendationDetail(subject, { tacticalProfile:pressProfile, roleId:'poacher' });

    expect(recommendation.id).toBe('finishing');
    expect(recommendation.source).toBe('tactical');
  });

  it('is deterministic, advisory and non-mutating', () => {
    const subject = player('CM');
    const before = structuredClone(subject);
    const context = { tacticalProfile:possessionProfile, roleId:'deep_playmaker' };

    expect(automaticPlanRecommendationDetail(subject, context)).toEqual(automaticPlanRecommendationDetail(subject, context));
    expect(subject).toEqual(before);
    expect(subject).not.toHaveProperty('developmentPlan');
  });
});
