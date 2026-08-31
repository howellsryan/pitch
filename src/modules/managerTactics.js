import { createUserTacticalPlan, updateManagerDNA } from './tactics.js';

/**
 * Manager-facing P2 adapters. Keep persistent career state in save while
 * presenting the match engine with transient team/player tactical context.
 */
export function decorateManagedTeam(team, save) {
  if (!team) return team;
  return {
    ...team,
    tacticalPlan:createUserTacticalPlan(save?.tactics?.instructions ?? save?.tactics ?? {}),
  };
}

export function decorateManagedPlayers(players, save) {
  const roles = save?.playerRoles ?? {};
  return (players ?? []).map(player => ({
    ...player,
    tacticalRole:roles[player.id] ?? null,
  }));
}

function userOutcome(result, userTeamId, userIsHome) {
  if (!result) return 'draw';
  const isHome = typeof userIsHome === 'boolean'
    ? userIsHome
    : result.homeTeamId === userTeamId;
  const userGoals = Number(isHome ? result.homeGoals : result.awayGoals);
  const oppGoals = Number(isHome ? result.awayGoals : result.homeGoals);
  if (!Number.isFinite(userGoals) || !Number.isFinite(oppGoals)) return 'draw';
  return userGoals > oppGoals ? 'win' : userGoals < oppGoals ? 'loss' : 'draw';
}

function userPossession(result, userTeamId, userIsHome) {
  const possession = result?.stats?.possession;
  if (!possession) return 50;
  const isHome = typeof userIsHome === 'boolean'
    ? userIsHome
    : result.homeTeamId === userTeamId;
  return Number(isHome ? possession.home : possession.away) || 50;
}

function managerFingerprint(save, event) {
  const eventKey = event?.fixtureId
    ?? [event?.cupId, event?.roundName ?? event?.matchday ?? '', event?.opponentId ?? event?.opponentName ?? event?.oppName ?? ''].join(':');
  return [save?.season ?? '', event?.gw ?? save?.currentGameweek ?? '', event?.type ?? 'match', eventKey].join('|');
}

export function buildManagerDNASample(save, result, event, userIsHome, userPlayers = []) {
  const selected = new Set(save?.lineup ?? []);
  const youthStarts = userPlayers.filter(player => (
    selected.has(player.id) && (player.isYouth === true || Number(player.age ?? 99) <= 21)
  )).length;

  return {
    fingerprint:managerFingerprint(save, event),
    formation:save?.formation ?? '4-3-3',
    mentality:save?.mentality ?? 'balanced',
    instructions:save?.tactics?.instructions ?? save?.tactics ?? {},
    outcome:userOutcome(result, save?.userTeamId, userIsHome),
    possession:userPossession(result, save?.userTeamId, userIsHome),
    youthStarts,
  };
}

export function applyManagerDNAResult(save, result, event, userIsHome, userPlayers = []) {
  if (!save || !result) return save;
  return {
    ...save,
    managerDNA:updateManagerDNA(
      save.managerDNA,
      buildManagerDNASample(save, result, event, userIsHome, userPlayers),
    ),
  };
}
