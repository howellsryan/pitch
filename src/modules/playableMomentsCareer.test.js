import { describe, expect, it } from 'vitest';
import {
  PLAYABLE_KEY_MOMENTS_FLAGS,
  PLAYABLE_MOMENT_SOFT_CAP,
  acknowledgePlayableMoment,
  assertSupportedPlayableSession,
  attachPendingPlayableMoment,
  commitPlayableMomentToSession,
  createPlayableMatchSession,
  deserializeLiveMatchState,
  evaluatePlayableMomentSelection,
  markPlayableMatchReadyToClose,
  playableEventKey,
  playableSessionId,
  restorePlayableRuntime,
  samePlayableIntent,
  serializeLiveMatchState,
} from './playableMomentsCareer.js';

function liveState(overrides = {}) {
  return {
    matchEngineVersion:1,
    actionResolverVersion:2,
    actionLedgerVersion:1,
    rngPacketVersion:1,
    hFitness:new Map([['h1', 88], ['h2', 73]]),
    aFitness:new Map([['a1', 91]]),
    hActive:[{ id:'h1', name:'Home One', position:'ST' }],
    aActive:[{ id:'a1', name:'Away One', position:'GK' }],
    hBenchLeft:[], aBenchLeft:[],
    hGoals:1, aGoals:1, hPhases:40, aPhases:38,
    hSubsLeft:3, aSubsLeft:3,
    actionLedger:[],
    seed:123, rngState:456,
    ...overrides,
  };
}

function event(fixtureId = 'fixture-1') {
  return { type:'league', gw:12, fixtureId, userIsHome:true };
}

function moment(overrides = {}) {
  return {
    version:1,
    phase:61,
    minute:46,
    mode:'attack',
    attackingTeamId:'home',
    defendingTeamId:'away',
    shooterId:'h1',
    shooterName:'Home One',
    goalkeeperId:'a1',
    goalkeeperName:'Away One',
    defenderId:null,
    route:'pass_into_space',
    xg:.24,
    geometry:{ coordinateSystem:'goal-facing-v1', goal:{ width:7.32, height:2.44 }, channel:0, distance:11, shooter:{x:0,y:0,z:11}, goalkeeper:{x:0,y:0,z:.35}, ball:{x:0,y:.11,z:10.5} },
    ...overrides,
  };
}

function continuation(overrides = {}) {
  return {
    version:1,
    phase:61,
    minute:46,
    packet:{ version:1, possession:.2, route:.4, actor:.3, target:.5, defender:.5, execution:.2, outcome:.8, chance:.1, shooter:.4, shot:.7, finish:.6, assist:.2, discipline:.9, injury:.9 },
    preparedAction:{ version:1, phase:61 },
    isHome:true,
    rngState:777,
    hActive:[{ id:'h1' }], aActive:[{ id:'a1' }], hBenchLeft:[], aBenchLeft:[],
    hFitness:new Map([['h1', 87.8]]),
    aFitness:new Map([['a1', 90.9]]),
    hSubsLeft:3, aSubsLeft:3,
    hGoals:1, aGoals:1, hPhases:41, aPhases:38,
    hStr:{ attack:80 }, aStr:{ goalkeeping:80 }, actionLedger:[],
    ...overrides,
  };
}

function session(slotId = 'career_a', fixtureId = 'fixture-1') {
  return createPlayableMatchSession({
    slotId,
    event:event(fixtureId),
    userTeamId:'home',
    userIsHome:true,
    liveState:liveState(),
    currentPhase:60,
    allEvents:[{ type:'yellow', minute:20 }],
  });
}

function committedSession() {
  const pending = attachPendingPlayableMoment(session(), { moment:moment(), continuation:continuation() });
  const resolution = { moment:moment(), shot:{ finish:'goal', goal:true, presentation:{ contact:'goal' } }, record:{ phase:61, finish:'goal' }, goalEvent:{ type:'goal', minute:46, teamId:'home' } };
  return commitPlayableMomentToSession(pending, {
    momentId:pending.pending.momentId,
    intent:{ attack:{ aimX:.4, aimY:.7, power:.8, timing:.9 } },
    resolution,
    updatedState:liveState({ hGoals:2, rngState:777 }),
    segEvents:[resolution.goalEvent],
  });
}

