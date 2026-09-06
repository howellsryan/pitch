import { describe, expect, it } from 'vitest';
import {
  createPlayableMatchSession,
  evaluatePlayableMomentSelection,
  isPlayableKeyEventMoment,
  playableKeyEventType,
} from './playableMomentsCareer.js';

function liveState() {
  return {
    matchEngineVersion:2,
    actionResolverVersion:2,
    actionLedgerVersion:1,
    rngPacketVersion:1,
    hFitness:new Map(),
    aFitness:new Map(),
    hActive:[], aActive:[], hBenchLeft:[], aBenchLeft:[],
    hGoals:0, aGoals:0, hPhases:20, aPhases:20,
    hSubsLeft:3, aSubsLeft:3,
    actionLedger:[],
    seed:123,
  };
}

function session() {
  return createPlayableMatchSession({
    slotId:'career_a',
    event:{ type:'league', gw:10, fixtureId:'fixture-10', userIsHome:true },
    userTeamId:'home',
    userIsHome:true,
    liveState:liveState(),
    currentPhase:40,
  });
}

function shotMoment(overrides = {}) {
  return {
    version:1,
    phase:50,
    minute:38,
    mode:'attack',
    attackingTeamId:'home',
    defendingTeamId:'away',
    shooterId:'home-st',
    shooterName:'Home Striker',
    goalkeeperId:'away-gk',
    goalkeeperName:'Away Keeper',
    route:'pass_into_space',
    xg:.28,
    geometry:{ staging:{ variant:'central_snapshot' } },
    ...overrides,
  };
}

describe('Play Key Moments event policy', () => {
  it('allows open-play shots and goalkeeper attempts', () => {
    expect(playableKeyEventType(shotMoment())).toBe('shot');
    expect(isPlayableKeyEventMoment(shotMoment({ mode:'goalkeeper' }))).toBe(true);
  });

  it('allows direct free kicks and penalties as shooting events', () => {
    const freeKick = shotMoment({ setPiece:{ kind:'direct_free_kick' } });
    const penalty = shotMoment({ setPiece:{ kind:'penalty' } });
    expect(playableKeyEventType(freeKick)).toBe('free_kick');
    expect(playableKeyEventType(penalty)).toBe('shot');
  });

  it('allows shootout penalties through the same shooting policy', () => {
    expect(playableKeyEventType(shotMoment({ interactionType:'shootout', route:'penalty_shootout' }))).toBe('shot');
  });

  it('rejects continuation passes, crosses and final-ball interactions', () => {
    const continuation = shotMoment({ interactionType:'continuation', continuationType:'through_ball' });
    expect(playableKeyEventType(continuation)).toBeNull();
    expect(evaluatePlayableMomentSelection({ moment:continuation, session:session() })).toEqual({
      selected:false,
      reason:'event_type_disabled',
      probability:0,
      roll:1,
    });
  });

  it('rejects contact and defending interactions even when they carry shooter context', () => {
    const contact = shotMoment({ interactionType:'contact', contactType:'tackle' });
    expect(playableKeyEventType(contact)).toBeNull();
    expect(evaluatePlayableMomentSelection({ moment:contact, session:session() }).reason).toBe('event_type_disabled');
  });

  it('does not reinterpret generic non-shooting actions as key events', () => {
    expect(playableKeyEventType({ mode:'attack', phase:50, actorId:'home-cm', route:'circulation' })).toBeNull();
  });
});
