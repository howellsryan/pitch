import { describe, expect, it } from 'vitest';
import {
  attachPendingPlayableMoment,
  commitPlayableMomentToSession,
  createPlayableMatchSession,
  evaluatePlayableMomentSelection,
} from './playableMomentsCareer.js';

function liveState(overrides = {}) {
  return {
    matchEngineVersion:1,
    actionResolverVersion:2,
    actionLedgerVersion:1,
    rngPacketVersion:1,
    hFitness:new Map([['h1', 90]]),
    aFitness:new Map([['a1', 90]]),
    hActive:[{ id:'h1', name:'Home One', position:'ST' }],
    aActive:[{ id:'a1', name:'Away One', position:'GK' }],
    hBenchLeft:[], aBenchLeft:[],
    hGoals:1, aGoals:1, hPhases:70, aPhases:70,
    hSubsLeft:3, aSubsLeft:3,
    actionLedger:[], seed:1, rngState:1,
    ...overrides,
  };
}

function baseSession() {
  return createPlayableMatchSession({
    slotId:'career_a',
    event:{ type:'league', gw:18, fixtureId:'fixture-phase3', userIsHome:true },
    userTeamId:'home',
    userIsHome:true,
    liveState:liveState(),
    currentPhase:80,
  });
}

function moment(variant = 'central_snapshot', overrides = {}) {
  return {
    version:1,
    phase:94,
    minute:71,
    mode:'attack',
    attackingTeamId:'home',
    defendingTeamId:'away',
    shooterId:'h1',
    shooterName:'Home One',
    goalkeeperId:'a1',
    goalkeeperName:'Away One',
    defenderId:'a2',
    route:'carry',
    xg:.22,
    geometry:{
      coordinateSystem:'goal-facing-v1',
      staging:{ version:1, variant, channelBand:'central', distanceBand:'box', pressureLevel:'medium', keeperStartingDepth:'set', defenderRelationship:'closing' },
    },
    ...overrides,
  };
}

function continuation() {
  return {
    version:1,
    phase:94,
    minute:71,
    packet:{ version:1, possession:.2, route:.4, actor:.3, target:.5, defender:.5, execution:.2, outcome:.8, chance:.1, shooter:.4, shot:.7, finish:.6, assist:.2, discipline:.9, injury:.9 },
    preparedAction:{ version:1, phase:94 },
    isHome:true,
    rngState:777,
    hActive:[{ id:'h1' }], aActive:[{ id:'a1' }], hBenchLeft:[], aBenchLeft:[],
    hFitness:new Map([['h1', 89]]), aFitness:new Map([['a1', 89]]),
    hSubsLeft:3, aSubsLeft:3,
    hGoals:1, aGoals:1, hPhases:71, aPhases:70,
    hStr:{ attack:80 }, aStr:{ goalkeeping:80 }, actionLedger:[],
  };
}

describe('Phase 3 playable staging diversity', () => {
  it('penalises repeating the same staging variant more than changing geometry within the same mode', () => {
    const candidate = moment('central_snapshot');
    const repeated = {
      ...baseSession(),
      history:[{ mode:'attack', variant:'central_snapshot', phase:70, minute:53, finish:'saved' }],
      lastMomentPhase:70,
    };
    const varied = {
      ...baseSession(),
      history:[{ mode:'attack', variant:'left_channel_snapshot', phase:70, minute:53, finish:'saved' }],
      lastMomentPhase:70,
    };

    const repeatedSelection = evaluatePlayableMomentSelection({ moment:candidate, session:repeated, liveState:liveState() });
    const variedSelection = evaluatePlayableMomentSelection({ moment:candidate, session:varied, liveState:liveState() });

    expect(repeatedSelection.roll).toBe(variedSelection.roll);
    expect(repeatedSelection.probability).toBeLessThan(variedSelection.probability);
  });

  it('stores the authoritative staging variant in compact session history after commit', () => {
    const offered = moment('one_on_one_advancing_keeper');
    const pending = attachPendingPlayableMoment(baseSession(), { moment:offered, continuation:continuation() });
    const resolution = { moment:offered, shot:{ finish:'saved', goal:false, presentation:{ contact:'save' } }, record:{ phase:94, finish:'saved' }, goalEvent:null };
    const committed = commitPlayableMomentToSession(pending, {
      momentId:pending.pending.momentId,
      intent:{ attack:{ aimX:.5, aimY:.7, power:.76, timing:.84 } },
      resolution,
      updatedState:liveState({ rngState:777 }),
      segEvents:[],
    });

    expect(committed.session.history.at(-1).variant).toBe('one_on_one_advancing_keeper');
  });
});
