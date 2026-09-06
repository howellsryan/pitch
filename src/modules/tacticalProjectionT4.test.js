import { describe, expect, it } from 'vitest';
import {
  MATCH_ACTION_RESOLVER_VERSION,
  MATCH_RNG_PACKET_FIELDS,
  MATCH_RNG_PACKET_VERSION,
  tacticalChanceAdjustments,
} from './matchActionResolver.js';
import { tacticalActionUsage, tacticalContextEdge } from './tacticalProjection.js';

describe('T4 independent tactical route controls', () => {
  it('makes Use of Space control runs beyond the ball independently from build-up', () => {
    const toFeet = tacticalActionUsage({ buildUp:'balanced', useOfSpace:'to_feet' });
    const mixed = tacticalActionUsage({ buildUp:'balanced', useOfSpace:'mixed' });
    const intoSpace = tacticalActionUsage({ buildUp:'balanced', useOfSpace:'pass_into_space' });

    expect(intoSpace.pass_into_space).toBeGreaterThan(mixed.pass_into_space);
    expect(mixed.pass_into_space).toBeGreaterThan(toFeet.pass_into_space);
    expect(intoSpace.circulation).toBeLessThan(toFeet.circulation);
  });

  it('makes Ball Carrying control carries without changing the use-of-space instruction', () => {
    const less = tacticalActionUsage({ useOfSpace:'mixed', ballCarrying:'dribble_less' });
    const balanced = tacticalActionUsage({ useOfSpace:'mixed', ballCarrying:'balanced' });
    const runAt = tacticalActionUsage({ useOfSpace:'mixed', ballCarrying:'run_at_defence' });

    expect(runAt.carry).toBeGreaterThan(balanced.carry);
    expect(balanced.carry).toBeGreaterThan(less.carry);
    expect(runAt.pass_into_space).toBe(balanced.pass_into_space);
  });

  it('keeps attacking and defensive width as separate decisions', () => {
    const balanced = tacticalActionUsage({ attackingWidth:'balanced', defensiveWidth:'balanced' });
    const wideAttack = tacticalActionUsage({ attackingWidth:'wide', defensiveWidth:'balanced' });
    const wideDefence = tacticalActionUsage({ attackingWidth:'balanced', defensiveWidth:'wide' });
    const narrowDefence = tacticalActionUsage({ attackingWidth:'balanced', defensiveWidth:'narrow' });

    expect(wideAttack.wide_delivery).toBeGreaterThan(balanced.wide_delivery);
    expect(wideDefence.wide_delivery).toBe(balanced.wide_delivery);
    expect(wideDefence.recovery_defence).toBeGreaterThan(balanced.recovery_defence);
    expect(narrowDefence.interception_tackle).toBeGreaterThan(balanced.interception_tackle);
  });

  it('separates defensive line, engagement height and defensive transition', () => {
    const lowEngagement = tacticalActionUsage({ defensiveLine:'mid', lineOfEngagement:'low', defensiveTransition:'balanced' });
    const highEngagement = tacticalActionUsage({ defensiveLine:'mid', lineOfEngagement:'high', defensiveTransition:'balanced' });
    const highLine = tacticalActionUsage({ defensiveLine:'high', lineOfEngagement:'mid', defensiveTransition:'balanced' });
    const regroup = tacticalActionUsage({ defensiveLine:'mid', lineOfEngagement:'mid', defensiveTransition:'regroup' });
    const counterPress = tacticalActionUsage({ defensiveLine:'mid', lineOfEngagement:'mid', defensiveTransition:'counter_press' });

    expect(highEngagement.high_press).toBeGreaterThan(lowEngagement.high_press);
    expect(highLine.recovery_defence).toBeGreaterThan(lowEngagement.recovery_defence);
    expect(counterPress.high_press).toBeGreaterThan(regroup.high_press);
    expect(regroup.recovery_defence).toBeGreaterThan(tacticalActionUsage({}).recovery_defence);
  });

  it('uses defensive width and transition state as football-shaped opponent counters', () => {
    expect(tacticalContextEdge('wide_delivery', {}, { defensiveWidth:'narrow' }))
      .toBeGreaterThan(tacticalContextEdge('wide_delivery', {}, { defensiveWidth:'wide' }));
    expect(tacticalContextEdge('carry', {}, { defensiveTransition:'counter_press' }))
      .toBeLessThan(tacticalContextEdge('carry', {}, { defensiveTransition:'regroup' }));
    expect(tacticalContextEdge('direct_pass', {}, { lineOfEngagement:'high' }))
      .toBeGreaterThan(tacticalContextEdge('direct_pass', {}, { lineOfEngagement:'low' }));
  });
});

describe('T4 shot-selection authority and RNG compatibility', () => {
  it('trades shot volume against chance quality without changing player finishing ability', () => {
    const work = tacticalChanceAdjustments({ shotSelection:'work_into_box', deliveryTiming:'balanced' });
    const balanced = tacticalChanceAdjustments({ shotSelection:'balanced', deliveryTiming:'balanced' });
    const sight = tacticalChanceAdjustments({ shotSelection:'shoot_on_sight', deliveryTiming:'balanced' });

    expect(work.frequency).toBeLessThan(balanced.frequency);
    expect(balanced.frequency).toBeLessThan(sight.frequency);
    expect(work.xg).toBeGreaterThan(balanced.xg);
    expect(balanced.xg).toBeGreaterThan(sight.xg);
  });

  it('keeps early delivery independent from shot selection', () => {
    const normalService = tacticalChanceAdjustments({ shotSelection:'balanced', deliveryTiming:'balanced' });
    const earlyService = tacticalChanceAdjustments({ shotSelection:'balanced', deliveryTiming:'early' });

    expect(earlyService.frequency).toBeGreaterThan(normalService.frequency);
    expect(earlyService.xg).toBeLessThan(normalService.xg);
  });

  it('versions resolver behaviour without widening the fixed phase RNG packet', () => {
    expect(MATCH_ACTION_RESOLVER_VERSION).toBe(3);
    expect(MATCH_RNG_PACKET_VERSION).toBe(1);
    expect(MATCH_RNG_PACKET_FIELDS).toHaveLength(14);
  });
});