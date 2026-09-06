import { describe, expect, it } from 'vitest';
import {
  deriveAuthoritativeSetPiece,
  resolveDirectFreeKickOutcome,
  resolvePenaltyOutcome,
} from './matchActionResolver.js';

function player(id, position, rating = 78) {
  const isKeeper = position === 'GK';
  return {
    id,
    name:id,
    position,
    matchPosition:position,
    age:25,
    attack:rating,
    midfield:rating,
    defence:rating,
    goalkeeping:isKeeper ? rating : 10,
    fitness:100,
    form:50,
    individualMorale:50,
    sharpness:50,
    traits:[],
    positionSuitability:{ [position]:1 },
    attributeProfile:{
      version:1,
      pace:rating,
      shooting:rating,
      passing:rating,
      dribbling:rating,
      defending:rating,
      physical:rating,
    },
  };
}

function packet(overrides = {}) {
  return {
    version:1,
    possession:.4,
    route:.5,
    actor:.4,
    target:.5,
    defender:.4,
    execution:.8,
    outcome:.08,
    chance:.01,
    shooter:.25,
    shot:.5,
    finish:.5,
    assist:.99,
    discipline:.65,
    injury:.75,
    ...overrides,
  };
}

function defenders(keeperRating = 78, wallRating = 80) {
  return [
    player('keeper', 'GK', keeperRating),
    player('cb-1', 'CB', wallRating),
    player('cb-2', 'CB', wallRating - 1),
    player('dm-1', 'CDM', wallRating - 2),
    player('fb-1', 'LB', wallRating - 4),
    player('fb-2', 'RB', wallRating - 5),
  ];
}

function prepared(kind, { takerRating = 84, keeperRating = 78, wallRating = 80 } = {}) {
  const taker = player('taker', 'CAM', takerRating);
  const phasePacket = packet({ chance:kind === 'penalty' ? .01 : .055, target:.5, shooter:.01 });
  const def = defenders(keeperRating, wallRating);
  const source = {
    version:1,
    phase:50,
    minute:38,
    teamId:'home',
    opponentTeamId:'away',
    attackers:[taker, player('wing', 'LW', 78), player('striker', 'ST', 80)],
    defenders:def,
    packet:phasePacket,
    route:'carry',
    actor:taker,
    target:null,
    defender:def[1],
    execution:72,
    counter:82,
    context:0,
    successChance:.42,
    mentality:'balanced',
    riskMode:'normal',
    outcome:'foul_won',
    xg:null,
    chance:null,
    shooter:null,
    assistId:null,
    pressureDefender:null,
  };
  return { source, setPiece:deriveAuthoritativeSetPiece(source), taker, defenders:def };
}

function automaticGrid(kind, takerRating, keeperRating) {
  const context = prepared(kind, { takerRating, keeperRating });
  let goals = 0;
  let misses = 0;
  let saves = 0;
  let blocks = 0;
  for (let shotIndex = 0; shotIndex < 10; shotIndex += 1) {
    for (let finishIndex = 0; finishIndex < 10; finishIndex += 1) {
      const sample = packet({
        chance:kind === 'penalty' ? .01 : .055,
        shot:(shotIndex + .5) / 10,
        finish:(finishIndex + .5) / 10,
        assist:.99,
      });
      const result = kind === 'penalty'
        ? resolvePenaltyOutcome({ setPiece:context.setPiece, shooter:context.taker, defenders:context.defenders, packet:sample })
        : resolveDirectFreeKickOutcome({ setPiece:context.setPiece, shooter:context.taker, defenders:context.defenders, packet:sample });
      if (result.finish === 'goal') goals += 1;
      if (result.finish === 'missed') misses += 1;
      if (result.finish === 'saved') saves += 1;
      if (result.finish === 'blocked') blocks += 1;
    }
  }
  return { goals, misses, saves, blocks, samples:100 };
}

function interactiveResult(kind, { takerRating = 84, keeperRating = 78, timing = .82, aimY = .72, assist = .99 } = {}) {
  const context = prepared(kind, { takerRating, keeperRating });
  const sample = packet({ chance:kind === 'penalty' ? .01 : .055, shot:.52, finish:.48, assist });
  const intent = { attack:{ aimX:.62, aimY, power:.74, timing } };
  return kind === 'penalty'
    ? resolvePenaltyOutcome({ setPiece:context.setPiece, shooter:context.taker, defenders:context.defenders, packet:sample, intent })
    : resolveDirectFreeKickOutcome({ setPiece:context.setPiece, shooter:context.taker, defenders:context.defenders, packet:sample, intent });
}

