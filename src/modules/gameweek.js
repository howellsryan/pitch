import { commitMatchEventAtomic, getAllFixtures, getAllPlayers, getAllTeams, getFixturesByGW, getInjuredPlayers, getManager, getPlayersByTeam, getPlayersByTeams, getSave, putFixturesBulk, putPlayersBulk, putSave } from './db.js';
import { simulateMatch } from './matchEngine.js';
import { applyManagerDNAResult, decorateManagedPlayers, decorateManagedTeam } from './managerTactics.js';
import { canManageClub, requireClubEmployment } from './managerEmployment.js';
import { buildPersonalStatePatches } from './playerModel.js';
import { updateTeamMorale } from './standings.js';
import { CUP_META, UCL_CLUBS, simulateCupRound, simulateEuropeanLeaguePhaseMatchday, resolveCupProgress, resolveSingleLegKnockout } from './cups.js';
import { finishLeaguePhase, getCompetitionRules, getUefaKnockoutOpponentSeeds, getUefaKnockoutSeeding, isTwoLegRound, isUefaCompetition } from './competitionRules.js';
import { advanceTransferMarketWeek } from './transfers.js';
import { advanceP5CareerDepthWeek } from './p5Runtime.js';
import { advanceP6ManagerCareerWeek } from './p6Runtime.js';
import { advanceP7ClubFinanceWeek } from './p7Runtime.js';
import { advanceP8StoryWeek } from './p8Runtime.js';
import { applyDevelopment } from './potential.js';
import { applyInjury, tickInjuryRecovery } from './injuries.js';
import { payWeeklyWages } from './season.js';
import { applyWorldPlayerStats, resultFromCanonicalLeagueRecord, toCanonicalLeagueRecord } from './world.js';
import { advanceWorldCompetitions } from './worldCompetitions.js';
import { applyNonLeaguePlayerResults, applyPendingWorldCompetitionProjections, applyPendingWorldLeagueProjections, projectNonLeaguePlayers } from './worldRuntime.js';

/** modules/gameweek.js — one user-event queue over a single P2 world clock. */

export const WORLD_SIM_BATCH_SIZE = 24;

export function getEffectiveTotalGW(save) {
  const leagueGWs = Math.max(save.totalGameweeks ?? 38, save.worldTotalGameweeks ?? 0);
  let maxCupGW = leagueGWs;
  if (!save.cups) return leagueGWs;
  for (const [cupId, state] of Object.entries(save.cups)) {
    if (state.status !== 'active') continue;
    const meta = CUP_META[cupId];
    if (!meta) continue;
    const roundIdx = state.roundIndex ?? 0;
    for (let i = roundIdx; i < (meta.roundGWs?.length ?? 0); i++) {
      const gw = meta.roundGWs[i];
      if (gw > maxCupGW) maxCupGW = gw;
    }
  }
  return maxCupGW;
}

function currentBracketSeed(state) {
  const value = state?.bracketSeed ?? state?.leaguePhase?.position ?? state?.seed ?? null;
  return Number.isInteger(value) ? value : null;
}

function inheritBracketSeed(cupId, roundName, state, opponentSeed, progress) {
  const current = currentBracketSeed(state);
  if (isTwoLegRound(cupId, roundName, 1) || progress?.status === 'eliminated') return current;
  if (!Number.isInteger(opponentSeed)) return current;
  return current == null ? opponentSeed : Math.min(current, opponentSeed);
}

function resolveLeaguePhaseHome(state, phaseRules, matchday) {
  const planned = state?.leaguePhase?.venues?.[matchday];
  if (typeof planned === 'boolean') return planned;
  const completed = (state?.results ?? []).filter(result => result?.isLeaguePhaseMatchday);
  const homePlayed = completed.filter(result => result.userIsHome).length;
  const targetHomes = phaseRules.homeMatches ?? Math.floor(phaseRules.matches / 2);
  const homesNeeded = targetHomes - homePlayed;
  const matchesRemaining = phaseRules.matches - matchday;
  if (homesNeeded <= 0) return false;
  if (homesNeeded >= matchesRemaining) return true;
  return Math.random() < homesNeeded / matchesRemaining;
}

function drawKnockoutOpponent(cupId, roundName, state, userTeamId, userLeague, allTeams) {
  if (isTwoLegRound(cupId, roundName, 2)) {
    const leg1 = state?.results?.[state.results.length - 1];
    if (leg1) {
      const known = allTeams.find(t => t.id === leg1.opponentId) ?? UCL_CLUBS.find(c => c.id === leg1.opponentId);
      return {
        opponent: {
          id: leg1.opponentId,
          name: leg1.opponentName,
          crest: known?.nation ?? known?.crest ?? '⚽',
          rep: known?.strength ?? known?.reputation ?? 70,
        },
        opponentSeed: Number.isInteger(leg1.opponentSeed) ? leg1.opponentSeed : null,
        userIsHome: !(leg1.userIsHome ?? true),
      };
    }
  }

  if (isUefaCompetition(cupId)) {
    const position = currentBracketSeed(state);
    const allowedSeeds = getUefaKnockoutOpponentSeeds(cupId, position, roundName);
    const opponentSeed = allowedSeeds.length
      ? allowedSeeds[Math.floor(Math.random() * allowedSeeds.length)]
      : null;
    const rankedPool = UCL_CLUBS
      .filter(c => c.id !== userTeamId)
      .sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0) || String(a.id).localeCompare(String(b.id)));
    const pick = opponentSeed == null
      ? rankedPool[Math.floor(Math.random() * rankedPool.length)]
      : rankedPool[Math.min(opponentSeed - 1, rankedPool.length - 1)];
    const seeding = getUefaKnockoutSeeding(cupId, position, roundName);
    const seededVenue = seeding.secondLegHome == null ? null : !seeding.secondLegHome;
    return {
      opponent: pick ? { id:pick.id, name:pick.name, crest:pick.nation, rep:pick.strength } : null,
      opponentSeed,
      userIsHome: seededVenue ?? Math.random() < 0.5,
    };
  }

  const cupNation = CUP_META[cupId]?.nation;
  const ENGLISH_LEAGUES = new Set(['Premier League', 'Championship', 'League One', 'League Two']);
  let pool;
  if (cupNation === 'England') {
    pool = allTeams.filter(t => t.id !== userTeamId && ENGLISH_LEAGUES.has(t.league ?? 'Premier League'));
  } else {
    pool = allTeams.filter(t => t.id !== userTeamId && (t.league ?? 'Premier League') === userLeague);
  }
  const eligible = pool.length > 0 ? pool : allTeams.filter(t => t.id !== userTeamId);
  const pick = eligible[Math.floor(Math.random() * eligible.length)];
  return {
    opponent: pick ? { id:pick.id, name:pick.name, crest:pick.crest ?? '⚽', rep:pick.reputation ?? 70 } : null,
    opponentSeed: null,
    userIsHome: Math.random() < 0.5,
  };
}

