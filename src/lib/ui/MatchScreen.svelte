<script>
  import { flip } from 'svelte/animate';
  import {
    getAllFixtures, getAllTeams, getFixturesByGW, getPlayersByTeam, getSave, openDB, putSave,
  } from '../../modules/db.js';
  import { CUP_META } from '../../modules/cups.js';
  // 🚑 Injuries — legacy validation anchor; UI uses the injury icon/text section below.
  import { injuryDurationLabel } from '../../modules/injuries.js';
  import {
    advanceOneFixture, advanceOneFixtureWithResult, getNextMatchEvent,
  } from '../../modules/gameweek.js';
  import {
    buildLiveMatchState, finaliseLiveMatch,
    positionGroup, primaryRating, selectEleven, simulateMatchSegment,
  } from '../../modules/matchEngine.js';
  import { buildManagedMatchInputs, buildOpponentTacticalInsight } from '../../modules/managerTactics.js';
  import { createUserTacticalPlan } from '../../modules/tactics.js';
  import { getTableSliceAroundTeam } from '../../modules/standings.js';
  import { SLOT_LAYOUT, SLOT_POS_MAP } from '../../game/formationLayout.js';
  import { applySubstitution, eligibleSubOutTargets } from '../../game/substitutions.js';
  import { applyFormationChange, applyMentalityChange, applyTeamInstructionChange } from '../../game/formationChange.js';
  import { generateStubPlayers } from '../../game/opponents.js';
  import { advanceBroadcastSimulation, createBroadcastSimulation, isBroadcastReady, replaceBroadcastLineups, updateBroadcastSimulation } from '../../game/broadcastSimulation.js';
  import { describeBroadcastFrame } from '../../game/broadcastFrameSemantics.js';
  import { resolveMatchKits } from '../../game/matchKits.js';
  import { fmt, formLabel, navigateTo, playerNationality, posGroup, setMatchNavigationLocked, toast } from '../../ui/helpers.js';
  import { cloudSaveCheckpoint } from '../../cloud/sync.js';
  import { renderHome } from '../../ui/home_transfers.js';
  import { newsAIBid, newsInjury, newsMatchResult } from '../../ui/inbox.js';
  import { screenTicks } from '../state/screens.svelte.js';
  import Crest from './kit/Crest.svelte';
  import Icon from './kit/Icon.svelte';
  import MatchTacticalAnalysisPanel from './MatchTacticalAnalysisPanel.svelte';
  import TeamInstructionsPanel from './TeamInstructionsPanel.svelte';

  /**
   * MatchScreen.svelte — the live-match route (Phase 5,
   * docs/plan/04-migration-phases.md). Replaces ui/prematch.js's pre-match
   * modal and ui/watchmatch.js's innerHTML live viewer with a real five-beat
   * route: team news -> kickoff -> live -> full time -> after. Reached only
   * via Play (TabBar's FAB or Home's #btn-adv-header) through the same
   * registerScreen()/navigateTo() mechanism every other screen uses — not a
   * TabBar destination of its own.
   *
   * T4 keeps this route presentation-only around one shared authoritative
   * tactics schema: pre-match changes persist the user plan, and live changes
   * update the same engine state through formationChange.js before persisting
   * that canonical v2 plan for future matches.
   */

  const WATCH_PHASES_PER_TICK = 1;
  const WATCH_TICK_MS         = 1000;
  const TOTAL_PHASES          = 120;

  let active  = $state(false);
  let loading = $state(true);
  let beat    = $state('teamNews');

  let matchCtx = $state.raw(null);
  let beforeTable = [];
  let afterTable  = [];
  let tableSlice  = $state([]);

  let live = $state.raw(null);
  let tickTimer = null;
  let kickoffTimer = null;
  let broadcastFrame = $state(null);
  let broadcastSimulation = null;
  let presentationFrame = null;
  let presentationAt = 0;
  let presentationPossession = null;
  let presentationEvent = null;
  let goalNotice = $state(null);
  let queuedGoalNotice = null;
  let goalNoticeTimer = null;
  let displayHomeGoals = $state(0);
  let displayAwayGoals = $state(0);

  let result          = $state.raw(null);
  let resultCommitted = $state(false);
  let committing       = $state(false);

  let tacticsSheetOpen       = $state(false);
  let tacticsPickerFormation = $state('4-3-3');
  let tacticsSheetWasPaused  = false;
  let tacticsSubInId         = $state(null);
  let tacticsSubOutId        = $state(null);

  function vibrate(pattern) {
    try { window.navigator?.vibrate?.(pattern); } catch { /* not supported */ }
  }

  async function getTeamRecentForm(teamId, n = 5) {
    const all = await getAllFixtures();
    return all
      .filter(f => f.played && (f.homeTeamId === teamId || f.awayTeamId === teamId))
      .sort((a, b) => b.gameweek - a.gameweek)
      .slice(0, n)
      .reverse()
      .map(f => {
        const isH = f.homeTeamId === teamId;
        const gf = isH ? f.homeGoals : f.awayGoals;
        const ga = isH ? f.awayGoals : f.homeGoals;
        return { result: gf > ga ? 'W' : gf < ga ? 'L' : 'D', gf, ga, gameweek: f.gameweek };
      });
  }

  async function getInFormPlayer(teamId) {
    const players = await getPlayersByTeam(teamId);
    return players
      .filter(p => !p.injured)
      .sort((a, b) => {
        const sa = (a.goals ?? 0) * 8 + (a.assists ?? 0) * 5 + (a.cleanSheets ?? 0) * 6;
        const sb = (b.goals ?? 0) * 8 + (b.assists ?? 0) * 5 + (b.cleanSheets ?? 0) * 6;
        return sb - sa;
      })[0] ?? null;
  }

  async function buildMatchCtx(event, save) {
    const allTeams  = await getAllTeams();
    const teamsById = new Map(allTeams.map(t => [t.id, t]));
    const teamByName = (name) => allTeams.find(t => t.name === name || t.shortName === name) ?? null;
    const userTeam  = teamsById.get(save.userTeamId) ?? { id: save.userTeamId, name: 'Your Team', reputation: 70 };

    let oppTeam, oppForm = [], oppInForm = null;
    let matchTitle, compLabel, userIsHome;
    let compColor = 'var(--color-live)', isLeague = false;

    if (event.type === 'league') {
      const fix = (await getFixturesByGW(event.gw)).find(f => f.id === event.fixtureId);
      if (!fix) return null;
      userIsHome = fix.homeTeamId === save.userTeamId;
      const oppId = userIsHome ? fix.awayTeamId : fix.homeTeamId;
      oppTeam = teamsById.get(oppId) ?? { id: oppId, name: oppId, reputation: 70 };
      [oppForm, oppInForm] = await Promise.all([getTeamRecentForm(oppId, 5), getInFormPlayer(oppId)]);
      matchTitle = `${userIsHome ? 'Home' : 'Away'} · GW${event.gw}`;
      compLabel  = save.userLeague ?? 'League';
      isLeague   = true;
    } else if (event.type === 'ucl_md') {
      oppTeam    = teamsById.get(event.opponentId) ?? teamByName(event.oppName) ?? { id:event.opponentId, name: event.oppName, reputation: event.oppStrength ?? 72 };
      userIsHome = event.userIsHome ?? true;
      matchTitle = `Champions League · Matchday ${event.matchday}`;
      compLabel  = 'Champions League';
      compColor  = '#3b82f6';
    } else if (event.type === 'cup') {
      const meta      = CUP_META[event.cupId] ?? {};
      const cupState  = save.cups?.[event.cupId];
      const lastResult = cupState?.results?.slice(-1)[0];
      const oppName  = event.opponentName ?? lastResult?.opponentName ?? 'TBD';
      oppTeam    = teamsById.get(event.opponentId) ?? teamByName(oppName) ?? { id:event.opponentId, name: oppName, reputation: event.opponentRep ?? 70 };
      userIsHome = event.userIsHome ?? true;
      matchTitle = `${meta.name ?? event.cupId} · ${event.roundName ?? ''}`;
      compLabel  = meta.name ?? event.cupId;
      compColor  = meta.color ?? 'var(--color-club)';
    } else {
      return null;
    }

    // P1 already tracks the real world; use it for cup/European opponents when
    // the drawn club exists in the persisted world rather than showing a
    // generic scouting card.
    if (!isLeague && oppTeam?.id && teamsById.has(oppTeam.id)) {
      [oppForm, oppInForm] = await Promise.all([
        getTeamRecentForm(oppTeam.id, 5).catch(() => []),
        getInFormPlayer(oppTeam.id).catch(() => null),
      ]);
    }

    const userPlayers  = await getPlayersByTeam(save.userTeamId);
    let opponentPlayers = oppTeam?.id
      ? await getPlayersByTeam(oppTeam.id).catch(() => [])
      : [];
    if (!opponentPlayers.length && !isLeague) {
      const strength = event.opponentRep ?? event.oppStrength ?? 72;
      opponentPlayers = generateStubPlayers(oppTeam, strength);
    }
    const userFormation = save.formation ?? '4-3-3';
    const userLineup    = save.lineup ?? null;
    const { profile:oppTacticalProfile, insight:oppInsight } = buildOpponentTacticalInsight({
      opponentTeam:oppTeam,
      userTeam,
      userIsHome,
      opponentPlayers,
      form:oppForm,
      keyPlayer:oppInForm,
    });

    const { injuredInLineup, lineupIncomplete, lineupBlocked } = lineupAvailability(userLineup, userPlayers);

    return {
      event, save, userTeam, oppTeam, oppForm, oppInForm, opponentPlayers, oppTacticalProfile, oppInsight,
      matchTitle, compLabel, compColor, isLeague, userIsHome,
      userPlayers, userFormation, userLineup,
      injuredInLineup, lineupIncomplete,
      lineupBlocked,
    };
  }

  function lineupAvailability(userLineup, userPlayers) {
    const injuredInLineup = userLineup
      ? userPlayers.filter(player => player.injured && userLineup.includes(player.id))
      : [];
    const lineupIncomplete = !userLineup || userLineup.length !== 11
      || new Set(userLineup).size !== 11
      || userLineup.some(playerId => !userPlayers.some(player => player.id === playerId && player.inSquad !== false));
    return { injuredInLineup, lineupIncomplete, lineupBlocked:injuredInLineup.length > 0 || lineupIncomplete };
  }

  const blockMsg = $derived(
    matchCtx?.injuredInLineup?.length > 0
      ? 'Fix your lineup — injured players selected. Go to Squad.'
      : 'Set a full starting XI in Squad before playing.'
  );

  function diffLabel(rep) {
    if (rep >= 90) return { text: 'Very Strong', cls: 'diff-hard' };
    if (rep >= 82) return { text: 'Strong', cls: 'diff-hard' };
    if (rep >= 74) return { text: 'Even', cls: 'diff-mid' };
    if (rep >= 66) return { text: 'Favourable', cls: 'diff-easy' };
    return { text: 'Underdog', cls: 'diff-easy' };
  }

  function assignToSlots(xi, slots) {
    const used = [];
    const out  = new Array(slots.length).fill(null);
    slots.forEach((slot, i) => {
      const acceptable = SLOT_POS_MAP[slot.p] ?? [slot.p];
      const cand = xi.find(p => !used.includes(p.id) && acceptable.includes(p.position));
      if (cand) { out[i] = cand; used.push(cand.id); }
    });
    slots.forEach((slot, i) => {
      if (out[i]) return;
      const cand = xi.find(p => !used.includes(p.id));
      if (cand) { out[i] = cand; used.push(cand.id); }
    });
    return out;
  }

  const teamNewsSlots = $derived(SLOT_LAYOUT[matchCtx?.userFormation ?? '4-3-3'] ?? SLOT_LAYOUT['4-3-3']);
  const teamNewsXI = $derived.by(() => {
    if (!matchCtx) return [];
    if (matchCtx.userLineup && matchCtx.userLineup.length === 11) {
      const found = matchCtx.userLineup.map(pid => matchCtx.userPlayers.find(p => p.id === pid)).filter(Boolean);
      if (found.length === 11) return found;
    }
    return selectEleven(matchCtx.userPlayers.map(p => ({ ...p, fitness: p.fitness ?? 90, inSquad: p.inSquad !== false })), matchCtx.userFormation);
  });
  const teamNewsAssignment = $derived(assignToSlots(teamNewsXI, teamNewsSlots));
  const displayHomeTeam = $derived(live?.homeTeam ?? (matchCtx ? (matchCtx.userIsHome ? matchCtx.userTeam : matchCtx.oppTeam) : null));
  const displayAwayTeam = $derived(live?.awayTeam ?? (matchCtx ? (matchCtx.userIsHome ? matchCtx.oppTeam : matchCtx.userTeam) : null));

  async function loadMatch() {
    active = true;
    loading = true;
    await openDB();
    const save = await getSave();
    if (!save || save._deleted) { active = false; loading = true; return; }
    const event = await getNextMatchEvent();

    if (!event || event.type === 'no_user_event') {
      await advanceOneFixture(null);
      await renderHome();
      active = false;
      await navigateTo('home');
      return;
    }

    const ctx = await buildMatchCtx(event, save);
    if (!ctx) {
      await advanceOneFixture(null);
      await renderHome();
      active = false;
      await navigateTo('home');
      return;
    }

    matchCtx = ctx;
    beforeTable = ctx.isLeague ? await getTableSliceAroundTeam(save.userTeamId, 1).catch(() => []) : [];
    loading = false;
    beat = 'teamNews';
    cloudSaveCheckpoint();
  }

  async function refreshTeamNewsLineup() {
    if (!matchCtx || beat !== 'teamNews') return;
    const freshSave = await getSave();
    if (!freshSave || freshSave._deleted || beat !== 'teamNews') return;
    const freshPlayers = await getPlayersByTeam(freshSave.userTeamId);
    const userFormation = freshSave.formation ?? '4-3-3';
    const userLineup = freshSave.lineup ?? null;
    const availability = lineupAvailability(userLineup, freshPlayers);
    matchCtx = {
      ...matchCtx, save:freshSave, userPlayers:freshPlayers, userFormation, userLineup,
      ...availability,
    };
  }

  async function applyTeamNewsInstruction(instructionId, value) {
    if (!matchCtx || beat !== 'teamNews') return;
    const currentSave = await getSave();
    if (!currentSave || currentSave._deleted) return;
    const instructions = {
      ...(currentSave.tactics?.instructions ?? currentSave.tactics ?? {}),
      [instructionId]:value,
    };
    const tactics = createUserTacticalPlan(instructions);
    const updatedSave = { ...currentSave, tactics };
    await putSave(updatedSave);
    matchCtx = { ...matchCtx, save:updatedSave };
  }

  $effect(() => {
    void screenTicks.match;
    if (!active) loadMatch();
    else if (beat === 'teamNews') void Promise.resolve().then(refreshTeamNewsLineup);
  });

  async function resolveMatchTeams(ctx) {
    const allTeams2  = await getAllTeams();
    const teamsById2 = new Map(allTeams2.map(t => [t.id, t]));
    const teamByName2 = (name) => allTeams2.find(t => t.name === name || t.shortName === name) ?? null;
    let homeTeam, awayTeam, homePlayers, awayPlayers, patchedEvent;

    if (ctx.event.type === 'league') {
      const fix2 = (await getFixturesByGW(ctx.event.gw)).find(f => f.id === ctx.event.fixtureId);
      if (!fix2) return null;
      const userIsHome2 = fix2.homeTeamId === ctx.save.userTeamId;
      const oppId2  = userIsHome2 ? fix2.awayTeamId : fix2.homeTeamId;
      const realOpp = teamsById2.get(oppId2) ?? ctx.oppTeam;
      const userPlayers = await getPlayersByTeam(ctx.userTeam.id);
      const oppPlayers = ctx.opponentPlayers?.length
        ? ctx.opponentPlayers
        : await getPlayersByTeam(realOpp.id);
      homeTeam = userIsHome2 ? ctx.userTeam : realOpp;
      awayTeam = userIsHome2 ? realOpp : ctx.userTeam;
      homePlayers = userIsHome2 ? userPlayers : oppPlayers;
      awayPlayers = userIsHome2 ? oppPlayers : userPlayers;
      patchedEvent = { ...ctx.event, userIsHome: userIsHome2 };
      return { homeTeam, awayTeam, homePlayers, awayPlayers, userIsHome: userIsHome2, patchedEvent };
    }

    const userIsHomeC = ctx.event.userIsHome ?? true;
    const realOpp = teamsById2.get(ctx.event.opponentId) ?? teamByName2(ctx.oppTeam.name) ?? ctx.oppTeam;
    const userPlayers = await getPlayersByTeam(ctx.userTeam.id);
    let oppPlayers = ctx.opponentPlayers?.length
      ? ctx.opponentPlayers
      : realOpp?.id
        ? await getPlayersByTeam(realOpp.id).catch(() => [])
        : [];
    if (!oppPlayers.length) {
      const strength = ctx.event.opponentRep ?? ctx.event.oppStrength ?? 72;
      oppPlayers = generateStubPlayers(realOpp, strength);
    }
    homeTeam = userIsHomeC ? ctx.userTeam : realOpp;
    awayTeam = userIsHomeC ? realOpp : ctx.userTeam;
    homePlayers = userIsHomeC ? userPlayers : oppPlayers;
    awayPlayers = userIsHomeC ? oppPlayers : userPlayers;
    patchedEvent = { ...ctx.event, userIsHome: userIsHomeC };
    return { homeTeam, awayTeam, homePlayers, awayPlayers, userIsHome: userIsHomeC, patchedEvent };
  }

  async function startWatch() {
    if (matchCtx.lineupBlocked) { toast(blockMsg, 'error', 5000); return; }
    loading = true;
    const resolved = await resolveMatchTeams(matchCtx);
    loading = false;
    if (!resolved) { await simInstant(); return; }

    // Watched and instant paths consume the same persisted v2 manager context.
    const inputs = buildManagedMatchInputs({
      save:matchCtx.save,
      homeTeam:resolved.homeTeam,
      awayTeam:resolved.awayTeam,
      homePlayers:resolved.homePlayers,
      awayPlayers:resolved.awayPlayers,
      userIsHome:resolved.userIsHome,
      overrideFormation:matchCtx.userFormation,
    });

    const liveState = buildLiveMatchState(
      inputs.homeTeam, inputs.awayTeam, inputs.homePlayers, inputs.awayPlayers,
      inputs.homeFormation, inputs.awayFormation, inputs.homeLineup, inputs.awayLineup,
      inputs.homeMentality, inputs.awayMentality,
      { homeBench:inputs.homeBench, awayBench:inputs.awayBench }
    );

    live = {
      liveState, allEvents: [],
      homeTeam: inputs.homeTeam, awayTeam: inputs.awayTeam,
      userTeam: matchCtx.userTeam, oppTeam: matchCtx.oppTeam,
      userPlayers: resolved.userIsHome ? inputs.homePlayers : inputs.awayPlayers,
      oppPlayers:  resolved.userIsHome ? inputs.awayPlayers : inputs.homePlayers,
      userIsHome: resolved.userIsHome,
      matchEvent: resolved.patchedEvent,
      currentPhase: 0, paused: false, speedMultiplier: 1,
    };
    setMatchNavigationLocked(true);
    displayHomeGoals = 0;
    displayAwayGoals = 0;
    presentationPossession = resolved.userIsHome ? live.homeTeam.id : live.awayTeam.id;
    broadcastSimulation = createBroadcastSimulation({
      homeTeamId: live.homeTeam.id, awayTeamId: live.awayTeam.id, ledgerDriven: true,
      possessionTeamId: presentationPossession,
      homeFormation: live.liveState.homeFormation, awayFormation: live.liveState.awayFormation,
      homePlayers: live.liveState.hActive, awayPlayers: live.liveState.aActive,
    });
    broadcastFrame = advanceBroadcastSimulation(broadcastSimulation, 0);
    startPresentation();
    beat = 'kickoff';
    kickoffTimer = window.setTimeout(() => {
      if (beat === 'kickoff') { beat = 'live'; scheduleTick(); }
    }, 900);
  }

  async function openSquadFromTeamNews() {
    await navigateTo('squad');
  }

  function skipKickoff() {
    if (beat !== 'kickoff') return;
    window.clearTimeout(kickoffTimer);
    beat = 'live';
    scheduleTick();
  }

  async function simInstant() {
    if (matchCtx.lineupBlocked) { toast(blockMsg, 'error', 5000); return; }
    loading = true;
    try {
      const res = await advanceOneFixture(matchCtx.userFormation);
      loading = false;
      if (res.finished || res.skipped) {
        await renderHome();
        active = false;
        await navigateTo('home');
        return;
      }
      result = res.singleResult;
      resultCommitted = true;
      live = { userTeam: matchCtx.userTeam, matchEvent: matchCtx.event, userIsHome: result?.homeTeamId === matchCtx.save.userTeamId };
      applyCommitExtras(res);
      beat = 'fulltime';
      cloudSaveCheckpoint();
    } catch (err) {
      loading = false;
      toast(`Error: ${err.message}`, 'error');
      console.error(err);
    }
  }

  function scheduleTick(extraDelay = 0) {
    const delay = Math.round(WATCH_TICK_MS / (live.speedMultiplier || 1));
    tickTimer = window.setTimeout(runTick, delay + extraDelay);
  }

  function runTick() {
    if (!live || live.paused) return;
    if (!isBroadcastReady(broadcastSimulation)) { scheduleTick(); return; }
    if (live.currentPhase >= TOTAL_PHASES) { finishMatch(); return; }
    const startPhase = live.currentPhase + 1;
    const endPhase   = Math.min(live.currentPhase + WATCH_PHASES_PER_TICK, TOTAL_PHASES);
    const beforeState = live.liveState;
    const { segEvents, updatedState } = simulateMatchSegment(
      live.homeTeam, live.awayTeam, beforeState, startPhase, endPhase, live.userTeam.id
    );
    live = { ...live, liveState: updatedState, currentPhase: endPhase, allEvents: [...live.allEvents, ...segEvents] };
    const possessionTeamId = updatedState.hPhases > beforeState.hPhases ? live.homeTeam.id : live.awayTeam.id;
    presentationPossession = possessionTeamId;
    presentationEvent = segEvents.find(event => event.type === 'goal') ?? null;
    updateBroadcastSimulation(broadcastSimulation, { phase: endPhase, possessionTeamId, event: presentationEvent, record: updatedState.actionLedger.at(-1) });
    replaceBroadcastLineups(broadcastSimulation, {
      homeFormation: updatedState.homeFormation, awayFormation: updatedState.awayFormation,
      homePlayers: updatedState.hActive, awayPlayers: updatedState.aActive,
    });
    handleNewEvents(segEvents);
    scheduleTick();
  }

  function handleNewEvents(segEvents) {
    for (const ev of segEvents) {
      const isUser = ev.teamId === live.userTeam.id;
      if (ev.type === 'goal') {
        queuedGoalNotice = { ...ev, isUser };
      } else if (ev.type === 'injury' && isUser && live && !live.paused) {
        togglePause();
        toast(`${ev.playerName} is injured! ${ev.injuryName || ''}`, 'error', 6000);
      }
    }
  }

  function revealGoalNotice() {
    if (!queuedGoalNotice) return;
    goalNotice = queuedGoalNotice;
    queuedGoalNotice = null;
    if (goalNotice.teamId === live.homeTeam.id) displayHomeGoals += 1;
    else if (goalNotice.teamId === live.awayTeam.id) displayAwayGoals += 1;
    vibrate([60]);
    window.clearTimeout(goalNoticeTimer);
    goalNoticeTimer = window.setTimeout(() => { goalNotice = null; }, 3200);
    if (goalNotice.isUser) toast(`GOAL! ${goalNotice.playerName}`, 'success');
  }

  function startPresentation() {
    window.cancelAnimationFrame(presentationFrame);
    presentationAt = window.performance.now();
    const animate = now => {
      presentationFrame = window.requestAnimationFrame(animate);
      if (!broadcastSimulation || !live || beat !== 'live') { presentationAt = now; return; }
      const elapsed = now - presentationAt;
      if (elapsed < 30) return;
      presentationAt = now;
      if (!live.paused) {
        // Substep accelerated presentation instead of losing time to the 50ms safety clamp.
        let remaining = Math.min(elapsed, 100) * live.speedMultiplier;
        while (remaining > 0) {
          const step = Math.min(remaining, 50);
          broadcastFrame = advanceBroadcastSimulation(broadcastSimulation, step);
          remaining -= step;
        }
        if (broadcastFrame.action === 'GOAL') revealGoalNotice();
      }
    };
    presentationFrame = window.requestAnimationFrame(animate);
  }

  function togglePause() {
    if (!live) return;
    live = { ...live, paused: !live.paused };
    if (!live.paused) scheduleTick();
    else window.clearTimeout(tickTimer);
  }

  function setSpeed(mult) {
    if (!live) return;
    live = { ...live, speedMultiplier: mult };
    if (!live.paused) {
      window.clearTimeout(tickTimer);
      scheduleTick();
    }
  }

  function skipMatch() {
    if (!live || live.currentPhase >= TOTAL_PHASES) return;
    window.clearTimeout(tickTimer);
    const startPhase = live.currentPhase + 1;
    const beforeState = live.liveState;
    const { segEvents, updatedState } = simulateMatchSegment(
      live.homeTeam, live.awayTeam, beforeState, startPhase, TOTAL_PHASES, live.userTeam.id
    );
    live = { ...live, liveState: updatedState, currentPhase: TOTAL_PHASES, allEvents: [...live.allEvents, ...segEvents] };
    updateBroadcastSimulation(broadcastSimulation, { phase: TOTAL_PHASES, possessionTeamId: updatedState.hPhases > beforeState.hPhases ? live.homeTeam.id : live.awayTeam.id, event: segEvents.find(event => event.type === 'goal') ?? null });
    handleNewEvents(segEvents);
    finishMatch();
  }

  function finishMatch() {
    window.clearTimeout(tickTimer);
    window.clearTimeout(goalNoticeTimer);
    window.cancelAnimationFrame(presentationFrame);
    result = finaliseLiveMatch(live.homeTeam, live.awayTeam, live.liveState, live.allEvents);
    resultCommitted = false;
    vibrate([80, 40, 80]);
    beat = 'fulltime';
  }

  const subsLeft = $derived.by(() => {
    if (!live?.liveState) return 0;
    return live.userIsHome ? live.liveState.hSubsLeft : live.liveState.aSubsLeft;
  });
  const benchList = $derived.by(() => {
    if (!live?.liveState) return [];
    const bench = live.userIsHome ? live.liveState.hBenchLeft : live.liveState.aBenchLeft;
    return [...bench].sort((a, b) => (b.fitness ?? 90) - (a.fitness ?? 90));
  });

  const matchKits = $derived(live ? resolveMatchKits(live.homeTeam, live.awayTeam) : null);
  const broadcastPresentation = $derived(describeBroadcastFrame(broadcastFrame, broadcastSimulation));
  const tacticsSlots = $derived(SLOT_LAYOUT[tacticsPickerFormation] ?? SLOT_LAYOUT['4-3-3']);
  const tacticsActivePlayers = $derived.by(() => {
    if (!live?.liveState) return [];
    return live.userIsHome ? live.liveState.hActive : live.liveState.aActive;
  });
  const tacticsAssignment = $derived(assignToSlots(tacticsActivePlayers, tacticsSlots));
  const tacticsSubIn = $derived(tacticsSubInId ? benchList.find(player => player.id === tacticsSubInId) ?? null : null);
  const tacticsSubOut = $derived(tacticsSubOutId ? tacticsActivePlayers.find(player => player.id === tacticsSubOutId) ?? null : null);
  const subOutOptions = $derived(tacticsSubIn && live?.liveState ? eligibleSubOutTargets(live.liveState, live.userIsHome, tacticsSubIn) : []);

  function applyTacticsSub(inPlayer, outPlayer) {
    if (!inPlayer || !outPlayer || !live?.liveState) return;
    const eligible = eligibleSubOutTargets(live.liveState, live.userIsHome, inPlayer);
    if (!eligible.some(player => player.id === outPlayer.id)) {
      toast(inPlayer.position === 'GK' ? 'A goalkeeper can only replace the goalkeeper' : 'Outfield players cannot replace the goalkeeper', 'error', 3000);
      return;
    }
    const minute = Math.ceil((live.currentPhase / TOTAL_PHASES) * 90);
    const { ok, liveState: newLs, event } = applySubstitution(live.liveState, live.userIsHome, inPlayer.id, outPlayer.id, minute, live.userTeam.id);
    if (ok) {
      live = { ...live, liveState: newLs, allEvents: [...live.allEvents, event] };
      replaceBroadcastLineups(broadcastSimulation, { homeFormation:newLs.homeFormation, awayFormation:newLs.awayFormation, homePlayers:newLs.hActive, awayPlayers:newLs.aActive });
      toast(`${event.inName} replaces ${event.outName}`, 'success', 3000);
    }
    tacticsSubInId = null;
    tacticsSubOutId = null;
  }

  function chooseTacticsBench(player) {
    if (subsLeft <= 0) { toast('No substitutions remaining', 'error'); return; }
    if (player.injured) { toast(`${player.name} is injured and cannot play.`, 'error', 4000); return; }
    if (tacticsSubOut) { applyTacticsSub(player, tacticsSubOut); return; }
    tacticsSubInId = tacticsSubInId === player.id ? null : player.id;
    if (tacticsSubInId && tacticsSubOutId && !eligibleSubOutTargets(live.liveState, live.userIsHome, player).some(p => p.id === tacticsSubOutId)) {
      tacticsSubOutId = null;
    }
  }

  function chooseTacticsStarter(player) {
    if (!tacticsSubIn) { tacticsSubOutId = tacticsSubOutId === player.id ? null : player.id; return; }
    if (!subOutOptions.some(option => option.id === player.id)) {
      toast(tacticsSubIn.position === 'GK' ? 'A goalkeeper can only replace the goalkeeper' : 'Outfield players cannot replace the goalkeeper', 'error', 3000);
      return;
    }
    applyTacticsSub(tacticsSubIn, player);
  }

  function openTacticsSheet() {
    tacticsSheetWasPaused = live.paused;
    if (!live.paused) togglePause();
    tacticsPickerFormation = live.userIsHome ? live.liveState.homeFormation : live.liveState.awayFormation;
    tacticsSubInId = null;
    tacticsSubOutId = null;
    tacticsSheetOpen = true;
  }
  function applyTactics(formation) {
    tacticsPickerFormation = formation;
    const newLs = applyFormationChange(live.liveState, live.userIsHome, formation);
    live = { ...live, liveState: newLs };
    replaceBroadcastLineups(broadcastSimulation, { homeFormation:newLs.homeFormation, awayFormation:newLs.awayFormation, homePlayers:newLs.hActive, awayPlayers:newLs.aActive });
    toast(`Formation changed to ${formation}`, 'info', 3000);
  }
  async function applyTacticsMentality(mentality) {
    if (!live || !matchCtx) return;
    const newLs = applyMentalityChange(live.liveState, live.userIsHome, mentality);
    live = { ...live, liveState: newLs };
    matchCtx = { ...matchCtx, save: { ...matchCtx.save, mentality } };
    const currentSave = await getSave();
    if (currentSave && !currentSave._deleted) await putSave({ ...currentSave, mentality });
    toast(`Mentality changed to ${mentality}`, 'info', 3000);
  }
  async function applyTacticsInstruction(instructionId, value) {
    if (!live?.liveState || !matchCtx) return;
    const newLs = applyTeamInstructionChange(live.liveState, live.userIsHome, instructionId, value);
    live = { ...live, liveState:newLs };
    const nextInstructions = live.userIsHome ? newLs.homeTactics : newLs.awayTactics;
    const tactics = createUserTacticalPlan(nextInstructions);
    matchCtx = { ...matchCtx, save:{ ...matchCtx.save, tactics } };
    const currentSave = await getSave();
    if (currentSave && !currentSave._deleted) await putSave({ ...currentSave, tactics });
  }
  function closeTacticsSheet() {
    tacticsSheetOpen = false;
    tacticsSubInId = null;
    tacticsSubOutId = null;
    if (!tacticsSheetWasPaused) togglePause();
  }

  function applyCommitExtras(res) {
    for (const cr of res.cupResults ?? []) {
      if (cr.isUCLMatchday) {
        toast(`UCL MD${cr.matchday}: ${cr.result} vs ${cr.opponentName} (${cr.userGoals}-${cr.oppGoals}) +${cr.points}pts`,
          cr.result === 'W' ? 'success' : cr.result === 'D' ? 'info' : 'error', 6000);
      } else if (!cr.eliminated && cr.opponentName) {
        const meta = CUP_META[cr.cupId];
        const lossLabel = (cr.roundName || '').includes('1st leg') ? 'Lost' : 'Out';
        toast(`${meta?.name ?? cr.cupId} ${cr.roundName}: ${cr.userWon ? 'Won' : lossLabel} vs ${cr.opponentName} (${cr.userGoals}-${cr.oppGoals})`,
          cr.userWon ? 'success' : 'error', 6000);
      }
    }
    if (res.newOffers?.length) {
      for (const o of res.newOffers) {
        toast(`${o.clubName} bid ${fmt.money(o.fee)} for ${o.playerName}`, 'info', 5000);
        newsAIBid({ name: o.playerName, id: o.playerId }, o.fee, o.clubName, matchCtx.save).catch(() => {});
      }
    }
    for (const response of res.playerResponses ?? []) {
      toast(response.message, response.tone, 5500);
    }
    const userInjEvts = (result?.events ?? []).filter(e => e.type === 'injury' && e.teamId === matchCtx.save.userTeamId);
    for (const inj of userInjEvts) {
      const wks = inj.injuryGWsLeft ?? 1;
      toast(`${inj.playerName} — ${inj.injuryName} (${injuryDurationLabel(wks)})`, 'error', 8000);
      newsInjury({ name: inj.playerName, id: inj.playerId }, inj.injuryName, wks, matchCtx.save).catch(() => {});
    }
    for (const p of res.recoveredPlayers ?? []) {
      toast(`${p.name} is fit and available again!`, 'success', 6000);
    }
    if (result) newsMatchResult(result, matchCtx.save).catch(() => {});
  }

  async function proceedToAfter() {
    if (!resultCommitted) {
      committing = true;
      try {
        const res = await advanceOneFixtureWithResult(result, live.matchEvent, live.userIsHome);
        applyCommitExtras(res);
        resultCommitted = true;
        cloudSaveCheckpoint();
      } catch (err) {
        committing = false;
        toast('Error saving result: ' + err.message, 'error');
        console.error(err);
        return;
      }
      committing = false;
    }
    await renderHome();
    tableSlice = beforeTable;
    beat = 'after';
    if (matchCtx.isLeague) {
      afterTable = await getTableSliceAroundTeam(matchCtx.save.userTeamId, 1).catch(() => []);
      window.setTimeout(() => { tableSlice = afterTable; }, 60);
    }
  }

  async function finishToHome() {
    window.clearTimeout(goalNoticeTimer);
    window.cancelAnimationFrame(presentationFrame);
    active = false;
    setMatchNavigationLocked(false);
    live = null; result = null; matchCtx = null; broadcastSimulation = null;
    resultCommitted = false; beat = 'teamNews'; tableSlice = [];
    beforeTable = []; afterTable = [];
    await navigateTo('home');
  }

  function userVerdict(r) {
    if (!r || !matchCtx) return '';
    const isHome = r.homeTeamId === matchCtx.save.userTeamId;
    const ug = isHome ? r.homeGoals : r.awayGoals;
    const og = isHome ? r.awayGoals : r.homeGoals;
    return ug > og ? 'WIN' : ug < og ? 'LOSS' : 'DRAW';
  }
  const MENTALITIES = [
    { id: 'defensive', label: 'Defensive' }, { id: 'balanced', label: 'Balanced' },
    { id: 'possession', label: 'Possession' }, { id: 'attacking', label: 'Attacking' },
  ];
  const MENTALITY_ICONS = { defensive: 'suspension', balanced: 'tactics', possession: 'ball', attacking: 'spark' };
  function mentalityIcon(mentality) {
    return MENTALITY_ICONS[mentality] ?? MENTALITY_ICONS.balanced;
  }
