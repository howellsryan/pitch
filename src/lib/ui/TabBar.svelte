<script>
  import { onMount } from 'svelte';
  import { getActiveScreen, navigateTo } from '../../ui/helpers.js';
  import Icon from './kit/Icon.svelte';

  let open = $state(false);
  let active = $state('home');

  const primaryDestinations = [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'squad', label: 'Squad', icon: 'squad' },
    { id: 'match', label: 'Play', icon: 'kickoff', emphasis: true },
    { id: 'transfers', label: 'Market', icon: 'market' },
  ];

  const secondaryDestinations = [
    { id: 'competitions', label: 'Table', icon: 'table', detail: 'Fixtures, results and standings' },
    { id: 'academy', label: 'Academy', icon: 'academy', detail: 'Youth and development pathways' },
    { id: 'inbox', label: 'Inbox', icon: 'inbox', detail: 'Messages and career decisions' },
    { id: 'trophies', label: 'Trophies', icon: 'trophy', detail: 'Honours and career history' },
    { id: 'settings', label: 'Settings', icon: 'settings', detail: 'Career, cloud and preferences' },
  ];

  const secondaryIds = new Set(secondaryDestinations.map((destination) => destination.id));
  const moreIsCurrent = $derived(open || secondaryIds.has(active));

  async function choose(id) {
    await navigateTo(id);
    active = id;
    open = false;
  }

  function toggleMore() { open = !open; }
  function closeMore() { open = false; }
  function handleKey(event) { if (event.key === 'Escape') closeMore(); }

  onMount(() => {
    active = getActiveScreen() || 'home';
    const update = (event) => {
      active = event.detail.id;
      open = false;
    };
    window.addEventListener('pitch:navigation', update);
    return () => window.removeEventListener('pitch:navigation', update);
  });
</script>

<svelte:window onkeydown={handleKey} />

