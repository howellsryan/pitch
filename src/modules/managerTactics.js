import { buildSquadAwareAITacticalProfile } from './aiTacticalIdentity.js';
import {
  buildOppositionInsight,
  createUserTacticalPlan,
  updateManagerDNA,
} from './tactics.js';

/**
 * Manager-facing P2/T5 adapters. Keep persistent career state in save while
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

/**
 * Build the exact user-controlled side inputs expected by matchEngine.js.
 *
 * The AI side deliberately leaves formation/mentality undefined so the
 * authoritative engine resolves its squad-aware tactical identity. Both Quick
 * Sim and Watch use this contract rather than inventing presentation defaults.
 */
export function buildManagedMatchInputs({
  save,
  homeTeam,
  awayTeam,
  homePlayers = [],
  awayPlayers = [],
  userIsHome,
  overrideFormation = null,
} = {}) {
  const userFormation = overrideFormation ?? save?.formation ?? '4-3-3';
  const userMentality = save?.mentality ?? 'balanced';
  const userLineup = save?.lineup ?? null;

  return {
    homeTeam:userIsHome ? decorateManagedTeam(homeTeam, save) : homeTeam,
    awayTeam:userIsHome ? awayTeam : decorateManagedTeam(awayTeam, save),
    homePlayers:userIsHome ? decorateManagedPlayers(homePlayers, save) : homePlayers,
    awayPlayers:userIsHome ? awayPlayers : decorateManagedPlayers(awayPlayers, save),
    homeFormation:userIsHome ? userFormation : undefined,
    awayFormation:userIsHome ? undefined : userFormation,
    homeLineup:userIsHome ? userLineup : null,
    awayLineup:userIsHome ? null : userLineup,
    homeMentality:userIsHome ? userMentality : undefined,
    awayMentality:userIsHome ? undefined : userMentality,
  };
}

function opponentEvidenceLevel(opponentPlayers = [], form = []) {
  const knownSquad = (opponentPlayers ?? []).filter(player => (
    player && player.inSquad !== false && !String(player.id ?? '').includes('_stub_')
  )).length;
  const recentResults = (form ?? []).filter(Boolean).length;
  if (knownSquad >= 11 && recentResults >= 3) return 'established';
  if (knownSquad >= 11 || recentResults >= 2) return 'partial';
  return 'limited';
}

function coarseOpponentInsight(insight, evidence) {
  if (evidence === 'established') return { ...insight, confidence:'Established' };
  const qualifier = evidence === 'partial' ? 'Likely' : 'Possible';
  return {
    ...insight,
    confidence:evidence === 'partial' ? 'Partial' : 'Limited',
    threat:`${qualifier}: ${insight.threat}`,
    weakness:`${qualifier}: ${insight.weakness}`,
  };
}

/**
 * Team News projection for the same squad-aware AI identity the match engine
 * will use. Selection diagnostics stay private: the manager-facing surface gets
 * only the chosen public profile plus coarse, evidence-qualified insight.
 */
export function buildOpponentTacticalInsight({
  opponentTeam,
  userTeam,
  userIsHome,
  opponentPlayers = [],
  form = [],
  keyPlayer = null,
} = {}) {
  const { profile } = buildSquadAwareAITacticalProfile({
    team:opponentTeam,
    opponent:userTeam,
    isHome:!userIsHome,
    players:opponentPlayers,
  });
  const insight = buildOppositionInsight({ team:opponentTeam, profile, form, keyPlayer });
  return {
    profile,
    insight:coarseOpponentInsight(insight, opponentEvidenceLevel(opponentPlayers, form)),
  };
}

function userIsHomeForResult(result, userTeamId, explicitUserIsHome) {
  return typeof explicitUserIsHome === 'boolean'
    ? explicitUserIsHome
    : result?.homeTeamId === userTeamId;
}

function userOutcome(result, userTeamId, userIsHome) {
  if (!result) return 'draw';
  const isHome = userIsHomeForResult(result, userTeamId, userIsHome);
  const userGoals = Number(isHome ? result.homeGoals : result.awayGoals);
  const oppGoals = Number(isHome ? result.awayGoals : result.homeGoals);
  if (!Number.isFinite(userGoals) || !Number.isFinite(oppGoals)) return 'draw';
  return userGoals > oppGoals ? 'win' : userGoals < oppGoals ? 'loss' : 'draw';
}

function userPossession(result, userTeamId, userIsHome) {
  const possession = result?.stats?.possession;
  if (!possession) return 50;
  const isHome = userIsHomeForResult(result, userTeamId, userIsHome);
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
  const isHome = userIsHomeForResult(result, save?.userTeamId, userIsHome);
  const resultFormation = isHome ? result?.homeFormation : result?.awayFormation;
  const resultMentality = isHome ? result?.homeMentality : result?.awayMentality;
  const resultInstructions = isHome ? result?.homeTactics : result?.awayTactics;

  return {
    fingerprint:managerFingerprint(save, event),
    formation:resultFormation ?? save?.formation ?? '4-3-3',
    mentality:resultMentality ?? save?.mentality ?? 'balanced',
    instructions:resultInstructions ?? save?.tactics?.instructions ?? save?.tactics ?? {},
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
