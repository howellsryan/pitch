import { isTwoLegRound } from './competitionRules.js';
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

function previousTwoLegResult(cupState) {
  const results = cupState?.results ?? [];
  return results.length ? results[results.length - 1] : null;
}

/**
 * Compute the pre-shootout knockout context without resolving a kick.
 *
 * This is shared by Quick Sim, Watch Match and Play Key Moments so every route
 * agrees on whether a completed tie actually needs penalties. A level first
 * leg deliberately stays unresolved. Newly-versioned ties never use away goals.
 */
export function buildVersionedKnockoutContext({
  shootoutVersion,
  cupId,
  roundName,
  cupState = null,
  userIsHome,
  homeGoals,
  awayGoals,
} = {}) {
  if (shootoutVersion !== COMPETITION_SHOOTOUT_VERSION) return null;
  const current = userScoreForVenue({ userIsHome:Boolean(userIsHome), homeGoals, awayGoals });
  const firstLeg = isTwoLegRound(cupId, roundName, 1);
  const secondLeg = isTwoLegRound(cupId, roundName, 2);

  if (firstLeg) {
    return {
      version:COMPETITION_SHOOTOUT_VERSION,
      firstLeg:true,
      secondLeg:false,
      tieComplete:false,
      requiresShootout:false,
      userWon:current.userGoals > current.oppGoals,
      userAgg:current.userGoals,
      oppAgg:current.oppGoals,
      previousLeg:null,
    };
  }

  const previousLeg = secondLeg ? previousTwoLegResult(cupState) : null;
  const priorUser = previousLeg ? competitionShootoutNumber(previousLeg.userGoals) : 0;
  const priorOpp = previousLeg ? competitionShootoutNumber(previousLeg.oppGoals) : 0;
  const userAgg = priorUser + current.userGoals;
  const oppAgg = priorOpp + current.oppGoals;

  return {
    version:COMPETITION_SHOOTOUT_VERSION,
    firstLeg:false,
    secondLeg,
    tieComplete:true,
    requiresShootout:userAgg === oppAgg,
    userWon:userAgg > oppAgg,
    userAgg,
    oppAgg,
    previousLeg,
  };
}

export function createVersionedShootoutState({
  shootoutVersion,
  seed,
  userTeamId,
  homeTeamId,
  awayTeamId,
  homePlayers = [],
  awayPlayers = [],
} = {}) {
  if (shootoutVersion !== COMPETITION_SHOOTOUT_VERSION) return null;
  if (!userTeamId || !homeTeamId || !awayTeamId) throw new Error('COMPETITION_SHOOTOUT_TEAMS_REQUIRED');
  if (userTeamId !== homeTeamId && userTeamId !== awayTeamId) throw new Error('COMPETITION_SHOOTOUT_USER_TEAM_INVALID');
  return createShootoutState({ seed, homeTeamId, awayTeamId, homePlayers, awayPlayers });
}

function completedShootoutVerdict({ shootoutVersion, seed, userTeamId, homeTeamId, awayTeamId, homePlayers, awayPlayers }) {
  const initial = createVersionedShootoutState({
    shootoutVersion,
    seed,
    userTeamId,
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
 * Resolve a newly-versioned knockout result automatically.
 *
 * Callers that need interactive kicks use buildVersionedKnockoutContext() and
 * createVersionedShootoutState() instead, then persist/resolve the same state
 * kick-by-kick. Old/unversioned pending events return null and retain the legacy
 * competition resolver so existing saves remain readable.
 */
export function resolveVersionedKnockout({
  shootoutVersion,
  seed,
  cupId,
  roundName,
  cupState = null,
  userTeamId,
  homeTeamId,
  awayTeamId,
  userIsHome,
  homeGoals,
  awayGoals,
  homePlayers = [],
  awayPlayers = [],
  // Compatibility inputs retained for the initial 7B adapter tests. New callers
  // should pass cupId/roundName/cupState so first/second-leg ownership is shared.
  previousLeg = undefined,
  isFirstLeg = undefined,
} = {}) {
  if (shootoutVersion !== COMPETITION_SHOOTOUT_VERSION) return null;
  if (!userTeamId || !homeTeamId || !awayTeamId) throw new Error('COMPETITION_SHOOTOUT_TEAMS_REQUIRED');
  if (userTeamId !== homeTeamId && userTeamId !== awayTeamId) throw new Error('COMPETITION_SHOOTOUT_USER_TEAM_INVALID');

  let context;
  if (isFirstLeg !== undefined || previousLeg !== undefined) {
    const current = userScoreForVenue({ userIsHome:Boolean(userIsHome), homeGoals, awayGoals });
    if (isFirstLeg) {
      context = {
        version:COMPETITION_SHOOTOUT_VERSION,
        firstLeg:true,
        secondLeg:false,
        tieComplete:false,
        requiresShootout:false,
        userWon:current.userGoals > current.oppGoals,
        userAgg:current.userGoals,
        oppAgg:current.oppGoals,
        previousLeg:null,
      };
    } else {
      const priorUser = previousLeg ? competitionShootoutNumber(previousLeg.userGoals) : 0;
      const priorOpp = previousLeg ? competitionShootoutNumber(previousLeg.oppGoals) : 0;
      const userAgg = priorUser + current.userGoals;
      const oppAgg = priorOpp + current.oppGoals;
      context = {
        version:COMPETITION_SHOOTOUT_VERSION,
        firstLeg:false,
        secondLeg:Boolean(previousLeg),
        tieComplete:true,
        requiresShootout:userAgg === oppAgg,
        userWon:userAgg > oppAgg,
        userAgg,
        oppAgg,
        previousLeg:previousLeg ?? null,
      };
    }
  } else {
    context = buildVersionedKnockoutContext({
      shootoutVersion,
      cupId,
      roundName,
      cupState,
      userIsHome,
      homeGoals,
      awayGoals,
    });
  }

  if (!context.tieComplete) {
    return {
      ...context,
      penalties:false,
      extraTime:false,
      shootout:null,
    };
  }
  if (!context.requiresShootout) {
    return {
      ...context,
      penalties:false,
      extraTime:false,
      shootout:null,
    };
  }

  return {
    ...context,
    ...completedShootoutVerdict({
      shootoutVersion,
      seed,
      userTeamId,
      homeTeamId,
      awayTeamId,
      homePlayers,
      awayPlayers,
    }),
  };
}

export function isVersionedShootoutEvent(event) {
  return event?.shootoutVersion === COMPETITION_SHOOTOUT_VERSION;
}
