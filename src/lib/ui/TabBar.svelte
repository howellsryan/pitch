<script>
  import { navigateTo } from '../../ui/helpers.js';

  // Play reuses the existing gameweek-advance button that renderHome() wires
  // up inside #screen-home (src/ui/home_transfers.js) — the queue-draining
  // logic (docs/plan/04-migration-phases.md, Phase 3 watch note) stays
  // exactly where it is; this just gives it a one-tap entry point from
  // anywhere, matching the design's "always one thumb away" Play action.
  async function play() {
    await navigateTo('home');
    document.getElementById('btn-adv-header')?.click();
  }
</script>

<nav class="bot-nav">
  <div class="bot-nav-inner">
    <button class="bn" data-nav="home" onclick={() => navigateTo('home')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
      <span>Home</span>
    </button>
    <button class="bn" data-nav="squad" onclick={() => navigateTo('squad')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      <span>Squad</span>
    </button>
    <button class="bn play-btn" onclick={play} aria-label="Play next match">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
    </button>
    <button class="bn" data-nav="transfers" onclick={() => navigateTo('transfers')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
      <span>Transfers</span>
    </button>
    <button class="bn" data-nav="competitions" onclick={() => navigateTo('competitions')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>
      <span>League</span>
    </button>
  </div>
</nav>

<style>
  .play-btn {
    position: relative;
    top: -16px;
    width: 50px;
    height: 50px;
    border-radius: 50%;
    background: var(--color-club, var(--acc));
    color: var(--color-on-club, #fff);
    box-shadow: 0 4px 16px color-mix(in oklch, var(--color-club, var(--acc)) 45%, transparent);
    transition: transform 0.15s;
  }
  .play-btn svg { width: 22px; height: 22px; }
  .play-btn:active { transform: translateY(-16px) scale(0.94); }
  .play-btn:hover { color: var(--color-on-club, #fff); }
</style>
