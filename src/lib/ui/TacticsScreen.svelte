<script>
  import { getPlayersByTeam, getSave, putSave, openDB } from '../../modules/db.js';
  import { FORMATIONS, primaryRating } from '../../modules/matchEngine.js';
  import { posGroup, toast } from '../../ui/helpers.js';
  import { screenTicks } from '../state/screens.svelte.js';

  const MENTALITIES = [
    { id: 'defensive', label: 'DEF', fullLabel: 'Defensive', desc: 'Compact & hard to break down' },
    { id: 'balanced', label: 'BAL', fullLabel: 'Balanced', desc: 'No bias — steady in both phases' },
    { id: 'possession', label: 'POS', fullLabel: 'Possession', desc: 'Patient build-up, dominate the ball' },
    { id: 'attacking', label: 'ATK', fullLabel: 'Attacking', desc: 'High press & direct, more exposed' },
  ];

  // Formation visual slot positions (x/y as % of pitch), ported unchanged from
  // the legacy renderer — these are layout constants, not simulation math.
  const SLOT_LAYOUT = {
    '3-4-3':   [{p:'GK',x:50,y:90},{p:'CB',x:70,y:76},{p:'CB',x:50,y:78},{p:'CB',x:30,y:76},{p:'RM',x:85,y:54},{p:'CM',x:62,y:54},{p:'CM',x:38,y:54},{p:'LM',x:15,y:54},{p:'RW',x:80,y:28},{p:'ST',x:50,y:20},{p:'LW',x:20,y:28}],
    '3-5-2':   [{p:'GK',x:50,y:90},{p:'CB',x:70,y:76},{p:'CB',x:50,y:78},{p:'CB',x:30,y:76},{p:'RM',x:88,y:52},{p:'CM',x:67,y:52},{p:'CDM',x:50,y:55},{p:'CM',x:33,y:52},{p:'LM',x:12,y:52},{p:'ST',x:65,y:22},{p:'ST',x:35,y:22}],
    '3-4-1-2': [{p:'GK',x:50,y:90},{p:'CB',x:70,y:76},{p:'CB',x:50,y:78},{p:'CB',x:30,y:76},{p:'RM',x:85,y:56},{p:'CM',x:62,y:56},{p:'CM',x:38,y:56},{p:'LM',x:15,y:56},{p:'CAM',x:50,y:38},{p:'ST',x:65,y:22},{p:'ST',x:35,y:22}],
    '4-3-3':   [{p:'GK',x:50,y:90},{p:'RB',x:82,y:74},{p:'CB',x:63,y:76},{p:'CB',x:37,y:76},{p:'LB',x:18,y:74},{p:'CM',x:73,y:52},{p:'CDM',x:50,y:55},{p:'CM',x:27,y:52},{p:'RW',x:82,y:28},{p:'ST',x:50,y:20},{p:'LW',x:18,y:28}],
    '4-2-3-1': [{p:'GK',x:50,y:90},{p:'RB',x:82,y:74},{p:'CB',x:63,y:76},{p:'CB',x:37,y:76},{p:'LB',x:18,y:74},{p:'CDM',x:63,y:58},{p:'CDM',x:37,y:58},{p:'RW',x:80,y:38},{p:'CAM',x:50,y:38},{p:'LW',x:20,y:38},{p:'ST',x:50,y:18}],
    '4-4-2':   [{p:'GK',x:50,y:90},{p:'RB',x:82,y:74},{p:'CB',x:63,y:76},{p:'CB',x:37,y:76},{p:'LB',x:18,y:74},{p:'RM',x:82,y:52},{p:'CM',x:63,y:52},{p:'CM',x:37,y:52},{p:'LM',x:18,y:52},{p:'ST',x:65,y:22},{p:'ST',x:35,y:22}],
    '4-1-2-1-2':[{p:'GK',x:50,y:90},{p:'RB',x:82,y:74},{p:'CB',x:63,y:76},{p:'CB',x:37,y:76},{p:'LB',x:18,y:74},{p:'CDM',x:50,y:60},{p:'CM',x:70,y:46},{p:'CM',x:30,y:46},{p:'CAM',x:50,y:34},{p:'ST',x:65,y:20},{p:'ST',x:35,y:20}],
    '4-3-2-1': [{p:'GK',x:50,y:90},{p:'RB',x:82,y:74},{p:'CB',x:63,y:76},{p:'CB',x:37,y:76},{p:'LB',x:18,y:74},{p:'CM',x:70,y:55},{p:'CDM',x:50,y:58},{p:'CM',x:30,y:55},{p:'RW',x:72,y:35},{p:'LW',x:28,y:35},{p:'ST',x:50,y:20}],
    '4-5-1':   [{p:'GK',x:50,y:90},{p:'RB',x:82,y:74},{p:'CB',x:63,y:76},{p:'CB',x:37,y:76},{p:'LB',x:18,y:74},{p:'RM',x:82,y:52},{p:'CM',x:66,y:52},{p:'CM',x:50,y:52},{p:'CM',x:34,y:52},{p:'LM',x:18,y:52},{p:'ST',x:50,y:20}],
    '4-4-1-1': [{p:'GK',x:50,y:90},{p:'RB',x:82,y:74},{p:'CB',x:63,y:76},{p:'CB',x:37,y:76},{p:'LB',x:18,y:74},{p:'RM',x:82,y:52},{p:'CM',x:63,y:52},{p:'CM',x:37,y:52},{p:'LM',x:18,y:52},{p:'CAM',x:50,y:34},{p:'ST',x:50,y:20}],
    '4-1-4-1': [{p:'GK',x:50,y:90},{p:'RB',x:82,y:74},{p:'CB',x:63,y:76},{p:'CB',x:37,y:76},{p:'LB',x:18,y:74},{p:'CDM',x:50,y:60},{p:'RM',x:82,y:44},{p:'CM',x:63,y:44},{p:'CM',x:37,y:44},{p:'LM',x:18,y:44},{p:'ST',x:50,y:20}],
    '5-3-2':   [{p:'GK',x:50,y:90},{p:'RB',x:88,y:74},{p:'CB',x:70,y:76},{p:'CB',x:50,y:78},{p:'CB',x:30,y:76},{p:'LB',x:12,y:74},{p:'CM',x:68,y:52},{p:'CDM',x:50,y:55},{p:'CM',x:32,y:52},{p:'ST',x:65,y:22},{p:'ST',x:35,y:22}],
    '5-4-1':   [{p:'GK',x:50,y:90},{p:'RB',x:88,y:74},{p:'CB',x:70,y:76},{p:'CB',x:50,y:78},{p:'CB',x:30,y:76},{p:'LB',x:12,y:74},{p:'RM',x:82,y:52},{p:'CM',x:63,y:52},{p:'CM',x:37,y:52},{p:'LM',x:18,y:52},{p:'ST',x:50,y:20}],
    '5-2-3':   [{p:'GK',x:50,y:90},{p:'RB',x:88,y:74},{p:'CB',x:70,y:76},{p:'CB',x:50,y:78},{p:'CB',x:30,y:76},{p:'LB',x:12,y:74},{p:'CM',x:63,y:52},{p:'CM',x:37,y:52},{p:'RW',x:80,y:28},{p:'ST',x:50,y:20},{p:'LW',x:20,y:28}],
  };

  const SLOT_POS_MAP = { GK:['GK'], RB:['RB'], LB:['LB'], CB:['CB'], RM:['RM','CM'], LM:['LM','CM'], CDM:['CDM','CM'], CM:['CM','CDM','CAM'], CAM:['CAM','CM'], RW:['RW','CAM','LW'], LW:['LW','CAM','RW'], ST:['ST','CF','LW','RW'] };
  const SWAP_POS_MAP = { GK:['GK'], RB:['RB','LB'], LB:['LB','RB'], CB:['CB'], RM:['RM','CM','CAM'], LM:['LM','CM','CAM'], CDM:['CDM','CM'], CM:['CM','CDM','CAM'], CAM:['CAM','CM','RW','LW'], RW:['RW','CAM','LW'], LW:['LW','CAM','RW'], ST:['ST','CF','LW','RW','CAM'] };

  let loaded = $state(false);
  let players = $state([]);
  let formation = $state('4-3-3');
  let mentality = $state('balanced');
  let savedLineup = $state([]);
  let formationOpen = $state(false);
  let mentalityOpen = $state(false);
  let swapSlotIdx = $state(null);
  let swapPreselectId = $state(null);

  async function load() {
    await openDB();
    const save = await getSave();
    if (!save || save._deleted) return;
    players = await getPlayersByTeam(save.userTeamId);
    formation = save.formation ?? '4-3-3';
    savedLineup = save.lineup ?? [];
    mentality = save.mentality ?? 'balanced';
    loaded = true;
  }

  $effect(() => {
    void screenTicks.tactics;
    load();
  });

  const curMentObj = $derived(MENTALITIES.find(m => m.id === mentality) ?? MENTALITIES[1]);
  const slots = $derived(SLOT_LAYOUT[formation] ?? SLOT_LAYOUT['4-3-3']);

  const assignment = $derived.by(() => {
    const avail = players.filter(p => !p.injured && !p.suspended).sort((a, b) => primaryRating(b) - primaryRating(a));
    const out = new Array(slots.length).fill(null);
    const usedIds = [];
    const use = (id) => usedIds.push(id);
    const isUsed = (id) => usedIds.includes(id);
    if (savedLineup.length === 11) {
      savedLineup.forEach((pid, i) => {
        const pl = players.find(p => p.id === pid);
        if (pl) { out[i] = pl; use(pl.id); }
      });
      return out;
    }
    slots.forEach((slot, i) => {
      const acceptable = SLOT_POS_MAP[slot.p] ?? [slot.p];
      const cand = avail.find(p => !isUsed(p.id) && acceptable.includes(p.position));
      if (cand) { out[i] = cand; use(cand.id); }
    });
    slots.forEach((slot, i) => {
      if (out[i]) return;
      const cand = avail.find(p => !isUsed(p.id) && p.position !== 'GK');
      if (cand) { out[i] = cand; use(cand.id); }
    });
    return out;
  });

  const bench = $derived(
    players
      .filter(p => !p.injured && !p.suspended && !assignment.some(a => a?.id === p.id))
      .sort((a, b) => primaryRating(b) - primaryRating(a))
      .slice(0, 12)
  );

  const formationGroups = $derived([
    { label: '3 at the back', formations: Object.keys(FORMATIONS).filter(f => f.startsWith('3-')) },
    { label: '4 at the back', formations: Object.keys(FORMATIONS).filter(f => f.startsWith('4-')) },
    { label: '5 at the back', formations: Object.keys(FORMATIONS).filter(f => f.startsWith('5-')) },
  ]);

  async function pickFormation(f) {
    formationOpen = false;
    const sv = await getSave();
    await putSave({ ...sv, formation: f, lineup: null });
    screenTicks.tactics++;
  }
  async function pickMentality(m) {
    mentalityOpen = false;
    const sv = await getSave();
    await putSave({ ...sv, mentality: m.id });
    toast(`Mentality: ${m.fullLabel}`, 'info', 2000);
    screenTicks.tactics++;
  }

  function fitnessColor(fit) {
    return fit >= 75 ? 'var(--color-live)' : fit >= 50 ? 'var(--color-warn)' : 'var(--color-bad)';
  }

  function openSlotSwap(idx) { swapSlotIdx = idx; swapPreselectId = null; }
  function openBenchSwap(benchPlayer) {
    let bestIdx = 0, bestScore = -1;
    slots.forEach((slot, i) => {
      const acceptable = SWAP_POS_MAP[slot.p] ?? [slot.p];
      const isNatural = acceptable.includes(benchPlayer.position);
      const isEmpty = !assignment[i];
      const score = (isNatural ? 2 : 0) + (isEmpty ? 1 : 0);
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    });
    swapSlotIdx = bestIdx;
    swapPreselectId = benchPlayer.id;
  }
  function closeSwap() { swapSlotIdx = null; swapPreselectId = null; }

  const swapSections = $derived.by(() => {
    if (swapSlotIdx === null) return null;
    const slot = slots[swapSlotIdx];
    const currentPlayer = assignment[swapSlotIdx];
    const naturalPositions = SWAP_POS_MAP[slot.p] ?? [slot.p];
    const slotGroup = posGroup(slot.p);
    const candidates = players.filter(p => !p.injured && !p.suspended && p.id !== currentPlayer?.id);

    const naturalFit = [], versatile = [], outOfPos = [];
    candidates.forEach(p => {
      const isInXI = assignment.some((ap, i) => ap?.id === p.id && i !== swapSlotIdx);
      const isNatural = naturalPositions.includes(p.position);
      const pGroup = posGroup(p.position);
      const entry = { player: p, isInXI, isNatural };
      if (isNatural) naturalFit.push(entry);
      else if (pGroup === slotGroup || (slotGroup === 'MID' && pGroup === 'ATT') || (slotGroup === 'ATT' && pGroup === 'MID')) versatile.push(entry);
      else outOfPos.push(entry);
    });
    const sortGroup = arr => arr.sort((a, b) => (a.isInXI !== b.isInXI ? (a.isInXI ? 1 : -1) : primaryRating(b.player) - primaryRating(a.player)));
    sortGroup(naturalFit); sortGroup(versatile); sortGroup(outOfPos);

    return { slot, currentPlayer, naturalFit, versatile, outOfPos };
  });

  async function applySwap(newPlayer) {
    const idx = swapSlotIdx;
    const currentPlayer = assignment[idx];
    closeSwap();
    const otherIdx = assignment.findIndex((ap, i) => ap?.id === newPlayer.id && i !== idx);
    const newAssignment = [...assignment];
    newAssignment[idx] = newPlayer;
    if (otherIdx >= 0) newAssignment[otherIdx] = currentPlayer ?? null;

    const sv = await getSave();
    const lineup = newAssignment.filter(Boolean).map(p => p.id);
    await putSave({ ...sv, lineup, formation });
    toast(`${newPlayer.name} → ${slots[idx].p} slot`, 'success', 2000);
    screenTicks.tactics++;
  }
