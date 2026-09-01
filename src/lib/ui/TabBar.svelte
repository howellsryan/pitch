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
    { id: 'academy', label: 'Academy', icon: 'academy' },
    { id: 'trophies', label: 'Trophies', icon: 'trophy' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ];

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
  <div class="top-rail">
    <button
      class="menu"
      onclick={toggle}
      aria-label={open ? 'Close navigation' : 'Open navigation'}
      aria-expanded={open}
      aria-controls="nav-destinations"
    >
      <span class="menu-disc">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16"/>
        </svg>
      </span>
    </button>
  </div>

  {#if open}
    <div class="fan" id="nav-destinations" aria-label="Destinations">
      {#each destinations as destination, i (destination.id)}
        <button
          class:current={active === destination.id}
          class="destination"
          style:--i={i}
          onclick={() => choose(destination.id)}
          aria-current={active === destination.id ? 'page' : undefined}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true">
            {#if destination.icon === 'home'}
              <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
            {:else if destination.icon === 'squad'}
              <circle cx="9" cy="7" r="3.5" /><path d="M2 21v-1a6 6 0 0 1 12 0v1M16 4.5a3.5 3.5 0 0 1 0 6.8M17 14.5a5.5 5.5 0 0 1 5 5.5v1" />
            {:else if destination.icon === 'play'}
              <path d="m9 5 10 7-10 7z" fill="currentColor" stroke="none" />
            {:else if destination.icon === 'market'}
              <path d="m17 3 4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 21l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" />
            {:else if destination.icon === 'table'}
              <path d="M4 4h16v16H4zM4 10h16M10 4v16" />
            {:else if destination.icon === 'academy'}
              <path d="m3 9 9-5 9 5-9 5z" /><path d="M6 11v5c3 2 9 2 12 0v-5M21 9v6" />
            {:else if destination.icon === 'trophy'}
              <path d="M8 4h8v4c0 4-1.5 7-4 7s-4-3-4-7z" /><path d="M8 7H4c0 4 2 6 5 6M16 7h4c0 4-2 6-5 6M12 15v4M8 21h8" />
            {:else}
              <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.87l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.1.4.32.75.6 1 .3.25.68.4 1.1.4h.1v4h-.1a1.7 1.7 0 0 0-1.7.6z" />
            {/if}
          </svg>
          <span>{destination.label}</span>
        </button>
      {/each}
    </div>
  {/if}
</nav>

<style>
  .broadcast-nav { display: none; }
  @media (max-width: 768px) {
    .broadcast-nav {
      position: fixed;
      z-index: 110;
      top: 0;
      left: 0;
      right: 0;
      height: calc(48px + env(safe-area-inset-top, 0px));
      padding: env(safe-area-inset-top, 0px) 12px 0;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      background: color-mix(in oklch, var(--color-ground) 92%, transparent);
      border-bottom: 1px solid var(--color-line);
      backdrop-filter: blur(14px);
    }
    .top-rail { width: 100%; height: 48px; display: flex; align-items: center; justify-content: flex-end; }
    .menu { width: 44px; height: 44px; display: grid; place-items: center; padding: 5px; color: var(--color-on-accent); background: transparent; border: 0; border-radius: 12px; cursor: pointer; }
    .menu-disc { width: 34px; height: 34px; display: grid; place-items: center; background: var(--color-accent); border-radius: 11px; box-shadow: 0 4px 16px rgba(0,0,0,.28); }
    .menu svg { width: 17px; height: 17px; }
    .fan { position: absolute; top: calc(100% + 8px); right: 12px; max-height: calc(100dvh - 72px - env(safe-area-inset-top, 0px)); overflow-y: auto; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; padding: 0 2px 4px; scrollbar-width: none; }
    .fan::-webkit-scrollbar { display: none; }
    .destination { min-height: 44px; display: flex; align-items: center; gap: 9px; padding: 8px 14px 8px 11px; color: var(--color-tx-2); background: color-mix(in oklch, var(--color-raised) 96%, transparent); border: 1px solid var(--color-line); border-radius: 999px; box-shadow: 0 5px 18px rgba(0,0,0,.3); font: 600 13px/1 var(--font-body); cursor: pointer; animation: fan-in var(--dur-base) var(--ease-out) both; animation-delay: calc(var(--i) * 30ms); }
    .destination.current { color: var(--color-on-accent); background: var(--color-accent); border-color: var(--color-accent); }
    .destination svg { width: 19px; height: 19px; }
    button:focus-visible { outline: 3px solid var(--color-club); outline-offset: 3px; }
  }
  @keyframes fan-in { from { opacity: 0; transform: translateY(-8px) scale(.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
</style>
