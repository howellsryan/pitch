import { getAllFixtures, getAllPlayers, getAllTeams, getFixturesByGW, getSave, putFixture, putFixturesBulk, putPlayersBulk, putSave } from './db.js';
import { pickAIFormation, simulateMatch } from './matchEngine.js';
import { applyResult, recomputePositions } from './standings.js';
import { CUP_META, UCL_CLUBS, simulateCupRound, simulateUCLMatchday } from './cups.js';
import { generateAIOffers, simulateAILoans, simulateAITransfers } from './transfers.js';
import { applyDevelopment } from './potential.js';
import { applyInjury, tickInjuryRecovery } from './injuries.js';

/** modules/gameweek.js — One-event-per-press architecture: buildPendingEvents, advanceOneFixture */

// ─── Compute effective season length including post-season cups ──
// European cup finals (UCL/UEL/UECL) happen AFTER the league ends.
// If the user is still active in one, extend totalGameweeks so the
// season continues until all their cup business is resolved.
export function getEffectiveTotalGW(save) {
  const leagueGWs = save.totalGameweeks ?? 38;
  let maxCupGW = leagueGWs;
  if (!save.cups) return leagueGWs;
  for (const [cupId, state] of Object.entries(save.cups)) {
    if (state.status !== 'active') continue;
    const meta = CUP_META[cupId];
    if (!meta) continue;
    const roundIdx = state.roundIndex ?? 0;
    // Check all remaining rounds for this cup
    for (let i = roundIdx; i < (meta.roundGWs?.length ?? 0); i++) {
      const gw = meta.roundGWs[i];
      if (gw > maxCupGW) maxCupGW = gw;
    }
  }
  return maxCupGW;
}

// ─── Build the queue of pending events for current GW ─────────
export function buildPendingEvents(gw, userTeamId, fixtures, cupState, allTeams) {
  const events = [];

  // 1. User's league fixture for this GW
  const leagueFix = fixtures.find(f =>
    f.competition === 'league' &&
    !f.played &&
    (f.homeTeamId === userTeamId || f.awayTeamId === userTeamId)
  );
  if (leagueFix) {
    events.push({ type: 'league', fixtureId: leagueFix.id, gw });
  }

  if (!cupState) return events;

  // 2. Cup events scheduled for this GW
  for (const [cupId, state] of Object.entries(cupState)) {
    if (state.status !== 'active') continue;
    const meta = CUP_META[cupId];
    if (!meta) continue;

    // UCL group stage matchday
    if (cupId === 'ucl' && meta.isGroupStage && !state.leaguePhaseComplete) {
      const gwList = meta.groupStageGWs ?? [];
      if (gwList.includes(gw) && (state.leaguePhase?.matchday ?? 0) < 8) {
        const lp  = state.leaguePhase ?? {};
        const opp = lp.opponents?.[lp.matchday ?? 0];
        events.push({
          type:    'ucl_md',
          cupId:   'ucl',
          gw,
          matchday: (lp.matchday ?? 0) + 1,
          oppName:  opp?.name ?? 'European Club',
          oppNation:opp?.nation ?? '🌍',
          oppStrength: opp?.strength ?? 72,
          userIsHome: Math.random() < 0.5,
        });
      }
      continue;
    }

    // Standard knockout round
    const roundIdx = state.roundIndex ?? 0;
    const roundGW  = meta.roundGWs?.[roundIdx];
    if (roundGW === gw) {
      const teamsById  = new Map(allTeams.map(t => [t.id, t]));
      const userTeam   = teamsById.get(userTeamId);
      const userLeague = userTeam?.league ?? 'Premier League';
      // Pre-draw the opponent now so pre-match modal can display it
      let drawnOpp = null;
      const isEuropean = ['ucl','uel','uecl'].includes(cupId);
      if (isEuropean) {
        const pool = UCL_CLUBS.filter(c => c.id !== userTeamId);
        const pick = pool[Math.floor(Math.random() * pool.length)];
        drawnOpp = { id: pick.id, name: pick.name, crest: pick.nation, rep: pick.strength };
      } else {
        // Nation-wide draw for FA Cup; same-league for other domestic cups
        const cupNation  = CUP_META[cupId]?.nation;
        const ENGLISH_LEAGUES = new Set(['Premier League','Championship','League One','League Two']);
        let pool;
        if (cupNation === 'England') {
          pool = allTeams.filter(t => t.id !== userTeamId && ENGLISH_LEAGUES.has(t.league ?? 'Premier League'));
        } else {
          pool = allTeams.filter(t => t.id !== userTeamId && (t.league ?? 'Premier League') === userLeague);
        }
        const eligible = pool.length > 0 ? pool : allTeams.filter(t => t.id !== userTeamId);
        const pick = eligible[Math.floor(Math.random() * eligible.length)];
        if (pick) drawnOpp = { id: pick.id, name: pick.name, crest: pick.crest ?? '⚽', rep: pick.reputation ?? 70 };
      }
      const userIsHome = Math.random() < 0.5;
      events.push({
        type: 'cup',
        cupId,
        gw,
        roundIdx,
        roundName:     meta.rounds[roundIdx] ?? 'Final',
        cupName:       meta.name,
        cupIcon:      meta.icon,
        opponentId:   drawnOpp?.id,
        opponentName: drawnOpp?.name ?? 'TBD',
        opponentCrest:drawnOpp?.crest ?? '⚽',
        opponentRep:  drawnOpp?.rep ?? 70,
        userIsHome,
      });
    }
  }

  return events;
}

