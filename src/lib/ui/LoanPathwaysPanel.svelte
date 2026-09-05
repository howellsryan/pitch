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
  let launcherTop = $state(0);
  let launcherLeft = $state(0);
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

    const loanTabs = screen.querySelector('.tr-panel .ftabs');
    const loanOut = loanTabs?.querySelectorAll('.ftab')?.[1];
    if (loanTabs && loanOut) {
      const screenBox = screen.getBoundingClientRect();
      const tabsBox = loanTabs.getBoundingClientRect();
      const loanOutBox = loanOut.getBoundingClientRect();
      launcherTop = Math.round(tabsBox.top - screenBox.top);
      launcherLeft = Math.round(loanOutBox.right - screenBox.left + 8);
    }
  }

  function scheduleLoanMarketSync() {
    window.requestAnimationFrame(syncLoanMarket);
  }

  onMount(() => {
    const screen = document.getElementById('screen-transfers');
    if (!screen) return;
    const observer = new window.MutationObserver(scheduleLoanMarketSync);
    observer.observe(screen, { childList:true, subtree:true, attributes:true, attributeFilter:['class'] });
    screen.addEventListener('click', scheduleLoanMarketSync);
    window.addEventListener('resize', scheduleLoanMarketSync);
    scheduleLoanMarketSync();
    return () => {
      observer.disconnect();
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
    class:open
    style={`top:${launcherTop}px;left:${launcherLeft}px`}
    onclick={() => { open = true; void load(); }}
    aria-label="Open loanee management"
  >Loanees{#if outgoing.length}<span>{outgoing.length}</span>{/if}</button>
{/if}

{#if open}
  <button class="pathway-backdrop" onclick={() => open = false} aria-label="Close loanees"></button>
  <aside class="pathway-drawer" aria-label="Loanees">
    <header><div><span>Development pathways</span><h2>Loans</h2><p>Compare genuine playing opportunity and follow real minutes, ratings and injuries after a move.</p></div><button onclick={() => open = false} aria-label="Close loanees">×</button></header>

    {#if !loaded}
      <div class="empty">Loading loanees…</div>
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
  .pathway-launcher{position:absolute;z-index:25;min-height:44px;display:flex;align-items:center;justify-content:center;gap:7px;border:1px solid var(--color-line);border-radius:999px;background:transparent;color:var(--color-tx-2);padding:0 16px;font:600 10px/1 var(--font-body);cursor:pointer}.pathway-launcher:hover{border-color:color-mix(in oklch,var(--color-tx) 22%,var(--color-line));color:var(--color-tx)}.pathway-launcher.open{background:var(--color-club);border-color:var(--color-club);color:var(--color-on-club)}.pathway-launcher span{min-width:18px;height:18px;display:grid;place-items:center;border-radius:999px;background:color-mix(in oklch,currentColor 12%,transparent);font:700 9px var(--font-mono)}.pathway-launcher:focus-visible{outline:2px solid var(--color-accent);outline-offset:2px}
  .pathway-backdrop{position:absolute;inset:0;z-index:80;border:0;background:rgb(0 0 0/.5)}.pathway-drawer{position:absolute;z-index:81;right:0;top:0;bottom:0;width:min(430px,94%);background:var(--color-ground);border-left:1px solid var(--color-line);box-shadow:-12px 0 30px rgb(0 0 0/.25);padding:14px;overflow:auto;color:var(--color-tx);font-family:var(--font-body)}
  header{display:flex;justify-content:space-between;gap:14px;border-bottom:1px solid var(--color-line);padding-bottom:10px;margin-bottom:12px}header span{font-size:8px;text-transform:uppercase;letter-spacing:2px;color:var(--color-club)}header h2{margin:2px 0;font:24px var(--font-display)}header p,.hint{margin:0;color:var(--color-tx-2);font-size:10px;line-height:1.45}header button{width:44px;height:44px;flex:0 0 44px;font-size:22px;border:1px solid var(--color-line);border-radius:var(--radius-bug);background:transparent;color:var(--color-tx);cursor:pointer}
  section{flex:none;min-height:0;background:var(--color-surface);border:1px solid var(--color-line);border-radius:var(--radius-bug);padding:10px;margin-bottom:10px}.section-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}.section-head h3{margin:0;font-size:12px}.section-head span{font:10px var(--font-mono);color:var(--color-tx-2)}
  .loan-row{display:grid;grid-template-columns:40px minmax(0,1fr) auto;grid-auto-rows:max-content;align-items:start;flex:none;height:auto!important;min-height:0!important;gap:8px;padding:8px 0;border-top:1px solid var(--color-line)}.loan-row:first-of-type{border-top:0}.rating{align-self:start;display:grid;place-items:start center;padding-top:1px;font:20px/1 var(--font-display)}.main{min-width:0;align-self:start;display:flex;flex-direction:column;gap:2px}.main strong{font-size:11px}.main span,.main small,.compact span,.compact small{font-size:9px;color:var(--color-tx-2)}.report{display:flex;gap:6px;flex-wrap:wrap;font-size:8px}.report b{font-weight:600}.report em{font-style:normal;color:var(--color-club)}button,select{font:inherit}.loan-row button,.compare-controls button,.offer{border:1px solid var(--color-line);background:var(--color-raised);color:var(--color-tx);border-radius:var(--radius-bug);padding:6px 8px;font-size:8px;height:max-content}.primary,.offer{background:var(--color-club)!important;color:var(--color-on-club)!important;border-color:var(--color-club)!important;font-weight:700}.offer:disabled{opacity:.5}
  .compact{display:flex;flex-direction:column;gap:2px;padding:6px 0;border-top:1px solid var(--color-line)}.compact:first-of-type{border-top:0}.compact strong{font-size:10px}.compare-controls{display:grid;grid-template-columns:1fr auto;gap:7px;margin-top:8px}.compare-controls select{min-width:0;background:var(--color-raised);color:var(--color-tx);border:1px solid var(--color-line);border-radius:var(--radius-bug);padding:7px;font-size:9px}
  .destinations{display:flex;flex-direction:column;gap:5px;margin-top:8px}.destinations article{display:grid;grid-template-columns:1fr auto;gap:4px 8px;background:var(--color-raised);padding:8px;border-radius:var(--radius-bug)}.destinations div{display:flex;gap:6px;align-items:baseline}.destinations strong{font-size:10px}.destinations span,.destinations small{font-size:8px;color:var(--color-tx-2)}.destinations b{font:18px var(--font-display);color:var(--color-club)}.destinations small,.destinations .offer{grid-column:1/-1}.destinations .offer{width:100%;margin-top:3px}.empty{padding:20px;text-align:center;color:var(--color-tx-2);font-size:10px}.empty.small{padding:10px}footer{font-size:8px;color:var(--color-tx-3);padding:2px 4px 10px}
  @media(max-width:620px){.pathway-launcher{padding:0 15px}.pathway-drawer{width:100%;border-left:0}.loan-row{grid-template-columns:36px minmax(0,1fr)}.loan-row>button{grid-column:1/-1}.compare-controls{grid-template-columns:1fr}.compare-controls button{width:100%}}
</style>