export function buildPendingEvents(gw, userTeamId, fixtures, cupState, allTeams) {
  const events = [];
  const leagueFix = fixtures.find(f =>
    f.competition === 'league' && !f.played &&
    (f.homeTeamId === userTeamId || f.awayTeamId === userTeamId)
  );
  if (leagueFix) events.push({ type:'league', fixtureId:leagueFix.id, gw });
  if (!cupState) return events;

  for (const [cupId, state] of Object.entries(cupState)) {
    if (state.status !== 'active') continue;
    const meta = CUP_META[cupId];
    const rules = getCompetitionRules(cupId);
    if (!meta || !rules) continue;

    if (rules.leaguePhase && !state.leaguePhaseComplete) {
      const lp = state.leaguePhase ?? {};
      const matchday = lp.matchday ?? 0;
      if (rules.leaguePhase.gws[matchday] === gw && matchday < rules.leaguePhase.matches) {
        const opp = lp.opponents?.[matchday];
        const base = {
          cupId, gw, matchday:matchday + 1, leaguePhase:true,
          opponentId:opp?.id,
          opponentName:opp?.name ?? 'European Club',
          opponentCrest:opp?.nation ?? '🌍',
          opponentRep:opp?.strength ?? 72,
          oppName:opp?.name ?? 'European Club',
          oppNation:opp?.nation ?? '🌍',
          oppStrength:opp?.strength ?? 72,
          userIsHome:resolveLeaguePhaseHome(state, rules.leaguePhase, matchday),
        };
        if (cupId === 'ucl') events.push({ type:'ucl_md', ...base });
        else events.push({
          type:'cup', ...base, roundIdx:null,
          roundName:`League Phase · Matchday ${matchday + 1}`,
          cupName:meta.name, cupIcon:meta.icon,
        });
      }
      continue;
    }

    const roundIdx = state.roundIndex ?? 0;
    const roundGW = meta.roundGWs?.[roundIdx];
    if (roundGW !== gw) continue;
    const teamsById = new Map(allTeams.map(t => [t.id, t]));
    const userTeam = teamsById.get(userTeamId);
    const userLeague = userTeam?.league ?? 'Premier League';
    const roundName = meta.rounds[roundIdx] ?? 'Final';
    const draw = drawKnockoutOpponent(cupId, roundName, state, userTeamId, userLeague, allTeams);
    events.push({
      type:'cup', cupId, gw, roundIdx, roundName,
      cupName:meta.name, cupIcon:meta.icon,
      opponentId:draw.opponent?.id,
      opponentName:draw.opponent?.name ?? 'TBD',
      opponentCrest:draw.opponent?.crest ?? '⚽',
      opponentRep:draw.opponent?.rep ?? 70,
      opponentSeed:draw.opponentSeed ?? null,
      userIsHome:draw.userIsHome,
    });
  }
  return events;
}

export function updateLeaguePhaseCupState(cupId, cupState, matchResult, userTeamId, rng = Math.random) {
  const phaseRules = getCompetitionRules(cupId)?.leaguePhase;
  if (!phaseRules) return cupState;
  const lp = cupState?.leaguePhase ?? {};
  const userGoals = Number(matchResult?.userGoals ?? 0);
  const oppGoals = Number(matchResult?.oppGoals ?? 0);
  const points = Number.isFinite(matchResult?.points)
    ? matchResult.points
    : userGoals > oppGoals ? 3 : userGoals === oppGoals ? 1 : 0;
  const matchday = (lp.matchday ?? 0) + 1;
  const nextLeaguePhase = {
    ...lp, matchday,
    points:(lp.points ?? 0) + points,
    gf:(lp.gf ?? 0) + userGoals,
    ga:(lp.ga ?? 0) + oppGoals,
    gd:(lp.gd ?? 0) + userGoals - oppGoals,
  };
  const complete = matchday >= phaseRules.matches;
  const nextResults = [...(cupState?.results ?? []), { ...matchResult, points, isLeaguePhaseMatchday:true }];
  if (!complete) return { ...cupState, leaguePhase:nextLeaguePhase, leaguePhaseComplete:false, results:nextResults };

  const finish = finishLeaguePhase(cupId, nextLeaguePhase, userTeamId, rng);
  return {
    ...cupState,
    leaguePhase:{
      ...nextLeaguePhase,
      table:finish?.table ?? [],
      position:finish?.position ?? null,
      qualificationRoute:finish?.route ?? 'eliminated',
    },
    leaguePhaseComplete:true,
    qualificationRoute:finish?.route ?? 'eliminated',
    seed:finish?.seed ?? null,
    bracketSeed:finish?.seed ?? null,
    roundIndex:finish?.roundIndex ?? 0,
    status:finish?.status ?? 'eliminated',
    results:nextResults,
  };
}

function gameweekEventWeekKey(save) {
  return `${save.season}:${save.currentGameweek}`;
}

function gameweekMatchEventKey(event) {
  return JSON.stringify([
    event?.type, event?.gw, event?.fixtureId ?? null, event?.cupId ?? null,
    event?.matchday ?? null, event?.roundIdx ?? null, event?.roundName ?? null,
    // League venue belongs to the persisted fixture; Broadcast enriches the
    // event with a display hint that is absent from the canonical queue.
    event?.opponentId ?? null, event?.type === 'league' ? null : event?.userIsHome ?? null,
  ]);
}

async function gameweekInitialisePendingEvents(save, fixtures, allTeams) {
  const weekKey = gameweekEventWeekKey(save);
  if (save.pendingEventsWeekKey === weekKey) return save;
  const pendingEvents = save.pendingEvents?.length
    ? save.pendingEvents
    : buildPendingEvents(save.currentGameweek, save.userTeamId, fixtures, save.cups, allTeams);
  const nextSave = { ...save, pendingEvents, pendingEventsWeekKey:weekKey };
  await putSave(nextSave);
  return nextSave;
}