// ─── Get next event to play ────────────────────────────────────
export async function getNextMatchEvent() {
  const save = await getSave();
  if (save.currentGameweek > getEffectiveTotalGW(save)) return null;

  // If there's a pending events queue, return the first
  if (save.pendingEvents?.length) return save.pendingEvents[0];

  // Otherwise build it for the current GW
  const gw       = save.currentGameweek;
  const fixtures = await getFixturesByGW(gw);
  const allTeams = await getAllTeams();
  const events   = buildPendingEvents(gw, save.userTeamId, fixtures, save.cups, allTeams);

  if (!events.length) {
    // GW has no user events — advance silently
    return { type: 'no_user_event', gw };
  }

  // Save the queue
  await putSave({ ...save, pendingEvents: events });
  return events[0];
}

// ─── Also exported for pre-match modal ────────────────────────
export async function getNextUserFixture() {
  const save = await getSave();
  const all  = await getAllFixtures();
  return all
    .filter(f => !f.played && (f.homeTeamId === save.userTeamId || f.awayTeamId === save.userTeamId))
    .sort((a, b) => a.gameweek - b.gameweek)[0] ?? null;
}

// ─── Simulate ONE event ────────────────────────────────────────
export async function advanceOneFixture(overrideFormation) {
  const save = await getSave();
  if (save.currentGameweek > getEffectiveTotalGW(save)) return { finished: true };

  const gw = save.currentGameweek;
  const [allTeams, allPlayers, gwFixtures] = await Promise.all([
    getAllTeams(), getAllPlayers(), getFixturesByGW(gw),
  ]);
  const teamsById     = new Map(allTeams.map(t => [t.id, t]));
  const playersByTeam = groupByTeam(allPlayers);

  // Build/read pending events queue
  let pending = save.pendingEvents?.length
    ? [...save.pendingEvents]
    : buildPendingEvents(gw, save.userTeamId, gwFixtures, save.cups, allTeams);

  if (!pending.length) {
    // No user events this GW — silently simulate AI fixtures and advance
    const aiUnplayed = gwFixtures.filter(f => !f.played);
    const aiResults  = await simulateFixtures(aiUnplayed, teamsById, playersByTeam, save);
    for (const r of aiResults) await applyResult(r);
    await recomputePositions();
    // Tick recovery before updateCache so AI match injuries don't get ticked same GW
    const recoveredPlayers = await processInjuryRecovery().catch(() => []);
    await updateCache(allPlayers, aiResults);
    await applyDevelopment(aiResults).catch(() => {});
    const newOffers = await generateAIOffers().catch(() => []);
    await simulateAITransfers(save).catch(() => {});
    await simulateAILoans(save).catch(() => {});
    const freshSave1 = await getSave();
    const newDate = new Date(save.currentDate);
    newDate.setDate(newDate.getDate() + 7);
    await putSave({ ...freshSave1, currentGameweek: gw + 1, currentDate: newDate.toISOString(), pendingEvents: [] });
    return { skipped: true, gameweek: gw, nextGW: gw + 1, finished: gw + 1 > getEffectiveTotalGW(save), newOffers: newOffers ?? [], recoveredPlayers: recoveredPlayers ?? [] };
  }

  const event = pending[0];
  const remaining = pending.slice(1);
  let singleResult = null;
  let cupResults   = [];
  let updatedCups  = JSON.parse(JSON.stringify(save.cups ?? {}));
  let recoveredPlayers = [];

  if (event.type === 'league') {
    // ── Simulate league fixture ──────────────────────────────
    const fix    = gwFixtures.find(f => f.id === event.fixtureId);
    if (!fix) { pending = remaining; } else {
      const home = teamsById.get(fix.homeTeamId) ?? { id:fix.homeTeamId, name:fix.homeTeamId, crest:'⚽' };
      const away = teamsById.get(fix.awayTeamId) ?? { id:fix.awayTeamId, name:fix.awayTeamId, crest:'⚽' };
      const hPl  = playersByTeam.get(fix.homeTeamId) ?? [];
      const aPl  = playersByTeam.get(fix.awayTeamId) ?? [];
      const fm   = overrideFormation ?? save.formation ?? '4-3-3';
      const hFm  = fix.homeTeamId === save.userTeamId ? fm : pickAIFormation(hPl);
      const aFm  = fix.awayTeamId === save.userTeamId ? fm : pickAIFormation(aPl);
      const hLineup = fix.homeTeamId === save.userTeamId ? (save.lineup ?? null) : null;
      const aLineup = fix.awayTeamId === save.userTeamId ? (save.lineup ?? null) : null;

      const hMentality = fix.homeTeamId === save.userTeamId ? (save.mentality ?? 'balanced') : 'balanced';
      const aMentality = fix.awayTeamId === save.userTeamId ? (save.mentality ?? 'balanced') : 'balanced';

      const result = simulateMatch(home, away, hPl, aPl, hFm, aFm, hLineup, aLineup, hMentality, aMentality);
      await putFixture({ ...fix, played:true, homeGoals:result.homeGoals, awayGoals:result.awayGoals, homeScorers:result.homeScorers, awayScorers:result.awayScorers, events:result.events });
      await applyResult(result);

      // AI fixtures for this GW — simulate silently NOW
      const refreshedGW = await getFixturesByGW(gw);
      const aiUnplayed  = refreshedGW.filter(f => !f.played);
      const aiResults   = await simulateFixtures(aiUnplayed, teamsById, playersByTeam, save);
      for (const r of aiResults) await applyResult(r);
      await recomputePositions();
      // Tick recovery BEFORE updateCache so newly-injured players (written by updateCache) aren't ticked this GW
      recoveredPlayers = await processInjuryRecovery().catch(() => []);
      await updateCache(allPlayers, [result, ...aiResults]);
      await applyDevelopment([result, ...aiResults]).catch(() => {});

      singleResult = { ...result, isUserMatch:true, userTeamId:save.userTeamId, gameweek:gw };
    }
    pending = remaining;

  } else if (event.type === 'ucl_md') {
    // ── Simulate UCL league phase matchday ────────────────────
    const userTeam   = allTeams.find(t => t.id === save.userTeamId);
    const userPlayers = playersByTeam.get(save.userTeamId) ?? [];
    const cupState   = save.cups?.ucl;
    const mdResult   = simulateUCLMatchday(userTeam, userPlayers, cupState, save.mentality ?? 'balanced', event.userIsHome, playersByTeam);

    if (mdResult) {
      const lp    = cupState.leaguePhase ?? {};
      const newMD = (lp.matchday ?? 0) + 1;
      const newPts = (lp.points ?? 0) + mdResult.points;
      const newGD  = (lp.gd ?? 0) + mdResult.gd;
      const phaseComplete = newMD >= 8;
      updatedCups.ucl = {
        ...cupState,
        leaguePhase: { ...lp, matchday: newMD, points: newPts, gd: newGD },
        results: [...(cupState.results ?? []), { ...mdResult, isUCLMatchday: true }],
        leaguePhaseComplete: phaseComplete,
        ...(phaseComplete ? { roundIndex:0, status: newPts >= 7 ? 'active' : 'eliminated' } : {}),
      };
      cupResults.push({ ...mdResult, cupId:'ucl', isUCLMatchday:true });

      // Build a synthetic "result" for the match report
      singleResult = buildCupMatchResult(mdResult, save.userTeamId, event, allTeams);
      // Tick recovery BEFORE updateCache so newly-injured players aren't ticked this GW
      recoveredPlayers = await processInjuryRecovery().catch(() => []);
      await updateCache(allPlayers, [mdResult]);
      await applyDevelopment([mdResult]).catch(() => {});
    }
    pending = remaining;

  } else if (event.type === 'cup') {
    // ── Simulate knockout cup round ───────────────────────────
    const userTeam    = allTeams.find(t => t.id === save.userTeamId);
    const userPlayers = playersByTeam.get(save.userTeamId) ?? [];
    const cupState    = save.cups?.[event.cupId];
    const result      = simulateCupRound(userTeam, userPlayers, allTeams, playersByTeam, event.cupId, event.roundName, { ...event, userMentality: save.mentality ?? 'balanced' });
    const meta        = CUP_META[event.cupId];
    const nextIdx     = (event.roundIdx ?? 0) + 1;
    const isWinner    = nextIdx >= (meta?.rounds?.length ?? 99);

    updatedCups[event.cupId] = {
      ...cupState,
      roundIndex: result.userWon ? nextIdx : (event.roundIdx ?? 0),
      status:     result.userWon ? (isWinner ? 'winner' : 'active') : 'eliminated',
      results:    [...(cupState?.results ?? []), result],
    };
    cupResults.push(result);
    singleResult = buildCupMatchResult(result, save.userTeamId, event, allTeams);
    // Tick recovery BEFORE updateCache so newly-injured players aren't ticked this GW
    recoveredPlayers = await processInjuryRecovery().catch(() => []);
    await updateCache(allPlayers, [result]);
    await applyDevelopment([result]).catch(() => {});
    pending = remaining;
  }

  // ── Advance GW if no more pending events ──────────────────
  const gwDone     = pending.length === 0;
  const nextGW     = gwDone ? gw + 1 : gw;
  const newDate    = new Date(save.currentDate);
  if (gwDone) newDate.setDate(newDate.getDate() + 7);

  let newOffers = [];
  if (gwDone) newOffers = await generateAIOffers().catch(() => []) ?? [];
  if (gwDone) await simulateAITransfers(save).catch(() => {});
  if (gwDone) await simulateAILoans(save).catch(() => {});

  // Re-read save so we don't overwrite the offers generateAIOffers just wrote
  const freshSave2 = gwDone ? await getSave() : save;

  await putSave({
    ...freshSave2,
    currentGameweek: nextGW,
    currentDate:     gwDone ? newDate.toISOString() : save.currentDate,
    cups:            updatedCups,
    pendingEvents:   pending,
  });

  return {
    singleResult,
    eventType:  event.type,
    cupResults,
    gameweek:   gw,
    nextGW,
    finished:   nextGW > getEffectiveTotalGW(save),
    eventsLeft: pending.length,
    newOffers,
    recoveredPlayers,
  };
}

