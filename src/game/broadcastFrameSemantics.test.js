import { describe, expect, it } from 'vitest';
import { LEDGER_PRESENTATION_TIME_SCALE } from './broadcastSimulation.js';
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
    clock:0,
    phase:42,
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

function readAt(sim, wallClockMs, frame = {}) {
  sim.clock = wallClockMs * LEDGER_PRESENTATION_TIME_SCALE;
  return describeBroadcastFrame(frame, sim);
}

describe('human-paced live-match commentary reader', () => {
  it('builds one passage over several seconds instead of dumping every sentence at once', () => {
    const sim = simulation('route');
    const before = JSON.parse(JSON.stringify(sim));

    const opening = readAt(sim, 0);
    expect(opening.phaseLabel).toBe('Progression · run in behind');
    expect(opening.action).toBe('Mason Vale tries to release Rico Lane');
    expect(opening.detail).toContain('next meaningful passage');
    expect(opening.detail).not.toContain('Rico Lane starts the run');

    const secondBeat = readAt(sim, 1700);
    expect(secondBeat.detail).toContain('Rico Lane starts the run beyond the defensive line');
    expect(secondBeat.detail.length).toBeGreaterThan(opening.detail.length);
    expect(sim.activePhase).toEqual(before.activePhase);
  });

  it('does not reveal a terminal result until the narrated buildup has had time to play', () => {
    const sim = simulation('route', { finish:'goal' });
    const opening = readAt(sim, 0);
    expect(JSON.stringify(opening)).not.toMatch(/GOAL!/);

    sim.activePhase.stage = 'chance';
    const developing = readAt(sim, 3600);
    expect(developing.detail).toContain('opened a shooting chance');
    expect(JSON.stringify(developing)).not.toMatch(/GOAL!/);

    const goal = readAt(sim, 5600);
    expect(goal.action).toBe('GOAL! Kai Stone');
    expect(goal.detail).toContain('Kai Stone takes the chance... GOAL!');
    expect(sim.commentaryGoalReady).toBe(true);
  });

  it('keeps what the user is reading when a routine internal phase arrives', () => {
    const sim = simulation('route');
    const first = readAt(sim, 1800);

    sim.activePhase = {
      stage:'route',
      record:{ phase:43, minute:33, teamId:'away', opponentTeamId:'home', route:'circulation', actorId:'d1', outcome:'retain' },
    };
    const routine = readAt(sim, 2300);
    expect(routine).toEqual(first);
    expect(routine.action).not.toMatch(/RESET/i);
  });

  it('samples ordinary match flow instead of narrating every authoritative phase', () => {
    const sim = {
      clock:0,
      phase:43,
      players,
      activePhase:{
        stage:'route',
        record:{ phase:43, minute:33, teamId:'home', opponentTeamId:'away', route:'circulation', actorId:'p1', targetId:'p2', outcome:'retain' },
      },
    };
    const skipped = readAt(sim, 0);
    expect(skipped.action).toBe('The match is beginning to take shape');

    sim.phase = 48;
    sim.activePhase = {
      stage:'route',
      record:{ phase:48, minute:36, teamId:'home', opponentTeamId:'away', route:'direct_pass', actorId:'p1', targetId:'p2', outcome:'progress' },
    };
    const sampled = readAt(sim, 1000);
    expect(sampled.phaseLabel).toBe('Progression · direct ball');
    expect(sampled.action).toBe('Mason Vale looks forward early');
  });

  it('narrates a direct free kick as a set-piece story and reveals the wall on the second beat', () => {
    const sim = simulation('route', {
      route:'carry', outcome:'foul_won', setPieceType:'direct_free_kick', shotId:'s1', finish:'saved',
    });
    const opening = readAt(sim, 0);
    expect(opening.phaseLabel).toBe('Direct free kick · shooting range');
    expect(opening.action).toBe('Kai Stone stands over a dangerous free kick');
    expect(opening.detail).not.toContain('sets its wall');

    const setup = readAt(sim, 1700);
    expect(setup.detail).toContain('sets its wall between ball and goalkeeper');
  });

  it('gives half time its own authoritative update and clears stale first-half commentary', () => {
    const sim = simulation('route');
    readAt(sim, 1800);

    sim.phase = 60;
    sim.activePhase = null;
    const halfTime = readAt(sim, 2000, { mode:'half-time' });
    expect(halfTime).toEqual({
      phaseLabel:'Half time',
      action:'HALF TIME',
      detail:'The first half is complete. Play is paused before the teams return for the second half.',
    });
    expect(sim.commentaryBusy).toBe(false);

    sim.phase = 61;
    sim.activePhase = {
      stage:'route',
      record:{ phase:61, minute:46, teamId:'away', opponentTeamId:'home', route:'carry', actorId:'d1', outcome:'progress' },
    };
    const secondHalf = readAt(sim, 2200, { mode:'live' });
    expect(secondHalf.detail).not.toContain('Rico Lane starts the run');
  });

  it('prioritises an authoritative goal passage before the separate goal notice can unlock', () => {
    const sim = simulation('chance', { finish:'saved' });
    const first = readAt(sim, 0);

    sim.phase = 44;
    sim.activePhase = {
      stage:'chance',
      record:{
        phase:44, minute:33, teamId:'away', opponentTeamId:'home',
        route:'carry', actorId:'d1', targetId:null, defenderId:'p1',
        outcome:'chance_created', shotId:'d1', finish:'goal',
      },
    };
    const whileReading = readAt(sim, 1200);
    expect(whileReading.action).toBe(first.action);
    expect(JSON.stringify(whileReading)).not.toMatch(/GOAL!/);
    expect(sim.commentaryGoalReady).not.toBe(true);

    const goalPassage = readAt(sim, 1700);
    expect(goalPassage.action).toBe('Jon Bell drives at the defence');
    expect(JSON.stringify(goalPassage)).not.toMatch(/GOAL!/);

    const goal = readAt(sim, 7200);
    expect(goal.action).toBe('GOAL! Jon Bell');
    expect(goal.detail).toContain('Jon Bell takes the chance... GOAL!');
    expect(sim.commentaryGoalReady).toBe(true);
  });

  it('drops stale routine commentary at phase 120 so only an unfinished goal can hold full time', () => {
    const sim = simulation('route');
    readAt(sim, 1800);
    sim.phase = 120;
    sim.activePhase = null;

    const completed = readAt(sim, 2000, { mode:'live' });
    expect(completed.action).toBe('The match is beginning to take shape');
    expect(sim.commentaryBusy).toBe(false);
  });

  it('keeps a phase-120 goal as the only commentary allowed to delay full time', () => {
    const sim = simulation('chance', { phase:120, minute:90, finish:'goal' });
    sim.phase = 120;

    const buildup = readAt(sim, 0);
    expect(buildup.action).toBe('Mason Vale tries to release Rico Lane');
    expect(sim.commentaryBusy).toBe(true);

    const goal = readAt(sim, 5600);
    expect(goal.action).toBe('GOAL! Kai Stone');
    expect(sim.commentaryGoalReady).toBe(true);
    expect(sim.commentaryBusy).toBe(false);
  });

  it('starts with football commentary rather than TEAMS RESETTING when no ledger scene is ready', () => {
    const presentation = describeBroadcastFrame(
      { phaseLabel:'Second half', action:'TEAMS RESETTING', carrierName:'Alex Keeper' },
      { clock:0, phase:61, players, activePhase:null },
    );
    expect(presentation.action).toBe('The match is beginning to take shape');
    expect(presentation.detail).toContain('feeling their way into the game');
    expect(JSON.stringify(presentation)).not.toContain('TEAMS RESETTING');
  });
});
