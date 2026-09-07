import { describe, expect, it } from 'vitest';
import { describeBroadcastFrame } from './broadcastFrameSemantics.js';

const players = [
  { id:'g1', name:'Alex Keeper', position:'GK', teamId:'home' },
  { id:'p1', name:'Mason Vale', position:'CM', teamId:'home' },
  { id:'p2', name:'Rico Lane', position:'ST', teamId:'home' },
  { id:'d1', name:'Jon Bell', position:'CB', teamId:'away' },
  { id:'s1', name:'Kai Stone', position:'ST', teamId:'home' },
];

function simulation(stage = 'route', extra = {}) {
  return {
    players,
    activePhase:{
      stage,
      record:{
        phase:42, minute:32, teamId:'home', opponentTeamId:'away',
        route:'pass_into_space', actorId:'p1', targetId:'p2', defenderId:'d1',
        outcome:'chance_created', shotId:'s1', finish:'saved', ...extra,
      },
    },
  };
}

describe('continuous live-match story adapter', () => {
  it('turns the route into a readable football passage instead of a renderer action', () => {
    const frame = { phaseLabel:'Legacy route', action:'CHANCE · RUNNER FINDING SPACE', carrierName:'Mason Vale' };
    const sim = simulation('route');
    const before = JSON.parse(JSON.stringify(sim));

    const presentation = describeBroadcastFrame(frame, sim);
    expect(presentation.phaseLabel).toBe('Progression · run in behind');
    expect(presentation.action).toBe('Mason Vale tries to release Rico Lane');
    expect(presentation.detail).toContain('Rico Lane starts the run beyond the defensive line');
    expect(presentation.detail).toContain('turn controlled possession into a clear chance');
    expect(sim).toEqual(before);
  });

  it('keeps the previous meaningful passage visible during the internal acquire stage', () => {
    const sim = simulation('route');
    const route = describeBroadcastFrame({}, sim);
    sim.activePhase = {
      stage:'acquire',
      record:{ phase:43, minute:33, teamId:'away', opponentTeamId:'home', route:'circulation', actorId:'d1', outcome:'retain' },
    };
    const acquire = describeBroadcastFrame({}, sim);
    expect(acquire).toEqual(route);
    expect(acquire.action).not.toMatch(/RESET/i);
  });

  it('evolves the same passage through chance and finish rather than replacing it with a burst', () => {
    const sim = simulation('route');
    const opening = describeBroadcastFrame({}, sim);
    sim.activePhase.stage = 'chance';
    const finished = describeBroadcastFrame({}, sim);

    expect(finished.action).toBe('Kai Stone is denied by the goalkeeper');
    expect(finished.detail).toContain('Rico Lane starts the run beyond the defensive line');
    expect(finished.detail).toContain('opens a shooting window');
    expect(finished.detail).toContain('gets the effort on target');
    expect(finished.detail.length).toBeGreaterThan(opening.detail.length);
  });

  it('carries momentum into the next possession and explicitly narrates a change of team', () => {
    const sim = simulation('contest', { outcome:'intercepted', shotId:null, finish:null });
    const first = describeBroadcastFrame({}, sim);
    expect(first.detail).toContain('Jon Bell');

    sim.activePhase = {
      stage:'route',
      record:{ phase:43, minute:33, teamId:'away', opponentTeamId:'home', route:'carry', actorId:'d1', outcome:'progress' },
    };
    const second = describeBroadcastFrame({}, sim);
    expect(second.detail).toContain('Possession changes hands');
    expect(second.detail).toContain('Jon Bell carries the ball forward');
  });

  it('narrates direct free kicks as complete set-piece situations', () => {
    const sim = simulation('route', {
      route:'carry', outcome:'foul_won', setPieceType:'direct_free_kick', shotId:'s1', finish:null,
    });
    const presentation = describeBroadcastFrame({}, sim);
    expect(presentation.phaseLabel).toBe('Direct free kick · shooting range');
    expect(presentation.action).toBe('Kai Stone stands over a dangerous free kick');
    expect(presentation.detail).toContain('wall is set between ball and goalkeeper');
  });

  it('starts with football commentary rather than TEAMS RESETTING when no ledger scene is ready yet', () => {
    const presentation = describeBroadcastFrame(
      { phaseLabel:'Second half', action:'TEAMS RESETTING', carrierName:'Alex Keeper' },
      { players, activePhase:null },
    );
    expect(presentation.action).toBe('The match is beginning to take shape');
    expect(presentation.detail).toContain('feeling their way into the game');
    expect(JSON.stringify(presentation)).not.toContain('TEAMS RESETTING');
  });
});