export async function getNextMatchEvent() {
  const save = await getSave();
  if (save.currentGameweek > getEffectiveTotalGW(save)) return null;
  if (save.pendingEvents?.length) return save.pendingEvents[0];
  const gw = save.currentGameweek;
  const fixtures = await getFixturesByGW(gw);
  const allTeams = await getAllTeams();
  const queuedSave = await gameweekInitialisePendingEvents(save, fixtures, allTeams);
  return queuedSave.pendingEvents[0] ?? { type:'no_user_event', gw };
}

export async function getNextUserFixture() {
  const save = await getSave();
  const all = await getAllFixtures();
  return all
    .filter(f => !f.played && (f.homeTeamId === save.userTeamId || f.awayTeamId === save.userTeamId))
    .sort((a, b) => a.gameweek - b.gameweek)[0] ?? null;
}

async function settleWorldLeagueGameweek(gw, save, teamsById, playersByTeam) {
  let fixtures = await getFixturesByGW(gw);
  const unplayed = fixtures.filter(f => f.competition === 'league' && !f.played);
  if (unplayed.length) await simulateFixtures(unplayed, teamsById, playersByTeam, save);
  fixtures = await getFixturesByGW(gw);
  const projected = await applyPendingWorldLeagueProjections(fixtures);
  if (projected.length) await applyDevelopment(projected).catch(() => {});
  return projected;
}

async function gameweekRecoverWorldLeagueGameweek(save, fixtures, allTeams, allPlayers) {
  const pendingProjection = fixtures.some(fixture => fixture.played && fixture.projectionsApplied !== true);
  const pendingManagedFixture = fixtures.some(fixture =>
    fixture.competition === 'league' && !fixture.played &&
    (fixture.homeTeamId === save.userTeamId || fixture.awayTeamId === save.userTeamId),
  );
  // Global recovery, discipline and development settle once for the complete
  // league batch. Never project a lone saved user result before its AI fixtures.
  if (pendingProjection && !pendingManagedFixture) {
    await settleWorldLeagueGameweek(save.currentGameweek, save, new Map(allTeams.map(team => [team.id, team])), groupByTeam(allPlayers));
    return { allPlayers:await getPlayersByTeams(allTeams.map(team => team.id)), gwFixtures:await getFixturesByGW(save.currentGameweek) };
  }
  return { allPlayers, gwFixtures:fixtures };
}

function gameweekRestoreManagedLeagueResult(fixture, allTeams, save) {
  const teams = new Map(allTeams.map(team => [team.id, team]));
  return {
    ...resultFromCanonicalLeagueRecord(fixture),
    homeTeamName:teams.get(fixture.homeTeamId)?.name ?? fixture.homeTeamId,
    awayTeamName:teams.get(fixture.awayTeamId)?.name ?? fixture.awayTeamId,
    homeTeamCrest:teams.get(fixture.homeTeamId)?.crest ?? '⚽',
    awayTeamCrest:teams.get(fixture.awayTeamId)?.crest ?? '⚽',
    isUserMatch:true, userTeamId:save.userTeamId,
  };
}

async function gameweekCheckpointManagedEvent(save, event, remaining, updatedCups, result, allPlayers, fixture = null, managementEnabled = true) {
  const userIsHome = event.userIsHome ?? (result?.homeTeamId === save.userTeamId);
  const withDNA = result && managementEnabled
    ? applyManagerDNAResult(save, result, event, userIsHome, allPlayers.filter(player => player.teamId === save.userTeamId))
    : save;
  const lastResolvedEvent = {
    key:gameweekMatchEventKey(event), season:save.season, gameweek:save.currentGameweek,
    homeTeamId:result?.homeTeamId, awayTeamId:result?.awayTeamId,
    homeGoals:result?.homeGoals, awayGoals:result?.awayGoals, seed:result?.seed ?? null,
  };
  return commitMatchEventAtomic({
    event, season:save.season, gameweek:save.currentGameweek, fixture,
    players:result && event.type !== 'league' ? projectNonLeaguePlayers(allPlayers, [result]) : [],
    savePatch:{ cups:updatedCups, pendingEvents:remaining, pendingEventsWeekKey:gameweekEventWeekKey(save), managerDNA:withDNA.managerDNA, lastResolvedEvent },
  });
}

function gameweekValidateBroadcastParticipants(result, event, save, fixtures, userIsHome) {
  const fixture = event.type === 'league' ? fixtures.find(row => row.id === event.fixtureId) : null;
  const cupHomeVenue = event.userIsHome ?? true;
  const homeTeamId = fixture?.homeTeamId ?? (cupHomeVenue ? save.userTeamId : event.opponentId);
  const awayTeamId = fixture?.awayTeamId ?? (cupHomeVenue ? event.opponentId : save.userTeamId);
  if (!homeTeamId || !awayTeamId || result?.homeTeamId !== homeTeamId || result?.awayTeamId !== awayTeamId ||
      userIsHome !== (homeTeamId === save.userTeamId)) {
    throw new Error('MATCH_RESULT_PARTICIPANTS_CHANGED: reload the current fixture before saving its result.');
  }
}

async function gameweekRetryResolvedBroadcast(save, result, event) {
  const receipt = save.lastResolvedEvent;
  if (receipt?.key !== gameweekMatchEventKey(event) || receipt.season !== save.season) return null;
  if (result?.homeTeamId !== receipt.homeTeamId || result?.awayTeamId !== receipt.awayTeamId ||
      result?.homeGoals !== receipt.homeGoals || result?.awayGoals !== receipt.awayGoals ||
      (result?.seed ?? null) !== receipt.seed) {
    throw new Error('MATCH_RESULT_CHANGED: this fixture already has a saved result.');
  }
  const closeout = save.currentGameweek === receipt.gameweek &&
    save.pendingEventsWeekKey === gameweekEventWeekKey(save) && !save.pendingEvents?.length;
  const resumed = closeout ? await advanceOneFixture() : {
    gameweek:receipt.gameweek, nextGW:save.currentGameweek,
    finished:save.currentGameweek > getEffectiveTotalGW(save), eventsLeft:save.pendingEvents?.length ?? 0,
    newOffers:[], playerResponses:[], recoveredPlayers:[],
  };
  return { ...resumed, singleResult:result, eventType:event.type, cupResults:[] };
}

