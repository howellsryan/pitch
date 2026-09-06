import { describe, expect, it, vi } from 'vitest';

vi.mock('./playableMomentsPersistence.js', () => ({
  persistPlayableSessionAtomic:vi.fn(async session => ({ session, idempotent:false })),
  commitPlayableMomentAtomic:vi.fn(async ({ nextSession, receipt }) => ({ session:nextSession, receipt, idempotent:false })),
  clearPlayableMatchSessionAtomic:vi.fn(async () => ({ cleared:true, idempotent:false })),
}));

import { buildLiveMatchState } from './matchEngine.js';
import { createUserTacticalPlan } from './tactics.js';
import { createPlayableMatchSession, restorePlayableRuntime } from './playableMomentsCareer.js';
import {
  acknowledgePlayableResult,
  advancePlayableMatchPhase,
  preparePlayableMatchClose,
  resolvePendingPlayableMoment,
} from './playableMomentsRuntime.js';

const POSITIONS = ['GK','CB','CB','RB','LB','CDM','CM','CAM','RW','LW','ST','GK','CB','CM','RW','ST','LB','CDM'];

function player(id, position, rating = 80) {
  const attacking = ['ST','RW','LW','CAM'].includes(position);
  const midfield = ['CDM','CM','CAM','RW','LW'].includes(position);
  const defending = ['CB','RB','LB','CDM'].includes(position);
  return {
    id, name:id, position, age:25, fitness:94, form:50, individualMorale:50, sharpness:50,
    attack:attacking ? rating : rating - 10,
    midfield:midfield ? rating : rating - 8,
    defence:defending ? rating : rating - 18,
    goalkeeping:position === 'GK' ? rating : 8,
    traits:[], injured:false, suspended:false, inSquad:true,
    positionSuitability:{ [position]:1 },
    attributeProfile:{ version:1, pace:rating, shooting:attacking ? rating + 2 : rating - 12, passing:midfield || attacking ? rating : rating - 8, dribbling:midfield || attacking ? rating : rating - 8, defending:defending ? rating : rating - 18, physical:rating },
  };
}

function squad(prefix, rating) {
  return POSITIONS.map((position, index) => player(`${prefix}_${index}`, position, rating + (index % 3) - 1));
}

function fixture(seed, fixtureId) {
  const home = { id:'home', name:'Home', reputation:82, tacticalPlan:createUserTacticalPlan({ buildUp:'direct', transition:'counter', tempo:'fast' }) };
  const away = { id:'away', name:'Away', reputation:80 };
  const liveState = buildLiveMatchState(home, away, squad('h',82), squad('a',80), '4-3-3', '4-3-3', null, null, 'balanced', 'balanced', { seed });
  const session = createPlayableMatchSession({
    slotId:'career_a', event:{ type:'league', gw:8, fixtureId, userIsHome:true },
    userTeamId:'home', userIsHome:true, liveState,
  });
  return { home, away, liveState, session };
}

async function findSelectedMoment() {
  for (let seedIndex = 0; seedIndex < 16; seedIndex += 1) {
    const state = fixture(`runtime-${seedIndex}`, `f-${seedIndex}`);
    let liveState = state.liveState;
    let currentPhase = 0;
    let allEvents = [];
    for (let phase = 1; phase <= 120; phase += 1) {
      const step = await advancePlayableMatchPhase({
        session:state.session,
        homeTeam:state.home,
        awayTeam:state.away,
        liveState,
        allEvents,
        currentPhase,
        controlledTeamId:'home',
      });
      if (step.kind === 'pending') return { ...state, liveState, allEvents, currentPhase, step };
      liveState = step.updatedState;
      allEvents = [...allEvents, ...step.segEvents];
      currentPhase = step.currentPhase;
    }
  }
  throw new Error('No deterministic selected playable moment found');
}

describe('Phase 2 playable runtime coordinator', () => {
  it('suspends a selected authoritative interaction before commit and persists the pending state', async () => {
    const found = await findSelectedMoment();
    expect(found.step.kind).toBe('pending');
    expect(found.step.session.status).toBe('pending');
    expect(found.step.session.pending.moment).toEqual(found.step.moment);
    expect(found.step.session.currentPhase).toBe(found.currentPhase);
    expect(found.step.session.liveState.hGoals).toBe(found.liveState.hGoals);
  });

  it('commits the official result, survives reveal state, then acknowledges before continuing', async () => {
    const found = await findSelectedMoment();
    const resolved = await resolvePendingPlayableMoment({
      session:found.step.session,
      homeTeam:found.home,
      awayTeam:found.away,
      controlledTeamId:'home',
      intent:null,
    });

    expect(resolved.session.status).toBe('committed');
    expect(resolved.session.pending).toBeNull();
    expect(resolved.receipt.resolution.record).toBeTruthy();
    if (resolved.receipt.resolution.shot) {
      expect(resolved.receipt.resolution.shot.finish).toBeTruthy();
    } else {
      expect(resolved.receipt.resolution.continuation?.outcome).toBeTruthy();
    }
    expect(resolved.currentPhase).toBe(found.step.moment.phase);

    const acknowledged = await acknowledgePlayableResult(resolved.session);
    expect(acknowledged.status).toBe('active');
    expect(acknowledged.revision).toBe(resolved.session.revision + 1);
    expect(restorePlayableRuntime(acknowledged).liveState.rngState).toBe(resolved.liveState.rngState);
  });

  it('persists a ready-to-close final result without bypassing the authoritative finaliser', async () => {
    const state = fixture('close', 'close-fixture');
    const prepared = await preparePlayableMatchClose({
      session:state.session,
      homeTeam:state.home,
      awayTeam:state.away,
      liveState:state.liveState,
      allEvents:[],
    });
    expect(prepared.session.status).toBe('ready_to_close');
    expect(prepared.result.homeTeamId).toBe('home');
    expect(prepared.result.awayTeamId).toBe('away');
    expect(prepared.session.finalResult.homeGoals).toBe(prepared.result.homeGoals);
  });
});