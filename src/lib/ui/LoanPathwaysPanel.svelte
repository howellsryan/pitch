<script>
  import { onMount } from 'svelte';
  import { getAllPlayers, getAllTeams, getSave, openDB } from '../../modules/db.js';
  import { primaryRating } from '../../modules/matchEngine.js';
  import { compareLoanDestinations, getManagedLoanPathways, recallManagedLoan } from '../../modules/p9Runtime.js';
  import { requestManagedLoanOutOffer } from '../../modules/p9LoanMarket.js';
  import { isOwnedByTeam, isSeniorEligiblePlayer, normalizePlayerStatus } from '../../modules/playerStatus.js';
  import { navigateTo, toast } from '../../ui/helpers.js';
  import { screenTicks } from '../state/screens.svelte.js';

  let open = $state(false);
  let loaded = $state(false);
  let loanMarketActive = $state(false);
  let launcherTop = $state(112);
  let save = $state(null);
  let teams = $state(new Map());
  let outgoing = $state([]);
  let incoming = $state([]);
  let candidates = $state([]);
  let selectedId = $state('');
  let destinations = $state([]);
  let comparing = $state(false);
  let offeringTeamId = $state(null);

  async function load() {
    await openDB();
    save = await getSave();
    if (!save || save._deleted) return;
    const [pathways, allPlayers, allTeams] = await Promise.all([getManagedLoanPathways(), getAllPlayers(), getAllTeams()]);
    outgoing = pathways.outgoing;
    incoming = pathways.incoming;
    teams = new Map(allTeams.map(team => [team.id, team]));
    candidates = allPlayers
      .map(normalizePlayerStatus)
      .filter(player => isOwnedByTeam(player, save.userTeamId)
        && isSeniorEligiblePlayer(player, save.userTeamId)
        && !player.onLoan
        && Number(player.age ?? 99) <= 23
        && !player.signedThisSeason)
      .sort((a,b) => primaryRating(b) - primaryRating(a));
    if (!selectedId && candidates.length) selectedId = String(candidates[0].id);
    loaded = true;
  }

  function syncLoanMarket() {
    const screen = document.getElementById('screen-transfers');
    if (!screen) return;
    const loansTab = [...screen.querySelectorAll('.tr-tabs .tr-tab')]
      .find(button => button.textContent?.trim().startsWith('Loans'));
    const isActive = Boolean(loansTab?.classList.contains('on'));
    loanMarketActive = isActive;
    if (!isActive) {
      open = false;
      return;
    }

    const title = screen.querySelector('.tr-panel .tr-panel-title');
    if (title) {
      const screenBox = screen.getBoundingClientRect();
      const titleBox = title.getBoundingClientRect();
      launcherTop = Math.max(8, Math.round(titleBox.top - screenBox.top - 10));
    }
  }

  function scheduleLoanMarketSync() {
    requestAnimationFrame(syncLoanMarket);
  }

  onMount(() => {
    const screen = document.getElementById('screen-transfers');
    if (!screen) return;
    screen.addEventListener('click', scheduleLoanMarketSync);
    window.addEventListener('resize', scheduleLoanMarketSync);
    scheduleLoanMarketSync();
    return () => {
      screen.removeEventListener('click', scheduleLoanMarketSync);
      window.removeEventListener('resize', scheduleLoanMarketSync);
    };
  });

  $effect(() => {
    void screenTicks.transfers;
    if (open) void load();
  });

  function latestReport(player) {
    const reports = player.loanReports ?? [];
    return reports[reports.length - 1] ?? null;
  }

  async function compare() {
    if (!selectedId || comparing) return;
    comparing = true;
    try {
      destinations = await compareLoanDestinations(selectedId, { limit:8 });
      if (!destinations.length) toast('No suitable loan destinations are available right now.', 'info');
    } catch { toast('Could not compare loan destinations.', 'error'); }
    finally { comparing = false; }
  }

  async function requestOffer(destination) {
    if (!selectedId || offeringTeamId) return;
    offeringTeamId = destination.teamId;
    try {
      await requestManagedLoanOutOffer(selectedId, destination.teamId);
      toast(`${teams.get(destination.teamId)?.name ?? 'Club'} sent a staged loan offer. Review it in Deals.`, 'success', 3600);
      destinations = [];
      open = false;
      navigateTo('transfers');
      screenTicks.transfers++;
    } catch (error) {
      const messages = {
        WINDOW_CLOSED:'The transfer window is closed.',
        DESTINATION_SQUAD_FULL:'That club has no senior registration space.',
        DESTINATION_CANNOT_AFFORD:'That club cannot afford the loan package.',
        PLAYER_HAS_ACTIVE_DEAL:'This player already has an active negotiation.',
        SIGNED_THIS_SEASON:'This player already moved this season.',
      };
      toast(messages[error.message] ?? 'Could not open a staged loan agreement with this club.', 'error');
    } finally { offeringTeamId = null; }
  }

  async function recall(player) {
    if (!window.confirm(`Recall ${player.name} from ${teams.get(player.registeredTeamId)?.name ?? 'their loan club'}?`)) return;
    try {
      await recallManagedLoan(player.id);
      toast(`${player.name} recalled`, 'success');
      destinations = [];
      await load();
      screenTicks.squad++;
      screenTicks.transfers++;
    } catch (error) {
      toast(error.message === 'LOAN_NOT_RECALLABLE' ? 'This agreement does not allow a recall.' : 'Could not recall this player.', 'error');
    }
  }
