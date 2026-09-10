import { describe, expect, it } from 'vitest';
import { createSyntheticPlayableMoment, samplePlayablePocMotion } from './playableMomentsPocScene.js';

function savedShotResolution() {
  return {
    shot:{
      finish:'saved',
      goal:false,
      goalkeeperIntervention:'parry',
      presentation:{
        target:{ x:.72, y:.70, power:.82 },
        keeper:{ x:.68, y:.65, timing:.88, reach:.52, intervention:'parry' },
        goalkeeperIntervention:'parry',
        contact:'save',
      },
    },
  };
}

describe('Phase 7 attacking playable-moment shot presentation', () => {
  it('keeps the ball at the authoritative setup point through the approach, then launches it after the strike', () => {
    const moment = createSyntheticPlayableMoment('attack');
    const resolution = savedShotResolution();

    const approach = samplePlayablePocMotion(moment, resolution, .25);
    const strike = samplePlayablePocMotion(moment, resolution, .43);
    const flight = samplePlayablePocMotion(moment, resolution, .60);

    expect(approach.ball.z).toBeCloseTo(moment.geometry.ball.z, 6);
    expect(strike.ball.z).toBeCloseTo(moment.geometry.ball.z, 6);
    expect(strike.shooter.z).toBeCloseTo(moment.geometry.shooter.z, 6);
    expect(Math.abs(strike.shooter.z - strike.ball.z)).toBeLessThan(.85);
    expect(strike.shooter.kick).toBeGreaterThan(.9);
    expect(flight.ball.z).toBeLessThan(strike.ball.z);
  });

  it('keeps the goalkeeper set before contact and reacts toward the authoritative keeper plan after release', () => {
    const moment = createSyntheticPlayableMoment('attack');
    const resolution = savedShotResolution();

    const set = samplePlayablePocMotion(moment, resolution, .43);
    const reaction = samplePlayablePocMotion(moment, resolution, .62);

    expect(set.keeper.x).toBeCloseTo(moment.geometry.goalkeeper.x, 6);
    expect(set.keeper.dive).toBeCloseTo(0, 6);
    expect(reaction.keeper.x).toBeGreaterThan(set.keeper.x + .2);
    expect(reaction.keeper.dive).toBeGreaterThan(.1);
    expect(reaction.keeper.roll).toBeGreaterThan(0);
    expect(reaction.ball.intervention).toBe('parry');
  });
});
