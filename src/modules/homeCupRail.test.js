import { describe, expect, it } from 'vitest';

import { upcomingCupFixtures } from './cups.js';
import { getCompetitionRules } from './competitionRules.js';

// The Home rail was built from league fixtures only, so a manager in Europe or
// still in a domestic cup saw nothing about those ties on the season rail.
describe('upcoming cup fixtures on the home rail', () => {
  it('schedules league-phase matchdays on the same gameweeks the event queue uses', () => {
    const cups = {
      ucl:{ status:'active', leaguePhaseComplete:false, leaguePhase:{ matchday:2, opponents:[
        { name:'A' }, { name:'B' }, { name:'Lille' }, { name:'D' },
      ] } },
    };
    const rows = upcomingCupFixtures(cups, 9, { limit:3 });
    const gws = getCompetitionRules('ucl').leaguePhase.gws;

    expect(rows.map(row => row.gameweek)).toEqual(gws.slice(2, 5));
    expect(rows[0]).toMatchObject({ cupId:'ucl', leaguePhase:true, stage:'League Phase · MD3', opponentName:'Lille' });
  });

  it('skips matchdays already played and gameweeks already gone', () => {
    const cups = { ucl:{ status:'active', leaguePhaseComplete:false, leaguePhase:{ matchday:6, opponents:[] } } };
    const rows = upcomingCupFixtures(cups, 18, { limit:8 });
    expect(rows).toHaveLength(1);
    // MD7 is scheduled for GW17, which has already gone; only MD8 (GW19) is left.
    expect(rows[0].stage).toBe('League Phase · MD8');
    expect(rows[0].gameweek).toBe(19);
    expect(rows[0].opponentName).toBeNull();
  });

  it('reports an undrawn knockout round as undecided rather than inventing an opponent', () => {
    const cups = { fa_cup:{ status:'active', roundIndex:0 } };
    const rows = upcomingCupFixtures(cups, 1, { limit:4 });
    expect(rows).toHaveLength(1);
    expect(rows[0].opponentName).toBeNull();
    expect(rows[0].leaguePhase).toBe(false);
    expect(rows[0].stage).toBeTruthy();
  });

  it('names the opponent for the current gameweek from the live event queue', () => {
    const cups = { fa_cup:{ status:'active', roundIndex:0 } };
    const gameweek = upcomingCupFixtures(cups, 1, { limit:1 })[0].gameweek;
    const rows = upcomingCupFixtures(cups, gameweek, {
      limit:1,
      pendingEvents:[{ type:'cup', cupId:'fa_cup', opponentName:'Everton', userIsHome:true }],
    });
    expect(rows[0]).toMatchObject({ opponentName:'Everton', userIsHome:true });
  });

  it('ignores competitions the manager is out of, and sorts what remains by gameweek', () => {
    const cups = {
      fa_cup:{ status:'eliminated', roundIndex:2 },
      league_cup:{ status:'active', roundIndex:0 },
      ucl:{ status:'active', leaguePhaseComplete:false, leaguePhase:{ matchday:0, opponents:[] } },
    };
    const rows = upcomingCupFixtures(cups, 1, { limit:10 });
    expect(rows.some(row => row.cupId === 'fa_cup')).toBe(false);
    expect(rows).toEqual([...rows].sort((a, b) => a.gameweek - b.gameweek));
  });

  it('returns nothing for a manager with no cup state at all', () => {
    expect(upcomingCupFixtures(null, 4)).toEqual([]);
    expect(upcomingCupFixtures({}, 4)).toEqual([]);
  });
});
