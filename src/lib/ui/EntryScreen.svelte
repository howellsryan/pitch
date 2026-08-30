<script>
  /**
   * The front door (docs/plan/07-redesign.md, R1).
   *
   * Replaces shell.html's #ng — a manager-name field over an emoji team grid —
   * with the two things a stranger actually needs: a page that says what this
   * is, and a club picker that shows what decides the choice. It is also the
   * marketing site: pitch-sim.com serves the game at the root, so this page IS
   * the landing page for someone who has never heard of the game.
   *
   * Only ever shown when no career exists — boot() sends a returning player
   * straight into the game, which stays the right default. R7/P0 also reuse
   * this picker when a player chooses New Career from the saved-career menu.
   *
   * Two taps to a started career, deliberately: tap a club, tap start. The
   * hero's button only scrolls — it is not a step, so it does not count.
   *
   * boot() (src/ui/renderers.js) still owns whether this screen is shown at
   * all; it hands off to enterGame() below, exactly as its own resume branch
   * does, so a new career and a resumed one reveal the shell identically.
   */
  import {
    activateCareerSlot,
    createCareerSlot,
    deleteCareerSlot,
    getActiveSlotId,
    importSaveFile,
    importSaveFromCode,
  } from '../../modules/db.js';
  import { getAllTeamData, startingBudget, startNewGame } from '../../modules/save.js';
  import { difficultyBand, keyPlayer, squadStrength } from '../../game/clubStrength.js';
  import { resolveAccent } from '../theme.mjs';
  import { entryState } from '../state/entry.svelte.js';
  import { fmt, toast } from '../../ui/helpers.js';
  import { _removeFullOverlay, _showFullOverlay, enterGame, themeForTeam } from '../../ui/renderers.js';
  import Button from './kit/Button.svelte';
  import Chip from './kit/Chip.svelte';
  import Crest from './kit/Crest.svelte';
  import EmptyState from './kit/EmptyState.svelte';
  import Money from './kit/Money.svelte';
  import Pitch from './kit/Pitch.svelte';
  import Sheet from './kit/Sheet.svelte';
  import Skeleton from './kit/Skeleton.svelte';
  import StatTile from './kit/StatTile.svelte';

  // $state.raw throughout: these are reassigned wholesale, never mutated in
  // place, and `clubs` is a 186-entry array that gains nothing from deep
  // proxying (see CLAUDE.md §0 on MatchScreen's DataCloneError).
  let clubs = $state.raw([]);
  let ready = $state(false);

  let leagueFilter = $state('all');
  let query = $state('');
  let selected = $state.raw(null);
  let managerName = $state('');
  let busy = $state(false);
  let clubSheet = $state(false);
  let importSheet = $state(false);
  let saveCode = $state('');

  let pickerEl = $state(null);
  let fileEl = $state(null);

  /** Placeholder count while the club list builds. */
  const SKELETONS = [0, 1, 2, 3, 4, 5, 6, 7];

  /** Diacritic-insensitive so "atletico" finds Atlético. */
  const fold = (s) =>
    String(s ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

  function buildClubs() {
    // Clubs share shirt colours (a dozen are plain white), and resolveAccent
    // walks oklch until the colour clears the contrast floor — cache by hex so
    // that walk runs once per distinct colour, not 186 times.
    const cache = Object.create(null);
    const accent = (hex) => {
      if (!(hex in cache)) cache[hex] = resolveAccent(hex).hex;
      return cache[hex];
    };

    return getAllTeamData().map((t) => {
      const reputation = t.reputation ?? 70;
      const star = keyPlayer(t.players);
      return {
        id: t.id,
        name: t.name,
        league: t.league ?? 'Premier League',
        stadium: t.stadium ?? '',
        capacity: t.stadiumCapacity ?? 0,
        // NOT the data file's own budget field: startNewGame() recomputes every
        // club's budget from reputation, so the raw figure would misreport
        // almost every club (Newcastle reads £120M, starts on £75M).
        budget: startingBudget(reputation),
        reputation,
        colour: accent(t.primaryColor || '#EF0107'),
        strength: squadStrength(t.players),
        squadSize: Array.isArray(t.players) ? t.players.length : 0,
        starName: star?.name ?? null,
        starPosition: star?.position ?? null,
        band: difficultyBand(reputation),
        search: fold(t.name),
      };
    });
  }

  // Build only once boot() has decided this route is what the player sees —
  // never on our own clock. See src/lib/state/entry.svelte.js for why racing
  // boot() is unsafe rather than merely wasteful.
  //
  // `built` is a plain latch, not $state: an effect that both reads and writes
  // a reactive value it depends on self-invalidates, which is the same trap
  // Sheet.svelte's module-level stack documents.
  let built = false;
  $effect(() => {
    if (!entryState.showing || built) return;
    built = true;
    clubs = buildClubs();
    ready = true;
  });

  // First-appearance order, which is the data's own order: England's tiers,
  // then the continent. Alphabetising would bury the Premier League.
  const leagues = $derived.by(() => {
    const seen = Object.create(null);
    for (const c of clubs) seen[c.league] = (seen[c.league] ?? 0) + 1;
    return Object.entries(seen).map(([name, count]) => ({ name, count }));
  });

  const filtered = $derived.by(() => {
    const q = fold(query.trim());
    return clubs
      .filter(
        (c) =>
          (leagueFilter === 'all' || c.league === leagueFilter) &&
          (q === '' || c.search.includes(q)),
      )
      // Strongest first: the list reads as a difficulty ladder, and someone
      // hunting a specific club uses the search box, not the scroll.
      .sort((a, b) => b.reputation - a.reputation || a.name.localeCompare(b.name));
  });

  function prefersReducedMotion() {
    return typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  }

  function toPicker() {
    pickerEl?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  function pick(club) {
    selected = club;
    clubSheet = true;
  }

  /**
   * A cold start still writes the legacy/default slot. When this picker was
   * opened from CareerMenu, allocate a new isolated slot only at the moment a
   * real career is about to be written. If setup/import fails, delete that
   * partial slot and restore the previous active career pointer.
   */
  async function inRequestedCareerSlot(action) {
    if (!entryState.newCareerRequested) return action(null);

    const previousSlotId = getActiveSlotId();
    let slotId = null;
    try {
      slotId = await createCareerSlot({ activate:true });
      const result = await action(slotId);
      entryState.newCareerRequested = false;
      return result;
    } catch (err) {
      if (slotId) {
        try {
          await deleteCareerSlot(slotId);
          await activateCareerSlot(previousSlotId);
        } catch (rollbackErr) {
          console.error('[new-career-rollback]', rollbackErr);
        }
      }
      throw err;
    }
  }

  function backToCareers() {
    if (busy || !entryState.newCareerRequested) return;
    selected = null;
    clubSheet = false;
    importSheet = false;
    saveCode = '';
    entryState.newCareerRequested = false;
    entryState.hasSave = true;
  }

  async function start() {
    if (!selected || busy) return;
    busy = true;
    try {
      await inRequestedCareerSlot(() => startNewGame(selected.id, managerName.trim() || undefined));
      await themeForTeam(selected.id);
      clubSheet = false;
      // enterGame() hides #ng and moves focus to the shell; the sheet's own
      // focus restore would otherwise land on the now-hidden club card.
      await enterGame();
    } catch (err) {
      busy = false;
      toast(err.message, 'error');
    }
  }

  // Both import paths reload rather than hand off to enterGame(): the imported
  // save replaces everything already read into memory, and a reload is the
  // only honest way to re-read it. This is the user's one escape hatch if a
  // save breaks, so it stays on the entry screen (CLAUDE.md §1).
  async function importCode() {
    const code = saveCode.trim();
    if (!code) { toast('Paste a save code first', 'error'); return; }
    busy = true;
    _showFullOverlay('Loading save…');
    try {
      await inRequestedCareerSlot((slotId) => importSaveFromCode(code, slotId ?? getActiveSlotId()));
      window.location.reload();
    } catch (err) {
      busy = false;
      _removeFullOverlay();
      toast('Import failed: ' + err.message, 'error');
    }
  }

  async function importFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    busy = true;
    _showFullOverlay('Loading save…');
    try {
      await inRequestedCareerSlot((slotId) => importSaveFile(file, slotId ?? getActiveSlotId()));
      window.location.reload();
    } catch (err) {
      busy = false;
      _removeFullOverlay();
      toast('Import failed: ' + err.message, 'error');
    } finally {
      if (fileEl) fileEl.value = '';
    }
  }
</script>

<div class="entry">
  <header class="hero">
    <div class="turf" aria-hidden="true"><Pitch perspective /></div>

    <div class="hero-body">
      <p class="eyebrow">Free · Plays in your browser</p>
      <h1 class="mark">PITCH</h1>
      <p class="offer">
        Take charge of any club in Europe and manage it season after season —
        transfers, tactics, the academy, and every match tick by tick.
      </p>

      <div class="cta">
        <Button variant="accent" size="lg" full onclick={toPicker}>Choose your club</Button>
      </div>

      {#if ready}
        <!-- Gated with the picker, not shown from mount: restoring a save
             deletes and rebuilds every store, so it must not run while
             boot()'s cloud pull may still be in flight. -->
        {#if entryState.newCareerRequested}
          <button class="link" onclick={backToCareers}>← Back to saved careers</button>
        {/if}
        <button class="link" onclick={() => (importSheet = true)}>Import a saved career</button>
      {/if}
      <p class="nowall">No account. No sign-up. Your career saves in this browser.</p>
    </div>
  </header>

  <section class="proof" aria-label="What you get">
    <div><strong>{ready ? clubs.length : '—'}</strong><span>clubs</span></div>
    <div><strong>{ready ? leagues.length : '—'}</strong><span>leagues</span></div>
    <div><strong>90'</strong><span>simulated minute by minute</span></div>
  </section>

  <section class="picker" bind:this={pickerEl}>
    <h2 class="h2">Choose your club</h2>
    <p class="sub">Every club is playable. The badge you pick sets the difficulty.</p>

    <div class="search">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5" stroke-linecap="round"></path>
      </svg>
      <input
        type="search"
        bind:value={query}
        placeholder={ready ? `Search ${clubs.length} clubs` : 'Search clubs'}
        aria-label="Search clubs by name"
        autocomplete="off"
      />
    </div>

    <div class="filters" role="group" aria-label="Filter by league">
      <Chip selected={leagueFilter === 'all'} onclick={() => (leagueFilter = 'all')}>
        All {ready ? clubs.length : ''}
      </Chip>
      {#each leagues as l (l.name)}
        <Chip selected={leagueFilter === l.name} onclick={() => (leagueFilter = l.name)}>
          {l.name} {l.count}
        </Chip>
      {/each}
    </div>

    {#if !ready}
      <div class="grid" aria-busy="true">
        {#each SKELETONS as i (i)}
          <div class="club-card skel"><Skeleton h={68} /></div>
        {/each}
      </div>
    {:else if filtered.length === 0}
      <EmptyState
        title="No club matches “{query}”"
        body="Try a shorter search, or clear the league filter."
      >
        <Button variant="ghost" size="sm" onclick={() => { query = ''; leagueFilter = 'all'; }}>
          Clear filters
        </Button>
      </EmptyState>
    {:else}
      <div class="grid">
        {#each filtered as c (c.id)}
          <button class="club-card" onclick={() => pick(c)}>
            <span class="badge"><Crest color={c.colour} size={24} /></span>
            <span class="name">{c.name}</span>
            <span class="lg">{c.league}</span>
            <span class="bar" aria-hidden="true">
              <span class="fill" style="width:{c.strength}%;background:{c.colour}"></span>
            </span>
            <span class="metrics">
              <span class="str">{c.strength} <em>SQD</em></span>
              <Money value={c.budget} size="sm" tone="muted" />
            </span>
          </button>
        {/each}
      </div>
    {/if}
  </section>
</div>

<Sheet bind:open={clubSheet} title={selected?.name ?? 'Club'}>
  {#if selected}
    <div class="sheet-head">
      <Crest color={selected.colour} size={40} label="{selected.name} crest" />
      <div>
        <p class="s-league">{selected.league}</p>
        <p class="s-band">{selected.band.label} · <span>{selected.band.note}</span></p>
      </div>
    </div>

    <div class="tiles">
      <StatTile label="Squad" value={selected.strength} sub="best XI rating" />
      <StatTile label="Reputation" value={selected.reputation} sub="of 99" />
      <StatTile label="Budget" value={fmt.money(selected.budget)} sub="to spend" />
      <StatTile label="Players" value={selected.squadSize} sub="in the squad" />
    </div>

    {#if selected.starName}
      <p class="s-row"><span>Key player</span><strong>{selected.starName} <em>{selected.starPosition}</em></strong></p>
    {/if}
    {#if selected.stadium}
      <p class="s-row">
        <span>Home</span>
        <strong>{selected.stadium}{selected.capacity ? ` · ${selected.capacity.toLocaleString()}` : ''}</strong>
      </p>
    {/if}

    <label class="field">
      <span>Your name <em>optional</em></span>
      <input type="text" maxlength="30" bind:value={managerName} placeholder="The Manager" />
    </label>

    <div class="sheet-cta">
      <Button variant="accent" size="lg" full onclick={start} disabled={busy}>
        {busy ? 'Setting up…' : `Start with ${selected.name}`}
      </Button>
    </div>
  {/if}
</Sheet>

<Sheet bind:open={importSheet} title="Import a career">
  <p class="s-copy">
    {#if entryState.newCareerRequested}
      Load a <code>.pitch</code> file you exported, or paste a save code. It will be restored into a new independent career slot.
    {:else}
      Load a <code>.pitch</code> file you exported, or paste a save code. This replaces any career currently in this browser.
    {/if}
  </p>
  <div class="sheet-cta">
    <Button variant="ghost" size="lg" full onclick={() => fileEl?.click()} disabled={busy}>
      Choose a .pitch file
    </Button>
  </div>
  <label class="field">
    <span>Or paste a save code</span>
    <textarea bind:value={saveCode} rows="4" placeholder="Paste save code here…"></textarea>
  </label>
  <div class="sheet-cta">
    <Button variant="accent" size="lg" full onclick={importCode} disabled={busy || !saveCode.trim()}>
      {busy ? 'Loading…' : 'Load save code'}
    </Button>
  </div>
</Sheet>

<input
  type="file"
  accept=".pitch"
  bind:this={fileEl}
  onchange={importFile}
  style="display:none"
  aria-hidden="true"
  tabindex="-1"
/>

<style>
  .entry {
    width: 100%;
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    background: var(--color-ground);
    color: var(--color-tx);
    font-family: var(--font-body);
  }

  /* ── Hero ─────────────────────────────────────────────── */
  .hero {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    /* Not a full 100dvh: leaving the proof strip peeking is what tells a
       first-time visitor the page scrolls to the picker. */
    min-height: 88dvh;
    padding: calc(env(safe-area-inset-top) + 40px) 20px 30px;
    box-sizing: border-box;
    overflow: hidden;
  }
  /* The tilted pitch recedes behind the wordmark: the game's own surface as
     the landing image, rather than a stock photograph it would have to ship. */
  .turf {
    position: absolute;
    inset: -4% -20% 0;
    opacity: 0.62;
    mask-image: linear-gradient(180deg, transparent 0%, #000 24%, #000 60%, transparent 94%);
    -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 24%, #000 60%, transparent 94%);
    pointer-events: none;
  }
  /* Keeps the copy at full contrast over the brighter turf without dimming
     the pitch itself. */
  .hero::after {
    content: '';
    position: absolute;
    inset: 38% 0 0;
    background: linear-gradient(180deg, transparent, var(--color-ground) 68%);
    pointer-events: none;
  }
  .hero-body { position: relative; z-index: 1; width: 100%; max-width: 460px; margin: 0 auto; }
  .eyebrow {
    margin: 0 0 10px;
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--color-live);
  }
  .mark {
    margin: 0;
    font-family: var(--font-display);
    font-size: clamp(68px, 21vw, 112px);
    font-weight: 800;
    line-height: 0.86;
    letter-spacing: 0.02em;
    color: var(--color-tx);
  }
  .offer {
    margin: 14px 0 24px;
    max-width: 34ch;
    font-size: 15px;
    line-height: 1.55;
    color: var(--color-tx-2);
  }
  .cta { display: flex; flex-direction: column; gap: 10px; }
  .link {
    display: block;
    margin: 16px auto 0;
    padding: 10px 4px;
    min-height: 44px;
    border: none;
    background: none;
    color: var(--color-tx-2);
    font-family: var(--font-body);
    font-size: 13px;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }
  .link + .link { margin-top: 2px; }
  .link:hover { color: var(--color-tx); }
  .nowall {
    margin: 2px 0 0;
    text-align: center;
    font-family: var(--font-mono);
    font-size: 10.5px;
    letter-spacing: 0.05em;
    color: var(--color-tx-3);
  }

  /* ── Proof strip ──────────────────────────────────────── */
  .proof {
    display: flex;
    justify-content: center;
    gap: 26px;
    flex-wrap: wrap;
    padding: 20px;
    border-block: 1px solid var(--color-line);
    background: var(--color-surface);
  }
  .proof div { display: flex; flex-direction: column; align-items: center; gap: 3px; }
  .proof strong {
    font-family: var(--font-display);
    font-size: 26px;
    font-weight: 700;
    color: var(--color-tx);
  }
  .proof span {
    font-family: var(--font-mono);
    font-size: 9.5px;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: var(--color-tx-3);
    text-align: center;
  }

  /* ── Picker ───────────────────────────────────────────── */
  .picker {
    max-width: 1100px;
    margin: 0 auto;
    padding: 30px 16px calc(env(safe-area-inset-bottom) + 44px);
    scroll-margin-top: 0;
  }
  .h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 32px;
    font-weight: 700;
    letter-spacing: 0.01em;
  }
  .sub { margin: 6px 0 18px; font-size: 13px; color: var(--color-tx-2); }

  .search {
    display: flex;
    align-items: center;
    gap: 9px;
    height: 46px;
    padding: 0 14px;
    margin-bottom: 12px;
    border: 1px solid var(--color-line);
    border-radius: var(--radius-bug);
    background: var(--color-surface);
    color: var(--color-tx-3);
  }
  .search:focus-within { border-color: var(--color-accent); color: var(--color-tx-2); }
  .search input {
    flex: 1;
    min-width: 0;
    border: none;
    background: none;
    outline: none;
    color: var(--color-tx);
    font-family: var(--font-body);
    font-size: 15px; /* 16px-or-more avoids iOS zoom-on-focus; 15 + no user-scalable is fine here */
  }
  .search input::placeholder { color: var(--color-tx-3); }

  .filters {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 12px;
    margin-bottom: 6px;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }
  .filters::-webkit-scrollbar { display: none; }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 9px;
  }
  .club-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 5px;
    padding: 12px;
    min-height: 44px;
    border: 1px solid var(--color-line);
    border-radius: var(--radius-card);
    background: var(--color-surface);
    text-align: left;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: background-color var(--dur-fast) var(--ease-out),
                border-color var(--dur-fast) var(--ease-out),
                transform var(--dur-fast) var(--ease-out);
  }
  .club-card.skel { cursor: default; }
  .club-card:hover { background: var(--color-raised); border-color: var(--color-tx-3); }
  .club-card:active { transform: scale(0.985); }
  .club-card:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  .badge { display: block; margin-bottom: 1px; }
  .name {
    font-family: var(--font-body);
    font-size: 13.5px;
    font-weight: 600;
    line-height: 1.25;
    color: var(--color-tx);
  }
  .lg {
    font-family: var(--font-mono);
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-tx-3);
  }
  .bar {
    display: block;
    width: 100%;
    height: 3px;
    margin-top: 4px;
    border-radius: 2px;
    background: var(--color-raised-2);
    overflow: hidden;
  }
  .fill { display: block; height: 100%; border-radius: 2px; }
  .metrics {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    margin-top: 2px;
  }
  .str {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-size: 12px;
    font-weight: 600;
    color: var(--color-tx);
  }
  .str em {
    font-style: normal;
    font-size: 8.5px;
    letter-spacing: 0.12em;
    color: var(--color-tx-3);
  }

  /* ── Sheets ───────────────────────────────────────────── */
  .sheet-head { display: flex; align-items: center; gap: 13px; margin-bottom: 16px; }
  .s-league {
    margin: 0 0 3px;
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-tx-3);
  }
  .s-band { margin: 0; font-size: 14px; font-weight: 600; color: var(--color-tx); }
  .s-band span { font-weight: 400; color: var(--color-tx-2); }
  .tiles { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 14px; }
  .s-row {
    display: flex;
    justify-content: space-between;
    gap: 14px;
    margin: 0;
    padding: 11px 0;
    border-bottom: 1px solid var(--color-line);
    font-size: 13px;
  }
  .s-row span { color: var(--color-tx-2); }
  .s-row strong { font-weight: 600; text-align: right; }
  .s-row em { font-style: normal; font-family: var(--font-mono); font-size: 10px; color: var(--color-tx-3); }
  .s-copy { margin: 0 0 16px; font-size: 13.5px; line-height: 1.6; color: var(--color-tx-2); }
  .s-copy code { font-family: var(--font-mono); font-size: 12px; color: var(--color-tx); }

  .field { display: block; margin: 18px 0 0; }
  .field > span {
    display: block;
    margin-bottom: 7px;
    font-family: var(--font-mono);
    font-size: 9.5px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--color-tx-3);
  }
  .field em { font-style: normal; color: var(--color-tx-3); opacity: 0.7; }
  .field input,
  .field textarea {
    width: 100%;
    box-sizing: border-box;
    padding: 12px 14px;
    border: 1px solid var(--color-line);
    border-radius: var(--radius-bug);
    background: var(--color-ground);
    color: var(--color-tx);
    font-family: var(--font-body);
    font-size: 15px;
    outline: none;
  }
  .field textarea { font-family: var(--font-mono); font-size: 11px; resize: none; word-break: break-all; }
  .field input:focus,
  .field textarea:focus { border-color: var(--color-accent); }
  .sheet-cta { margin-top: 18px; }

  @media (min-width: 720px) {
    .hero { padding-inline: 40px; min-height: 82dvh; }
    .hero-body { max-width: 560px; margin: 0; }
    /* Wide viewports get the pitch as a right-hand field rather than a strip
       behind the text, which is where the empty half was. */
    .hero::after { inset: 0; background: linear-gradient(100deg, var(--color-ground) 34%, transparent 88%); }
    .cta { flex-direction: row; }
    .cta :global(.btn) { width: auto; min-width: 220px; }
    .link { margin-inline: 0; }
    .nowall { text-align: left; }
    .tiles { grid-template-columns: repeat(4, 1fr); }
  }
</style>
