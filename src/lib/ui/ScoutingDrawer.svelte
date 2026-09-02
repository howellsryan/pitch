<script>
  import { getAllPlayers, getAllTeams, getSave, openDB } from '../../modules/db.js';
  import ScoutingPanel from './ScoutingPanel.svelte';

  let open = $state(false);
  let loaded = $state(false);
  let save = $state(null);
  let players = $state([]);
  let teams = $state([]);

  async function load() {
    await openDB();
    const current = await getSave();
    if (!current || current._deleted) return;
    save = current;
    [players, teams] = await Promise.all([getAllPlayers(), getAllTeams()]);
    loaded = true;
  }

  async function openDrawer() {
    open = true;
    await load();
  }

  function closeDrawer() {
    open = false;
  }
</script>

<button class="scouting-launcher" onclick={openDrawer} aria-label="Open scouting assignments and reports">Scouting</button>

{#if open}
  <button class="scouting-backdrop" onclick={closeDrawer} aria-label="Close scouting"></button>
  <aside class="scouting-drawer" aria-label="Scouting">
    <div class="drawer-handle"></div>
    <div class="drawer-head">
      <div><span>Recruitment</span><strong>Scouting</strong><small>Build evidence before committing transfer budget.</small></div>
      <button class="drawer-close" onclick={closeDrawer} aria-label="Close scouting">✕</button>
    </div>
    <div class="drawer-body">
      {#if !loaded}
        <div class="loading">Loading scouting network…</div>
      {:else}
        <ScoutingPanel {save} {players} {teams} onchange={load} />
      {/if}
    </div>
  </aside>
{/if}

<style>
  .scouting-launcher { position:fixed; right:16px; bottom:calc(82px + env(safe-area-inset-bottom)); z-index:80; min-height:44px; padding:0 16px; border:1px solid color-mix(in oklch,var(--color-club) 55%,var(--color-line)); border-radius:999px; background:var(--color-club); color:var(--color-on-club,#fff); box-shadow:0 8px 24px rgba(0,0,0,.28); cursor:pointer; font:700 11px var(--font-body); }
  .scouting-backdrop { position:fixed; inset:0; z-index:930; border:0; padding:0; background:rgba(0,0,0,.62); }
  .scouting-drawer { position:fixed; left:0; right:0; bottom:0; z-index:931; max-height:86dvh; display:flex; flex-direction:column; padding:10px 16px calc(16px + env(safe-area-inset-bottom)); border:1px solid var(--color-line); border-bottom:0; border-radius:18px 18px 0 0; background:var(--color-surface); color:var(--color-tx); font-family:var(--font-body); }
  .drawer-handle { width:36px; height:4px; margin:4px auto 12px; border-radius:999px; background:var(--color-line); flex-shrink:0; }
  .drawer-head { display:flex; justify-content:space-between; align-items:flex-start; gap:14px; margin-bottom:12px; flex-shrink:0; }
  .drawer-head span { display:block; color:var(--color-club); font:700 8px var(--font-mono); letter-spacing:.1em; text-transform:uppercase; }
  .drawer-head strong { display:block; margin-top:4px; font:20px var(--font-display); }
  .drawer-head small { display:block; margin-top:4px; color:var(--color-tx-3); font-size:10px; }
  .drawer-close { width:36px; height:36px; flex-shrink:0; border:1px solid var(--color-line); border-radius:9px; background:var(--color-raised); color:var(--color-tx-2); cursor:pointer; }
  .drawer-body { min-height:0; overflow:auto; overscroll-behavior:contain; }
  .loading { padding:24px; text-align:center; color:var(--color-tx-3); font-size:11px; }
  @media (min-width:760px) {
    /* Centred with auto margins rather than a transform: a transformed ancestor
       becomes the containing block for position:fixed descendants, which let
       .drawer-body's overflow clip the scouting panel's own dialog. */
    .scouting-drawer { left:0; right:0; width:min(760px,calc(100vw - 32px)); margin-inline:auto; }
    .scouting-launcher { right:24px; bottom:24px; }
  }
  @media (prefers-reduced-motion:reduce) { .scouting-drawer { scroll-behavior:auto; } }
</style>