async function settleWorldCompetitionGameweek(gw, save, allTeams) {
  let workingSave = save;
  const recovered = await applyPendingWorldCompetitionProjections(workingSave);
  if (recovered.results.length) {
    workingSave = recovered.save ?? workingSave;
    await applyDevelopment(recovered.results).catch(() => {});
  }
  if (!workingSave?.worldCompetitions?.competitions) return workingSave;
  const freshPlayers = await getPlayersByTeams(allTeams.map(team => team.id));
  const advanced = await advanceWorldCompetitions(
    workingSave.worldCompetitions,
    gw,
    allTeams,
    groupByTeam(freshPlayers),
  );
  if (!advanced.state) return workingSave;

  // Persist canonical cup records before projecting them. If the tab closes
  // here, the next closeout recovers the still-pending records exactly once.
  await putSave({ ...workingSave, worldCompetitions:advanced.state });
  if (!advanced.records.length) return { ...workingSave, worldCompetitions:advanced.state };

  const persisted = await getSave();
  const applied = await applyPendingWorldCompetitionProjections(persisted);
  if (applied.results.length) await applyDevelopment(applied.results).catch(() => {});
  return applied.save ?? persisted;
}

export function personalStateSettlementRequiresFullWorld(fixtures) {
  return !(fixtures ?? []).some(fixture => fixture?.competition === 'league');
}

async function settleWorldPersonalState(gameweek, season, userTeamId, fixtures) {
  // League projection has already settled every completed background club,
  // while background competition projection settles the clubs it deferred.
  // The final boundary therefore only needs the managed squad on an ordinary
  // league week. A genuinely league-less/cup-only week has no global league
  // projection, so it deliberately retains the full-world recovery path.
  const candidates = personalStateSettlementRequiresFullWorld(fixtures) || !userTeamId
    ? await getAllPlayers()
    : await getPlayersByTeam(userTeamId);
  const patches = buildPersonalStatePatches(candidates, gameweek, season);
  if (patches.length) await putPlayersBulk(patches);
  return patches;
}

async function runEndOfWorldGameweek(save, fixtures) {
  // P3 observes the fully projected world week first. Medical recovery then
  // advances the injury clock, P5 progresses development/scouting/planning on
  // the same persisted week key, and only then may P4 open candidate activity.
  // Each layer owns its own retry key, so a reload never creates a second tick.
  const personalStatePatches = await settleWorldPersonalState(
    save.currentGameweek,
    save.season,
    save.userTeamId,
    fixtures,
  );
  const recoveredPlayers = await processInjuryRecovery().catch(() => []);
  const careerDepthResult = await advanceP5CareerDepthWeek(await getSave()).catch(() => ({ reportsAdded:[], needs:[] }));
  const marketResult = await advanceTransferMarketWeek(await getSave()).catch(() => ({ newOffers:[], playerResponses:[] }));
  const managerCareerResult = await advanceP6ManagerCareerWeek(await getSave()).catch(() => ({ dismissed:[], warnings:[], hired:[] }));
  const newOffers = marketResult.newOffers ?? [];
  const playerResponses = marketResult.playerResponses ?? [];
  await advanceP7ClubFinanceWeek(await getSave()).catch(() => ({ settledTeamIds:[] }));
  await payWeeklyWages().catch(() => {});
  await updateTeamMorale(save.userTeamId).catch(() => {});
  const storyResult = await advanceP8StoryWeek(await getSave()).catch(() => ({ added:[], expired:[] }));
  return {
    recoveredPlayers,
    newOffers,
    playerResponses,
    personalStatePatches,
    scoutingReports:careerDepthResult.reportsAdded ?? [],
    squadNeeds:careerDepthResult.needs ?? [],
    dismissedManagers:managerCareerResult.dismissed ?? [],
    managerWarnings:managerCareerResult.warnings ?? [],
    hiredManagers:managerCareerResult.hired ?? [],
    careerEvents:storyResult.added ?? [],
  };
}

