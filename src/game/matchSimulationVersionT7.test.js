import { describe, expect, it } from 'vitest';
import {
  MATCH_ENGINE_VERSION,
  buildLiveMatchState,
  finaliseLiveMatch,
  simulateMatchSegment,
} from '../modules/matchEngine.js';
import {
  MATCH_ACTION_LEDGER_VERSION,
  MATCH_ACTION_RESOLVER_VERSION,
  MATCH_RNG_PACKET_VERSION,
} from '../modules/matchActionResolver.js';

const VERSION_FIELDS = [
  'matchEngineVersion',
  'actionResolverVersion',
  'actionLedgerVersion',
  'rngPacketVersion',
];

function player(id, position, rating = 72) {
  return {
    id,
    name:id,
    position,
    teamId:id.split('_')[0],
    attack:rating,
    midfield:rating,
    defence:rating,
    goalkeeping:position === 'GK' ? rating : 20,
    fitness:92,
    inSquad:true,
    injured:false,
    suspended:false,
  };
}

function squad(teamId) {
  const starters = [
    ['gk','GK'],['cb1','CB'],['cb2','CB'],['rb','RB'],['lb','LB'],
    ['cm1','CM'],['cm2','CM'],['cdm','CDM'],['rw','RW'],['lw','LW'],['st','ST'],
  ].map(([id, position]) => player(`${teamId}_${id}`, position, 74));
  const bench = [
    player(`${teamId}_sub_cm`, 'CM', 66),
    player(`${teamId}_sub_st`, 'ST', 67),
    player(`${teamId}_sub_cb`, 'CB', 65),
    player(`${teamId}_sub_gk`, 'GK', 64),
  ];
  return { players:[...starters, ...bench], lineup:starters.map(row => row.id) };
}

function fixture() {
  const home = { id:'h', name:'Home' };
  const away = { id:'a', name:'Away' };
  const h = squad('h');
  const a = squad('a');
  const state = buildLiveMatchState(
    home, away, h.players, a.players,
    '4-3-3', '4-3-3', h.lineup, a.lineup,
    'balanced', 'balanced',
    { seed:77, homeBench:['h_sub_st','h_sub_gk'] },
  );
  return { home, away, state };
}

function expectedVersions() {
  return {
    matchEngineVersion:MATCH_ENGINE_VERSION,
    actionResolverVersion:MATCH_ACTION_RESOLVER_VERSION,
    actionLedgerVersion:MATCH_ACTION_LEDGER_VERSION,
    rngPacketVersion:MATCH_RNG_PACKET_VERSION,
  };
}

describe('T7 match simulation activation boundary', () => {
  it('stamps new states once and preserves the supported tuple while advancing', () => {
    const { home, away, state } = fixture();
    expect(state).toMatchObject(expectedVersions());
    expect(state.hBenchLeft.map(row => row.id)).toEqual(['h_sub_st','h_sub_gk']);

    const { updatedState } = simulateMatchSegment(home, away, state, 1, 8);
    expect(updatedState).toMatchObject(expectedVersions());
  });

  it('rejects partial and unsupported authoritative tuples before advancing or finalising', () => {
    const { home, away, state } = fixture();
    const partial = { ...state };
    delete partial.rngPacketVersion;
    expect(() => simulateMatchSegment(home, away, partial, 1, 1)).toThrow(/incomplete version tuple/i);

    const unsupported = { ...state, matchEngineVersion:MATCH_ENGINE_VERSION + 1 };
    expect(() => simulateMatchSegment(home, away, unsupported, 1, 1)).toThrow(/unsupported match simulation version/i);
    expect(() => finaliseLiveMatch(home, away, unsupported, [])).toThrow(/unsupported match simulation version/i);
  });

  it('keeps a deliberately unversioned legacy/manual state on the compatibility path', () => {
    const { home, away, state } = fixture();
    const legacy = { ...state };
    for (const field of VERSION_FIELDS) delete legacy[field];

    const { updatedState } = simulateMatchSegment(home, away, legacy, 1, 2);
    for (const field of VERSION_FIELDS) expect(updatedState[field]).toBeUndefined();
    expect(updatedState.actionLedger).toHaveLength(2);
  });
});
