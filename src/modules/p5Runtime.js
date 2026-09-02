import { getAllPlayers, getAllTeams, getPlayer, getSave, getTeam, putPlayer, putPlayersBulk, putSave, putTeam, putTeamsBulk } from './db.js';
import { buildSquadNeeds } from './squadPlanning.js';
import { formAdjustedValue } from './transfers.js';
import {
  advanceScoutingState,
  cancelScoutingAssignment,
  createScoutingAssignment,
  createScoutingState,
  normalizeScoutingState,
  scoutingNeedsBackfill,
} from './scouting.js';
import {
  buildCoachCandidates,
  coachingEffects,
  coachingNeedsBackfill,
  coachingWeeklyCost,
  withDefaultCoaching,
} from './coaching.js';
import {
  createDevelopmentPlan,
  developmentPlanRecoveryMultiplier,
  developmentPlanSharpnessBonus,
  effectiveDevelopmentPlan,
} from './training.js';

/** modules/p5Runtime.js — bounded persistence/runtime facade for P5. */

export const P5_CAREER_DEPTH_VERSION = 1;

function p5WeekKey(save) {
  return `${String(save?.season ?? 'unknown')}:${Number(save?.currentGameweek ?? 0)}`;
}

export function buildP5CareerDepthBackfill(save, teams = []) {
  if (!save) return { save, teamPatches:[] };
  const alreadyCurrent = Number(save.careerDepthVersion ?? 0) >= P5_CAREER_DEPTH_VERSION && !scoutingNeedsBackfill(save);
  const teamPatches = teams.filter(coachingNeedsBackfill).map(withDefaultCoaching);
  if (alreadyCurrent && !teamPatches.length) return { save, teamPatches:[] };
  const scouting = scoutingNeedsBackfill(save)
    ? createScoutingState({ defaultKnowledge:.68 })
    : normalizeScoutingState(save.scouting);
  return {
    save:{ ...save, scouting, careerDepthVersion:P5_CAREER_DEPTH_VERSION },
    teamPatches,
  };
}

export async function ensureP5CareerDepth(saveInput = null) {
  const save = saveInput ?? await getSave();
  if (!save) return save;
  const teams = await getAllTeams();
  const migration = buildP5CareerDepthBackfill(save, teams);
  if (migration.teamPatches.length) await putTeamsBulk(migration.teamPatches);
  if (migration.save !== save) await putSave(migration.save);
  return migration.save;
}

export function createFreshP5SaveFields() {
  return {
    careerDepthVersion:P5_CAREER_DEPTH_VERSION,
    scouting:createScoutingState({ defaultKnowledge:.42 }),
  };
}

function refreshPlanContext(player, team, weekKey) {
  const explicit = player?.developmentPlan;
  if (!explicit || typeof explicit !== 'object') return player;
  const effects = coachingEffects(team, player);
  const plan = effectiveDevelopmentPlan(player);
  const sharpnessBonus = developmentPlanSharpnessBonus(player);
  const recoveryMultiplier = developmentPlanRecoveryMultiplier(player);
  let next = {
    ...player,
    developmentPlan:{
      ...explicit,
      coachingMultiplier:effects.development,
      recoveryMultiplier:effects.recovery,
    },
  };
  if (explicit.trainingSettledKey === weekKey) return next;
  if (plan.id === 'sharpness' && sharpnessBonus > 0) {
    next.sharpness = Math.min(100, Math.round(Number(next.sharpness ?? 50) + sharpnessBonus));
  }
  if (plan.id === 'recovery' && next.rehabilitation && next.rehabilitation.status !== 'match_fit') {
    const extra = Math.max(0, Math.round((recoveryMultiplier * effects.recovery - 1) * 18));
    if (extra > 0) {
      next.rehabilitation = {
        ...next.rehabilitation,
        matchReadiness:Math.min(100, Math.round(Number(next.rehabilitation.matchReadiness ?? 50) + extra)),
      };
    }
  }
  next.developmentPlan = { ...next.developmentPlan, trainingSettledKey:weekKey };
  return next;
}

/**
 * P5's once-per-world-week step. It is called after P3 player settlement and
 * before P4 candidate activity. The scouting processed key and per-team staff
 * payment key make retries no-ops even if a browser reload interrupts closeout.
 */