</script>

{#if loanMarketActive}
  <button
    class="pathway-launcher"
    style={`top:${launcherTop}px`}
    onclick={() => { open = true; void load(); }}
    aria-label="Open loan pathways"
  >
    <span>Pathways</span>
    {#if outgoing.length}<b>{outgoing.length}</b>{/if}
  </button>
{/if}

{#if open}
  <button class="pathway-backdrop" onclick={() => open = false} aria-label="Close loan pathways"></button>
  <aside class="pathway-drawer" aria-label="Loan pathways">
    <header><div><span>Development pathways</span><h2>Loans</h2><p>Compare genuine playing opportunity and follow real minutes, ratings and injuries after a move.</p></div><button onclick={() => open = false} aria-label="Close loan pathways">×</button></header>

    {#if !loaded}
      <div class="empty">Loading pathways…</div>
    {:else}
      <section>
        <div class="section-head"><h3>Out on loan</h3><span>{outgoing.length}</span></div>
        {#if !outgoing.length}<div class="empty small">No players currently loaned out.</div>{/if}
        {#each outgoing as player (player.id)}
          {@const report = latestReport(player)}
          <article class="loan-row">
            <div class="rating">{primaryRating(player)}</div>
            <div class="main"><strong>{player.name}</strong><span>{teams.get(player.registeredTeamId)?.name ?? player.registeredTeamId} · {player.activeLoanAgreement?.expectedRole ?? 'rotation'}</span>
              {#if report}
                <div class="report"><b>{report.minutes} mins</b><b>{report.appearances} apps</b><b>{report.averageRating ?? '—'} avg</b><em>{report.roleDeliveryLabel}</em></div>
              {:else}<small>First report will use canonical match evidence.</small>{/if}
              {#if player.injured}<small>{player.injuryName ?? 'Injured'} · rehabilitation remains at the registration club</small>{/if}
            </div>
            {#if player.activeLoanAgreement?.recallAllowed}<button onclick={() => recall(player)}>Recall</button>{/if}
          </article>
        {/each}
      </section>

      {#if incoming.length}
        <section>
          <div class="section-head"><h3>Loaned in</h3><span>{incoming.length}</span></div>
          {#each incoming as player (player.id)}
            <article class="compact"><strong>{player.name}</strong><span>{player.position} · from {teams.get(player.contractTeamId)?.name ?? player.contractTeamId}</span><small>{player.minutes ?? 0} mins · {player.averageRating ?? '—'} avg</small></article>
          {/each}
        </section>
      {/if}

      <section>
        <div class="section-head"><h3>Find a pathway</h3><span>{candidates.length} eligible</span></div>
        <p class="hint">Scores combine expected minutes, positional depth, tactical fit, coaching, facilities and affordability. A high score is an opportunity projection, not guaranteed development.</p>
        {#if candidates.length}
          <div class="compare-controls"><select bind:value={selectedId}>{#each candidates as player (player.id)}<option value={String(player.id)}>{player.name} · {player.position} · {primaryRating(player)}</option>{/each}</select><button class="primary" disabled={comparing} onclick={compare}>{comparing ? 'Comparing…' : 'Compare clubs'}</button></div>
        {:else}<div class="empty small">No under-24 senior player is currently eligible for a new loan.</div>{/if}
        {#if destinations.length}
          <div class="destinations">
            {#each destinations as destination (destination.teamId)}
              <article>
                <div><strong>{teams.get(destination.teamId)?.name ?? destination.teamId}</strong><span>{destination.recommendation}</span></div>
                <b>{destination.pathwayScore}</b>
                <small>{destination.expectedMinutes} expected mins · {destination.expectedRole} role · {Math.round(destination.tacticalFit * 100)}% tactical fit</small>
                <button class="offer" disabled={Boolean(offeringTeamId)} onclick={() => requestOffer(destination)}>{offeringTeamId === destination.teamId ? 'Opening…' : 'Invite loan offer'}</button>
              </article>
            {/each}
          </div>
        {/if}
      </section>

      <footer>Loan reports update every few world weeks from real match participation.</footer>
    {/if}
  </aside>
{/if}

<style>
  .pathway-launcher{position:absolute;right:16px;z-index:18;min-width:104px;min-height:44px;display:flex;align-items:center;justify-content:center;gap:7px;border:1px solid var(--color-line);border-radius:var(--radius-bug);background:var(--color-raised);color:var(--color-tx);padding:0 12px;font:600 10px/1 var(--font-mono);letter-spacing:.055em;text-transform:uppercase;box-shadow:inset 3px 0 0 var(--color-accent);cursor:pointer}.pathway-launcher b{min-width:18px;height:18px;display:grid;place-items:center;border-radius:2px;background:var(--color-accent);color:var(--color-on-accent);font:600 9px var(--font-mono)}.pathway-launcher:focus-visible{outline:2px solid var(--color-accent);outline-offset:2px}
  .pathway-backdrop{position:absolute;inset:0;z-index:80;border:0;background:rgb(0 0 0/.5)}.pathway-drawer{position:absolute;z-index:81;right:0;top:0;bottom:0;width:min(430px,94%);background:var(--color-ground);border-left:1px solid var(--color-line);box-shadow:-12px 0 30px rgb(0 0 0/.25);padding:14px;overflow:auto;color:var(--color-tx);font-family:var(--font-body)}
  header{display:flex;justify-content:space-between;gap:14px;border-bottom:1px solid var(--color-line);padding-bottom:10px;margin-bottom:12px}header span{font-size:8px;text-transform:uppercase;letter-spacing:2px;color:var(--color-club)}header h2{margin:2px 0;font:24px var(--font-display)}header p,.hint{margin:0;color:var(--color-tx-2);font-size:10px;line-height:1.45}header button{width:44px;height:44px;flex:0 0 44px;font-size:22px;border:1px solid var(--color-line);border-radius:var(--radius-bug);background:transparent;color:var(--color-tx);cursor:pointer}
  section{background:var(--color-surface);border:1px solid var(--color-line);border-radius:var(--radius-bug);padding:10px;margin-bottom:10px}.section-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}.section-head h3{margin:0;font-size:12px}.section-head span{font:10px var(--font-mono);color:var(--color-tx-2)}
  .loan-row{display:grid;grid-template-columns:40px 1fr auto;gap:8px;padding:8px 0;border-top:1px solid var(--color-line)}.loan-row:first-of-type{border-top:0}.rating{display:grid;place-items:center;font:20px var(--font-display)}.main{min-width:0;display:flex;flex-direction:column;gap:2px}.main strong{font-size:11px}.main span,.main small,.compact span,.compact small{font-size:9px;color:var(--color-tx-2)}.report{display:flex;gap:6px;flex-wrap:wrap;font-size:8px}.report b{font-weight:600}.report em{font-style:normal;color:var(--color-club)}button,select{font:inherit}.loan-row button,.compare-controls button,.offer{border:1px solid var(--color-line);background:var(--color-raised);color:var(--color-tx);border-radius:var(--radius-bug);padding:6px 8px;font-size:8px;height:max-content}.primary,.offer{background:var(--color-club)!important;color:var(--color-on-club)!important;border-color:var(--color-club)!important;font-weight:700}.offer:disabled{opacity:.5}
  .compact{display:flex;flex-direction:column;gap:2px;padding:6px 0;border-top:1px solid var(--color-line)}.compact:first-of-type{border-top:0}.compact strong{font-size:10px}.compare-controls{display:grid;grid-template-columns:1fr auto;gap:7px;margin-top:8px}.compare-controls select{min-width:0;background:var(--color-raised);color:var(--color-tx);border:1px solid var(--color-line);border-radius:var(--radius-bug);padding:7px;font-size:9px}
  .destinations{display:flex;flex-direction:column;gap:5px;margin-top:8px}.destinations article{display:grid;grid-template-columns:1fr auto;gap:4px 8px;background:var(--color-raised);padding:8px;border-radius:var(--radius-bug)}.destinations div{display:flex;gap:6px;align-items:baseline}.destinations strong{font-size:10px}.destinations span,.destinations small{font-size:8px;color:var(--color-tx-2)}.destinations b{font:18px var(--font-display);color:var(--color-club)}.destinations small,.destinations .offer{grid-column:1/-1}.destinations .offer{width:100%;margin-top:3px}.empty{padding:20px;text-align:center;color:var(--color-tx-2);font-size:10px}.empty.small{padding:10px}footer{font-size:8px;color:var(--color-tx-3);padding:2px 4px 10px}
  @media(max-width:620px){.pathway-launcher{right:12px;min-width:92px;padding:0 10px}.pathway-drawer{width:100%;border-left:0}.loan-row{grid-template-columns:36px 1fr}.loan-row>button{grid-column:1/-1}.compare-controls{grid-template-columns:1fr}.compare-controls button{width:100%}}
</style>
