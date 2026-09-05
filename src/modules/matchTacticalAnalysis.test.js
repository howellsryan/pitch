import { describe, expect, it } from 'vitest';
import { buildMatchTacticalAnalysis } from './matchTacticalAnalysis.js';

function record(extra = {}) {
  return {
    phase:1,
    minute:1,
    teamId:'home',
    opponentTeamId:'away',
    route:'circulation',
    actorId:'h1',
    targetId:'h2',
    defenderId:'a1',
    outcome:'retain',
    ...extra,
  };
}

const sampleLedger = [
  record({ phase:1, route:'pass_into_space', outcome:'chance_created', shotId:'h9', xg:.31, onTarget:true, finish:'goal' }),
  record({ phase:2, route:'pass_into_space', outcome:'progress' }),
  record({ phase:3, route:'pass_into_space', outcome:'intercepted' }),
  record({ phase:4, route:'carry', outcome:'progress' }),
  record({ phase:5, route:'carry', outcome:'chance_created', shotId:'h8', xg:.18, onTarget:false, finish:'missed' }),
  record({ phase:6, route:'wide_delivery', outcome:'turnover' }),
  record({ phase:7, route:'wide_delivery', outcome:'chance_created', shotId:'h10', xg:.12, onTarget:true, finish:'saved' }),
  record({ phase:8, teamId:'away', opponentTeamId:'home', route:'circulation', outcome:'retain', actorId:'a5', targetId:'a6', defenderId:'h5' }),
  record({ phase:9, teamId:'away', opponentTeamId:'home', route:'direct_pass', outcome:'intercepted', actorId:'a6', targetId:'a9', defenderId:'h4' }),
  record({ phase:10, teamId:'away', opponentTeamId:'home', route:'direct_pass', outcome:'progress', actorId:'a6', targetId:'a9', defenderId:'h4' }),
];

describe('T6 compact tactical analysis', () => {
  it('derives bounded route, chance, shot and turnover facts from the ledger', () => {
    const analysis = buildMatchTacticalAnalysis({ ledger:sampleLedger, homeTeamId:'home', awayTeamId:'away' });

    expect(analysis.version).toBe(1);
    expect(analysis.home.phases).toBe(7);
    expect(analysis.home.shots).toBe(3);
    expect(analysis.home.onTarget).toBe(2);
    expect(analysis.home.goals).toBe(1);
    expect(analysis.home.xG).toBe(.61);
    expect(analysis.home.averageXG).toBe(.2);
    expect(analysis.home.turnoversLost).toBe(2);

    const space = analysis.home.routes.find(route => route.route === 'pass_into_space');
    expect(space).toMatchObject({ attempts:3, successes:2, chances:1, shots:1, goals:1, successRate:67 });
    expect(analysis.home.routes).toHaveLength(5);
    expect(analysis.home.bestRoute.route).toBe('pass_into_space');
  });

  it('produces concise causal observations without exposing internal contest scores', () => {
    const analysis = buildMatchTacticalAnalysis({ ledger:sampleLedger, homeTeamId:'home', awayTeamId:'away' });

    expect(analysis.observations.length).toBeLessThanOrEqual(2);
    expect(analysis.observations.some(item => item.teamId === 'home' && item.text.includes('Passes into space'))).toBe(true);
    expect(JSON.stringify(analysis)).not.toContain('execution');
    expect(JSON.stringify(analysis)).not.toContain('counter');
    expect(JSON.stringify(analysis)).not.toContain('successChance');
  });

  it('is deterministic, finite and non-mutating for sparse or empty ledgers', () => {
    const input = structuredClone(sampleLedger);
    const first = buildMatchTacticalAnalysis({ ledger:sampleLedger, homeTeamId:'home', awayTeamId:'away' });
    const second = buildMatchTacticalAnalysis({ ledger:sampleLedger, homeTeamId:'home', awayTeamId:'away' });
    const empty = buildMatchTacticalAnalysis({ ledger:[], homeTeamId:'home', awayTeamId:'away' });

    expect(first).toEqual(second);
    expect(sampleLedger).toEqual(input);
    expect(empty.home.routes).toHaveLength(5);
    expect(empty.home.shots).toBe(0);
    expect(empty.home.xG).toBe(0);
    expect(empty.observations).toEqual([]);
    expect(Number.isFinite(empty.home.averageXG)).toBe(true);
  });

  it('does not infer a successful route from the final score or unrelated events', () => {
    const ledger = [
      record({ route:'direct_pass', outcome:'intercepted' }),
      record({ phase:2, route:'direct_pass', outcome:'intercepted' }),
      record({ phase:3, route:'direct_pass', outcome:'turnover' }),
    ];
    const analysis = buildMatchTacticalAnalysis({ ledger, homeTeamId:'home', awayTeamId:'away' });

    const direct = analysis.home.routes.find(route => route.route === 'direct_pass');
    expect(direct.successes).toBe(0);
    expect(direct.successRate).toBe(0);
    expect(analysis.home.weakRoute).toMatchObject({ route:'direct_pass', attempts:3, successes:0, successRate:0 });
    expect(analysis.observations[0]).toMatchObject({ teamId:'home', type:'route_struggle', route:'direct_pass' });
  });
});
