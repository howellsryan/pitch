<script>
  import { getPlayersByTeam, getSave, getTeam, putPlayer, putSave, openDB } from '../../modules/db.js';
  import { FORMATIONS, MAX_MATCHDAY_BENCH, primaryRating, pruneBenchToSquad, selectBench, selectEleven, selectReserves } from '../../modules/matchEngine.js';
  import {
    SQUAD_ROLE_DEFS,
    baselineLevel,
    currentEffectiveLevel,
    positionSuitabilityFor,
    setPlayerSquadRole,
  } from '../../modules/playerModel.js';
  import { positionFitLabel, traitRecruitmentLabels } from '../../modules/playerPathways.js';
  import { getPotentialEstimate } from '../../modules/potential.js';
  import { rehabilitationSelectionWarning } from '../../modules/playerRehabilitation.js';
  import {
    DEFAULT_TEAM_INSTRUCTIONS,
    TEAM_INSTRUCTION_DEFS,
    createUserTacticalPlan,
    defaultRoleForPosition,
    getCompatibleRoles,
    getRoleDefinition,
    normalizeTeamInstructions,
    roleSuitability,
    summarizeManagerDNA,
  } from '../../modules/tactics.js';
  import { SLOT_LAYOUT } from '../../game/formationLayout.js';
  import { reconcileBenchWithLineup } from '../../game/matchdaySquad.js';
  import { contractYearsRemaining, renewContract, setManagedPlayerTransferListing } from '../../modules/transfers.js';
  import { fmt, posGroup, toast } from '../../ui/helpers.js';
  import { screenTicks } from '../state/screens.svelte.js';
  import DevelopmentPlanPanel from './DevelopmentPlanPanel.svelte';
  import SquadPlanningPanel from './SquadPlanningPanel.svelte';

  const MENTALITIES = [
    { id: 'defensive', label: 'DEF', fullLabel: 'Defensive', desc: 'Compact & hard to break down' },
    { id: 'balanced', label: 'BAL', fullLabel: 'Balanced', desc: 'No bias — steady in both phases' },
    { id: 'possession', label: 'POS', fullLabel: 'Possession', desc: 'Patient build-up, dominate the ball' },
    { id: 'attacking', label: 'ATK', fullLabel: 'Attacking', desc: 'High press & direct, more exposed' },
  ];

  const SQUAD_ROLE_ORDER = ['crucial', 'important', 'rotation', 'squad', 'prospect'];

  let loaded = $state(false);
  let team = $state(null);
  let save = $state(null);
  let players = $state([]);
  let formation = $state('4-3-3');
  let mentality = $state('balanced');
  let instructions = $state({ ...DEFAULT_TEAM_INSTRUCTIONS });
  let savedLineup = $state([]);
  let savedBench = $state(null);
  let formationOpen = $state(false);
  let mentalityOpen = $state(false);
  let instructionsOpen = $state(false);
  let planningOpen = $state(false);
  let swapSlotIdx = $state(null);
  let rosterOpen = $state(false);
  let playerSheet = $state(null);
  let draggedPlayerId = $state(null);
  let benchSlotIdx = $state(null);

  async function load() {
    await openDB();
    const currentSave = await getSave();
    if (!currentSave || currentSave._deleted) return;
    save = currentSave;
    team = await getTeam(save.userTeamId);
    players = await getPlayersByTeam(save.userTeamId);
    if (playerSheet) playerSheet = players.find(p => p.id === playerSheet.id) ?? null;
    formation = save.formation ?? '4-3-3';
    savedLineup = save.lineup ?? [];
    // A sold, loaned-out or retired substitute is never coming back to their
    // seat; drop them here rather than carrying a dead id season after season.
    // The write is built from `currentSave` rather than the `save` rune: a
    // spread of a Svelte state proxy leaves nested objects as proxies, which
    // IndexedDB cannot structured-clone.
    const prunedBench = pruneBenchToSquad(currentSave.bench ?? null, players);
    savedBench = prunedBench;
    if (Array.isArray(currentSave.bench) && prunedBench !== currentSave.bench) {
      await putSave({ ...currentSave, bench:prunedBench });
    }
    mentality = save.mentality ?? 'balanced';
    instructions = normalizeTeamInstructions(save.tactics?.instructions ?? save.tactics ?? {});
    loaded = true;
  }

  $effect(() => {
    void screenTicks.squad;
    load();
  });

  const curMentObj = $derived(MENTALITIES.find(m => m.id === mentality) ?? MENTALITIES[1]);
  const slots = $derived(SLOT_LAYOUT[formation] ?? SLOT_LAYOUT['4-3-3']);
  const managerDNA = $derived.by(() => summarizeManagerDNA(save?.managerDNA));
  const changedInstructions = $derived(TEAM_INSTRUCTION_DEFS.filter(def => instructions[def.id] !== DEFAULT_TEAM_INSTRUCTIONS[def.id]));
  const planSummary = $derived.by(() => {
    if (!changedInstructions.length) return 'Balanced defaults';
    return changedInstructions.slice(0, 2).map(def => instructionValueLabel(def, instructions[def.id])).join(' · ')
      + (changedInstructions.length > 2 ? ` +${changedInstructions.length - 2}` : '');
  });

  function slotLevel(player, position) {
    return Number(currentEffectiveLevel(player, { position }) ?? primaryRating(player) ?? 0);
  }

  function slotFit(player, position) {
    return Number(positionSuitabilityFor(player, position) ?? 0);
  }

  const assignment = $derived.by(() => {
    const avail = players.filter(p => p.inSquad !== false && !p.injured && !p.suspended);
    const out = new Array(slots.length).fill(null);
    const usedIds = [];
    if (savedLineup.length === 11) {
      savedLineup.forEach((pid, i) => {
        const pl = players.find(p => p.id === pid);
        if (pl) { out[i] = pl; usedIds.push(pl.id); }
      });
      return out;
    }
    slots.forEach((slot, i) => {
      const candidates = avail
        .filter(p => !usedIds.includes(p.id) && (slot.p === 'GK' ? p.position === 'GK' : p.position !== 'GK'))
        .sort((a, b) => slotLevel(b, slot.p) - slotLevel(a, slot.p) || slotFit(b, slot.p) - slotFit(a, slot.p));
      const cand = candidates[0];
      if (cand) { out[i] = cand; usedIds.push(cand.id); }
    });
    return out;
  });

  // Starting XI / Bench / Reserves, resolved through the same engine selectors
  // the match itself uses, so what this screen shows is what gets picked. An
  // unset bench is the automatic best-available one, exactly as before.
  //
  // Deliberately `selectEleven` rather than the pitch's own `assignment`: the
  // engine discards a saved lineup entirely if any name in it is injured,
  // suspended or out of the squad, so reading `assignment` here would split the
  // bench and reserves against an XI that will not actually be fielded. The
  // pitch keeps showing the manager's own selection, injury badge and all.
  const startingEleven = $derived(selectEleven(players, formation, savedLineup.length === 11 ? savedLineup : null));
  // What the engine will actually field.
  const benchPlayers = $derived(selectBench(players, startingEleven, savedBench));
  // What the manager *named*, which is what the strip shows and what every edit
  // rewrites. The two differ when a named substitute is injured or suspended:
  // the engine drops them for the match, but they keep their seat here, so
  // editing another slot cannot quietly delete them from the save.
  const playersById = $derived(new Map(players.map(player => [String(player.id), player])));
  const namedBenchIds = $derived(Array.isArray(savedBench) ? savedBench : benchPlayers.map(player => player.id));
  const benchSlots = $derived(namedBenchIds.map(id => playersById.get(String(id)) ?? null));
  const namedBenchPlayers = $derived(benchSlots.filter(Boolean));
  const reservePlayers = $derived(selectReserves(players, startingEleven, namedBenchPlayers));
  // Everyone the three matchday groups do not account for — players excluded
  // from the squad, and any row the engine does not treat as selectable. The
  // roster sheet is the only route to a player's own sheet (and so to "Add to
  // squad"), so it has to stay exhaustive by construction rather than by
  // repeating the engine's availability rules and hoping they agree.
  const unavailablePlayers = $derived.by(() => {
    const grouped = new Set([...startingEleven, ...namedBenchPlayers, ...reservePlayers].map(player => String(player.id)));
    return players.filter(player => !grouped.has(String(player.id)));
  });
  // Only a null bench is automatic. An explicitly emptied one is a real choice,
  // and must keep offering the way back to automatic.
  const benchIsAutomatic = $derived(!Array.isArray(savedBench));

  /** Takes the *named* ids, not resolved players, so an unavailable substitute
   *  keeps their seat instead of being edited out of the save. */
  async function persistBench(nextBenchIds) {
    const sv = await getSave();
    const bench = [];
    for (const id of nextBenchIds) {
      if (id == null || bench.some(taken => String(taken) === String(id))) continue;
      bench.push(id);
      if (bench.length >= MAX_MATCHDAY_BENCH) break;
    }
    await putSave({ ...sv, bench });
    savedBench = bench;
    screenTicks.squad++;
  }

  function openBenchSlot(idx) { benchSlotIdx = idx; }
  function closeBenchSlot() { benchSlotIdx = null; }

  const benchSwapCandidates = $derived.by(() => {
    if (benchSlotIdx === null) return null;
    const current = benchSlots[benchSlotIdx] ?? null;
    // Reserves only: a starter is moved by swapping them on the pitch, not by
    // quietly demoting them to the bench from here.
    const candidates = reservePlayers
      .filter(player => !player.injured && !player.suspended)
      .map(player => ({ player, effective:slotLevel(player, player.position) }));
    return { current, candidates };
  });

  async function assignBenchSlot(player) {
    const idx = benchSlotIdx;
    closeBenchSlot();
    if (idx === null) return;
    // The named list can be shorter than the strip, so writing straight to
    // `idx` would leave a hole — seating the player somewhere other than the
    // slot the sheet named.
    const next = [...namedBenchIds];
    next[Math.min(idx, next.length)] = player.id;
    await persistBench(next);
    toast(`${player.name} named on the bench`, 'success', 2200);
  }

  async function removeFromBench(idx) {
    closeBenchSlot();
    const dropped = benchSlots[idx];
    if (!dropped) return;
    await persistBench(namedBenchIds.filter((_, i) => i !== idx));
    toast(`${dropped.name} moved to the reserves`, 'info', 2200);
  }

  async function resetBench() {
    const sv = await getSave();
    await putSave({ ...sv, bench:null });
    savedBench = null;
    screenTicks.squad++;
    toast('Bench set automatically', 'info', 2000);
  }

  const formationGroups = $derived([
    { label: '3 at the back', formations: Object.keys(FORMATIONS).filter(f => f.startsWith('3-')) },
    { label: '4 at the back', formations: Object.keys(FORMATIONS).filter(f => f.startsWith('4-')) },
    { label: '5 at the back', formations: Object.keys(FORMATIONS).filter(f => f.startsWith('5-')) },
  ]);

  function instructionValueLabel(def, value) {
    return def.values.find(([id]) => id === value)?.[1] ?? value;
  }

  function activeRoleFor(player) {
    if (!player) return null;
    return getRoleDefinition(save?.playerRoles?.[player.id]) ?? defaultRoleForPosition(player.position);
  }

  function roleFitLabel(player, roleId) {
    const fit = roleSuitability(player, roleId);
    return fit >= 1.02 ? 'Strong fit' : fit >= .92 ? 'Good fit' : 'Stretch';
  }

  function promiseLabel(player) {
    const agreement = player?.playingTimeAgreement;
    if (!agreement) return 'No active promise';
    if (agreement.status === 'fulfilled') return 'Fulfilled';
    if (agreement.status === 'at_risk') return 'At risk';
    if (agreement.status === 'broken') return 'Broken';
    return 'Settling';
  }

  async function pickFormation(f) {
    formationOpen = false;
    const sv = await getSave();
    // The new shape is filled automatically, and that XI can absorb someone the
    // manager had named as a substitute — leaving their id on the bench, where
    // the engine skips it and plays a substitute short.
    const nextEleven = selectEleven(players, f, null).map(player => player.id);
    await putSave({ ...sv, formation: f, lineup: null, bench:reconcileBenchWithLineup(sv.bench, nextEleven) });
    screenTicks.squad++;
  }
  async function pickMentality(m) {
    mentalityOpen = false;
    const sv = await getSave();
    await putSave({ ...sv, mentality: m.id });
    toast(`Mentality: ${m.fullLabel}`, 'info', 2000);
    screenTicks.squad++;
  }

  async function pickInstruction(key, value) {
    const sv = await getSave();
    const nextInstructions = normalizeTeamInstructions({ ...instructions, [key]:value });
    const updated = { ...sv, tactics:createUserTacticalPlan(nextInstructions) };
    await putSave(updated);
    save = updated;
    instructions = nextInstructions;
  }

  async function pickPlayerRole(player, roleId) {
    const sv = await getSave();
    const nextRoles = { ...(sv.playerRoles ?? {}) };
    if (roleId) nextRoles[player.id] = roleId;
    else delete nextRoles[player.id];
    const updated = { ...sv, playerRoles:nextRoles };
    await putSave(updated);
    save = updated;
    const role = roleId ? getRoleDefinition(roleId) : defaultRoleForPosition(player.position);
    toast(`${player.name}: ${role?.label ?? 'Automatic role'}`, 'info', 2000);
  }

  async function pickSquadRole(player, roleId) {
    const updated = setPlayerSquadRole(player, roleId, { source:'manager', teamId:save?.userTeamId ?? player.teamId });
    if (updated === player) return;
    await putPlayer(updated);
    playerSheet = updated;
    players = players.map(p => p.id === updated.id ? updated : p);
    toast(`${player.name}: ${SQUAD_ROLE_DEFS[roleId]?.label ?? roleId} playing-time role`, 'info', 2200);
  }

  function refreshPlayer(updated) {
    if (!updated) return;
    playerSheet = updated;
    players = players.map(player => player.id === updated.id ? updated : player);
  }

  function fitnessColor(fit) {
    return fit >= 75 ? 'var(--color-live)' : fit >= 50 ? 'var(--color-warn)' : 'var(--color-bad)';
  }

  function openPlayer(p) { playerSheet = p; rosterOpen = false; }
  function closePlayer() { playerSheet = null; }
  async function toggleSquad(p) {
    const adding = p.inSquad === false;
    const updatedPlayer = { ...p, inSquad:adding };
    await putPlayer(updatedPlayer);
    const sv = await getSave();
    if (!adding) {
      const eligiblePlayers = players.map(player => player.id === p.id ? updatedPlayer : player);
      const nextSave = { ...sv };
      if (sv?.lineup?.includes(p.id)) {
        const replacementLineup = selectEleven(eligiblePlayers, formation, null).map(player => player.id);
        nextSave.lineup = replacementLineup.length === 11 ? replacementLineup : null;
      }
      // A stale id in `save.bench` is not inert: the engine skips it, so the
      // bench silently plays a substitute short — and it survives rollover.
      if (Array.isArray(sv?.bench)) nextSave.bench = sv.bench.filter(id => String(id) !== String(p.id));
      await putSave(nextSave);
    }
    toast(`${p.name} ${p.inSquad === false ? 'added to' : 'excluded from'} squad`, 'info', 2000);
    screenTicks.squad++;
  }
  async function toggleListed(p) {
    const isListed = p.transferListed === true;
    try {
      await setManagedPlayerTransferListing(p.id, !isListed);
      toast(isListed ? `${p.name} removed from transfer list` : `${p.name} listed — AI clubs will bid`, isListed ? 'info' : 'success', 2500);
      screenTicks.squad++;
    } catch (error) {
      toast(error.message === 'SIGNED_THIS_SEASON' ? 'This player joined during the current season and cannot be sold until next season.' : error.message, 'error', 4000);
    }
  }
  async function renewPlayerContract(p) {
    try {
      const result = await renewContract(p.id, 3);
      toast(`${p.name} signed a new 3-year deal at ${fmt.wage(result.newWage)}`, 'success', 3000);
      screenTicks.squad++;
    } catch {
      toast('Could not renew contract.', 'error', 2500);
    }
  }
  function beginDrag(p) { draggedPlayerId = p?.id ?? null; }
  async function dropOnSlot(idx) {
    const player = players.find(p => p.id === draggedPlayerId);
    draggedPlayerId = null;
    if (player) await applySwapAt(idx, player);
  }

  function openSlotSwap(idx) { swapSlotIdx = idx; }
  function closeSwap() { swapSlotIdx = null; }

  const swapSections = $derived.by(() => {
    if (swapSlotIdx === null) return null;
    const slot = slots[swapSlotIdx];
    const currentPlayer = assignment[swapSlotIdx];
    const candidates = players.filter(p => p.inSquad !== false && !p.injured && !p.suspended && p.id !== currentPlayer?.id);

    const naturalFit = [], versatile = [], outOfPos = [];
    candidates.forEach(p => {
      const isInXI = assignment.some((ap, i) => ap?.id === p.id && i !== swapSlotIdx);
      const fitScore = slotFit(p, slot.p);
      const effective = slotLevel(p, slot.p);
      const entry = { player:p, isInXI, fitScore, effective };
      if (fitScore >= .75) naturalFit.push(entry);
      else if (fitScore >= .45) versatile.push(entry);
      else outOfPos.push(entry);
    });
    const sortGroup = arr => arr.sort((a, b) => (a.isInXI !== b.isInXI ? (a.isInXI ? 1 : -1) : b.effective - a.effective || b.fitScore - a.fitScore));
    sortGroup(naturalFit); sortGroup(versatile); sortGroup(outOfPos);

    return { slot, currentPlayer, naturalFit, versatile, outOfPos };
  });

  async function applySwap(newPlayer) {
    const idx = swapSlotIdx;
    closeSwap();
    await applySwapAt(idx, newPlayer);
  }
  async function applySwapAt(idx, newPlayer) {
    const currentPlayer = assignment[idx];
    const otherIdx = assignment.findIndex((ap, i) => ap?.id === newPlayer.id && i !== idx);
    const newAssignment = [...assignment];
    newAssignment[idx] = newPlayer;
    if (otherIdx >= 0) newAssignment[otherIdx] = currentPlayer ?? null;

    const sv = await getSave();
    const lineup = newAssignment.filter(Boolean).map(p => p.id);
    await putSave({ ...sv, lineup, formation, bench:reconcileBenchWithLineup(sv.bench, lineup, newPlayer, currentPlayer) });
    const fit = positionFitLabel(slotFit(newPlayer, slots[idx].p));
    toast(`${newPlayer.name} → ${slots[idx].p} · ${fit}`, slotFit(newPlayer, slots[idx].p) < .55 ? 'warning' : 'success', 2300);
    screenTicks.squad++;
  }