export async function advanceOneFixture(overrideFormation) {
  let save = await getSave();
  if (save.currentGameweek > getEffectiveTotalGW(save)) return { finished:true };

  // Recover any persisted AI cup records before selecting this week's squads.
  // That prevents a reload between record-write and projection from duplicating
  // appearances/cards/injuries when the user resumes the same world week.
  const recoveredCompetition = await applyPendingWorldCompetitionProjections(save);
  if (recoveredCompetition.results.length) {
    save = recoveredCompetition.save ?? save;
    await applyDevelopment(recoveredCompetition.results).catch(() => {});
  }

  const gw = save.currentGameweek;
  let [allTeams, gwFixtures] = await Promise.all([
    getAllTeams(), getFixturesByGW(gw),
  ]);
  let allPlayers = await getPlayersByTeams(allTeams.map(team => team.id));

  ({ allPlayers, gwFixtures } = await gameweekRecoverWorldLeagueGameweek(save, gwFixtures, allTeams, allPlayers));
  save = await gameweekInitialisePendingEvents(save, gwFixtures, allTeams);
  const manager = save.userManagerId ? await getManager(save.userManagerId) : null;
  const managementEnabled = canManageClub(save, manager);

  const teamsById = new Map(allTeams.map(t => [t.id, t]));
  const playersByTeam = groupByTeam(allPlayers);
  let pending = [...save.pendingEvents];

  if (!pending.length) {
    await settleWorldLeagueGameweek(gw, save, teamsById, playersByTeam);
    const latestAfterLeague = await getSave();
    const competitionSave = await settleWorldCompetitionGameweek(gw, latestAfterLeague, allTeams);
    const { recoveredPlayers, newOffers, playerResponses } = await runEndOfWorldGameweek(competitionSave, gwFixtures);
    const freshSave = await getSave();
    const newDate = new Date(save.currentDate);
    newDate.setDate(newDate.getDate() + 7);
    await putSave({ ...freshSave, currentGameweek:gw + 1, currentDate:newDate.toISOString(), pendingEvents:[], pendingEventsWeekKey:null });
    return {
      skipped:true, gameweek:gw, nextGW:gw + 1,
      finished:gw + 1 > getEffectiveTotalGW(save), newOffers, playerResponses, recoveredPlayers,
    };
  }

  const event = pending[0];
  const remaining = pending.slice(1);
  let singleResult = null;
  let canonicalFixture = null;
  const cupResults = [];
  const updatedCups = JSON.parse(JSON.stringify(save.cups ?? {}));
  let recoveredPlayers = [];
  let newOffers = [];
  let playerResponses = [];

  if (event.type === 'league') {
    const fix = gwFixtures.find(f => f.id === event.fixtureId);
    if (fix) {
      const userIsHome = fix.homeTeamId === save.userTeamId;
      const rawHome = teamsById.get(fix.homeTeamId) ?? { id:fix.homeTeamId, name:fix.homeTeamId, crest:'⚽' };
      const rawAway = teamsById.get(fix.awayTeamId) ?? { id:fix.awayTeamId, name:fix.awayTeamId, crest:'⚽' };
      const rawHomePlayers = playersByTeam.get(fix.homeTeamId) ?? [];
      const rawAwayPlayers = playersByTeam.get(fix.awayTeamId) ?? [];
      const home = managementEnabled && userIsHome ? decorateManagedTeam(rawHome, save) : rawHome;
      const away = managementEnabled && !userIsHome ? decorateManagedTeam(rawAway, save) : rawAway;
      const hPl = managementEnabled && userIsHome ? decorateManagedPlayers(rawHomePlayers, save) : rawHomePlayers;
      const aPl = managementEnabled && !userIsHome ? decorateManagedPlayers(rawAwayPlayers, save) : rawAwayPlayers;
      const fm = overrideFormation ?? save.formation ?? '4-3-3';
      const hFm = managementEnabled && userIsHome ? fm : undefined;
      const aFm = managementEnabled && !userIsHome ? fm : undefined;
      const hLineup = managementEnabled && userIsHome ? (save.lineup ?? null) : null;
      const aLineup = managementEnabled && !userIsHome ? (save.lineup ?? null) : null;
      const hBench = managementEnabled && userIsHome ? (save.bench ?? null) : null;
      const aBench = managementEnabled && !userIsHome ? (save.bench ?? null) : null;
      const hMentality = managementEnabled && userIsHome ? (save.mentality ?? 'balanced') : undefined;
      const aMentality = managementEnabled && !userIsHome ? (save.mentality ?? 'balanced') : undefined;
      const result = fix.played
        ? gameweekRestoreManagedLeagueResult(fix, allTeams, save)
        : simulateMatch(home, away, hPl, aPl, hFm, aFm, hLineup, aLineup, hMentality, aMentality, { homeBench:hBench, awayBench:aBench });
      canonicalFixture = fix.played ? null : toCanonicalLeagueRecord(fix, result, save.season);
      singleResult = { ...result, isUserMatch:true, userTeamId:save.userTeamId, gameweek:gw };
    } else throw new Error('MATCH_FIXTURE_MISSING: reload the current fixture.');
    pending = remaining;

  } else if (event.type === 'ucl_md' || (event.type === 'cup' && event.leaguePhase)) {
    const cupId = event.cupId ?? 'ucl';
    const rawUserTeam = allTeams.find(t => t.id === save.userTeamId);
    const rawUserPlayers = playersByTeam.get(save.userTeamId) ?? [];
    const userTeam = managementEnabled ? decorateManagedTeam(rawUserTeam, save) : rawUserTeam;
    const userPlayers = managementEnabled ? decorateManagedPlayers(rawUserPlayers, save) : rawUserPlayers;
    const cupState = save.cups?.[cupId];
    const mdResult = simulateEuropeanLeaguePhaseMatchday(
      cupId,
      userTeam,
      userPlayers,
      cupState,
      save.mentality ?? 'balanced',
      event.userIsHome,
      playersByTeam,
      overrideFormation ?? save.formation ?? '4-3-3',
      save.lineup ?? null,
      save.bench ?? null,
      { userManaged:managementEnabled },
    );
    if (mdResult) {
      const reportResult = {
        ...mdResult,
        // Persisted with the result so the Home rail can place a European night
        // on its gameweek. Quick Sim and Broadcast must store the same shape.
        gameweek:event.gw,
        opponentId:mdResult.opponentId ?? event.opponentId,
        opponentName:mdResult.opponentName ?? event.opponentName ?? event.oppName,
      };
      updatedCups[cupId] = updateLeaguePhaseCupState(cupId, cupState, reportResult, save.userTeamId);
      cupResults.push(reportResult);
      singleResult = buildCupMatchResult(reportResult, save.userTeamId, event, allTeams);
      await applyDevelopment([mdResult]).catch(() => {});
    }
    pending = remaining;

  } else if (event.type === 'cup') {
    const rawUserTeam = allTeams.find(t => t.id === save.userTeamId);
    const rawUserPlayers = playersByTeam.get(save.userTeamId) ?? [];
    const userTeam = managementEnabled ? decorateManagedTeam(rawUserTeam, save) : rawUserTeam;
    const userPlayers = managementEnabled ? decorateManagedPlayers(rawUserPlayers, save) : rawUserPlayers;
    const cupState = save.cups?.[event.cupId];
    const result = simulateCupRound(userTeam, userPlayers, allTeams, playersByTeam, event.cupId, event.roundName, {
      ...event,
      userManaged:managementEnabled,
      userMentality:save.mentality ?? 'balanced',
      userFormation:overrideFormation ?? save.formation ?? '4-3-3',
      userLineup:save.lineup ?? null,
      userBench:save.bench ?? null,
    });
    const progress = resolveCupProgress(
      event.cupId,
      event.roundName,
      event.roundIdx ?? 0,
      cupState,
      result.userGoals,
      result.oppGoals,
      result.userWon,
      result.userIsHome,
      result.seed,
    );
    const resultOut = {
      ...result,
      // Stored so the Home rail can place a cup result on its gameweek; the
      // authoritative football outcome above is unchanged.
      gameweek:event.gw,
      opponentSeed:event.opponentSeed ?? null,
      ...(progress.aggregate ? { userWon:progress.aggregate.userWon, aggregate:progress.aggregate } : {}),
    };
    updatedCups[event.cupId] = {
      ...cupState,
      roundIndex:progress.roundIndex,
      status:progress.status,
      bracketSeed:inheritBracketSeed(event.cupId, event.roundName, cupState, event.opponentSeed, progress),
      results:[...(cupState?.results ?? []), resultOut],
    };
    cupResults.push(resultOut);
    singleResult = buildCupMatchResult(resultOut, save.userTeamId, event, allTeams);
    await applyDevelopment([result]).catch(() => {});
    pending = remaining;
  } else throw new Error('MATCH_EVENT_UNSUPPORTED');

  save = await gameweekCheckpointManagedEvent(save, event, pending, updatedCups, singleResult, allPlayers, canonicalFixture, managementEnabled);
  if (event.type === 'league') await settleWorldLeagueGameweek(gw, save, teamsById, playersByTeam);

  const gwDone = pending.length === 0;
  const nextGW = gwDone ? gw + 1 : gw;
  const newDate = new Date(save.currentDate);

  if (gwDone) {
    await settleWorldLeagueGameweek(gw, save, teamsById, playersByTeam);
    const latestAfterLeague = await getSave();
    const competitionSave = await settleWorldCompetitionGameweek(gw, latestAfterLeague, allTeams);
    const end = await runEndOfWorldGameweek(competitionSave, gwFixtures);
    recoveredPlayers = end.recoveredPlayers;
    newOffers = end.newOffers;
    playerResponses = end.playerResponses;
    newDate.setDate(newDate.getDate() + 7);
  }

  if (gwDone) {
    const freshSave = await getSave();
    await putSave({ ...freshSave, currentGameweek:nextGW, currentDate:newDate.toISOString(), pendingEvents:[], pendingEventsWeekKey:null });
  }

  return {
    singleResult, eventType:event.type, cupResults, gameweek:gw, nextGW,
    finished:nextGW > getEffectiveTotalGW(save), eventsLeft:pending.length,
    newOffers, playerResponses, recoveredPlayers,
  };
}

