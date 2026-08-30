<script>
  import {
    deleteDB, exportSaveFile, getAllPlayers, getAllSeasons, getSave, importSaveFile,
    importSaveFromCode, openDB, putPlayersBulk,
  } from '../../modules/db.js';
  import { assignPotentials } from '../../modules/potential.js';
  import { getHonorsForTeam } from '../../modules/season.js';
  import { fmt, toast } from '../../ui/helpers.js';
  import { _removeFullOverlay, _showFullOverlay, showEntryMenu } from '../../ui/renderers.js';
  import { screenTicks } from '../state/screens.svelte.js';
  import { api, clearAuth, isSignedIn, startGoogleLogin } from '../../cloud/api.js';
  import { pushSaveToCloud } from '../../cloud/sync.js';

  const TROPHY_NAMES = {
    premier_league: 'Premier League', championship: 'Championship', league_one: 'League One', league_two: 'League Two',
    la_liga: 'La Liga', bundesliga: 'Bundesliga', serie_a: 'Serie A', ligue_1: 'Ligue 1', eredivisie: 'Eredivisie',
    fa_cup: 'FA Cup', league_cup: 'Carabao Cup', copa_del_rey: 'Copa del Rey', dfb_pokal: 'DFB-Pokal',
    coppa_italia: 'Coppa Italia', coupe_de_france: 'Coupe de France', knvb_beker: 'KNVB Beker',
    ucl: 'Champions League', uel: 'Europa League', uecl: 'Conference League',
    dfb_supercup: 'DFL Supercup', supercopa: 'Supercopa', supercoppa: 'Supercoppa', trophee_des_champions: 'Trophée des Champions',
  };

  let loaded = $state(false);
  let seasons = $state([]);
  let managerName = $state('The Manager');
  let earnedByTrophy = $state([]); // [{ trophy, name, seasons }]
  let totalEarned = $state(0);

  let sheet = $state(null); // 'export' | 'import' | 'reset' | null
  let saveCode = $state('');
  let saveMeta = $state(null);
  let importCodeInput = $state('');
  let busy = $state(false);
  let recalcBusy = $state(false);
  let recalcDone = $state(false);
  let importFileEl = $state(null);

  let cloudSignedIn = $state(false);
  let cloudIdentity = $state(null); // { displayName, email } once loaded
  let cloudBusy = $state(false);

  async function loadCloudIdentity() {
    cloudSignedIn = isSignedIn();
    if (!cloudSignedIn) { cloudIdentity = null; return; }
    try {
      const res = await api.me();
      cloudIdentity = res?.identity ?? null;
    } catch {
      // Expired/invalid token — api.me() already cleared it (see cloud/api.js).
      cloudSignedIn = isSignedIn();
      cloudIdentity = null;
    }
  }

  function signInWithGoogle() { startGoogleLogin(); }

  function signOutOfCloud() {
    clearAuth();
    cloudSignedIn = false;
    cloudIdentity = null;
    toast('Signed out — progress stays local from here.', 'info');
  }

  async function saveToCloudNow() {
    cloudBusy = true;
    try {
      const res = await pushSaveToCloud();
      if (res.ok) toast('Saved to cloud.', 'success');
      else toast('Cloud save failed: ' + (res.reason || 'unknown error'), 'error');
    } finally {
      cloudBusy = false;
    }
  }

  async function load() {
    await openDB();
    const save = await getSave();
    seasons = [...(await getAllSeasons())].reverse();
    // Fire-and-forget: the account name is a nice-to-have refinement, not a
    // gate. Everything else on this screen is local IndexedDB data — `loaded`
    // must not wait on a network round trip to /api/auth/me.
    void loadCloudIdentity();
    if (save) {
      managerName = save.managerName || 'The Manager';
      const { earned } = await getHonorsForTeam(save.userTeamId);
      totalEarned = earned.length;
      const byTrophy = [];
      earned.forEach(h => {
        let entry = byTrophy.find(e => e.trophy === h.trophy);
        if (!entry) { entry = { trophy: h.trophy, name: TROPHY_NAMES[h.trophy] || h.trophy, seasons: [] }; byTrophy.push(entry); }
        entry.seasons.push(h.season);
      });
      earnedByTrophy = byTrophy;
    }
    loaded = true;
  }

  $effect(() => {
    void screenTicks.settings;
    load();
  });

  function finishPlace(n) {
    return `${n}${['st', 'nd', 'rd'][n - 1] || 'th'}`;
  }

  function closeSheet() { if (!busy) { sheet = null; saveCode = ''; importCodeInput = ''; } }

  async function openExport() {
    sheet = 'export';
    saveCode = '';
    saveMeta = null;
    try {
      const result = await exportSaveFile();
      saveCode = result.saveCode;
      saveMeta = result.meta;
    } catch (err) {
      toast('Export failed: ' + err.message, 'error');
      sheet = null;
    }
  }

  async function copySaveCode() {
    try {
      await window.navigator.clipboard.writeText(saveCode);
      toast('Save code copied to clipboard!');
    } catch {
      toast('Could not copy — select and copy manually.', 'error');
    }
  }

  function openImport() { sheet = 'import'; importCodeInput = ''; }

  async function importFromCode() {
    const code = importCodeInput.trim();
    if (!code) { toast('Paste a save code first', 'error'); return; }
    busy = true;
    _showFullOverlay('Loading save…');
    try {
      await importSaveFromCode(code);
      window.location.reload();
    } catch (err) {
      _removeFullOverlay();
      busy = false;
      toast('Import failed: ' + err.message, 'error');
    }
  }

  function pickImportFile() { importFileEl?.click(); }

  async function onImportFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    busy = true;
    _showFullOverlay('Loading save…');
    try {
      await importSaveFile(file);
      window.location.reload();
    } catch (err) {
      _removeFullOverlay();
      busy = false;
      toast('Import failed: ' + err.message, 'error');
    } finally {
      e.target.value = '';
    }
  }

  function returnToMenu() { showEntryMenu(); }
  function openReset() { sheet = 'reset'; }

  async function confirmReset() {
    busy = true;
    _showFullOverlay('Starting new career…');
    try { await deleteDB(); } catch (e) { console.error(e); }
    window.location.reload();
  }

  async function recalcPotentials() {
    recalcBusy = true;
    recalcDone = false;
    try {
      const allPlayers = await getAllPlayers();
      const updated = assignPotentials(allPlayers);
      await putPlayersBulk(updated);
      recalcDone = true;
      toast('Potentials recalculated for all players — transfer market now up to date.', 'success', 5000);
      window.setTimeout(() => { recalcDone = false; }, 3000);
    } catch (err) {
      toast('Error: ' + err.message, 'error');
    } finally {
      recalcBusy = false;
    }
  }
