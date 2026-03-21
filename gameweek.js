/** modules/gameweek.js — One-event-per-press architecture: buildPendingEvents, advanceOneFixture */

import { getSave, putSave, getAllTeams, getAllPlayers, getFixturesByGW, getAllFixtures, putFixture, putPlayersBulk } from './db.js';
import { simulateMatch, pickAIFormation } from './matchEngine.js';
import { applyResult, recomputePositions } from './standings.js';
import { simulateCupRound, simulateUCLMatchday, CUP_META } from './cups.js';
import { generateAIOffers }                from './transfers.js';
import { applyDevelopment }                from './potential.js';

// ─── Build the queue of pending events for current GW ─────────
function buildPendingEvents(gw, userTeamId, fixtures, cupState, allTeams) {
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
        const pool = allTeams.filter(t => t.id !== userTeamId && (t.league ?? 'Premier League') === userLeague);
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
  if (save.currentGameweek > save.totalGameweeks) return null;

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
  if (save.currentGameweek > save.totalGameweeks) return { finished: true };

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
    await updateCache(allPlayers, aiResults);
    await applyDevelopment(aiResults).catch(() => {});
    await generateAIOffers().catch(() => {});
    const newDate = new Date(save.currentDate);
    newDate.setDate(newDate.getDate() + 7);
    await putSave({ ...save, currentGameweek: gw + 1, currentDate: newDate.toISOString(), pendingEvents: [] });
    return { skipped: true, gameweek: gw, nextGW: gw + 1, finished: gw + 1 > save.totalGameweeks };
  }

  const event = pending[0];
  const remaining = pending.slice(1);
  let singleResult = null;
  let cupResults   = [];
  let updatedCups  = JSON.parse(JSON.stringify(save.cups ?? {}));

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

      const result = simulateMatch(home, away, hPl, aPl, hFm, aFm, hLineup, aLineup);
      await putFixture({ ...fix, played:true, homeGoals:result.homeGoals, awayGoals:result.awayGoals, homeScorers:result.homeScorers, awayScorers:result.awayScorers, events:result.events });
      await applyResult(result);

      // AI fixtures for this GW — simulate silently NOW
      const refreshedGW = await getFixturesByGW(gw);
      const aiUnplayed  = refreshedGW.filter(f => !f.played);
      const aiResults   = await simulateFixtures(aiUnplayed, teamsById, playersByTeam, save);
      for (const r of aiResults) await applyResult(r);
      await recomputePositions();
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
    const mdResult   = simulateUCLMatchday(userTeam, userPlayers, cupState);

    if (mdResult) {
      const lp    = cupState.leaguePhase ?? {};
      const newMD = (lp.matchday ?? 0) + 1;
      const newPts = (lp.points ?? 0) + mdResult.points;
      const newGD  = (lp.gd ?? 0) + mdResult.gd;
      const phaseComplete = newMD >= 8;
      updatedCups.ucl = {
        ...cupState,
        leaguePhase: { ...lp, matchday: newMD, points: newPts, gd: newGD },
        results: [...(cupState.results ?? []), mdResult],
        leaguePhaseComplete: phaseComplete,
        ...(phaseComplete ? { roundIndex:0, status: newPts >= 7 ? 'active' : 'eliminated' } : {}),
      };
      cupResults.push({ ...mdResult, cupId:'ucl', isUCLMatchday:true });

      // Build a synthetic "result" for the match report
      singleResult = buildCupMatchResult(mdResult, save.userTeamId, event, allTeams);
    }
    pending = remaining;

  } else if (event.type === 'cup') {
    // ── Simulate knockout cup round ───────────────────────────
    const userTeam    = allTeams.find(t => t.id === save.userTeamId);
    const userPlayers = playersByTeam.get(save.userTeamId) ?? [];
    const cupState    = save.cups?.[event.cupId];
    const result      = simulateCupRound(userTeam, userPlayers, allTeams, playersByTeam, event.cupId, event.roundName, event);
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
    pending = remaining;
  }

  // ── Advance GW if no more pending events ──────────────────
  const gwDone     = pending.length === 0;
  const nextGW     = gwDone ? gw + 1 : gw;
  const newDate    = new Date(save.currentDate);
  if (gwDone) newDate.setDate(newDate.getDate() + 7);

  if (gwDone) await generateAIOffers().catch(() => {});

  await putSave({
    ...save,
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
    finished:   nextGW > save.totalGameweeks,
    eventsLeft: pending.length,
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
      { userGoals, oppGoals, userIsHome, scorers: matchResult.homeScorers.concat(matchResult.awayScorers), opponentName: event0.opponentName ?? event0.oppName, opponentNation: event0.oppNation },
      save.userTeamId, event0, allTeams
    );
    await updateCache(allPlayers, [matchResult]);
    await applyDevelopment([matchResult]).catch(() => {});
  }

  // Advance GW if no more pending
  const gwDone  = remaining.length === 0;
  const nextGW  = gwDone ? gw + 1 : gw;
  const newDate = new Date(save.currentDate);
  if (gwDone) { newDate.setDate(newDate.getDate() + 7); await generateAIOffers().catch(()=>{}); }

  await putSave({ ...save, currentGameweek: nextGW, currentDate: gwDone ? newDate.toISOString() : save.currentDate, cups: updatedCups, pendingEvents: remaining });

  return { singleResult, eventType: event0?.type, cupResults: [], gameweek: gw, nextGW, finished: nextGW > save.totalGameweeks, eventsLeft: remaining.length };
}

