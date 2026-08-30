import { getAllFixtures, getAllPlayers, getAllTeams, getFixturesByGW, getSave, putFixture, putFixturesBulk, putPlayersBulk, putSave } from './db.js';
import { pickAIFormation, simulateMatch } from './matchEngine.js';
import { applyResult, recomputePositions, updateTeamMorale } from './standings.js';
import { CUP_META, UCL_CLUBS, simulateCupRound, simulateEuropeanLeaguePhaseMatchday, resolveCupProgress } from './cups.js';
import { finishLeaguePhase, getCompetitionRules, getUefaKnockoutOpponentSeeds, getUefaKnockoutSeeding, isTwoLegRound, isUefaCompetition } from './competitionRules.js';
import { generateAIOffers, simulateAILoans, simulateAITransfers } from './transfers.js';
import { applyDevelopment } from './potential.js';
import { applyInjury, tickInjuryRecovery } from './injuries.js';
import { payWeeklyWages } from './season.js';

/** modules/gameweek.js — One-event-per-press architecture: buildPendingEvents, advanceOneFixture */

export function getEffectiveTotalGW(save) {
  const leagueGWs = save.totalGameweeks ?? 38;
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
  // Leg one has not decided the tie yet. A losing side never inherits the
  // winner's bracket position either.
  if (isTwoLegRound(cupId, roundName, 1) || progress?.status === 'eliminated') return current;
  if (!Number.isInteger(opponentSeed)) return current;
  return current == null ? opponentSeed : Math.min(current, opponentSeed);
}