// ─── Advance using a pre-computed Watch Match result ──────────
// Called after the live viewer finishes — skips simulation,
// applies the pre-computed result, then runs the normal GW logic.
export async function advanceOneFixtureWithResult(matchResult, event, userIsHome) {
  const save = await getSave();
  const gw   = save.currentGameweek;
  const [allTeams, allPlayers, gwFixtures] = await Promise.all([
    getAllTeams(), getAllPlayers(), getFixturesByGW(gw),
  ]);
  const teamsById     = new Map(allTeams.map(t => [t.id, t]));
  const playersByTeam = groupByTeam(allPlayers);

  let pending = save.pendingEvents?.length
    ? [...save.pendingEvents]
    : buildPendingEvents(gw, save.userTeamId, gwFixtures, save.cups, allTeams);

  const event0    = pending[0];
  const remaining = pending.slice(1);
  let updatedCups = JSON.parse(JSON.stringify(save.cups ?? {}));
  let singleResult = null;
  let recoveredPlayers = [];

  if (event0?.type === 'league') {
    const fix = gwFixtures.find(f => f.id === event0.fixtureId);
    if (fix) {
      await putFixture({ ...fix, played:true, homeGoals:matchResult.homeGoals, awayGoals:matchResult.awayGoals, homeScorers:matchResult.homeScorers, awayScorers:matchResult.awayScorers, events:matchResult.events });
      await applyResult(matchResult);
      await recomputePositions();

      // AI fixtures for same GW
      const aiUnplayed = gwFixtures.filter(f => !f.played && f.id !== fix.id);
      const aiResults  = await simulateFixtures(aiUnplayed, teamsById, playersByTeam, save);
      for (const r of aiResults) await applyResult(r);
      await recomputePositions();
      // Recovery before updateCache so newly-injured players aren't ticked same GW
      recoveredPlayers = await processInjuryRecovery().catch(() => []);
      await updateCache(allPlayers, [matchResult, ...aiResults]);
      await applyDevelopment([matchResult]).catch(() => {});
    }
    singleResult = { ...matchResult, isUserMatch:true, userTeamId:save.userTeamId, gameweek:gw };

  } else if (event0?.type === 'ucl_md' || event0?.type === 'cup') {
    // For cup events in watch mode — apply the raw match result and
    // reconstruct the cup state update using the score.
    const userGoals = userIsHome ? matchResult.homeGoals : matchResult.awayGoals;
    const oppGoals  = userIsHome ? matchResult.awayGoals : matchResult.homeGoals;
    const userWon   = userGoals > oppGoals || (userGoals === oppGoals && Math.random() < 0.5);

    if (event0.type === 'ucl_md') {
      const cupState = save.cups?.ucl;
      const lp = cupState?.leaguePhase ?? {};
      const pts = userGoals > oppGoals ? 3 : userGoals === oppGoals ? 1 : 0;
      const newMD = (lp.matchday ?? 0) + 1;
      const phaseComplete = newMD >= 8;
      updatedCups.ucl = {
        ...cupState,
        leaguePhase: { ...lp, matchday: newMD, points: (lp.points??0)+pts, gd: (lp.gd??0)+(userGoals-oppGoals) },
        results: [...(cupState?.results??[]), { userGoals, oppGoals, points:pts, result: pts===3?'W':pts===1?'D':'L', opponentName: event0.oppName, userIsHome }],
        leaguePhaseComplete: phaseComplete,
        ...(phaseComplete ? { roundIndex:0, status: ((lp.points??0)+pts) >= 7 ? 'active' : 'eliminated' } : {}),
      };
    } else {
      const cupState = save.cups?.[event0.cupId];
      const meta  = CUP_META[event0.cupId];
      const nextIdx = (event0.roundIdx ?? 0) + 1;
      const isWinner = nextIdx >= (meta?.rounds?.length ?? 99);
      updatedCups[event0.cupId] = {
        ...cupState,
        roundIndex: userWon ? nextIdx : (event0.roundIdx ?? 0),
        status:     userWon ? (isWinner ? 'winner' : 'active') : 'eliminated',
        results:    [...(cupState?.results ?? []), { userGoals, oppGoals, userWon, opponentName: event0.opponentName }],
      };
    }
    singleResult = buildCupMatchResult(
      { userGoals, oppGoals, userIsHome, homeScorers: matchResult.homeScorers, awayScorers: matchResult.awayScorers, scorers: matchResult.homeScorers.concat(matchResult.awayScorers), opponentName: event0.opponentName ?? event0.oppName, opponentNation: event0.oppNation, stats: matchResult.stats, events: matchResult.events, fitnessUpdates: matchResult.fitnessUpdates },
      save.userTeamId, event0, allTeams
    );
    // Tick recovery BEFORE updateCache so newly-injured players aren't ticked this GW
    recoveredPlayers = await processInjuryRecovery().catch(() => []);
    await updateCache(allPlayers, [matchResult]);
    await applyDevelopment([matchResult]).catch(() => {});
  }

  // Advance GW if no more pending
  const gwDone  = remaining.length === 0;
  const nextGW  = gwDone ? gw + 1 : gw;
  const newDate = new Date(save.currentDate);
  let newOffers = [];
  if (gwDone) {
    newDate.setDate(newDate.getDate() + 7);
    newOffers = await generateAIOffers().catch(()=>[]) ?? [];
    await simulateAITransfers(save).catch(() => {});
    await simulateAILoans(save).catch(() => {});
  }

  // Re-read save so we don't overwrite the offers generateAIOffers just wrote
  const freshSave3 = gwDone ? await getSave() : save;
  await putSave({ ...freshSave3, currentGameweek: nextGW, currentDate: gwDone ? newDate.toISOString() : save.currentDate, cups: updatedCups, pendingEvents: remaining });

  return { singleResult, eventType: event0?.type, cupResults: [], gameweek: gw, nextGW, finished: nextGW > getEffectiveTotalGW(save), eventsLeft: remaining.length, newOffers, recoveredPlayers };
}

