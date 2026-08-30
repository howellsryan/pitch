<script>
  import { deleteDB, getSave, getTeam, openDB } from '../../modules/db.js';
  import { entryState } from '../state/entry.svelte.js';
  import { enterGame, themeForTeam } from '../../ui/renderers.js';
  import Button from './kit/Button.svelte';
  import Crest from './kit/Crest.svelte';
  import Pitch from './kit/Pitch.svelte';
  import Sheet from './kit/Sheet.svelte';

  let save = $state.raw(null);
  let team = $state.raw(null);
  let confirmReset = $state(false);
  let busy = $state(false);

  let loading = false;
  $effect(() => {
    if (!entryState.showing || !entryState.hasSave || loading) return;
    loading = true;
    void (async () => {
      await openDB();
      save = await getSave();
      team = save?.userTeamId ? await getTeam(save.userTeamId) : null;
      loading = false;
    })();
  });

  async function continueCareer() {
    if (!save || busy) return;
    busy = true;
    await themeForTeam(save.userTeamId);
    await enterGame();
    busy = false;
  }

  async function startFresh() {
    if (busy) return;
    busy = true;
    try { await deleteDB(); } catch (err) { console.error('[new-career]', err); }
    window.location.reload();
  }
</script>

{#if entryState.showing && entryState.hasSave}
  <div class="career-menu" role="region" aria-label="Career menu">
    <div class="pitch-bg" aria-hidden="true"><Pitch perspective /></div>
    <div class="shade" aria-hidden="true"></div>

    <main class="menu-card">
      <div class="wordmark">PITCH</div>
      <div class="kicker">Your career</div>

      {#if save}
        <div class="career-summary">
          <Crest color={team?.primaryColor || '#EF0107'} size={34} label={team ? `${team.name} crest` : 'Club crest'} />
          <div class="career-copy">
            <strong>{team?.name || save.userTeamId}</strong>
            <span>{save.managerName || 'The Manager'} · {save.season} · GW {save.currentGameweek}</span>
          </div>
        </div>
      {:else}
        <div class="loading">Loading career…</div>
      {/if}

      <div class="actions">
        <Button variant="accent" size="lg" full onclick={continueCareer} disabled={!save || busy}>
          {busy ? 'Opening…' : 'Continue career'}
        </Button>
        <Button variant="ghost" size="lg" full onclick={() => (confirmReset = true)} disabled={busy}>
          Start a new career
        </Button>
      </div>

      <p class="note">Your current career stays in this browser until you explicitly replace or reset it.</p>
    </main>
  </div>

  <Sheet bind:open={confirmReset} title="Start a new career?">
    <p class="confirm-copy">
      This deletes the current career and returns to club selection. Export a <code>.pitch</code> backup from Settings first if you may want to come back to it.
    </p>
    <div class="sheet-actions">
      <Button variant="danger" size="lg" full onclick={startFresh} disabled={busy}>
        {busy ? 'Deleting…' : 'Delete career and continue'}
      </Button>
      <Button variant="ghost" size="lg" full onclick={() => (confirmReset = false)} disabled={busy}>Keep career</Button>
    </div>
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
    overflow: hidden;
    padding: calc(env(safe-area-inset-top) + 24px) 18px calc(env(safe-area-inset-bottom) + 28px);
    background: var(--color-ground);
    color: var(--color-tx);
    font-family: var(--font-body);
  }
  .pitch-bg { position: absolute; inset: -10% -38% 18%; opacity: .58; pointer-events: none; }
  .shade { position: absolute; inset: 0; background: linear-gradient(180deg, transparent 10%, color-mix(in oklch, var(--color-ground) 75%, transparent) 52%, var(--color-ground) 78%); pointer-events: none; }
  .menu-card { position: relative; z-index: 1; width: min(100%, 440px); }
  .wordmark { font-family: var(--font-display); font-size: clamp(66px, 21vw, 104px); font-weight: 800; line-height: .82; letter-spacing: .02em; }
  .kicker { margin: 12px 0 16px; font-family: var(--font-mono); font-size: 10px; letter-spacing: .18em; text-transform: uppercase; color: var(--color-accent); }
  .career-summary { display: flex; align-items: center; gap: 12px; padding: 13px 0; border-block: 1px solid var(--color-line); }
  .career-copy { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .career-copy strong { font-size: 16px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .career-copy span, .loading { color: var(--color-tx-2); font-size: 11px; font-family: var(--font-mono); }
  .actions { display: grid; gap: 9px; margin-top: 18px; }
  .note, .confirm-copy { margin: 12px 0 0; color: var(--color-tx-3); font-size: 11px; line-height: 1.55; }
  .confirm-copy { margin-top: 0; color: var(--color-tx-2); font-size: 13px; }
  .confirm-copy code { font-family: var(--font-mono); color: var(--color-tx); }
  .sheet-actions { display: grid; gap: 8px; margin-top: 18px; }

  @media (min-width: 720px) {
    .career-menu { justify-content: flex-start; align-items: center; padding-inline: 56px; }
    .pitch-bg { inset: -10% -8% -8% 38%; }
    .shade { background: linear-gradient(90deg, var(--color-ground) 30%, color-mix(in oklch, var(--color-ground) 60%, transparent) 66%, transparent); }
  }
</style>
