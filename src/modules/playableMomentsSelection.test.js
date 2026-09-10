import { describe, expect, it } from 'vitest';
import {
  createPlayableMatchSession,
  evaluatePlayableMomentSelection,
  playableMatchImportance,
} from './playableMomentsCareer.js';

function liveState() {
  return {
    matchEngineVersion:1,
    actionResolverVersion:2,
    actionLedgerVersion:1,
    rngPacketVersion:1,
    hFitness:new Map(),
    aFitness:new Map(),
    hActive:[],
    aActive:[],
    hBenchLeft:[],
    aBenchLeft:[],
    hGoals:1,
    aGoals:1,
    hPhases:70,
    aPhases:70,
    hSubsLeft:3,
    aSubsLeft:3,
    actionLedger:[],
    seed:1,
    rngState:1,
  };
}

function session(event) {
  return createPlayableMatchSession({
    slotId:'career_a',
    event,
    userTeamId:'home',
    userIsHome:true,
    liveState:liveState(),
  });
}

function moment() {
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
    defenderId:null,
    route:'pass_into_space',
    xg:.22,
    geometry:{ coordinateSystem:'goal-facing-v1' },
  };
}

describe('Phase 2 playable moment importance and pacing', () => {
  it('orders scheduled match importance without inspecting a football outcome', () => {
    const ordinaryLeague = playableMatchImportance({ type:'league', gw:12 });
    const lateLeague = playableMatchImportance({ type:'league', gw:36 });
    const roundOf16 = playableMatchImportance({ type:'cup', roundName:'Round of 16' });
    const quarterFinal = playableMatchImportance({ type:'cup', roundName:'Quarter-final' });
    const semiFinal = playableMatchImportance({ type:'cup', roundName:'Semi-final' });
    const final = playableMatchImportance({ type:'cup', roundName:'Final' });

    expect(ordinaryLeague).toBe(0);
    expect(lateLeague).toBeGreaterThan(ordinaryLeague);
    expect(roundOf16).toBeGreaterThan(lateLeague);
    expect(quarterFinal).toBeGreaterThan(roundOf16);
    expect(semiFinal).toBeGreaterThan(quarterFinal);
    expect(final).toBeGreaterThan(semiFinal);
    expect(final).toBeLessThanOrEqual(.11);
  });

  it('raises selection probability for an important scheduled match while remaining pre-finish only', () => {
    const league = session({ type:'league', gw:12, fixtureId:'league-fixture', userIsHome:true });
    const final = session({ type:'cup', cupId:'fa_cup', gw:37, roundName:'Final', opponentId:'away', userIsHome:true });
    const candidate = moment();

    const leagueSelection = evaluatePlayableMomentSelection({ moment:candidate, session:league, liveState:liveState() });
    const finalSelection = evaluatePlayableMomentSelection({
      moment:{ ...candidate, imaginaryWouldHaveBeenFinish:'goal', packet:{ shot:0, finish:0 } },
      session:{ ...final, imaginaryAutoResult:'loss' },
      liveState:liveState(),
    });

    expect(finalSelection.probability).toBeGreaterThan(leagueSelection.probability);
    const finalWithoutOutcomeNoise = evaluatePlayableMomentSelection({ moment:candidate, session:final, liveState:liveState() });
    expect(finalSelection.probability).toBe(finalWithoutOutcomeNoise.probability);
  });
});
