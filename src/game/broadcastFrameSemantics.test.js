import { describe, expect, it } from 'vitest';
import { describeBroadcastFrame } from './broadcastFrameSemantics.js';

const players = [
  { id:'p1', name:'Mason Vale' },
  { id:'p2', name:'Rico Lane' },
  { id:'d1', name:'Jon Bell' },
  { id:'s1', name:'Kai Stone' },
];

function simulation(stage = 'route', extra = {}) {
  return {
    players,
    activePhase:{
      stage,
      record:{
        route:'pass_into_space', actorId:'p1', targetId:'p2', defenderId:'d1',
        outcome:'chance_created', shotId:'s1', finish:'saved', ...extra,
      },
    },
  };
}

describe('T6 Broadcast frame semantics', () => {
  it('adds ledger-grounded route detail without replacing the choreography action', () => {
    const frame = { phaseLabel:'Legacy route', action:'CHANCE · RUNNER FINDING SPACE', carrierName:'Mason Vale' };
    const before = JSON.parse(JSON.stringify(simulation('route')));
    const sim = simulation('route');

    expect(describeBroadcastFrame(frame, sim)).toEqual({
      phaseLabel:'Penetration · pass into space',
      action:'CHANCE · RUNNER FINDING SPACE',
      detail:'Rico Lane attacks the space beyond the line as Mason Vale releases the pass.',
    });
    expect(sim).toEqual(before);
  });

  it('explains the authoritative shot result once the scene reaches the chance stage', () => {
    const presentation = describeBroadcastFrame(
      { phaseLabel:'Chance', action:'SHOT · SAVED', carrierName:'Kai Stone' },
      simulation('chance'),
    );
    expect(presentation.action).toBe('SHOT · SAVED');
    expect(presentation.detail).toBe("Kai Stone's effort is kept out.");
  });

  it('falls back to the existing frame outside an authoritative ledger scene', () => {
    expect(describeBroadcastFrame(
      { phaseLabel:'Second half', action:'GOALKEEPER · BUILDING FROM THE BACK', carrierName:'Alex Keeper' },
      { players, activePhase:null },
    )).toEqual({
      phaseLabel:'Second half',
      action:'GOALKEEPER · BUILDING FROM THE BACK',
      detail:'Alex Keeper',
    });
  });
});