// ─── Build a synthetic match result for the report modal ──────
export function buildCupMatchResult(r, userTeamId, event, allTeams) {
  const teamsById = new Map(allTeams.map(t => [t.id, t]));
  const defaultStats = { possession:{home:50,away:50}, shots:{home:0,away:0}, shotsOnTarget:{home:0,away:0}, xG:{home:0,away:0}, corners:{home:0,away:0}, fouls:{home:0,away:0}, yellowCards:{home:0,away:0} };
  if (event.type === 'ucl_md') {
    const userIsHome = r.userIsHome ?? true;
    const userName   = teamsById.get(userTeamId)?.name ?? 'Your Team';
    const userCrest  = teamsById.get(userTeamId)?.crest ?? '⚽';
    // Use the real opponent ID from the result so event.teamId matching works in the timeline
    const oppId      = r.opponentId ?? (event.oppId ?? 'opp');
    return {
      isCupMatch:    true,
      cupId:         'ucl',
      cupName:       'Champions League',
      cupIcon:       '⭐',
      isUCLMatchday: true,
      matchday:      r.matchday,
      opponentName:  r.opponentName,
      opponentNation:r.opponentNation,
      userGoals:     r.userGoals,
      oppGoals:      r.oppGoals,
      points:        r.points,
      result:        r.result,
      scorers:       r.scorers ?? [],
      homeTeamId:    userIsHome ? userTeamId : oppId,
      awayTeamId:    userIsHome ? oppId : userTeamId,
      homeGoals:     userIsHome ? r.userGoals : r.oppGoals,
      awayGoals:     userIsHome ? r.oppGoals  : r.userGoals,
      homeTeamName:  userIsHome ? userName : r.opponentName,
      awayTeamName:  userIsHome ? r.opponentName : userName,
      homeTeamCrest: userIsHome ? userCrest : (r.opponentNation ?? '⚽'),
      awayTeamCrest: userIsHome ? (r.opponentNation ?? '⚽') : userCrest,
      homeScorers:   r.homeScorers ?? (userIsHome ? (r.scorers ?? []) : []),
      awayScorers:   r.awayScorers ?? (userIsHome ? [] : (r.scorers ?? [])),
      events:        r.events ?? [],
      stats:         r.stats ?? defaultStats,
      fitnessUpdates:r.fitnessUpdates ?? [],
      isUserMatch:   true,
      userTeamId,
      gameweek:      event.gw,
    };
  }
  // Standard cup
  const userIsHome = r.userIsHome ?? true;
  return {
    isCupMatch:    true,
    cupId:         event.cupId,
    cupName:       event.cupName,
    cupIcon:       event.cupIcon,
    roundName:     event.roundName,
    homeTeamId:    userIsHome ? userTeamId : (r.opponentId ?? 'opp'),
    awayTeamId:    userIsHome ? (r.opponentId ?? 'opp') : userTeamId,
    homeGoals:     userIsHome ? r.userGoals : r.oppGoals,
    awayGoals:     userIsHome ? r.oppGoals  : r.userGoals,
    homeTeamName:  userIsHome ? (teamsById.get(userTeamId)?.name ?? 'Your Team') : (r.opponentName ?? 'Opponent'),
    awayTeamName:  userIsHome ? (r.opponentName ?? 'Opponent') : (teamsById.get(userTeamId)?.name ?? 'Your Team'),
    homeTeamCrest: userIsHome ? (teamsById.get(userTeamId)?.crest ?? '⚽') : '⚽',
    awayTeamCrest: userIsHome ? '⚽' : (teamsById.get(userTeamId)?.crest ?? '⚽'),
    homeScorers:   r.homeScorers ?? (userIsHome ? (r.scorers ?? []) : (r.oppScorers ?? [])),
    awayScorers:   r.awayScorers ?? (userIsHome ? (r.oppScorers ?? []) : (r.scorers ?? [])),
    events:        r.events ?? [],
    stats:         r.stats ?? defaultStats,
    fitnessUpdates:r.fitnessUpdates ?? [],
    isUserMatch:   true,
    userTeamId,
    gameweek:      event.gw,
  };
}