// ─── Build a synthetic match result for the report modal ──────
function buildCupMatchResult(r, userTeamId, event, allTeams) {
  const teamsById = new Map(allTeams.map(t => [t.id, t]));
  if (event.type === 'ucl_md') {
    const userIsHome = r.userIsHome ?? true;
    const userName   = teamsById.get(userTeamId)?.name ?? 'Your Team';
    const userCrest  = teamsById.get(userTeamId)?.crest ?? '⚽';
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
      homeTeamId:    userIsHome ? userTeamId : 'opp',
      awayTeamId:    userIsHome ? 'opp' : userTeamId,
      homeGoals:     userIsHome ? r.userGoals : r.oppGoals,
      awayGoals:     userIsHome ? r.oppGoals  : r.userGoals,
      homeTeamName:  userIsHome ? userName : r.opponentName,
      awayTeamName:  userIsHome ? r.opponentName : userName,
      homeTeamCrest: userIsHome ? userCrest : (r.opponentNation ?? '⚽'),
      awayTeamCrest: userIsHome ? (r.opponentNation ?? '⚽') : userCrest,
      homeScorers:   userIsHome ? (r.homeScorers ?? r.scorers ?? []) : (r.awayScorers ?? []),
      awayScorers:   userIsHome ? (r.awayScorers ?? []) : (r.homeScorers ?? r.scorers ?? []),
      events:        [],
      stats:         { possession:{home:50,away:50}, shots:{home:0,away:0}, shotsOnTarget:{home:0,away:0}, xG:{home:0,away:0}, corners:{home:0,away:0}, fouls:{home:0,away:0}, yellowCards:{home:0,away:0} },
      fitnessUpdates:[],
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
    homeScorers:   userIsHome ? (r.scorers ?? []) : [],
    awayScorers:   userIsHome ? [] : (r.scorers ?? []),
    events:        [],
    stats:         { possession:{home:50,away:50}, shots:{home:0,away:0}, shotsOnTarget:{home:0,away:0}, xG:{home:0,away:0}, corners:{home:0,away:0}, fouls:{home:0,away:0}, yellowCards:{home:0,away:0} },
    fitnessUpdates:[],
    isUserMatch:   true,
    userTeamId,
    gameweek:      event.gw,
  };
}

// ─── Helpers ─────────────────────────────────────────────────
async function simulateFixtures(fixtures, teamsById, playersByTeam, save) {
  const results = [];
  for (const f of fixtures) {
    const home = teamsById.get(f.homeTeamId) ?? { id:f.homeTeamId, name:f.homeTeamId, crest:'⚽' };
    const away = teamsById.get(f.awayTeamId) ?? { id:f.awayTeamId, name:f.awayTeamId, crest:'⚽' };
    const r    = simulateMatch(home, away, playersByTeam.get(f.homeTeamId)??[], playersByTeam.get(f.awayTeamId)??[], pickAIFormation(), pickAIFormation());
    await putFixture({ ...f, played:true, homeGoals:r.homeGoals, awayGoals:r.awayGoals, homeScorers:r.homeScorers, awayScorers:r.awayScorers, events:r.events });
    results.push(r);
  }
  return results;
}

async function updateCache(allPlayers, results) {
  const cache = new Map(allPlayers.map(p => [p.id, { ...p }]));
  updatePlayerStats(cache, results);
  applyFitnessUpdates(cache, results);
  // Between-match fitness recovery: played players recover +15, non-played +20 (simulates ~7 days rest)
  for (const p of cache.values()) {
    const recovery = p._played ? 15 : 20;
    p.fitness = Math.min(100, (p.fitness ?? 80) + recovery);
    delete p._played;
  }
  await putPlayersBulk([...cache.values()]);
}

function groupByTeam(players) {
  const m = new Map();
  for (const p of players) { if (!m.has(p.teamId)) m.set(p.teamId, []); m.get(p.teamId).push(p); }
  return m;
}

function updatePlayerStats(cache, results) {
  for (const r of results) {
    for (const evt of [...(r.homeScorers??[]), ...(r.awayScorers??[])]) {
      const p=cache.get(evt.playerId); if(p){p.goals=(p.goals??0)+1;p._played=true;}
      if(evt.assistId){const a=cache.get(evt.assistId);if(a){a.assists=(a.assists??0)+1;a._played=true;}}
    }
    if(r.awayGoals===0) awardCS(cache,r.homeTeamId);
    if(r.homeGoals===0) awardCS(cache,r.awayTeamId);
  }
}

function awardCS(cache,teamId) {
  for(const p of cache.values()){if(p.teamId===teamId&&p.position==='GK'&&p.inSquad!==false&&!p.injured){p.cleanSheets=(p.cleanSheets??0)+1;p._played=true;break;}}
}

function applyFitnessUpdates(cache,results) {
  for(const r of results) for(const fu of r.fitnessUpdates??[]){const p=cache.get(fu.id);if(p){p.fitness=fu.newFitness;p._played=true;}}
}