export async function advanceP5CareerDepthWeek(saveInput = null) {
  let save = saveInput ?? await getSave();
  if (!save) return { save, reportsAdded:[], needs:[], alreadyProcessed:true };
  save = await ensureP5CareerDepth(save);
  const weekKey = p5WeekKey(save);
  const scouting = normalizeScoutingState(save.scouting);
  if (scouting.processedWeekKeys.includes(weekKey)) {
    const [team, players] = await Promise.all([getTeam(save.userTeamId), getAllPlayers()]);
    return { save, reportsAdded:[], needs:team ? buildSquadNeeds(team, players, { season:save.season, transferMarket:save.transferMarket }) : [], alreadyProcessed:true };
  }

  let teams = await getAllTeams();
  const players = await getAllPlayers();
  const teamPatches = [];
  for (const rawTeam of teams) {
    let team = coachingNeedsBackfill(rawTeam) ? withDefaultCoaching(rawTeam) : rawTeam;
    if (team.coachingPaidWeekKey !== weekKey) {
      team = {
        ...team,
        budget:(Number(team.budget) || 0) - coachingWeeklyCost(team),
        coachingPaidWeekKey:weekKey,
      };
    }
    if (team !== rawTeam) teamPatches.push(team);
  }
  if (teamPatches.length) {
    await putTeamsBulk(teamPatches);
    const patchById = new Map(teamPatches.map(team => [team.id, team]));
    teams = teams.map(team => patchById.get(team.id) ?? team);
  }
  const teamsById = new Map(teams.map(team => [team.id, team]));
  const userTeam = teamsById.get(save.userTeamId);

  const playerPatches = [];
  if (userTeam) {
    for (const player of players) {
      if (player.teamId !== save.userTeamId || !player.developmentPlan) continue;
      const next = refreshPlanContext(player, userTeam, weekKey);
      if (JSON.stringify(next) !== JSON.stringify(player)) playerPatches.push(next);
    }
  }
  if (playerPatches.length) await putPlayersBulk(playerPatches);
  const playerById = new Map(playerPatches.map(player => [player.id, player]));
  const effectivePlayers = players.map(player => playerById.get(player.id) ?? player);

  const progressed = advanceScoutingState(scouting, {
    season:save.season,
    gameweek:save.currentGameweek,
    players:effectivePlayers,
    teamsById,
    userTeam,
    // The engine prices every offer against formAdjustedValue (minimumOffer is
    // 0.88x of it), so a report's fee range has to be on that same basis.
    // Reporting the raw value put stored reports below the engine's own floor,
    // and left them disagreeing with the public estimate the UI builds.
    valueFor:formAdjustedValue,
  });
  const nextSave = { ...save, scouting:progressed.state, careerDepthVersion:P5_CAREER_DEPTH_VERSION };
  await putSave(nextSave);
  const needs = userTeam ? buildSquadNeeds(userTeam, effectivePlayers, { season:save.season, transferMarket:save.transferMarket }) : [];
  return { save:nextSave, reportsAdded:progressed.reportsAdded, needs, alreadyProcessed:false };
}

export async function addScoutingAssignment(assignment) {
  let save = await ensureP5CareerDepth();
  const nextScouting = createScoutingAssignment(save.scouting, assignment, { season:save.season, gameweek:save.currentGameweek });
  save = { ...save, scouting:nextScouting };
  await putSave(save);
  return save.scouting;
}

/**
 * Send a dedicated scout to one named player. The report lands on the next
 * completed world week (`advanceP5CareerDepthWeek`) and reads exactly until the
 * season rolls over — the queue and the weekly settlement are unchanged.
 */
export async function scoutPlayerInFull(playerId, label = null) {
  return addScoutingAssignment({ type:'player', mode:'full', playerId, label });
}

export async function removeScoutingAssignment(assignmentId) {
  let save = await ensureP5CareerDepth();
  save = { ...save, scouting:cancelScoutingAssignment(save.scouting, assignmentId) };
  await putSave(save);
  return save.scouting;
}

export async function setManagedDevelopmentPlan(playerId, planId, options = {}) {
  const [save, player] = await Promise.all([getSave(), getPlayer(playerId)]);
  if (!save || !player || player.teamId !== save.userTeamId) throw new Error('PLAYER_NOT_IN_SQUAD');
  const team = await getTeam(save.userTeamId);
  const plan = createDevelopmentPlan(planId, player, {
    teamId:save.userTeamId,
    weekKey:p5WeekKey(save),
    targetPosition:options.targetPosition,
  });
  if (!plan) throw new Error('INVALID_DEVELOPMENT_PLAN');
  const effects = coachingEffects(team, player);
  const updated = {
    ...player,
    developmentPlan:{ ...plan, coachingMultiplier:effects.development, recoveryMultiplier:effects.recovery },
  };
  await putPlayer(updated);
  return updated;
}

export async function getManagedSquadPlan() {
  const save = await ensureP5CareerDepth();
  const [team, players] = await Promise.all([getTeam(save.userTeamId), getAllPlayers()]);
  return buildSquadNeeds(team, players, { season:save.season, transferMarket:save.transferMarket });
}

export async function getCoachMarket(department) {
  const save = await ensureP5CareerDepth();
  const team = await getTeam(save.userTeamId);
  return buildCoachCandidates(team, department, save.season, save.currentGameweek);
}

export async function hireManagedCoach(department, coachId) {
  const save = await ensureP5CareerDepth();
  const team = await getTeam(save.userTeamId);
  if (!team) throw new Error('TEAM_NOT_FOUND');
  const candidate = buildCoachCandidates(team, department, save.season, save.currentGameweek).find(coach => coach.id === coachId);
  if (!candidate) throw new Error('COACH_NOT_FOUND');
  if ((Number(team.budget) || 0) < candidate.signingCost) throw new Error('INSUFFICIENT_FUNDS');
  const updatedTeam = withDefaultCoaching({
    ...team,
    budget:(Number(team.budget) || 0) - candidate.signingCost,
    coaching:{ ...(team.coaching ?? {}), [department]:candidate },
  });
  await putTeam(updatedTeam);

  const players = await getAllPlayers();
  const patches = players
    .filter(player => player.teamId === save.userTeamId && player.developmentPlan && coachingEffects(updatedTeam, player).department === department)
    .map(player => refreshPlanContext(player, updatedTeam, player.developmentPlan.trainingSettledKey ?? null));
  if (patches.length) await putPlayersBulk(patches);
  return { team:updatedTeam, coach:candidate };
}
