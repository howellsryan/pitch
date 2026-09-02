import { describe, expect, it } from 'vitest';

import { CUP_META, cupRunStageLabel, cupRunStatusLabel, describeCupResult } from './cups.js';
import { updateLeaguePhaseCupState } from './gameweek.js';
import { buildLeaguePhaseState } from './competitionRules.js';

// The reported symptom was a UCL league-phase win rendering as
// "undefined: L vs Lille (2-1)": the stored row carries isLeaguePhaseMatchday
// (not isUCLMatchday), a result letter (not userWon) and no roundName at all.
describe('cup result labelling', () => {
  function leaguePhaseWin() {
    const state = { leaguePhase:buildLeaguePhaseState('ucl', []), results:[] };
    const next = updateLeaguePhaseCupState('ucl', state, {
      cupId:'ucl', matchday:1, opponentName:'Lille', userGoals:2, oppGoals:1, result:'W', userIsHome:true,
    }, 'user');
    return next.results.at(-1);
  }

  it('labels a stored league-phase win as a win, at the right stage', () => {
    const described = describeCupResult(leaguePhaseWin(), 'ucl');
    expect(described.outcome).toBe('W');
    expect(described.won).toBe(true);
    expect(described.stage).toBe('League Phase · MD1');
    expect(described.label).toBe('League Phase · MD1: W vs Lille (2-1) [3 pts]');
    expect(described.label).not.toContain('undefined');
  });

  it('keeps a league-phase draw distinct from a loss', () => {
    const state = { leaguePhase:buildLeaguePhaseState('uel', []), results:[] };
    const next = updateLeaguePhaseCupState('uel', state, {
      cupId:'uel', matchday:1, opponentName:'Roma', userGoals:1, oppGoals:1, result:'D', userIsHome:false,
    }, 'user');
    const described = describeCupResult(next.results.at(-1), 'uel');
    expect(described.outcome).toBe('D');
    expect(described.won).toBe(false);
    expect(described.label).toBe('League Phase · MD1: D vs Roma (1-1) [1 pts]');
  });

  it('still labels a knockout row from its own round name and userWon flag', () => {
    const described = describeCupResult({
      cupId:'fa_cup', roundName:'Quarter-Final', userWon:true, userGoals:3, oppGoals:0, opponentName:'Everton',
    }, 'fa_cup');
    expect(described.stage).toBe('Quarter-Final');
    expect(described.label).toBe('Quarter-Final: W vs Everton (3-0)');
  });

  it('calls a level first leg a draw, not a loss', () => {
    // simulateCupRound sets userWon from the score alone on a two-legged first
    // leg, so reading userWon there turned an honest 1-1 into an "L".
    const described = describeCupResult({
      cupId:'ucl', roundName:'R16 (Leg 1)', userWon:false, userGoals:1, oppGoals:1, opponentName:'Lille',
    }, 'ucl');
    expect(described.outcome).toBe('D');
    expect(described.label).toBe('R16 (Leg 1): D vs Lille (1-1)');
  });

  it('lets the aggregate verdict outrank the score on the night', () => {
    // 3-0 away, then 0-1 at home: lost the leg, won the tie.
    const described = describeCupResult({
      cupId:'ucl', roundName:'QF (Leg 2)', userWon:true, userGoals:0, oppGoals:1,
      aggregate:{ userWon:true }, opponentName:'Bayern',
    }, 'ucl');
    expect(described.outcome).toBe('W');
    expect(described.won).toBe(true);
  });

  it('still reads a shootout or aggregate verdict from userWon at a level score', () => {
    expect(describeCupResult({ roundName:'Final', userWon:true, userGoals:1, oppGoals:1, penalties:true, opponentName:'Milan' }).outcome).toBe('W');
    expect(describeCupResult({ roundName:'SF (Leg 2)', userWon:false, userGoals:2, oppGoals:2, aggregate:{ userWon:false }, opponentName:'Ajax' }).outcome).toBe('L');
    expect(describeCupResult({ roundName:'QF', userWon:true, userGoals:0, oppGoals:0, extraTime:true, opponentName:'Porto' }).outcome).toBe('W');
  });

  it('persists a gameweek on league-phase rows so the Home rail can place them', () => {
    const state = { leaguePhase:buildLeaguePhaseState('ucl', []), results:[] };
    const next = updateLeaguePhaseCupState('ucl', state, {
      cupId:'ucl', gameweek:9, matchday:1, opponentName:'Lille', userGoals:2, oppGoals:1, result:'W', userIsHome:true,
    }, 'user');
    expect(next.results.at(-1).gameweek).toBe(9);
  });

  it('offers a compact stage for the narrow Trophies rows', () => {
    const described = describeCupResult(leaguePhaseWin(), 'ucl');
    expect(described.shortStage).toBe('MD1');
    expect(described.shortLabel).toBe('MD1: W vs Lille (2-1) [3 pts]');
    // A knockout row has no shorter honest form, so it keeps its round name.
    const knockout = describeCupResult({ roundName:'Quarter-Final', userWon:true, userGoals:3, oppGoals:0, opponentName:'Everton' });
    expect(knockout.shortStage).toBe('Quarter-Final');
    expect(knockout.shortLabel).toBe(knockout.label);
  });

  it('falls back to the score when a legacy row carries neither flag', () => {
    const described = describeCupResult({ cupId:'league_cup', userGoals:0, oppGoals:2, opponentName:'Leeds' }, 'league_cup');
    expect(described.outcome).toBe('L');
    expect(described.stage).toBe('Cup tie');
  });

  it('does not credit an eliminated club with a knockout round it never reached', () => {
    // finishLeaguePhase stores roundIndex 0 alongside the eliminated route.
    expect(cupRunStageLabel('ucl', {
      leaguePhaseComplete:true,
      roundIndex:0,
      leaguePhase:{ matchday:8, position:30, qualificationRoute:'eliminated' },
    })).toBe('League Phase');

    // A club that actually made the play-off still names it.
    expect(cupRunStageLabel('ucl', {
      leaguePhaseComplete:true,
      roundIndex:0,
      leaguePhase:{ matchday:8, position:14, qualificationRoute:'playoff' },
    })).toBe('Knockout Play-off (Leg 1)');
  });

  it('names the round where a knockout exit actually happened', () => {
    const roundIndex = 2;
    expect(cupRunStatusLabel('fa_cup', { status:'eliminated', roundIndex }))
      .toBe(`Out (${CUP_META.fa_cup.rounds[roundIndex]})`);
  });

  it('reports the league phase as the current stage, not the knockout play-off', () => {
    expect(cupRunStageLabel('ucl', { leaguePhase:{ matchday:3 }, roundIndex:0, leaguePhaseComplete:false }))
      .toBe('League Phase · MD3');
    expect(cupRunStageLabel('ucl', { leaguePhase:{ matchday:8 }, roundIndex:2, leaguePhaseComplete:true }))
      .toBe('R16 (Leg 1)');
    expect(cupRunStageLabel('fa_cup', { roundIndex:0 })).toBeTruthy();
  });
});