</script>

<svelte:window onclick={(e) => { if (!e.target.closest?.('.tac-dropdown')) { formationOpen = false; mentalityOpen = false; } }} />

<div class="tactics-screen">
  {#if !loaded}
    <div class="tac-empty">Loading…</div>
  {:else}
    <header class="chalk-header">
      <div><span>Squad · tactics</span><strong>{team?.name ?? 'Your XI'}</strong></div>
      <div class="header-actions">
        <button class="roster-button" onclick={() => planningOpen = true}>Plan</button>
        <button class="roster-button" onclick={() => rosterOpen = true}>{players.length} players</button>
      </div>
    </header>
    <div class="tac-controls">
      <div class="tac-dd-half">
        <div class="tac-dropdown">
          <button class="tac-dd-btn" onclick={() => { mentalityOpen = false; formationOpen = !formationOpen; }}>
            <span class="tac-dd-copy">
              <span class="tac-dd-label">Formation</span>
              <span class="tac-dd-val">{formation}</span>
              <small>Tap to change shape</small>
            </span>
            <span class="tac-dd-arrow" class:open={formationOpen}>▾</span>
          </button>
          {#if formationOpen}
            <div class="tac-dd-list">
              {#each formationGroups as g (g.label)}
                {#if g.formations.length}
                  <div class="tac-dd-group-hdr">{g.label}</div>
                  {#each g.formations as f (f)}
                    <button class="tac-dd-option {f === formation ? 'tac-dd-active' : ''}" onclick={() => pickFormation(f)}>
                      <span>{f}</span>
                      {#if f === formation}<span class="tac-dd-check">✓</span>{/if}
                    </button>
                  {/each}
                {/if}
              {/each}
            </div>
          {/if}
        </div>
      </div>
      <div class="tac-dd-half">
        <div class="tac-dropdown">
          <button class="tac-dd-btn" onclick={() => { formationOpen = false; mentalityOpen = !mentalityOpen; }}>
            <span class="tac-dd-copy">
              <span class="tac-dd-label">Mentality</span>
              <span class="tac-dd-val">{curMentObj.fullLabel}</span>
              <small>{curMentObj.desc}</small>
            </span>
            <span class="tac-dd-arrow" class:open={mentalityOpen}>▾</span>
          </button>
          {#if mentalityOpen}
            <div class="tac-dd-list">
              {#each MENTALITIES.filter(m => m.id !== mentality) as m (m.id)}
                <button class="tac-dd-option m-option" onclick={() => pickMentality(m)}>
                  <span class="m-pill-tag">{m.label}</span>
                  <span class="m-dd-opt-info">
                    <span class="m-dd-opt-label">{m.fullLabel}</span>
                    <span class="m-dd-opt-desc">{m.desc}</span>
                  </span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
      <button class="team-plan-button" onclick={() => instructionsOpen = true}>
        <span>Team plan</span>
        <strong>{planSummary}</strong>
        <small>{changedInstructions.length ? `${changedInstructions.length} instruction${changedInstructions.length === 1 ? '' : 's'} customised` : 'Tap to shape how your XI plays'}</small>
      </button>
      <div class="dna-card" aria-label="Manager DNA">
        <span>Manager DNA</span>
        <strong>{managerDNA.matches ? managerDNA.style : 'Forming'}</strong>
        <small>{managerDNA.matches ? `${managerDNA.pressing} · ${managerDNA.averagePossession}% poss.` : 'Builds from matches'}</small>
      </div>
    </div>

    <div class="tac-pitch-area">
      <div class="pitch-wrap">
        <div class="pitch-bg">
          <div class="pitch-line half"></div>
          <div class="pitch-circle"></div>
          <div class="pitch-box top"></div><div class="pitch-box bot"></div>
          <div class="pitch-six top"></div><div class="pitch-six bot"></div>
          <div class="pitch-arc top"></div><div class="pitch-arc bot"></div>
          <div class="pitch-spot top"></div><div class="pitch-spot bot"></div><div class="pitch-spot mid"></div>
          {#each slots as slot, i (i)}
            {@const pl = assignment[i]}
            {@const g = pl ? posGroup(pl.position) : posGroup(slot.p)}
            {@const role = activeRoleFor(pl)}
            {@const fitScore = pl ? slotFit(pl, slot.p) : 1}
            {@const fitLabel = pl ? positionFitLabel(fitScore) : ''}
            <button class="pitch-slot" style="left:{slot.x}%;top:{slot.y}%" draggable={!!pl} onclick={() => openSlotSwap(i)} ondragstart={() => beginDrag(pl)} ondragover={(e) => e.preventDefault()} ondrop={() => dropOnSlot(i)} aria-label="{slot.p} slot{pl ? ` · ${pl.name} · ${fitLabel}${role ? ` · ${role.label}` : ''}` : ''}">
              <div class="slot-inner pos-{g} {!pl ? 'pos-empty' : ''} {pl?.injured ? 'slot-injured' : ''} {fitScore < .55 ? 'slot-mismatch' : ''}">
                {#if pl}
                  <div class="slot-rating">{Math.round(slotLevel(pl, slot.p))}</div>
                  <div class="slot-pos">{pl.position}</div>
                  {#if role}<div class="slot-role">{role.short}</div>{/if}
                  {#if fitScore < .75}<div class="slot-fit-tag">{fitScore < .55 ? '!' : 'FIT'}</div>{/if}
                  {#if pl.injured}<div class="slot-inj-tag">INJ</div>{/if}
                {:else}
                  <div class="slot-pos slot-empty-lbl">{slot.p}</div>
                {/if}
              </div>
              {#if pl}<div class="slot-name">{pl.name.split(' ').slice(-1)[0]}</div>{/if}
            </button>
          {/each}
        </div>
      </div>
    </div>

    <section class="bench-strip" aria-label="Matchday bench">
      <div class="bench-head">
        <div>
          <span>Bench</span>
          <strong>{namedBenchPlayers.length}/{MAX_MATCHDAY_BENCH} named</strong>
        </div>
        <div class="bench-head-right">
          {#if namedBenchPlayers.length !== benchPlayers.length}
            <span class="bench-short">{benchPlayers.length} available</span>
          {/if}
          <span class="bench-reserves">{reservePlayers.length} reserve{reservePlayers.length === 1 ? '' : 's'}</span>
          {#if !benchIsAutomatic}<button class="bench-auto" onclick={resetBench}>Auto</button>{/if}
        </div>
      </div>
      <div class="bench-row">
        {#each { length: MAX_MATCHDAY_BENCH }, i (i)}
          {@const sub = benchSlots[i] ?? null}
          {@const out = sub ? Boolean(sub.injured || sub.suspended) : false}
          <button
            class="bench-slot {out ? 'bench-slot-out' : ''}"
            onclick={() => openBenchSlot(i)}
            aria-label={sub ? `Bench ${i + 1}: ${sub.name}${out ? ' · unavailable' : ''}` : `Bench ${i + 1}: empty`}
          >
            {#if sub}
              <span class="bench-rating">{Math.round(slotLevel(sub, sub.position))}</span>
              <span class="bench-pos pos-{posGroup(sub.position)}">{out ? (sub.injured ? 'INJ' : 'SUS') : sub.position}</span>
              <span class="bench-name">{sub.name.split(' ').slice(-1)[0]}</span>
            {:else}
              <span class="bench-empty">+</span>
              <span class="bench-name bench-name-empty">Empty</span>
            {/if}
          </button>
        {/each}
      </div>
    </section>

  {/if}
</div>

{#if instructionsOpen}
  <button class="sheet-backdrop" onclick={() => instructionsOpen = false} aria-label="Close team instructions"></button>
  <div class="sheet instructions-sheet">
    <div class="sheet-handle"></div>
    <div class="swap-hdr">
      <div><span class="swap-title">Team plan</span><div class="sheet-subtitle">Every choice is a trade-off inside the match engine.</div></div>
      <button class="sheet-close" onclick={() => instructionsOpen = false} aria-label="Close">✕</button>
    </div>
    <div class="instruction-list">
      {#each TEAM_INSTRUCTION_DEFS as def (def.id)}
        <div class="instruction-row">
          <span>{def.label}</span>
          <div class="instruction-options" role="group" aria-label={def.label}>
            {#each def.values as [value, label] (value)}
              <button class:active={instructions[def.id] === value} onclick={() => pickInstruction(def.id, value)}>{label}</button>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </div>
{/if}

{#if planningOpen}
  <button class="sheet-backdrop" onclick={() => planningOpen = false} aria-label="Close squad planning"></button>
  <div class="sheet planning-sheet">
    <div class="sheet-handle"></div>
    <div class="swap-hdr">
      <div><span class="swap-title">Squad planning</span><div class="sheet-subtitle">Which positions you are short in, and who coaches each part of your squad.</div></div>
      <button class="sheet-close" onclick={() => planningOpen = false} aria-label="Close">✕</button>
    </div>
    <div class="planning-sheet-body"><SquadPlanningPanel /></div>
  </div>
{/if}

{#if swapSections}
  <button class="sheet-backdrop" onclick={closeSwap} aria-label="Close"></button>
  <div class="sheet">
    <div class="sheet-handle"></div>
    <div class="swap-hdr">
      <span class="swap-title">{swapSections.slot.p} Slot</span>
      <button class="sheet-close" onclick={closeSwap} aria-label="Close">✕</button>
    </div>
    {#if swapSections.currentPlayer}
      {@const cp = swapSections.currentPlayer}
      {@const cpFit = positionFitLabel(slotFit(cp, swapSections.slot.p))}
      <div class="swap-current">
        <span class="pos-badge pos-{posGroup(cp.position)}">{cp.position}</span>
        <div>
          <div class="swap-current-name">{cp.name}</div>
          <div class="swap-current-meta">Current · Level {Math.round(slotLevel(cp, swapSections.slot.p))} · {cpFit} · Fitness {Math.round(cp.fitness ?? 90)}%</div>
        </div>
      </div>
    {/if}
    <div class="swap-list">
      {#each [['Best fit for ' + swapSections.slot.p, swapSections.naturalFit], ['Can play here', swapSections.versatile], ['Out of position', swapSections.outOfPos]] as [heading, entries] (heading)}
        {#if entries.length}
          <div class="swap-section-hdr">{heading}</div>
          {#each entries as entry (entry.player.id)}
            {@const p = entry.player}
            {@const fit = Math.round(p.fitness ?? 90)}
            <button class="swap-row {entry.isInXI ? 'dimmed' : ''}" onclick={() => applySwap(p)}>
              <span class="pos-badge pos-{posGroup(p.position)}">{p.position}</span>
              <span class="swap-row-info">
                <span class="swap-row-name">{p.name}</span>
                <span class="swap-row-meta">{positionFitLabel(entry.fitScore)} · Age {p.age}{#if p.goals}{' · ' + p.goals + 'G'}{/if}{#if p.assists}{' · ' + p.assists + 'A'}{/if}</span>
              </span>
              {#if entry.isInXI}<span class="swap-row-badge">IN XI</span>{/if}
              <span class="swap-row-fit" style="color:{fitnessColor(fit)}">{fit}%</span>
              <span class="swap-row-rat" style="color:{entry.fitScore >= .75 ? 'var(--color-live)' : entry.fitScore < .45 ? 'var(--color-bad)' : 'var(--color-tx-2)'}">{Math.round(entry.effective)}</span>
            </button>
          {/each}
        {/if}
      {/each}
    </div>
  </div>
{/if}

{#if benchSwapCandidates}
  <button class="sheet-backdrop" onclick={closeBenchSlot} aria-label="Close"></button>
  <div class="sheet">
    <div class="sheet-handle"></div>
    <div class="swap-hdr">
      <div><span class="swap-title">Bench {benchSlotIdx + 1}</span><div class="sheet-subtitle">Name up to {MAX_MATCHDAY_BENCH} substitutes. Everyone else is a reserve and is not in the matchday squad.</div></div>
      <button class="sheet-close" onclick={closeBenchSlot} aria-label="Close">✕</button>
    </div>
    {#if benchSwapCandidates.current}
      {@const cur = benchSwapCandidates.current}
      <div class="swap-current">
        <span class="pos-badge pos-{posGroup(cur.position)}">{cur.position}</span>
        <div>
          <div class="swap-current-name">{cur.name}</div>
          <div class="swap-current-meta">On the bench · Level {Math.round(slotLevel(cur, cur.position))} · Fitness {Math.round(cur.fitness ?? 90)}%</div>
        </div>
        <button class="bench-remove" onclick={() => removeFromBench(benchSlotIdx)}>Remove</button>
      </div>
    {/if}
    <div class="swap-list">
      {#if !benchSwapCandidates.candidates.length}
        <div class="swap-section-hdr">No available reserves</div>
      {:else}
        <div class="swap-section-hdr">Reserves</div>
        {#each benchSwapCandidates.candidates as entry (entry.player.id)}
          {@const p = entry.player}
          {@const fit = Math.round(p.fitness ?? 90)}
          <button class="swap-row" onclick={() => assignBenchSlot(p)}>
            <span class="pos-badge pos-{posGroup(p.position)}">{p.position}</span>
            <span class="swap-row-info">
              <span class="swap-row-name">{p.name}</span>
              <span class="swap-row-meta">Age {p.age}{p.squadRole ? ` · ${SQUAD_ROLE_DEFS[p.squadRole]?.label ?? p.squadRole}` : ''}</span>
            </span>
            <span class="swap-row-fit" style="color:{fitnessColor(fit)}">{fit}%</span>
            <span class="swap-row-rat">{Math.round(entry.effective)}</span>
          </button>
        {/each}
      {/if}
    </div>
  </div>
{/if}

{#if rosterOpen}
  <button class="sheet-backdrop" onclick={() => rosterOpen = false} aria-label="Close roster"></button>
  <div class="sheet roster-sheet">
    <div class="sheet-handle"></div>
    <div class="swap-hdr"><span class="swap-title">Your squad</span><button class="sheet-close" onclick={() => rosterOpen = false} aria-label="Close">✕</button></div>
    <div class="swap-list">
      {#each [['Starting XI', startingEleven], ['Bench', namedBenchPlayers], ['Reserves', reservePlayers], ['Not in squad', unavailablePlayers]] as [heading, group] (heading)}
        {#if group.length}
          <div class="swap-section-hdr">{heading} · {group.length}</div>
          {#each group as p (p.id)}
            {@const fit = Math.round(p.fitness ?? 90)}
            {@const role = activeRoleFor(p)}
            <button class="swap-row" onclick={() => openPlayer(p)}>
              <span class="pos-badge pos-{posGroup(p.position)}">{p.position}</span>
              <span class="swap-row-info"><span class="swap-row-name">{p.name}</span><span class="swap-row-meta">Age {p.age}{role ? ` · ${role.label}` : ''}{p.squadRole ? ` · ${SQUAD_ROLE_DEFS[p.squadRole]?.label ?? p.squadRole}` : ''}{p.injured ? ' · Injured' : ''}{p.transferListed ? ' · Listed' : ''}</span></span>
              <span class="swap-row-fit" style="color:{fitnessColor(fit)}">{fit}%</span><span class="swap-row-rat">{primaryRating(p)}</span>
            </button>
          {/each}
        {/if}
      {/each}
    </div>
  </div>
{/if}

{#if playerSheet}
  {@const p = playerSheet}
  {@const fit = Math.round(p.fitness ?? 90)}
  {@const yearsLeft = save ? contractYearsRemaining(p, save) : null}
  {@const explicitRole = getRoleDefinition(save?.playerRoles?.[p.id])}
  {@const currentRole = explicitRole ?? defaultRoleForPosition(p.position)}
  {@const baseRating = Math.round(Number(baselineLevel(p) ?? 0))}
  {@const currentRating = Math.round(Number(currentEffectiveLevel(p) ?? baseRating))}
  {@const potential = getPotentialEstimate(p)}
  {@const traits = traitRecruitmentLabels(p)}
  {@const rehabWarning = rehabilitationSelectionWarning(p)}
  {@const squadRole = SQUAD_ROLE_DEFS[p.squadRole]}
  <button class="sheet-backdrop" onclick={closePlayer} aria-label="Close player"></button>
  <div class="sheet player-sheet">
    <div class="sheet-handle"></div>
    <div class="swap-hdr"><div><span class="swap-title">{p.name}</span><div class="player-sub"><span class="pos-badge pos-{posGroup(p.position)}">{p.position}</span> Age {p.age} · {fit}% fit</div></div><button class="sheet-close" onclick={closePlayer} aria-label="Close">✕</button></div>

    {#if rehabWarning}<div class="p3-warning">{rehabWarning}</div>{/if}

    <div class="player-metrics">
      <div><span>Current</span><strong>{currentRating}</strong></div>
      <div><span>Baseline</span><strong>{baseRating}</strong></div>
      <div><span>Potential</span><strong>{potential.min}–{potential.max}</strong><small>{potential.confidence}</small></div>
      {#if yearsLeft !== null}<div><span>Contract</span><strong>{yearsLeft <= 0 ? 'Expiring' : yearsLeft + ' yrs'}</strong></div>{:else}<div><span>Value</span><strong>{fmt.money(p.value)}</strong></div>{/if}
    </div>

    <div class="p3-state-grid" aria-label="Current player state">
      <div><span>Form</span><strong>{Math.round(p.form ?? 50)}</strong></div>
      <div><span>Morale</span><strong>{Math.round(p.individualMorale ?? 50)}</strong></div>
      <div><span>Sharpness</span><strong>{Math.round(p.sharpness ?? 50)}</strong></div>
      <div><span>Fitness</span><strong>{fit}</strong></div>
    </div>

    <div class="player-attributes"><div><span>GK</span><strong>{p.goalkeeping ?? 0}</strong></div><div><span>DEF</span><strong>{p.defence ?? 0}</strong></div><div><span>MID</span><strong>{p.midfield ?? 0}</strong></div><div><span>ATT</span><strong>{p.attack ?? 0}</strong></div></div>

    <div class="development-wrap"><DevelopmentPlanPanel player={p} onchange={refreshPlayer} /></div>

    <section class="p3-section" aria-label="Position and traits">
      <div class="p3-section-head"><div><span>Position fit</span><strong>{p.position} · Natural</strong></div><small>{p.positionConversion ? `Converting to ${p.positionConversion.targetPosition} · ${Math.round((p.positionConversion.progress ?? 0) * 100)}%` : 'Primary position remains unchanged until you choose a pathway.'}</small></div>
      <div class="p3-chip-row">
        {#if traits.length}
          {#each traits as trait (trait)}<span class="p3-chip">{trait}</span>{/each}
        {:else}<span class="p3-muted">No standout trait yet</span>{/if}
      </div>
    </section>

    <section class="p3-section" aria-label="Playing time role">
      <div class="p3-section-head"><div><span>Playing-time role</span><strong>{squadRole?.label ?? 'Automatic'}</strong></div><small class:at-risk={p.playingTimeAgreement?.status === 'at_risk'} class:broken={p.playingTimeAgreement?.status === 'broken'}>{promiseLabel(p)}</small></div>
      <div class="squad-role-options">
        {#each SQUAD_ROLE_ORDER as roleId (roleId)}
          {@const def = SQUAD_ROLE_DEFS[roleId]}
          <button class:active={p.squadRole === roleId} onclick={() => pickSquadRole(p, roleId)}><strong>{def.label}</strong><small>{Math.round(def.appearanceShare * 100)}% apps</small></button>
        {/each}
      </div>
    </section>

    <section class="role-section" aria-label="Tactical role">
      <div class="role-heading"><div><span>Tactical role</span><strong>{currentRole?.label ?? 'Automatic'}</strong></div><small>Role fit changes how effectively this player executes the team plan.</small></div>
      <div class="role-options">
        <button class:active={!explicitRole} onclick={() => pickPlayerRole(p, null)}><strong>Auto</strong><small>{defaultRoleForPosition(p.position)?.label ?? 'Best fit'}</small></button>
        {#each getCompatibleRoles(p) as role (role.id)}
          <button class:active={explicitRole?.id === role.id} onclick={() => pickPlayerRole(p, role.id)}><strong>{role.label}</strong><small>{roleFitLabel(p, role.id)}</small></button>
        {/each}
      </div>
    </section>

    <div class="player-finance"><span>{fmt.money(p.value)}</span><span>{fmt.wage(p.wage)}/wk</span></div>
    <div class="player-actions">
      {#if yearsLeft !== null && !p.onLoan}<button class="player-primary" onclick={() => renewPlayerContract(p)}>Renew contract</button>{/if}
      <button onclick={() => toggleSquad(p)}>{p.inSquad === false ? 'Add to squad' : 'Exclude from squad'}</button>
      <button onclick={() => toggleListed(p)}>{p.transferListed ? 'Remove from transfer list' : 'List for transfer'}</button>
    </div>
  </div>
{/if}

<style>
  .tactics-screen { display: flex; flex-direction: column; flex: 1; min-height: 0; font-family: var(--font-body); color: var(--color-tx); }
  .tac-empty { color: var(--color-tx-3); font-size: 12px; padding: 24px; text-align: center; }
  .chalk-header { display:flex; justify-content:space-between; align-items:end; padding:16px 16px 0; flex-shrink:0; }
  .chalk-header span { display:block; color:var(--color-club); font:700 9px/1 var(--font-mono); letter-spacing:2px; text-transform:uppercase; margin-bottom:5px; }
  .chalk-header strong { display:block; font:700 25px/1 var(--font-display); letter-spacing:.03em; }
  .header-actions { display:flex; gap:7px; align-items:center; }
  .roster-button { min-height:44px; padding:0 12px; color:var(--color-tx-2); background:var(--color-surface); border:1px solid var(--color-line); border-radius:999px; cursor:pointer; font:600 11px var(--font-mono); }

  /* Formation, Mentality, Team plan and Manager DNA share one row, each card
     carrying its own title, so the pitch below gets the rest of the screen. */
  .tac-controls { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; padding: 12px 16px 8px; flex-shrink: 0; position: relative; z-index: 10; }
  .tac-dd-half { min-width: 0; position: relative; }
  .tac-dd-label { display: block; color: var(--color-tx-3); font: 700 8px/1 var(--font-mono); letter-spacing: 1.1px; text-transform: uppercase; }
  .tac-dropdown { position: relative; }
  .tac-dd-btn { width: 100%; min-height: 62px; display: flex; align-items: center; gap: 6px; background: var(--color-surface); border: 1px solid var(--color-line); border-radius: 10px; padding: 8px 10px; color: var(--color-tx); cursor: pointer; }
  .tac-dd-copy { min-width: 0; flex: 1; text-align: left; }
  .tac-dd-copy small { display: block; margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-tx-3); font: 9px/1.2 var(--font-body); }
  .tac-dd-val { display: block; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 700 12px/1.15 var(--font-body); }
  .tac-dd-arrow { color: var(--color-tx-3); transition: transform 0.15s; }
  .tac-dd-arrow.open { transform: rotate(180deg); }
  .m-pill-tag { font-family: var(--font-mono); font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 5px; background: var(--color-raised); color: var(--color-club); flex-shrink: 0; }
  .tac-dd-list { position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 50; background: var(--color-raised); border: 1px solid var(--color-line); border-radius: 10px; max-height: 320px; overflow-y: auto; padding: 4px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
  .tac-dd-group-hdr { font-family: var(--font-mono); font-size: 9px; letter-spacing: 1px; text-transform: uppercase; color: var(--color-tx-3); padding: 6px 8px 2px; }
  .tac-dd-option, .m-option { width: 100%; display: flex; align-items: center; gap: 8px; text-align: left; background: none; border: none; color: var(--color-tx); font-size: 12px; padding: 8px; border-radius: 7px; cursor: pointer; min-height: 36px; }
  .tac-dd-option:hover, .m-option:hover { background: var(--color-surface); }
  .tac-dd-option.tac-dd-active { color: var(--color-club); }
  .tac-dd-check { margin-left: auto; color: var(--color-club); }
  .m-dd-opt-info { display: flex; flex-direction: column; }
  .m-dd-opt-label { font-weight: 600; }
  .m-dd-opt-desc { font-size: 10px; color: var(--color-tx-3); }

  .team-plan-button, .dna-card { min-width:0; min-height:62px; padding:8px 10px; text-align:left; border:1px solid var(--color-line); border-radius:10px; background:var(--color-surface); color:var(--color-tx); }
  .team-plan-button { cursor:pointer; }
  .team-plan-button span, .dna-card span { display:block; color:var(--color-tx-3); font:700 8px/1 var(--font-mono); letter-spacing:1.1px; text-transform:uppercase; }
  .team-plan-button strong, .dna-card strong { display:block; margin-top:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font:700 12px/1.15 var(--font-body); }
  .team-plan-button small, .dna-card small { display:block; margin-top:3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--color-tx-3); font:9px/1.2 var(--font-body); }
  .dna-card { background:color-mix(in oklch,var(--color-club) 7%,var(--color-surface)); }
  .dna-card strong { color:var(--color-club); }

  /* The pitch takes the remaining height above the bench strip. */
  .tac-pitch-area { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 6px 10px 4px; }
  .pitch-wrap { width: 100%; max-width: min(560px, calc((100dvh - 310px) * .68)); aspect-ratio: 68/100; margin: 0 auto; }

  /* Bench: the named matchday substitutes. Horizontally scrollable so nine
     slots fit a 390px viewport without shrinking the pitch any further. */
  .bench-strip { flex-shrink: 0; padding: 0 16px calc(10px + env(safe-area-inset-bottom)); }
  .bench-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 10px; margin-bottom: 6px; }
  .bench-head span { display: block; color: var(--color-tx-3); font: 700 8px/1 var(--font-mono); letter-spacing: 1.1px; text-transform: uppercase; }
  .bench-head strong { display: block; margin-top: 3px; font: 700 12px/1.15 var(--font-body); }
  .bench-head-right { display: flex; align-items: center; gap: 8px; }
  .bench-reserves { color: var(--color-tx-3); font: 9px var(--font-mono); }
  .bench-auto { min-height: 44px; padding: 0 12px; border: 1px solid var(--color-line); border-radius: 999px; background: var(--color-surface); color: var(--color-tx-2); font: 600 10px var(--font-mono); cursor: pointer; }
  .bench-row { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
  .bench-row::-webkit-scrollbar { display: none; }
  .bench-slot {
    flex: 0 0 auto; width: 58px; min-height: 62px; display: flex; flex-direction: column; align-items: center; gap: 2px;
    padding: 6px 4px; border: 1px solid var(--color-line); border-radius: 9px; background: var(--color-surface);
    color: var(--color-tx); cursor: pointer;
  }
  .bench-slot:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  .bench-rating { font: 700 14px/1 var(--font-display); }
  .bench-pos { padding: 1px 5px; border-radius: 4px; background: var(--color-raised); color: var(--color-tx-2); font: 700 8px/1.4 var(--font-mono); }
  .bench-pos.pos-GK { color: #7c83e8; } .bench-pos.pos-DEF { color: var(--color-live); } .bench-pos.pos-MID { color: var(--color-warn); } .bench-pos.pos-ATT { color: var(--color-bad); }
  .bench-empty { font: 700 14px/1 var(--font-display); color: var(--color-tx-3); }
  .bench-name { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 9px var(--font-body); color: var(--color-tx-2); }
  .bench-name-empty { color: var(--color-tx-3); }
  /* A named substitute who cannot play keeps their seat, so the manager can see
     they need replacing rather than finding a short bench on matchday. */
  .bench-slot-out { border-color: var(--color-bad); opacity: .7; }
  .bench-slot-out .bench-pos { color: var(--color-bad); }
  /* Out-specifies `.bench-head span`, which would otherwise win and render this
     warning in the same muted grey as the reserves count beside it. */
  .bench-head-right .bench-short { color: var(--color-bad); font: 700 9px var(--font-mono); }
  .bench-remove { margin-left: auto; min-height: 44px; padding: 0 14px; border: 1px solid var(--color-line); border-radius: 8px; background: var(--color-raised); color: var(--color-tx-2); font: 600 10px var(--font-body); cursor: pointer; }
  .pitch-bg { position: relative; width: 100%; height: 100%; background: linear-gradient(180deg, var(--color-turf), var(--color-turf-2)); border: 2px solid rgba(255,255,255,0.18); border-radius: 8px; overflow: hidden; }
  .pitch-line.half { position: absolute; top: 50%; left: 0; right: 0; height: 1px; background: rgba(255,255,255,0.18); }
  .pitch-circle { position: absolute; top: 50%; left: 50%; width: 22%; aspect-ratio: 1; border: 1px solid rgba(255,255,255,0.18); border-radius: 50%; transform: translate(-50%, -50%); }
  .pitch-spot { position: absolute; width: 4px; height: 4px; border-radius: 50%; background: rgba(255,255,255,0.3); left: 50%; transform: translate(-50%, -50%); }
  .pitch-spot.mid { top: 50%; } .pitch-spot.top { top: 15%; } .pitch-spot.bot { top: 85%; }
  .pitch-box { position: absolute; left: 21%; width: 58%; height: 16%; border: 1px solid rgba(255,255,255,0.18); }
  .pitch-box.top { top: 0; border-top: none; } .pitch-box.bot { bottom: 0; border-bottom: none; }
  .pitch-six { position: absolute; left: 36%; width: 28%; height: 7%; border: 1px solid rgba(255,255,255,0.18); }
  .pitch-six.top { top: 0; border-top: none; } .pitch-six.bot { bottom: 0; border-bottom: none; }
  .pitch-arc { position: absolute; left: 36%; width: 28%; height: 6%; border: 1px solid rgba(255,255,255,0.18); border-radius: 0 0 50% 50% / 0 0 100% 100%; }
  .pitch-arc.top { top: 16%; border-top: none; } .pitch-arc.bot { bottom: 16%; border-radius: 50% 50% 0 0 / 100% 100% 0 0; border-bottom: none; }

  .pitch-slot { position: absolute; transform: translate(-50%, -50%); width: 52px; min-height: 68px; display: flex; flex-direction: column; align-items: center; gap: 3px; background: none; border: none; cursor: pointer; padding: 0; }
  .slot-inner { width: 52px; height: 52px; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 2px solid; background: var(--color-surface); }
  .slot-inner.pos-GK { border-color: #7c83e8; } .slot-inner.pos-DEF { border-color: var(--color-live); } .slot-inner.pos-MID { border-color: var(--color-warn); } .slot-inner.pos-ATT { border-color: var(--color-bad); }
  .slot-inner.pos-empty { border-color: var(--color-line); border-style: dashed; background: rgba(255,255,255,0.04); }
  .slot-inner.slot-injured { box-shadow: 0 0 0 2px var(--color-bad); }
  .slot-inner.slot-mismatch { border-color:var(--color-bad); }
  .slot-rating { font-family: var(--font-display); font-size: 17px; line-height: .95; color: var(--color-tx); }
  .slot-pos { font-family: var(--font-mono); font-size: 8px; line-height:1; color: var(--color-tx-2); }
  .slot-role { margin-top:1px; color:var(--color-club); font:700 6px/1 var(--font-mono); letter-spacing:.2px; }
  .slot-empty-lbl { color: var(--color-tx-3); font-size: 9px; }
  .slot-inj-tag, .slot-fit-tag { position:absolute; top:-6px; font:700 7px/1 var(--font-mono); background:var(--color-surface); padding:2px 3px; border-radius:3px; }
  .slot-inj-tag { color:var(--color-bad); }
  .slot-fit-tag { color:var(--color-warn); left:-2px; }
  .slot-name { font-size: 10px; color: var(--color-tx); background: rgba(0,0,0,0.55); padding: 2px 6px; border-radius: 4px; white-space: nowrap; max-width: 82px; overflow: hidden; text-overflow: ellipsis; }


  .pos-badge { font-family: var(--font-mono); font-size: 10px; font-weight: 700; letter-spacing: 0.5px; padding: 2px 6px; border-radius: 5px; flex-shrink: 0; background: var(--color-raised); color: var(--color-tx-2); border: 1px solid var(--color-line); }
  .pos-badge.pos-GK { color: #7c83e8; } .pos-badge.pos-DEF { color: var(--color-live); } .pos-badge.pos-MID { color: var(--color-warn); } .pos-badge.pos-ATT { color: var(--color-bad); }

  .sheet-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 900; animation: fade-in 0.2s ease; border: none; padding: 0; cursor: default; }
  .sheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 901; max-height: 80dvh; display: flex; flex-direction: column; background: var(--color-surface); border: 1px solid var(--color-line); border-bottom: none; border-radius: 18px 18px 0 0; padding: 10px 18px calc(16px + env(safe-area-inset-bottom)); animation: slide-up 0.22s ease; font-family: var(--font-body); color: var(--color-tx); }
  @media (prefers-reduced-motion: reduce) { .sheet-backdrop, .sheet { animation: none; } }
  @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } } @keyframes slide-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
  .sheet-handle { width: 36px; height: 4px; border-radius: 2px; background: var(--color-line); margin: 4px auto 12px; flex-shrink: 0; }
  .swap-hdr { display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; margin-bottom: 10px; }
  .swap-title { font-family: var(--font-display); font-size: 17px; letter-spacing: 0.5px; }
  .sheet-subtitle { margin-top:4px; color:var(--color-tx-3); font-size:10px; }
  .sheet-close { width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--color-line); background: var(--color-raised); color: var(--color-tx-2); cursor: pointer; font-size: 14px; flex-shrink: 0; }
  .instructions-sheet, .planning-sheet { max-height:88dvh; }
  .planning-sheet-body { min-height:0; overflow:auto; overscroll-behavior:contain; }
  .development-wrap { margin-top:12px; }
  .instruction-list { min-height:0; overflow-y:auto; overscroll-behavior:contain; display:grid; gap:10px; padding-bottom:4px; }
  .instruction-row { display:grid; gap:6px; } .instruction-row > span { color:var(--color-tx-2); font:700 9px/1 var(--font-mono); letter-spacing:1px; text-transform:uppercase; }
  .instruction-options { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:4px; padding:3px; background:var(--color-raised); border:1px solid var(--color-line); border-radius:9px; }
  .instruction-options button { min-height:38px; padding:5px 4px; border:0; border-radius:7px; background:transparent; color:var(--color-tx-3); cursor:pointer; font:600 10px/1.15 var(--font-body); }
  .instruction-options button.active { background:var(--color-club); color:var(--color-on-club,#fff); box-shadow:0 3px 12px color-mix(in oklch,var(--color-club) 22%,transparent); }
  .swap-current { display: flex; align-items: center; gap: 10px; padding: 8px; background: var(--color-raised); border-radius: 10px; margin-bottom: 8px; flex-shrink: 0; }
  .swap-current-name { font-size: 13px; font-weight: 600; } .swap-current-meta { font-size: 10px; color: var(--color-tx-3); }
  .swap-list { overflow-y: auto; overscroll-behavior: contain; }
  .swap-section-hdr { font-family: var(--font-mono); font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--color-tx-3); padding: 10px 4px 4px; }
  .swap-row { width: 100%; display: flex; align-items: center; gap: 10px; text-align: left; background: none; border: 1px solid transparent; border-radius: 10px; padding: 8px; cursor: pointer; color: var(--color-tx); min-height: 44px; }
  .swap-row:hover { background: var(--color-raised); } .swap-row.dimmed { opacity: 0.55; }
  .swap-row-info { flex: 1; min-width: 0; display: flex; flex-direction: column; } .swap-row-name { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .swap-row-meta { font-size: 10px; color: var(--color-tx-3); }
  .swap-row-badge { font-size: 9px; font-family: var(--font-mono); color: var(--color-tx-3); background: var(--color-raised); padding: 1px 5px; border-radius: 4px; flex-shrink: 0; }
  .swap-row-fit { font-family: var(--font-mono); font-size: 11px; flex-shrink: 0; } .swap-row-rat { font-family: var(--font-display); font-size: 15px; min-width: 24px; text-align: right; flex-shrink: 0; }
  .roster-sheet { max-height:86dvh; }
  .player-sheet { max-height:88dvh; overflow-y:auto; }
  .player-sub { display:flex; align-items:center; gap:7px; margin-top:7px; font-size:11px; color:var(--color-tx-3); }
  .p3-warning { margin:0 0 10px; padding:9px 10px; border:1px solid color-mix(in oklch,var(--color-warn) 55%,var(--color-line)); border-radius:9px; background:color-mix(in oklch,var(--color-warn) 10%,var(--color-raised)); color:var(--color-warn); font:600 10px/1.35 var(--font-body); }
  .player-metrics { display:grid; grid-template-columns:repeat(2,1fr); gap:1px; background:var(--color-line); border:1px solid var(--color-line); border-radius:10px; overflow:hidden; }
  .player-metrics div { background:var(--color-raised); padding:10px; min-width:0; } .player-metrics span { display:block; color:var(--color-tx-3); font:9px var(--font-mono); letter-spacing:1px; text-transform:uppercase; } .player-metrics strong { display:block; margin-top:4px; font:17px var(--font-display); } .player-metrics small { display:block; margin-top:2px; color:var(--color-tx-3); font:8px var(--font-mono); }
  .p3-state-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin-top:10px; }
  .p3-state-grid div { min-width:0; padding:8px 4px; text-align:center; background:var(--color-raised); border:1px solid var(--color-line); border-radius:8px; }
  .p3-state-grid span { display:block; color:var(--color-tx-3); font:8px var(--font-mono); text-transform:uppercase; } .p3-state-grid strong { display:block; margin-top:3px; font:14px var(--font-display); }
  .player-attributes { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin-top:10px; } .player-attributes div { padding:9px 4px; text-align:center; background:var(--color-raised); border:1px solid var(--color-line); border-radius:8px; } .player-attributes span { display:block; color:var(--color-tx-3); font:8px var(--font-mono); } .player-attributes strong { display:block; margin-top:3px; font:15px var(--font-display); }
  .p3-section, .role-section { margin-top:12px; padding:11px; border:1px solid var(--color-line); border-radius:10px; background:var(--color-raised); }
  .p3-section-head, .role-heading { display:flex; align-items:end; justify-content:space-between; gap:12px; }
  .p3-section-head div span, .role-heading div span { display:block; color:var(--color-tx-3); font:700 8px var(--font-mono); letter-spacing:1px; text-transform:uppercase; }
  .p3-section-head div strong, .role-heading div strong { display:block; margin-top:3px; font:700 13px var(--font-body); }
  .p3-section-head > small, .role-heading > small { max-width:52%; color:var(--color-tx-3); font:9px/1.25 var(--font-body); text-align:right; }
  .p3-section-head > small.at-risk { color:var(--color-warn); } .p3-section-head > small.broken { color:var(--color-bad); }
  .p3-chip-row { display:flex; flex-wrap:wrap; gap:6px; margin-top:9px; }
  .p3-chip { padding:5px 7px; border:1px solid var(--color-line); border-radius:999px; color:var(--color-tx-2); background:var(--color-surface); font:600 9px var(--font-body); }
  .p3-muted { color:var(--color-tx-3); font:9px var(--font-body); }
  .squad-role-options { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; margin-top:9px; }
  .squad-role-options button, .role-options button { min-height:48px; padding:7px 8px; text-align:left; border:1px solid var(--color-line); border-radius:8px; background:var(--color-surface); color:var(--color-tx); cursor:pointer; }
  .squad-role-options button.active, .role-options button.active { border-color:var(--color-club); background:color-mix(in oklch,var(--color-club) 12%,var(--color-surface)); }
  .squad-role-options strong, .squad-role-options small, .role-options strong, .role-options small { display:block; }
  .squad-role-options strong, .role-options strong { font-size:11px; } .squad-role-options small, .role-options small { margin-top:3px; color:var(--color-tx-3); font:9px var(--font-mono); } .squad-role-options button.active small, .role-options button.active small { color:var(--color-club); }
  .role-options { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; margin-top:9px; }
  .player-finance { display:flex; justify-content:space-between; gap:12px; margin-top:12px; padding:0 2px; color:var(--color-tx-3); font:10px var(--font-mono); }
  .player-actions { display:grid; gap:8px; margin-top:14px; } .player-actions button { min-height:44px; color:var(--color-tx); background:var(--color-raised); border:1px solid var(--color-line); border-radius:9px; cursor:pointer; font:600 12px var(--font-body); } .player-actions .player-primary { color:var(--color-on-accent); background:var(--color-accent); border-color:var(--color-accent); }

  @media (min-width: 720px) {
    .sheet { left:50%; right:auto; width:min(560px,calc(100vw - 32px)); transform:translateX(-50%); }
    .sheet.planning-sheet { width:min(920px,calc(100vw - 32px)); }
  }
  /* Four cards abreast need real width; on a phone they wrap to two rows and
     the pitch keeps everything below them. */
  @media (max-width: 600px) {
    .tac-controls { grid-template-columns: repeat(2, minmax(0, 1fr)); padding-inline: 12px; }
    .pitch-wrap { max-width: min(560px, calc((100dvh - 300px) * .68)); }
  }
  @media (max-width: 380px) {
    .pitch-slot { width: 46px; min-height: 62px; }
    .slot-inner { width: 46px; height: 46px; }
    .slot-rating { font-size: 15px; }
  }
</style>