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

/** modules/gameweek.js â€” one user-event queue over a single P2 world clock. */

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
          crest: known?.nation ?? known?.crest ?? 'âš½',
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
    opponent: pick ? { id:pick.id, name:pick.name, crest:pick.crest ?? 'âš½', rep:pick.reputation ?? 70 } : null,
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
          opponentCrest:opp?.nation ?? 'ğŸŒ',
          opponentRep:opp?.strength ?? 72,
          oppName:opp?.name ?? 'European Club',
          oppNation:opp?.nation ?? 'ğŸŒ',
          oppStrength:opp?.strength ?? 72,
          userIsHome:resolveLeaguePhaseHome(state, rules.leaguePhase, matchday),
        };
        if (cupId === 'ucl') events.push({ type:'ucl_md', ...base });
        else events.push({
          type:'cup', ...base, roundIdx:null,
          roundName:`League Phase Â· Matchday ${matchday + 1}`,
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
      opponentCrest:draw.opponent?.crest ?? 'âš½',
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
      const rawHome = teamsById.get(fix.homeTeamId) ?? { id:fix.homeTeamId, name:fix.homeTeamId, crest:'âš½' };
      const rawAway = teamsById.get(fix.awayTeamId) ?? { id:fix.awayTeamId, name:fix.awayTeamId, crest:'âš½' };
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

  const gw = save.currentGamewe×Mº¶‰ËkºwµçUX[\ÊNÂˆH[ÙHÂˆÛÛœİİ\İ]HHØ]™K˜İ\ÏË–Ù]™[˜İ\YNÂˆÛÛœİÛÓYÈH\ÕÛÓYÔ›İ[™
]™[˜İ\Y]™[œ›İ[™˜[YKJH\ÕÛÓYÔ›İ[™
]™[˜İ\Y]™[œ›İ[™˜[YKŠNÂˆÛÛœİÛ›ØÚÛİ]HÛÓYÂˆÈÈ\Ù\•ÛÛ\Ù\‘ÛØ[ÈˆÜÛØ[Ë[˜[Y\Î™˜[ÙK^˜U[YN™˜[ÙHBˆˆ™\ÛÛ™TÚ[™ÛSYÒÛ›ØÚÛİ]
\Ù\‘ÛØ[ËÜÛØ[ËX]Ú™\İ[œÙYY
NÂˆÛÛœİ›ÙÜ™\ÜÈH™\ÛÛ™Pİ\›ÙÜ™\ÜÊˆ]™[˜İ\Yˆ]™[œ›İ[™˜[YKˆ]™[œ›İ[™YÏÈˆİ\İ]Kˆ\Ù\‘ÛØ[ËˆÜÛØ[ËˆÛ›ØÚÛİ]\Ù\•ÛÛ‹ˆ\Ù\’\ÒÛYKˆX]Ú™\İ[œÙYYˆ
NÂˆYÙÜ™YØ]HH›ÙÜ™\ÜË˜YÙÜ™YØ]NÂˆ\]Yİ\ÖÙ]™[˜İ\YHHÂˆ‹‹˜İ\İ]Kˆ›İ[™[™^œ›ÙÜ™\ÜËœ›İ[™[™^ˆİ]\Îœ›ÙÜ™\ÜËœİ]\Ëˆœ˜XÚÙ]ÙYYš[š\š]œ˜XÚÙ]ÙYY
]™[˜İ\Y]™[œ›İ[™˜[YKİ\İ]K]™[›ÜÛ™[ÙYY›ÙÜ™\ÜÊKˆ™\İ[Î–Âˆ‹‹Šİ\İ]OËœ™\İ[ÈÏÈ×JKˆÂˆ\Ù\‘ÛØ[ËÜÛØ[Ë\Ù\•ÛÛ˜YÙÜ™YØ]HÈYÙÜ™YØ]K\Ù\•ÛÛˆˆÛ›ØÚÛİ]\Ù\•ÛÛ‹ˆ\Ù\’\ÒÛYKÜÛ™[Y™]™[›ÜÛ™[YÜÛ™[˜[YN™]™[›ÜÛ™[˜[YKˆÜÛ™[ÙYY™]™[›ÜÛ™[ÙYYÏÈ[ˆ[˜[Y\Î˜YÙÜ™YØ]OËœ[˜[Y\ÈÏÈÛ›ØÚÛİ]œ[˜[Y\Ëˆ^˜U[YN˜YÙÜ™YØ]OË™^˜U[YHÏÈÛ›ØÚÛİ]™^˜U[YKˆÛYQ›Ü›X][Û›X]Ú™\İ[šÛYQ›Ü›X][Û‹ˆ]Ø^Q›Ü›X][Û›X]Ú™\İ[˜]Ø^Q›Ü›X][Û‹ˆÛYSY[[]N›X]Ú™\İ[šÛYSY[[]Kˆ]Ø^SY[[]N›X]Ú™\İ[˜]Ø^SY[[]KˆÛYUXİXÜÎ›X]Ú™\İ[šÛYUXİXÜËˆ]Ø^UXİXÜÎ›X]Ú™\İ[˜]Ø^UXİXÜËˆÙYY›X]Ú™\İ[œÙYYˆ‹‹ŠYÙÜ™YØ]HÈÈYÙÜ™YØ]HHˆßJKˆKˆKˆNÂˆÚ[™ÛT™\İ[HZ[İ\X]Ú™\İ[
ˆÂˆ\Ù\‘ÛØ[ËÜÛØ[Ë\Ù\’\ÒÛYKˆÛYTØÛÜ™\œÎ›X]Ú™\İ[šÛYTØÛÜ™\œË]Ø^TØÛÜ™\œÎ›X]Ú™\İ[˜]Ø^TØÛÜ™\œËˆØÛÜ™\œÎŠX]Ú™\İ[šÛYTØÛÜ™\œÈÏÈ×JK˜ÛÛ˜Ø]
X]Ú™\İ[˜]Ø^TØÛÜ™\œÈÏÈ×JKˆÜÛ™[Y™]™[›ÜÛ™[YÜÛ™[˜[YN™]™[›ÜÛ™[˜[YKˆÜÛ™[ÙYY™]™[›ÜÛ™[ÙYYÏÈ[ˆİ]Î›X]Ú™\İ[œİ]Ë]™[Î›X]Ú™\İ[™]™[Ëˆš]™\ÜÕ\]\Î›X]Ú™\İ[™š]™\ÜÕ\]\ËYÙÜ™YØ]Kˆ[˜[Y\Î˜YÙÜ™YØ]OËœ[˜[Y\ÈÏÈÛ›ØÚÛİ]œ[˜[Y\Ëˆ^˜U[YN˜YÙÜ™YØ]OË™^˜U[YHÏÈÛ›ØÚÛİ]™^˜U[YKˆÛYQ›Ü›X][Û›X]Ú™\İ[šÛYQ›Ü›X][Û‹ˆ]Ø^Q›Ü›X][Û›X]Ú™\İ[˜]Ø^Q›Ü›X][Û‹ˆÛYSY[[]N›X]Ú™\İ[šÛYSY[[]Kˆ]Ø^SY[[]N›X]Ú™\İ[˜]Ø^SY[[]KˆÛYUXİXÜÎ›X]Ú™\İ[šÛYUXİXÜËˆ]Ø^UXİXÜÎ›X]Ú™\İ[˜]Ø^UXİXÜËˆÙYY›X]Ú™\İ[œÙYYˆKˆØ]™K\Ù\•X[RY]™[[X[\Ëˆ
NÂˆB‚ˆ]ØZ]\S›Û“XYİYT^Y\”™\İ[ÊÛX]Ú™\İ[JK˜Ø]Ú


HOˆßJNÂˆ]ØZ]\Q]™[ÜY[
ÛX]Ú™\İ[JK˜Ø]Ú


HOˆßJNÂˆB‚ˆÛÛœİİÑÛ™HH™[XZ[š[™Ë›[™İOOHÂˆÛÛœİ™^ÕÈHİÑÛ™HÈİÈ
ÈHˆİÎÂˆÛÛœİ™]Ñ]HH™]È]JØ]™K˜İ\œ™[]JNÂˆYˆ
İÑÛ™JHÂˆ]ØZ]Ù]UÛÜ›XYİYQØ[Y]ÙYZÊİËØ]™KX[\ĞRY^Y\œĞUX[JNÂˆÛÛœİ]\İY\“XYİYHH]ØZ]Ù]Ø]™J
NÂˆÛÛœİÛÛ\]][Û”Ø]™HH]ØZ]Ù]UÛÜ›ÛÛ\]][Û‘Ø[Y]ÙYZÊİË]\İY\“XYİYK[X[\ÊNÂˆÛÛœİ[™H]ØZ][‘[™Ù•ÛÜ›Ø[Y]ÙYZÊÛÛ\]][Û”Ø]™KİÑš^\™\ÊNÂˆ™XÛİ™\™Y^Y\œÈH[™œ™XÛİ™\™Y^Y\œÎÂˆ™]ÓÙ™™\œÈH[™›™]ÓÙ™™\œÎÂˆ^Y\”™\ÜÛœÙ\ÈH[™œ^Y\”™\ÜÛœÙ\ÎÂˆ™]Ñ]KœÙ]]J™]Ñ]K™Ù]]J
H
ÈÊNÂˆB‚ˆÛÛœİœ™\ÚØ]™HHİÑÛ™HÈ]ØZ]Ù]Ø]™J
HˆØ]™NÂˆÛÛœİ\Ù\”^Y\œÑ›Ü‘HH^Y\œĞUX[K™Ù]
Ø]™K\Ù\•X[RY
HÏÈ×NÂˆÛÛœİØ]™UÚ]HHÚ[™ÛT™\İ[ˆÈ\SX[˜YÙ\‘T™\İ[
œ™\ÚØ]™KÚ[™ÛT™\İ[]™[\Ù\’\ÒÛYK\Ù\”^Y\œÑ›Ü‘JBˆˆœ™\ÚØ]™NÂˆ]ØZ]]Ø]™JÂˆ‹‹œØ]™UÚ]Kˆİ\œ™[Ø[Y]ÙYZÎ›™^ÕËˆİ\œ™[]N™İÑÛ™HÈ™]Ñ]KÒTÓÔİš[™Ê
HˆØ]™K˜İ\œ™[]Kˆİ\Î\]Yİ\Ëˆ[™[™Ñ]™[Îœ™[XZ[š[™ËˆJNÂ‚ˆ™]\›ˆÂˆÚ[™ÛT™\İ[]™[\N™]™[Ë\Kİ\™\İ[Î–×KØ[Y]ÙYZÎ™İË™^ÕËˆš[š\ÚY›™^ÕÈˆÙ]Y™™Xİ]™Uİ[ÕÊØ]™JK]™[ÓYœ™[XZ[š[™Ë›[™İˆ™]ÓÙ™™\œË^Y\”™\ÜÛœÙ\Ë™XÛİ™\™Y^Y\œËˆNÂŸB‚™^Ü[˜İ[ÛˆZ[İ\X]Ú™\İ[
‹\Ù\•X[RY]™[[X[\ÊHÂˆÛÛœİX[\ĞRYH™]ÈX\
[X[\Ë›X\
OˆİšYJJNÂˆÛÛœİY˜][İ]ÈHÈÜÜÙ\ÜÚ[ÛÚÛYNL]Ø^NLKÚİÎÚÛYNŒ]Ø^NŒKÚİÓÛ•\™Ù]ÚÛYNŒ]Ø^NŒKÎÚÛYNŒ]Ø^NŒKÛÜ›™\œÎÚÛYNŒ]Ø^NŒK›İ[ÎÚÛYNŒ]Ø^NŒKY[İĞØ\™ÎÚÛYNŒ]Ø^NŒHNÂˆÛÛœİ]]Üš]]]™T[ˆHÂˆÛYQ›Ü›X][Ûœ‹šÛYQ›Ü›X][Û‹ˆ]Ø^Q›Ü›X][Ûœ‹˜]Ø^Q›Ü›X][Û‹ˆÛYSY[[]Nœ‹šÛYSY[[]Kˆ]Ø^SY[[]Nœ‹˜]Ø^SY[[]KˆÛYUXİXÜÎœ‹šÛYUXİXÜËˆ]Ø^UXİXÜÎœ‹˜]Ø^UXİXÜËˆÙYYœ‹œÙYYˆ[˜[Y\Îœ‹œ[˜[Y\ÈÏÈ‹˜YÙÜ™YØ]OËœ[˜[Y\ÈÏÈ˜[ÙKˆ^˜U[YNœ‹™^˜U[YHÏÈ‹˜YÙÜ™YØ]OË™^˜U[YHÏÈ˜[ÙKˆNÂˆYˆ
]™[\HOOH	İXÛÛY	È]™[›XYİYT\ÙJHÂˆÛÛœİ\Ù\’\ÒÛYHH‹\Ù\’\ÒÛYHÏÈYNÂˆÛÛœİ\Ù\“˜[YHHX[\ĞRY™Ù]
\Ù\•X[RY
OË›˜[YHÏÈ	Ö[İ\ˆX[IÎÂˆÛÛœİ\Ù\Ü™\İHX[\ĞRY™Ù]
\Ù\•X[RY
OË˜Ü™\İÏÈ	ø¦¯IÎÂˆÛÛœİÜYH‹›ÜÛ™[YÏÈ]™[›ÜÛ™[YÏÈ	ÛÜ	ÎÂˆ™]\›ˆÂˆ\Ğİ\X]ÚYKİ\Y™]™[˜İ\YÏÈ	İXÛ	Ëİ\˜[YN™]™[˜İ\˜[YHÏÈ	ĞÚ[\[ÛœÈXYİYIËİ\XÛÛ™]™[˜İ\XÛÛˆÏÈ	ø«d	Ëˆ\ÕPÓX]Ú^N™]™[\HOOH	İXÛÛY	ËX]Ú^Nœ‹›X]Ú^KˆÜÛ™[˜[YNœ‹›ÜÛ™[˜[YKÜÛ™[˜][Ûœ‹›ÜÛ™[˜][Û‹ˆ\Ù\‘ÛØ[Îœ‹\Ù\‘ÛØ[ËÜÛØ[Îœ‹›ÜÛØ[ËÚ[Îœ‹œÚ[Ë™\İ[œ‹œ™\İ[ˆØÛÜ™\œÎœ‹œØÛÜ™\œÈÏÈ×KˆÛYUX[RY\Ù\’\ÒÛYHÈ\Ù\•X[RYˆÜYˆ]Ø^UX[RY\Ù\’\ÒÛYHÈÜYˆ\Ù\•X[RYˆÛYQÛØ[Î\Ù\’\ÒÛYHÈ‹\Ù\‘ÛØ[Èˆ‹›ÜÛØ[Ëˆ]Ø^QÛØ[Î\Ù\’\ÒÛYHÈ‹›ÜÛØ[Èˆ‹\Ù\‘ÛØ[ËˆÛYUX[S˜[YN\Ù\’\ÒÛYHÈ\Ù\“˜[YHˆ‹›ÜÛ™[˜[YKˆ]Ø^UX[S˜[YN\Ù\’\ÒÛYHÈ‹›ÜÛ™[˜[YHˆ\Ù\“˜[YKˆÛYUX[PÜ™\İ\Ù\’\ÒÛYHÈ\Ù\Ü™\İˆ
‹›ÜÛ™[˜][ÛˆÏÈ]™[›ÜÛ™[Ü™\İÏÈ	ø¦¯IÊKˆ]Ø^UX[PÜ™\İ\Ù\’\ÒÛYHÈ
‹›ÜÛ™[˜][ÛˆÏÈ]™[›ÜÛ™[Ü™\İÏÈ	ø¦¯IÊHˆ\Ù\Ü™\İˆÛYTØÛÜ™\œÎœ‹šÛYTØÛÜ™\œÈÏÈ
\Ù\’\ÒÛYHÈ
‹œØÛÜ™\œÈÏÈ×JHˆ×JKˆ]Ø^TØÛÜ™\œÎœ‹˜]Ø^TØÛÜ™\œÈÏÈ
\Ù\’\ÒÛYHÈ×Hˆ
‹œØÛÜ™\œÈÏÈ×JJKˆ]™[Îœ‹™]™[ÈÏÈ×Kİ]Îœ‹œİ]ÈÏÈY˜][İ]Ëˆš]™\ÜÕ\]\Îœ‹™š]™\ÜÕ\]\ÈÏÈ×K\Õ\Ù\“X]ÚYK\Ù\•X[RYØ[Y]ÙYZÎ™]™[™İËˆ‹‹˜]]Üš]]]™T[‹ˆNÂˆB‚ˆÛÛœİ\Ù\’\ÒÛYHH‹\Ù\’\ÒÛYHÏÈYNÂˆÛÛœİÜYH‹›ÜÛ™[YÏÈ]™[›ÜÛ™[YÏÈ	ÛÜ	ÎÂˆ™]\›ˆÂˆ\Ğİ\X]ÚYKİ\Y™]™[˜İ\Yİ\˜[YN™]™[˜İ\˜[YKİ\XÛÛ™]™[˜İ\XÛÛ‹ˆ›İ[™˜[YN™]™[œ›İ[™˜[YKˆÛYUX[RY\Ù\’\ÒÛYHÈ\Ù\•X[RYˆÜYˆ]Ø^UX[RY\Ù\’\ÒÛYHÈÜYˆ\Ù\•X[RYˆÛYQÛØ[Î\Ù\’\ÒÛYHÈ‹\Ù\‘ÛØ[Èˆ‹›ÜÛØ[Ëˆ]Ø^QÛØ[Î\Ù\’\ÒÛYHÈ‹›ÜÛØ[Èˆ‹\Ù\‘ÛØ[ËˆÛYUX[S˜[YN\Ù\’\ÒÛYHÈ
X[\ĞRY™Ù]
\Ù\•X[RY
OË›˜[YHÏÈ	Ö[İ\ˆX[IÊHˆ
‹›ÜÛ™[˜[YHÏÈ]™[›ÜÛ™[˜[YHÏÈ	ÓÜÛ™[	ÊKˆ]Ø^UX[S˜[YN\Ù\’\ÒÛYHÈ
‹›ÜÛ™[˜[YHÏÈ]™[›ÜÛ™[˜[YHÏÈ	ÓÜÛ™[	ÊHˆ
X[\ĞRY™Ù]
\Ù\•X[RY
OË›˜[YHÏÈ	Ö[İ\ˆX[IÊKˆÛYUX[PÜ™\İ\Ù\’\ÒÛYHÈ
X[\ĞRY™Ù]
\Ù\•X[RY
OË˜Ü™\İÏÈ	ø¦¯IÊHˆ
]™[›ÜÛ™[Ü™\İÏÈ	ø¦¯IÊKˆ]Ø^UX[PÜ™\İ\Ù\’\ÒÛYHÈ
]™[›ÜÛ™[Ü™\İÏÈ	ø¦¯IÊHˆ
X[\ĞRY™Ù]
\Ù\•X[RY
OË˜Ü™\İÏÈ	ø¦¯IÊKˆÛYTØÛÜ™\œÎœ‹šÛYTØÛÜ™\œÈÏÈ
\Ù\’\ÒÛYHÈ
‹œØÛÜ™\œÈÏÈ×JHˆ
‹›ÜØÛÜ™\œÈÏÈ×JJKˆ]Ø^TØÛÜ™\œÎœ‹˜]Ø^TØÛÜ™\œÈÏÈ
\Ù\’\ÒÛYHÈ
‹›ÜØÛÜ™\œÈÏÈ×JHˆ
‹œØÛÜ™\œÈÏÈ×JJKˆ]™[Îœ‹™]™[ÈÏÈ×Kİ]Îœ‹œİ]ÈÏÈY˜][İ]Ëˆš]™\ÜÕ\]\Îœ‹™š]™\ÜÕ\]\ÈÏÈ×K\Õ\Ù\“X]ÚYK\Ù\•X[RYˆØ[Y]ÙYZÎ™]™[™İËYÙÜ™YØ]Nœ‹˜YÙÜ™YØ]HÏÈ[ˆ‹‹˜]]Üš]]]™T[‹ˆNÂŸB‚™^Ü\Ş[˜È[˜İ[ÛˆÚ[][]Qš^\™\Êš^\™\ËX[\ĞRY^Y\œĞUX[KØ]™JHÂˆÛÛœİ™\İ[ÈH×NÂˆÛÛœİÕÜš]HH×NÂˆ›Üˆ
][™^HÈ[™^š^\™\Ë›[™İÈ[™^
ÊÊHÂˆÛÛœİš^\™HHš^\™\ÖÚ[™^NÂˆÛÛœİÛYHHX[\ĞRY™Ù]
š^\™KšÛYUX[RY
HÏÈÈY™š^\™KšÛYUX[RY˜[YN™š^\™KšÛYUX[RYÜ™\İ‰ø¦¯IÈNÂˆÛÛœİ]Ø^HHX[\ĞRY™Ù]
š^\™K˜]Ø^UX[RY
HÏÈÈY™š^\™K˜]Ø^UX[RY˜[YN™š^\™K˜]Ø^UX[RYÜ™\İ‰ø¦¯IÈNÂˆÛÛœİ™\İ[HÚ[][]SX]Ú
ˆÛYK]Ø^Kˆ^Y\œĞUX[K™Ù]
š^\™KšÛYUX[RY
HÏÈ×Kˆ^Y\œĞUX[K™Ù]
š^\™K˜]Ø^UX[RY
HÏÈ×Kˆ
NÂˆÛÛœİÚ]ÛÛ^HÈ‹‹œ™\İ[Ø[Y]ÙYZÎ™š^\™K™Ø[Y]ÙYZËXYİYN™š^\™K›XYİYHNÂˆÕÜš]Kœ\Ú
ĞØ[›ÛšXØ[XYİYT™XÛÜ™
š^\™KÚ]ÛÛ^Ø]™KœÙX\ÛÛŠJNÂˆ™\İ[Ëœ\Ú
Ú]ÛÛ^
NÂˆËÈÙY\H˜XÚÙÜ›İ[™[™Ú[™H™\ÜÛœÚ]™HÚ]İ]XZÚ[™Èœ›ØYØ\İHÛÜ›[™Ú[™K‚ˆYˆ

[™^
ÈJH	HÓÔ“ÔÒSWĞUÒÔÒV‘HOOH
H]ØZ]›ÛZ\ÙKœ™\ÛÛ™J
NÂˆBˆYˆ
ÕÜš]K›[™İ
H]ØZ]]š^\™\Ğ[ÊÕÜš]JNÂˆ™]\›ˆ™\İ[ÎÂŸB‚‹ËÈÛÛ\]Xš[]H[\œÈ™[XZ[ˆ^ÜY›ÜˆHYØXŞH˜[Y]Üˆ[™›Øİ\ÙY\İË‚™^Ü[˜İ[ÛˆZ[X]SÜÜÓX\
™\İ[ÊHÂˆÛÛœİX\H™]ÈX\

NÂˆ›Üˆ
ÛÛœİˆÙˆ™\İ[ÊHÂˆÛÛœİHH‹˜]Ø^QÛØ[ÈH‹šÛYQÛØ[ÎÂˆÛÛœİ[HH‹šÛYQÛØ[ÈH‹˜]Ø^QÛØ[ÎÂˆYˆ
HHÊHX\œÙ]
‹šÛYUX[RYJNÂˆYˆ
[HHÊHX\œÙ]
‹˜]Ø^UX[RY[JNÂˆBˆ™]\›ˆX\ÂŸB‚™^Ü\Ş[˜È[˜İ[Ûˆ\]PØXÚJ[^Y\œÒYÛ›Ü™Y™\İ[ÊHÂˆ]ØZ]\S›Û“XYİYT^Y\”™\İ[Ê™\İ[ÊNÂŸB‚‹ÊŠ‚ˆ
ˆÛ›H^Y\œÈÚÜÙHYYXØ[ÛØÚÈØ[ˆY˜[˜ÙH™[Û™È[ˆHÙYZÛH™XÛİ™\Bˆ
ˆÜš]HÙ]ˆÙY\[™È\È\™HXZÙ\ÈH›ËY[]ÛÜ›\™]Üš]HÛÛ˜XİX\ŞHÂˆ
ˆ™\šYH[™\[™[HÙˆ[™^Y‹‚ˆ
‹Â™^Ü[˜İ[Ûˆ[š\T™XÛİ™\UÜš]TÙ]
[^Y\œÊHÂˆ™]\›ˆ
[^Y\œÈÏÈ×JK™š[\Š^Y\ˆOˆ^Y\Ëš[š\™Y
NÂŸB‚™^Ü\Ş[˜È[˜İ[Ûˆ›ØÙ\ÜÒ[š\T™XÛİ™\J
HÂˆYˆ
\[ÙˆXÚÒ[š\T™XÛİ™\HOOH	Ù[˜İ[Û‰ÊH™]\›ˆ×NÂˆÛÛœİ[^Y\œÈH]ØZ]Ù][^Y\œÊ
NÂˆÛÛœİØ]™HH]ØZ]Ù]Ø]™J
NÂˆÛÛœİY[š\™YH[^Y\œËœÛÛYJOˆš[š\™Y
NÂˆYˆ
ZY[š\™Y
H™]\›ˆ×NÂˆÛÛœİ™XÛİ™\T›İÜÈH[š\T™XÛİ™\UÜš]TÙ]
[^Y\œÊNÂˆÛÛœİ™XÛİ™\™YHXÚÒ[š\T™XÛİ™\J™XÛİ™\T›İÜÊNÂˆ]ØZ]]^Y\œĞ[Ê™XÛİ™\T›İÜÊNÂˆ™]\›ˆ™XÛİ™\™Y™š[\ŠOˆX[RYOOHØ]™K\Ù\•X[RY
NÂŸB‚™^Ü[˜İ[ÛˆÜ›İ\UX[J^Y\œÊHÂˆÛÛœİX\H™]ÈX\

NÂˆ›Üˆ
ÛÛœİ^Y\ˆÙˆ^Y\œÊHÂˆYˆ
[X\š\Ê^Y\‹X[RY
JHX\œÙ]
^Y\‹X[RY×JNÂˆX\™Ù]
^Y\‹X[RY
Kœ\Ú
^Y\ŠNÂˆBˆ™]\›ˆX\ÂŸB‚™^Ü[˜İ[Ûˆ\]T^Y\”İ]ÊØXÚK™\İ[ÊHÂˆ\UÛÜ›^Y\”İ]ÊØXÚK™\İ[ÊNÂŸB‚™^Ü[˜İ[Ûˆ]Ø\™ÔÊØXÚKX[RY
HÂˆ›Üˆ
ÛÛœİÙˆØXÚK˜[Y\Ê
JHÂˆYˆ
X[RYOOHX[RY	‰ˆœÜÚ][ÛˆOOH	ÑÒÉÈ	‰ˆš[”Ü]XYOOH˜[ÙH	‰ˆ\š[š\™Y
HÂˆ˜ÛX[”ÚY]ÈH
˜ÛX[”ÚY]ÈÏÈ
H
ÈNÂˆ—Ü^YYHYNÂˆ—ØÛX[”ÚY]HYNÂˆœ™XZÎÂˆBˆBŸB‚™^Ü[˜İ[Ûˆ\Qš]™\ÜÕ\]\ÊØXÚK™\İ[ÊHÂˆ›Üˆ
ÛÛœİˆÙˆ™\İ[ÊHÂˆ›Üˆ
ÛÛœİHÙˆ‹™š]™\ÜÕ\]\ÈÏÈ×JHÂˆÛÛœİHØXÚK™Ù]
KšY
NÂˆYˆ

HÈ™š]™\ÜÈHK›™]Ñš]™\ÜÎÈ—Ü^YYHYNÈBˆBˆBŸB‚™^Ü[˜İ[Ûˆ\R[š\U\]\ÊØXÚK™\İ[ÊHÂˆYˆ
\[Ùˆ\R[š\HOOH	Ù[˜İ[Û‰ÊH™]\›Âˆ›Üˆ
ÛÛœİˆÙˆ™\İ[ÊHÂˆ›Üˆ
ÛÛœİ]Ùˆ‹™]™[ÈÏÈ×JHÂˆYˆ
]\HOOH	Ú[š\IÊHÛÛ[YNÂˆÛÛœİHØXÚK™Ù]
]œ^Y\’Y
NÂˆYˆ
\
HÛÛ[YNÂˆ\R[š\JÂˆ[š\S˜[YN™]š[š\S˜[YKˆ[š\U\N™]š[š\U\HÏÈ	İ[šÛ›İÛ‰Ëˆ[š\QÕÜÓY™]š[š\QÕÜÓYˆ[š\QÕÜÕİ[™]š[š\QÕÜÓYˆJNÂˆBˆBŸB