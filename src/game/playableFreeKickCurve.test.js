import { describe, expect, it } from 'vitest';
import { normalizePlayableIntent } from '../modules/matchActionResolver.js';
import {
  gestureCurveFromPath,
  gestureToPlayableIntent,
  samplePlayablePocMotion,
} from './playableMomentsPocScene.js';
import {
  createPocAttackingMoment,
  resolvePocAttackingMoment,
} from './playableMomentsPocScenarios.js';

const bounds = { left:0, top:0, width:400, height:600 };
const start = { x:200, y:520 };
const end = { x:320, y:110 };

function curvedPath(side = 1) {
  return [
    start,
    { x:210 + side * 18, y:430 },
    { x:235 + side * 34, y:330 },
    { x:270 + side * 31, y:220 },
    end,
  ];
}

describe('playable direct-free-kick swipe curl', () => {
  it('derives signed curl from the swipe path while leaving the final goal-plane target authoritative', () => {
    const positive = gestureToPlayableIntent({
      mode:'attack',
      start,
      end,
      bounds,
      durationMs:480,
      goalTarget:{ x:.72, y:.80 },
      path:curvedPath(1),
    });
    const negative = gestureToPlayableIntent({
      mode:'attack',
      start,
      end,
      bounds,
      durationMs:480,
      goalTarget:{ x:.72, y:.80 },
      path:curvedPath(-1),
    });
    const straight = gestureToPlayableIntent({
      mode:'attack',
      start,
      end,
      bounds,
      durationMs:480,
      goalTarget:{ x:.72, y:.80 },
      path:[start, { x:260, y:315 }, end],
    });

    expect(positive.attack.aimX).toBe(.72);
    expect(positive.attack.aimY).toBe(.80);
    expect(Math.abs(positive.attack.curve)).toBeGreaterThan(.20);
    expect(Math.abs(negative.attack.curve)).toBeGreaterThan(.20);
    expect(Math.sign(positive.attack.curve)).toBe(-Math.sign(negative.attack.curve));
    expect(Math.abs(straight.attack.curve)).toBeLessThan(.03);
  });

  it('keeps legacy intents compatible by normalizing a missing curl to zero', () => {
    const legacy = normalizePlayableIntent({ attack:{ aimX:.7, aimY:.8, power:.72, timing:.9 } });
    const explicit = normalizePlayableIntent({ attack:{ aimX:.7, aimY:.8, power:.72, timing:.9, curve:0 } });
    expect(legacy.attack.curve).toBe(0);
    expect(legacy).toEqual(explicit);
    expect(gestureCurveFromPath({ path:[], start, end, bounds })).toBe(0);
  });

  it('uses committed inside/outside technique to change run-up and follow-through without moving boot contact', () => {
    const moment = createPocAttackingMoment('free_kick', 0);
    const insideShot = resolvePocAttackingMoment(moment, {
      attack:{ aimX:.62, aimY:.72, power:.72, timing:.98, curve:-.72 },
    });
    const outsideShot = resolvePocAttackingMoment(moment, {
      attack:{ aimX:.62, aimY:.72, power:.72, timing:.98, curve:.72 },
    });

    expect(new Set([insideShot.presentation.kickStyle, outsideShot.presentation.kickStyle]))
      .toEqual(new Set(['inside','outside']));

    const insideApproach = samplePlayablePocMotion(moment, { shot:insideShot }, .30);
    const outsideApproach = samplePlayablePocMotion(moment, { shot:outsideShot }, .30);
    const insideFollow = samplePlayablePocMotion(moment, { shot:insideShot }, .56);
    const outsideFollow = samplePlayablePocMotion(moment, { shot:outsideShot }, .56);
    const insideContact = samplePlayablePocMotion(moment, { shot:insideShot }, .43);
    const outsideContact = samplePlayablePocMotion(moment, { shot:outsideShot }, .43);

    expect(insideApproach.shooter.joints.pelvis.x).not.toBeCloseTo(outsideApproach.shooter.joints.pelvis.x, 4);
    expect(insideFollow.shooter.joints.rightAnkle.x).not.toBeCloseTo(outsideFollow.shooter.joints.rightAnkle.x, 4);
    expect(insideContact.shooter.joints.rightToe.x).toBeCloseTo(insideContact.world.ball.x, 5);
    expect(insideContact.shooter.joints.rightToe.z).toBeCloseTo(insideContact.world.ball.z, 5);
    expect(outsideContact.shooter.joints.rightToe.x).toBeCloseTo(outsideContact.world.ball.x, 5);
    expect(outsideContact.shooter.joints.rightToe.z).toBeCloseTo(outsideContact.world.ball.z, 5);
  });
});