describe('Phase 4 automatic set-piece calibration', () => {
  it('keeps penalties substantially more convertible than direct free kicks', () => {
    const penalties = automaticGrid('penalty', 82, 82);
    const freeKicks = automaticGrid('direct_free_kick', 82, 82);

    expect(penalties.goals).toBeGreaterThan(55);
    expect(penalties.goals).toBeLessThan(90);
    expect(freeKicks.goals).toBeGreaterThan(2);
    expect(freeKicks.goals).toBeLessThan(30);
    expect(penalties.goals).toBeGreaterThan(freeKicks.goals * 3);
  });

  it('preserves taker quality and goalkeeper quality ordering for penalties', () => {
    const eliteTaker = automaticGrid('penalty', 94, 76);
    const weakTaker = automaticGrid('penalty', 58, 76);
    const weakKeeper = automaticGrid('penalty', 84, 58);
    const eliteKeeper = automaticGrid('penalty', 84, 94);

    expect(eliteTaker.goals).toBeGreaterThan(weakTaker.goals);
    expect(weakKeeper.goals).toBeGreaterThan(eliteKeeper.goals);
  });

  it('preserves taker quality and goalkeeper quality ordering for direct free kicks', () => {
    const eliteTaker = automaticGrid('direct_free_kick', 94, 76);
    const weakTaker = automaticGrid('direct_free_kick', 58, 76);
    const weakKeeper = automaticGrid('direct_free_kick', 88, 58);
    const eliteKeeper = automaticGrid('direct_free_kick', 88, 94);

    expect(eliteTaker.goals).toBeGreaterThan(weakTaker.goals);
    expect(weakKeeper.goals).toBeGreaterThan(eliteKeeper.goals);
  });
});

describe('Phase 4 interactive set-piece calibration', () => {
  for (const kind of ['penalty', 'direct_free_kick']) {
    it(`${kind} rewards execution while preserving player quality`, () => {
      const poor = interactiveResult(kind, { takerRating:84, timing:.20 });
      const strong = interactiveResult(kind, { takerRating:84, timing:.94 });
      const weakPerfect = interactiveResult(kind, { takerRating:58, timing:.98 });
      const elitePerfect = interactiveResult(kind, { takerRating:94, timing:.98 });

      expect(strong.presentation.target.executionQuality).toBeGreaterThan(poor.presentation.target.executionQuality);
      expect(elitePerfect.presentation.target.executionQuality).toBeGreaterThan(weakPerfect.presentation.target.executionQuality);
    });

    it(`${kind} keeps goalkeeper ability authoritative when the same keeper input is used`, () => {
      const weakContext = prepared(kind, { takerRating:86, keeperRating:58 });
      const eliteContext = prepared(kind, { takerRating:86, keeperRating:94 });
      const sample = packet({ chance:kind === 'penalty' ? .01 : .055, shot:.50, finish:.50, assist:.99 });
      const intent = {
        attack:{ aimX:.70, aimY:.72, power:.74, timing:.90 },
        goalkeeper:{ x:.55, y:.68, timing:.82 },
      };
      const weak = kind === 'penalty'
        ? resolvePenaltyOutcome({ setPiece:weakContext.setPiece, shooter:weakContext.taker, defenders:weakContext.defenders, packet:sample, intent })
        : resolveDirectFreeKickOutcome({ setPiece:weakContext.setPiece, shooter:weakContext.taker, defenders:weakContext.defenders, packet:sample, intent });
      const elite = kind === 'penalty'
        ? resolvePenaltyOutcome({ setPiece:eliteContext.setPiece, shooter:eliteContext.taker, defenders:eliteContext.defenders, packet:sample, intent })
        : resolveDirectFreeKickOutcome({ setPiece:eliteContext.setPiece, shooter:eliteContext.taker, defenders:eliteContext.defenders, packet:sample, intent });

      expect(elite.presentation.keeper.reach).toBeGreaterThan(weak.presentation.keeper.reach);
    });
  }

  it('makes a low direct free kick more vulnerable to the authoritative wall than a high attempt', () => {
    const low = interactiveResult('direct_free_kick', { takerRating:82, aimY:.28, assist:.20 });
    const high = interactiveResult('direct_free_kick', { takerRating:82, aimY:.88, assist:.20 });

    expect(low.finish).toBe('blocked');
    expect(low.presentation.blockerId).toBeTruthy();
    expect(high.finish).not.toBe('blocked');
  });
});