</script>

<div class="settings-screen">
  <div class="set-hdr">
    <div class="set-eyebrow">System</div>
    <div class="set-title">Settings</div>
  </div>

  {#if !loaded}
    <div class="set-empty">Loading…</div>
  {:else}
    <div class="set-scroll">
      <div class="set-card">
        <div class="set-card-title">Career</div>
        <div class="set-card-sub">Save &amp; session</div>

        <div class="set-row">
          <div><div class="set-nm">Main Menu</div><div class="set-desc">Return to the title screen without deleting this career</div></div>
          <button class="btn-set btn-secondary" onclick={returnToMenu}>Menu</button>
        </div>
        <div class="set-row">
          <div><div class="set-nm">Export Save</div><div class="set-desc">Download your career to a .pitch file</div></div>
          <button class="btn-set btn-primary" onclick={openExport}>Export</button>
        </div>
        <div class="set-row">
          <div><div class="set-nm">Import Save</div><div class="set-desc">Load a .pitch file to resume a career</div></div>
          <button class="btn-set btn-secondary" onclick={openImport}>Import</button>
        </div>
        <div class="set-row">
          <div><div class="set-nm">Start New Career</div><div class="set-desc">Delete this career and choose a different club</div></div>
          <button class="btn-set btn-danger" onclick={openReset}>Start</button>
        </div>
        <div class="set-row">
          <div><div class="set-nm">Recalculate Potentials</div><div class="set-desc">Refresh all player potential ratings using the latest formula</div></div>
          <button id="btn-recalc-potentials" class="btn-set btn-secondary" disabled={recalcBusy} onclick={recalcPotentials}>
            {recalcBusy ? 'Recalculating…' : recalcDone ? 'Done!' : 'Recalculate'}
          </button>
        </div>
      </div>

      <div class="set-card">
        <div class="set-card-title">Cloud Save</div>
        <div class="set-card-sub">Google Account</div>
        {#if !cloudSignedIn}
          <div class="set-row">
            <div><div class="set-nm">Sign in with Google</div><div class="set-desc">Back up your career and pick it up on another device</div></div>
            <button class="btn-set btn-primary" onclick={signInWithGoogle}>Sign In</button>
          </div>
        {:else}
          <div class="set-row">
            <div><div class="set-nm">{cloudIdentity?.displayName || 'Signed in'}</div><div class="set-desc">{cloudIdentity?.email || 'Google account'}</div></div>
            <button class="btn-set btn-secondary" onclick={signOutOfCloud}>Sign Out</button>
          </div>
          <div class="set-row">
            <div><div class="set-nm">Save to Cloud</div><div class="set-desc">Push your current career to the cloud right now</div></div>
            <button class="btn-set btn-primary" disabled={cloudBusy} onclick={saveToCloudNow}>{cloudBusy ? 'Saving…' : 'Save Now'}</button>
          </div>
        {/if}
      </div>

      <div class="set-card">
        <div class="set-card-title">About</div>
        <div class="set-brand">PITCH</div>
        <div class="set-brand-sub">Football Career Simulator</div>
        <div class="set-brand-detail">
          PL · Championship · League One · League Two<br>
          La Liga · Bundesliga · Serie A · Ligue 1 · Eredivisie<br>
          Cup competitions · Youth academy · Multi-season
        </div>
      </div>

      <div class="set-card">
        <div class="set-card-title">Manager Trophies</div>
        {#if !totalEarned}
          <div class="set-empty-inline">No trophies won yet — keep going!</div>
        {:else}
          <div class="set-trophy-sub">Won under <strong>{managerName}</strong> · {totalEarned} total</div>
          <div class="set-trophy-list">
            {#each earnedByTrophy as t (t.trophy)}
              <div class="set-trophy-row">
                <div class="set-trophy-info">
                  <div class="set-trophy-name">{t.name}</div>
                  <div class="set-trophy-seasons">{t.seasons.join(' · ')}</div>
                </div>
                <div class="set-trophy-count">{t.seasons.length}×</div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <div class="set-card">
        <div class="set-card-title">Season History</div>
        {#if !seasons.length}
          <div class="set-empty-inline">No completed seasons yet.</div>
        {:else}
          <div class="set-season-list">
            {#each seasons as s (s.season)}
              <div class="set-season-row">
                <div class="set-season-name">Season {s.season}</div>
                <div class="set-season-detail">
                  {finishPlace(s.userFinish)} place
                  {#if s.topScorers?.[0]} · Top scorer: {s.topScorers[0].name} ({s.topScorers[0].goals}g){/if}
                  {#if s.topAssists?.[0]} · Top assists: {s.topAssists[0].name} ({s.topAssists[0].assists}a){/if}
                  {#if s.prizeMoney} · Prize: {fmt.money(s.prizeMoney)}{/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<input type="file" accept=".pitch" bind:this={importFileEl} onchange={onImportFileChange} style="display:none">

{#if sheet}
  <button class="sheet-backdrop" onclick={closeSheet} aria-label="Close"></button>
  <div class="sheet">
    <div class="sheet-handle"></div>

    {#if sheet === 'export'}
      <div class="sheet-title">Save Exported</div>
      {#if !saveCode}
        <div class="sheet-loading">Generating save code…</div>
      {:else}
        <div class="sheet-text">Your save code is below. <strong>Copy it</strong> and paste it somewhere safe to restore later.</div>
        {#if saveMeta}<div class="sheet-meta">Season {saveMeta.season} · GW {saveMeta.gameweek} · {saveMeta.teamId}</div>{/if}
        <textarea id="save-code-output" class="code-area" readonly value={saveCode}></textarea>
        <div class="sheet-actions">
          <button class="btn-full btn-primary" onclick={copySaveCode}>Copy Save Code</button>
          <button class="btn-full btn-secondary" onclick={closeSheet}>Done</button>
        </div>
      {/if}
    {:else if sheet === 'import'}
      <div class="sheet-title">Import Save</div>
      <div class="sheet-text">This will <strong>replace</strong> your current career. Paste a save code below, or choose a .pitch file.</div>
      <textarea id="save-code-input" class="code-area" placeholder="Paste save code here…" bind:value={importCodeInput} disabled={busy}></textarea>
      <div class="sheet-actions">
        <button class="btn-full btn-primary" disabled={busy} onclick={importFromCode}>{busy ? 'Loading…' : 'Load from Code'}</button>
        <button class="btn-full btn-secondary" disabled={busy} onclick={pickImportFile}>Load from File</button>
        <button class="btn-full btn-secondary" disabled={busy} onclick={closeSheet}>Cancel</button>
      </div>
    {:else if sheet === 'reset'}
      <div class="sheet-title">Start a new career?</div>
      <div class="sheet-text">This permanently deletes the current career and returns to club selection. Export a <strong>.pitch</strong> backup first if you may want to come back to it.</div>
      <div class="sheet-actions">
        <button class="btn-full btn-danger" disabled={busy} onclick={confirmReset}>{busy ? 'Deleting…' : 'Delete Career & Start Again'}</button>
        <button class="btn-full btn-secondary" disabled={busy} onclick={closeSheet}>Keep Career</button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .settings-screen {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    font-family: var(--font-body);
    color: var(--color-tx);
  }

  .set-hdr { padding: 18px 16px 12px; flex-shrink: 0; }
  .set-eyebrow { font-family: var(--font-mono); font-size: 10px; letter-spacing: 3px; text-transform: uppercase; color: var(--color-club); margin-bottom: 3px; }
  .set-title { font-family: var(--font-display); font-size: clamp(22px, 5vw, 28px); letter-spacing: 1px; line-height: 1; }

  .set-empty { color: var(--color-tx-3); font-size: 12px; padding: 24px; text-align: center; }
  .set-empty-inline { color: var(--color-tx-3); font-size: 12px; padding: 4px 0; }
  .set-scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 16px 24px; display: flex; flex-direction: column; gap: 12px; }

  .set-card { background: var(--color-surface); border: 1px solid var(--color-line); border-radius: 14px; padding: 16px; }
  .set-card-title { font-family: var(--font-display); font-size: 16px; letter-spacing: 0.5px; margin-bottom: 4px; }
  .set-card-sub { font-family: var(--font-mono); font-size: 9px; color: var(--color-tx-3); text-transform: uppercase; letter-spacing: 2px; margin-bottom: 10px; }

  .set-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0; border-top: 1px solid var(--color-line); }
  .set-row:first-of-type { border-top: none; }
  .set-nm { font-size: 13px; font-weight: 600; }
  .set-desc { font-size: 11px; color: var(--color-tx-2); margin-top: 2px; }
  .btn-set { flex-shrink: 0; min-height: 44px; padding: 0 16px; border-radius: 9px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: var(--font-body); white-space: nowrap; }
  .btn-set:disabled { opacity: 0.6; cursor: not-allowed; }

  .set-brand { font-family: var(--font-display); font-size: 32px; color: var(--color-club); letter-spacing: 4px; margin-bottom: 6px; }
  .set-brand-sub { font-size: 12px; color: var(--color-tx-2); line-height: 1.8; }
  .set-brand-detail { font-size: 11px; color: var(--color-tx-3); margin-top: 8px; line-height: 1.8; }

  .set-trophy-sub { font-size: 11px; color: var(--color-tx-2); margin-bottom: 10px; }
  .set-trophy-sub strong { color: var(--color-tx); }
  .set-trophy-list { display: flex; flex-direction: column; gap: 5px; }
  .set-trophy-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 10px; background: var(--color-raised); border-radius: 8px; border-left: 2px solid var(--color-warn);
  }
  .set-trophy-name { font-size: 12px; font-weight: 600; }
  .set-trophy-seasons { font-size: 10px; color: var(--color-tx-2); }
  .set-trophy-count { font-family: var(--font-display); font-size: 18px; color: var(--color-warn); }

  .set-season-list { display: flex; flex-direction: column; gap: 4px; }
  .set-season-row { padding: 8px 0; border-top: 1px solid var(--color-line); }
  .set-season-row:first-child { border-top: none; }
  .set-season-name { font-size: 12px; font-weight: 600; }
  .set-season-detail { font-size: 11px; color: var(--color-tx-2); margin-top: 2px; }

  .btn-primary { border: none; background: var(--color-accent); color: var(--color-on-accent); }
  .btn-secondary { border: 1px solid var(--color-line); background: var(--color-raised); color: var(--color-tx-2); }
  .btn-danger { border: none; background: var(--color-bad); color: #fff; }

  /* ── Bottom sheet ─────────────────────────────────────────── */
  .sheet-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 900; animation: fade-in 0.2s ease; border: none; padding: 0; cursor: default; }
  .sheet {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 901;
    max-height: 86dvh; overflow-y: auto; overscroll-behavior: contain;
    background: var(--color-surface); border: 1px solid var(--color-line); border-bottom: none;
    border-radius: 18px 18px 0 0; padding: 10px 18px calc(20px + env(safe-area-inset-bottom));
    animation: slide-up 0.22s ease; font-family: var(--font-body); color: var(--color-tx);
  }
  @media (prefers-reduced-motion: reduce) { .sheet-backdrop, .sheet { animation: none; } }
  @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes slide-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
  .sheet-handle { width: 36px; height: 4px; border-radius: 2px; background: var(--color-line); margin: 4px auto 14px; }

  .sheet-title { font-family: var(--font-display); font-size: 19px; letter-spacing: 0.5px; margin-bottom: 10px; }
  .sheet-loading { color: var(--color-tx-2); font-size: 12px; padding: 12px 0; }
  .sheet-text { font-size: 12px; color: var(--color-tx-2); line-height: 1.6; margin-bottom: 8px; }
  .sheet-text strong { color: var(--color-tx); }
  .sheet-meta { font-size: 11px; color: var(--color-tx-3); margin-bottom: 8px; }
  .code-area {
    width: 100%; height: 90px; background: var(--color-raised); color: var(--color-tx);
    border: 1px solid var(--color-line); border-radius: 8px; padding: 10px;
    font-family: var(--font-mono); font-size: 10px; resize: none; word-break: break-all; margin-bottom: 12px;
  }
  .sheet-actions { display: flex; flex-direction: column; gap: 8px; }
  .btn-full { min-height: 44px; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font-body); }
  .btn-full:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
