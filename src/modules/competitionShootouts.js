import {
  SHOOTOUT_STATE_VERSION,
  createShootoutState,
  runAutomaticShootout,
  shootoutSummary,
} from './matchShootout.js';

/**
 * Phase 7 competition adapter for authoritative penalty shootouts.
 *
 * The match engine has already completed regulation time before this module is
 * called. This adapter owns only the knockout verdict boundary: whether the tie
 * is level, whether penalties are required, and translating the completed
 * per-kick shootout state into the user-oriented cup result consumed by cups.js
 * and gameweek.js. Every kick itself remains owned by matchShootout.js and the
 * existing Phase 4 penalty resolver.
 */

export const COMPETITION_SHOOTOUT_VERSION = 1;

function competitionShootoutNumber(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function userScoreForVenue({ userIsHome, homeGoals, awayGoals }) {
  return {
    userGoals:userIsHome ? competitionShootoutNumber(homeGoals) : competitionShootoutNumber(awayGoals),
    oppGoals:userIsHome ? competitionShootoutNumber(awayGoals) : competitionShootoutNumber(homeGoals),
  };
}

function completedShootoutVerdict({ seed, userTeamId, homeTeamId, awayTeamId, homePlayers, awayPlayers }) {
  const initial = createShootoutState({
    seed,
    homeTeamId,
    awayTeamId,
    homePlayers,
    awayPlayers,
  });
  const state = runAutomaticShootout(initial);
  const summary = shootoutSummary(state);
  if (state.status !== 'complete' || !state.winnerTeamId || summary?.version !== SHOOTOUT_STATE_VERSION) {
    throw new Error('COMPETITION_SHOOTOUT_DID_NOT_COMPLETE');
  }
  return {
    userWon:state.winnerTeamId === userTeamId,
    penalties:true,
    extraTime:true,
    shootout:summary,
  };
}

/**
 * Resolve a newly-versioned knockout result.
 *
 * `previousLeg` is user-oriented (`userGoals` / `oppGoals`). When omitted this
 * is a single-leg tie. `isFirstLeg` deliberately prevents penalties because a
 * level first leg is not a completed tie.
 */
export function resolveVersionedKnockout({
  shootoutVersion,
  seed,
  userTeamId,
  homeTeamId,
  awayTeamId,
  userIsHome,
  homeGoals,
  awayGoals,
  homePlayers = [],
  awayPlayers = [],
  previousLeg = null,
  isFirstLeg = false,
} = {}) {
  if (shootoutVersion !== COMPETITION_SHOOTOUT_VERSION) return null;
  if (!userTeamId || !homeTeamId || !awayTeamId) throw new Error('COMPETITION_SHOOTOUT_TEAMS_REQUIRED');
  if (userTeamId !== homeTeamId && userTeamId !== awayTeamId) throw new Error('COMPETITION_SHOOTOUT_USER_TEAM_INVALID');

  const current = userScoreForVenue({ userIsHome:Boolean(userIsHome), homeGoals, awayGoals });

  if (isFirstLeg) {
    return {
      version:COMPETITION_SHOOTOUT_VERSION,
      userWon:current.userGoals > current.oppGoals,
      penalties:false,
      extraTime:false,
      tieComplete:false,
      userAgg:current.userGoals,
      oppAgg:current.oppGoals,
      shootout:null,
    };
  }

  const priorUser = previousLeg ? competitionShootoutNumber(previousLeg.userGoals) : 0;
  const priorOpp = previousLeg ? competitionShootoutNumber(previousLeg.oppGoals) : 0;
  const userAgg = priorUser + current.userGoals;
  const oppAgg = priorOpp + current.oppGoals;

  if (userAgg > oppAgg) {
    return {
      version:COMPETITION_SHOOTOUT_VERSION,
      userWon:true,
      penalties:false,
      extraTime:false,
      tieComplete:true,
      userAgg,
      oppAgg,
      shootout:null,
    };
  }
  if (oppAgg > userAgg) {
    return {
      version:COMPETITION_SHOOTOUT_VERSION,
      userWon:false,
      penalties:false,
      extraTime:false,
      tieComplete:true,
      userAgg,
      oppAgg,
      shootout:null,
    };
  }

  return {
    version:COMPETITION_SHOOTOUT_VERSION,
    ...completedShootoutVerdict({ seed, userTeamId, homeTeamId, awayTeamId, homePlayers, awayPlayers }),
    tieComplete:true,
    userAgg,
    oppAgg,
  };
}

export function isVersionedShootoutEvent(event) {
  return event?.shootoutVersion === COMPETITION_SHOOTOUT_VERSION;
}
