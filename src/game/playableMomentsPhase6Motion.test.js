import { describe, expect, it } from 'vitest';
import { samplePlayablePocMotion } from './playableMomentsPocScene.js';

function moment(contactType, { height = null, family = null } = {}) {
  const header = contactType.includes('header');
  const contactHeight = height ?? (header ? 1.68 : contactType === 'volley' ? .78 : .34);
  const sourceFamily = family ?? (header ? 'cross' : 'cutback');
  return {
    version:3,
    phase:48,
    minute:36,
    mode:'attack',
    interactionType:'contact',
    contactType,
    sourceContinuationType:sourceFamily,
    shooterName:'Phase 6 Striker',
    goalkeeperName:'Phase 6 Keeper',
    xg:.24,
    geometry:{
      coordinateSystem:'goal-facing-v1',
      goal:{ width:7.32, height:2.44 },
      distance:9.4,
      staging:{ version:1, variant:contactType, contactType, contactHeight, sourceContinuationFamily:sourceFamily },
      shooter:{ x:.6, y:0, z:header && contactType === 'running_header' ? 10.55 : 9.4 },
      goalkeeper:{ x:0, y:0, z:.48 },
      defender:{ x:1.35, y:0, z:5.8 },
      ball:{ x:.6, y:contactHeight, z:header ? 10.55 : 10.05 },
      contact:{ x:.6, y:contactHeight, z:9.4 },
    },
  };
}

function resolution(intervention = null, finish = 'goal', target = { x:.48, y:.58, power:.72 }) {
  return {
    shot:{
      finish,
      goal:finish === 'goal',
      goalkeeperIntervention:intervention,
      presentation:{
        target,
        keeper:finish === 'saved'
          ? { x:.42, y:.52, timing:.86, reach:.48, intervention }
          : { x:.26, y:.48, timing:.70, reach:.40 },
        contact:finish === 'saved' ? 'save' : finish,
        goalkeeperIntervention:intervention,
      },
    },
  };
}

describe('Phase 6 procedural contact motion', () => {
  it('moves an incoming header to the authoritative contact point before the outgoing shot', () => {
    const header = moment('standing_header');
    const resolved = resolution();
    const start = samplePlayablePocMotion(header, resolved, 0);
    const incoming = samplePlayablePocMotion(header, resolved, .24);
    const contact = samplePlayablePocMotion(header, resolved, .43);
    const outgoing = samplePlayablePocMotion(header, resolved, .60);

    expect(incoming.ball.z).toBeLessThan(start.ball.z);
    expect(incoming.ball.z).toBeGreaterThan(header.geometry.contact.z);
    expect(contact.ball.x).toBeCloseTo(header.geometry.contact.x, 5);
    expect(contact.ball.y).toBeCloseTo(header.geometry.contact.y, 5);
    expect(contact.ball.z).toBeCloseTo(header.geometry.contact.z, 5);
    expect(outgoing.ball.z).toBeLessThan(contact.ball.z);
    expect(contact.shooter.kick).toBeCloseTo(0, 6);
    expect(contact.shooter.headDip).toBeGreaterThan(.1);
  });

  it('makes running headers materially more dynamic than standing headers', () => {
    const standing = samplePlayablePocMotion(moment('standing_header'), resolution(), .36);
    const running = samplePlayablePocMotion(moment('running_header'), resolution(), .36);

    expect(running.shooter.y).toBeGreaterThan(standing.shooter.y);
    expect(running.shooter.lean).toBeGreaterThan(standing.shooter.lean);
    expect(running.shooter.headDip).toBeGreaterThan(standing.shooter.headDip);
    expect(running.shooter.contactType).toBe('running_header');
  });

  it('keeps volley and half-volley body mechanics distinct from headers and from each other', () => {
    const header = samplePlayablePocMotion(moment('standing_header'), resolution(), .43);
    const volley = samplePlayablePocMotion(moment('volley'), resolution(), .43);
    const halfVolley = samplePlayablePocMotion(moment('half_volley'), resolution(), .43);

    expect(header.shooter.kick).toBeCloseTo(0, 6);
    expect(volley.shooter.kick).toBeGreaterThan(halfVolley.shooter.kick);
    expect(halfVolley.shooter.plantBend).toBeGreaterThan(volley.shooter.plantBend);
    expect(moment('volley').geometry.contact.y).toBeGreaterThan(moment('half_volley').geometry.contact.y);
  });

  it('recovers all contact types to a bounded neutral pose', () => {
    for (const type of ['standing_header','running_header','volley','half_volley']) {
      const frame = samplePlayablePocMotion(moment(type), resolution(), 1);
      expect(frame.shooter.recovery).toBe(1);
      expect(frame.shooter.kick).toBeCloseTo(0, 6);
      expect(frame.shooter.lean).toBeCloseTo(0, 6);
      expect(frame.keeper.recovery).toBe(1);
      expect(frame.keeper.dive).toBeCloseTo(0, 6);
      expect(frame.keeper.roll).toBeCloseTo(0, 6);
    }
  });
});