</script>

<div class="match-screen">
  {#if loading && !matchCtx}
    <div class="match-loading">Loading…</div>

  {:else if beat === 'teamNews' && matchCtx}
    {@const m = matchCtx}
    <div class="tn-wrap">
      <div class="tn-comp-badge" style="color:{m.compColor}">{m.compLabel}</div>
      <div class="tn-matchup">
        <div class="tn-team" class:tn-home={m.userIsHome}>
          <div class="tn-crest"><Crest team={m.userIsHome ? m.userTeam : m.oppTeam} size={34} /></div>
          <div class="tn-tname">{m.userIsHome ? m.userTeam.name : m.oppTeam.name}</div>
          <div class="tn-venue" style="color:{m.userIsHome ? 'var(--color-club)' : 'var(--color-tx-2)'}">HOME</div>
        </div>
        <div class="tn-vs-block">
          <div class="tn-vs">VS</div>
          <div class="tn-title">{m.matchTitle}</div>
          <div class="tn-diff {diffLabel(m.oppTeam.reputation ?? 70).cls}">{diffLabel(m.oppTeam.reputation ?? 70).text}</div>
        </div>
        <div class="tn-team" class:tn-home={!m.userIsHome}>
          <div class="tn-crest"><Crest team={m.userIsHome ? m.oppTeam : m.userTeam} size={34} /></div>
          <div class="tn-tname">{m.userIsHome ? m.oppTeam.name : m.userTeam.name}</div>
          <div class="tn-venue" style="color:{!m.userIsHome ? 'var(--color-club)' : 'var(--color-tx-2)'}">AWAY</div>
        </div>
      </div>

      <div class="tn-pitch-wrap">
        <div class="tn-pitch-bg">
          <div class="tn-pitch-line"></div>
          <div class="tn-pitch-circle"></div>
          {#each teamNewsSlots as slot, i (i)}
            {@const p = teamNewsAssignment[i]}
            <div class="tn-slot" style="left:{slot.x}%;top:{slot.y}%">
              {#if p}<div class="tn-slot-name" class:tn-slot-inj={p.injured}>{p.name.split(' ').pop()}{#if p.injured}<span class="tn-slot-injury" aria-label="Injured">!</span>{/if}</div>{/if}
            </div>
          {/each}
        </div>
      </div>

      <div class="tn-section">
        <div class="tn-section-title"><Crest team={m.oppTeam} size={16} /><span>{m.oppTeam.name} — Last 5</span></div>
        {#if m.oppForm.length}
          <div class="tn-form-row">
            {#each m.oppForm as r, i (i)}<span class="tn-form-pill {r.result}">{r.result}</span>{/each}
          </div>
        {:else}
          <div class="tn-empty-note">{m.event.type === 'league' ? 'No results yet' : 'No recent world results'}</div>
        {/if}
      </div>

      {#if m.oppInsight}
        <div class="tn-section tn-opposition-plan" data-testid="opposition-insight">
          <div class="tn-section-title"><Icon name="tactics" size={14} /><span>Likely Approach</span></div>
          <div class="tn-insight-head">
            <strong>{m.oppInsight.style}</strong>
            <span>{m.oppInsight.shape} · {m.oppInsight.mentality}</span>
          </div>
          <div class="tn-insight-line"><b>Threat</b><span>{m.oppInsight.threat}</span></div>
          <div class="tn-insight-line"><b>Opportunity</b><span>{m.oppInsight.weakness}</span></div>
        </div>
      {/if}

      {#if m.oppInForm}
        {@const fl = formLabel(m.oppInForm)}
        <div class="tn-section">
          <div class="tn-section-title"><Icon name="spark" size={14} /><span>Their Key Player</span></div>
          <div class="tn-inform-card">
            <div class="tn-inform-flag">{playerNationality(m.oppInForm, m.oppTeam.league)}</div>
            <div>
              <div class="tn-inform-name">{m.oppInForm.name}</div>
              <div class="tn-inform-meta">
                <span class="pos {posGroup(m.oppInForm.position)}">{m.oppInForm.position}</span>
                <span class="fb {fl.cls}">{fl.text}</span>
                {#if m.oppInForm.goals > 0}<span>G {m.oppInForm.goals}</span>{/if}
                {#if m.oppInForm.assists > 0}<span>A {m.oppInForm.assists}</span>{/if}
                {#if m.oppInForm.cleanSheets > 0}<span>CS {m.oppInForm.cleanSheets}</span>{/if}
              </div>
            </div>
          </div>
        </div>
      {/if}

      <div class="tn-section">
        <div class="tn-section-title"><Icon name="tactics" size={14} /><span>Your Formation — {m.userFormation}</span></div>
        <div class="tn-mentality">
          <Icon name={mentalityIcon(m.save.mentality ?? 'balanced')} size={14} />
          <span class="tn-mentality-label">{(m.save.mentality ?? 'balanced')}</span>
        </div>
      </div>

      <div class="tn-section">
        <div class="tn-section-title"><Icon name="tactics" size={14} /><span>Your Team Plan</span></div>
        <TeamInstructionsPanel
          compact
          instructions={m.save.tactics?.instructions ?? m.save.tactics ?? {}}
          players={teamNewsXI}
          rolesById={m.save.playerRoles ?? {}}
          onchange={applyTeamNewsInstruction}
        />
      </div>

      {#if m.injuredInLineup.length}
        <div class="tn-warning tn-warning-bad">
          <div class="tn-warning-title"><Icon name="injury" size={14} /><span>Injured Players in Lineup</span></div>
          {#each m.injuredInLineup as p (p.id)}
            <div class="tn-warning-line"><strong>{p.name}</strong> — {p.injuryName || 'Injured'} ({injuryDurationLabel(p.injuryGWsLeft)} remaining)</div>
          {/each}
          <div class="tn-warning-cta">Replace the injured player before playing.</div>
          <button class="tn-squad-link" onclick={openSquadFromTeamNews}>Open Squad →</button>
        </div>
      {/if}
      {#if m.lineupIncomplete}
        <div class="tn-warning tn-warning-warn">
          <div class="tn-warning-title"><Icon name="warning" size={14} /><span>Lineup Incomplete</span></div>
          <div class="tn-warning-cta">You must set a full starting XI in Squad before playing.</div>
          <button class="tn-squad-link" onclick={openSquadFromTeamNews}>Open Squad →</button>
        </div>
      {/if}
    </div>

    <div class="tn-actions">
      <button class="btn-full btn-secondary" disabled={m.lineupBlocked || loading} onclick={simInstant}><Icon name="speed" size={15} />Sim Instantly</button>
      <button class="btn-full btn-primary" disabled={m.lineupBlocked || loading} onclick={startWatch}><Icon name="eye" size={15} />Kick Off →</button>
    </div>

  {:else if beat === 'kickoff' && live}
    <div class="kickoff-beat" role="button" tabindex="0" onclick={skipKickoff} onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && skipKickoff()}>
      <div class="ko-crest"><Crest team={live.homeTeam} size={56} /></div>
      <div class="ko-vs">KICK OFF</div>
      <div class="ko-crest"><Crest team={live.awayTeam} size={56} /></div>
    </div>

  {:else if beat === 'live' && live}
    {@const minute = Math.ceil((live.currentPhase / TOTAL_PHASES) * 90)}
    {@const homeShare = live.currentPhase ? Math.round((live.liveState.hPhases / Math.max(1, live.liveState.hPhases + live.liveState.aPhases)) * 100) : 50}
    <div class="live-wrap">
      <div class="broadcast-label">LIVE · {matchCtx?.compLabel ?? 'MATCHDAY'}</div>
      <div class="score-bug">
        <div class="sb-team">
          <div class="sb-crest"><Crest team={live.homeTeam} size={26} /></div>
          <div class="sb-name">{live.homeTeam.name}</div>
        </div>
        <div class="sb-centre">
          <div class="sb-score">
            <span>{displayHomeGoals}</span><span class="sb-sep">–</span><span>{displayAwayGoals}</span>
          </div>
          <div class="sb-clock">{minute}'</div>
          <div class="sb-status">{live.paused ? 'PAUSED' : broadcastFrame?.mode === 'half-time' ? 'HALF TIME' : broadcastFrame?.half === 2 ? 'SECOND HALF' : 'FIRST HALF'}</div>
        </div>
        <div class="sb-team">
          <div class="sb-crest"><Crest team={live.awayTeam} size={26} /></div>
          <div class="sb-name">{live.awayTeam.name}</div>
        </div>
      </div>
      <div class="progress-wrap"><div class="progress-bar" style="width:{(live.currentPhase / TOTAL_PHASES) * 100}%"></div></div>
      <div class="phase-strip"><span class="phase-live">{live.paused ? 'PAUSED' : 'LIVE'}</span><strong>{broadcastPresentation?.phaseLabel ?? 'Kick off'}</strong></div>
      <div class="broadcast-pitch" role="img" aria-label="Live match pitch. Player movement illustrates the simulated action.">
        <div class="pitch-stripes"></div><div class="pitch-goal goal-top"></div><div class="pitch-goal goal-bottom"></div><div class="six-yard six-top"></div><div class="six-yard six-bottom"></div><div class="pitch-half"></div><div class="pitch-circle"></div><div class="pitch-box pitch-box-top"></div><div class="pitch-box pitch-box-bottom"></div>
        {#each broadcastFrame?.markers ?? [] as marker (marker.id)}
          <div
            class="broadcast-player {marker.team}"
            class:carrying={marker.owner}
            class:moving={marker.moving}
            class:keeper={marker.position === 'GK'}
            class:pressing={marker.pressing}
            class:receiving={marker.receiving}
            class:rushing={marker.rushing}
            style="left:{marker.x}%;top:{marker.y}%;--kit:{marker.team === 'home' ? matchKits?.home.color : matchKits?.away.color};color:{marker.team === 'home' ? matchKits?.home.numberColor : matchKits?.away.numberColor}"
          ><span class="player-head"></span><span class="player-shirt">{marker.shirt}</span><span class="player-legs"></span></div>
        {/each}
        {#if broadcastFrame?.ball}<div class="broadcast-ball" class:shooting={broadcastFrame.ball.shooting} style="left:{broadcastFrame.ball.x}%;top:{broadcastFrame.ball.y}%"></div>{/if}

        {#if goalNotice}
          <div class="goal-takeover" role="status">
            <span>GOAL!</span>
            <strong>{goalNotice.playerName}</strong>
            <small>{goalNotice.minute}' · {goalNotice.teamId === live.homeTeam.id ? live.homeTeam.name : live.awayTeam.name}</small>
          </div>
        {/if}
      </div>
      <div class="match-commentary"><strong>{broadcastPresentation?.action ?? 'TEAMS SET'}</strong><span>{broadcastPresentation?.detail || broadcastFrame?.carrierName || 'Ball in flight'}</span></div>
      <div class="momentum" aria-label={`Match possession: ${homeShare}% ${live.homeTeam.name}`}><span>{homeShare}%</span><div><i style={`width:${homeShare}%`}></i></div><span>{100 - homeShare}%</span></div>
    </div>

    <div class="live-controls">
      <button class="ctrl-btn" onclick={togglePause}><Icon name={live.paused ? 'play' : 'pause'} size={14} />{live.paused ? 'Resume' : 'Pause'}</button>
      <div class="speed-wrap">
        {#each [1, 2, 4] as s (s)}
          <button class="speed-btn" class:active={live.speedMultiplier === s} aria-label={`Match speed ${s} times`} aria-pressed={live.speedMultiplier === s} onclick={() => setSpeed(s)}>{s}×</button>
        {/each}
      </div>
      <button class="ctrl-btn" onclick={skipMatch}><Icon name="skip" size={14} />Skip</button>
      <button class="ctrl-btn tactics-control" onclick={openTacticsSheet}><Icon name="tactics" size={14} />Tactics <span>{subsLeft}</span></button>
    </div>

  {:else if beat === 'fulltime' && result}
    {@const verdict = userVerdict(result)}
    <div class="ft-wrap">
      <div class="ft-verdict ft-{verdict.toLowerCase()}">{verdict}</div>
      <div class="ft-header">
        <div class="ft-side">
          <div class="ft-crest"><Crest team={displayHomeTeam} size={40} label={`${result.homeTeamName} crest`} /></div>
          <div class="ft-tname">{result.homeTeamName}</div>
          <div class="ft-scorers">
            {#each result.homeScorers ?? [] as e, i (i)}<div><Icon name="ball" size={12} /><strong>{e.playerName}</strong> {e.minute}'</div>{/each}
          </div>
        </div>
        <div class="ft-score">{result.homeGoals}<span class="ft-sep">–</span>{result.awayGoals}</div>
        <div class="ft-side">
          <div class="ft-crest"><Crest team={displayAwayTeam} size={40} label={`${result.awayTeamName} crest`} /></div>
          <div class="ft-tname">{result.awayTeamName}</div>
          <div class="ft-scorers">
            {#each result.awayScorers ?? [] as e, i (i)}<div><Icon name="ball" size={12} /><strong>{e.playerName}</strong> {e.minute}'</div>{/each}
          </div>
        </div>
      </div>
      <div class="ft-status">FULL TIME</div>
    </div>
    <div class="ft-actions">
      <button class="btn-full btn-primary" disabled={committing} onclick={proceedToAfter}>{committing ? 'Saving…' : 'Continue →'}</button>
    </div>

  {:else if beat === 'after' && result}
    {@const s = result.stats ?? {}}
    {@const userSubs = (result.events ?? []).filter(e => e.type === 'sub' && e.teamId === matchCtx?.save.userTeamId)}
    {@const userInjuries = (result.events ?? []).filter(e => e.type === 'injury' && e.teamId === matchCtx?.save.userTeamId)}
    <div class="after-wrap">
      <div class="after-stats-lbl">
        <span>{(result.homeTeamName ?? '').split(' ')[0]}</span><span>{(result.awayTeamName ?? '').split(' ')[0]}</span>
      </div>
      <div class="after-stats">
        {#each [
          ['Possession %', s.possession?.home, s.possession?.away],
          ['Shots', s.shots?.home, s.shots?.away],
          ['On Target', s.shotsOnTarget?.home, s.shotsOnTarget?.away],
          ['xG', s.xG?.home?.toFixed?.(2) ?? s.xG?.home, s.xG?.away?.toFixed?.(2) ?? s.xG?.away],
          ['Corners', s.corners?.home, s.corners?.away],
          ['Fouls', s.fouls?.home, s.fouls?.away],
          ['Yellow Cards', s.yellowCards?.home, s.yellowCards?.away],
        ] as [label, hv, av] (label)}
          {@const total = (parseFloat(hv) || 0) + (parseFloat(av) || 0) || 1}
          {@const hPct = Math.round(((parseFloat(hv) || 0) / total) * 100)}
          <div class="after-stat-row">
            <span class="after-stat-val">{hv ?? 0}</span>
            <div class="after-stat-mid">
              <div class="after-stat-lbl">{label}</div>
              <div class="after-stat-bar-wrap"><div class="after-stat-bar-h" style="width:{hPct}%"></div><div class="after-stat-bar-a" style="width:{100 - hPct}%"></div></div>
            </div>
            <span class="after-stat-val">{av ?? 0}</span>
          </div>
        {/each}
      </div>

      <MatchTacticalAnalysisPanel
        analysis={result.tacticalAnalysis}
        userTeamId={matchCtx?.save.userTeamId}
        homeTeamName={result.homeTeamName}
        awayTeamName={result.awayTeamName}
      />

      {#if userSubs.length}
        <div class="after-section">
          <div class="after-section-title"><Icon name="refresh" size={14} /><span>Your Substitutions</span></div>
          {#each userSubs as sub, i (i)}<div class="after-line">↑ <strong>{sub.inName}</strong> ↓ {sub.outName} ({sub.minute}')</div>{/each}
        </div>
      {/if}
      {#if userInjuries.length}
        <div class="after-section after-section-bad">
          <div class="after-section-title"><Icon name="injury" size={14} /><span>Injuries</span></div>
          {#each userInjuries as inj, i (i)}<div class="after-line"><strong>{inj.playerName}</strong> — {inj.injuryName} ({injuryDurationLabel(inj.injuryGWsLeft)})</div>{/each}
        </div>
      {/if}

      {#if matchCtx?.isLeague && tableSlice.length}
        <div class="after-section">
          <div class="after-section-title"><Icon name="table" size={14} /><span>League Position</span></div>
          <div class="after-table">
            {#each tableSlice as row (row.teamId)}
              <div class="after-table-row" class:after-table-user={row.isUserTeam} animate:flip={{ duration: 400 }}>
                <span class="after-table-pos">{row.displayPosition}</span>
                <span class="after-table-crest"><Crest size={18} label={`${row.teamName} crest`} /></span>
                <span class="after-table-name">{row.shortName ?? row.teamName}</span>
                <span class="after-table-pts">{row.points} pts</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
    <div class="after-actions">
      <button class="btn-full btn-primary" onclick={finishToHome}>Continue →</button>
    </div>
  {/if}

  {#if tacticsSheetOpen && live}
    <section class="match-tactics" aria-label="Live match tactics">
      <header class="match-tactics-header">
        <div><span>LIVE · PAUSED</span><strong>{live.userTeam.name} Tactics</strong></div>
        <button class="match-tactics-close" onclick={closeTacticsSheet} aria-label="Back to match">← Match</button>
      </header>

      <div class="match-tactics-formations" aria-label="Formation">
        {#each Object.keys(SLOT_LAYOUT) as f (f)}
          <button class:active={f === tacticsPickerFormation} onclick={() => applyTactics(f)}>{f}</button>
        {/each}
      </div>

      <div class="match-tactics-mentalities" aria-label="Mentality">
        {#each MENTALITIES as mentality (mentality.id)}
          <button
            class:active={mentality.id === (live.userIsHome ? live.liveState.homeMentality : live.liveState.awayMentality)}
            onclick={() => applyTacticsMentality(mentality.id)}
            aria-label={`${mentality.label} mentality`}
          >{mentality.label}</button>
        {/each}
      </div>

      <div class="match-tactics-scroll">
        <TeamInstructionsPanel
          compact
          instructions={live.userIsHome ? live.liveState.homeTactics : live.liveState.awayTactics}
          players={tacticsActivePlayers}
          rolesById={live.userIsHome ? live.liveState.homeRoles : live.liveState.awayRoles}
          onchange={applyTacticsInstruction}
        />

        <div class="match-tactics-pitch-wrap">
          <div class="match-tactics-pitch">
            <div class="mtp-half"></div><div class="mtp-circle"></div>
            <div class="mtp-box top"></div><div class="mtp-box bottom"></div>
            {#each tacticsSlots as slot, i (i)}
              {@const player = tacticsAssignment[i]}
              {#if player}
                {@const eligible = !tacticsSubIn || subOutOptions.some(option => option.id === player.id)}
                <button
                  class="match-tactics-slot pos-{positionGroup(player.position)}"
                  class:selected={tacticsSubOutId === player.id}
                  class:unavailable={!eligible}
                  style="left:{slot.x}%;top:{slot.y}%"
                  onclick={() => chooseTacticsStarter(player)}
                  aria-label="Select {player.name}"
                >
                  <span class="mts-rating">{primaryRating(player)}</span>
                  <span class="mts-pos">{player.position}</span>
                  <small>{player.name.split(' ').pop()}</small>
                </button>
              {/if}
            {/each}
          </div>
        </div>

        <div class="match-tactics-bench">
          <div class="mtb-heading">
            <div><span>Bench</span><small>Tap two players — the change applies immediately</small></div>
            <strong>{subsLeft} left</strong>
          </div>
          <div class="match-tactics-bench-row">
            {#each benchList as player (player.id)}
              {@const fit = Math.round(player.fitness ?? 90)}
              <button class:selected={tacticsSubInId === player.id} onclick={() => chooseTacticsBench(player)}>
                <span class="mtb-avatar pos-{positionGroup(player.position)}">{player.name.split(' ').map(word => word[0]).join('').slice(0, 2)}</span>
                <span class="mtb-pos">{player.position}</span>
                <span class="mtb-name">{player.name.split(' ').pop()}</span>
                <span class="mtb-meta">{primaryRating(player)} · {fit}%</span>
              </button>
            {/each}
          </div>
        </div>
      </div>
    </section>
  {/if}
</div>

<style>
  .match-screen { height: 100%; display: flex; flex-direction: column; overflow-y: auto; overscroll-behavior: contain; font-family: var(--font-body); color: var(--color-tx); background: var(--color-ground); }
  .match-loading { display: flex; align-items: center; justify-content: center; flex: 1; color: var(--color-tx-2); }

  .tn-wrap { flex: 1; overflow-y: auto; padding: 16px 16px 8px; display: flex; flex-direction: column; gap: 14px; }
  .tn-comp-badge { font-family: var(--font-mono); font-size: 11px; letter-spacing: 1px; text-align: center; }
  .tn-matchup { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .tn-team { flex: 1; text-align: center; }
  .tn-crest { min-height: 34px; display: flex; align-items: center; justify-content: center; }
  .tn-tname { font-family: var(--font-display); font-size: 15px; letter-spacing: 0.3px; margin-top: 2px; }
  .tn-venue { font-size: 9px; font-family: var(--font-mono); letter-spacing: 1px; margin-top: 2px; }
  .tn-vs-block { text-align: center; padding: 0 8px; }
  .tn-vs { font-family: var(--font-display); font-size: 13px; color: var(--color-tx-3); }
  .tn-title { font-size: 11px; color: var(--color-tx-2); margin-top: 2px; }
  .tn-diff { font-size: 10px; font-family: var(--font-mono); margin-top: 4px; }
  .tn-diff.diff-hard { color: var(--color-bad); }
  .tn-diff.diff-mid { color: var(--color-warn); }
  .tn-diff.diff-easy { color: var(--color-live); }

  .tn-pitch-wrap { width: 100%; max-width: 320px; aspect-ratio: 68/78; margin: 0 auto; }
  .tn-pitch-bg { position: relative; width: 100%; height: 100%; background: linear-gradient(180deg, var(--color-turf), var(--color-turf-2)); border-radius: 10px; border: 1px solid var(--color-line); overflow: hidden; }
  .tn-pitch-line { position: absolute; top: 50%; left: 0; right: 0; height: 1px; background: rgba(255,255,255,0.15); }
  .tn-pitch-circle { position: absolute; top: 50%; left: 50%; width: 24%; aspect-ratio: 1; border: 1px solid rgba(255,255,255,0.15); border-radius: 50%; transform: translate(-50%, -50%); }
  .tn-slot { position: absolute; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; }
  .tn-slot-name { font-size: 8px; font-family: var(--font-mono); background: var(--color-club); color: var(--color-on-club, #fff); padding: 2px 4px; border-radius: 3px; white-space: nowrap; max-width: 60px; overflow: hidden; text-overflow: ellipsis; }
  .tn-slot-name.tn-slot-inj { background: var(--color-bad); }
  .tn-slot-injury { margin-left: 2px; font-weight: 900; }

  .tn-section-title { display: flex; align-items: center; gap: 6px; font-size: 11px; font-family: var(--font-mono); letter-spacing: 0.5px; color: var(--color-tx-2); margin-bottom: 6px; }
  .tn-form-row { display: flex; gap: 4px; }
  .tn-form-pill { width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; }
  .tn-form-pill.W { background: color-mix(in oklch, var(--color-live) 25%, transparent); color: var(--color-live); }
  .tn-form-pill.D { background: var(--color-raised); color: var(--color-tx-2); }
  .tn-form-pill.L { background: color-mix(in oklch, var(--color-bad) 25%, transparent); color: var(--color-bad); }
  .tn-empty-note { font-size: 11px; color: var(--color-tx-3); }

  .tn-opposition-plan { padding: 10px 12px; border: 1px solid var(--color-line); border-radius: 10px; background: var(--color-surface); }
  .tn-insight-head { display:flex; align-items:baseline; justify-content:space-between; gap:10px; margin-bottom:8px; }
  .tn-insight-head strong { font:700 14px var(--font-display); }
  .tn-insight-head span { color:var(--color-tx-3); font:9px var(--font-mono); text-transform:capitalize; text-align:right; }
  .tn-insight-line { display:grid; grid-template-columns:66px minmax(0,1fr); gap:8px; margin-top:6px; color:var(--color-tx-2); font-size:10px; line-height:1.4; }
  .tn-insight-line b { color:var(--color-club); font:700 9px var(--font-mono); text-transform:uppercase; letter-spacing:.6px; }

  .tn-inform-card { display: flex; align-items: center; gap: 10px; }
  .tn-inform-flag { min-width: 34px; padding: 4px 5px; border: 1px solid var(--color-line); border-radius: 5px; color: var(--color-tx-2); font: 700 9px var(--font-mono); text-align: center; }
  .tn-inform-name { font-weight: 600; font-size: 13px; }
  .tn-inform-meta { display: flex; gap: 6px; flex-wrap: wrap; font-size: 11px; color: var(--color-tx-2); margin-top: 2px; }

  .tn-mentality { display: flex; align-items: center; gap: 6px; font-size: 12px; }
  .tn-mentality-label { text-transform: capitalize; font-weight: 600; }

  .tn-warning { border-radius: 8px; padding: 10px 12px; font-size: 11px; }
  .tn-warning-bad { background: color-mix(in oklch, var(--color-bad) 10%, transparent); border: 1px solid color-mix(in oklch, var(--color-bad) 30%, transparent); }
  .tn-warning-warn { background: color-mix(in oklch, var(--color-warn) 10%, transparent); border: 1px solid color-mix(in oklch, var(--color-warn) 30%, transparent); }
  .tn-warning-title { display: flex; align-items: center; gap: 6px; font-weight: 700; margin-bottom: 4px; }
  .tn-warning-bad .tn-warning-title { color: var(--color-bad); }
  .tn-warning-warn .tn-warning-title { color: var(--color-warn); }
  .tn-warning-cta { color: var(--color-tx-2); margin-top: 4px; }
  .tn-squad-link { margin-top: 9px; min-height: 36px; padding: 0 12px; border: 1px solid var(--color-club); border-radius: 8px; background: transparent; color: var(--color-club); font: 700 11px var(--font-body); cursor: pointer; }

  .tn-actions, .ft-actions, .after-actions { display: flex; gap: 10px; padding: 12px 16px calc(12px + env(safe-area-inset-bottom)); border-top: 1px solid var(--color-line); flex-shrink: 0; }
  .tn-actions .btn-full, .live-controls .ctrl-btn, .after-section-title, .ft-scorers div { display: flex; align-items: center; justify-content: center; gap: 5px; }

  .kickoff-beat { flex: 1; display: flex; align-items: center; justify-content: center; gap: 24px; cursor: pointer; animation: ko-in 0.6s ease; }
  .ko-crest { width: 56px; height: 56px; display: grid; place-items: center; }
  .ko-vs { font-family: var(--font-display); font-size: 22px; letter-spacing: 2px; color: var(--color-club); }
  @keyframes ko-in { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }
  @media (prefers-reduced-motion: reduce) { .kickoff-beat { animation: none; } }

  .live-wrap { flex: 1; min-height: 0; overflow: hidden; padding: 10px 10px 6px; display: flex; flex-direction: column; }
  .broadcast-label { margin-bottom: 7px; font: 10px var(--font-mono); letter-spacing: 1.4px; color: var(--color-tx-3); text-align: center; }
  .score-bug { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .sb-team { flex: 1; text-align: center; }
  .sb-crest { min-height: 26px; display: flex; align-items: center; justify-content: center; }
  .sb-name { font-size: 11px; color: var(--color-tx-2); margin-top: 2px; }
  .sb-centre { text-align: center; }
  .sb-score { font-family: var(--font-display); font-size: 30px; }
  .sb-sep { margin: 0 6px; opacity: 0.4; }
  .sb-clock { font-family: var(--font-mono); font-size: 13px; color: var(--color-live); }
  .sb-status { font-size: 10px; font-family: var(--font-mono); color: var(--color-tx-3); letter-spacing: 1px; }
  .progress-wrap { height: 3px; background: var(--color-raised); border-radius: 2px; margin: 10px 0; overflow: hidden; }
  .progress-bar { height: 100%; background: var(--color-club); transition: width 0.3s linear; }
  .broadcast-pitch { position: relative; flex: 1; min-height: 240px; overflow: hidden; border: 1px solid color-mix(in oklch, var(--color-live) 40%, var(--color-line)); border-radius: 4px; background: #123d32; box-shadow: inset 0 0 48px rgba(0,0,0,.42); }
  .pitch-stripes { position: absolute; inset: 0; background: repeating-linear-gradient(0deg, rgba(255,255,255,.045) 0 10%, transparent 10% 20%); }
  .pitch-half { position: absolute; top: 50%; left: 0; right: 0; border-top: 1px solid rgba(255,255,255,.35); }
  .pitch-circle { position: absolute; width: 22%; aspect-ratio: 1; top: 50%; left: 50%; border: 1px solid rgba(255,255,255,.35); border-radius: 50%; transform: translate(-50%,-50%); }
  .pitch-box { position: absolute; left: 30%; width: 40%; height: 13%; border: 1px solid rgba(255,255,255,.35); }
  .pitch-box-top { top: 0; border-top: 0; } .pitch-box-bottom { bottom: 0; border-bottom: 0; }
  .broadcast-player { position: absolute; z-index: 2; width: 22px; height: 28px; transform: translate(-50%,-50%); filter: drop-shadow(1px 3px 1px rgba(0,0,0,.5)); will-change: left, top; }
  .player-head { position: absolute; top: 0; left: 8px; width: 6px; height: 6px; border-radius: 50%; background: #d6aa84; border-top: 2px solid #342c24; z-index: 2; }
  .player-shirt { position: absolute; top: 5px; left: 1px; width: 20px; height: 15px; background: var(--kit); clip-path: polygon(25% 0, 75% 0, 100% 25%, 88% 52%, 75% 40%, 75% 100%, 25% 100%, 25% 40%, 12% 52%, 0 25%); display: grid; place-items: center; font: 800 8px var(--font-mono); padding-top: 1px; }
  .player-legs { position: absolute; left: 6px; top: 19px; width: 4px; height: 8px; background: #eceded; border-bottom: 3px solid #111d1c; box-shadow: 6px 0 0 -0.2px #eceded; }
  .broadcast-player.keeper .player-shirt { background: #f0c84c; color: #182620; }
  .broadcast-player.carrying::after, .broadcast-player.receiving::after { content: ''; position: absolute; inset: 15px -3px -3px; border: 1px solid #f2e4b5; border-radius: 50%; opacity: .8; z-index: -1; }
  .broadcast-player.receiving::after { border-style: dashed; opacity: .35; }
  .broadcast-player.moving .player-legs { animation: player-stride .32s steps(2) infinite; }
  @keyframes player-stride { 50% { transform: translateY(-2px) rotate(12deg); } }
  .phase-strip { display: flex; align-items: center; gap: 8px; padding: 8px 0; font-size: 11px; min-height: 34px; }
  .phase-strip strong { font-weight: 500; color: var(--color-tx-2); }
  .phase-live { border-radius: 3px; padding: 3px 5px; background: #173e31; color: #b5efd1; font: 700 9px var(--font-mono); }
  .match-commentary { min-height: 49px; padding: 9px 10px; background: var(--color-raised); border: 1px solid var(--color-line); border-radius: 0 0 7px 7px; display: flex; flex-direction: column; gap: 4px; }
  .match-commentary strong { font: 600 10px var(--font-mono); color: var(--color-tx); }
  .match-commentary span { font-size: 11px; color: var(--color-tx-2); }
  .pitch-goal { position: absolute; left: 43%; width: 14%; height: 2.5%; border: 2px solid #dfe9dd; background: repeating-linear-gradient(90deg, #ffffff33 0 1px, transparent 1px 5px); }
  .goal-top { top: 0; } .goal-bottom { bottom: 0; }
  .six-yard { position: absolute; left: 40%; width: 20%; height: 5%; border: 1px solid #ffffff65; }
  .six-top { top: 0; border-top: 0; } .six-bottom { bottom: 0; border-bottom: 0; }
  .broadcast-ball { position: absolute; z-index: 4; width: 7px; height: 7px; border-radius: 50%; transform: translate(-50%,-50%); background: #fff; border: 1px solid #222; box-shadow: 0 1px 4px rgba(0,0,0,.8); will-change: left, top; }
  .broadcast-ball.shooting { width: 9px; height: 9px; box-shadow: 0 0 10px 3px rgba(255,255,255,.52); }
  .goal-takeover { position: absolute; z-index: 6; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; text-align: center; background: rgba(4, 18, 12, .62); color: white; animation: goal-flash 3.2s ease both; pointer-events: none; }
  .goal-takeover span { font: 700 32px var(--font-display); letter-spacing: 4px; color: #ffe357; text-shadow: 0 0 24px rgba(255, 227, 87, .8); }
  .goal-takeover strong { font-size: 17px; } .goal-takeover small { font: 11px var(--font-mono); letter-spacing: 1px; color: rgba(255,255,255,.78); }
  @keyframes goal-flash { 0% { opacity: 0; background: rgba(255,227,87,.7); } 10%, 78% { opacity: 1; } 100% { opacity: 0; } }
  .momentum { display: grid; grid-template-columns: minmax(0,1fr) 2fr minmax(0,1fr); gap: 6px; align-items: center; margin: 9px 0 3px; font: 9px var(--font-mono); color: var(--color-tx-3); }
  .momentum span:last-child { text-align: right; } .momentum > div { height: 4px; background: var(--color-raised); overflow: hidden; border-radius: 4px; } .momentum i { display: block; height: 100%; background: var(--color-club); transition: width .35s ease; }

  .live-events { max-height: 180px; overflow-y: auto; display: flex; flex-direction: column-reverse; gap: 4px; padding: 8px 0; border-top: 1px solid var(--color-line); border-bottom: 1px solid var(--color-line); }
  .ev-row { display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 3px 0; }
  .ev-row.ev-user { color: var(--color-club); }
  .ev-min { font-family: var(--font-mono); font-size: 10px; color: var(--color-tx-3); min-width: 24px; }
  .ev-assist { color: var(--color-tx-3); font-size: 11px; }
  .ev-in { color: var(--color-live); }
  .ev-out { color: var(--color-bad); }
  .ev-injury-tag { color: var(--color-bad); font-size: 9px; }
  .ev-placeholder { font-size: 11px; color: var(--color-tx-3); padding: 8px 0; }

  .live-panel { padding: 10px 0 4px; }
  .live-panel-title { font-size: 10px; font-family: var(--font-mono); letter-spacing: 1px; color: var(--color-tx-3); margin: 10px 0 6px; }
  .subs-left { color: var(--color-warn); margin-left: 6px; }
  .fitness-row, .bench-row { display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 4px 0; }
  .fitness-name, .bench-name { flex: 1; }
  .fitness-bar-wrap { width: 50px; height: 5px; background: var(--color-raised); border-radius: 3px; overflow: hidden; }
  .fitness-bar { height: 100%; }
  .fit-high { background: var(--color-live); color: var(--color-live); }
  .fit-mid { background: var(--color-warn); color: var(--color-warn); }
  .fit-low { background: var(--color-bad); color: var(--color-bad); }
  .fitness-pct { font-family: var(--font-mono); font-size: 10px; min-width: 32px; text-align: right; }
  .bench-rat { font-family: var(--font-mono); font-size: 11px; color: var(--color-tx-2); }
  .bench-row.bench-injured { opacity: 0.6; }
  .sub-on-btn { font-size: 10px; padding: 4px 8px; border-radius: 6px; border: 1px solid var(--color-club); background: transparent; color: var(--color-club); cursor: pointer; }

  .live-controls { display: flex; align-items: center; justify-content: center; gap: 5px; padding: 8px max(8px, env(safe-area-inset-left)) calc(8px + env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-right)); border-top: 1px solid var(--color-line); background: var(--color-ground); flex-shrink: 0; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }
  .live-controls::-webkit-scrollbar { display: none; }
  .ctrl-btn { min-height: 44px; flex: 0 0 auto; white-space: nowrap; font-size: 10px; padding: 8px 9px; border-radius: 8px; border: 1px solid var(--color-line); background: var(--color-raised); color: var(--color-tx); cursor: pointer; }
  .tactics-control span { display: inline-grid; place-items: center; min-width: 16px; height: 16px; margin-left: 2px; border-radius: 50%; background: var(--color-club); color: var(--color-on-club, #fff); font: 700 9px var(--font-mono); }
  .speed-wrap { display: flex; flex: 0 0 auto; align-items: center; gap: 3px; }
  .speed-lbl { font-size: 9px; font-family: var(--font-mono); color: var(--color-tx-3); margin-right: 2px; }
  .speed-btn { min-height: 44px; font-size: 10px; min-width: 38px; padding: 7px 6px; border-radius: 6px; border: 1px solid var(--color-line); background: transparent; color: var(--color-tx-2); cursor: pointer; }
  .speed-btn.active { background: var(--color-club); color: var(--color-on-club, #fff); border-color: var(--color-club); }

  @media (max-width: 768px) {
    .broadcast-pitch { flex: 1 1 auto; min-height: 220px; max-height: 57dvh; }
    .live-controls { padding-bottom: calc(22px + env(safe-area-inset-bottom)); }
  }

  .ctrl-btn:focus-visible, .speed-btn:focus-visible { outline: 2px solid var(--color-live); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { .broadcast-player.moving .player-legs, .goal-takeover { animation: none; } .progress-bar, .momentum i { transition: none; } }
  @media (min-width: 769px) { .live-wrap { width: min(100%, 900px); align-self: center; } .broadcast-pitch { width: min(100%, 640px); align-self: center; } }
  .ft-wrap { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 16px; text-align: center; }
  .ft-verdict { font-family: var(--font-display); font-size: 16px; letter-spacing: 2px; }
  .ft-win { color: var(--color-live); }
  .ft-loss { color: var(--color-bad); }
  .ft-draw { color: var(--color-warn); }
  .ft-header { display: flex; align-items: center; gap: 20px; }
  .ft-side { width: 130px; }
  .ft-crest { min-height: 40px; display: flex; align-items: center; justify-content: center; }
  .ft-tname { font-size: 13px; font-weight: 600; margin-top: 4px; }
  .ft-scorers { font-size: 11px; color: var(--color-tx-2); margin-top: 6px; }
  .ft-score { font-family: var(--font-display); font-size: 44px; }
  .ft-sep { margin: 0 10px; opacity: 0.4; }
  .ft-status { font-size: 10px; font-family: var(--font-mono); letter-spacing: 2px; color: var(--color-tx-3); }

  .after-wrap { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 16px; }
  .after-stats-lbl { display: flex; justify-content: space-between; font-size: 10px; color: var(--color-tx-3); font-family: var(--font-mono); }
  .after-stats { display: flex; flex-direction: column; gap: 8px; }
  .after-stat-row { display: flex; align-items: center; gap: 10px; }
  .after-stat-val { font-family: var(--font-mono); font-size: 12px; min-width: 30px; text-align: center; }
  .after-stat-mid { flex: 1; }
  .after-stat-lbl { font-size: 10px; color: var(--color-tx-3); text-align: center; margin-bottom: 2px; }
  .after-stat-bar-wrap { display: flex; height: 4px; border-radius: 2px; overflow: hidden; background: var(--color-raised); }
  .after-stat-bar-h { background: var(--color-club); }
  .after-stat-bar-a { background: var(--color-tx-3); }

  .after-section-title { justify-content: flex-start; font-size: 11px; font-family: var(--font-mono); letter-spacing: 0.5px; color: var(--color-tx-2); margin-bottom: 6px; }
  .after-section-bad .after-section-title { color: var(--color-bad); }
  .after-line { font-size: 12px; color: var(--color-tx-2); padding: 2px 0; }
  .after-line strong { color: var(--color-tx); }

  .after-table { display: flex; flex-direction: column; gap: 2px; }
  .after-table-row { display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 6px 8px; border-radius: 6px; }
  .after-table-row.after-table-user { background: color-mix(in oklch, var(--color-club) 12%, transparent); font-weight: 600; }
  .after-table-pos { font-family: var(--font-mono); width: 18px; color: var(--color-tx-3); }
  .after-table-crest { width: 20px; display: grid; place-items: center; }
  .after-table-name { flex: 1; }
  .after-table-pts { font-family: var(--font-mono); color: var(--color-tx-2); }

  .btn-full { min-height: 44px; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font-body); flex: 1; }
  .btn-full:disabled { opacity: 0.6; cursor: not-allowed; }
  .btn-primary { border: none; background: var(--color-club); color: var(--color-on-club, #fff); }
  .btn-secondary { border: 1px solid var(--color-line); background: var(--color-raised); color: var(--color-tx-2); }

  .match-tactics {
    position: fixed; inset: 0; z-index: 1000; height: 100dvh; min-height: 0;
    display: flex; flex-direction: column; overflow: hidden;
    background: var(--color-ground); color: var(--color-tx); font-family: var(--font-body);
  }
  .match-tactics-header {
    flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between;
    padding: max(14px, env(safe-area-inset-top)) 16px 10px; border-bottom: 1px solid var(--color-line);
    background: var(--color-surface);
  }
  .match-tactics-header span { display: block; margin-bottom: 4px; color: var(--color-live); font: 700 9px var(--font-mono); letter-spacing: 1.6px; }
  .match-tactics-header strong { display: block; font: 700 21px var(--font-display); letter-spacing: .4px; }
  .match-tactics-close { min-width: 88px; height: 42px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--color-line); background: var(--color-raised); color: var(--color-tx); font: 700 11px var(--font-body); cursor: pointer; }
  .match-tactics-formations {
    flex: 0 0 auto; display: flex; gap: 6px; overflow-x: auto; padding: 9px 12px;
    border-bottom: 1px solid var(--color-line); scrollbar-width: none;
  }
  .match-tactics-formations::-webkit-scrollbar, .match-tactics-bench-row::-webkit-scrollbar { display: none; }
  .match-tactics-formations button {
    flex: 0 0 auto; min-height: 36px; padding: 0 11px; border: 1px solid var(--color-line);
    border-radius: 8px; background: var(--color-raised); color: var(--color-tx-2); font: 600 11px var(--font-mono); cursor: pointer;
  }
  .match-tactics-formations button.active { background: var(--color-club); border-color: var(--color-club); color: var(--color-on-club, #fff); }
  .match-tactics-mentalities { flex: 0 0 auto; display: flex; gap: 6px; overflow-x: auto; padding: 9px 12px; border-bottom: 1px solid var(--color-line); scrollbar-width: none; }
  .match-tactics-mentalities::-webkit-scrollbar { display: none; }
  .match-tactics-mentalities button { flex: 0 0 auto; min-height: 36px; padding: 0 11px; border: 1px solid var(--color-line); border-radius: 999px; background: var(--color-raised); color: var(--color-tx-2); font: 600 10px var(--font-body); cursor: pointer; }
  .match-tactics-mentalities button.active { background: var(--color-club); border-color: var(--color-club); color: var(--color-on-club, #fff); }
  .match-tactics-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 10px 12px 14px; display:grid; gap:14px; }
  .match-tactics-pitch-wrap { width: min(100%, 360px); margin: 0 auto; }
  .match-tactics-pitch {
    position: relative; width: 100%; aspect-ratio: 68 / 91; overflow: hidden;
    border: 2px solid rgba(255,255,255,.18); border-radius: 8px;
    background: linear-gradient(180deg, #123d32, #0d3128);
    box-shadow: inset 0 0 42px rgba(0,0,0,.3);
  }
  .match-tactics-pitch::before { content: ''; position: absolute; inset: 0; background: repeating-linear-gradient(0deg, rgba(255,255,255,.025) 0 10%, transparent 10% 20%); }
  .mtp-half { position: absolute; z-index: 1; left: 0; right: 0; top: 50%; border-top: 1px solid rgba(255,255,255,.24); }
  .mtp-circle { position: absolute; z-index: 1; left: 50%; top: 50%; width: 22%; aspect-ratio: 1; border: 1px solid rgba(255,255,255,.24); border-radius: 50%; transform: translate(-50%,-50%); }
  .mtp-box { position: absolute; z-index: 1; left: 22%; width: 56%; height: 15%; border: 1px solid rgba(255,255,255,.24); }
  .mtp-box.top { top: 0; border-top: 0; } .mtp-box.bottom { bottom: 0; border-bottom: 0; }
  .match-tactics-slot {
    position: absolute; z-index: 2; width: 48px; min-height: 58px; padding: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    transform: translate(-50%,-50%); border: 2px solid; border-radius: 50%;
    background: var(--color-surface); color: var(--color-tx); cursor: pointer;
  }
  .match-tactics-slot.pos-GK { border-color: #7c83e8; }
  .match-tactics-slot.pos-DEF { border-color: var(--color-live); }
  .match-tactics-slot.pos-MID { border-color: var(--color-warn); }
  .match-tactics-slot.pos-ATT { border-color: var(--color-bad); }
  .match-tactics-slot.selected { box-shadow: 0 0 0 4px color-mix(in oklch, var(--color-club) 45%, transparent); border-color: var(--color-club); }
  .match-tactics-slot.unavailable { opacity: .35; }
  .mts-rating { font: 700 14px/1 var(--font-display); }
  .mts-pos { color: var(--color-tx-3); font: 700 8px/1.3 var(--font-mono); }
  .match-tactics-slot small {
    position: absolute; top: calc(100% + 3px); max-width: 68px; overflow: hidden; text-overflow: ellipsis;
    padding: 2px 4px; border-radius: 3px; white-space: nowrap; background: rgba(4,12,8,.82); color: white; font: 9px var(--font-body);
  }
  .match-tactics-bench { width: min(100%, 520px); margin: 14px auto 0; }
  .mtb-heading { display: flex; align-items: end; justify-content: space-between; margin-bottom: 8px; }
  .mtb-heading span { display: block; font: 700 15px var(--font-display); }
  .mtb-heading small { display: block; margin-top: 2px; color: var(--color-tx-3); font-size: 9px; }
  .mtb-heading strong { color: var(--color-warn); font: 700 10px var(--font-mono); }
  .match-tactics-bench-row { display: flex; gap: 7px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
  .match-tactics-bench-row button {
    flex: 0 0 82px; min-height: 104px; display: flex; flex-direction: column; align-items: center; gap: 3px;
    padding: 8px 5px; border: 1px solid var(--color-line); border-radius: 10px;
    background: var(--color-surface); color: var(--color-tx); cursor: pointer;
  }
  .match-tactics-bench-row button.selected { border-color: var(--color-club); background: color-mix(in oklch, var(--color-club) 12%, var(--color-surface)); box-shadow: inset 0 0 0 1px var(--color-club); }
  .mtb-avatar { width: 34px; height: 34px; display: grid; place-items: center; border: 2px solid; border-radius: 50%; font: 700 10px var(--font-mono); }
  .mtb-avatar.pos-GK { border-color: #7c83e8; }.mtb-avatar.pos-DEF { border-color: var(--color-live); }.mtb-avatar.pos-MID { border-color: var(--color-warn); }.mtb-avatar.pos-ATT { border-color: var(--color-bad); }
  .mtb-pos { color: var(--color-tx-3); font: 700 8px var(--font-mono); }
  .mtb-name { width: 100%; overflow: hidden; text-overflow: ellipsis; font-size: 10px; white-space: nowrap; }
  .mtb-meta { color: var(--color-tx-3); font: 9px var(--font-mono); }

  @media (min-width: 900px) {
    .match-tactics { left: 50%; right: auto; width: min(720px, 100vw); transform: translateX(-50%); border-left: 1px solid var(--color-line); border-right: 1px solid var(--color-line); }
  }
</style>