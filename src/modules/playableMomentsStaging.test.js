import { describe, expect, it } from 'vitest';
import {
  buildPlayableMoment,
  derivePlayableMomentStaging,
} from './matchActionResolver.js';

function player(id, position, rating = 76) {
  return {
    id,
    name:id,
    position,
    matchPosition:position,
    age:25,
    attack:rating,
    midfield:rating,
    defence:rating,
    goalkeeping:position === 'GK' ? rating : 10,
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

function prepared(overrides = {}) {
  const keeper = overrides.keeper ?? player('keeper', 'GK', 80);
  const pressureDefender = overrides.pressureDefender ?? player('cover', 'CB', 78);
  const shooter = overrides.shooter ?? player('shooter', 'ST', 82);
  return {
    version:1,
    phase:42,
    minute:32,
    teamId:'home',
    opponentTeamId:'away',
    attackers:[shooter],
    defenders:[keeper, pressureDefender],
    packet:{
      version:1,
      possession:.4,
      route:.5,
      actor:.4,
      target:.5,
      defender:.4,
      execution:.2,
      outcome:.6,
      chance:.01,
      shooter:.2,
      shot:.2,
      finish:.2,
      assist:.8,
      discipline:.8,
      injury:.8,
      ...(overrides.packet ?? {}),
    },
    route:'carry',
    actor:shooter,
    target:null,
    defender:pressureDefender,
    execution:80,
    counter:75,
    context:0,
    successChance:.6,
    mentality:'balanced',
    riskMode:'normal',
    outcome:'chance_created',
    xg:.20,
    chance:'medium_quality_chance',
    shooter,
    assistId:null,
    pressureDefender,
    ...overrides,
  };
}

describe('Phase 3 playable staging projection', () => {
  it('is strictly pre-outcome and cannot change when only shot/finish rolls change', () => {
    const first = derivePlayableMomentStaging(prepared({ packet:{ target:.18, shot:.01, finish:.01 } }));
    const second = derivePlayableMomentStaging(prepared({ packet:{ target:.18, shot:.99, finish:.99 } }));
    expect(first).toEqual(second);
  });

  it('maps the prepared chance into central, left and right channel snapshots', () => {
    expect(derivePlayableMomentStaging(prepared({ packet:{ target:.50 } })).channelBand).toBe('central');
    expect(derivePlayableMomentStaging(prepared({ packet:{ target:.12 } })).channelBand).toBe('left');
    expect(derivePlayableMomentStaging(prepared({ packet:{ target:.88 } })).channelBand).toBe('right');
    expect(derivePlayableMomentStaging(prepared({ packet:{ target:.50 } })).variant).toBe('central_snapshot');
    expect(derivePlayableMomentStaging(prepared({ packet:{ target:.12 } })).variant).toBe('left_channel_snapshot');
    expect(derivePlayableMomentStaging(prepared({ packet:{ target:.88 } })).variant).toBe('right_channel_snapshot');
  });

  it('uses existing chance semantics to distinguish edge, close-range and one-on-one staging', () => {
    const edge = derivePlayableMomentStaging(prepared({ xg:.09, route:'circulation' }));
    const close = derivePlayableMomentStaging(prepared({ xg:.36, route:'carry' }));
    const oneOnOneDeep = derivePlayableMomentStaging(prepared({ xg:.24, route:'pass_into_space' }));
    const oneOnOneAdvancing = derivePlayableMomentStaging(prepared({ xg:.36, route:'pass_into_space' }));

    expect(edge.variant).toBe('edge_of_box_attempt');
    expect(edge.distanceBand).toBe('edge');
    expect(close.variant).toBe('close_range_attempt');
    expect(close.distanceBand).toBe('close');
    expect(oneOnOneDeep.variant).toBe('one_on_one_deep_keeper');
    expect(oneOnOneDeep.keeperStartingDepth).toBe('deep');
    expect(oneOnOneAdvancing.variant).toBe('one_on_one_advancing_keeper');
    expect(oneOnOneAdvancing.keeperStartingDepth).toBe('advancing');
    expect(oneOnOneAdvancing.keeperDepth).toBeGreaterThan(oneOnOneDeep.keeperDepth);
  });

  it('derives pressure from the already-authorized pressure defender rather than terminal outcome', () => {
    const low = derivePlayableMomentStaging(prepared({ pressureDefender:player('low-cover', 'CB', 54) }));
    const high = derivePlayableMomentStaging(prepared({ pressureDefender:player('high-cover', 'CB', 94) }));

    expect(low.pressureLevel).toBe('low');
    expect(high.pressureLevel).toBe('high');
    expect(high.defenderRelationship).not.toBe(low.defenderRelationship);
  });

  it('builds bounded attacking scene geometry while refusing an opponent-owned goalkeeper scene', () => {
    const deepPrepared = prepared({ xg:.24, route:'pass_into_space', packet:{ target:.18 } });
    const advancingPrepared = prepared({ xg:.36, route:'pass_into_space', packet:{ target:.18 } });
    const deepMoment = buildPlayableMoment(deepPrepared, 'home');
    const advancingMoment = buildPlayableMoment(advancingPrepared, 'home');

    expect(deepMoment.geometry.staging.variant).toBe('one_on_one_deep_keeper');
    expect(advancingMoment.geometry.staging.variant).toBe('one_on_one_advancing_keeper');
    expect(deepMoment.geometry.goalkeeper.z).toBe(deepMoment.geometry.staging.keeperDepth);
    expect(advancingMoment.geometry.goalkeeper.z).toBe(advancingMoment.geometry.staging.keeperDepth);
    expect(advancingMoment.geometry.goalkeeper.z).toBeGreaterThan(deepMoment.geometry.goalkeeper.z);
    expect(deepMoment.geometry.legalActions.attack).toEqual(['aim', 'power', 'timing']);
    expect(deepMoment.geometry.continuousLocomotion).toBe(false);
    expect(buildPlayableMoment(advancingPrepared, 'away')).toBeNull();
  });
});
