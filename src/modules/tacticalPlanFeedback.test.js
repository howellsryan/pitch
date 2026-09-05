import { describe, expect, it } from 'vitest';
import { buildTacticalPlanFeedback } from './tacticalPlanFeedback.js';

const POSITIONS = ['GK','CB','CB','RB','LB','CDM','CM','CAM','RW','LW','ST'];

function lineup(prefix, rating = 78, overrides = {}) {
  return POSITIONS.map((position, index) => {
    const profile = {
      version:1,
      pace:rating,
      shooting:rating,
      passing:rating,
      dribbling:rating,
      defending:rating,
      physical:rating,
      ...(overrides[position] ?? {}),
    };
    return {
      id:`${prefix}_${index}`,
      name:`${prefix}_${position}_${index}`,
      position,
      matchPosition:position,
      attack:rating,
      midfield:rating,
      defence:rating,
      goalkeeping:position === 'GK' ? rating : 8,
      fitness:95,
      form:50,
      individualMorale:50,
      sharpness:50,
      traits:[],
      positionSuitability:{ [position]:1 },
      attributeProfile:profile,
    };
  });
}

describe('T4 squad-specific tactical plan feedback', () => {
  it('rates the same aggressive plan higher for an elite-suited XI than a weak XI', () => {
    const instructions = {
      buildUp:'direct', tempo:'fast', useOfSpace:'pass_into_space', ballCarrying:'run_at_defence',
      shotSelection:'shoot_on_sight', attackingWidth:'wide', onWin:'counter',
      defensiveTransition:'counter_press', defensiveLine:'high', lineOfEngagement:'high', pressing:'aggressive',
      defensiveWidth:'balanced', defensiveApproach:'front_foot', setPieces:'attack',
    };

    const elite = buildTacticalPlanFeedback({ players:lineup('elite', 90), instructions });
    const weak = buildTacticalPlanFeedback({ players:lineup('weak', 56), instructions });

    expect(elite.fitScore).toBeGreaterThan(weak.fitScore);
    expect(elite.strengths.length).toBeGreaterThan(0);
    expect(weak.risks.length).toBeGreaterThan(0);
    expect(elite.grade).not.toBe('Needs adaptation');
  });

  it('explains a high-line recovery risk from the XI rather than applying a generic warning', () => {
    const fastDefence = buildTacticalPlanFeedback({
      players:lineup('fast', 80, {
        CB:{ pace:92, defending:88, physical:86 },
        RB:{ pace:91, defending:84, physical:82 },
        LB:{ pace:91, defending:84, physical:82 },
      }),
      instructions:{ defensiveLine:'high' },
    });
    const slowDefence = buildTacticalPlanFeedback({
      players:lineup('slow', 75, {
        CB:{ pace:48, defending:64, physical:70 },
        RB:{ pace:52, defending:62, physical:68 },
        LB:{ pace:52, defending:62, physical:68 },
      }),
      instructions:{ defensiveLine:'high' },
    });

    expect(fastDefence.strengths.some(text => text.includes('high line'))).toBe(true);
    expect(slowDefence.risks.some(text => text.includes('high line'))).toBe(true);
  });

  it('recognizes elite shooting as a better basis for Shoot on Sight', () => {
    const clinical = buildTacticalPlanFeedback({
      players:lineup('clinical', 76, {
        ST:{ shooting:95, pace:78, passing:74, dribbling:77, physical:80 },
        RW:{ shooting:91, pace:83, passing:78, dribbling:82, physical:75 },
        LW:{ shooting:91, pace:83, passing:78, dribbling:82, physical:75 },
        CAM:{ shooting:90, passing:84, dribbling:84, pace:78, physical:74 },
      }),
      instructions:{ shotSelection:'shoot_on_sight' },
    });
    const poor = buildTacticalPlanFeedback({
      players:lineup('poor', 70, {
        ST:{ shooting:48 }, RW:{ shooting:48 }, LW:{ shooting:48 }, CAM:{ shooting:48 },
      }),
      instructions:{ shotSelection:'shoot_on_sight' },
    });

    expect(clinical.strengths.some(text => text.includes('Shooting quality'))).toBe(true);
    expect(poor.risks.some(text => text.includes('Shoot on Sight'))).toBe(true);
  });

  it('surfaces structural conflicts explicitly', () => {
    const feedback = buildTacticalPlanFeedback({
      players:lineup('balanced', 78),
      instructions:{
        defensiveLine:'high', lineOfEngagement:'low', pressing:'aggressive',
        defensiveTransition:'regroup', shotSelection:'work_into_box', deliveryTiming:'early',
      },
    });

    expect(feedback.conflicts).toEqual(expect.arrayContaining([
      expect.stringContaining('High defensive line + low engagement'),
      expect.stringContaining('Aggressive pressing conflicts with Regroup'),
      expect.stringContaining('Work Into Box and Early Delivery'),
    ]));
  });
});