export async function advanceOneFixtureWithResult(matchResult, event, userIsHome) {
  let save = await getSave();
  await requireClubEmployment(save);
  const retried = await gameweekRetryResolvedBroadcast(save, matchResult, event);
  if (retried) return retried;
  if (save.currentGameweek > getEffectiveTotalGW(save)) throw new Error('MATCH_EVENT_STALE: the season has finished.');
  const recoveredCompetition = await applyPendingWorldCompetitionProjections(save);
  if (recoveredCompetition.results.length) {
    save = recoveredCompetition.save ?? save;
    await applyDevelopment(recoveredCompetition.results).catch(() => {});
  }

  const gw = save.currentGameweek;
  let [allTeams, gwFixtures] = await Promise.all([
    getAllTeams(), getFixturesByGW(gw),
  ]);
  let allPlayers = await getPlayersByTeams(allTeams.map(team => team.id));

  ({ allPlayers, gwFixtures } = await gameweekRecoverWorldLeagueGameweek(save, gwFixtures, allTeams, allPlayers));
  save = await gameweekInitialisePendingEvents(save, gwFixtures, allTeams);

  const teamsById = new Map(allTeams.map(t => [t.id, t]));
  const playersByTeam = groupByTeam(allPlayers);
  const pending = [...save.pendingEvents];
  const event0 = pending[0];
  if (!event0 || gameweekMatchEventKey(event0) !== gameweekMatchEventKey(event)) throw new Error('MATCH_EVENT_STALE: reload the current fixture before saving its result.');
  gameweekValidateBroadcastParticipants(matchResult, event0, save, gwFixtures, userIsHome);
  const remaining = pending.slice(1);
  const updatedCups = JSON.parse(JSON.stringify(save.cups ?? {}));
  let singleResult = null;
  let canonicalFixture = null;
  let recoveredPlayers = [];
  let newOffers = [];
  let playerResponses = [];

  if (event0?.type === 'league') {
    const fix = gwFixtures.find(f => f.id === event0.fixtureId);
    if (fix) {
      const authoritativeResult = fix.played ? gameweekRestoreManagedLeagueResult(fix, allTeams, save) : matchResult;
      canonicalFixture = fix.played ? null : toCanonicalLeagueRecord(fix, authoritativeResult, save.season);
      singleResult = { ...authoritativeResult, isUserMatch:true, userTeamId:save.userTeamId, gameweek:gw };
    } else throw new Error('MATCH_FIXTURE_MISSING: reload the current fixture.');

  } else if (event0?.type === 'ucl_md' || event0?.type === 'cup') {
    const userGoals = userIsHome ? matchResult.homeGoals : matchResult.awayGoals;
    const oppGoals = userIsHome ? matchResult.awayGoals : matchResult.homeGoals;
    let aggregate = null;

    if (event0.type === 'ucl_md' || event0.leaguePhase) {
      const cupId = event0.cupId ?? 'ucl';
      const cupState = save.cups?.[cupId];
      const points = userGoals > oppGoals ? 3 : userGoals === oppGoals ? 1 : 0;
      const mdResult = {
        cupId,
        gameweek:event0.gw,
        matchday:(cupState?.leaguePhase?.matchday ?? 0) + 1,
        opponentId:event0.opponentId,
        opponentName:event0.opponentName ?? event0.oppName,
        opponentNation:event0.opponentCrest ?? event0.oppNation,
        userGoals, oppGoals, userIsHome, points,
        gd:userGoals - oppGoals,
        result:points === 3 ? 'W' : points === 1 ? 'D' : 'L',
        homeTeamId:matchResult.homeTeamId,
        awayTeamId:matchResult.awayTeamId,
        homeGoals:matchResult.homeGoals,
        awayGoals:matchResult.awayGoals,
        homeScorers:matchResult.homeScorers,
        awayScorers:matchResult.awayScorers,
        scorers:userIsHome ? matchResult.homeScorers : matchResult.awayScorers,
        stats:matchResult.stats,
        events:matchResult.events,
        fitnessUpdates:matchResult.fitnessUpdates,
        homeFormation:matchResult.homeFormation,
        awayFormation:matchResult.awayFormation,
        homeMentality:matchResult.homeMentality,
        awayMentality:matchResult.awayMentality,
        homeTactics:matchResult.homeTactics,
        awayTactics:matchResult.awayTactics,
        seed:matchResult.seed,
      };
      updatedCups[cupId] = updateLeaguePhaseCupState(cupId, cupState, mdResult, save.userTeamId);
      singleResult = buildCupMatchResult(mdResult, save.userTeamId, event0, allTeams);
    } else {
      const cupState = save.cups?.[event0.cupId];
      const twoLeg = isTwoLegRound(event0.cupId, event0.roundName, 1) || isTwoLegRound(event0.cupId, event0.roundName, 2);
      const knockout = twoLeg
        ? { userWon:userGoals > oppGoals, penalties:false, extraTime:false }
        : resolveSingleLegKnockout(userGoals, oppGoals, matchResult.seed);
      const progress = resolveCupProgress(
        event0.cupId,
        event0.roundName,
        event0.roundIdx ?? 0,
        cupState,
        userGoals,
        oppGoals,
        knockout.userWon,
        userIsHome,
        matchResult.seed,
      );
      aggregate = progress.aggregate;
      updatedCups[event0.cupId] = {
        ...cupState,
        roundIndex:progress.roundIndex,
        status:progress.status,
        bracketSeed:inheritBracketSeed(event0.cupId, event0.roundName, cupState, event0.opponentSeed, progress),
        results:[
          ...(cupState?.results ?? []),
          {
            cupId:event0.cupId,
            // Quick Sim's row carries these; Broadcast's must too, or the same
            // tie reads as an unnamed round in the competition history.
            roundName:event0.roundName,
            roundIdx:event0.roundIdx ?? 0,
            gameweek:event0.gw,
            userGoals, oppGoals, userWon:aggregate ? aggregate.userWon : knockout.userWon,
            userIsHome, opponentId:event0.opponentId, opponentName:event0.opponentName,
            opponentSeed:event0.opponentSeed ?? null,
            penalties:aggregate?.penalties ?? knockout.penalties,
            extraTime:aggregate?.extraTime ?? knockout.extraTime,
            homeFormation:matchResult.homeFormation,
            awayFormation:matchResult.awayFormation,
            homeMentality:matchResult.homeMentality,
            awayMentality:matchResult.awayMentality,
            homeTactics:matchResult.homeTactics,
            awayTactics:matchResult.awayTactics,
            seed:matchResult.seed,
            ...(aggregate ? { aggregate } : {}),
          },
        ],
      };
      singleResult = buildCupMatchResult(
        {
          userGoals, oppGoals, userIsHome,
          homeScorers:matchResult.homeScorers, awayScorers:matchResult.awayScorers,
          scorers:(matchResult.homeScorers ?? []).concat(matchResult.awayScorers ?? []),
          opponentId:event0.opponentId, opponentName:event0.opponentName,
          opponentSeed:event0.opponentSeed ?? null,
          stats:matchResult.stats, events:matchResult.events,
          fitnessUpdates:matchResult.fitnessUpdates, aggregate,
          penalties:aggregate?.penalties ?? knockout.penalties,
          extraTime:aggregate?.extraTime ?? knockout.extraTime,
          homeFormation:matchResult.homeFormation,
          awayFormation:matchResult.awayFormation,
          homeMentality:matchResult.homeMentality,
          awayMentality:matchResult.awayMentality,
          homeTactics:matchResult.homeTactics,
          awayTactics:matchResult.awayTactics,
          seed:matchResult.seed,
        },
        save.userTeamId, event0, allTeams,
      );
    }

    await applyDevelopment([matchResult]).catch(() => {});
  } else throw new Error('MATCH_EVENT_UNSUPPORTED');

  save = await gameweekCheckpointManagedEvent(save, event0, remaining, updatedCups, singleResult, allPlayers, canonicalFixture);
  if (event0.type === 'league') await settleWorldLeagueGameweek(gw, save, teamsById, playersByTeam);

  const gwDone = remaining.length === 0;
  const nextGW = gwDone ? gw + 1 : gw;
  const newDate = new Date(save.currentDate);
  if (gwDone) {
    await settleWorldLeagueGameweek(gw, save, teamsById, playersByTeam);
    const latestAfterLeague = await getSave();
    const competitionSave = await settleWorldCompetitionGameweek(gw, latestAfterLeague, allTeams);
    const end = await runEndOfWorldGameweek(competitionSave, gwFixtures);
    recoveredPlayers = end.recoveredPlayers;
    newOffers = end.newOffers;
    playerResponses = end.playerResponses;
    newDate.setDate(newDate.getDate() + 7);
  }

  if (gwDone) {
    const freshSave = await getSave();
    await putSave({ ...freshSave, currentGameweek:nextGW, currentDate:newDate.toISOString(), pendingEvents:[], pendingEventsWeekKey:null });
  }

  return {
    singleResult, eventType:event0?.type, cupResults:[], gameweek:gw, nextGW,
    finished:nextGW > getEffectiveTotalGW(save), eventsLeft:remaining.length,
    newOffers, playerResponses, recoveredPlayers,
  };
}