function resolveLeaguePhaseHome(state, phaseRules, matchday) {
  const planned = state?.leaguePhase?.venues?.[matchday];
  if (typeof planned === 'boolean') return planned;

  // Pre-P0/in-progress saves have no persisted venue plan. Preserve them while
  // still guaranteeing the official final home/away count by biasing only as
  // much as the remaining schedule requires.
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
    const leg1 = state.results?.[state.results.length - 1];
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
    // Seeded sides host leg two, so their first leg is away. Unseeded sides
    // host leg one. Once seeding cannot be derived from persisted bracket
    // state, venue remains a fair draw rather than inventing a seed.
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
    f.competition === 'league' &&
    !f.played &&
    (f.homeTeamId === userTeamId || f.awayTeamId === userTeamId)
  );
  if (leagueFix) events.push({ type:'league', fixtureId:leagueFix.id, gw });
  if (!cupState) return events;

  for (const [cupId, state] of Object.entries(cupState)) {
    if (state.status !== 'active') continue;
    const meta = CUP_META[cupId];
    const rules = getCompetitionRules(cupId);
    if (!meta || !rules) continue;

    // All UEFA competitions use the same league-phase contract. UCL keeps its
    // historic event type because MatchScreen has richer UCL presentation;
    // UEL/UECL use the normal cup event shape with leaguePhase=true.
    if (rules.leaguePhase && !state.leaguePhaseComplete) {
      const lp = state.leaguePhase ?? {};
      const matchday = lp.matchday ?? 0;
      if (rules.leaguePhase.gws.includes(gw) && matchday < rules.leaguePhase.matches) {
        const opp = lp.opponents?.[matchday];
        const base = {
          cupId,
          gw,
          matchday: matchday + 1,
          leaguePhase: true,
          opponentId: opp?.id,
          opponentName: opp?.name ?? 'European Club',
          opponentCrest: opp?.nation ?? '🌍',
          opponentRep: opp?.strength ?? 72,
          oppName: opp?.name ?? 'European Club',
          oppNation: opp?.nation ?? '🌍',
          oppStrength: opp?.strength ?? 72,
          userIsHome: resolveLeaguePhaseHome(state, rules.leaguePhase, matchday),
        };
        if (cupId === 'ucl') {
          events.push({ type:'ucl_md', ...base });
        } else {
          events.push({
            type:'cup',
            ...base,
            roundIdx: null,
            roundName: `League Phase · Matchday ${matchday + 1}`,
            cupName: meta.name,
            cupIcon: meta.icon,
          });
        }
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
      type:'cup',
      cupId,
      gw,
      roundIdx,
      roundName,
      cupName: meta.name,
      cupIcon: meta.icon,
      opponentId: draw.opponent?.id,
      opponentName: draw.opponent?.name ?? 'TBD',
      opponentCrest: draw.opponent?.crest ?? '⚽',
      opponentRep: draw.opponent?.rep ?? 70,
      opponentSeed: draw.opponentSeed ?? null,
      userIsHome: draw.userIsHome,
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
    ...lp,
    matchday,
    points: (lp.points ?? 0) + points,
    gf: (lp.gf ?? 0) + userGoals,
    ga: (lp.ga ?? 0) + oppGoals,
    gd: (lp.gd ?? 0) + userGoals - oppGoals,
  };
  const complete = matchday >= phaseRules.matches;
  const nextResults = [
    ...(cupState?.results ?? []),
    { ...matchResult, points, isLeaguePhaseMatchday:true },
  ];

  if (!complete) {
    return {
      ...cupState,
      leaguePhase: nextLeaguePhase,
      leaguePhaseComplete: false,
      results: nextResults,
    };
  }

  const finish = finishLeaguePhase(cupId, nextLeaguePhase, userTeamId, rng);
  return {
    ...cupState,
    leaguePhase: {
      ...nextLeaguePhase,
      table: finish?.table ?? [],
      position: finish?.position ?? null,
      qualificationRoute: finish?.route ?? 'eliminated',
    },
    leaguePhaseComplete: true,
    qualificationRoute: finish?.route ?? 'eliminated',
    seed: finish?.seed ?? null,
    bracketSeed: finish?.seed ?? null,
    roundIndex: finish?.roundIndex ?? 0,
    status: finish?.status ?? 'eliminated',
    results: nextResults,
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

export async function advanceOneFixture(overrideFormation) {
  const save = await getSave();
  if (save.currentGameweek > getEffectiveTotalGW(save)) return { finished:true };

  const gw = save.currentGameweek;
  const [allTeams, allPlayers, gwFixtures] = await Promise.all([
    getAllTeams(), getAllPlayers(), getFixturesByGW(gw),
  ]);
  const teamsById = new Map(allTeams.map(t => [t.id, t]));
  const playersByTeam = groupByTeam(allPlayers);

  let pending = save.pendingEvents?.length
    ? [...save.pendingEvents]
    : buildPendingEvents(gw, save.userTeamId, gwFixtures, save.cups, allTeams);

  if (!pending.length) {
    const aiUnplayed = gwFixtures.filter(f => !f.played);
    const aiResults = await simulateFixtures(aiUnplayed, teamsById, playersByTeam, save);
    for (const r of aiResults) await applyResult(r);
    await recomputePositions();
    const recoveredPlayers = await processInjuryRecovery().catch(() => []);
    await updateCache(allPlayers, aiResults);
    await applyDevelopment(aiResults).catch(() => {});
    const newOffers = await generateAIOffers().catch(() => []);
    await simulateAITransfers(save).catch(() => {});
    await simulateAILoans(save).catch(() => {});
    await payWeeklyWages().catch(() => {});
    await updateTeamMorale(save.userTeamId).catch(() => {});
    const freshSave1 = await getSave();
    const newDate = new Date(save.currentDate);
    newDate.setDate(newDate.getDate() + 7);
    await putSave({ ...freshSave1, currentGameweek:gw + 1, currentDate:newDate.toISOString(), pendingEvents:[] });
    return { skipped:true, gameweek:gw, nextGW:gw + 1, finished:gw + 1 > getEffectiveTotalGW(save), newOffers:newOffers ?? [], recoveredPlayers:recoveredPlayers ?? [] };
  }

  const event = pending[0];
  const remaining = pending.slice(1);
  let singleResult = null;
  const cupResults = [];
  const updatedCups = JSON.parse(JSON.stringify(save.cups ?? {}));
  let recoveredPlayers = [];

  if (event.type === 'league') {
    const fix = gwFixtures.find(f => f.id === event.fixtureId);
    if (!fix) {
      pending = remaining;
    } else {
      const home = teamsById.get(fix.homeTeamId) ?? { id:fix.homeTeamId, name:fix.homeTeamId, crest:'⚽' };
      const away = teamsById.get(fix.awayTeamId) ?? { id:fix.awayTeamId, name:fix.awayTeamId, crest:'⚽' };
      const hPl = playersByTeam.get(fix.homeTeamId) ?? [];
      const aPl = playersByTeam.get(fix.awayTeamId) ?? [];
      const fm = overrideFormation ?? save.formation ?? '4-3-3';
      const hFm = fix.homeTeamId === save.userTeamId ? fm : pickAIFormation(hPl);
      const aFm = fix.awayTeamId === save.userTeamId ? fm : pickAIFormation(aPl);
      const hLineup = fix.homeTeamId === save.userTeamId ? (save.lineup ?? null) : null;
      const aLineup = fix.awayTeamId === save.userTeamId ? (save.lineup ?? null) : null;
      const hMentality = fix.homeTeamId === save.userTeamId ? (save.mentality ?? 'balanced') : 'balanced';
      const aMentality = fix.awayTeamId === save.userTeamId ? (save.mentality ?? 'balanced') : 'balanced';

      const result = simulateMatch(home, away, hPl, aPl, hFm, aFm, hLineup, aLineup, hMentality, aMentality);
      await putFixture({ ...fix, played:true, homeGoals:result.homeGoals, awayGoals:result.awayGoals, homeScorers:result.homeScorers, awayScorers:result.awayScorers, events:result.events });
      await applyResult(result);

      const refreshedGW = await getFixturesByGW(gw);
      const aiUnplayed = refreshedGW.filter(f => !f.played);
      const aiResults = await simulateFixtures(aiUnplayed, teamsById, playersByTeam, save);
      for (const r of aiResults) await applyResult(r);
      await recomputePositions();
      recoveredPlayers = await processInjuryRecovery().catch(() => []);
      await updateCache(allPlayers, [result, ...aiResults]);
      await applyDevelopment([result, ...aiResults]).catch(() => {});
      singleResult = { ...result, isUserMatch:true, userTeamId:save.userTeamId, gameweek:gw };
    }
    pending = remaining;

  } else if (event.type === 'ucl_md' || (event.type === 'cup' && event.leaguePhase)) {
    const cupId = event.cupId ?? 'ucl';
    const userTeam = allTeams.find(t => t.id === save.userTeamId);
    const userPlayers = playersByTeam.get(save.userTeamId) ?? [];
    const cupState = save.cups?.[cupId];
    const mdResult = simulateEuropeanLeaguePhaseMatchday(cupId, userTeam, userPlayers, cupState, save.mentality ?? 'balanced', event.userIsHome, playersByTeam);

    if (mdResult) {
      updatedCups[cupId] = updateLeaguePhaseCupState(cupId, cupState, mdResult, save.userTeamId);
      const reportResult = {
        ...mdResult,
        opponentId: mdResult.opponentId ?? event.opponentId,
        opponentName: mdResult.opponentName ?? event.opponentName ?? event.oppName,
      };
      cupResults.push(reportResult);
      singleResult = buildCupMatchResult(reportResult, save.userTeamId, event, allTeams);
      recoveredPlayers = await processInjuryRecovery().catch(() => []);
      await updateCache(allPlayers, [mdResult]);
      await applyDevelopment([mdResult]).catch(() => {});
    }
    pending = remaining;

  } else if (event.type === 'cup') {
    const userTeam = allTeams.find(t => t.id === save.userTeamId);
    const userPlayers = playersByTeam.get(save.userTeamId) ?? [];
    const cupState = save.cups?.[event.cupId];
    const result = simulateCupRound(userTeam, userPlayers, allTeams, playersByTeam, event.cupId, event.roundName, { ...event, userMentality:save.mentality ?? 'balanced' });
    const progress = resolveCupProgress(event.cupId, event.roundName, event.roundIdx ?? 0, cupState, result.userGoals, result.oppGoals, result.userWon, result.userIsHome);
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
    recoveredPlayers = await processInjuryRecovery().catch(() => []);
    await updateCache(allPlayers, [result]);
    await applyDevelopment([result]).catch(() => {});
    pending = remaining;
  }

  const gwDone = pending.length === 0;
  const nextGW = gwDone ? gw + 1 : gw;
  const newDate = new Date(save.currentDate);
  if (gwDone) newDate.setDate(newDate.getDate() + 7);

  let newOffers = [];
  if (gwDone) newOffers = await generateAIOffers().catch(() => []) ?? [];
  if (gwDone) await simulateAITransfers(save).catch(() => {});
  if (gwDone) await simulateAILoans(save).catch(() => {});
  if (gwDone) await payWeeklyWages().catch(() => {});
  if (gwDone) await updateTeamMorale(save.userTeamId).catch(() => {});

  const freshSave2 = gwDone ? await getSave() : save;
  await putSave({
    ...freshSave2,
    currentGameweek:nextGW,
    currentDate:gwDone ? newDate.toISOString() : save.currentDate,
    cups:updatedCups,
    pendingEvents:pending,
  });

  return {
    singleResult,
    eventType:event.type,
    cupResults,
    gameweek:gw,
    nextGW,
    finished:nextGW > getEffectiveTotalGW(save),
    eventsLeft:pending.length,
    newOffers,
    recoveredPlayers,
  };
}

export async function advanceOneFixtureWithResult(matchResult, event, userIsHome) {
  const save = await getSave();
  const gw = save.currentGameweek;
  const [allTeams, allPlayers, gwFixtures] = await Promise.all([
    getAllTeams(), getAllPlayers(), getFixturesByGW(gw),
  ]);
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

  if (event0?.type === 'league') {
    const fix = gwFixtures.find(f => f.id === event0.fixtureId);
    if (fix) {
      await putFixture({ ...fix, played:true, homeGoals:matchResult.homeGoals, awayGoals:matchResult.awayGoals, homeScorers:matchResult.homeScorers, awayScorers:matchResult.awayScorers, events:matchResult.events });
      await applyResult(matchResult);
      await recomputePositions();
      const aiUnplayed = gwFixtures.filter(f => !f.played && f.id !== fix.id);
      const aiResults = await simulateFixtures(aiUnplayed, teamsById, playersByTeam, save);
      for (const r of aiResults) await applyResult(r);
      await recomputePositions();
      recoveredPlayers = await processInjuryRecovery().catch(() => []);
      await updateCache(allPlayers, [matchResult, ...aiResults]);
      await applyDevelopment([matchResult]).catch(() => {});
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
        userGoals,
        oppGoals,
        userIsHome,
        points,
        gd:userGoals - oppGoals,
        result:points === 3 ? 'W' : points === 1 ? 'D' : 'L',
        homeScorers:matchResult.homeScorers,
        awayScorers:matchResult.awayScorers,
        scorers:userIsHome ? matchResult.homeScorers : matchResult.awayScorers,
        stats:matchResult.stats,
        events:matchResult.events,
        fitnessUpdates:matchResult.fitnessUpdates,
      };
      updatedCups[cupId] = updateLeaguePhaseCupState(cupId, cupState, mdResult, save.userTeamId);
      singleResult = buildCupMatchResult(mdResult, save.userTeamId, event0, allTeams);
    } else {
      const cupState = save.cups?.[event0.cupId];
      const twoLeg = isTwoLegRound(event0.cupId, event0.roundName, 1) || isTwoLegRound(event0.cupId, event0.roundName, 2);
      const userWon = twoLeg ? userGoals > oppGoals : (userGoals > oppGoals || (userGoals === oppGoals && Math.random() < 0.5));
      const progress = resolveCupProgress(event0.cupId, event0.roundName, event0.roundIdx ?? 0, cupState, userGoals, oppGoals, userWon, userIsHome);
      aggregate = progress.aggregate;
      updatedCups[event0.cupId] = {
        ...cupState,
        roundIndex:progress.roundIndex,
        status:progress.status,
        bracketSeed:inheritBracketSeed(event0.cupId, event0.roundName, cupState, event0.opponentSeed, progress),
        results:[
          ...(cupState?.results ?? []),
          {
            userGoals,
            oppGoals,
            userWon:aggregate ? aggregate.userWon : userWon,
            userIsHome,
            opponentId:event0.opponentId,
            opponentName:event0.opponentName,
            opponentSeed:event0.opponentSeed ?? null,
            ...(aggregate ? { aggregate } : {}),
          },
        ],
      };
      singleResult = buildCupMatchResult(
        { userGoals, oppGoals, userIsHome, homeScorers:matchResult.homeScorers, awayScorers:matchResult.awayScorers, scorers:(matchResult.homeScorers ?? []).concat(matchResult.awayScorers ?? []), opponentId:event0.opponentId, opponentName:event0.opponentName, opponentSeed:event0.opponentSeed ?? null, stats:matchResult.stats, events:matchResult.events, fitnessUpdates:matchResult.fitnessUpdates, aggregate },
        save.userTeamId, event0, allTeams,
      );
    }

    recoveredPlayers = await processInjuryRecovery().catch(() => []);
    await updateCache(allPlayers, [matchResult]);
    await applyDevelopment([matchResult]).catch(() => {});
  }

  const gwDone = remaining.length === 0;
  const nextGW = gwDone ? gw + 1 : gw;
  const newDate = new Date(save.currentDate);
  let newOffers = [];
  if (gwDone) {
    newDate.setDate(newDate.getDate() + 7);
    newOffers = await generateAIOffers().catch(() => []) ?? [];
    await simulateAITransfers(save).catch(() => {});
    await simulateAILoans(save).catch(() => {});
    await payWeeklyWages().catch(() => {});
    await updateTeamMorale(save.userTeamId).catch(() => {});
  }

  const freshSave3 = gwDone ? await getSave() : save;
  await putSave({ ...freshSave3, currentGameweek:nextGW, currentDate:gwDone ? newDate.toISOString() : save.currentDate, cups:updatedCups, pendingEvents:remaining });

  return { singleResult, eventType:event0?.type, cupResults:[], gameweek:gw, nextGW, finished:nextGW > getEffectiveTotalGW(save), eventsLeft:remaining.length, newOffers, recoveredPlayers };
}

export function buildCupMatchResult(r, userTeamId, event, allTeams) {
  const teamsById = new Map(allTeams.map(t => [t.id, t]));
  const defaultStats = { possession:{home:50,away:50}, shots:{home:0,away:0}, shotsOnTarget:{home:0,away:0}, xG:{home:0,away:0}, corners:{home:0,away:0}, fouls:{home:0,away:0}, yellowCards:{home:0,away:0} };
  if (event.type === 'ucl_md') {
    const userIsHome = r.userIsHome ?? true;
    const userName = teamsById.get(userTeamId)?.name ?? 'Your Team';
    const userCrest = teamsById.get(userTeamId)?.crest ?? '⚽';
    const oppId = r.opponentId ?? event.opponentId ?? 'opp';
    return {
      isCupMatch:true,
      cupId:'ucl',
      cupName:'Champions League',
      cupIcon:'⭐',
      isUCLMatchday:true,
      matchday:r.matchday,
      opponentName:r.opponentName,
      opponentNation:r.opponentNation,
      userGoals:r.userGoals,
      oppGoals:r.oppGoals,
      points:r.points,
      result:r.result,
      scorers:r.scorers ?? [],
      homeTeamId:userIsHome ? userTeamId : oppId,
      awayTeamId:userIsHome ? oppId : userTeamId,
      homeGoals:userIsHome ? r.userGoals : r.oppGoals,
      awayGoals:userIsHome ? r.oppGoals : r.userGoals,
      homeTeamName:userIsHome ? userName : r.opponentName,
      awayTeamName:userIsHome ? r.opponentName : userName,
      homeTeamCrest:userIsHome ? userCrest : (r.opponentNation ?? '⚽'),
      awayTeamCrest:userIsHome ? (r.opponentNation ?? '⚽') : userCrest,
      homeScorers:r.homeScorers ?? (userIsHome ? (r.scorers ?? []) : []),
      awayScorers:r.awayScorers ?? (userIsHome ? [] : (r.scorers ?? [])),
      events:r.events ?? [],
      stats:r.stats ?? defaultStats,
      fitnessUpdates:r.fitnessUpdates ?? [],
      isUserMatch:true,
      userTeamId,
      gameweek:event.gw,
    };
  }

  const userIsHome = r.userIsHome ?? true;
  const oppId = r.opponentId ?? event.opponentId ?? 'opp';
  return {
    isCupMatch:true,
    cupId:event.cupId,
    cupName:event.cupName,
    cupIcon:event.cupIcon,
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
    events:r.events ?? [],
    stats:r.stats ?? defaultStats,
    fitnessUpdates:r.fitnessUpdates ?? [],
    isUserMatch:true,
    userTeamId,
    gameweek:event.gw,
    aggregate:r.aggregate ?? null,
  };
}

export async function simulateFixtures(fixtures, teamsById, playersByTeam, save) {
  const results = [];
  const toWrite = [];
  for (const f of fixtures) {
    const home = teamsById.get(f.homeTeamId) ?? { id:f.homeTeamId, name:f.homeTeamId, crest:'⚽' };
    const away = teamsById.get(f.awayTeamId) ?? { id:f.awayTeamId, name:f.awayTeamId, crest:'⚽' };
    const r = simulateMatch(home, away, playersByTeam.get(f.homeTeamId) ?? [], playersByTeam.get(f.awayTeamId) ?? [], pickAIFormation(), pickAIFormation());
    toWrite.push({ ...f, played:true, homeGoals:r.homeGoals, awayGoals:r.awayGoals, homeScorers:r.homeScorers, awayScorers:r.awayScorers, events:r.events });
    results.push(r);
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
  const freshPlayers = await getAllPlayers();
  const cache = new Map(freshPlayers.map(p => [p.id, { ...p }]));
  updatePlayerStats(cache, results);
  applyFitnessUpdates(cache, results);
  applyInjuryUpdates(cache, results);
  const heavyLossMargin = buildHeavyLossMap(results);
  for (const p of cache.values()) {
    if (!p._played) {
      p.fitness = 100;
      const currentForm = p.form ?? 50;
      if (currentForm > 50) p.form = Math.max(50, currentForm - 3);
      else if (currentForm < 50) p.form = Math.min(50, currentForm + 1);
    } else {
      const age = p.age ?? 24;
      const agePenalty = age >= 36 ? 6 : age >= 33 ? 4 : age >= 30 ? 2 : 0;
      const recovery = Math.max(8, 20 - agePenalty);
      p.fitness = Math.min(100, (p.fitness ?? 80) + recovery);
      const currentForm = p.form ?? 50;
      let formGain = 1;
      if (p._scored) formGain += 3;
      if (p._assisted) formGain += 2;
      if (p._cleanSheet) formGain += 1;
      const margin = heavyLossMargin.get(p.teamId) ?? 0;
      if (margin >= 3 && !p._scored && !p._assisted) formGain -= (margin - 2) * 2;
      const afterGain = currentForm + formGain;
      const ceilingDecay = afterGain > 60 ? 1 : 0;
      p.form = Math.min(99, Math.max(1, afterGain - ceilingDecay));
    }
    delete p._played;
    delete p._scored;
    delete p._assisted;
    delete p._cleanSheet;
  }
  await putPlayersBulk([...cache.values()]);
}

export async function processInjuryRecovery() {
  if (typeof tickInjuryRecovery !== 'function') return [];
  const allPlayers = await getAllPlayers();
  const save = await getSave();
  const hadInjured = allPlayers.some(p => p.injured);
  const recovered = tickInjuryRecovery(allPlayers);
  if (hadInjured || recovered.length) await putPlayersBulk(allPlayers);
  return recovered.filter(p => p.teamId === save.userTeamId);
}

export function groupByTeam(players) {
  const m = new Map();
  for (const p of players) {
    if (!m.has(p.teamId)) m.set(p.teamId, []);
    m.get(p.teamId).push(p);
  }
  return m;
}

export function updatePlayerStats(cache, results) {
  for (const r of results) {
    for (const evt of [...(r.homeScorers ?? []), ...(r.awayScorers ?? [])]) {
      const p = cache.get(evt.playerId);
      if (p) { p.goals = (p.goals ?? 0) + 1; p._played = true; p._scored = true; }
      if (evt.assistId) {
        const a = cache.get(evt.assistId);
        if (a) { a.assists = (a.assists ?? 0) + 1; a._played = true; a._assisted = true; }
      }
    }
    if (r.awayGoals === 0) awardCS(cache, r.homeTeamId);
    if (r.homeGoals === 0) awardCS(cache, r.awayTeamId);
  }
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
