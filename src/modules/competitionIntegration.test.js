import { describe, expect, it } from 'vitest';

import {
  buildInitialCupState,
  simulateEuropeanLeaguePhaseMatchday,
  simulateUCLMatchday,
} from './cups.js';
import { buildPendingEvents } from './gameweek.js';

describe('P0 competition integration contract', () => {
  it('enters Championship clubs into the FA Cup third round', () => {
    const cups = buildInitialCupState(['fa_cup', 'league_cup'], 'burnley', 'Championship');
    expect(cups.fa_cup.roundIndex).toBe(2);
  });

  it('creates the configured UCL league phase instead of a legacy group stage', () => {
    const cups = buildInitialCupState(['ucl'], 'arsenal', 'Premier League');
    expect(cups.ucl.leaguePhaseComplete).toBe(false);
    expect(cups.ucl.leaguePhase.opponents).toHaveLength(8);
    expect(cups.ucl.leaguePhase.matchday).toBe(0);
  });

  it('returns the full generic UEFA matchday shape for a forced home fixture', () => {
    const userTeam = { id:'arsenal', name:'Arsenal', crest:'A', reputation:85 };
    const userPlayers = [];
    const cups = buildInitialCupState(['ucl'], userTeam.id, 'Premier League');
    const result = simulateEuropeanLeaguePhaseMatchday(
      'ucl', userTeam, userPlayers, cups.ucl, 'balanced', true, new Map(),
    );

    expect(result).toMatchObject({ cupId:'ucl', userIsHome:true, matchday:1 });
    expect(result.stats).toBeTruthy();
    expect(Array.isArray(result.events)).toBe(true);
    expect(Array.isArray(result.fitnessUpdates)).toBe(true);
  });

  it('keeps the UCL compatibility wrapper on the same generic league-phase result contract', () => {
    const userTeam = { id:'arsenal', name:'Arsenal', crest:'A', reputation:85 };
    const cups = buildInitialCupState(['ucl'], userTeam.id, 'Premier League');
    const result = simulateUCLMatchday(userTeam, [], cups.ucl, 'balanced', false, new Map());

    expect(result).toMatchObject({ cupId:'ucl', userIsHome:false, matchday:1 });
    expect(result).toHaveProperty('stats');
    expect(result).toHaveProperty('events');
    expect(result).toHaveProperty('fitnessUpdates');
  });

  it('uses league-phase seeding when knockout events choose first-leg venues', () => {
    const teams = [{ id:'arsenal', name:'Arsenal', league:'Premier League' }];
    const eventFor = (position, roundIndex, gw) => buildPendingEvents(gw, 'arsenal', [], {
      ucl: {
        status:'active',
        leaguePhaseComplete:true,
        roundIndex,
        leaguePhase:{ position },
        results:[],
      },
    }, teams).find(event => event.cupId === 'ucl');

    expect(eventFor(9, 0, 23)).toMatchObject({ roundName:'Knockout Play-off (Leg 1)', userIsHome:false });
    expect(eventFor(17, 0, 23)).toMatchObject({ roundName:'Knockout Play-off (Leg 1)', userIsHome:true });
    expect(eventFor(1, 2, 26)).toMatchObject({ roundName:'R16 (Leg 1)', userIsHome:false });
    expect(eventFor(17, 2, 26)).toMatchObject({ roundName:'R16 (Leg 1)', userIsHome:true });
  });

  it('keeps the same UEFA opponent and reverses venue for leg two', () => {
    const teams = [{ id:'arsenal', name:'Arsenal', league:'Premier League' }];
    const [event] = buildPendingEvents(24, 'arsenal', [], {
      ucl: {
        status:'active',
        leaguePhaseComplete:true,
        roundIndex:1,
        leaguePhase:{ position:9 },
        results:[{
          opponentId:'ucl_field_test',
          opponentName:'Seed Test FC',
          userIsHome:false,
        }],
      },
    }, teams);

    expect(event).toMatchObject({
      cupId:'ucl',
      roundName:'Knockout Play-off (Leg 2)',
      opponentId:'ucl_field_test',
      opponentName:'Seed Test FC',
      userIsHome:true,
    });
  });
});
