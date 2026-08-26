<script>
  import { getPlayersByTeam, getSave, getTeam, putPlayer, openDB } from '../../modules/db.js';
  import { primaryRating } from '../../modules/matchEngine.js';
  import { formAdjustedValue } from '../../modules/transfers.js';
  import { getPotentialLabel, getPotentialStars } from '../../modules/potential.js';
  import { fmt, formLabel, navigateTo, posGroup, toast } from '../../ui/helpers.js';
  import { screenTicks } from '../state/screens.svelte.js';

  const GROUP_LABELS = { GK: 'Goalkeepers', DEF: 'Defenders', MID: 'Midfielders', FWD: 'Forwards' };
  const GROUP_POS = { GK: ['GK'], DEF: ['CB', 'RB', 'LB'], MID: ['CM', 'CDM', 'CAM', 'RM', 'LM'], FWD: ['ST', 'CF', 'RW', 'LW'] };
  const POT_COLORS = ['', '#8a9ab0', 'var(--color-live)', '#3b82f6', 'var(--color-warn)', 'var(--color-bad)'];

  let loaded = $state(false);
  let team = $state(null);
  let players = $state([]);
  let sheetPlayer = $state(null);

  async function load() {
    await openDB();
    const save = await getSave();
    if (!save || save._deleted) return;
    team = await getTeam(save.userTeamId);
    players = await getPlayersByTeam(save.userTeamId);
    loaded = true;
    // Keep the open sheet's data fresh after a mutation instead of closing it.
    if (sheetPlayer) sheetPlayer = players.find(p => p.id === sheetPlayer.id) ?? null;
  }

  $effect(() => {
    void screenTicks.squad;
    load();
  });

  const groups = $derived(
    Object.entries(GROUP_POS)
      .map(([key, positions]) => ({
        key,
        label: GROUP_LABELS[key],
        players: players.filter(p => positions.includes(p.position)).sort((a, b) => primaryRating(b) - primaryRating(a)),
      }))
      .filter(g => g.players.length > 0)
  );

  function ratingColor(val) {
    return val >= 80 ? 'var(--color-live)' : val >= 65 ? 'var(--color-club)' : val >= 50 ? 'var(--color-tx)' : 'var(--color-bad)';
  }
  function fitnessColor(fit) {
    return fit >= 75 ? 'var(--color-live)' : fit >= 50 ? 'var(--color-warn)' : 'var(--color-bad)';
  }

  async function toggleSquad(p) {
    const inSquad = p.inSquad !== false;
    await putPlayer({ ...p, inSquad: !inSquad });
    toast(`${p.name} ${inSquad ? 'excluded from' : 'added to'} squad`, 'info', 2000);
    screenTicks.squad++;
  }
  async function toggleListed(p) {
    const isListed = p.transferListed === true;
    await putPlayer({ ...p, transferListed: !isListed });
    toast(isListed ? `${p.name} removed from transfer list` : `${p.name} listed — AI clubs will bid`, isListed ? 'info' : 'success', 3000);
    screenTicks.squad++;
  }

  function openSheet(p) { sheetPlayer = p; }
  function closeSheet() { sheetPlayer = null; }

  const sheetAttrs = $derived.by(() => {
    const p = sheetPlayer;
    if (!p) return [];
    const isGK = p.position === 'GK';
    const g = posGroup(p.position);
    if (isGK) return [
      { label: 'Goalkeeping', val: p.goalkeeping, primary: true },
      { label: 'Defence', val: p.defence, primary: false },
      { label: 'Midfield', val: p.midfield, primary: false },
      { label: 'Attack', val: p.attack, primary: false },
    ];
    if (g === 'DEF') return [
      { label: 'Defence', val: p.defence, primary: true },
      { label: 'Midfield', val: p.midfield, primary: false },
      { label: 'Attack', val: p.attack, primary: false },
    ];
    if (g === 'MID') return [
      { label: 'Midfield', val: p.midfield, primary: true },
      { label: 'Attack', val: p.attack, primary: false },
      { label: 'Defence', val: p.defence, primary: false },
    ];
    return [
      { label: 'Attack', val: p.attack, primary: true },
      { label: 'Midfield', val: p.midfield, primary: false },
      { label: 'Defence', val: p.defence, primary: false },
    ];
  });

  const sheetStats = $derived.by(() => {
    const p = sheetPlayer;
    if (!p) return [];
    const isGK = p.position === 'GK';
    const isDEF = posGroup(p.position) === 'DEF';
    const out = [];
    if (!isGK) out.push({ label: 'Goals', val: p.goals ?? 0 });
    if (!isGK) out.push({ label: 'Assists', val: p.assists ?? 0 });
    if (isGK || isDEF) out.push({ label: 'Clean Sheets', val: p.cleanSheets ?? 0 });
    return out;
  });
