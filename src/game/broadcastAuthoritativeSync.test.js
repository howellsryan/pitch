import { describe, expect, it } from 'vitest';
import {
  advanceBroadcastSimulation,
  createBroadcastSimulation,
  isBroadcastReady,
  updateBroadcastSimulation,
} from './broadcastSimulation.js';

const positions = ['GK','RB','CB','CB','LB','CM','CDM','CM','RW','ST','LW'];
const side = prefix => positions.map((position, index) => ({ id:`${prefix}-${index}`, name:`${prefix.toUpperCase()} ${index}`, position }));

function create() {
  return createBroadcastSimulation({
    homeTeamId:'home', awayTeamId:'away', possessionTeamId:'home',
    homeFormation:'4-3-3', awayFormation:'4-3-3',
    homePlayers:side('h'), awayPlayers:side('a'), ledgerDriven:true,
  });
}

function goalRecord(phase = 1) {
  return {
    phase, minute:1, teamId:'home', opponentTeamId:'away', route:'carry', outcome:'chance_created',
    actorId:'h-7', targetId:'h-9', defenderId:'a-2', shotId:'h-9', finish:'goal', cornerWon:false,
  };
}

function retainRecord(phase = 2) {
  return {
    phase, minute:2, teamId:'away', opponentTeamId:'home', route:'circulation', outcome:'retain',
    actorId:'a-5', targetId:'a-6', defenderId:'h-5', shotId:null, finish:null, cornerWon:false,
  };
}

function reachLive(sim) {
  for (let index = 0; index < 200 && sim.mode !== 'live'; index += 1) advanceBroadcastSimulation(sim, 33);
  expect(sim.mode).toBe('live');
}

describe('authoritative ledger to live broadcast synchronisation', () => {
  it('cannot replace an active authoritative phase with a later engine record', () => {
    const sim = create();
    reachLive(sim);
    updateBroadcastSimulation(sim, { phase:1, possessionTeamId:'home', record:goalRecord(1) });
    expect(sim.activePhase?.record.phase).toBe(1);
    expect(isBroadcastReady(sim)).toBe(false);

    updateBroadcastSimulation(sim, { phase:2, possessionTeamId:'away', record:retainRecord(2) });
    expect(sim.activePhase?.record.phase).toBe(1);
    expect(sim.completedPhase).toBe(0);
  });

  it('visibly reaches GOAL for an authoritative goal before the phase is considered complete', () => {
    const sim = create();
    reachLive(sim);
    updateBroadcastSimulation(sim, { phase:1, possessionTeamId:'home', record:goalRecord(1) });

    let sawGoal = false;
    for (let index = 0; index < 700 && !isBroadcastReady(sim); index += 1) {
      const frame = advanceBroadcastSimulation(sim, 33);
      if (frame.action === 'GOAL') sawGoal = true;
    }

    expect(sawGoal).toBe(true);
    expect(sim.completedPhase).toBe(1);
    expect(sim.activePhase).toBeNull();
    expect(isBroadcastReady(sim)).toBe(true);
  });

  it('accepts the next authoritative record only after the previous visual phase settles', () => {
    const sim = create();
    reachLive(sim);
    updateBroadcastSimulation(sim, { phase:1, possessionTeamId:'home', record:goalRecord(1) });
    for (let index = 0; index < 700 && !isBroadcastReady(sim); index += 1) advanceBroadcastSimulation(sim, 33);
    expect(isBroadcastReady(sim)).toBe(true);

    updateBroadcastSimulation(sim, { phase:2, possessionTeamId:'away', record:retainRecord(2) });
    expect(sim.activePhase?.record.phase).toBe(2);
    expect(isBroadcastReady(sim)).toBe(false);
  });
});
