import { getAllPlayers, getAllTeams, getSave, putPlayersBulk, putSave } from './db.js';
import { normalizePlayerModel } from './playerModel.js';
import { ensureOpenRegistrationSpell, isAcademyPlayer, normalizePlayerStatus } from './playerStatus.js';
import {
  ACADEMY_PLAYER_CAP,
  advanceYouthScoutingState,
} from './academyPathways.js';
import { generateYouthPlayer } from './youthAcademy.js';
import { ensureP9CareerPathways } from './p9Runtime.js';

/*
 * P9 weekly academy IO after P3 settlement.
 *
 * P3/playerDevelopment.js is the sole owner of academy match evidence and
 * growth. This runtime advances only regional scouting and converts completed
 * scouting assignments into canonical academy player rows. It must never write
 * academyEvidence or run a second development clock.
 */

function p9ScoutingFacilityLevel(team) {
  return Math.max(1, Number(
    team?.facilities?.tracks?.scouting?.level
    ?? team?.facilities?.scouting?.level
    ?? 1,
  ));
}

function p9ScoutingProspectId(assignment) {
  return `academy_scout_${String(assignment.id).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

function p9ScoutingCanonicalProspect(raw, teamId, save) {
  const base = normalizePlayerModel({
    ...raw,
    teamId,
    youthTeamId:teamId,
    isYouth:true,
    inSquad:false,
    wage:0,
    onLoan:false,
    loanedFrom:null,
    loanedTo:null,
    loanOriginalTeamId:null,
    playerStatus:'academy',
    contractTeamId:teamId,
    registeredTeamId:teamId,
    activeAgreementId:null,
    activeLoanAgreement:null,
    contractExpiry:null,
    signedThisSeason:false,
    developmentAppearances:0,
    developmentMinutes:0,
  });
  return ensureOpenRegistrationSpell(normalizePlayerStatus(base), {
    season:save?.season ?? null,
    gameweek:save?.currentGameweek ?? 0,
  });
}

function p9GenerateScoutingProspect(assignment, team, save, existingIds) {
  const wanted = {
    GK:new Set(['GK']),
    DEF:new Set(['CB','RB','LB']),
    MID:new Set(['CDM','CM','CAM','RM','LM']),
    ATT:new Set(['RW','LW','CF','ST']),
  }[assignment.positionGroup] ?? new Set(['CM']);
  let generated = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const row = generateYouthPlayer(
      team.id,
      team.reputation ?? 70,
      save.season,
      100 + Number(assignment.weeks ?? 0) * 10 + attempt,
      team.league ?? save.userLeague,
      false,
      team.academyInvestment ?? 0,
    );
    if (!generated) generated = row;
    if (wanted.has(row.position)) { generated = row; break; }
  }
  if (!generated) return null;
  const id = p9ScoutingProspectId(assignment);
  if (existingIds.has(id)) return null;
  const band = assignment.report?.potentialBand;
  const projectedPotential = band
    ? Math.max(Number(generated.potentialRating ?? 65), Math.round((Number(band.min) + Number(band.max)) / 2))
    : generated.potentialRating;
  return p9ScoutingCanonicalProspect({
    ...generated,
    id,
    potentialRating:Math.max(1, Math.min(99, projectedPotential)),
    academySource:{
      type:'regional_scouting',
      assignmentId:assignment.id,
      region:assignment.region,
      nation:assignment.nation,
      role:assignment.role,
      style:assignment.style,
      confidence:assignment.report?.confidence ?? null,
    },
  }, team.id, save);
}

export async function advanceP9AcademyScoutingWeek(saveInput = null) {
  let save = await ensureP9CareerPathways(saveInput ?? await getSave());
  if (!save) return { save, scoutingCompleted:[], prospectsAdded:[] };
  const [players, teams] = await Promise.all([getAllPlayers(), getAllTeams()]);
  const userTeam = teams.find(team => String(team.id) === String(save.userTeamId));
  if (!userTeam) return { save, scoutingCompleted:[], prospectsAdded:[] };

  const scouting = advanceYouthScoutingState(save.academyPathways, {
    season:save.season,
    gameweek:save.currentGameweek,
    reputation:userTeam.reputation ?? 65,
    academyInvestment:userTeam.academyInvestment ?? 0,
    scoutingLevel:p9ScoutingFacilityLevel(userTeam),
  });
  let academyPathways = scouting.state;
  const academyCount = players.filter(player => isAcademyPlayer(player, save.userTeamId)).length;
  const existingIds = new Set(players.map(player => String(player.id)));
  const prospectsAdded = [];
  const remainingCapacity = Math.max(0, ACADEMY_PLAYER_CAP - academyCount);

  for (const assignment of scouting.completed.slice(0, remainingCapacity)) {
    if (assignment.prospectId) continue;
    const prospect = p9GenerateScoutingProspect(assignment, userTeam, save, existingIds);
    if (!prospect) continue;
    prospectsAdded.push(prospect);
    existingIds.add(String(prospect.id));
    academyPathways = {
      ...academyPathways,
      youthScoutingAssignments:academyPathways.youthScoutingAssignments.map(item => item.id === assignment.id
        ? { ...item, prospectId:prospect.id }
        : item),
    };
  }

  if (prospectsAdded.length) await putPlayersBulk(prospectsAdded);
  if (JSON.stringify(save.academyPathways ?? null) !== JSON.stringify(academyPathways)) {
    save = { ...save, academyPathways };
    await putSave(save);
  }
  return { save, scoutingCompleted:scouting.completed, prospectsAdded };
}