describe('Phase 2 playable career session', () => {
  it('round-trips live state Maps through plain save-safe data', () => {
    const serialized = serializeLiveMatchState(liveState());
    expect(serialized.hFitness).toEqual([['h1', 88], ['h2', 73]]);
    expect(serialized.aFitness).toEqual([['a1', 91]]);
    expect(serialized.hFitness).not.toBeInstanceOf(Map);

    const restored = deserializeLiveMatchState(serialized);
    expect(restored.hFitness).toBeInstanceOf(Map);
    expect(restored.hFitness.get('h2')).toBe(73);
    expect(restored.aFitness.get('a1')).toBe(91);
  });

  it('isolates overlapping fixture IDs by career slot', () => {
    expect(playableEventKey(event('same-fixture'))).toBe('league:12:same-fixture');
    expect(playableSessionId('career_a', event('same-fixture')))
      .not.toBe(playableSessionId('career_b', event('same-fixture')));
  });

  it('selects only from pre-finish moment/session context', () => {
    const base = session();
    const candidate = moment({ phase:78, minute:59, xg:.31 });
    const first = evaluatePlayableMomentSelection({ moment:candidate, session:base, liveState:liveState() });
    const second = evaluatePlayableMomentSelection({
      moment:{ ...candidate, imaginaryWouldHaveBeenFinish:'goal', packet:{ finish:0, shot:0 } },
      session:{ ...base, imaginaryAutoFinish:'missed' },
      liveState:liveState(),
    });
    expect(second).toEqual(first);
  });

  it('enforces spacing and a soft cap without manufacturing chances', () => {
    const base = session();
    const spaced = { ...base, lastMomentPhase:59 };
    expect(evaluatePlayableMomentSelection({ moment:moment({ phase:63 }), session:spaced }).reason).toBe('pacing_gap');

    const capped = { ...base, momentsOffered:PLAYABLE_MOMENT_SOFT_CAP };
    expect(evaluatePlayableMomentSelection({ moment:moment({ phase:90 }), session:capped }).reason).toBe('soft_cap');

    expect(PLAYABLE_KEY_MOMENTS_FLAGS.enabled).toBe(true);
  });

  it('persists a pending continuation before commit and restores it exactly', () => {
    const pending = attachPendingPlayableMoment(session(), { moment:moment(), continuation:continuation() });
    expect(pending.status).toBe('pending');
    expect(pending.pending.momentId).toContain(':p61:attack:h1');
    expect(pending.pending.continuation.hFitness).toEqual([['h1', 87.8]]);

    const runtime = restorePlayableRuntime(pending);
    expect(runtime.pending.continuation.hFitness).toBeInstanceOf(Map);
    expect(runtime.pending.continuation.hFitness.get('h1')).toBe(87.8);
    expect(runtime.currentPhase).toBe(60);
  });

  it('commits normalized intent, authoritative receipt and advanced state into a recoverable result-reveal state', () => {
    const committed = committedSession();

    expect(committed.session.status).toBe('committed');
    expect(committed.session.pending).toBeNull();
    expect(committed.session.currentPhase).toBe(61);
    expect(committed.session.lastReceipt.intent.version).toBe(1);
    expect(committed.session.lastReceipt.resolution.shot.finish).toBe('goal');
    expect(committed.session.history.at(-1).finish).toBe('goal');

    const restored = restorePlayableRuntime(committed.session);
    expect(restored.liveState.hGoals).toBe(2);
    expect(restored.receipt).toEqual(committed.receipt);
  });

  it('requires explicit acknowledgement after a durable result reveal before match simulation can continue', () => {
    const committed = committedSession();
    expect(evaluatePlayableMomentSelection({ moment:moment({ phase:80 }), session:committed.session }).reason).toBe('session_busy');
    expect(() => markPlayableMatchReadyToClose(committed.session, {})).toThrow(/unresolved presentation/i);

    const acknowledged = acknowledgePlayableMoment(committed.session);
    expect(acknowledged.status).toBe('active');
    expect(acknowledged.revision).toBe(committed.session.revision + 1);
    expect(acknowledged.lastReceipt).toEqual(committed.receipt);
  });

  it('marks full time only after no pending or unacknowledged result remains', () => {
    const active = session();
    const closed = markPlayableMatchReadyToClose(active, { homeGoals:2, awayGoals:1 });
    expect(closed.status).toBe('ready_to_close');
    expect(closed.currentPhase).toBe(120);
    expect(closed.finalResult.homeGoals).toBe(2);

    const pending = attachPendingPlayableMoment(active, { moment:moment(), continuation:continuation() });
    expect(() => markPlayableMatchReadyToClose(pending, {})).toThrow(/unresolved presentation or moment/i);
  });

  it('rejects unsupported started versions instead of silently relabelling them', () => {
    const incompatible = { ...session(), versions:{ ...session().versions, scene:99 } };
    expect(() => assertSupportedPlayableSession(incompatible)).toThrow(/unsupported version/i);
  });

  it('compares duplicate intents after normalization', () => {
    expect(samePlayableIntent(
      { attack:{ aimX:.4, aimY:.7, power:.8, timing:.9 } },
      { attack:{ aimX:.4, aimY:.7, power:.8, timing:.9 } },
    )).toBe(true);
    expect(samePlayableIntent(
      { attack:{ aimX:.4, aimY:.7, power:.8, timing:.9 } },
      { attack:{ aimX:-.4, aimY:.7, power:.8, timing:.9 } },
    )).toBe(false);
  });
});
