<script>
  import {
    activateCareerSlot,
    exportSaveFile,
    getCareerSlotSummaries,
    openDB,
  } from '../../modules/db.js';
  import { deleteCareerEverywhere } from '../../cloud/sync.js';
  import { toast } from '../../ui/helpers.js';
  import { entryState } from '../state/entry.svelte.js';
  import Button from './kit/Button.svelte';
  import Crest from './kit/Crest.svelte';
  import Pitch from './kit/Pitch.svelte';
  import Sheet from './kit/Sheet.svelte';

  let careers = $state.raw([]);
  let busySlot = $state(null);
  let deleteTarget = $state.raw(null);
  let deleteOpen = $state(false);
  let exportMessage = $state('');
  let loading = $state(false);

  // Visibility owns refreshes. `loading` is display state only: reading it in
  // this effect makes the effect depend on a value it also writes, which can
  // self-invalidate and miss the false -> true saved-career transition after
  // backing out of New Career.
  $effect(() => {
    if (!entryState.showing || !entryState.hasSave) return;
    loading = true;
    void refreshCareers().finally(() => { loading = false; });
  });

  async function refreshCareers() {
    await openDB();
    careers = await getCareerSlotSummaries();
  }

  async function continueCareer(career) {
    if (!career || busySlot) return;
    busySlot = career.slotId;
    try {
      await activateCareerSlot(career.slotId);
      window.location.reload();
    } finally {
      busySlot = null;
    }
  }

  function startNewCareer() {
    if (busySlot) return;
    // Do not create/activate a blank slot here. EntryScreen will allocate the
    // isolated slot only when the player actually starts or imports a career.
    // Until then the existing active career remains a safe reload fallback.
    entryState.newCareerRequested = true;
    entryState.hasSave = false;
  }

  async function exportCareer(career) {
    if (!career || busySlot) return;
    busySlot = career.slotId;
    exportMessage = '';
    try {
      const result = await exportSaveFile(career.slotId);
      exportMessage = `${career.clubName} exported as ${result.filename}`;
    } catch (err) {
      exportMessage = err?.message || 'Could not export this career.';
    } finally {
      busySlot = null;
    }
  }

  function askDelete(career) {
    if (!career || busySlot) return;
    deleteTarget = career;
    deleteOpen = true;
  }

  function keepCareer() {
    if (busySlot) return;
    deleteOpen = false;
    deleteTarget = null;
  }

  async function confirmDelete() {
    if (!deleteTarget || busySlot) return;
    const target = deleteTarget;
    busySlot = target.slotId;
    try {
      await deleteCareerEverywhere(target.slotId);
      deleteOpen = false;
      deleteTarget = null;
      if (target.isActive) {
        window.location.reload();
        return;
      }
      await refreshCareers();
    } catch (err) {
      toast('Could not delete career: ' + (err?.message || 'unknown error'), 'error');
    } finally {
      busySlot = null;
    }
  }

  function formatPosition(position) {
    if (!Number.isFinite(position)) return 'Position —';
    const n = Number(position);
    const mod100 = n % 100;
    const suffix = mod100 >= 11 && mod100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
    return `${n}${suffix}`;
  }

  function formatLastPlayed(value) {
    if (!value) return 'Legacy career';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Last played —';
    return `Last played ${date.toLocaleDateString(undefined, { day:'numeric', month:'short', year:'numeric' })}`;
  }
</script>