</script>

<svelte:window onclick={(e) => { if (!e.target.closest?.('.tac-dropdown')) { formationOpen = false; mentalityOpen = false; } }} />

<div class="tactics-screen">
  {#if !loaded}
    <div class="tac-empty">Loading…</div>
  {:else}
    <div class="tac-controls">
      <div class="tac-dd-half">
        <div class="tac-dd-label">Formation</div>
        <div class="tac-dropdown">
          <button class="tac-dd-btn" onclick={() => { mentalityOpen = false; formationOpen = !formationOpen; }}>
            <span class="tac-dd-val">{formation}</span>
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
        <div class="tac-dd-label">Mentality</div>
        <div class="tac-dropdown">
          <button class="tac-dd-btn" onclick={() => { formationOpen = false; mentalityOpen = !mentalityOpen; }}>
            <span class="m-pill-tag">{curMentObj.label}</span>
            <span class="tac-dd-val">{curMentObj.fullLabel}</span>
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
            <button class="pitch-slot" style="left:{slot.x}%;top:{slot.y}%" onclick={() => openSlotSwap(i)} aria-label="{slot.p} slot">
              <div class="slot-inner pos-{g} {!pl ? 'pos-empty' : ''} {pl?.injured ? 'slot-injured' : ''}">
                {#if pl}
                  <div class="slot-rating">{primaryRating(pl)}</div>
                  <div class="slot-pos">{pl.position}</div>
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

    <div class="tac-bench-strip">
      <div class="tac-bench-label">Bench</div>
      <div class="tac-bench-players">
        {#each bench as p (p.id)}
          {@const g = posGroup(p.position)}
          {@const fit = Math.round(p.fitness ?? 90)}
          <button class="tac-bench-card" onclick={() => openBenchSwap(p)} title="{p.name} · {p.position} · {primaryRating(p)}">
            <div class="tac-bench-avatar pos-{g}">{p.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}</div>
            <div class="tac-bench-pos">{p.position}</div>
            <div class="tac-bench-name">{p.name.split(' ').slice(-1)[0]}</div>
            <div class="tac-bench-rat">{primaryRating(p)}</div>
            <div class="tac-bench-fit" style="color:{fitnessColor(fit)}">{fit}%</div>
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>

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
      <div class="swap-current">
        <span class="pos-badge pos-{posGroup(cp.position)}">{cp.position}</span>
        <div>
          <div class="swap-current-name">{cp.name}</div>
          <div class="swap-current-meta">Current · Rating {primaryRating(cp)} · Fitness {Math.round(cp.fitness ?? 90)}%</div>
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
            <button class="swap-row {entry.isInXI ? 'dimmed' : ''} {swapPreselectId === p.id ? 'swap-presel' : ''}" onclick={() => applySwap(p)}>
              <span class="pos-badge pos-{posGroup(p.position)}">{p.position}</span>
              <span class="swap-row-info">
                <span class="swap-row-name">{p.name}</span>
                <span class="swap-row-meta">Age {p.age}{#if p.goals}{' · ' + p.goals + 'G'}{/if}{#if p.assists}{' · ' + p.assists + 'A'}{/if}</span>
              </span>
              {#if entry.isInXI}<span class="swap-row-badge">IN XI</span>{/if}
              <span class="swap-row-fit" style="color:{fitnessColor(fit)}">{fit}%</span>
              <span class="swap-row-rat" style="color:{entry.isNatural ? 'var(--color-live)' : 'var(--color-tx-2)'}">{primaryRating(p)}</span>
            </button>
          {/each}
        {/if}
      {/each}
    </div>
  </div>
{/if}

<style>
  .tactics-screen { display: flex; flex-direction: column; flex: 1; min-height: 0; font-family: var(--font-body); color: var(--color-tx); }
  .tac-empty { color: var(--color-tx-3); font-size: 12px; padding: 24px; text-align: center; }

  .tac-controls { display: flex; gap: 10px; padding: 14px 16px; flex-shrink: 0; position: relative; z-index: 10; }
  .tac-dd-half { flex: 1; position: relative; }
  .tac-dd-label { font-family: var(--font-mono); font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--color-tx-3); margin-bottom: 4px; }
  .tac-dropdown { position: relative; }
  .tac-dd-btn {
    width: 100%; display: flex; align-items: center; gap: 8px;
    background: var(--color-surface); border: 1px solid var(--color-line); border-radius: 10px;
    padding: 10px 12px; min-height: 44px; color: var(--color-tx); cursor: pointer;
  }
  .tac-dd-val { flex: 1; text-align: left; font-family: var(--font-display); font-size: 15px; letter-spacing: 0.5px; }
  .tac-dd-arrow { color: var(--color-tx-3); transition: transform 0.15s; }
  .tac-dd-arrow.open { transform: rotate(180deg); }
  .m-pill-tag {
    font-family: var(--font-mono); font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 5px;
    background: var(--color-raised); color: var(--color-club); flex-shrink: 0;
  }
  .tac-dd-list {
    position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 50;
    background: var(--color-raised); border: 1px solid var(--color-line); border-radius: 10px;
    max-height: 320px; overflow-y: auto; padding: 4px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  }
  .tac-dd-group-hdr { font-family: var(--font-mono); font-size: 9px; letter-spacing: 1px; text-transform: uppercase; color: var(--color-tx-3); padding: 6px 8px 2px; }
  .tac-dd-option, .m-option {
    width: 100%; display: flex; align-items: center; gap: 8px; text-align: left;
    background: none; border: none; color: var(--color-tx); font-size: 12px;
    padding: 8px; border-radius: 7px; cursor: pointer; min-height: 36px;
  }
  .tac-dd-option:hover, .m-option:hover { background: var(--color-surface); }
  .tac-dd-option.tac-dd-active { color: var(--color-club); }
  .tac-dd-check { margin-left: auto; color: var(--color-club); }
  .m-dd-opt-info { display: flex; flex-direction: column; }
  .m-dd-opt-label { font-weight: 600; }
  .m-dd-opt-desc { font-size: 10px; color: var(--color-tx-3); }

  .tac-pitch-area { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 4px 12px; }
  .pitch-wrap { width: 100%; max-width: 420px; aspect-ratio: 68/100; margin: 0 auto; }
  .pitch-bg {
    position: relative; width: 100%; height: 100%;
    background: linear-gradient(180deg, #0d3a22, #0a2e1b);
    border: 2px solid rgba(255,255,255,0.18); border-radius: 8px; overflow: hidden;
  }
  .pitch-line.half { position: absolute; top: 50%; left: 0; right: 0; height: 1px; background: rgba(255,255,255,0.18); }
  .pitch-circle { position: absolute; top: 50%; left: 50%; width: 22%; aspect-ratio: 1; border: 1px solid rgba(255,255,255,0.18); border-radius: 50%; transform: translate(-50%, -50%); }
  .pitch-spot { position: absolute; width: 4px; height: 4px; border-radius: 50%; background: rgba(255,255,255,0.3); left: 50%; transform: translate(-50%, -50%); }
  .pitch-spot.mid { top: 50%; }
  .pitch-spot.top { top: 15%; }
  .pitch-spot.bot { top: 85%; }
  .pitch-box { position: absolute; left: 21%; width: 58%; height: 16%; border: 1px solid rgba(255,255,255,0.18); }
  .pitch-box.top { top: 0; border-top: none; }
  .pitch-box.bot { bottom: 0; border-bottom: none; }
  .pitch-six { position: absolute; left: 36%; width: 28%; height: 7%; border: 1px solid rgba(255,255,255,0.18); }
  .pitch-six.top { top: 0; border-top: none; }
  .pitch-six.bot { bottom: 0; border-bottom: none; }
  .pitch-arc { position: absolute; left: 36%; width: 28%; height: 6%; border: 1px solid rgba(255,255,255,0.18); border-radius: 0 0 50% 50% / 0 0 100% 100%; }
  .pitch-arc.top { top: 16%; border-top: none; }
  .pitch-arc.bot { bottom: 16%; border-radius: 50% 50% 0 0 / 100% 100% 0 0; border-bottom: none; }

  .pitch-slot {
    position: absolute; transform: translate(-50%, -50%);
    display: flex; flex-direction: column; align-items: center; gap: 2px;
    background: none; border: none; cursor: pointer; padding: 0;
  }
  .slot-inner {
    width: 40px; height: 40px; border-radius: 50%;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    border: 2px solid; background: var(--color-surface);
  }
  .slot-inner.pos-GK { border-color: #7c83e8; }
  .slot-inner.pos-DEF { border-color: var(--color-live); }
  .slot-inner.pos-MID { border-color: var(--color-warn); }
  .slot-inner.pos-ATT { border-color: var(--color-bad); }
  .slot-inner.pos-empty { border-color: var(--color-line); border-style: dashed; background: rgba(255,255,255,0.04); }
  .slot-inner.slot-injured { box-shadow: 0 0 0 2px var(--color-bad); }
  .slot-rating { font-family: var(--font-display); font-size: 15px; line-height: 1; color: var(--color-tx); }
  .slot-pos { font-family: var(--font-mono); font-size: 8px; color: var(--color-tx-2); }
  .slot-empty-lbl { color: var(--color-tx-3); font-size: 9px; }
  .slot-inj-tag { position: absolute; top: -6px; font-size: 7px; font-family: var(--font-mono); font-weight: 700; color: var(--color-bad); background: var(--color-surface); padding: 0 3px; border-radius: 3px; }
  .slot-name { font-size: 9px; color: var(--color-tx); background: rgba(0,0,0,0.55); padding: 1px 5px; border-radius: 4px; white-space: nowrap; max-width: 70px; overflow: hidden; text-overflow: ellipsis; }

  .tac-bench-strip { flex-shrink: 0; padding: 10px 16px calc(14px + env(safe-area-inset-bottom)); }
  .tac-bench-label { font-family: var(--font-mono); font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--color-tx-3); margin-bottom: 8px; }
  .tac-bench-players { display: flex; gap: 8px; overflow-x: auto; overscroll-behavior: contain; padding-bottom: 4px; }
  .tac-bench-card {
    flex-shrink: 0; width: 62px; display: flex; flex-direction: column; align-items: center; gap: 3px;
    background: var(--color-surface); border: 1px solid var(--color-line); border-radius: 10px; padding: 8px 4px;
    cursor: pointer; color: var(--color-tx);
  }
  .tac-bench-avatar {
    width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    font-family: var(--font-mono); font-size: 10px; font-weight: 700; border: 1px solid; background: var(--color-raised);
  }
  .tac-bench-avatar.pos-GK { color: #7c83e8; border-color: #7c83e8; }
  .tac-bench-avatar.pos-DEF { color: var(--color-live); border-color: var(--color-live); }
  .tac-bench-avatar.pos-MID { color: var(--color-warn); border-color: var(--color-warn); }
  .tac-bench-avatar.pos-ATT { color: var(--color-bad); border-color: var(--color-bad); }
  .tac-bench-pos { font-size: 8px; color: var(--color-tx-3); font-family: var(--font-mono); }
  .tac-bench-name { font-size: 9px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 56px; }
  .tac-bench-rat { font-family: var(--font-display); font-size: 13px; }
  .tac-bench-fit { font-size: 8px; font-family: var(--font-mono); }

  .pos-badge {
    font-family: var(--font-mono); font-size: 10px; font-weight: 700; letter-spacing: 0.5px;
    padding: 2px 6px; border-radius: 5px; flex-shrink: 0;
    background: var(--color-raised); color: var(--color-tx-2); border: 1px solid var(--color-line);
  }
  .pos-badge.pos-GK { color: #7c83e8; }
  .pos-badge.pos-DEF { color: var(--color-live); }
  .pos-badge.pos-MID { color: var(--color-warn); }
  .pos-badge.pos-ATT { color: var(--color-bad); }

  /* ── Bottom sheet (swap picker) ───────────────────────────── */
  .sheet-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 900; animation: fade-in 0.2s ease; border: none; padding: 0; cursor: default; }
  .sheet {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 901;
    max-height: 80dvh; display: flex; flex-direction: column;
    background: var(--color-surface); border: 1px solid var(--color-line); border-bottom: none;
    border-radius: 18px 18px 0 0; padding: 10px 18px calc(16px + env(safe-area-inset-bottom));
    animation: slide-up 0.22s ease; font-family: var(--font-body); color: var(--color-tx);
  }
  @media (prefers-reduced-motion: reduce) { .sheet-backdrop, .sheet { animation: none; } }
  @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes slide-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
  .sheet-handle { width: 36px; height: 4px; border-radius: 2px; background: var(--color-line); margin: 4px auto 12px; flex-shrink: 0; }
  .swap-hdr { display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; margin-bottom: 10px; }
  .swap-title { font-family: var(--font-display); font-size: 17px; letter-spacing: 0.5px; }
  .sheet-close { width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--color-line); background: var(--color-raised); color: var(--color-tx-2); cursor: pointer; font-size: 14px; flex-shrink: 0; }
  .swap-current { display: flex; align-items: center; gap: 10px; padding: 8px; background: var(--color-raised); border-radius: 10px; margin-bottom: 8px; flex-shrink: 0; }
  .swap-current-name { font-size: 13px; font-weight: 600; }
  .swap-current-meta { font-size: 10px; color: var(--color-tx-3); }
  .swap-list { overflow-y: auto; overscroll-behavior: contain; }
  .swap-section-hdr { font-family: var(--font-mono); font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--color-tx-3); padding: 10px 4px 4px; }
  .swap-row {
    width: 100%; display: flex; align-items: center; gap: 10px; text-align: left;
    background: none; border: 1px solid transparent; border-radius: 10px; padding: 8px; cursor: pointer;
    color: var(--color-tx); min-height: 44px;
  }
  .swap-row:hover { background: var(--color-raised); }
  .swap-row.dimmed { opacity: 0.55; }
  .swap-row.swap-presel { border-color: var(--color-club); }
  .swap-row-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .swap-row-name { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .swap-row-meta { font-size: 10px; color: var(--color-tx-3); }
  .swap-row-badge { font-size: 9px; font-family: var(--font-mono); color: var(--color-tx-3); background: var(--color-raised); padding: 1px 5px; border-radius: 4px; flex-shrink: 0; }
  .swap-row-fit { font-family: var(--font-mono); font-size: 11px; flex-shrink: 0; }
  .swap-row-rat { font-family: var(--font-display); font-size: 15px; min-width: 24px; text-align: right; flex-shrink: 0; }
</style>
