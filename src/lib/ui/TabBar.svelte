<script>
  import { onMount } from 'svelte';
  import { getActiveScreen, navigateTo } from '../../ui/helpers.js';

  let open = $state(false);
  let active = $state('home');

  const destinations = [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'squad', label: 'Squad', icon: 'squad' },
    { id: 'match', label: 'Play', icon: 'play' },
    { id: 'transfers', label: 'Market', icon: 'market' },
    { id: 'competitions', label: 'Table', icon: 'table' },
  ];

  function icon(name) {
    const icons = {
      home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
      squad: '<circle cx="9" cy="7" r="3.5"/><path d="M2 21v-1a6 6 0 0 1 12 0v1M16 4.5a3.5 3.5 0 0 1 0 6.8M17 14.5a5.5 5.5 0 0 1 5 5.5v1"/>',
      play: '<path d="m9 5 10 7-10 7z" fill="currentColor" stroke="none"/>',
      market: '<path d="m17 3 4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 21l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"/>',
      table: '<path d="M4 4h16v16H4zM4 10h16M10 4v16"/>',
    };
    return icons[name];
  }

  async function choose(id) {
    await navigateTo(id);
    active = id;
    open = false;
  }

  function toggle() { open = !open; }
  function handleKey(event) { if (event.key === 'Escape') open = false; }

  onMount(() => {
    active = getActiveScreen() || 'home';
    const update = (event) => { active = event.detail.id; };
    window.addEventListener('pitch:navigation', update);
    return () => window.removeEventListener('pitch:navigation', update);
  });
</script>

<svelte:window onkeydown={handleKey} />

<nav class="broadcast-nav" aria-label="Game navigation">
  {#if open}
    <div class="fan" id="nav-destinations" aria-label="Destinations">
      {#each destinations as destination, i}
        <button
          class:current={active === destination.id}
          class="destination"
          style:--i={i}
          onclick={() => choose(destination.id)}
          aria-current={active === destination.id ? 'page' : undefined}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">{@html icon(destination.icon)}</svg>
          <span>{destination.label}</span>
        </button>
      {/each}
    </div>
  {/if}
  <div class="pill">
    <span class="eyebrow">{active === 'competitions' ? 'Table' : active === 'transfers' ? 'Market' : active === 'squad' ? 'Squad' : active === 'match' ? 'Matchday' : 'Home'}</span>
    <span class="divider"></span>
    <button class="menu" onclick={toggle} aria-label="Open navigation" aria-expanded={open} aria-controls="nav-destinations">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
    </button>
  </div>
</nav>

<style>
  .broadcast-nav { display: none; }
  @media (max-width: 768px) {
    .broadcast-nav { position: fixed; z-index: 110; right: 18px; bottom: calc(18px + env(safe-area-inset-bottom, 0px)); display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }
    .pill { height: 54px; display: flex; align-items: center; gap: 11px; padding: 0 7px 0 16px; color: var(--color-tx); background: color-mix(in oklch, var(--color-raised) 94%, transparent); border: 1px solid var(--color-line); border-radius: 999px; box-shadow: 0 8px 28px rgba(0,0,0,.42); backdrop-filter: blur(14px); }
    .eyebrow { min-width: 54px; font: 700 18px/1 var(--font-display); letter-spacing: .055em; text-transform: uppercase; }
    .divider { width: 1px; height: 22px; background: var(--color-line); }
    .menu { width: 40px; height: 40px; display: grid; place-items: center; color: var(--color-on-accent); background: var(--color-accent); border: 0; border-radius: 50%; cursor: pointer; }
    .menu svg { width: 19px; height: 19px; }
    .fan { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
    .destination { min-height: 44px; display: flex; align-items: center; gap: 9px; padding: 8px 14px 8px 11px; color: var(--color-tx-2); background: color-mix(in oklch, var(--color-raised) 96%, transparent); border: 1px solid var(--color-line); border-radius: 999px; box-shadow: 0 5px 18px rgba(0,0,0,.3); font: 600 13px/1 var(--font-body); cursor: pointer; animation: fan-in var(--dur-base) var(--ease-out) both; animation-delay: calc(var(--i) * 30ms); }
    .destination.current { color: var(--color-on-accent); background: var(--color-accent); border-color: var(--color-accent); }
    .destination svg { width: 19px; height: 19px; }
    button:focus-visible { outline: 3px solid var(--color-club); outline-offset: 3px; }
  }
  @keyframes fan-in { from { opacity: 0; transform: translateY(8px) scale(.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
</style>
