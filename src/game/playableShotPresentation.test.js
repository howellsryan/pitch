import { describe, expect, it } from 'vitest';
import { playablePresentationScenario } from './playableMomentsSceneDirector.js';
import {
  playableDefenderDirection,
  playablePresentedBall,
  playableShooterDirection,
  playableShotCameraComposition,
  playableShotPresentationScenario,
  transformPlayableFootballJoints,
} from './playableShotPresentation.js';

function openPlay(overrides = {}) {
  return {
    mode:'attack',
    interactionType:'shot',
    shooterId:'striker',
    goalkeeperId:'keeper',
    geometry:{
      channel:0,
      distance:13.2,
      staging:{ defenderRelationship:'closing' },
      shooter:{ x:0, y:0, z:13.2 },
      goalkeeper:{ x:0, y:0, z:.55 },
      defender:{ x:.9, y:0, z:9.2 },
      ball:{ x:0, y:.11, z:12.65 },
    },
    ...overrides,
  };
}

function freeKick(overrides = {}) {
  return openPlay({
    interactionType:'set_piece',
    setPiece:{ kind:'direct_free_kick' },
    geometry:{
      channel:0,
      distance:22,
      shooter:{ x:0, y:0, z:22 },
      goalkeeper:{ x:0, y:0, z:.35 },
      ball:{ x:0, y:.11, z:22 },
      wall:{ members:[{ id:'wall-1', x:0, y:0, z:12.85 }] },
    },
    ...overrides,
  });
}

function penalty(overrides = {}) {
  return openPlay({
    interactionType:'set_piece',
    route:'penalty',
    setPiece:{ kind:'penalty' },
    geometry:{
      channel:0,
      distance:11,
      shooter:{ x:0, y:0, z:11.7 },
      goalkeeper:{ x:0, y:0, z:.35 },
      ball:{ x:0, y:.11, z:11 },
      wall:null,
    },
    ...overrides,
  });
}

function world(moment) {
  return {
    distance:moment.geometry.distance,
    shooter:moment.geometry.shooter,
  };
}

