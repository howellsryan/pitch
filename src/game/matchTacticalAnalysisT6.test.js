import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import {
  buildLiveMatchState,
  finaliseLiveMatch,
  simulateMatch,
  simulateMatchSegment,
} from '../modules/matchEngine.js';

const positions = ['GK','RB','CB','CB','LB','CM','CDM','CM','RW','ST','LW','ST','CM','CB'];

function squad(prefix) {
  return positions.map((position, index) => ({
    id:`${prefix}${index}`,
    name:`${prefix.toUpperCase()} ${index}`,
    teamId:prefix,
    position,
    age:25,
    attack:position === 'GK' ? 10 : 78,
    midfield:position === 'GK' ? 10 : 78,
    defence:position === 'GK' ? 10 : 76,
    goalkeeping:position === 'GK' ? 80 : 10,
    fitness:100,
    form:50,
    individualMorale:50,
    sharpness:50,
    injured:false,
    inSquad:true,
    traits:[],
    attributeProfile:{
      version:1,
      pace:position === 'GK' ? 45 : 78,
      shooting:position === 'GK' ? 20 : 77,
      passing:position === 'GK' ? 55 : 80,
      dribbling:position === 'GK' ? 35 : 79,
      defending:position === 'GK' ? 35 : 75,
      physical:78,
    },
  }));
}

function managedTeam() {
  return {
    id:'h',
    name:'Managed',
    reputation:78,
    tacticalPlan:{ source:'user', instructions:{} },
  };
}

const awayTeam = { id:'a', name:'Opponent', reputation:76 };

function cloneSquad(rows) {
  return rows.map(player => ({ ...player, attributeProfile:{ ...player.attributeProfile } }));
}

function segmentedResult(seed, segmentSize = 7) {
  const home = managedTeam();
  const homePlayers = cloneSquad(squad('h'));
  const awayPlayers = cloneSquad(squad('a'));
  let state = buildLiveMatchState(
    home, awayTeam, homePlayers, awayPlayers,
    '4-3-3', '4-3-3', null, null, 'balanced', 'balanced', { seed },
  );
  const events = [];
  for (let start = 1; start <= 120; start += segmentSize) {
    const end = Math.min(120, start + segmentSize - 1);
    const segment = simulateMatchSegment(home, awayTeam, state, start, end, home.id);
    state = segment.updatedState;
    events.push(...segment.segEvents);
  }
  return finaliseLiveMatch(home, awayTeam, state, events);
}

describe('T6 tactical-analysis result integration', () => {
  it.each([1, 7, 10, 30, 120])('keeps Quick Sim and segmented Watch analysis identical at %s-phase segments', segmentSize => {
    const seed = 6060;
    const quick = simulateMatch(
      managedTeam(), awayTeam,
      cloneSquad(squad('h')), cloneSquad(squad('a')),
      '4-3-3', '4-3-3', null, null, 'balanced', 'balanced', { seed },
    );
    const watched = segmentedResult(seed, segmentSize);

    expect(watched.homeGoals).toBe(quick.homeGoals);
    expect(watched.awayGoals).toBe(quick.awayGoals);
    expect(watched.stats).toEqual(quick.stats);
    expect(watched.tacticalAnalysis).toEqual(quick.tacticalAnalysis);
    expect(quick.tacticalAnalysis?.version).toBe(1);
    expect(quick).not.toHaveProperty('actionLedger');
  });

  it('keeps managed tactical analysis compact instead of retaining the authoritative ledger', () => {
    const result = simulateMatch(
      managedTeam(), awayTeam,
      cloneSquad(squad('h')), cloneSquad(squad('a')),
      '4-3-3', '4-3-3', null, null, 'balanced', 'balanced', { seed:6062 },
    );

    expect(result).not.toHaveProperty('actionLedger');
    expect(result.tacticalAnalysis?.version).toBe(1);
    expect(Buffer.byteLength(JSON.stringify(result.tacticalAnalysis), 'utf8')).toBeLessThan(12_000);
  });

  it('does not build user-facing tactical analysis for an AI-v-AI background result', () => {
    const result = simulateMatch(
      { id:'h', name:'Home AI', reputation:75 },
      { id:'a', name:'Away AI', reputation:75 },
      cloneSquad(squad('h')), cloneSquad(squad('a')),
      '4-3-3', '4-3-3', null, null, 'balanced', 'balanced', { seed:6061 },
    );

    expect(result.tacticalAnalysis).toBeNull();
  });
});
