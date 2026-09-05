<script>
  import { addScoutingAssignment, removeScoutingAssignment } from '../../modules/p5Runtime.js';
  import { MAX_SCOUTING_ASSIGNMENTS, assignmentScoutingReports, scoutingAssignmentIsCurrent, scoutingReportIsCurrent } from '../../modules/scouting.js';
  import { TERMINAL_DEAL_STATES } from '../../modules/transferMarket.js';
  import { isUserClubDeal } from '../../modules/transferDealActions.js';
  import { createUserMarketDeal, transferWindowStatus } from '../../modules/transfers.js';
  import { fmt, toast } from '../../ui/helpers.js';
  import { screenTicks } from '../state/screens.svelte.js';

  let { save, players = [], teams = [], onchange = () => {} } = $props();
  let busy = $state(false);
  let assignmentType = $state('position');
  let position = $state('ST');
  let league = $state('Premier League');
  let openAssignmentId = $state(null);

  // A report that says "sign him" and then makes you go and find him in the Buy
  // list is a dead end. The offer opens from the report itself, on the fee the
  // scout actually estimated.
  const OFFER_MSGS = {
    WINDOW_CLOSED: 'The transfer window is closed.',
    SIGNED_THIS_SEASON: 'This player has already moved once this season.',
    INSUFFICIENT_FUNDS: 'Not enough budget for that bid.',
    MARKET_CAP_REACHED: 'You already have too many negotiations open.',
    PLAYER_NOT_FOUND: 'That player could not be found.',
  };
  let offerSheet = $state(null); // { report, player, teamName }
  let offerAmount = $state(0);
  let offerBusy = $state(false);
  const windowStatus = $derived(transferWindowStatus(save));
  // `createUserMarketDeal` returns the *existing* deal rather than throwing when
  // one is already open for a player, so without this a second bid would report
  // "Enquiry sent" while the original, lower fee quietly stood.
  // Only the managed club's own negotiations: the market also carries AI-vs-AI
  // deals, which would otherwise disable the button for a target this manager
  // has never bid for and point them at a Deals tab that shows nothing.
  const negotiatingPlayerIds = $derived(new Set(
    (save?.transferMarket?.activeDeals ?? [])
      .filter(deal => !TERMINAL_DEAL_STATES.has(deal.state) && isUserClubDeal(deal, save?.userTeamId))
      .map(deal => String(deal.playerId)),
  ));

  /** The scout's own upper estimate is the sensible opening bid. */
  function reportOpeningBid(report) {
    const min = Number(report?.financial?.feeMin ?? 0);
    const max = Number(report?.financial?.feeMax ?? min);
    return Math.max(0, Math.round(max || min));
  }

  function canOfferFor(player) {
    if (!player || !save) return false;
    if (String(player.teamId) === String(save.userTeamId)) return false;
    return String(player.teamId) !== 'free_agents';
  }

  function isNegotiating(player) {
    return player ? negotiatingPlayerIds.has(String(player.id)) : false;
  }

  function openOffer(report, player) {
    if (!canOfferFor(player)) return;
    if (isNegotiating(player)) {
      toast(`You already have an open negotiation for ${player.name}. Manage it under Transfers → Deals.`, 'info', 4000);
      return;
    }
    offerSheet = { report, player, teamName:teamById.get(String(player.teamId))?.name ?? 'their club' };
    offerAmount = reportOpeningBid(report);
  }

  function closeOffer() { if (!offerBusy) offerSheet = null; }

  async function sendOffer() {
    if (!offerSheet || offerBusy) return;
    offerBusy = true;
    try {
      const requested = Math.max(0, Math.round(offerAmount));
      const deal = await createUserMarketDeal(offerSheet.player.id, {
        type:'transfer',
        terms:{ fee:{ upfront:requested } },
      });
      // Belt and braces against the same silent-existing-deal return: the state
      // can have moved on between this panel's last load and the click.
      if (deal?.createdBy !== 'user' || Number(deal?.terms?.fee?.upfront) !== requested) {
        toast(`${offerSheet.player.name} already has an open negotiation. Manage it under Transfers → Deals.`, 'info', 4200);
      } else {
        toast(`Enquiry sent for ${offerSheet.player.name}. Track it in Transfers → Deals.`, 'success', 4200);
      }
      offerSheet = null;
      screenTicks.transfers++;
      await onchange();
    } catch (error) {
      toast(OFFER_MSGS[error.message] ?? 'Could not open an enquiry for this player.', 'error', 3600);
    } finally {
      offerBusy = false;
    }
  }

  const scouting = $derived(save?.scouting ?? { assignments:[], reports:[] });
  const assignments = $derived((scouting.assignments ?? [])
    .filter(item => scoutingAssignmentIsCurrent(item, save?.season)));
  // Knowledge expires with the season, exactly as observedPlayerProfile treats
  // it — otherwise this list would still show last season's reports as current.
  const reports = $derived([...(scouting.reports ?? [])]
    .filter(report => scoutingReportIsCurrent(report, save?.season))
    .reverse()
    .slice(0, 20));
  const playerById = $derived(new Map(players.map(player => [String(player.id), player])));
  const teamById = $derived(new Map(teams.map(team => [String(team.id), team])));
  const leagueOptions = $derived([...new Set(teams.map(team => team.league).filter(Boolean))].sort());
  const activeCount = $derived(assignments.filter(item => item.status === 'active').length);
  const reportCountById = $derived(new Map(assignments.map(item =>
    [item.id, assignmentScoutingReports(scouting, item.id, save?.season).length])));

  const openAssignment = $derived(openAssignmentId
    ? assignments.find(item => item.id === openAssignmentId) ?? null
    : null);
  const openAssignmentReports = $derived(openAssignment
    ? assignmentScoutingReports(scouting, openAssignment.id, save?.season)
      .map(report => ({ report, player:playerById.get(String(report.playerId)) }))
      .sort((a, b) => (b.report.current?.max ?? 0) - (a.report.current?.max ?? 0))
    : []);

  function stageLabel(stage) {
    return stage === 'complete' ? 'Complete' : stage === 'detailed' ? 'Detailed' : stage === 'observed' ? 'Observed' : 'Assigned';
  }

  function assignmentLabel(assignment) {
    return assignment?.label ?? assignment?.position ?? assignment?.league ?? 'Player report';
  }

  function abilityRange(report) {
    return report.exact ? `${report.current?.min}` : `${report.current?.min}–${report.current?.max}`;
  }

  function futureRange(report) {
    return report.exact ? `${report.future?.min}` : `${report.future?.min}–${report.future?.max}`;
  }

  function feeRange(report) {
    const min = report.financial?.feeMin ?? 0;
    const max = report.financial?.feeMax ?? min;
    return report.exact || min === max ? fmt.money(min) : `${fmt.money(min)}–${fmt.money(max)}`;
  }

  function reportPlayer(report) {
    return playerById.get(String(report.playerId));
  }

  async function addAssignment() {
    if (busy || activeCount >= MAX_SCOUTING_ASSIGNMENTS) return;
    busy = true;
    try {
      const assignment = assignmentType === 'league'
        ? { type:'league', league, label:`${league} watch` }
        : { type:'position', position, label:`${position} search` };
      await addScoutingAssignment(assignment);
      toast(`${assignment.label} added to scouting.`, 'success', 2600);
      await onchange();
    } catch (error) {
      toast(error.message === 'SCOUTING_ASSIGNMENT_CAP' ? 'You already have the maximum number of scouting assignments.' : 'Could not add scouting assignment.', 'error', 3000);
    } finally {
      busy = false;
    }
  }

  async function removeAssignment(id) {
    if (busy) return;
    busy = true;
    try {
      await removeScoutingAssignment(id);
      await onchange();
    } catch {
      toast('Could not remove scouting assignment.', 'error', 2800);
    } finally {
      busy = false;
    }
  }