// ─── Helpers ─────────────────────────────────────────────────
export async function simulateFixtures(fixtures, teamsById, playersByTeam, save) {
  const results = [];
  const toWrite = [];
  for (const f of fixtures) {
    const home = teamsById.get(f.homeTeamId) ?? { id:f.homeTeamId, name:f.homeTeamId, crest:'⚽' };
    const away = teamsById.get(f.awayTeamId) ?? { id:f.awayTeamId, name:f.awayTeamId, crest:'⚽' };
    const r    = simulateMatch(home, away, playersByTeam.get(f.homeTeamId)??[], playersByTeam.get(f.awayTeamId)??[], pickAIFormation(), pickAIFormation());
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
  // Always read fresh from DB — processInjuryRecovery may have cleared injuries
  const freshPlayers = await getAllPlayers();
  const cache = new Map(freshPlayers.map(p => [p.id, { ...p }]));
  updatePlayerStats(cache, results);
  applyFitnessUpdates(cache, results);
  applyInjuryUpdates(cache, results);
  const heavyLossMargin = buildHeavyLossMap(results);
  for (const p of cache.values()) {
    if (!p._played) {
      p.fitness = 100; // rested players fully recover
      const currentForm = p.form ?? 50;
      if (currentForm > 50) {
        p.form = Math.max(50, currentForm - 3);
      } else if (currentForm < 50) {
        p.form = Math.min(50, currentForm + 1);
      }
    } else {
      const baseRecovery = 20;
      const age = p.age ?? 24;
      const agePenalty = age >= 36 ? 6 : age >= 33 ? 4 : age >= 30 ? 2 : 0;
      const recovery = Math.max(8, baseRecovery - agePenalty);
      p.fitness = Math.min(100, (p.fitness ?? 80) + recovery);
      const currentForm = p.form ?? 50;
      let formGain = 1;
      if (p._scored)      formGain += 3;
      if (p._assisted)    formGain += 2;
      if (p._cleanSheet)  formGain += 1;
      // Heavy loss penalty: -2 per goal margin above 2 (e.g. 3-0 loss = -2, 5-0 = -6)
      // Scorers/assisters are shielded — individual brilliance offsets team performance
      const margin = heavyLossMargin.get(p.teamId) ?? 0;
      if (margin >= 3 && !p._scored && !p._assisted) {
        formGain -= (margin - 2) * 2;
      }
      // Ceiling decay: form above 85 drifts -1 each GW even when playing
      // Makes 99 form genuinely rare — must keep contributing to maintain it
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

// ─── Tick injury recovery at GW end; returns recovered player names (user team only) ───
export async function processInjuryRecovery() {
  if (typeof tickInjuryRecovery !== 'function') return [];
  const allPlayers = await getAllPlayers();
  const save = await getSave();
  const hadInjured = allPlayers.some(p => p.injured);
  const recovered = tickInjuryRecovery(allPlayers);
  // Always save when any player was injured — tickInjuryRecovery decrements
  // injuryGWsLeft for ALL injured players, not just those who fully recovered.
  // Without this, mid-recovery decrements are lost and injuries never end.
  if (hadInjured || recovered.length) {
    await putPlayersBulk(allPlayers);
  }
  // Only return user-team recoveries for toast notifications
  return recovered.filter(p => p.teamId === save.userTeamId);
}

export function groupByTeam(players) {
  const m = new Map();
  for (const p of players) { if (!m.has(p.teamId)) m.set(p.teamId, []); m.get(p.teamId).push(p); }
  return m;
}

export function updatePlayerStats(cache, results) {
  for (const r of results) {
    for (const evt of [...(r.homeScorers??[]), ...(r.awayScorers??[])]) {
      const p=cache.get(evt.playerId); if(p){p.goals=(p.goals??0)+1;p._played=true;p._scored=true;}
      if(evt.assistId){const a=cache.get(evt.assistId);if(a){a.assists=(a.assists??0)+1;a._played=true;a._assisted=true;}}
    }
    if(r.awayGoals===0) awardCS(cache,r.homeTeamId);
    if(r.homeGoals===0) awardCS(cache,r.awayTeamId);
  }
}

export function awardCS(cache,teamId) {
  for(const p of cache.values()){if(p.teamId===teamId&&p.position==='GK'&&p.inSquad!==false&&!p.injured){p.cleanSheets=(p.cleanSheets??0)+1;p._played=true;p._cleanSheet=true;break;}}
}

export function applyFitnessUpdates(cache,results) {
  for(const r of results) for(const fu of r.fitnessUpdates??[]){const p=cache.get(fu.id);if(p){p.fitness=fu.newFitness;p._played=true;}}
}

export function applyInjuryUpdates(cache, results) {
  if (typeof applyInjury !== 'function') return;
  for (const r of results) {
    for (const evt of (r.events ?? [])) {
      if (evt.type !== 'injury') continue;
      const p = cache.get(evt.playerId);
      if (!p) continue;
      applyInjury(p, {
        injuryName:     evt.injuryName,
        injuryType:     evt.injuryType ?? 'unknown',
        injuryGWsLeft:  evt.injuryGWsLeft,
        injuryGWsTotal: evt.injuryGWsLeft,
      });
    }
  }
}

