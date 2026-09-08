import { buildLiveMatchState, simulateMatchSegment } from '../modules/matchEngine.js';
import { describe, expect, it } from 'vitest';
import {
  advanceBroadcastSimulation,
  createBroadcastSimulation,
  isBroadcastReady,
  LEDGER_HALFTIME_HOLD_MS,
  updateBroadcastSimulation,
} from './broadcastSimulation.js';

const positions = ['GK','RB','CB','CB','LB','CM','CDM','CM','RW','ST','LW'];
const players = prefix => positions.map((position, index) => ({
  id:`${prefix}${index}`,
  name:`Player ${prefix}${index}`,
  position,
  age:25,
  attack:76,
  midfield:76,
  defence:76,
  goalkeeping:position === 'GK' ? 78 : 10,
  fitness:100,
  form:50,
  inSquad:true,
}));

function drainKickoff(sim) {
  for (let elapsed = 0; elapsed <= 2000; elapsed += 50) {
    advanceBroadcastSimulation(sim, 50);
    if (isBroadcastReady(sim)) return;
  }
  throw new Error('Initial broadcast kickoff did not settle');
}

function presentPhaseWithinRealBudget(sim, record, budgetMs = 750) {
  updateBroadcastSimulation(sim, {
    phase:record.phase,
    possessionTeamId:record.teamId,
    record,
    event:record.finish === 'goal'
      ? { type:'goal', minute:record.minute, playerId:record.shotId, playerName:record.shotId, teamId:record.teamId }
      : null,
  });

  let realElapsed = 0;
  const actions = new Set();
  while (realElapsed < budgetMs) {
    const frame = advanceBroadcastSimulation(sim, 50);
    realElapsed += 50;
    actions.add(frame.action);
    if (isBroadcastReady(sim) || sim.mode === 'half-time') return { realElapsed, actions };
  }
  return { realElapsed, actions };
}

function enterHalfTime(sim) {
  let elapsed = 0;
  while (sim.mode !== 'half-time' && elapsed < 1500) {
    advanceBroadcastSimulation(sim, 50);
    elapsed += 50;
  }
  expect(sim.mode).toBe('half-time');
  return elapsed;
}

function drainHalfTime(sim) {
  let elapsed = 0;
  while (sim.mode === 'half-time' && elapsed < LEDGER_HALFTIME_HOLD_MS + 500) {
    advanceBroadcastSimulation(sim, 50);
    elapsed += 50;
    if (elapsed < LEDGER_HALFTIME_HOLD_MS - 50) expect(sim.mode).toBe('half-time');
  }
  expect(elapsed).toBeGreaterThanOrEqual(LEDGER_HALFTIME_HOLD_MS - 50);
  expect(sim.halftimeCompleted).toBe(true);

  let settleElapsed = 0;
  while (!isBroadcastReady(sim) && settleElapsed < 1000) {
    advanceBroadcastSimulation(sim, 50);
    settleElapsed += 50;
  }
  expect(isBroadcastReady(sim)).toBe(true);
  return elapsed + settleElapsed;
}

describe('fixed live-match cadence with an intentional half-time break', () => {
  it.each([12, 34, 56])('keeps every normal seeded phase inside its 750ms presentation budget and pauses after phase 60 (seed %s)', seed => {
    const home = { id:'h', name:'Home', reputation:75 };
    const away = { id:'a', name:'Away', reputation:75 };
    let state = buildLiveMatchState(home, away, players('h'), players('a'), '4-3-3', '4-3-3', null, null, 'balanced', 'balanced', { seed });
    const sim = createBroadcastSimulation({
      homeTeamId:'h', awayTeamId:'a', possessionTeamId:'h',
      homeFormation:state.homeFormation, awayFormation:state.awayFormation,
      homePlayers:state.hActive, awayPlayers:state.aActive,
      ledgerDriven:true,
    });
    drainKickoff(sim);

    let displayedGoals = 0;
    for (let phase = 1; phase <= 120; phase += 1) {
      state = simulateMatchSegment(home, away, state, phase, phase).updatedState;
      const record = state.actionLedger.at(-1);
      const presented = presentPhaseWithinRealBudget(sim, record);

      if (phase === 60) {
        if (sim.mode !== 'half-time') enterHalfTime(sim);
        expect(isBroadcastReady(sim)).toBe(false);
        drainHalfTime(sim);
      } else {
        expect(isBroadcastReady(sim), `phase ${phase} exceeded 750ms at ${sim.activePhase?.stage ?? sim.mode}`).toBe(true);
        expect(presented.realElapsed).toBeLessThanOrEqual(750);
      }

      expect(sim.completedPhase).toBe(phase);
      if (presented.actions.has('GOAL')) displayedGoals += 1;
    }

    expect(displayedGoals).toBe(state.actionLedger.filter(record => record.finish === 'goal').length);
  });

  it('adds a four-second half-time pause on top of the 120-phase regulation presentation budget', () => {
    expect(120 * 750).toBe(90_000);
    expect(120 * 750 + LEDGER_HALFTIME_HOLD_MS).toBe(94_000);
  });
});