describe('Phase 6 goalkeeper intervention presentation', () => {
  it('holds a catch instead of inventing a parry', () => {
    const contactMoment = moment('volley');
    const contact = samplePlayablePocMotion(contactMoment, resolution('catch', 'saved'), .70);
    const held = samplePlayablePocMotion(contactMoment, resolution('catch', 'saved'), .90);

    expect(held.ball.controlled).toBe(true);
    expect(held.ball.intervention).toBe('catch');
    expect(held.ball.parry).toBeCloseTo(0, 6);
    expect(Math.abs(held.ball.z - contact.ball.z)).toBeLessThan(.3);
    expect(held.keeper.catch).toBeGreaterThan(0);
  });

  it('keeps parries as visible outward deflections', () => {
    const contactMoment = moment('volley');
    const contact = samplePlayablePocMotion(contactMoment, resolution('parry', 'saved'), .70);
    const parry = samplePlayablePocMotion(contactMoment, resolution('parry', 'saved'), .90);

    expect(parry.ball.controlled).toBe(false);
    expect(parry.ball.parry).toBeGreaterThan(.5);
    expect(parry.ball.z).toBeGreaterThan(contact.ball.z + 1);
    expect(Math.abs(parry.ball.x - contact.ball.x)).toBeGreaterThan(.3);
  });

  it('makes smothers lower and spreads wider than a conventional catch', () => {
    const contactMoment = moment('half_volley');
    const catchFrame = samplePlayablePocMotion(contactMoment, resolution('catch', 'saved'), .65);
    const smotherFrame = samplePlayablePocMotion(contactMoment, resolution('smother', 'saved', { x:.1, y:.12, power:.62 }), .65);
    const spreadFrame = samplePlayablePocMotion(contactMoment, resolution('spread', 'saved', { x:.62, y:.34, power:.78 }), .65);

    expect(smotherFrame.keeper.y).toBeLessThan(catchFrame.keeper.y);
    expect(smotherFrame.keeper.smother).toBeGreaterThan(0);
    expect(spreadFrame.keeper.spread).toBeGreaterThan(0);
    expect(Math.abs(spreadFrame.keeper.x)).toBeGreaterThan(Math.abs(smotherFrame.keeper.x));
  });

  it('defaults legacy saved shots to the established parry presentation', () => {
    const legacy = {
      version:1,
      mode:'attack',
      xg:.2,
      geometry:{
        goal:{ width:7.32, height:2.44 },
        distance:11,
        shooter:{ x:0, y:0, z:11.7 },
        goalkeeper:{ x:0, y:0, z:.35 },
        defender:{ x:1.2, y:0, z:5.8 },
        ball:{ x:0, y:.11, z:11 },
      },
    };
    const saved = resolution(null, 'saved');
    const parry = samplePlayablePocMotion(legacy, saved, .90);
    expect(parry.ball.intervention).toBe('parry');
    expect(parry.ball.parry).toBeGreaterThan(.5);
  });
});