</script>

<div class="scouting-panel">
  <div class="scouting-summary">
    <div>
      <span>Scouting network</span>
      <strong>{activeCount}/{MAX_SCOUTING_ASSIGNMENTS} active</strong>
    </div>
    <p>Reports improve over completed gameweeks. Early information is deliberately uncertain and can become stale.</p>
  </div>

  <div class="assignment-builder">
    <div class="segment" aria-label="Assignment type">
      <button class:active={assignmentType === 'position'} onclick={() => assignmentType = 'position'}>Position</button>
      <button class:active={assignmentType === 'league'} onclick={() => assignmentType = 'league'}>League</button>
    </div>
    {#if assignmentType === 'position'}
      <select bind:value={position} aria-label="Scouting position">
        {#each ['GK','CB','RB','LB','CDM','CM','CAM','RW','LW','ST'] as option (option)}<option value={option}>{option}</option>{/each}
      </select>
    {:else}
      <select bind:value={league} aria-label="Scouting league">
        {#each leagueOptions as option (option)}<option value={option}>{option}</option>{/each}
      </select>
    {/if}
    <button class="primary" disabled={busy || activeCount >= MAX_SCOUTING_ASSIGNMENTS} onclick={addAssignment}>Add assignment</button>
  </div>

  <div class="section-title">Assignments</div>
  {#if !assignments.length}
    <div class="empty">No assignments yet. Start a position or league search, or scout a player from their transfer profile.</div>
  {:else}
    <div class="assignment-list">
      {#each assignments as assignment (assignment.id)}
        {@const found = reportCountById.get(assignment.id) ?? 0}
        <div class="assignment-row">
          <button
            class="assignment-open"
            onclick={() => openAssignmentId = assignment.id}
            aria-label={`Open ${found} scouted player${found === 1 ? '' : 's'} found by ${assignmentLabel(assignment)}`}
          >
            <strong>{assignmentLabel(assignment)}{#if assignment.mode === 'full'}<em class="mode-tag">Dedicated</em>{/if}</strong>
            <span>{stageLabel(assignment.stage)} · {assignment.weeks ?? 0} week{assignment.weeks === 1 ? '' : 's'} of evidence · {found} player{found === 1 ? '' : 's'} found</span>
          </button>
          <button disabled={busy} onclick={() => removeAssignment(assignment.id)}>{assignment.status === 'complete' ? 'Clear' : 'Cancel'}</button>
        </div>
      {/each}
    </div>
  {/if}

  <div class="section-title">Latest reports</div>
  {#if !reports.length}
    <div class="empty">Reports will appear after the next completed world week.</div>
  {:else}
    <div class="report-list">
      {#each reports as report (`${report.playerId}:${report.observedWeekKey}`)}
        {@const player = reportPlayer(report)}
        <article class="report-card">
          <div class="report-head">
            <div><strong>{player?.name ?? report.playerId}</strong><span>{player?.position ?? ''} · {stageLabel(report.stage)}</span></div>
            <span class="confidence">{report.exact ? 'Fully scouted' : `${report.confidenceLabel} confidence`}</span>
          </div>
          <div class="report-grid">
            <div><span>Current</span><strong>{abilityRange(report)}</strong></div>
            <div><span>Future</span><strong>{futureRange(report)}</strong></div>
            <div><span>Tactical</span><strong>{report.tactical?.fit ?? 'Unknown'}</strong></div>
            <div><span>Interest</span><strong>{report.status?.joiningInterest ?? 'Unknown'}</strong></div>
          </div>
          {#if canOfferFor(player)}
            <button class="report-offer" disabled={!windowStatus.open || isNegotiating(player)} onclick={() => openOffer(report, player)}>
              {!windowStatus.open ? 'Transfer window closed' : isNegotiating(player) ? 'Negotiation already open' : `Make an offer · ${feeRange(report)}`}
            </button>
          {/if}
        </article>
      {/each}
    </div>
  {/if}
</div>

{#if openAssignment}
  <button class="assignment-backdrop" onclick={() => openAssignmentId = null} aria-label="Close scouted players"></button>
  <div class="assignment-modal" role="dialog" aria-modal="true" aria-label={`Players scouted by ${assignmentLabel(openAssignment)}`}>
    <div class="modal-head">
      <div>
        <span>Assignment</span>
        <strong>{assignmentLabel(openAssignment)}</strong>
        <small>{stageLabel(openAssignment.stage)} · {openAssignment.weeks ?? 0} week{openAssignment.weeks === 1 ? '' : 's'} of evidence</small>
      </div>
      <button class="modal-close" onclick={() => openAssignmentId = null} aria-label="Close">Close</button>
    </div>
    <div class="modal-body">
      {#if !openAssignmentReports.length}
        <div class="empty">This assignment has not filed a report yet. Scouts report back after a completed gameweek.</div>
      {:else}
        {#each openAssignmentReports as entry (entry.report.playerId)}
          {@const report = entry.report}
          {@const player = entry.player}
          <article class="report-card">
            <div class="report-head">
              <div>
                <strong>{player?.name ?? report.playerId}</strong>
                <span>{player?.position ?? ''}{player?.age ? ` · Age ${player.age}` : ''}{teamById.get(String(player?.teamId))?.name ? ` · ${teamById.get(String(player.teamId)).name}` : ''}</span>
              </div>
              <span class="confidence">{report.exact ? 'Fully scouted' : `${report.confidenceLabel} confidence`}</span>
            </div>
            <div class="report-grid">
              <div><span>Current</span><strong>{abilityRange(report)}</strong></div>
              <div><span>Future</span><strong>{futureRange(report)}</strong></div>
              <div><span>Est. fee</span><strong>{feeRange(report)}</strong></div>
              <div><span>Interest</span><strong>{report.status?.joiningInterest ?? 'Unknown'}</strong></div>
            </div>
            {#if canOfferFor(player)}
              <button class="report-offer" disabled={!windowStatus.open || isNegotiating(player)} onclick={() => openOffer(report, player)}>
                {!windowStatus.open ? 'Transfer window closed' : isNegotiating(player) ? 'Negotiation already open' : 'Make an offer'}
              </button>
            {/if}
          </article>
        {/each}
      {/if}
    </div>
  </div>
{/if}

{#if offerSheet}
  {@const bid = reportOpeningBid(offerSheet.report)}
  <button class="offer-backdrop" onclick={closeOffer} aria-label="Close offer"></button>
  <div class="offer-modal" role="dialog" aria-modal="true" aria-label={`Offer for ${offerSheet.player.name}`}>
    <div class="modal-head">
      <div>
        <span>Opening offer</span>
        <strong>{offerSheet.player.name}</strong>
        <small>{offerSheet.player.position ?? ''} · {offerSheet.teamName}</small>
      </div>
      <button class="modal-close" onclick={closeOffer} aria-label="Close">Close</button>
    </div>
    <div class="offer-body">
      <div class="offer-row"><span>Scout's estimate</span><strong>{feeRange(offerSheet.report)}</strong></div>
      <div class="offer-row"><span>Your bid</span><strong>{fmt.money(offerAmount)}</strong></div>
      <label class="offer-slider">
        <span class="offer-slider-label">Adjust bid</span>
        <input
          type="range" min={Math.round(bid * 0.6)} max={Math.max(1, Math.round(bid * 1.6))}
          step={Math.max(50_000, Math.round(bid / 100))} bind:value={offerAmount}
          aria-label="Offer amount"
        />
      </label>
      <p class="offer-note">
        The bid opens a normal negotiation — the selling club responds at the next market update, and you can track it under Transfers → Deals.
      </p>
      <button class="primary offer-send" disabled={offerBusy || offerAmount <= 0} onclick={sendOffer}>
        {offerBusy ? 'Sending…' : 'Send enquiry'}
      </button>
    </div>
  </div>
{/if}

<style>
  .scouting-panel { display:flex; flex-direction:column; gap:12px; min-height:0; overflow:auto; padding-bottom:8px; }
  .scouting-summary { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1.4fr); gap:12px; padding:12px; border:1px solid var(--color-line); border-radius:12px; background:var(--color-surface); }
  .scouting-summary span, .section-title, .report-grid span { display:block; color:var(--color-tx-3); font:700 9px/1.2 var(--font-mono); letter-spacing:.08em; text-transform:uppercase; }
  .scouting-summary strong { display:block; margin-top:4px; font:17px var(--font-display); color:var(--color-tx); }
  .scouting-summary p { margin:0; color:var(--color-tx-2); font-size:11px; line-height:1.45; }
  .assignment-builder { display:grid; grid-template-columns:auto minmax(120px,1fr) auto; gap:8px; align-items:center; }
  .segment { display:flex; padding:3px; border:1px solid var(--color-line); border-radius:9px; background:var(--color-raised); }
  .segment button, .assignment-row button, .primary { min-height:34px; border:0; border-radius:7px; padding:0 10px; cursor:pointer; font:600 10px var(--font-body); }
  .segment button { background:transparent; color:var(--color-tx-3); }
  .segment button.active { background:var(--color-club); color:var(--color-on-club,#fff); }
  select { min-height:40px; padding:0 10px; border:1px solid var(--color-line); border-radius:9px; background:var(--color-surface); color:var(--color-tx); }
  .primary { min-height:40px; background:var(--color-club); color:var(--color-on-club,#fff); }
  button:disabled { opacity:.45; cursor:not-allowed; }
  .section-title { margin-top:2px; }
  .assignment-list, .report-list { display:grid; gap:7px; }
  .assignment-row { display:flex; align-items:center; gap:10px; padding:10px 11px; border:1px solid var(--color-line); border-radius:10px; background:var(--color-surface); }
  .assignment-open { min-width:0; flex:1; padding:0; text-align:left; background:transparent; border:0; color:inherit; cursor:pointer; }
  .assignment-row strong, .assignment-row span { display:block; }
  .assignment-row strong { display:flex; align-items:center; gap:6px; font-size:12px; color:var(--color-tx); }
  .assignment-row span { margin-top:3px; color:var(--color-tx-3); font:9px var(--font-mono); }
  .mode-tag { flex-shrink:0; padding:1px 5px; border-radius:999px; background:color-mix(in oklch,var(--color-club) 22%,transparent); color:var(--color-club); font:700 8px var(--font-mono); font-style:normal; text-transform:uppercase; letter-spacing:.06em; }
  .assignment-row > button:last-child { border:1px solid var(--color-line); background:var(--color-raised); color:var(--color-tx-2); }
  .assignment-open:focus-visible, .modal-close:focus-visible { outline:2px solid var(--color-accent); outline-offset:2px; }

  .assignment-backdrop { position:fixed; inset:0; z-index:940; border:0; padding:0; background:rgba(0,0,0,.66); }
  .assignment-modal { position:fixed; left:50%; top:50%; z-index:941; transform:translate(-50%,-50%); width:min(560px,calc(100vw - 28px)); max-height:min(80dvh,640px); display:flex; flex-direction:column; padding:14px; border:1px solid var(--color-line); border-radius:16px; background:var(--color-surface); color:var(--color-tx); font-family:var(--font-body); box-shadow:0 24px 64px rgba(0,0,0,.45); }
  .modal-head { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; padding-bottom:11px; margin-bottom:11px; border-bottom:1px solid var(--color-line); flex-shrink:0; }
  .modal-head > div { min-width:0; }
  .modal-head span { display:block; color:var(--color-club); font:700 8px var(--font-mono); letter-spacing:.1em; text-transform:uppercase; }
  .modal-head strong { display:block; margin-top:4px; font:17px var(--font-display); }
  .modal-head small { display:block; margin-top:3px; color:var(--color-tx-3); font:9px var(--font-mono); }
  .modal-close { flex-shrink:0; min-height:44px; padding:0 12px; border:1px solid var(--color-line); border-radius:9px; background:var(--color-raised); color:var(--color-tx-2); font:600 10px var(--font-body); cursor:pointer; }
  .modal-body { min-height:0; overflow:auto; overscroll-behavior:contain; display:grid; gap:7px; }
  .report-card { padding:11px; border:1px solid var(--color-line); border-radius:11px; background:var(--color-surface); }
  .report-head { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; }
  .report-head strong, .report-head span { display:block; }
  .report-head strong { font-size:13px; }
  .report-head > div span { margin-top:2px; color:var(--color-tx-3); font:9px var(--font-mono); }
  .confidence { flex-shrink:0; padding:3px 6px; border:1px solid var(--color-line); border-radius:999px; color:var(--color-club); font:700 8px var(--font-mono); text-transform:uppercase; }
  .report-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:6px; margin-top:10px; }
  .report-grid div { padding:8px; border-radius:8px; background:var(--color-raised); min-width:0; }
  .report-grid strong { display:block; margin-top:3px; font:13px var(--font-display); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .empty { padding:16px; text-align:center; color:var(--color-tx-3); font-size:11px; border:1px dashed var(--color-line); border-radius:10px; }

  .report-offer { width:100%; min-height:44px; margin-top:10px; border:1px solid var(--color-club); border-radius:9px; background:color-mix(in oklch,var(--color-club) 14%,transparent); color:var(--color-club); font:700 11px var(--font-body); cursor:pointer; }
  .report-offer:hover:not(:disabled) { background:color-mix(in oklch,var(--color-club) 24%,transparent); }
  .report-offer:disabled { border-color:var(--color-line); background:var(--color-raised); color:var(--color-tx-3); cursor:not-allowed; }
  .report-offer:focus-visible { outline:2px solid var(--color-accent); outline-offset:2px; }

  /* Sits above the assignment modal (941), since the offer is opened from
     inside it — its own backdrop has to cover that modal, not slide under it. */
  .offer-backdrop { position:fixed; inset:0; z-index:942; border:0; padding:0; background:rgba(0,0,0,.66); }
  .offer-modal { position:fixed; left:50%; top:50%; z-index:943; transform:translate(-50%,-50%); width:min(420px,calc(100vw - 28px)); max-height:min(80dvh,560px); display:flex; flex-direction:column; padding:14px; border:1px solid var(--color-line); border-radius:16px; background:var(--color-surface); color:var(--color-tx); font-family:var(--font-body); box-shadow:0 24px 64px rgba(0,0,0,.45); }
  .offer-body { min-height:0; overflow:auto; display:grid; gap:10px; }
  .offer-row { display:flex; align-items:baseline; justify-content:space-between; gap:12px; padding:10px 11px; border:1px solid var(--color-line); border-radius:10px; background:var(--color-raised); }
  .offer-row span { color:var(--color-tx-3); font:700 9px var(--font-mono); letter-spacing:.08em; text-transform:uppercase; }
  .offer-row strong { font:15px var(--font-display); }
  .offer-slider { display:block; }
  .offer-slider-label { display:block; margin-bottom:5px; color:var(--color-tx-3); font:700 9px var(--font-mono); letter-spacing:.08em; text-transform:uppercase; }
  .offer-slider input { width:100%; }
  .offer-note { margin:0; color:var(--color-tx-2); font-size:11px; line-height:1.45; }
  .offer-send { min-height:44px; }
  @media (max-width:620px) {
    .scouting-summary { grid-template-columns:1fr; }
    .assignment-builder { grid-template-columns:1fr 1fr; }
    .assignment-builder .primary { grid-column:1 / -1; }
    .report-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
  }
</style>