describe('active key-moment presentation direction', () => {
  it('keeps the current career event families aligned with the scene director while shootouts reuse penalty grammar', () => {
    const moments = [
      openPlay(),
      freeKick(),
      penalty(),
      penalty({ interactionType:'shootout', route:'penalty_shootout' }),
    ];
    expect(moments.map(playableShotPresentationScenario)).toEqual(['open_play','direct_free_kick','penalty','shootout']);
    expect(moments.map(playableShotPresentationScenario)).toEqual(moments.map(playablePresentationScenario));
  });

  it('keeps retired contact moments on their neutral compatibility presentation', () => {
    const legacy = openPlay({ interactionType:'contact', contactType:'volley' });
    const neutral = { offsetX:0, offsetY:0, offsetZ:0, yaw:0 };
    expect(playableShotPresentationScenario(legacy)).toBe('legacy_contact');
    expect(playableShotPresentationScenario(legacy)).toBe(playablePresentationScenario(legacy));
    expect(playableShooterDirection(legacy, .12)).toEqual(neutral);
    expect(playableDefenderDirection(legacy, .12)).toEqual(neutral);
    expect(playableShotCameraComposition(legacy, world(legacy), 16 / 9).fov).toBe(43);
  });

  it('preserves the accepted penalty and shootout run-up while giving a free kick an angled pre-contact approach', () => {
    expect(playableShooterDirection(penalty(), .12)).toEqual({ offsetX:0, offsetY:0, offsetZ:0, yaw:0 });
    expect(playableShooterDirection(penalty({ interactionType:'shootout' }), .12)).toEqual({ offsetX:0, offsetY:0, offsetZ:0, yaw:0 });

    const approach = playableShooterDirection(freeKick(), .12);
    const contact = playableShooterDirection(freeKick(), .43);
    expect(Math.abs(approach.offsetX)).toBeGreaterThan(.4);
    expect(approach.offsetZ).toBeGreaterThan(.3);
    expect(Math.abs(approach.yaw)).toBeGreaterThan(.12);
    expect(contact.offsetX).toBeCloseTo(0, 8);
    expect(contact.offsetZ).toBeCloseTo(0, 8);
    expect(contact.yaw).toBeCloseTo(0, 8);
  });

  it('moves a closing open-play defender into the authoritative position by strike time without moving a trailing defender', () => {
    const start = playableDefenderDirection(openPlay(), .08);
    const contact = playableDefenderDirection(openPlay(), .43);
    const trailing = playableDefenderDirection(openPlay({
      geometry:{ ...openPlay().geometry, staging:{ defenderRelationship:'trailing' } },
    }), .12);

    expect(start.offsetZ).toBeLessThan(-.4);
    expect(contact.offsetZ).toBeCloseTo(0, 8);
    expect(trailing).toEqual({ offsetX:0, offsetY:0, offsetZ:0, yaw:0 });
  });

  it('uses recognisably different stable camera compositions for open play, free kicks and penalties', () => {
    const open = playableShotCameraComposition(openPlay(), world(openPlay()), 16 / 9);
    const free = playableShotCameraComposition(freeKick(), world(freeKick()), 16 / 9);
    const pen = playableShotCameraComposition(penalty(), world(penalty()), 16 / 9);

    expect(open.fov).toBe(44);
    expect(free.fov).toBe(46);
    expect(pen.fov).toBe(43);
    expect(free.position.y).toBeGreaterThan(open.position.y);
    expect(Math.abs(free.position.x)).toBeGreaterThan(Math.abs(pen.position.x));
    expect(pen.position).toMatchObject({ x:.65, y:3.9, z:17.4 });
  });

  it('renders signed free-kick curl only between fixed launch and terminal contact', () => {
    const moment = freeKick();
    const positive = {
      shot:{ finish:'goal', presentation:{ target:{ x:.72, y:.82 }, curve:.70 } },
    };
    const negative = {
      shot:{ finish:'goal', presentation:{ target:{ x:.72, y:.82 }, curve:-.70 } },
    };
    const straight = {
      shot:{ finish:'goal', presentation:{ target:{ x:.72, y:.82 }, curve:0 } },
    };
    const source = { x:1.2, y:.7, z:8, spinX:3 };
    const launch = playablePresentedBall(moment, positive, .43, source);
    const positiveMiddle = playablePresentedBall(moment, positive, .62, source);
    const negativeMiddle = playablePresentedBall(moment, negative, .62, source);
    const straightMiddle = playablePresentedBall(moment, straight, .62, source);
    const terminal = playablePresentedBall(moment, positive, .82, source);

    expect(launch).toEqual(source);
    expect(terminal).toEqual(source);
    expect(positiveMiddle.y).toBeGreaterThan(source.y + .15);
    expect(positiveMiddle.x).toBeGreaterThan(source.x + .15);
    expect(negativeMiddle.x).toBeLessThan(source.x - .15);
    expect(straightMiddle.x).toBeCloseTo(source.x, 8);
    expect(positiveMiddle.spinX).toBe(source.spinX);

    const blocked = playablePresentedBall(moment, { shot:{ finish:'blocked', presentation:{ target:{ x:.72, y:.82 }, curve:.70 } } }, .62, source);
    expect(blocked).toEqual(source);
    expect(playablePresentedBall(openPlay(), positive, .62, source)).toEqual(source);
  });

  it('returns the free-kick curve envelope to goalkeeper contact for saves', () => {
    const source = { x:-1.1, y:1.4, z:.6 };
    const saved = { shot:{ finish:'saved', presentation:{ target:{ x:-.68, y:.7 }, curve:-.8 } } };
    expect(playablePresentedBall(freeKick(), saved, .70, source)).toEqual(source);
  });

  it('rotates generated joints without mutating the underlying authoritative presentation sample', () => {
    const joints = {
      pelvis:{ x:1, y:.9, z:10 },
      chest:{ x:1, y:1.4, z:10 },
      rightAnkle:{ x:1.2, y:.1, z:9.8 },
      facing:{ x:0, y:0, z:-1 },
    };
    const before = JSON.parse(JSON.stringify(joints));
    const transformed = transformPlayableFootballJoints(joints, { offsetX:-.5, offsetZ:.4, yaw:.25 });

    expect(joints).toEqual(before);
    expect(transformed.pelvis.x).toBeCloseTo(.5, 8);
    expect(transformed.pelvis.z).toBeCloseTo(10.4, 8);
    expect(transformed.rightAnkle).not.toEqual(joints.rightAnkle);
    expect(transformed.facing).not.toEqual(joints.facing);
  });
});
