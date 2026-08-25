<script>
  import { flip } from 'svelte/animate';
  import {
    getAllFixtures, getAllTeams, getFixturesByGW, getPlayersByTeam, getSave, openDB,
  } from '../../modules/db.js';
  import { CUP_META } from '../../modules/cups.js';
  import { injuryDurationLabel } from '../../modules/injuries.js';
  import {
    advanceOneFixture, advanceOneFixtureWithResult, getNextMatchEvent,
  } from '../../modules/gameweek.js';
  import {
    buildLiveMatchState, finaliseLiveMatch, pickAIFormation,
    positionGroup, primaryRating, selectEleven, simulateMatchSegment,
  } from '../../modules/matchEngine.js';
  import { getTableSliceAroundTeam } from '../../modules/standings.js';
  import { SLOT_LAYOUT, SLOT_POS_MAP } from '../../game/formationLayout.js';
  import { applySubstitution, eligibleSubOutTargets } from '../../game/substitutions.js';
  import { applyFormationChange } from '../../game/formationChange.js';
  import { generateStubPlayers } from '../../game/opponents.js';
  import { fmt, formLabel, navigateTo, playerNationality, posGroup, toast } from '../../ui/helpers.js';
  import { renderHome } from '../../ui/home_transfers.js';
  import { newsAIBid, newsInjury, newsMatchResult } from '../../ui/inbox.js';
  import { screenTicks } from '../state/screens.svelte.js';

  /**
   * MatchScreen.svelte — the live-match route (Phase 5,
   * docs/plan/04-migration-phases.md). Replaces ui/prematch.js's pre-match
   * modal and ui/watchmatch.js's innerHTML live viewer with a real five-beat
   * route: team news -> kickoff -> live -> full time -> after. Reached only
   * via Play (TabBar's FAB or Home's #btn-adv-header) through the same
   * registerScreen()/navigateTo() mechanism every other screen uses — not a
   * TabBar destination of its own.
   *
   * Unlike the other screens' screenTicks effect, `active` (not
   * screenTicks.match) gates whether a fresh navigateTo('match') reloads —
   * a match that's mid-flight must survive the user tapping away to another
   * screen and back (the old modal blocked that; a route doesn't need to,
   * per docs/plan/02-design-system.md's "live match is a route, so the
   * [showModal-blocks-navigation] constraint goes away"). The component
   * keeps ticking in the background regardless of which screen is visible.
   */

  const WATCH_PHASES_PER_TICK = 1;   // 1 phase per tick = ~0.75 match-min
  const WATCH_TICK_MS         = 750; // ms at 1x -> full game in ~90s real time
  const TOTAL_PHASES          = 120;

  let active  = $state(false); // a match is loaded or in progress — blocks re-entry
  let loading = $state(true);
  let beat    = $state('teamNews'); // 'teamNews' | 'kickoff' | 'live' | 'fulltime' | 'after'

  // $state.raw, not $state, for matchCtx/live/result: all three are always
  // reassigned wholesale (never deep-mutated in place — see the `live =
  // {...live, x}` pattern throughout), and live/result eventually flow into
  // advanceOneFixtureWithResult -> putFixture (IndexedDB). Deep-proxying
  // them under plain $state broke that: structured clone can't serialize a
  // Svelte 5 reactive Proxy, so putFixture threw DataCloneError on
  // liveState's nested arrays (allEvents, fitnessUpdates, etc.) the moment a
  // watched (not quick-simmed) match tried to commit its result.
  let matchCtx = $state.raw(null);
  let beforeTable = [];   // plain (non-reactive) — only ever read once, at commit
  let afterTable  = [];
  let tableSlice  = $state([]); // drives the animate:flip table in the After beat

  let live = $state.raw(null); // { liveState, allEvents, homeTeam, awayTeam, userTeam, oppTeam, userPlayers, oppPlayers, userIsHome, matchEvent, currentPhase, paused, speedMultiplier }
  let tickTimer = null;
  let kickoffTimer = null;

  let result          = $state.raw(null); // finalised match result (same shape whether from finaliseLiveMatch or advanceOneFixture's singleResult)
  let resultCommitted = $state(false);
  let committing       = $state(false);

  let subSheetOpen      = $state(false);
  let subSheetInPlayer  = $state(null);
  let subSheetWasPaused = false;
  let tacticsSheetOpen       = $state(false);
  let tacticsPickerFormation = $state('4-3-3');
  let tacticsSheetWasPaused  = false;

  function vibrate(pattern) {
    try { window.navigator?.vibrate?.(pattern); } catch { /* not supported */ }
  }

  // ── Team News data (ported from ui/prematch.js's showPreMatchModal) ────
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
    const userTeam  = teamsById.get(save.userTeamId) ?? { name: 'Your Team', crest: '⚽' };

    let oppTeam, oppForm = [], oppInForm = null;
    let matchTitle, compLabel, userIsHome;
    let compColor = 'var(--color-live)', isLeague = false;

    if (event.type === 'league') {
      const fix = (await getFixturesByGW(event.gw)).find(f => f.id === event.fixtureId);
      if (!fix) return null;
      userIsHome = fix.homeTeamId === save.userTeamId;
      const oppId = userIsHome ? fix.awayTeamId : fix.homeTeamId;
      oppTeam = teamsById.get(oppId) ?? { id: oppId, name: oppId, crest: '⚽', reputation: 70 };
      [oppForm, oppInForm] = await Promise.all([getTeamRecentForm(oppId, 5), getInFormPlayer(oppId)]);
      matchTitle = `${userIsHome ? 'Home' : 'Away'} · GW${event.gw}`;
      compLabel  = save.userLeague ?? 'League';
      isLeague   = true;
    } else if (event.type === 'ucl_md') {
      oppTeam    = { name: event.oppName, crest: event.oppNation ?? '🌍', reputation: event.oppStrength ?? 72 };
      userIsHome = event.userIsHome ?? true;
      matchTitle = `Champions League · Matchday ${event.matchday}`;
      compLabel  = 'Champions League';
      compColor  = '#3b82f6';
    } else if (event.type === 'cup') {
      const meta      = CUP_META[event.cupId] ?? {};
      const cupState  = save.cups?.[event.cupId];
      const lastResult = cupState?.results?.slice(-1)[0];
      const oppName  = event.opponentName ?? lastResult?.opponentName ?? 'TBD';
      const oppCrest = event.opponentCrest ?? lastResult?.opponentCrest ?? '⚽';
      oppTeam    = { name: oppName, crest: oppCrest, reputation: event.opponentRep ?? 70 };
      userIsHome = event.userIsHome ?? true;
      matchTitle = `${meta.name ?? event.cupId} · ${event.roundName ?? ''}`;
      compLabel  = meta.name ?? event.cupId;
      compColor  = meta.color ?? 'var(--color-club)';
    } else {
      return null;
    }

    const userPlayers  = await getPlayersByTeam(save.userTeamId);
    const userFormation = save.formation ?? '4-3-3';
    const userLineup    = save.lineup ?? null;

    const injuredInLineup = userLineup
      ? userPlayers.filter(p => p.injured && userLineup.includes(p.id))
      : [];
    const lineupIncomplete = !userLineup || userLineup.length !== 11
      || userLineup.some(pid => !userPlayers.find(p => p.id === pid));

    return {
      event, save, userTeam, oppTeam, oppForm, oppInForm,
      matchTitle, compLabel, compColor, isLeague, userIsHome,
      userPlayers, userFormation, userLineup,
      injuredInLineup, lineupIncomplete,
      lineupBlocked: injuredInLineup.length > 0 || lineupIncomplete,
    };
  }

  const blockMsg = $derived(
    matchCtx?.injuredInLineup?.length > 0
      ? '🚑 Fix your lineup — injured players selected. Go to Tactics.'
      : '⚠️ Set a full starting XI in Tactics before playing.'
  );

  function diffLabel(rep) {
    if (rep >= 90) return { text: 'Very Strong', cls: 'diff-hard' };
    if (rep >= 82) return { text: 'Strong', cls: 'diff-hard' };
    if (rep >= 74) return { text: 'Even', cls: 'diff-mid' };
    if (rep >= 66) return { text: 'Favourable', cls: 'diff-easy' };
    return { text: 'Underdog', cls: 'diff-easy' };
  }

  // ── Team News: read-only XI-on-pitch preview (shares slot layout with
  // TacticsScreen.svelte via src/game/formationLayout.js) ────────────────
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

  // ── Load / entry point ──────────────────────────────────────────────
  async function loadMatch() {
    active = true;
    loading = true;
    await openDB();
    const save = await getSave();
    // No save yet — this $effect runs on MatchScreen's initial mount too,
    // same as every other screen's, well before a career exists (or Play is
    // ever pressed). Bail quietly like HomeScreen.svelte's load() does;
    // screenTicks.match bumping for real (via TabBar/Home's Play button)
    // re-triggers this once a save is there.
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
      // Fixture vanished from under us (shouldn't happen) — same fallback
      // ui/prematch.js used: advance silently rather than get stuck.
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
  }

  $effect(() => {
    void screenTicks.match;
    if (!active) loadMatch();
  });

  // ── Resolve real home/away teams + players for kickoff ──────────────
  // Ported from ui/prematch.js's _launchWatchMatch — same logic, minus the
  // modal launch. Stub opponents (European draws with no real squad in the
  // DB) come from src/game/opponents.js.
  async function resolveMatchTeams(ctx) {
    const allTeams2  = await getAllTeams();
    const teamsById2 = new Map(allTeams2.map(t => [t.id, t]));
    let homeTeam, awayTeam, homePlayers, awayPlayers, patchedEvent;

    if (ctx.event.type === 'league') {
      const fix2 = (await getFixturesByGW(ctx.event.gw)).find(f => f.id === ctx.event.fixtureId);
      if (!fix2) return null;
      const userIsHome2 = fix2.homeTeamId === ctx.save.userTeamId;
      const oppId2  = userIsHome2 ? fix2.awayTeamId : fix2.homeTeamId;
      const realOpp = teamsById2.get(oppId2) ?? ctx.oppTeam;
      homeTeam = userIsHome2 ? ctx.userTeam : realOpp;
      awayTeam = userIsHome2 ? realOpp : ctx.userTeam;
      homePlayers = await getPlayersByTeam(homeTeam.id);
      awayPlayers = await getPlayersByTeam(awayTeam.id);
      patchedEvent = { ...ctx.event, userIsHome: userIsHome2 };
      return { homeTeam, awayTeam, homePlayers, awayPlayers, userIsHome: userIsHome2, patchedEvent };
    }

    const userIsHomeC = ctx.event.userIsHome ?? true;
    const realOpp = teamsById2.get(ctx.event.opponentId) ?? ctx.oppTeam;
    homeTeam = userIsHomeC ? ctx.userTeam : realOpp;
    awayTeam = userIsHomeC ? realOpp : ctx.userTeam;
    homePlayers = await getPlayersByTeam(homeTeam.id);
    awayPlayers = (ctx.event.opponentId && teamsById2.has(ctx.event.opponentId))
      ? await getPlayersByTeam(ctx.event.opponentId).catch(() => [])
      : [];
    if (!awayPlayers.length) {
      const strength = ctx.event.opponentRep ?? ctx.event.oppStrength ?? 72;
      awayPlayers = generateStubPlayers(realOpp, strength);
    }
    if (!userIsHomeC) [homePlayers, awayPlayers] = [awayPlayers, homePlayers];
    patchedEvent = { ...ctx.event, userIsHome: userIsHomeC };
    return { homeTeam, awayTeam, homePlayers, awayPlayers, userIsHome: userIsHomeC, patchedEvent };
  }

  // ── Team News actions ────────────────────────────────────────────────
  async function startWatch() {
    if (matchCtx.lineupBlocked) { toast(blockMsg, 'error', 5000); return; }
    loading = true;
    const resolved = await resolveMatchTeams(matchCtx);
    loading = false;
    if (!resolved) { await simInstant(); return; }

    const formation   = matchCtx.userFormation;
    const aiFormation = pickAIFormation();
    const userLineup  = matchCtx.save.lineup ?? null;
    const homeLineup  = resolved.userIsHome ? userLineup : null;
    const awayLineup  = resolved.userIsHome ? null : userLineup;
    const userMentality = matchCtx.save.mentality ?? 'balanced';
    const homeMentality = resolved.userIsHome ? userMentality : 'balanced';
    const awayMentality = resolved.userIsHome ? 'balanced' : userMentality;

    const liveState = buildLiveMatchState(
      resolved.homeTeam, resolved.awayTeam, resolved.homePlayers, resolved.awayPlayers,
      formation, aiFormation, homeLineup, awayLineup, homeMentality, awayMentality
    );

    live = {
      liveState, allEvents: [],
      homeTeam: resolved.homeTeam, awayTeam: resolved.awayTeam,
      userTeam: matchCtx.userTeam, oppTeam: matchCtx.oppTeam,
      userPlayers: resolved.userIsHome ? resolved.homePlayers : resolved.awayPlayers,
      oppPlayers:  resolved.userIsHome ? resolved.awayPlayers : resolved.homePlayers,
      userIsHome: resolved.userIsHome,
      matchEvent: resolved.patchedEvent,
      currentPhase: 0, paused: false, speedMultiplier: 1,
    };
    beat = 'kickoff';
    kickoffTimer = window.setTimeout(() => {
      if (beat === 'kickoff') { beat = 'live'; scheduleTick(); }
    }, 900);
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
    } catch (err) {
      loading = false;
      toast(`Error: ${err.message}`, 'error');
      console.error(err);
    }
  }

  // ── Live tick engine (ported from ui/watchmatch.js) ──────────────────
  function scheduleTick() {
    const delay = Math.round(WATCH_TICK_MS / (live.speedMultiplier || 1));
    tickTimer = window.setTimeout(runTick, delay);
  }

  function runTick() {
    if (!live || live.paused) return;
    const startPhase = live.currentPhase + 1;
    const endPhase   = Math.min(live.currentPhase + WATCH_PHASES_PER_TICK, TOTAL_PHASES);
    const { segEvents, updatedState } = simulateMatchSegment(live.homeTeam, live.awayTeam, live.liveState, startPhase, endPhase);
    live = { ...live, liveState: updatedState, currentPhase: endPhase, allEvents: [...live.allEvents, ...segEvents] };
    handleNewEvents(segEvents);
    if (live.currentPhase >= TOTAL_PHASES) finishMatch();
    else scheduleTick();
  }

  function handleNewEvents(segEvents) {
    for (const ev of segEvents) {
      const isUser = ev.teamId === live.userTeam.id;
      if (ev.type === 'goal') {
        vibrate([60]);
        if (isUser) toast(`⚽ GOAL! ${ev.playerName}`, 'success');
      } else if (ev.type === 'injury' && isUser && live && !live.paused) {
        togglePause();
        toast(`🚑 ${ev.playerName} is injured! ${ev.injuryName || ''}`, 'error', 6000);
      }
    }
  }

  function togglePause() {
    if (!live) return;
    live = { ...live, paused: !live.paused };
    if (!live.paused && live.currentPhase < TOTAL_PHASES) scheduleTick();
    else window.clearTimeout(tickTimer);
  }

  function setSpeed(mult) {
    if (!live) return;
    live = { ...live, speedMultiplier: mult };
    if (!live.paused && live.currentPhase < TOTAL_PHASES) {
      window.clearTimeout(tickTimer);
      scheduleTick();
    }
  }

  function skipMatch() {
    if (!live || live.currentPhase >= TOTAL_PHASES) return;
    window.clearTimeout(tickTimer);
    const startPhase = live.currentPhase + 1;
    const { segEvents, updatedState } = simulateMatchSegment(live.homeTeam, live.awayTeam, live.liveState, startPhase, TOTAL_PHASES);
    live = { ...live, liveState: updatedState, currentPhase: TOTAL_PHASES, allEvents: [...live.allEvents, ...segEvents] };
    handleNewEvents(segEvents);
    finishMatch();
  }

  function finishMatch() {
    window.clearTimeout(tickTimer);
    result = finaliseLiveMatch(live.homeTeam, live.awayTeam, live.liveState, live.allEvents);
    resultCommitted = false;
    vibrate([80, 40, 80]);
    beat = 'fulltime';
  }

  // ── Substitutions (src/game/substitutions.js) ────────────────────────
  const subsLeft = $derived.by(() => {
    if (!live?.liveState) return 0;
    return live.userIsHome ? live.liveState.hSubsLeft : live.liveState.aSubsLeft;
  });
  const benchList = $derived.by(() => {
    if (!live?.liveState) return [];
    const bench = live.userIsHome ? live.liveState.hBenchLeft : live.liveState.aBenchLeft;
    return [...bench].sort((a, b) => (b.fitness ?? 90) - (a.fitness ?? 90));
  });
  const activeList = $derived.by(() => {
    if (!live?.liveState) return [];
    return live.userIsHome ? live.liveState.hActive : live.liveState.aActive;
  });
  const fitnessMap = $derived(live?.liveState ? (live.userIsHome ? live.liveState.hFitness : live.liveState.aFitness) : null);

  function openSubSheet(subInPlayer) {
    if (subsLeft <= 0) { toast('No substitutions remaining', 'error'); return; }
    if (subInPlayer.injured) { toast(`🚑 ${subInPlayer.name} is injured and cannot play.`, 'error', 4000); return; }
    subSheetWasPaused = live.paused;
    if (!live.paused) togglePause();
    subSheetInPlayer = subInPlayer;
    subSheetOpen = true;
  }
  const subOutOptions = $derived(subSheetInPlayer && live?.liveState ? eligibleSubOutTargets(live.liveState, live.userIsHome, subSheetInPlayer) : []);

  function pickSubOut(subOutPlayer) {
    const minute = Math.ceil((live.currentPhase / TOTAL_PHASES) * 90);
    const { ok, liveState: newLs, event } = applySubstitution(live.liveState, live.userIsHome, subSheetInPlayer.id, subOutPlayer.id, minute, live.userTeam.id);
    if (ok) {
      live = { ...live, liveState: newLs, allEvents: [...live.allEvents, event] };
      toast(`${event.inName} replaces ${event.outName}`, 'success', 3000);
    }
    closeSubSheet();
  }
  function closeSubSheet() {
    subSheetOpen = false;
    subSheetInPlayer = null;
    if (!subSheetWasPaused) togglePause();
  }

  // ── Formation change (src/game/formationChange.js) ───────────────────
  function openTacticsSheet() {
    tacticsSheetWasPaused = live.paused;
    if (!live.paused) togglePause();
    tacticsPickerFormation = live.userIsHome ? live.liveState.homeFormation : live.liveState.awayFormation;
    tacticsSheetOpen = true;
  }
  const tacticsXIPreview = $derived.by(() => {
    if (!tacticsSheetOpen || !live) return [];
    return selectEleven(live.userPlayers.map(p => ({ ...p, fitness: p.fitness ?? 90, inSquad: p.inSquad !== false })), tacticsPickerFormation);
  });
  function applyTactics() {
    const newLs = applyFormationChange(live.liveState, live.userIsHome, tacticsPickerFormation);
    live = { ...live, liveState: newLs };
    toast(`Formation changed to ${tacticsPickerFormation}`, 'info', 3000);
    closeTacticsSheet();
  }
  function closeTacticsSheet() {
    tacticsSheetOpen = false;
    if (!tacticsSheetWasPaused) togglePause();
  }

  // ── Commit + After beat ───────────────────────────────────────────────
  function applyCommitExtras(res) {
    for (const cr of res.cupResults ?? []) {
      if (cr.isUCLMatchday) {
        toast(`⭐ UCL MD${cr.matchday}: ${cr.result} vs ${cr.opponentName} (${cr.userGoals}-${cr.oppGoals}) +${cr.points}pts`,
          cr.result === 'W' ? 'success' : cr.result === 'D' ? 'info' : 'error', 6000);
      } else if (!cr.eliminated && cr.opponentName) {
        const meta = CUP_META[cr.cupId];
        const lossLabel = (cr.roundName || '').includes('1st leg') ? '❌ Lost' : '❌ Out';
        toast(`${meta?.icon || '🏆'} ${meta?.name} ${cr.roundName}: ${cr.userWon ? '✅ Won' : lossLabel} vs ${cr.opponentName} (${cr.userGoals}-${cr.oppGoals})`,
          cr.userWon ? 'success' : 'error', 6000);
      }
    }
    if (res.newOffers?.length) {
      for (const o of res.newOffers) {
        toast(`📨 ${o.clubName} bid ${fmt.money(o.fee)} for ${o.playerName}`, 'info', 5000);
        newsAIBid({ name: o.playerName, id: o.playerId }, o.fee, o.clubName, matchCtx.save).catch(() => {});
      }
    }
    const userInjEvts = (result?.events ?? []).filter(e => e.type === 'injury' && e.teamId === matchCtx.save.userTeamId);
    for (const inj of userInjEvts) {
      const wks = inj.injuryGWsLeft ?? 1;
      toast(`🚑 ${inj.playerName} — ${inj.injuryName} (${injuryDurationLabel(wks)})`, 'error', 8000);
      newsInjury({ name: inj.playerName, id: inj.playerId }, inj.injuryName, wks, matchCtx.save).catch(() => {});
    }
    for (const p of res.recoveredPlayers ?? []) {
      toast(`✅ ${p.name} is fit and available again!`, 'success', 6000);
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
    active = false;
    live = null; result = null; matchCtx = null;
    resultCommitted = false; beat = 'teamNews'; tableSlice = [];
    beforeTable = []; afterTable = [];
    await navigateTo('home');
  }

  // ── Display helpers ───────────────────────────────────────────────────
  function userVerdict(r) {
    if (!r || !matchCtx) return '';
    const isHome = r.homeTeamId === matchCtx.save.userTeamId;
    const ug = isHome ? r.homeGoals : r.awayGoals;
    const og = isHome ? r.awayGoals : r.homeGoals;
    return ug > og ? 'WIN' : ug < og ? 'LOSS' : 'DRAW';
  }
  function fitClass(fit) {
    return fit >= 70 ? 'fit-high' : fit >= 50 ? 'fit-mid' : 'fit-low';
  }

  const MENTALITY_ICONS = { defensive: '🛡️', balanced: '⚖️', possession: '🎯', attacking: '⚡' };
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
          <div class="tn-crest">{m.userIsHome ? m.userTeam.crest : m.oppTeam.crest}</div>
          <div class="tn-tname">{m.userIsHome ? m.userTeam.name : m.oppTeam.name}</div>
          <div class="tn-venue" style="color:{m.userIsHome ? 'var(--color-club)' : 'var(--color-tx-2)'}">HOME</div>
        </div>
        <div class="tn-vs-block">
          <div class="tn-vs">VS</div>
          <div class="tn-title">{m.matchTitle}</div>
          <div class="tn-diff {diffLabel(m.oppTeam.reputation ?? 70).cls}">{diffLabel(m.oppTeam.reputation ?? 70).text}</div>
        </div>
        <div class="tn-team" class:tn-home={!m.userIsHome}>
          <div class="tn-crest">{m.userIsHome ? m.oppTeam.crest : m.userTeam.crest}</div>
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
              {#if p}<div class="tn-slot-name" class:tn-slot-inj={p.injured}>{p.name.split(' ').pop()}{#if p.injured} 🚑{/if}</div>{/if}
            </div>
          {/each}
        </div>
      </div>

      <div class="tn-section">
        <div class="tn-section-title">{m.oppTeam.crest} {m.oppTeam.name} — Last 5</div>
        {#if m.oppForm.length}
          <div class="tn-form-row">
            {#each m.oppForm as r, i (i)}<span class="tn-form-pill {r.result}">{r.result}</span>{/each}
          </div>
        {:else}
          <div class="tn-empty-note">{m.event.type === 'league' ? 'No results yet' : 'European opposition'}</div>
        {/if}
      </div>

      {#if m.oppInForm}
        {@const fl = formLabel(m.oppInForm)}
        <div class="tn-section">
          <div class="tn-section-title">⚡ Their Key Player</div>
          <div class="tn-inform-card">
            <div class="tn-inform-flag">{playerNationality(m.oppInForm, m.oppTeam.league)}</div>
            <div>
              <div class="tn-inform-name">{m.oppInForm.name}</div>
              <div class="tn-inform-meta">
                <span class="pos {posGroup(m.oppInForm.position)}">{m.oppInForm.position}</span>
                <span class="fb {fl.cls}">{fl.text}</span>
                {#if m.oppInForm.goals > 0}<span>⚽ {m.oppInForm.goals}</span>{/if}
                {#if m.oppInForm.assists > 0}<span>🎯 {m.oppInForm.assists}</span>{/if}
                {#if m.oppInForm.cleanSheets > 0}<span>🧤 {m.oppInForm.cleanSheets}</span>{/if}
              </div>
            </div>
          </div>
        </div>
      {/if}

      <div class="tn-section">
        <div class="tn-section-title">🗂 Your Formation — {m.userFormation}</div>
        <div class="tn-mentality">
          <span>{mentalityIcon(m.save.mentality ?? 'balanced')}</span>
          <span class="tn-mentality-label">{(m.save.mentality ?? 'balanced')}</span>
        </div>
      </div>

      {#if m.injuredInLineup.length}
        <div class="tn-warning tn-warning-bad">
          <div class="tn-warning-title">🚑 Injured Players in Lineup</div>
          {#each m.injuredInLineup as p (p.id)}
            <div class="tn-warning-line"><strong>{p.name}</strong> — {p.injuryName || 'Injured'} ({injuryDurationLabel(p.injuryGWsLeft)} remaining)</div>
          {/each}
          <div class="tn-warning-cta">Go to Tactics to fix your lineup before playing.</div>
        </div>
      {/if}
      {#if m.lineupIncomplete}
        <div class="tn-warning tn-warning-warn">
          <div class="tn-warning-title">⚠️ Lineup Incomplete</div>
          <div class="tn-warning-cta">You must set a full starting XI in the Tactics screen before playing.</div>
        </div>
      {/if}
    </div>

    <div class="tn-actions">
      <button class="btn-full btn-secondary" disabled={m.lineupBlocked || loading} onclick={simInstant}>⚡ Sim Instantly</button>
      <button class="btn-full btn-primary" disabled={m.lineupBlocked || loading} onclick={startWatch}>👁 Kick Off →</button>
    </div>

  {:else if beat === 'kickoff' && live}
    <div class="kickoff-beat" role="button" tabindex="0" onclick={skipKickoff} onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && skipKickoff()}>
      <div class="ko-crest">{live.homeTeam.crest ?? '⚽'}</div>
      <div class="ko-vs">KICK OFF</div>
      <div class="ko-crest">{live.awayTeam.crest ?? '⚽'}</div>
    </div>

  {:else if beat === 'live' && live}
    {@const minute = Math.ceil((live.currentPhase / TOTAL_PHASES) * 90)}
    <div class="live-wrap">
      <div class="score-bug">
        <div class="sb-team">
          <div class="sb-crest">{live.homeTeam.crest ?? '⚽'}</div>
          <div class="sb-name">{live.homeTeam.name}</div>
        </div>
        <div class="sb-centre">
          <div class="sb-score">
            <span>{live.liveState.hGoals}</span><span class="sb-sep">–</span><span>{live.liveState.aGoals}</span>
          </div>
          <div class="sb-clock">{minute}'</div>
          <div class="sb-status">{live.paused ? 'PAUSED' : minute <= 45 ? 'FIRST HALF' : 'SECOND HALF'}</div>
        </div>
        <div class="sb-team">
          <div class="sb-crest">{live.awayTeam.crest ?? '⚽'}</div>
          <div class="sb-name">{live.awayTeam.name}</div>
        </div>
      </div>
      <div class="progress-wrap"><div class="progress-bar" style="width:{(live.currentPhase / TOTAL_PHASES) * 100}%"></div></div>

      <div class="live-events">
        {#each live.allEvents as ev, i (i)}
          {@const isUser = ev.teamId === live.userTeam.id}
          {#if ev.type === 'goal'}
            <div class="ev-row ev-goal" class:ev-user={isUser}>
              <span class="ev-min">{ev.minute}'</span><span>⚽</span>
              <span><strong>{ev.playerName}</strong>{#if ev.assistName}<span class="ev-assist"> ({ev.assistName})</span>{/if}</span>
            </div>
          {:else if ev.type === 'yellow'}
            <div class="ev-row" class:ev-user={isUser}><span class="ev-min">{ev.minute}'</span><span>🟨</span><span>{ev.playerName}</span></div>
          {:else if ev.type === 'sub'}
            <div class="ev-row" class:ev-user={isUser}><span class="ev-min">{ev.minute}'</span><span>🔄</span><span><span class="ev-in">{ev.inName}</span> ↔ <span class="ev-out">{ev.outName}</span></span></div>
          {:else if ev.type === 'injury'}
            <div class="ev-row ev-injury" class:ev-user={isUser}><span class="ev-min">{ev.minute}'</span><span>🚑</span><span><strong>{ev.playerName}</strong>{#if ev.injuryName} — {ev.injuryName}{/if}</span></div>
          {/if}
        {:else}
          <div class="ev-placeholder">Waiting for kick off…</div>
        {/each}
      </div>

      <div class="live-panel">
        <div class="live-panel-title">YOUR XI <span class="subs-left">{subsLeft} sub{subsLeft !== 1 ? 's' : ''} left</span></div>
        <div class="fitness-list">
          {#each activeList as p (p.id)}
            {@const fit = Math.round(fitnessMap?.get(p.id) ?? 90)}
            <div class="fitness-row">
              <span class="pos {positionGroup(p.position)}">{p.position}</span>
              <span class="fitness-name">{p.name.split(' ').pop()}{#if p.injured}<span class="ev-injury-tag"> 🚑</span>{/if}</span>
              <div class="fitness-bar-wrap"><div class="fitness-bar {p.injured ? 'fit-low' : fitClass(fit)}" style="width:{p.injured ? 10 : fit}%"></div></div>
              <span class="fitness-pct">{p.injured ? '🚑' : `${fit}%`}</span>
            </div>
          {/each}
        </div>
        <div class="live-panel-title">BENCH</div>
        <div class="bench-list">
          {#each benchList as p (p.id)}
            {@const fit = Math.round(p.fitness ?? 90)}
            <div class="bench-row" class:bench-injured={p.injured}>
              <span class="pos {positionGroup(p.position)}">{p.position}</span>
              <span class="bench-name">{p.name}{#if p.injured}<span class="ev-injury-tag"> 🚑</span>{/if}</span>
              <span class="bench-rat">{primaryRating(p)}</span>
              <span class="fitness-pct {p.injured ? 'fit-low' : fitClass(fit)}">{p.injured ? '🚑' : `${fit}%`}</span>
              {#if live.currentPhase < TOTAL_PHASES && subsLeft > 0 && !p.injured}
                <button class="sub-on-btn" onclick={() => openSubSheet(p)}>Sub On</button>
              {/if}
            </div>
          {:else}
            <div class="ev-placeholder">No bench players</div>
          {/each}
        </div>
      </div>
    </div>

    <div class="live-controls">
      <button class="ctrl-btn" onclick={togglePause}>{live.paused ? '▶ Resume' : '⏸ Pause'}</button>
      <div class="speed-wrap">
        <span class="speed-lbl">SPEED</span>
        {#each [1, 2, 4] as s (s)}
          <button class="speed-btn" class:active={live.speedMultiplier === s} onclick={() => setSpeed(s)}>{s}×</button>
        {/each}
      </div>
      <button class="ctrl-btn" onclick={skipMatch}>⏩ Skip</button>
      <button class="ctrl-btn" onclick={openTacticsSheet}>📋 Tactics</button>
    </div>

  {:else if beat === 'fulltime' && result}
    {@const verdict = userVerdict(result)}
    <div class="ft-wrap">
      <div class="ft-verdict ft-{verdict.toLowerCase()}">{verdict}</div>
      <div class="ft-header">
        <div class="ft-side">
          <div class="ft-crest">{result.homeTeamCrest ?? '⚽'}</div>
          <div class="ft-tname">{result.homeTeamName}</div>
          <div class="ft-scorers">
            {#each result.homeScorers ?? [] as e, i (i)}<div>⚽ <strong>{e.playerName}</strong> {e.minute}'</div>{/each}
          </div>
        </div>
        <div class="ft-score">{result.homeGoals}<span class="ft-sep">–</span>{result.awayGoals}</div>
        <div class="ft-side">
          <div class="ft-crest">{result.awayTeamCrest ?? '⚽'}</div>
          <div class="ft-tname">{result.awayTeamName}</div>
          <div class="ft-scorers">
            {#each result.awayScorers ?? [] as e, i (i)}<div>⚽ <strong>{e.playerName}</strong> {e.minute}'</div>{/each}
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

      {#if userSubs.length}
        <div class="after-section">
          <div class="after-section-title">🔄 Your Substitutions</div>
          {#each userSubs as sub, i (i)}<div class="after-line">↑ <strong>{sub.inName}</strong> ↓ {sub.outName} ({sub.minute}')</div>{/each}
        </div>
      {/if}
      {#if userInjuries.length}
        <div class="after-section after-section-bad">
          <div class="after-section-title">🚑 Injuries</div>
          {#each userInjuries as inj, i (i)}<div class="after-line"><strong>{inj.playerName}</strong> — {inj.injuryName} ({injuryDurationLabel(inj.injuryGWsLeft)})</div>{/each}
        </div>
      {/if}

      {#if matchCtx?.isLeague && tableSlice.length}
        <div class="after-section">
          <div class="after-section-title">📊 League Position</div>
          <div class="after-table">
            {#each tableSlice as row (row.teamId)}
              <div class="after-table-row" class:after-table-user={row.isUserTeam} animate:flip={{ duration: 400 }}>
                <span class="after-table-pos">{row.displayPosition}</span>
                <span class="after-table-crest">{row.crest}</span>
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

  {#if subSheetOpen && subSheetInPlayer}
    <button class="sheet-backdrop" onclick={closeSubSheet} aria-label="Close"></button>
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-title">Make Substitution</div>
      <div class="sub-sheet-in">
        Bringing on: <strong>{subSheetInPlayer.name}</strong>
        <span class="pos {positionGroup(subSheetInPlayer.position)}">{subSheetInPlayer.position}</span>
      </div>
      <div class="sub-sheet-lbl">WHO COMES OFF?</div>
      <div class="sub-out-list">
        {#each subOutOptions as p (p.id)}
          {@const fit = Math.round(fitnessMap?.get(p.id) ?? 90)}
          <div class="sub-out-row" role="button" tabindex="0" onclick={() => pickSubOut(p)} onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && pickSubOut(p)}>
            <span class="pos {positionGroup(p.position)}">{p.position}</span>
            <span class="sub-out-name">{p.name}</span>
            <span class="fitness-pct {fitClass(fit)}">{fit}%</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if tacticsSheetOpen && live}
    <button class="sheet-backdrop" onclick={closeTacticsSheet} aria-label="Close"></button>
    <div class="sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-title">Tactical Change</div>
      <div class="tactics-sheet-note">Change takes effect immediately</div>
      <div class="tactics-fm-grid">
        {#each Object.keys(SLOT_LAYOUT) as f (f)}
          <button class="tactics-fm-btn" class:active={f === tacticsPickerFormation} onclick={() => (tacticsPickerFormation = f)}>{f}</button>
        {/each}
      </div>
      <div class="tactics-xi-lbl">Best XI preview:</div>
      <div class="tactics-xi-preview">
        {#each tacticsXIPreview as p (p.id)}<span class="tactics-xi-name">{p.name.split(' ').pop()}</span>{/each}
      </div>
      <div class="sheet-actions">
        <button class="btn-full btn-primary" onclick={applyTactics}>Apply Formation</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .match-screen { height: 100%; display: flex; flex-direction: column; overflow-y: auto; overscroll-behavior: contain; font-family: var(--font-body); color: var(--color-tx); background: var(--color-ground); }
  .match-loading { display: flex; align-items: center; justify-content: center; flex: 1; color: var(--color-tx-2); }

  /* ── Team News ─────────────────────────────────────────────── */
  .tn-wrap { flex: 1; overflow-y: auto; padding: 16px 16px 8px; display: flex; flex-direction: column; gap: 14px; }
  .tn-comp-badge { font-family: var(--font-mono); font-size: 11px; letter-spacing: 1px; text-align: center; }
  .tn-matchup { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .tn-team { flex: 1; text-align: center; }
  .tn-crest { font-size: 34px; }
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
  .tn-pitch-bg { position: relative; width: 100%; height: 100%; background: linear-gradient(180deg, #163b24, #0f2b19); border-radius: 10px; border: 1px solid var(--color-line); overflow: hidden; }
  .tn-pitch-line { position: absolute; top: 50%; left: 0; right: 0; height: 1px; background: rgba(255,255,255,0.15); }
  .tn-pitch-circle { position: absolute; top: 50%; left: 50%; width: 24%; aspect-ratio: 1; border: 1px solid rgba(255,255,255,0.15); border-radius: 50%; transform: translate(-50%, -50%); }
  .tn-slot { position: absolute; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; }
  .tn-slot-name { font-size: 8px; font-family: var(--font-mono); background: var(--color-club); color: var(--color-on-club, #fff); padding: 2px 4px; border-radius: 3px; white-space: nowrap; max-width: 54px; overflow: hidden; text-overflow: ellipsis; }
  .tn-slot-name.tn-slot-inj { background: var(--color-bad); }

  .tn-section-title { font-size: 11px; font-family: var(--font-mono); letter-spacing: 0.5px; color: var(--color-tx-2); margin-bottom: 6px; }
  .tn-form-row { display: flex; gap: 4px; }
  .tn-form-pill { width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; }
  .tn-form-pill.W { background: color-mix(in oklch, var(--color-live) 25%, transparent); color: var(--color-live); }
  .tn-form-pill.D { background: var(--color-raised); color: var(--color-tx-2); }
  .tn-form-pill.L { background: color-mix(in oklch, var(--color-bad) 25%, transparent); color: var(--color-bad); }
  .tn-empty-note { font-size: 11px; color: var(--color-tx-3); }

  .tn-inform-card { display: flex; align-items: center; gap: 10px; }
  .tn-inform-flag { font-size: 22px; }
  .tn-inform-name { font-weight: 600; font-size: 13px; }
  .tn-inform-meta { display: flex; gap: 6px; flex-wrap: wrap; font-size: 11px; color: var(--color-tx-2); margin-top: 2px; }

  .tn-mentality { display: flex; align-items: center; gap: 6px; font-size: 12px; }
  .tn-mentality-label { text-transform: capitalize; font-weight: 600; }

  .tn-warning { border-radius: 8px; padding: 10px 12px; font-size: 11px; }
  .tn-warning-bad { background: color-mix(in oklch, var(--color-bad) 10%, transparent); border: 1px solid color-mix(in oklch, var(--color-bad) 30%, transparent); }
  .tn-warning-warn { background: color-mix(in oklch, var(--color-warn) 10%, transparent); border: 1px solid color-mix(in oklch, var(--color-warn) 30%, transparent); }
  .tn-warning-title { font-weight: 700; margin-bottom: 4px; }
  .tn-warning-bad .tn-warning-title { color: var(--color-bad); }
  .tn-warning-warn .tn-warning-title { color: var(--color-warn); }
  .tn-warning-cta { color: var(--color-tx-2); margin-top: 4px; }

  .tn-actions, .ft-actions, .after-actions { display: flex; gap: 10px; padding: 12px 16px calc(12px + env(safe-area-inset-bottom)); border-top: 1px solid var(--color-line); flex-shrink: 0; }

  /* ── Kickoff ───────────────────────────────────────────────── */
  .kickoff-beat { flex: 1; display: flex; align-items: center; justify-content: center; gap: 24px; cursor: pointer; animation: ko-in 0.6s ease; }
  .ko-crest { font-size: 56px; }
  .ko-vs { font-family: var(--font-display); font-size: 22px; letter-spacing: 2px; color: var(--color-club); }
  @keyframes ko-in { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }
  @media (prefers-reduced-motion: reduce) { .kickoff-beat { animation: none; } }

  /* ── Live ──────────────────────────────────────────────────── */
  .live-wrap { flex: 1; overflow-y: auto; padding: 12px 16px 8px; }
  .score-bug { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .sb-team { flex: 1; text-align: center; }
  .sb-crest { font-size: 26px; }
  .sb-name { font-size: 11px; color: var(--color-tx-2); margin-top: 2px; }
  .sb-centre { text-align: center; }
  .sb-score { font-family: var(--font-display); font-size: 30px; }
  .sb-sep { margin: 0 6px; opacity: 0.4; }
  .sb-clock { font-family: var(--font-mono); font-size: 13px; color: var(--color-live); }
  .sb-status { font-size: 10px; font-family: var(--font-mono); color: var(--color-tx-3); letter-spacing: 1px; }
  .progress-wrap { height: 3px; background: var(--color-raised); border-radius: 2px; margin: 10px 0; overflow: hidden; }
  .progress-bar { height: 100%; background: var(--color-club); transition: width 0.3s linear; }

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

  .live-controls { display: flex; align-items: center; gap: 8px; padding: 10px 16px calc(10px + env(safe-area-inset-bottom)); border-top: 1px solid var(--color-line); flex-shrink: 0; flex-wrap: wrap; }
  .ctrl-btn { font-size: 11px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--color-line); background: var(--color-raised); color: var(--color-tx); cursor: pointer; }
  .speed-wrap { display: flex; align-items: center; gap: 4px; }
  .speed-lbl { font-size: 9px; font-family: var(--font-mono); color: var(--color-tx-3); margin-right: 2px; }
  .speed-btn { font-size: 11px; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--color-line); background: transparent; color: var(--color-tx-2); cursor: pointer; }
  .speed-btn.active { background: var(--color-club); color: var(--color-on-club, #fff); border-color: var(--color-club); }

  /* ── Full time ─────────────────────────────────────────────── */
  .ft-wrap { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 16px; text-align: center; }
  .ft-verdict { font-family: var(--font-display); font-size: 16px; letter-spacing: 2px; }
  .ft-win { color: var(--color-live); }
  .ft-loss { color: var(--color-bad); }
  .ft-draw { color: var(--color-warn); }
  .ft-header { display: flex; align-items: center; gap: 20px; }
  .ft-side { width: 130px; }
  .ft-crest { font-size: 40px; }
  .ft-tname { font-size: 13px; font-weight: 600; margin-top: 4px; }
  .ft-scorers { font-size: 11px; color: var(--color-tx-2); margin-top: 6px; }
  .ft-score { font-family: var(--font-display); font-size: 44px; }
  .ft-sep { margin: 0 10px; opacity: 0.4; }
  .ft-status { font-size: 10px; font-family: var(--font-mono); letter-spacing: 2px; color: var(--color-tx-3); }

  /* ── After ─────────────────────────────────────────────────── */
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

  .after-section-title { font-size: 11px; font-family: var(--font-mono); letter-spacing: 0.5px; color: var(--color-tx-2); margin-bottom: 6px; }
  .after-section-bad .after-section-title { color: var(--color-bad); }
  .after-line { font-size: 12px; color: var(--color-tx-2); padding: 2px 0; }
  .after-line strong { color: var(--color-tx); }

  .after-table { display: flex; flex-direction: column; gap: 2px; }
  .after-table-row { display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 6px 8px; border-radius: 6px; }
  .after-table-row.after-table-user { background: color-mix(in oklch, var(--color-club) 12%, transparent); font-weight: 600; }
  .after-table-pos { font-family: var(--font-mono); width: 18px; color: var(--color-tx-3); }
  .after-table-crest { width: 20px; text-align: center; }
  .after-table-name { flex: 1; }
  .after-table-pts { font-family: var(--font-mono); color: var(--color-tx-2); }

  /* ── Bottom sheets (Sub / Tactics) ─────────────────────────── */
  .sheet-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 900; animation: fade-in 0.2s ease; border: none; padding: 0; cursor: default; }
  .sheet {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 901;
    max-height: 78dvh; overflow-y: auto; overscroll-behavior: contain;
    background: var(--color-surface); border: 1px solid var(--color-line); border-bottom: none;
    border-radius: 18px 18px 0 0; padding: 10px 18px calc(20px + env(safe-area-inset-bottom));
    animation: slide-up 0.22s ease; font-family: var(--font-body); color: var(--color-tx);
  }
  @media (prefers-reduced-motion: reduce) { .sheet-backdrop, .sheet, .kickoff-beat { animation: none; } }
  @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes slide-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
  .sheet-handle { width: 36px; height: 4px; border-radius: 2px; background: var(--color-line); margin: 4px auto 14px; }
  .sheet-title { font-family: var(--font-display); font-size: 19px; letter-spacing: 0.5px; margin-bottom: 10px; }

  .sub-sheet-in { font-size: 13px; color: var(--color-tx-2); margin-bottom: 14px; }
  .sub-sheet-in strong { color: var(--color-club); }
  .sub-sheet-lbl, .tactics-xi-lbl { font-size: 11px; color: var(--color-tx-3); font-family: var(--font-mono); letter-spacing: 1px; margin-bottom: 8px; }
  .sub-out-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; }
  .sub-out-row { display: flex; align-items: center; gap: 10px; padding: 11px 13px; border-radius: 9px; cursor: pointer; background: var(--color-raised); border: 1px solid var(--color-line); }
  .sub-out-name { flex: 1; font-size: 13px; font-weight: 500; }

  .tactics-sheet-note { font-size: 12px; color: var(--color-warn); margin-bottom: 14px; }
  .tactics-fm-grid { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 16px; }
  .tactics-fm-btn { font-size: 11px; padding: 7px 10px; border-radius: 7px; border: 1px solid var(--color-line); background: var(--color-raised); color: var(--color-tx-2); cursor: pointer; }
  .tactics-fm-btn.active { background: var(--color-club); color: var(--color-on-club, #fff); border-color: var(--color-club); }
  .tactics-xi-preview { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 16px; }
  .tactics-xi-name { font-size: 10px; padding: 3px 7px; border-radius: 5px; background: var(--color-raised); color: var(--color-tx-2); }

  .sheet-actions { display: flex; flex-direction: column; gap: 8px; }
  .btn-full { min-height: 44px; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font-body); flex: 1; }
  .btn-full:disabled { opacity: 0.6; cursor: not-allowed; }
  .btn-primary { border: none; background: var(--color-club); color: var(--color-on-club, #fff); }
  .btn-secondary { border: 1px solid var(--color-line); background: var(--color-raised); color: var(--color-tx-2); }

  @media (min-width: 900px) {
    .sheet { left: auto; width: 420px; right: 0; border-radius: 18px 0 0 0; }
  }
</style>
