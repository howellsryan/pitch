<script>
  import {
    exportSaveFile, getAllPlayers, getAllSeasons, getSave, getTeam, importSaveFile,
    importSaveFromCode, openDB, putPlayersBulk,
  } from '../../modules/db.js';
  import { assignPotentials } from '../../modules/potential.js';
  import { getHonorsForTeam } from '../../modules/season.js';
  import { fmt, toast } from '../../ui/helpers.js';
  import { _removeFullOverlay, _showFullOverlay, showEntryMenu } from '../../ui/renderers.js';
  import { screenTicks } from '../state/screens.svelte.js';
  import { api, clearAuth, isSignedIn, startGoogleLogin } from '../../cloud/api.js';
  import { deleteCareerEverywhere, pushSaveToCloud } from '../../cloud/sync.js';
  import {
    applyForVacancy, getManagerCareerView, resignAsManager, respondToApproach, tryCompletePendingUserHandover,
  } from '../../modules/managerUserActions.js';
  import { summarizeManagerDNA } from '../../modules/tactics.js';
  import { availableFunds, financialPressure } from '../../modules/clubFinance.js';
  import {
    describeFacilityConsumer, FACILITY_LEAD_TIME_WEEKS, facilityUpgradeCost, FACILITY_MAX_LEVEL, FACILITY_TRACKS,
  } from '../../modules/facilities.js';
  import { startFacilityUpgrade } from '../../modules/p7Runtime.js';

  const FACILITY_LABELS = { training:'Training', medical:'Medical', scouting:'Scouting' };
  const PRESSURE_LABELS = { stable:'Stable', strained:'Strained', critical:'Critical' };

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

  let managerView = $state(null);
  let managerBusy = $state(false);
  let resignConfirming = $state(false);

  let clubView = $state(null); // { team, available, pressure }
  let facilityBusy = $state(false);

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
    // Opportunistic safety net: an accepted job offer normally completes
    // right after acceptUserOffer (see doAccept below), but if the app was
    // closed before that ran, this catches it on the next screen load —
    // it's a no-op unless a handover is genuinely pending and the event
    // queue is safely empty (managerUserActions.js's own guard).
    const handoverResult = await tryCompletePendingUserHandover().catch(() => ({ completed:false }));
    if (handoverResult.completed) {
      window.location.reload();
      return;
    }
    const save = await getSave();
    seasons = [...(await getAllSeasons())].reverse();
    // Fire-and-forget: the account name is a nice-to-have refinement, not a
    // gate. Everything else on this screen is local IndexedDB data — `loaded`
    // must not wait on a network round trip to /api/auth/me.
    void loadCloudIdentity();
    managerView = await getManagerCareerView().catch(() => null);
    if (save) {
      const team = await getTeam(save.userTeamId).catch(() => null);
      clubView = team ? { team, available:availableFunds(team, save.transferMarket), pressure:financialPressure(team) } : null;
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

  function closeSheet() { if (!busy) { sheet = null; saveCode = ''; importCodeInput = ''; resignConfirming = false; } }

  function openManagerCareer() { sheet = 'manager'; resignConfirming = false; }

  async function refreshManagerView() {
    managerView = await getManagerCareerView().catch(() => managerView);
  }

  function confirmResign() { resignConfirming = true; }

  async function doResign() {
    managerBusy = true;
    try {
      await resignAsManager();
      toast('You have resigned. Clubs may approach you, or you can apply for an open job.', 'info', 6000);
      resignConfirming = false;
      await refreshManagerView();
    } catch (err) {
      toast('Could not resign: ' + err.message, 'error');
    } finally {
      managerBusy = false;
    }
  }

  async function doApply(vacancyId) {
    managerBusy = true;
    try {
      await applyForVacancy(vacancyId);
      toast('Application sent.', 'success');
      await refreshManagerView();
    } catch (err) {
      toast('Could not apply: ' + err.message, 'error');
    } finally {
      managerBusy = false;
    }
  }

  async function doDecline(approachId) {
    managerBusy = true;
    try {
      await respondToApproach(approachId, 'decline');
      await refreshManagerView();
    } catch (err) {
      toast('Error: ' + err.message, 'error');
    } finally {
      managerBusy = false;
    }
  }

  async function doAccept(approachId, clubName) {
    managerBusy = true;
    _showFullOverlay(`Joining ${clubName}…`);
    try {
      await respondToApproach(approachId, 'accept');
    } catch (err) {
      // Accepting itself failed — nothing was persisted, this is a genuine error.
      _removeFullOverlay();
      toast('Could not accept: ' + err.message, 'error');
      managerBusy = false;
      return;
    }
    // The offer is accepted and persisted from here on, regardless of what
    // happens next — a failure below must never read as "accept failed".
    try {
      const result = await tryCompletePendingUserHandover();
      if (result.completed) {
        window.location.reload();
        return;
      }
      // Not yet safe to hand over (an event was mid-flight) — it will
      // complete automatically the next time a screen loads or a gameweek
      // settles at its own safe boundary.
      toast(`Offer accepted — you'll take over at ${clubName} as soon as it's safe to switch.`, 'success', 6000);
    } catch {
      toast(`Offer accepted — you'll take over at ${clubName} as soon as it's safe to switch.`, 'success', 6000);
    } finally {
      _removeFullOverlay();
      await refreshManagerView();
      managerBusy = false;
    }
  }

  const FACILITY_ERROR_MESSAGES = {
    INSUFFICIENT_FUNDS: 'Not enough available funds for this upgrade.',
    UPGRADE_ALREADY_IN_PROGRESS: 'This facility is already being upgraded.',
    FACILITY_AT_MAX_LEVEL: 'Already at the maximum level.',
  };

  async function doUpgradeFacility(track) {
    facilityBusy = true;
    try {
      await startFacilityUpgrade(track);
      toast(`Upgrading ${FACILITY_LABELS[track] ?? track} — ready in ${FACILITY_LEAD_TIME_WEEKS} weeks.`, 'success', 5000);
      await load();
    } catch (err) {
      toast(FACILITY_ERROR_MESSAGES[err.message] || `Could not start upgrade: ${err.message}`, 'error');
    } finally {
      facilityBusy = false;
    }
  }

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
    try {
      await deleteCareerEverywhere();
      window.location.reload();
    } catch (err) {
      _removeFullOverlay();
      busy = false;
      toast('Could not delete career: ' + (err?.message || 'unknown error'), 'error');
    }
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

      {#if managerView}
        <div class="set-card">
          <div class="set-card-title">Manager Career</div>
          <div class="set-card-sub">{managerView.userManager?.name ?? managerName}</div>
          {#if managerView.isUnemployed}
            <div class="set-row">
              <div>
                <div class="set-nm">Unemployed</div>
                <div class="set-desc">
                  {managerView.approaches.length ? `${managerView.approaches.length} club${managerView.approaches.length === 1 ? '' : 's'} interested` : 'Keep advancing — clubs may approach you, or apply directly'}
                </div>
              </div>
              <button class="btn-set btn-primary" onclick={openManagerCareer}>Job Market</button>
            </div>
          {:else}
            <div class="set-row">
              <div>
                <div class="set-nm">Managing {managerView.currentTeam?.name ?? '—'}</div>
                <div class="set-desc">
                  {managerView.userManager?.record?.wins ?? 0}W {managerView.userManager?.record?.draws ?? 0}D {managerView.userManager?.record?.losses ?? 0}L
                </div>
              </div>
              <button class="btn-set btn-secondary" onclick={openManagerCareer}>Career</button>
            </div>
          {/if}
        </div>
      {/if}

      {#if clubView}
        <div class="set-card">
          <div class="set-card-title">Club</div>
          <div class="set-card-sub">Finance &amp; facilities</div>

          <div class="set-row">
            <div><div class="set-nm">Available Funds</div><div class="set-desc">Cash minus committed spending and unpaid obligations</div></div>
            <div style="font-weight:700;color:var(--tx)">{fmt.money(clubView.available)}</div>
          </div>
          <div class="set-row">
            <div><div class="set-nm">Financial Health</div><div class="set-desc">The board's own read of your finances</div></div>
            <div style="font-weight:700;color:{clubView.pressure === 'stable' ? 'var(--color-live)' : clubView.pressure === 'strained' ? 'var(--acc2)' : 'var(--acc3)'}">{PRESSURE_LABELS[clubView.pressure] ?? clubView.pressure}</div>
          </div>

          {#if clubView.team.finance?.recentEntries?.length}
            <div class="set-season-list">
              {#each clubView.team.finance.recentEntries.slice(0, 4) as entry, i (i)}
                <div class="set-season-row">
                  <div class="set-season-name">{entry.description || entry.category}</div>
                  <div class="set-season-detail" style="color:{entry.amount >= 0 ? 'var(--color-live)' : 'var(--acc3)'}">{entry.amount >= 0 ? '+' : ''}{fmt.money(entry.amount)}</div>
                </div>
              {/each}
            </div>
          {/if}

          {#each FACILITY_TRACKS as track (track)}
            {@const info = clubView.team.facilities?.tracks?.[track]}
            {@const level = info?.level ?? 1}
            {@const upgrading = info?.upgrading}
            {@const atMax = level >= FACILITY_MAX_LEVEL}
            {@const cost = facilityUpgradeCost(level)}
            <div class="set-row">
              <div>
                <div class="set-nm">{FACILITY_LABELS[track] ?? track} — Lv {level}/{FACILITY_MAX_LEVEL}</div>
                <div class="set-desc">
                  {#if upgrading}
                    Upgrading to Lv {upgrading.targetLevel} — ready season {upgrading.dueSeason}, GW {upgrading.dueGameweek}
                  {:else if atMax}
                    Maximum level reached
                  {:else}
                    {describeFacilityConsumer(track)} · {fmt.money(cost)}
                  {/if}
                </div>
              </div>
              <button class="btn-set btn-secondary" disabled={facilityBusy || Boolean(upgrading) || atMax || clubView.available < cost} onclick={() => doUpgradeFacility(track)}>
                {upgrading ? 'In Progress' : 'Upgrade'}
              </button>
            </div>
          {/each}
        </div>
      {/if}

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
    {:else if sheet === 'manager' && managerView}
      <div class="sheet-title">Manager Career</div>
      <div class="mgr-profile">
        <div class="mgr-profile-name">{managerView.userManager?.name ?? managerName}</div>
        <div class="mgr-profile-row">
          <span>Reputation</span><strong>{managerView.userManager?.reputation?.overall ?? '—'}</strong>
        </div>
        <div class="mgr-profile-row">
          <span>Career record</span>
          <strong>
            {managerView.userManager?.record?.matches ?? 0} apps ·
            {managerView.userManager?.record?.wins ?? 0}W {managerView.userManager?.record?.draws ?? 0}D {managerView.userManager?.record?.losses ?? 0}L
          </strong>
        </div>
        {#if managerView.userManager?.dna}
          <div class="mgr-profile-row">
            <span>Style</span><strong>{summarizeManagerDNA(managerView.userManager.dna).style}</strong>
          </div>
        {/if}
        {#if managerView.userManager?.record?.sackings || managerView.userManager?.record?.resignations}
          <div class="mgr-profile-row">
            <span>Past jobs</span>
            <strong>{managerView.userManager.record.sackings} sacked · {managerView.userManager.record.resignations} resigned</strong>
          </div>
        {/if}
      </div>

      {#if !managerView.isUnemployed}
        <div class="sheet-text">Currently managing <strong>{managerView.currentTeam?.name ?? '—'}</strong>.</div>
        {#if !resignConfirming}
          <div class="sheet-actions">
            <button class="btn-full btn-danger" disabled={managerBusy || !managerView.canResign} onclick={confirmResign}>Resign</button>
            {#if !managerView.canResign}<div class="set-desc">Finish the current match/event first.</div>{/if}
            <button class="btn-full btn-secondary" disabled={managerBusy} onclick={closeSheet}>Close</button>
          </div>
        {:else}
          <div class="sheet-text">Resign from {managerView.currentTeam?.name ?? 'this club'}? A caretaker takes over immediately and you become a free agent.</div>
          <div class="sheet-actions">
            <button class="btn-full btn-danger" disabled={managerBusy} onclick={doResign}>{managerBusy ? 'Resigning…' : 'Confirm Resignation'}</button>
            <button class="btn-full btn-secondary" disabled={managerBusy} onclick={() => resignConfirming = false}>Cancel</button>
          </div>
        {/if}
      {:else}
        <div class="mgr-section-title">Approaches</div>
        {#if !managerView.approaches.length}
          <div class="set-empty-inline">No clubs have approached you yet — keep advancing, or apply below.</div>
        {:else}
          <div class="mgr-list">
            {#each managerView.approaches as entry (entry.approach.id)}
              <div class="mgr-row">
                <div>
                  <div class="mgr-row-name">{entry.team.name}</div>
                  <div class="mgr-row-sub">Fit {entry.approach.fit}%</div>
                </div>
                <div class="mgr-row-actions">
                  <button class="btn-set btn-primary" disabled={managerBusy} onclick={() => doAccept(entry.approach.id, entry.team.name)}>Accept</button>
                  <button class="btn-set btn-secondary" disabled={managerBusy} onclick={() => doDecline(entry.approach.id)}>Decline</button>
                </div>
              </div>
            {/each}
          </div>
        {/if}

        {#if managerView.applications.length}
          <div class="mgr-section-title">Your Applications</div>
          <div class="mgr-list">
            {#each managerView.applications as entry (entry.approach.id)}
              <div class="mgr-row">
                <div>
                  <div class="mgr-row-name">{entry.team.name}</div>
                  <div class="mgr-row-sub">Awaiting a decision</div>
                </div>
                <div class="mgr-row-actions">
                  <button class="btn-set btn-primary" disabled={managerBusy} onclick={() => doAccept(entry.approach.id, entry.team.name)}>Accept</button>
                  <button class="btn-set btn-secondary" disabled={managerBusy} onclick={() => doDecline(entry.approach.id)}>Withdraw</button>
                </div>
              </div>
            {/each}
          </div>
        {/if}

        <div class="mgr-section-title">Open Jobs</div>
        {#if !managerView.openVacancies.length}
          <div class="set-empty-inline">No open vacancies to apply for right now.</div>
        {:else}
          <div class="mgr-list">
            {#each managerView.openVacancies as entry (entry.vacancy.id)}
              <div class="mgr-row">
                <div class="mgr-row-name">{entry.team.name}</div>
                <button class="btn-set btn-secondary" disabled={managerBusy} onclick={() => doApply(entry.vacancy.id)}>Apply</button>
              </div>
            {/each}
          </div>
        {/if}

        <div class="sheet-actions">
          <button class="btn-full btn-secondary" onclick={closeSheet}>Close</button>
        </div>
      {/if}
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

  /* ── Manager career sheet ─────────────────────────────────── */
  .mgr-profile { background: var(--color-raised); border-radius: 10px; padding: 12px 14px; margin-bottom: 14px; display: flex; flex-direction: column; gap: 6px; }
  .mgr-profile-name { font-family: var(--font-display); font-size: 15px; margin-bottom: 2px; }
  .mgr-profile-row { display: flex; align-items: center; justify-content: space-between; font-size: 11.5px; color: var(--color-tx-2); }
  .mgr-profile-row strong { color: var(--color-tx); font-weight: 600; }
  .mgr-section-title { font-family: var(--font-mono); font-size: 9px; color: var(--color-tx-3); text-transform: uppercase; letter-spacing: 2px; margin: 14px 0 8px; }
  .mgr-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 4px; }
  .mgr-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; background: var(--color-raised); border-radius: 10px; }
  .mgr-row-name { font-size: 12.5px; font-weight: 600; }
  .mgr-row-sub { font-size: 10.5px; color: var(--color-tx-2); margin-top: 1px; }
  .mgr-row-actions { display: flex; gap: 6px; flex-shrink: 0; }
  .mgr-row-actions .btn-set, .mgr-row .btn-set { min-height: 36px; padding: 0 12px; }
</style>
