import { describe, expect, it } from 'vitest';

import { buildEuropeanLeaguePhaseTable } from './worldCompetitions.js';

function worldState(rows, overrides = {}) {
  return {
    competitions:{
      ucl:{
        id:'ucl',
        format:'uefa_league_phase',
        phase:'league_phase',
        leaguePhaseMatchday:3,
        table:rows,
        results:[],
        ...overrides,
      },
    },
  };
}

const field = [
  { teamId:'a', played:3, won:3, drawn:0, lost:0, gf:7, ga:2, gd:5, points:9 },
  { teamId:'b', played:3, won:1, drawn:1, lost:1, gf:4, ga:4, gd:0, points:4 },
  { teamId:'c', played:3, won:0, drawn:1, lost:2, gf:1, ga:6, gd:-5, points:1 },
];

describe('European league-phase table', () => {
  it('reads the canonical world ledger and ranks it', () => {
    const table = buildEuropeanLeaguePhaseTable(worldState(field), 'ucl');
    expect(table.rows.map(row => row.teamId)).toEqual(['a', 'b', 'c']);
    expect(table.rows[0].position).toBe(1);
    expect(table.matchday).toBe(3);
    expect(table.matchdays).toBe(8);
    expect(table.complete).toBe(false);
  });

  it('merges the managed club, whose European run lives in save.cups, not the world field', () => {
    const userCupState = {
      leaguePhase:{ matchday:3, points:7, gf:6, ga:2, gd:4 },
      results:[
        { isLeaguePhaseMatchday:true, userGoals:2, oppGoals:1 },
        { isLeaguePhaseMatchday:true, userGoals:1, oppGoals:1 },
        { isLeaguePhaseMatchday:true, userGoals:3, oppGoals:0 },
      ],
    };
    const table = buildEuropeanLeaguePhaseTable(worldState(field), 'ucl', { userTeamId:'user', userCupState });
    const userRow = table.rows.find(row => row.isUser);

    expect(table.rows).toHaveLength(4);
    expect(userRow).toMatchObject({ teamId:'user', played:3, won:2, drawn:1, lost:0, points:7, gd:4 });
    // 9 points beats 7, so the managed club sits second — never bumped to the top.
    expect(table.rows.map(row => row.teamId)).toEqual(['a', 'user', 'b', 'c']);
    expect(userRow.position).toBe(2);
  });

  it('does not duplicate a managed club that is already in the world field', () => {
    const rows = [...field, { teamId:'user', played:3, won:2, drawn:0, lost:1, gf:5, ga:3, gd:2, points:6 }];
    const table = buildEuropeanLeaguePhaseTable(worldState(rows), 'ucl', {
      userTeamId:'user',
      userCupState:{ leaguePhase:{ matchday:3, points:99, gf:99, ga:0, gd:99 }, results:[] },
    });
    expect(table.rows.filter(row => row.teamId === 'user')).toHaveLength(1);
    expect(table.rows.find(row => row.teamId === 'user').points).toBe(6);
  });

  it('reports the phase as complete once the world state moves to the knockout', () => {
    const table = buildEuropeanLeaguePhaseTable(worldState(field, { phase:'knockout', leaguePhaseMatchday:8 }), 'ucl');
    expect(table.complete).toBe(true);
    expect(table.matchday).toBe(8);
  });

  it('reports the club\'s own confirmed route rather than inferring one from this table', () => {
    // finishLeaguePhase decides the managed club's seeding against its own
    // field, so a high row here must not imply a route it will not get.
    const userCupState = {
      leaguePhaseComplete:true,
      leaguePhase:{ matchday:8, points:7, gf:6, ga:2, gd:4, position:19, qualificationRoute:'playoff' },
      results:[],
    };
    const table = buildEuropeanLeaguePhaseTable(worldState(field), 'ucl', { userTeamId:'user', userCupState });
    // The two rankings are computed against different fields, so once both are
    // settled the table stays the ledger's and the club's finish is reported
    // on its own rather than colliding with a background club's position.
    expect(table.rows.some(row => row.isUser)).toBe(false);
    expect(table.rows.map(row => row.position)).toEqual([1, 2, 3]);
    expect(table.user).toMatchObject({ complete:true, position:19, route:'playoff' });
  });

  it('keeps the ledger\'s own ranking for background clubs once the phase is decided', () => {
    // advanceUefaLeaguePhase stamps positions when it ranks the field; those are
    // what decided who went through, so display order must not renumber them.
    const decided = field.map((row, index) => ({ ...row, position:index * 4 + 1 }));
    const table = buildEuropeanLeaguePhaseTable(worldState(decided, { phase:'knockout', leaguePhaseMatchday:8 }), 'ucl');
    expect(table.rows.map(row => row.position)).toEqual([1, 5, 9]);
  });

  it('never prints the same position twice when a club is merged into a ranked ledger', () => {
    // A resumed career can meet a ledger that has already stamped positions
    // while its own league phase is unsettled; the two numbering sources must
    // not be mixed, or two rows land on the same qualification band.
    const stamped = field.map((row, index) => ({ ...row, position:index + 1 }));
    const table = buildEuropeanLeaguePhaseTable(worldState(stamped), 'ucl', {
      userTeamId:'user',
      userCupState:{ leaguePhase:{ matchday:3, points:5, gf:4, ga:4, gd:0 }, results:[] },
    });
    const positions = table.rows.map(row => row.position);
    expect(new Set(positions).size).toBe(positions.length);
    expect(positions).toEqual([1, 2, 3, 4]);
  });

  it('leaves the route unstated while the phase is still being played', () => {
    const userCupState = { leaguePhase:{ matchday:3, points:7, gf:6, ga:2, gd:4 }, results:[] };
    const table = buildEuropeanLeaguePhaseTable(worldState(field), 'ucl', { userTeamId:'user', userCupState });
    expect(table.user).toMatchObject({ complete:false, position:null, route:null });
  });

  it('does not treat a completed phase with no stored position as settled', () => {
    // Number(null) is 0, which is finite — the old guard called this settled,
    // dropped the club from the table and reported it as finishing 0th.
    const table = buildEuropeanLeaguePhaseTable(worldState(field), 'ucl', {
      userTeamId:'user',
      userCupState:{
        leaguePhaseComplete:true,
        leaguePhase:{ matchday:8, points:7, gf:6, ga:2, gd:4, position:null, qualificationRoute:null },
        results:[],
      },
    });
    expect(table.rows.some(row => row.isUser)).toBe(true);
    expect(table.user.position).toBeNull();
  });

  it('never exceeds the competition\'s own field size when merging the club in', () => {
    const full = Array.from({ length:36 }, (_, i) => ({
      teamId:`w${i}`, played:8, won:8 - i % 8, drawn:0, lost:i % 8,
      gf:20 - i, ga:i, gd:20 - i * 2, points:24 - i % 9 * 3,
    }));
    const table = buildEuropeanLeaguePhaseTable(worldState(full), 'ucl', {
      userTeamId:'user',
      userCupState:{ leaguePhase:{ matchday:8, points:12, gf:10, ga:8, gd:2 }, results:[] },
    });
    expect(table.rows).toHaveLength(36);
    expect(table.rows.some(row => row.isUser)).toBe(true);
  });

  it('returns null for a competition the world state does not run', () => {
    expect(buildEuropeanLeaguePhaseTable(worldState(field), 'fa_cup')).toBeNull();
    expect(buildEuropeanLeaguePhaseTable(null, 'ucl')).toBeNull();
    expect(buildEuropeanLeaguePhaseTable(worldState([]), 'ucl')).toBeNull();
  });
});
