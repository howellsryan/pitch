<script>
  import { onMount } from 'svelte';
  import { getAllPlayers, getAllTeams, getSave, openDB } from '../../modules/db.js';
  import ScoutingPanel from './ScoutingPanel.svelte';

  let open = $state(false);
  let loaded = $state(false);
  let buyActive = $state(false);
  let launcherTop = $state(0);
  let launcherRight = $state(16);
  let save = $state(null);
  let players = $state([]);
  let teams = $state([]);
  let filterTabs = null;

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

  function syncBuyPlacement() {
    const screen = document.getElementById('screen-transfers');
    if (!screen) return;

    const buyTab = [...screen.querySelectorAll('.tr-tabs .tr-tab')]
      .find(button => button.textContent?.trim() === 'Buy');
    const isActive = Boolean(buyTab?.classList.contains('on'));
    buyActive = isActive;

    if (!isActive) {
      open = false;
      filterTabs?.classList.remove('scouting-slot');
      filterTabs = null;
      return;
    }

    const nextFilterTabs = screen.querySelector('.tr-panel .ftabs');
    if (!nextFilterTabs) return;
    if (filterTabs !== nextFilterTabs) {
      filterTabs?.classList.remove('scouting-slot');
      filterTabs = nextFilterTabs;
      filterTabs.classList.add('scouting-slot');
    }

    const screenBox = screen.getBoundingClientRect();
    const tabsBox = nextFilterTabs.getBoundingClientRect();
    launcherTop = Math.round(tabsBox.top - screenBox.top);
    launcherRight = Math.max(12, Math.round(screenBox.right - tabsBox.right));
  }

  function scheduleBuyPlacement() {
    window.requestAnimationFrame(syncBuyPlacement);
  }

  onMount(() => {
    const screen = document.getElementById('screen-transfers');
    if (!screen) return;
    const observer = new window.MutationObserver(scheduleBuyPlacement);
    observer.observe(screen, { childList:true, subtree:true, attributes:true, attributeFilter:['class'] });
    screen.addEventListener('click', scheduleBuyPlacement);
    window.addEventListener('resize', scheduleBuyPlacement);
    scheduleBuyPlacement();
    return () => {
      observer.disconnect();
      filterTabs?.classList.remove('scouting-slot');
      screen.removeEventListener('click', scheduleBuyPlacement);
      window.removeEventListener('resize', scheduleBuyPlacement);
    };
  });
</script>

{#if buyActive}
  <button
    class="scouting-launcher"
    style={`top:${launcherTop}px;right:${launcherRight}px`}
    onclick={openDrawer}
    aria-label="Open scouting assignments and reports"
  >Scouting</button>
{/if}

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
  :global(#screen-transfers .ftabs.scouting-slot) { position:relative; padding-right:112px; min-height:44px; align-items:center; }
  .scouting-launcher { position:absolute; z-index:25; min-width:96px; min-height:44px; padding:0 14px; border:1px solid var(--color-line); border-radius:7px; background:var(--color-raised); color:var(--color-tx); cursor:pointer; font:700 10px/1 var(--font-body); box-shadow:inset 3px 0 0 var(--color-club); }
  .scouting-launcher:hover { border-color:color-mix(in oklch,var(--color-tx) 22%,var(--color-line)); }
  .scouting-launcher:focus-visible { outline:2px solid var(--color-accent); outline-offset:2px; }
  .scouting-backdrop { position:fixed; inset:0; z-index:930; border:0; padding:0; background:rgba(0,0,0,.62); }
  .scouting-drawer { position:fixed; left:0; right:0; bottom:0; z-index:931; max-height:86dvh; display:flex; flex-direction:column; padding:10px 16px calc(16px + env(safe-area-inset-bottom)); border:1px solid var(--color-line); border-bottom:0; border-radius:18px 18px 0 0; background:var(--color-surface); color:var(--color-tx); font-family:var(--font-body); }
  .drawer-handle { width:36px; height:4px; margin:4px auto 12px; border-radius:999px; background:var(--color-line); flex-shrink:0; }
  .drawer-head { display:flex; justify-content:space-between; align-items:flex-start; gap:14px; margin-bottom:12px; flex-shrink:0; }
  .drawer-head span { display:block; color:var(--color-club); font:700 8px var(--font-mono); letter-spacing:.1em; text-transform:uppercase; }
  .drawer-head strong { display:block; margin-top:4px; font:20px var(--font-display); }
  .drawer-head small { display:block; margin-top:4px; color:var(--color-tx-3); font-size:10px; }
  .drawer-close { width:44px; height:44px; flex-shrink:0; border:1px solid var(--color-line); border-radius:9px; background:var(--color-raised); color:var(--color-tx-2); cursor:pointer; }
  .drawer-body { min-height:0; overflow:auto; overscroll-behavior:contain; }
  .loading { padding:24px; text-align:center; color:var(--color-tx-3); font-size:11px; }
  @media (max-width:520px) { :global(#screen-transfers .ftabs.scouting-slot) { padding-right:104px; } .scouting-launcher { min-width:90px; padding-inline:10px; } }
  @media (min-width:760px) {
    /* Centred with auto margins rather than a transform: a transformed ancestor
       becomes the containing block for position:fixed descendants, which let
       .drawer-body's overflow clip the scouting panel's own dialog. */
    .scouting-drawer { left:0; right:0; width:min(760px,calc(100vw - 32px)); margin-inline:auto; }
  }
  @media (prefers-reduced-motion:reduce) { .scouting-drawer { scroll-behavior:auto; } }
</style>
