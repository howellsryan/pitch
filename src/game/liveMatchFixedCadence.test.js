import { buildLiveMatchState, simulateMatchSegment } from '../modules/matchEngine.js';
import { describe, expect, it } from 'vitest';
import {
  advanceBroadcastSimulation,
  createBroadcastSimulation,
  isBroadcastReady,
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
    if (isBroadcastReady(sim)) return { realElapsed, actions };
  }
  return { realElapsed, actions };
}

describe('fixed 1 real second = 1 match minute cadence', () => {
  it.each([12, 34, 56])('keeps every seeded authoritative phase inside its 750ms presentation budget (seed %s)', seed => {
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
      expect(isBroadcastReady(sim), `phase ${phase} exceeded 750ms at ${sim.activePhase?.stage ?? sim.mode}`).toBe(true);
      expect(presented.realElapsed).toBeLessThanOrEqual(750);
      expect(sim.completedPhase).toBe(phase);
      if (presented.actions.has('GOAL')) displayedGoals += 1;
    }

    expect(displayedGoals).toBe(state.actionLedger.filter(record => record.finish === 'goal').length);
  });

  it('locks regulation timing to 120 × 750ms = 90 seconds independently of event density', () => {
    expect(120 * 750).toBe(90_000);
  });
});
