import { buildLiveMatchState, simulateMatchSegment } from '../modules/matchEngine.js';
import { describe, expect, it } from 'vitest';
import { advanceBroadcastSimulation, createBroadcastSimulation, isBroadcastReady, replaceBroadcastLineups, updateBroadcastSimulation } from './broadcastSimulation.js';
const positions = ['GK','RB','CB','CB','LB','CM','CDM','CM','RW','ST','LW'];
const players = prefix => positions.map((position, i) => ({ id:`${prefix}${i}`, name:`Player ${prefix}${i}`, position }));
const create = () => createBroadcastSimulation({ homeTeamId:'h', awayTeamId:'a', possessionTeamId:'h', homeFormation:'4-3-3', awayFormation:'4-3-3', homePlayers:players('h'), awayPlayers:players('a'), ledgerDriven:true });
function drain(sim, limit = 2400) {
  const actions = new Set();
  for (let i = 0; i < limit; i++) {
    const frame = advanceBroadcastSimulation(sim, 50);
    actions.add(frame.action);
    if (isBroadcastReady(sim)) return actions;
  }
  throw new Error(`Stalled: ${sim.activePhase?.stage} ${sim.action} ${sim.mode} owner=${sim.ball.ownerId}`);
}
function record(extra = {}) { return { phase:1, minute:1, teamId:'h', opponentTeamId:'a', route:'circulation', actorId:'h5', targetId:'h6', defenderId:'a5', outcome:'retain', ...extra }; }
function send(sim, r) { updateBroadcastSimulation(sim, { phase:r.phase, possessionTeamId:r.teamId, record:r, event:r.finish === 'goal' ? { type:'goal', minute:r.minute, playerId:r.shotId, playerName:r.shotId, teamId:r.teamId } : null }); }

describe('ledger broadcast choreography', () => {
  it.each(['circulation', 'direct_pass', 'pass_into_space', 'carry', 'wide_delivery', 'aerial_duel'])('finishes %s with its selected actors and no invented shot', route => {
    const sim = create(); drain(sim); send(sim, record({ route }));
    const actions = drain(sim);
    expect(sim.completedPhase).toBe(1);
    expect([...actions].some(a => /SHOT|FOUL|CORNER/.test(a))).toBe(false);
    expect(sim.ball.ownerId).toBe(route === 'carry' ? 'h5' : 'h6');
  });
  it.each(['turnover', 'intercepted', 'foul_won', 'corner_won'])('finishes recorded %s', outcome => {
    const sim = create(); drain(sim); send(sim, record({ route:'wide_delivery', outcome }));
    drain(sim);
    expect(sim.completedPhase).toBe(1);
    if (outcome === 'turnover' || outcome === 'intercepted') expect(sim.ball.ownerId).toBe('a5');
  });
  it.each(['goal', 'saved', 'missed', 'blocked'])('shows the recorded %s shot and completes the restart', finish => {
    const sim = create(); drain(sim); send(sim, record({ route:'pass_into_space', outcome:'chance_created', shotId:'h9', finish, cornerWon:finish === 'blocked' }));
    const actions = drain(sim);
    expect(sim.completedPhase).toBe(1);
    expect(actions.has('GOAL')).toBe(finish === 'goal');
    expect([...actions].some(a => a.startsWith('SHOT'))).toBe(true);
  });
  it('does not overwrite or replay a phase and waits for half-time and the goal', () => {
    const sim = create(); drain(sim);
    const r = record({ phase:60, minute:45, shotId:'h9', finish:'goal', outcome:'chance_created' });
    send(sim, r); send(sim, record({ phase:61 }));
    expect(sim.activePhase.record.phase).toBe(60);
    const actions = drain(sim);
    expect(actions.has('GOAL')).toBe(true);
    expect(actions.has('HALF TIME')).toBe(true);
    expect(sim.halftimeCompleted).toBe(true);
    send(sim, r); expect(sim.activePhase).toBe(null);
  });
  it('shows consecutive opposing phases and completes a last-phase goal before readiness', () => {
    const sim = create(); drain(sim); send(sim, record()); drain(sim);
    send(sim, record({ phase:2, teamId:'a', opponentTeamId:'h', actorId:'a8', targetId:'a9', defenderId:'h4', route:'carry' })); drain(sim);
    send(sim, record({ phase:120, minute:90, shotId:'h9', finish:'goal', outcome:'chance_created' }));
    expect(isBroadcastReady(sim)).toBe(false);
    expect(drain(sim).has('GOAL')).toBe(true);
    expect(sim.completedPhase).toBe(120);
  });
});


it.each([12, 34, 56])('drains a complete seeded ledger without inventing goals (seed %s)', seed => {
  const squad = prefix => players(prefix).map(p => ({ ...p, age:25, attack:76, midfield:76, defence:76, goalkeeping:p.position === 'GK' ? 78 : 10, fitness:100, form:50, inSquad:true }));
  const h = { id:'h', name:'Home', reputation:75 }, a = { id:'a', name:'Away', reputation:75 };
  let state = buildLiveMatchState(h, a, squad('h'), squad('a'), '4-3-3', '4-3-3', null, null, 'balanced', 'balanced', { seed });
  const sim = createBroadcastSimulation({ homeTeamId:'h', awayTeamId:'a', possessionTeamId:'h', homeFormation:state.homeFormation, awayFormation:state.awayFormation, homePlayers:state.hActive, awayPlayers:state.aActive, ledgerDriven:true });
  drain(sim);
  let goals = 0;
  for (let phase = 1; phase <= 120; phase++) {
    state = simulateMatchSegment(h, a, state, phase, phase).updatedState;
    const r = state.actionLedger.at(-1);
    send(sim, r);
    const actions = drain(sim);
    if (actions.has('GOAL')) goals++;
    expect(sim.completedPhase).toBe(phase);
  }
  expect(goals).toBe(state.actionLedger.filter(r => r.finish === 'goal').length);
});

it('defers a substituted scorer until their already-resolved scene completes', () => {
  const sim = create(); drain(sim);
  send(sim, record({ shotId:'h9', finish:'goal', outcome:'chance_created' }));
  replaceBroadcastLineups(sim, { homeFormation:'4-3-3', awayFormation:'4-3-3', homePlayers:players('h').map(p => p.id === 'h9' ? { ...p, id:'sub' } : p), awayPlayers:players('a') });
  expect(sim.players.some(p => p.id === 'h9')).toBe(true);
  expect(drain(sim).has('GOAL')).toBe(true);
  expect(sim.players.some(p => p.id === 'sub')).toBe(true);
  expect(sim.players.some(p => p.id === 'h9')).toBe(false);
});
