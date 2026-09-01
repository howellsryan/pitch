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
    expect(cups.ucl.leaguePhase.venues).toHaveLength(8);
    expect(cups.ucl.leaguePhase.venues.filter(Boolean)).toHaveLength(4);
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

  it('uses the persisted league-phase venue plan when queueing a matchday', () => {
    const teams = [{ id:'arsenal', name:'Arsenal', league:'Premier League' }];
    const [event] = buildPendingEvents(5, 'arsenal', [], {
      ucl: {
        status:'active',
        leaguePhaseComplete:false,
        leaguePhase:{
          matchday:0,
          venues:[false, true, true, false, true, false, true, false],
          opponents:[{ id:'madrid', name:'Madrid', nation:'ES', strength:90 }],
        },
        results:[],
      },
    }, teams);

    expect(event).toMatchObject({ cupId:'ucl', matchday:1, userIsHome:false, opponentId:'madrid' });
  });

  it('balances pre-P0 league-phase saves across their remaining fixtures', () => {
    const teams = [{ id:'arsenal', name:'Arsenal', league:'Premier League' }];
    const previous = Array.from({ length:7 }, (_, index) => ({
      isLeaguePhaseMatchday:true,
      userIsHome:index < 4,
    }));
    const opponents = Array.from({ length:8 }, (_, index) => ({
      id:`opp_${index}`,
      name:`Opponent ${index}`,
      strength:70,
    }));
    const [event] = buildPendingEvents(19, 'arsenal', [], {
      ucl: {
        status:'active',
        leaguePhaseComplete:false,
        leaguePhase:{ matchday:7, opponents },
        results:previous,
      },
    }, teams);

    expect(event).toMatchObject({ cupId:'ucl', matchday:8, userIsHome:false });
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
    expect(eventFor(3, 4, 30)).toMatchObject({ roundName:'QF (Leg 1)', userIsHome:false });
    expect(eventFor(5, 4, 30)).toMatchObject({ roundName:'QF (Leg 1)', userIsHome:true });
    expect(eventFor(1, 6, 34)).toMatchObject({ roundName:'SF (Leg 1)', userIsHome:false });
    expect(eventFor(3, 6, 34)).toMatchObject({ roundName:'SF (Leg 1)', userIsHome:true });
  });

  it('constrains knockout play-off opponents to the official pairing band', () => {
    const teams = [{ id:'arsenal', name:'Arsenal', league:'Premier League' }];
    const [event] = buildPendingEvents(23, 'arsenal', [], {
      ucl: {
        status:'active',
        leaguePhaseComplete:true,
        roundIndex:0,
        leaguePhase:{ position:9 },
        bracketSeed:9,
        results:[],
      },
    }, teams);

    expect([23, 24]).toContain(event.opponentSeed);
    expect(event.userIsHome).toBe(false);
  });

  it('keeps the same UEFA opponent, seed and reversed venue for leg two', () => {
    const teams = [{ id:'arsenal', name:'Arsenal', league:'Premier League' }];
    const [event] = buildPendingEvents(24, 'arsenal', [], {
      ucl: {
        status:'active',
        leaguePhaseComplete:true,
        roundIndex:1,
        leaguePhase:{ position:9 },
        bracketSeed:9,
        results:[{
          opponentId:'ucl_field_test',
          opponentName:'Seed Test FC',
          opponentSeed:23,
          userIsHome:false,
        }],
      },
    }, teams);

    expect(event).toMatchObject({
      cupId:'ucl',
      roundName:'Knockout Play-off (Leg 2)',
      opponentId:'ucl_field_test',
      opponentName:'Seed Test FC',
      opponentSeed:23,
      userIsHome:true,
    });
  });
});
