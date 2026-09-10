import { describe, expect, it } from 'vitest';
import { createSyntheticPlayableMoment, samplePlayablePocMotion } from './playableMomentsPocScene.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const goal = { finish:'goal', presentation:{ target:{ x:.7, y:.65, power:.8 } } };

describe('contact-driven football animation', () => {
  it('plants the support foot and meets the ball with the striking boot', () => {
    const moment = createSyntheticPlayableMoment();
    const plant = samplePlayablePocMotion(moment, goal, .34).shooter.joints;
    const strike = samplePlayablePocMotion(moment, goal, .43);
    expect(strike.shooter.joints).toBeDefined();
    expect(distance(strike.shooter.joints.rightToe, strike.ball)).toBeLessThan(.12);
    expect(distance(plant.leftAnkle, strike.shooter.joints.leftAnkle)).toBeLessThan(.005);
    expect(strike.shooter.joints.leftAnkle.y).toBeCloseTo(.09, 5);
  });

  it('moves the legs during the approach rather than sliding a static stance', () => {
    const moment = createSyntheticPlayableMoment();
    const a = samplePlayablePocMotion(moment, goal, .08).shooter.joints;
    const b = samplePlayablePocMotion(moment, goal, .18).shooter.joints;
    expect(a).toBeDefined();
    expect(Math.abs((a.leftAnkle.z - a.rightAnkle.z) - (b.leftAnkle.z - b.rightAnkle.z))).toBeGreaterThan(.15);
  });

  it('does not ease a kicked ball up from zero speed', () => {
    const moment = createSyntheticPlayableMoment();
    const z = t => samplePlayablePocMotion(moment, goal, t).ball.z;
    const launch = z(.43) - z(.44);
    const later = z(.54) - z(.55);
    expect(launch / later).toBeGreaterThan(.8);
  });

  it.each([-1, 1])('reaches a saved ball with a glove and lands on that side (%s)', side => {
    const moment = createSyntheticPlayableMoment();
    const saved = { finish:'saved', presentation:{ target:{x:side * .7,y:.65,power:.8}, keeper:{x:side * .65,y:.65}, goalkeeperIntervention:'parry' } };
    const contact = samplePlayablePocMotion(moment, saved, .70);
    const landed = samplePlayablePocMotion(moment, saved, 1);
    expect(contact.keeper.joints).toBeDefined();
    expect(Math.min(distance(contact.keeper.joints.leftWrist, contact.ball), distance(contact.keeper.joints.rightWrist, contact.ball))).toBeLessThan(.12);
    expect(landed.keeper.joints.pelvis.x * side).toBeGreaterThan(.7);
  });

  it('samples reproducibly when replay seeks backwards without mutating the result', () => {
    const moment = createSyntheticPlayableMoment();
    const before = JSON.stringify([moment, goal]);
    const contact = samplePlayablePocMotion(moment, goal, .43);
    samplePlayablePocMotion(moment, goal, 1);
    expect(samplePlayablePocMotion(moment, goal, .43)).toEqual(contact);
    expect(JSON.stringify([moment, goal])).toBe(before);
  });

  it('keeps landing joints above the turf and low catches in the hands', () => {
    const moment = createSyntheticPlayableMoment();
    for (const x of [-.9, 0, .9]) for (const intervention of ['catch', 'parry']) {
      const saved = { finish:'saved', presentation:{ target:{x,y:.12}, keeper:{x,y:.12}, goalkeeperIntervention:intervention } };
      for (const t of [.70,.80,.90,1]) {
        const frame = samplePlayablePocMotion(moment, saved, t);
        const j = frame.keeper.joints;
        for (const [name, point] of Object.entries(j)) {
          if (name !== 'facing') expect(point.y, name).toBeGreaterThanOrEqual(.025);
        }
        if (intervention === 'catch') expect(Math.min(distance(j.leftWrist, frame.ball), distance(j.rightWrist, frame.ball))).toBeLessThan(.12);
      }
    }
  });

  it('does not snap the elbow or knee when a dive reaches the ground', () => {
    const moment = createSyntheticPlayableMoment();
    const saved = { finish:'saved', presentation:{ target:{x:.9,y:.12}, keeper:{x:.9,y:.12}, goalkeeperIntervention:'parry' } };
    let previous = samplePlayablePocMotion(moment, saved, 0);
    for (let n = 1; n <= 1000; n++) {
      const frame = samplePlayablePocMotion(moment, saved, n / 1000);
      for (const role of ['shooter','keeper']) for (const key of Object.keys(frame[role].joints)) {
        expect(distance(frame[role].joints[key], previous[role].joints[key]), `${role}.${key} at ${n}`).toBeLessThan(.035);
      }
      previous = frame;
    }
  });
});
