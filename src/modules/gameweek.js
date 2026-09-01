import { getAllFixtures, getAllPlayers, getAllTeams, getFixturesByGW, getPlayersByTeam, getSave, putFixture, putFixturesBulk, putPlayersBulk, putSave } from './db.js';
import { simulateMatch } from './matchEngine.js';
import { applyManagerDNAResult, decorateManagedPlayers, decorateManagedTeam } from './managerTactics.js';
import { buildPersonalStatePatches } from './playerModel.js';
import { updateTeamMorale } from './standings.js';
import { CUP_META, UCL_CLUBS, simulateCupRound, simulateEuropeanLeaguePhaseMatchday, resolveCupProgress, resolveSingleLegKnockout } from './cups.js';
import { finishLeaguePhase, getCompetitionRules, getUefaKnockoutOpponentSeeds, getUefaKnockoutSeeding, isTwoLegRound, isUefaCompetition } from './competitionRules.js';
import { advanceTransferMarketWeek } from './transfers.js';
import { applyDevelopment } from './potential.js';
import { applyInjury, tickInjuryRecovery } from './injuries.js';
import { payWeeklyWages } from './season.js';
import { applyWorldPlayerStats, toCanonicalLeagueRecord } from './world.js';
import { advanceWorldCompetitions } from './worldCompetitions.js';
import { applyNonLeaguePlayerResults, applyPendingWorldCompetitionProjections, applyPendingWorldLeagueProjections } from './worldRuntime.js';

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
      if (rules.leaguePhase.gws.includes(gw) && matchday < rules.leaguePhase.matches) {
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

export async function getNextMatchEvent() {
  const save = await getSave();
  if (save.currentGameweek > getEffectiveTotalGW(save)) return null;
  if (save.pendingEvents?.length) return save.pendingEvents[0];
  const gw = save.currentGameweek;
  const fixtures = await getFixturesByGW(gw);
  const allTeams = await getAllTeams();
  const events = buildPendingEvents(gw, save.userTeamId, fixtures, save.cups, allTeams);
  if (!events.length) return { type:'no_user_event', gw };
  await putSave({ ...save, pendingEvents:events });
  return events[0];
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

async function settleWorldCompetitionGameweek(gw, save, allTeams) {
  let workingSave = save;
  const recovered = await applyPendingWorldCompetitionProjections(workingSave);
  if (recovered.results.length) {
    workingSave = recovered.save ?? workingSave;
    await applyDevelopment(recovered.results).catch(() => {});
  }
  if (!workingSave?.worldCompetitions?.competitions) return workingSave;

  const freshPlayers = await getAllPlayers();
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
  // P3 personal state observes the fully projected world week before injury
  // recovery advances the medical clock. The per-player settled-week key makes
  // this safe to retry if closeout is interrupted before the world clock itself
  // advances, including after gameweek numbers repeat in a later season.
  // This write is fail-closed: if the P3 lifecycle cannot persist, the caller
  // must not advance the shared world clock and silently skip a player week.
  const personalStatePatches = await settleWorldPersonalState(
    save.currentGameweek,
    save.season,
    save.userTeamId,
    fixtures,
  );
  const recoveredPlayers = await processInjuryRecovery().catch(() => []);
  // P4 advances transfers once per completed world week. The persisted tick key
  // makes retries safe and prevents one market step per pending fixture.
  const marketResult = await advanceTransferMarketWeek(save).catch(() => ({ newOffers:[], playerResponses:[] }));
  const newOffers = marketResult.newOffers ?? [];
  const playerResponses = marketResult.playerResponses ?? [];
  await payWeeklyWages().catch(() => {});
  await updateTeamMorale(save.userTeamId).catch(() => {});
  return { recoveredPlayers, newOffers, playerResponses, personalStatePatches };
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
  let [allTeams, allPlayers, gwFixtures] = await Promise.all([
    getAllTeams(), getAllPlayers(), getFixturesByGW(gw),
  ]);

  // Recover a canonical P1 result left pending by a tab close. The atomic
  // projection either applies the whole batch or nothing, so this cannot double.
  const recoveredProjection = await applyPendingWorldLeagueProjections(gwFixtures);
  if (recoveredProjection.length) {
    allPlayers = await getAllPlayers();
    gwFixtures = await getFixturesByGW(gw);
  }

  const teamsById = new Map(allTeams.map(t => [t.id, t]));
  const playersByTeam = groupByTeam(allPlayers);
  let pending = save.pendingEvents?.length
    ? [...save.pendingEvents]
    : buildPendingEvents(gw, save.userTeamId, gwFixtures, save.cups, allTeams);

  if (!pending.length) {
    await settleWorldLeagueGameweek(gw, save, teamsById, playersByTeam);
    const latestAfterLeague = await getSave();
    const competitionSave = await settleWorldCompetitionGameweek(gw, latestAfterLeague, allTeams);
    const { recoveredPlayers, newOffers, playerResponses } = await runEndOfWorldGameweek(competitionSave, gwFixtures);
    const freshSave = await getSave();
    const newDate = new Date(save.currentDate);
    newDate.setDate(newDate.getDate() + 7);
    await putSave({ ...freshSave, currentGameweek:gw + 1, currentDate:newDate.toISOString(), pendingEvents:[] });
    return {
      skipped:true, gameweek:gw, nextGW:gw + 1,
      finished:gw + 1 > getEffectiveTotalGW(save), newOffers, playerResponses, recoveredPlayers,
    };
  }

  const event = pending[0];
  const remaining = pending.slice(1);
  let singleResult = null;
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
      const home = userIsHome ? decorateManagedTeam(rawHome, save) : rawHome;
      const away = userIsHome ? rawAway : decorateManagedTeam(rawAway, save);
      const hPl = userIsHome ? decorateManagedPlayers(rawHomePlayers, save) : rawHomePlayers;
      const aPl = userIsHome ? rawAwayPlayers : decorateManagedPlayers(rawAwayPlayers, save);
      const fm = overrideFormation ?? save.formation ?? '4-3-3';
      const hFm = userIsHome ? fm : undefined;
      const aFm = userIsHome ? undefined : fm;
      const hLineup = userIsHome ? (save.lineup ?? null) : null;
      const aLineup = userIsHome ? null : (save.lineup ?? null);
      const hMentality = userIsHome ? (save.mentality ?? 'balanced') : undefined;
      const aMentality = userIsHome ? undefined : (save.mentality ?? 'balanced');
      const result = simulateMatch(home, away, hPl, aPl, hFm, aFm, hLineup, aLineup, hMentality, aMentality);
      await putFixture(toCanonicalLeagueRecord(fix, result, save.season));
      const worldResults = await settleWorldLeagueGameweek(gw, save, teamsById, playersByTeam);
      singleResult = { ...result, isUserMatch:true, userTeamId:save.userTeamId, gameweek:gw };
      // settleWorldLeagueGameweek already projects the managed result together
      // with the background leagues; keep its result list available to dev only.
      void worldResults;
    }
    pending = remaining;

  } else if (event.type === 'ucl_md' || (event.type === 'cup' && event.leaguePhase)) {
    const cupId = event.cupId ?? 'ucl';
    const userTeam = decorateManagedTeam(allTeams.find(t => t.id === save.userTeamId), save);
    const userPlayers = decorateManagedPlayers(playersByTeam.get(save.userTeamId) ?? [], save);
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
    );
    if (mdResult) {
      updatedCups[cupId] = updateLeaguePhaseCupState(cupId, cupState, mdResult, save.userTeamId);
      const reportResult = {
        ...mdResult,
        opponentId:mdResult.opponentId ?? event.opponentId,
        opponentName:mdResult.opponentName ?? event.opponentName ?? event.oppName,
      };
      cupResults.push(reportResult);
      singleResult = buildCupMatchResult(reportResult, save.userTeamId, event, allTeams);
      await applyNonLeaguePlayerResults([mdResult]).catch(() => {});
      await applyDevelopment([mdResult]).catch(() => {});
    }
    pending = remaining;

  } else if (event.type === 'cup') {
    const userTeam = decorateManagedTeam(allTeams.find(t => t.id === save.userTeamId), save);
    const userPlayers = decorateManagedPlayers(playersByTeam.get(save.userTeamId) ?? [], save);
    const cupState = save.cups?.[event.cupId];
    const result = simulateCupRound(userTeam, userPlayers, allTeams, playersByTeam, event.cupId, event.roundName, {
      ...event,
      userMentality:save.mentality ?? 'balanced',
      userFormation:overrideFormation ?? save.formation ?? '4-3-3',
      userLineup:save.lineup ?? null,
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
    await applyNonLeaguePlayerResults([result]).catch(() => {});
    await applyDevelopment([result]).catch(() => {});
    pending = remaining;
  }

  const gwDone = pending.length === 0;
  const nextGW = gwDone ? gw + 1 : gw;
  const newDate = new Date(save.currentDate);

  if (gwDone) {
    // Weeks with a cup but no managed league match still advance every other
    // domestic league and background competition on the same date before the
    // shared world clock moves forward.
    await settleWorldLeagueGameweek(gw, save, teamsById, playersByTeam);
    const latestAfterLeague = await getSave();
    const competitionSave = await settleWorldCompetitionGameweek(gw, latestAfterLeague, allTeams);
    const end = await runEndOfWorldGameweek(competitionSave, gwFixtures);
    recoveredPlayers = end.recoveredPlayers;
    newOffers = end.newOffers;
    playerResponses = end.playerResponses;
    newDate.setDate(newDate.getDate() + 7);
  }

  const freshSave = gwDone ? await getSave() : save;
  const userPlayersForDNA = playersByTeam.get(save.userTeamId) ?? [];
  const userIsHomeForDNA = event.userIsHome ?? (singleResult?.homeTeamId === save.userTeamId);
  const saveWithDNA = singleResult
    ? applyManagerDNAResult(freshSave, singleResult, event, userIsHomeForDNA, userPlayersForDNA)
    : freshSave;
  await putSave({
    ...saveWithDNA,
    currentGameweek:nextGW,
    currentDate:gwDone ? newDate.toISOString() : save.currentDate,
    cups:updatedCups,
    pendingEvents:pending,
  });

  return {
    singleResult, eventType:event.type, cupResults, gameweek:gw, nextGW,
    finished:nextGW > getEffectiveTotalGW(save), eventsLeft:pending.length,
    newOffers, playerResponses, recoveredPlayers,
  };
}

export async function advanceOneFixtureWithResult(matchResult, event, userIsHome) {
  let save = await getSave();
  const recoveredCompetition = await applyPendingWorldCompetitionProjections(save);
  if (recoveredCompetition.results.length) {
    save = recoveredCompetition.save ?? save;
    await applyDevelopment(recoveredCompetition.results).catch(() => {});
  }

  const gw = save.currentGameweek;
  let [allTeams, allPlayers, gwFixtures] = await Promise.all([
    getAllTeams(), getAllPlayers(), getFixturesByGW(gw),
  ]);

  const recoveredProjection = await applyPendingWorldLeagueProjections(gwFixtures);
  if (recoveredProjection.length) {
    allPlayers = await getAllPlayers();
    gwFixtures = await getFixturesByGW(gw);
  }

  const teamsById = new Map(allTeams.map(t => [t.id, t]));
  const playersByTeam = groupByTeam(allPlayers);
  const pending = save.pendingEvents?.length
    ? [...save.pendingEvents]
    : buildPendingEvents(gw, save.userTeamId, gwFixtures, save.cups, allTeams);
  const event0 = pending[0] ?? event;
  const remaining = pending.slice(1);
  const updatedCups = JSON.parse(JSON.stringify(save.cups ?? {}));
  let singleResult = null;
  let recoveredPlayers = [];
  let newOffers = [];
  let playerResponses = [];

  if (event0?.type === 'league') {
    const fix = gwFixtures.find(f => f.id === event0.fixtureId);
    if (fix) {
      await putFixture(toCanonicalLeagueRecord(fix, matchResult, save.season));
      await settleWorldLeagueGameweek(gw, save, teamsById, playersByTeam);
    }
    singleResult = { ...matchResult, isUserMatch:true, userTeamId:save.userTeamId, gameweek:gw };

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

    await applyNonLeaguePlayerResults([matchResult]).catch(() => {});
    await applyDevelopment([matchResult]).catch(() => {});
  }

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

  const freshSave = gwDone ? await getSave() : save;
  const userPlayersForDNA = playersByTeam.get(save.userTeamId) ?? [];
  const saveWithDNA = singleResult
    ? applyManagerDNAResult(freshSave, singleResult, event0, userIsHome, userPlayersForDNA)
    : freshSave;
  await putSave({
    ...saveWithDNA,
    currentGameweek:nextGW,
    currentDate:gwDone ? newDate.toISOString() : save.currentDate,
    cups:updatedCups,
    pendingEvents:remaining,
  });

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
    // Keep the background engine responsive without making Broadcast the world engine.
    if ((index + 1) % WORLD_SIM_BATCH_SIZE === 0) await Promise.resolve();
  }
  if (toWrite.length) await putFixturesBulk(toWrite);
  return results;
}

// Compatibility helpers remain exported for the legacy validator and focused tests.
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
export function injuryRecoveryWriteSet(allPlayers) {
  return (allPlayers ?? []).filter(player => player?.injured);
}

export async function processInjuryRecovery() {
  if (typeof tickInjuryRecovery !== 'function') return [];
  const allPlayers = await getAllPlayers();
  const save = await getSave();
  const hadInjured = allPlayers.some(p => p.injured);
  if (!hadInjured) return [];
  const recoveryRows = injuryRecoveryWriteSet(allPlayers);
  const recovered = tickInjuryRecovery(recoveryRows);
  await putPlayersBulk(recoveryRows);
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