{#if entryState.showing && entryState.hasSave}
  <div class="career-menu" role="region" aria-label="Career menu">
    <div class="pitch-bg" aria-hidden="true"><Pitch perspective /></div>
    <div class="shade" aria-hidden="true"></div>

    <main class="menu-card">
      <div class="wordmark">PITCH</div>
      <div class="title-row">
        <div>
          <div class="kicker">Your careers</div>
          <h1>Choose your touchline</h1>
        </div>
        <span class="slot-count">{careers.length} {careers.length === 1 ? 'career' : 'careers'}</span>
      </div>

      {#if loading && careers.length === 0}
        <div class="loading">Loading careers…</div>
      {:else}
        <div class="career-list" aria-label="Saved careers">
          {#each careers as career (career.slotId)}
            <article class:active={career.isActive} class="career-card">
              <div class="career-heading">
                <Crest color={career.clubColor || '#16a34a'} size={38} label={`${career.clubName} crest`} />
                <div class="career-copy">
                  <div class="club-line">
                    <strong>{career.clubName}</strong>
                    {#if career.isActive}<span class="active-badge">Active</span>{/if}
                  </div>
                  <span>{career.managerName}</span>
                </div>
              </div>

              <div class="career-meta">
                <span>{career.season}</span>
                <span>{career.league}</span>
                <span>{formatPosition(career.leaguePosition)}</span>
                <span>GW {career.gameweek}</span>
              </div>
              <div class="last-played">{formatLastPlayed(career.lastPlayedAt)}</div>

              <div class="career-actions">
                <Button variant="accent" size="md" onclick={() => continueCareer(career)} disabled={!!busySlot}>
                  {busySlot === career.slotId ? 'Opening…' : 'Continue'}
                </Button>
                <Button variant="ghost" size="md" onclick={() => exportCareer(career)} disabled={!!busySlot}>Export</Button>
                <Button variant="ghost" size="md" onclick={() => askDelete(career)} disabled={!!busySlot}>Delete</Button>
              </div>
            </article>
          {/each}
        </div>
      {/if}

      <Button variant="ghost" size="lg" full onclick={startNewCareer} disabled={!!busySlot}>
        + New career
      </Button>

      {#if exportMessage}<p class="status" role="status">{exportMessage}</p>{/if}
      <p class="note">Each career is stored independently. Starting or deleting one career never overwrites another.</p>
    </main>
  </div>

  <Sheet bind:open={deleteOpen} title="Delete career?">
    {#if deleteTarget}
      <p class="confirm-copy">
        Delete <strong>{deleteTarget.managerName}</strong> at <strong>{deleteTarget.clubName}</strong>? This only removes this career slot. Export a <code>.pitch</code> backup first if you may want it later.
      </p>
      <div class="sheet-actions">
        <Button variant="danger" size="lg" full onclick={confirmDelete} disabled={!!busySlot}>
          {busySlot === deleteTarget.slotId ? 'Deleting…' : 'Delete this career'}
        </Button>
        <Button variant="ghost" size="lg" full onclick={keepCareer} disabled={!!busySlot}>Keep career</Button>
      </div>
    {/if}
  </Sheet>
{/if}

<style>
  .career-menu {
    position: absolute;
    inset: 0;
    z-index: 20;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    overflow: auto;
    padding: calc(env(safe-area-inset-top) + 20px) 14px calc(env(safe-area-inset-bottom) + 24px);
    background: var(--color-ground);
    color: var(--color-tx);
    font-family: var(--font-body);
  }
  .pitch-bg { position: fixed; inset: -10% -38% 18%; opacity: .5; pointer-events: none; }
  .shade { position: fixed; inset: 0; background: linear-gradient(180deg, transparent 4%, color-mix(in oklch, var(--color-ground) 80%, transparent) 34%, var(--color-ground) 68%); pointer-events: none; }
  .menu-card { position: relative; z-index: 1; width: min(100%, 560px); margin-top: auto; }
  .wordmark { font-family: var(--font-display); font-size: clamp(58px, 19vw, 92px); font-weight: 800; line-height: .82; letter-spacing: .02em; }
  .title-row { display: flex; justify-content: space-between; align-items: end; gap: 16px; margin: 12px 0 14px; }
  .kicker, .slot-count, .career-meta, .last-played, .status { font-family: var(--font-mono); }
  .kicker { margin-bottom: 4px; font-size: 10px; letter-spacing: .18em; text-transform: uppercase; color: var(--color-accent); }
  h1 { margin: 0; font-family: var(--font-display); font-size: 25px; line-height: 1; text-transform: uppercase; }
  .slot-count { flex: 0 0 auto; padding-bottom: 2px; color: var(--color-tx-3); font-size: 9px; text-transform: uppercase; letter-spacing: .08em; }
  .career-list { display: grid; gap: 9px; max-height: min(49vh, 430px); overflow-y: auto; overscroll-behavior: contain; padding-right: 2px; margin-bottom: 10px; }
  .career-card { padding: 13px; border: 1px solid var(--color-line); background: color-mix(in oklch, var(--color-surface) 88%, transparent); backdrop-filter: blur(10px); }
  .career-card.active { border-color: color-mix(in oklch, var(--color-accent) 58%, var(--color-line)); }
  .career-heading { display: flex; align-items: center; gap: 11px; }
  .career-copy { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 3px; }
  .club-line { display: flex; align-items: center; gap: 7px; min-width: 0; }
  .career-copy strong { font-size: 15px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .career-copy > span { color: var(--color-tx-2); font-size: 11px; }
  .active-badge { flex: 0 0 auto; padding: 2px 5px; border: 1px solid color-mix(in oklch, var(--color-accent) 50%, transparent); color: var(--color-accent); font: 8px/1 var(--font-mono); text-transform: uppercase; letter-spacing: .08em; }
  .career-meta { display: flex; flex-wrap: wrap; gap: 5px 11px; margin-top: 11px; color: var(--color-tx-2); font-size: 9px; text-transform: uppercase; }
  .career-meta span:not(:last-child)::after { content: '·'; margin-left: 11px; color: var(--color-tx-3); }
  .last-played { margin-top: 5px; color: var(--color-tx-3); font-size: 9px; }
  .career-actions { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr) minmax(0, 1fr); gap: 7px; margin-top: 12px; }
  .loading { padding: 22px 0; color: var(--color-tx-2); font-size: 11px; font-family: var(--font-mono); }
  .note, .confirm-copy { margin: 10px 0 0; color: var(--color-tx-3); font-size: 11px; line-height: 1.55; }
  .status { margin: 9px 0 0; color: var(--color-accent); font-size: 9px; }
  .confirm-copy { margin-top: 0; color: var(--color-tx-2); font-size: 13px; }
  .confirm-copy strong { color: var(--color-tx); }
  .confirm-copy code { font-family: var(--font-mono); color: var(--color-tx); }
  .sheet-actions { display: grid; gap: 8px; margin-top: 18px; }

  @media (min-width: 720px) {
    .career-menu { justify-content: flex-start; align-items: center; padding-inline: 56px; }
    .menu-card { margin-top: 0; }
    .pitch-bg { inset: -10% -8% -8% 42%; }
    .shade { background: linear-gradient(90deg, var(--color-ground) 32%, color-mix(in oklch, var(--color-ground) 64%, transparent) 68%, transparent); }
    .career-list { max-height: 46vh; }
  }
</style>
