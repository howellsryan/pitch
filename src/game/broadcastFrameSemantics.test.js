import { describe, expect, it } from 'vitest';
import { describeBroadcastFrame } from './broadcastFrameSemantics.js';

const players = [
  { id:'g1', name:'Alex Keeper', position:'GK' },
  { id:'p1', name:'Mason Vale', position:'CM' },
  { id:'p2', name:'Rico Lane', position:'ST' },
  { id:'d1', name:'Jon Bell', position:'CB' },
  { id:'s1', name:'Kai Stone', position:'ST' },
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

describe('text-first Broadcast frame semantics', () => {
  it('uses the authoritative ledger action title instead of the retired choreography action', () => {
    const frame = { phaseLabel:'Legacy route', action:'CHANCE · RUNNER FINDING SPACE', carrierName:'Mason Vale' };
    const sim = simulation('route');
    const before = JSON.parse(JSON.stringify(sim));

    const presentation = describeBroadcastFrame(frame, sim);
    expect(presentation.phaseLabel).toBe('Progression · ball in behind');
    expect(presentation.action).toBe('RUN IN BEHIND · ATTACKING SPACE');
    expect(presentation.detail).toContain('gap behind an advanced defence');
    expect(sim).toEqual(before);
  });

  it('explains the authoritative shot result once the sequence reaches the chance stage', () => {
    const presentation = describeBroadcastFrame(
      { phaseLabel:'Chance', action:'SHOT · SAVED', carrierName:'Kai Stone' },
      simulation('chance'),
    );
    expect(presentation.action).toBe('SAVE · GOALKEEPER DENIES THE CHANCE');
    expect(presentation.detail).toContain('does not change the score');
  });

  it('surfaces goalkeeper-specific build-up language', () => {
    const presentation = describeBroadcastFrame(
      { phaseLabel:'Build-up', action:'PASS', carrierName:'Alex Keeper' },
      simulation('route', { route:'circulation', actorId:'g1', targetId:'d1', shotId:null, finish:null }),
    );
    expect(presentation.action).toBe('GOALKEEPER BUILD-UP · PLAYING SHORT');
    expect(presentation.detail).toContain('draw the first line of pressure');
  });

  it('falls back safely outside an authoritative ledger scene', () => {
    expect(describeBroadcastFrame(
      { phaseLabel:'Second half', action:'MATCH FLOW', carrierName:'Alex Keeper' },
      { players, activePhase:null },
    )).toEqual({
      phaseLabel:'Second half',
      action:'MATCH FLOW',
      detail:'Alex Keeper is involved in the next phase.',
    });
  });
});