export function buildCupMatchResult(r, userTeamId, event, allTeams) {
  const teamsById = new Map(allTeams.map(t => [t.id, t]));
  const defaultStats = { possession:{home:50,away:50}, shots:{home:0,away:0}, shotsOnTarget:{home:0,away:0}, xG:{home:0,away:0}, corners:{home:0,away:0}, fouls:{home:0,away:0}, yellowCards:{home:0,away:0} };
  const authoritativePlan = {
    homeFormation:r.homeFormation,
    awayFormation:r.awayFormation,
    homeMentality:r.homeMentality,
    awayMentality:r.awayMentality,
    homeTactics:r.homeTactics,
    awayTactics:r.awayTactics,
    seed:r.seed,
    penalties:r.penalties ?? r.aggregate?.penalties ?? false,
    extraTime:r.extraTime ?? r.aggregate?.extraTime ?? false,
  };
  if (event.type === 'ucl_md' || event.leaguePhase) {
    const userIsHome = r.userIsHome ?? true;
    const userName = teamsById.get(userTeamId)?.name ?? 'Your Team';
    const userCrest = teamsById.get(userTeamId)?.crest ?? '⚽';
    const oppId = r.opponentId ?? event.opponentId ?? 'opp';
    return {
      isCupMatch:true, cupId:event.cupId ?? 'ucl', cupName:event.cupName ?? 'Champions League', cupIcon:event.cupIcon ?? '⭐',
      isUCLMatchday:event.type === 'ucl_md', matchday:r.matchday,
      opponentName:r.opponentName, opponentNation:r.opponentNation,
      userGoals:r.userGoals, oppGoals:r.oppGoals, points:r.points, result:r.result,
      scorers:r.scorers ?? [],
      homeTeamId:userIsHome ? userTeamId : oppId,
      awayTeamId:userIsHome ? oppId : userTeamId,
      homeGoals:userIsHome ? r.userGoals : r.oppGoals,
      awayGoals:userIsHome ? r.oppGoals : r.userGoals,
      homeTeamName:userIsHome ? userName : r.opponentName,
      awayTeamName:userIsHome ? r.opponentName : userName,
      homeTeamCrest:userIsHome ? userCrest : (r.opponentNation ?? event.opponentCrest ?? '⚽'),
      awayTeamCrest:userIsHome ? (r.opponentNation ?? event.opponentCrest ?? '⚽') : userCrest,
      homeScorers:r.homeScorers ?? (userIsHome ? (r.scorers ?? []) : []),
      awayScorers:r.awayScorers ?? (userIsHome ? [] : (r.scorers ?? [])),
      events:r.events ?? [], stats:r.stats ?? defaultStats,
      fitnessUpdates:r.fitnessUpdates ?? [], isUserMatch:true, userTeamId, gameweek:event.gw,
      ...authoritativePlan,
    };
  }

  const userIsHome = r.userIsHome ?? true;
  const oppId = r.opponentId ?? event.opponentId ?? 'opp';
  return {
    isCupMatch:true, cupId:event.cupId, cupName:event.cupName, cupIcon:event.cupIcon,
    roundName:event.roundName,
    homeTeamId:userIsHome ? userTeamId : oppId,
    awayTeamId:userIsHome ? oppId : userTeamId,
    homeGoals:userIsHome ? r.userGoals : r.oppGoals,
    awayGoals:userIsHome ? r.oppGoals : r.userGoals,
    homeTeamName:userIsHome ? (teamsById.get(userTeamId)?.name ?? 'Your Team') : (r.opponentName ?? event.opponentName ?? 'Opponent'),
    awayTeamName:userIsHome ? (r.opponentName ?? event.opponentName ?? 'Opponent') : (teamsById.get(userTeamId)?.name ?? 'Your Team'),
    homeTeamCrest:userIsHome ? (teamsById.get(userTeamId)?.crest ?? '⚽') : (event.opponentCrest ?? '⚽'),
    awayTeamCrest:userIsHome ? (event.opponentCrest ?? '⚽') : (teamsById.get(userTeamId)?.crest ?? '⚽'),
    homeScorers:r.homeScorers ?? (userIsHome ? (r.scorers ?? []) : (r.oppScorers ?? [])),
    awayScorers:r.awayScorers ?? (userIsHome ? (r.oppScorers ?? []) : (r.scorers ?? [])),
    events:r.events ?? [], stats:r.stats ?? defaultStats,
    fitnessUpdates:r.fitnessUpdates ?? [], isUserMatch:true, userTeamId,
    gameweek:event.gw, aggregate:r.aggregate ?? null,
    ...authoritativePlan,
  };
}