<nav class="broadcast-nav" aria-label="Game navigation">
  {#if open}
    <button class="scrim" type="button" aria-label="Close navigation" onclick={closeMore}></button>
    <section class="more-sheet" id="nav-destinations" aria-label="More destinations">
      <div class="sheet-head">
        <div>
          <span class="eyebrow">Club navigation</span>
          <strong>More</strong>
        </div>
        <button class="sheet-close" type="button" onclick={closeMore} aria-label="Close navigation">
          <Icon name="close" size={18} />
        </button>
      </div>
      <div class="secondary-grid">
        {#each secondaryDestinations as destination (destination.id)}
          <button
            type="button"
            class="secondary-destination"
            class:current={active === destination.id}
            onclick={() => choose(destination.id)}
            aria-current={active === destination.id ? 'page' : undefined}
          >
            <span class="secondary-icon"><Icon name={destination.icon} size={20} /></span>
            <span class="secondary-copy">
              <strong>{destination.label}</strong>
              <small>{destination.detail}</small>
            </span>
            <Icon name="chevron" size={16} />
          </button>
        {/each}
      </div>
    </section>
  {/if}

  <div class="primary-strip">
    {#each primaryDestinations as destination (destination.id)}
      <button
        type="button"
        class="primary-destination"
        class:current={active === destination.id}
        class:play={destination.emphasis}
        onclick={() => choose(destination.id)}
        aria-current={active === destination.id ? 'page' : undefined}
      >
        <span class="primary-icon"><Icon name={destination.icon} size={destination.emphasis ? 22 : 20} /></span>
        <span>{destination.label}</span>
      </button>
    {/each}

    <button
      type="button"
      class="primary-destination"
      class:current={moreIsCurrent}
      onclick={toggleMore}
      aria-label={open ? 'Close more navigation' : 'Open more navigation'}
      aria-expanded={open}
      aria-controls="nav-destinations"
    >
      <span class="primary-icon"><Icon name={open ? 'close' : 'menu'} size={20} /></span>
      <span>More</span>
    </button>
  </div>
</nav>

<style>
  .broadcast-nav { display: none; }

  @media (max-width: 768px) {
    .broadcast-nav {
      position: fixed;
      z-index: 110;
      left: 0;
      right: 0;
      bottom: 0;
      min-height: calc(64px + env(safe-area-inset-bottom, 0px));
      padding: 0 8px env(safe-area-inset-bottom, 0px);
      display: flex;
      align-items: flex-start;
      justify-content: center;
      color: var(--color-tx);
      background: color-mix(in oklch, var(--color-ground) 94%, transparent);
      border-top: 1px solid color-mix(in oklch, var(--color-tx) 13%, transparent);
      box-shadow: 0 -12px 28px rgba(0, 0, 0, 0.2);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }

    .primary-strip {
      width: min(100%, 560px);
      height: 64px;
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      align-items: stretch;
    }

    .primary-destination {
      position: relative;
      min-width: 0;
      min-height: 56px;
      padding: 5px 2px 3px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      color: var(--color-tx-3);
      background: transparent;
      border: 0;
      border-top: 3px solid transparent;
      font: 600 9px/1 var(--font-mono);
      letter-spacing: 0.055em;
      text-transform: uppercase;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      transition: color var(--dur-fast) var(--ease-out),
                  background-color var(--dur-fast) var(--ease-out),
                  border-color var(--dur-fast) var(--ease-out),
                  transform var(--dur-fast) var(--ease-out);
    }

    .primary-destination:active { transform: translateY(1px); }
    .primary-destination.current {
      color: var(--color-tx);
      border-top-color: var(--color-accent);
      background: linear-gradient(180deg, color-mix(in oklch, var(--color-accent) 9%, transparent), transparent 72%);
    }

    .primary-icon {
      width: 30px;
      height: 26px;
      display: grid;
      place-items: center;
      color: currentColor;
    }

    .primary-destination.play .primary-icon {
      width: 36px;
      height: 32px;
      color: var(--color-on-accent);
      background: var(--color-accent);
      clip-path: polygon(0 0, calc(100% - 7px) 0, 100% 7px, 100% 100%, 0 100%);
    }

    .primary-destination.play.current .primary-icon {
      box-shadow: 0 0 0 1px color-mix(in oklch, var(--color-accent) 65%, white);
    }

    .scrim {
      position: fixed;
      z-index: 108;
      inset: 0 0 calc(64px + env(safe-area-inset-bottom, 0px));
      padding: 0;
      border: 0;
      background: rgba(3, 7, 5, 0.64);
      backdrop-filter: blur(2px);
      -webkit-backdrop-filter: blur(2px);
      animation: scrim-in var(--dur-fast) var(--ease-out) both;
    }

    .more-sheet {
      position: fixed;
      z-index: 109;
      left: 10px;
      right: 10px;
      bottom: calc(72px + env(safe-area-inset-bottom, 0px));
      max-width: 520px;
      max-height: min(66dvh, 540px);
      margin: 0 auto;
      overflow: auto;
      overscroll-behavior: contain;
      color: var(--color-tx);
      background: color-mix(in oklch, var(--color-surface) 97%, var(--color-ground));
      border: 1px solid color-mix(in oklch, var(--color-tx) 14%, transparent);
      border-radius: 10px;
      box-shadow: 0 24px 70px rgba(0, 0, 0, 0.42);
      animation: sheet-in var(--dur-base) var(--ease-out) both;
    }

    .sheet-head {
      min-height: 58px;
      padding: 10px 10px 9px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border-bottom: 1px solid var(--color-line);
    }

    .sheet-head > div { min-width: 0; }
    .eyebrow {
      display: block;
      margin-bottom: 2px;
      color: var(--color-tx-3);
      font: 500 9px/1.2 var(--font-mono);
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .sheet-head strong {
      display: block;
      font: 700 24px/.95 var(--font-display);
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }

    .sheet-close {
      width: 44px;
      height: 44px;
      flex: 0 0 44px;
      display: grid;
      place-items: center;
      color: var(--color-tx-2);
      background: transparent;
      border: 1px solid var(--color-line);
      border-radius: 5px;
      cursor: pointer;
    }

    .secondary-grid { display: grid; grid-template-columns: 1fr; }
    .secondary-destination {
      width: 100%;
      min-height: 58px;
      padding: 7px 12px;
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
      color: var(--color-tx);
      background: transparent;
      border: 0;
      border-bottom: 1px solid var(--color-line);
      text-align: left;
      cursor: pointer;
      transition: background-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
    }
    .secondary-destination:last-child { border-bottom: 0; }
    .secondary-destination.current {
      background: color-mix(in oklch, var(--color-accent) 8%, transparent);
      box-shadow: inset 3px 0 var(--color-accent);
    }
    .secondary-icon {
      width: 34px;
      height: 34px;
      display: grid;
      place-items: center;
      color: var(--color-tx-2);
      border: 1px solid var(--color-line);
      border-radius: 4px;
      background: var(--color-raised);
    }
    .secondary-destination.current .secondary-icon { color: var(--color-accent); }
    .secondary-copy { min-width: 0; }
    .secondary-copy strong {
      display: block;
      font-family: var(--font-body);
      font-size: 13px;
      font-weight: 600;
    }
    .secondary-copy small {
      display: block;
      margin-top: 2px;
      overflow: hidden;
      color: var(--color-tx-3);
      font-family: var(--font-body);
      font-size: 11px;
      line-height: 1.2;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    button:focus-visible {
      outline: 2px solid var(--color-accent);
      outline-offset: 2px;
    }
  }

  @keyframes sheet-in {
    from { opacity: 0; transform: translateY(12px) scale(.985); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes scrim-in { from { opacity: 0; } to { opacity: 1; } }
</style>