</script>

<div class="squad-screen">
  <div class="sq-hdr">
    <div>
      <div class="sq-eyebrow">Squad Management</div>
      <div class="sq-title">My Squad</div>
    </div>
    <div class="sq-hdr-right">
      {#if team}
        <div class="sq-team-name">{team.name}</div>
        <div class="sq-team-count">{players.length} registered</div>
      {/if}
      <button class="quick-btn" onclick={() => navigateTo('tactics')}>Tactics</button>
    </div>
  </div>

  {#if !loaded}
    <div class="sq-empty">Loading…</div>
  {:else}
    <div class="sq-scroll">
      {#each groups as group (group.key)}
        <div class="sq-group">
          <div class="sq-group-hdr">
            <span>{group.label}</span>
            <span class="sq-group-count">{group.players.length}</span>
          </div>
          {#each group.players as p (p.id)}
            {@const inSquad = p.inSquad !== false}
            {@const isListed = p.transferListed === true}
            {@const r = primaryRating(p)}
            {@const fitness = Math.round(p.fitness ?? 90)}
            {@const potStars = getPotentialStars ? getPotentialStars(p) : 0}
            <div
              class="player-row {p.injured ? 'is-injured' : ''} {!inSquad ? 'is-excluded' : ''}"
              role="button"
              tabindex="0"
              onclick={() => openSheet(p)}
              onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSheet(p); } }}
            >
              <div class="row-rating" style="color:{ratingColor(r)}">{r}</div>
              <div class="row-main">
                <div class="row-name-line">
                  <span class="pos-badge pos-{group.key}">{p.position}</span>
                  <span class="row-name">{p.name}</span>
                  {#if p.injured}<span class="sq-inj-badge">INJ</span>{/if}
                  {#if isListed}<span class="sq-listed-badge">TL</span>{/if}
                  {#if p.isWonderkid}<span class="wk-star" title="Wonderkid">★</span>{/if}
                </div>
                <div class="row-meta-line">
                  <span>Age {p.age}</span>
                  <span style="color:{fitnessColor(fitness)}">{fitness}% fit</span>
                  {#if potStars}<span class="pot-stars" style="color:{POT_COLORS[potStars]}">{'★'.repeat(potStars)}</span>{/if}
                </div>
              </div>
              <div class="row-value">{fmt.money(formAdjustedValue ? formAdjustedValue(p) : p.value)}</div>
              <div class="row-actions">
                <button class="chip {inSquad ? 'chip-on' : 'chip-off'}" onclick={(e) => { e.stopPropagation(); toggleSquad(p); }}>
                  {inSquad ? 'Active' : 'Excl'}
                </button>
                <button class="chip {isListed ? 'chip-listed' : ''}" onclick={(e) => { e.stopPropagation(); toggleListed(p); }}>
                  {isListed ? 'Unlist' : 'List'}
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if sheetPlayer}
  {@const p = sheetPlayer}
  {@const inSquad = p.inSquad !== false}
  {@const isListed = p.transferListed === true}
  {@const r = primaryRating(p)}
  {@const fitness = Math.round(p.fitness ?? 90)}
  {@const fl = formLabel(p)}
  {@const potStars = getPotentialStars ? getPotentialStars(p) : 0}
  {@const potLabel = getPotentialLabel ? getPotentialLabel(p) : ''}
  <button class="sheet-backdrop" onclick={closeSheet} aria-label="Close"></button>
  <div class="sheet">
    <div class="sheet-handle"></div>
    <div class="sheet-hdr">
      <div class="sheet-rating" style="color:{ratingColor(r)}">{r}</div>
      <div class="sheet-hdr-info">
        <div class="sheet-name">{p.name}</div>
        <div class="sheet-badges">
          <span class="pos-badge pos-{posGroup(p.position)}">{p.position}</span>
          <span class="sheet-age">Age {p.age}</span>
          <span class="form-badge form-{fl.cls}">{fl.text}</span>
          {#if p.isWonderkid}<span class="sq-wonderkid-tag">WONDERKID</span>{/if}
          {#if p.injured}<span class="sq-inj-badge">INJURED</span>{/if}
        </div>
        {#if potStars}
          <div class="pot-line" style="color:{POT_COLORS[potStars]}">
            {'★'.repeat(potStars)}{'☆'.repeat(5 - potStars)} <span class="pot-label">{potLabel}</span>
          </div>
        {/if}
      </div>
      <button class="sheet-close" onclick={closeSheet} aria-label="Close">✕</button>
    </div>

    <div class="sheet-facts">
      <div class="fact"><span>Form Value</span><strong>{fmt.money(formAdjustedValue ? formAdjustedValue(p) : p.value)}</strong></div>
      <div class="fact"><span>Wage</span><strong>{fmt.wage(p.wage)}</strong></div>
      <div class="fact"><span>Fitness</span><strong style="color:{fitnessColor(fitness)}">{fitness}%</strong></div>
      <div class="fact"><span>Peak Age</span><strong>{p.peakAge ?? '—'}</strong></div>
      {#if p.purchasedFor}<div class="fact"><span>Paid</span><strong>{fmt.money(p.purchasedFor)}</strong></div>{/if}
    </div>

    {#if sheetStats.length}
      <div class="sheet-stats">
        {#each sheetStats as s (s.label)}
          <div class="stat-box"><div class="stat-lbl">{s.label}</div><div class="stat-val">{s.val}</div></div>
        {/each}
      </div>
    {/if}

    <div class="sheet-attrs">
      <div class="attrs-title">Attributes</div>
      {#each sheetAttrs as a (a.label)}
        <div class="attr-row">
          <div class="attr-lbl">{a.label}</div>
          <div class="attr-bar-track"><div class="attr-bar" class:primary={a.primary} style="width:{Math.round((a.val / 99) * 100)}%"></div></div>
          <div class="attr-val" style={a.primary ? 'color:var(--color-live)' : ''}>{a.val}</div>
        </div>
      {/each}
    </div>

    <div class="sheet-actions">
      <button class="btn-full {inSquad ? 'btn-warn' : 'btn-primary'}" onclick={() => toggleSquad(p)}>
        {inSquad ? 'Exclude from Squad' : 'Add to Squad'}
      </button>
      <button class="btn-full btn-secondary" onclick={() => toggleListed(p)}>
        {isListed ? 'Remove from List' : 'List for Transfer'}
      </button>
    </div>
  </div>
{/if}

<style>
  .squad-screen {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    font-family: var(--font-body);
    color: var(--color-tx);
  }

  .sq-hdr { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 18px 16px 12px; flex-shrink: 0; }
  .sq-eyebrow { font-family: var(--font-mono); font-size: 10px; letter-spacing: 3px; text-transform: uppercase; color: var(--color-club); margin-bottom: 3px; }
  .sq-title { font-family: var(--font-display); font-size: clamp(22px, 5vw, 28px); letter-spacing: 1px; line-height: 1; }
  .sq-hdr-right { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
  .sq-team-name { font-family: var(--font-display); font-size: 14px; letter-spacing: 0.5px; }
  .sq-team-count { font-size: 10px; color: var(--color-tx-3); }
  .quick-btn { padding: 7px 12px; border-radius: 8px; border: 1px solid var(--color-line); background: var(--color-surface); color: var(--color-tx-2); font-size: 11px; font-weight: 600; cursor: pointer; min-height: 44px; }
  .quick-btn:hover { color: var(--color-tx); background: var(--color-raised); }

  .sq-empty { color: var(--color-tx-3); font-size: 12px; padding: 24px; text-align: center; }

  .sq-scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 16px 24px; }

  .sq-group { margin-bottom: 14px; }
  .sq-group-hdr {
    display: flex; justify-content: space-between; align-items: center;
    font-family: var(--font-mono); font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase;
    color: var(--color-tx-3); padding: 8px 4px;
  }
  .sq-group-count { font-family: var(--font-mono); }

  .player-row {
    display: flex; align-items: center; gap: 12px;
    background: var(--color-surface);
    border: 1px solid var(--color-line);
    border-radius: 12px;
    padding: 10px 12px;
    margin-bottom: 6px;
    cursor: pointer;
    min-height: 44px;
  }
  .player-row:hover { background: var(--color-raised); }
  .player-row.is-injured { border-color: color-mix(in oklch, var(--color-bad) 40%, var(--color-line)); }
  .player-row.is-excluded { opacity: 0.55; }

  .row-rating { font-family: var(--font-display); font-size: 26px; line-height: 1; min-width: 34px; text-align: center; flex-shrink: 0; }

  .row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .row-name-line { line-height: 1.5; word-break: break-word; }
  .row-name { font-size: 14px; font-weight: 600; vertical-align: middle; }
  .row-meta-line { display: flex; align-items: center; gap: 10px; font-size: 11px; color: var(--color-tx-2); font-family: var(--font-mono); }

  .pos-badge {
    display: inline-block; vertical-align: middle; margin-right: 6px;
    font-family: var(--font-mono); font-size: 10px; font-weight: 700; letter-spacing: 0.5px;
    padding: 2px 6px; border-radius: 5px; flex-shrink: 0;
    background: var(--color-raised); color: var(--color-tx-2); border: 1px solid var(--color-line);
  }
  .pos-badge.pos-GK { color: #7c83e8; }
  .pos-badge.pos-DEF { color: var(--color-live); }
  .pos-badge.pos-MID { color: var(--color-warn); }
  .pos-badge.pos-FWD { color: var(--color-bad); }

  .sq-inj-badge, .sq-listed-badge, .sq-wonderkid-tag {
    display: inline-block; vertical-align: middle;
    font-size: 9px; font-family: var(--font-mono); font-weight: 700; padding: 1px 5px; border-radius: 4px; flex-shrink: 0;
  }
  .sq-inj-badge { background: color-mix(in oklch, var(--color-bad) 20%, transparent); color: var(--color-bad); }
  .sq-listed-badge { background: color-mix(in oklch, var(--color-warn) 20%, transparent); color: var(--color-warn); }
  .sq-wonderkid-tag { background: linear-gradient(135deg, var(--color-warn), var(--color-bad)); color: #14171c; }
  .wk-star { display: inline-block; vertical-align: middle; color: var(--color-warn); font-size: 11px; }
  .pot-stars { font-size: 10px; }
  .row-name-line .sq-inj-badge, .row-name-line .sq-listed-badge, .row-name-line .wk-star { margin-left: 6px; }

  .row-value { font-family: var(--font-mono); font-size: 12px; color: var(--color-tx-2); text-align: right; flex-shrink: 0; min-width: 54px; }

  .row-actions { display: flex; flex-direction: column; gap: 4px; flex-shrink: 0; }
  .chip {
    font-family: var(--font-body); font-size: 10px; font-weight: 600;
    padding: 5px 9px; border-radius: 7px; min-height: 26px;
    border: 1px solid var(--color-line); background: var(--color-raised); color: var(--color-tx-2);
    cursor: pointer; white-space: nowrap;
  }
  .chip-on { color: var(--color-live); border-color: color-mix(in oklch, var(--color-live) 40%, var(--color-line)); }
  .chip-off { color: var(--color-tx-3); }
  .chip-listed { color: var(--color-warn); border-color: color-mix(in oklch, var(--color-warn) 40%, var(--color-line)); }

  /* ── Bottom sheet ─────────────────────────────────────────── */
  .sheet-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,0.6);
    z-index: 900; animation: fade-in 0.2s ease;
    border: none; padding: 0; cursor: default;
  }
  .sheet {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 901;
    max-height: 86dvh; overflow-y: auto; overscroll-behavior: contain;
    background: var(--color-surface);
    border: 1px solid var(--color-line);
    border-bottom: none;
    border-radius: 18px 18px 0 0;
    padding: 10px 18px calc(20px + env(safe-area-inset-bottom));
    animation: slide-up 0.22s ease;
    font-family: var(--font-body);
    color: var(--color-tx);
  }
  @media (prefers-reduced-motion: reduce) { .sheet-backdrop, .sheet { animation: none; } }
  @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes slide-up { from { transform: translateY(100%); } to { transform: translateY(0); } }

  .sheet-handle { width: 36px; height: 4px; border-radius: 2px; background: var(--color-line); margin: 4px auto 14px; }

  .sheet-hdr { display: flex; align-items: flex-start; gap: 14px; padding-bottom: 14px; border-bottom: 1px solid var(--color-line); }
  .sheet-rating { font-family: var(--font-display); font-size: 40px; line-height: 1; flex-shrink: 0; }
  .sheet-hdr-info { flex: 1; min-width: 0; }
  .sheet-name { font-family: var(--font-display); font-size: 19px; letter-spacing: 0.5px; margin-bottom: 6px; }
  .sheet-badges { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .sheet-age { font-size: 11px; color: var(--color-tx-2); }
  .form-badge { font-size: 10px; font-family: var(--font-mono); padding: 1px 6px; border-radius: 5px; }
  .form-badge.form-hot { background: color-mix(in oklch, var(--color-bad) 18%, transparent); color: var(--color-bad); }
  .form-badge.form-good { background: color-mix(in oklch, var(--color-live) 18%, transparent); color: var(--color-live); }
  .form-badge.form-avg { background: var(--color-raised); color: var(--color-tx-2); }
  .pot-line { font-size: 11px; margin-top: 6px; }
  .pot-label { color: var(--color-tx-2); font-size: 10px; }
  .sheet-close {
    width: 32px; height: 32px; flex-shrink: 0; border-radius: 8px;
    border: 1px solid var(--color-line); background: var(--color-raised); color: var(--color-tx-2);
    cursor: pointer; font-size: 14px;
  }

  .sheet-facts { display: flex; flex-wrap: wrap; gap: 10px 18px; padding: 14px 0; border-bottom: 1px solid var(--color-line); }
  .fact { font-size: 11px; color: var(--color-tx-2); display: flex; gap: 6px; }
  .fact strong { color: var(--color-tx); font-weight: 700; }

  .sheet-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(90px, 1fr)); gap: 8px; padding: 14px 0; border-bottom: 1px solid var(--color-line); }
  .stat-box { background: var(--color-raised); border-radius: 10px; padding: 10px; text-align: center; }
  .stat-lbl { font-size: 9px; color: var(--color-tx-3); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .stat-val { font-family: var(--font-display); font-size: 20px; }

  .sheet-attrs { padding: 14px 0; }
  .attrs-title { font-family: var(--font-mono); font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--color-tx-3); margin-bottom: 10px; }
  .attr-row { display: grid; grid-template-columns: 82px 1fr 28px; align-items: center; gap: 10px; margin-bottom: 8px; }
  .attr-lbl { font-size: 11px; color: var(--color-tx-2); }
  .attr-bar-track { height: 7px; border-radius: 4px; background: var(--color-raised); overflow: hidden; }
  .attr-bar { height: 100%; border-radius: 4px; background: var(--color-tx-2); }
  .attr-bar.primary { background: linear-gradient(90deg, var(--color-club), var(--color-live)); }
  .attr-val { font-family: var(--font-mono); font-size: 12px; font-weight: 700; text-align: right; }

  .sheet-actions { display: flex; flex-direction: column; gap: 8px; padding-top: 4px; }
  .btn-full { min-height: 44px; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font-body); }
  .btn-primary { border: none; background: var(--color-club); color: var(--color-on-club, #fff); }
  .btn-warn { border: 1px solid var(--color-line); background: var(--color-raised); color: var(--color-warn); }
  .btn-secondary { border: 1px solid var(--color-line); background: var(--color-raised); color: var(--color-tx-2); }
</style>