export async function simulateFixtures(fixtures, teamsById, playersByTeam, save) {
  const results = [];
  const toWrite = [];
  for (let index = 0; index < fixtures.length; index++) {
    const fixture = fixtures[index];
    const home = teamsById.get(fixture.homeTeamId) ?? { id:fixture.homeTeamId, name:fixture.homeTeamId, crest:'⚽' };
    const away = teamsById.get(fixture.awayTeamId) ?? { id:fixture.awayTeamId, name:fixture.awayTeamId, crest:'⚽' };
    const result = simulateMatch(
      home, away,
      playersByTeam.get(fixture.homeTeamId) ?? [],
      playersByTeam.get(fixture.awayTeamId) ?? [],
    );
    const withContext = { ...result, gameweek:fixture.gameweek, league:fixture.league };
    toWrite.push(toCanonicalLeagueRecord(fixture, withContext, save.season));
    results.push(withContext);
    if ((index + 1) % WORLD_SIM_BATCH_SIZE === 0) await Promise.resolve();
  }
  if (toWrite.length) await putFixturesBulk(toWrite);
  return results;
}

export function buildHeavyLossMap(results) {
  const map = new Map();
  for (const r of results) {
    const hm = r.awayGoals - r.homeGoals;
    const am = r.homeGoals - r.awayGoals;
    if (hm >= 3) map.set(r.homeTeamId, hm);
    if (am >= 3) map.set(r.awayTeamId, am);
  }
  return map;
}

export async function updateCache(allPlayersIgnored, results) {
  await applyNonLeaguePlayerResults(results);
}

/**
 * Only players whose medical clock can advance belong in the weekly recovery
 * write set. Keeping this pure makes the no-full-world-rewrite contract easy to
 * verify independently of IndexedDB.
 */
export function injuryRecoveryWriteSet(allPlayers, weekKey = null) {
  return (allPlayers ?? []).filter(player => player?.injured
    && (!weekKey || player.injuryRecoverySettledKey !== weekKey));
}

export function settleInjuryRecovery(allPlayers, save) {
  const weekKey = `${save.season}:${save.currentGameweek}`;
  const rows = injuryRecoveryWriteSet(allPlayers, weekKey);
  const recovered = tickInjuryRecovery(rows);
  for (const player of rows) player.injuryRecoverySettledKey = weekKey;
  return { rows, recovered };
}

export async function processInjuryRecovery() {
  if (typeof tickInjuryRecovery !== 'function') return [];
  const allPlayers = await getInjuredPlayers();
  const save = await getSave();
  const { rows, recovered } = settleInjuryRecovery(allPlayers, save);
  if (rows.length) await putPlayersBulk(rows);
  return recovered.filter(p => p.teamId === save.userTeamId);
}

export function groupByTeam(players) {
  const map = new Map();
  for (const player of players) {
    if (!map.has(player.teamId)) map.set(player.teamId, []);
    map.get(player.teamId).push(player);
  }
  return map;
}

export function updatePlayerStats(cache, results) {
  applyWorldPlayerStats(cache, results);
}

export function awardCS(cache, teamId) {
  for (const p of cache.values()) {
    if (p.teamId === teamId && p.position === 'GK' && p.inSquad !== false && !p.injured) {
      p.cleanSheets = (p.cleanSheets ?? 0) + 1;
      p._played = true;
      p._cleanSheet = true;
      break;
    }
  }
}

export function applyFitnessUpdates(cache, results) {
  for (const r of results) {
    for (const fu of r.fitnessUpdates ?? []) {
      const p = cache.get(fu.id);
      if (p) { p.fitness = fu.newFitness; p._played = true; }
    }
  }
}

export function applyInjuryUpdates(cache, results) {
  if (typeof applyInjury !== 'function') return;
  for (const r of results) {
    for (const evt of r.events ?? []) {
      if (evt.type !== 'injury') continue;
      const p = cache.get(evt.playerId);
      if (!p) continue;
      applyInjury(p, {
        injuryName:evt.injuryName,
        injuryType:evt.injuryType ?? 'unknown',
        injuryGWsLeft:evt.injuryGWsLeft,
        injuryGWsTotal:evt.injuryGWsLeft,
      });
    }
  }
}
