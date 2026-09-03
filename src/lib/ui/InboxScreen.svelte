<script>
  import { getSave, openDB } from '../../modules/db.js';
  import { careerEventChoices } from '../../modules/careerEvents.js';
  import { resolveCareerEvent } from '../../modules/p8Runtime.js';
  import { tryCompletePendingUserHandover } from '../../modules/managerUserActions.js';
  import { screenTicks } from '../state/screens.svelte.js';
  import { toast } from '../../ui/helpers.js';

  let save = $state(null);
  let busy = $state('');
  let tab = $state('pending');

  async function load() {
    await openDB();
    save = await getSave();
  }
  $effect(() => { void screenTicks.inbox; void load(); });
  const events = $derived(save?.careerEvents?.active ?? []);
  const resolved = $derived(save?.careerEvents?.resolved ?? []);
  const news = $derived(save?.inbox ?? []);
  const list = $derived(tab === 'pending' ? events : tab === 'resolved' ? resolved : news);

  const titleFor = event => ({
    broken_promise:'A promise has been broken',
    early_return:'Medical team request',
    board_pressure:'Board confidence is slipping',
    budget_pressure:'Financial pressure',
    press_derby:'Press conference: derby week',
    youngster_loan:'A youngster wants a clearer pathway',
    star_contract:'A senior player wants clarity',
    manager_approach:'A club wants to speak to you',
    promise_review:'Promise review',
    youngster_path_review:'Pathway review',
    contract_review:'Contract situation unresolved',
    budget_review:'Financial plan review',
  }[event.templateId] ?? 'Career decision');

  const bodyFor = event => ({
    broken_promise:`${event.tokens?.playerName ?? 'A player'} feels their agreed role has not been honoured.`,
    early_return:`${event.tokens?.playerName ?? 'A player'} is ${event.tokens?.readiness ?? 0}% ready. The medical team wants your call.`,
    board_pressure:'Recent results have sharpened the board and supporter focus on your decisions.',
    budget_pressure:'The club needs a response to a tightening cash position.',
    press_derby:`The media are waiting for your words before the match against ${event.tokens?.opponentName ?? 'your rivals'}.`,
    youngster_loan:`${event.tokens?.playerName ?? 'A young player'} is worried about their minutes and wants a clearer route to first-team football.`,
    star_contract:`${event.tokens?.playerName ?? 'A senior player'} has ${event.tokens?.yearsLeft ?? 1} year${Number(event.tokens?.yearsLeft ?? 1) === 1 ? '' : 's'} left and wants to know where they stand.`,
    manager_approach:`${event.tokens?.clubName ?? 'Another club'} have made an approach${event.tokens?.fit ? ` and see you as a ${event.tokens.fit}% fit` : ''}.`,
    promise_review:`You recommitted to ${event.tokens?.playerName ?? 'this player'} earlier. The underlying playing-time problem is still unresolved.`,
    youngster_path_review:`${event.tokens?.playerName ?? 'The youngster'} stayed to fight for minutes, but the pathway still has not improved.`,
    contract_review:`You reassured ${event.tokens?.playerName ?? 'the player'} that their future would be addressed, but the contract situation is still unresolved.`,
    budget_review:'You protected the squad when finances first tightened. The cash position still needs a decision.',
  }[event.templateId] ?? 'A decision requires your attention.');

  const resolutionFor = event => ({
    morale:'Player relationship affected',
    transfer_list:'Player made available',
    early_return:'Early return approved',
    team_morale:'Squad mood affected',
    finance:'Financial plan applied',
    job_security:'Board confidence affected',
    loan_out:'Loan move approved',
    manager_approach_accept:'Job approach accepted',
    manager_approach_decline:'Job approach declined',
    expired:'Decision expired',
    followup_expired:'Follow-up expired',
    promise_recovered:'Promise recovered before review',
    pathway_improved:'Pathway improved before review',
    pathway_loaned:'Loan pathway started before review',
    contract_resolved:'Contract resolved before review',
    finances_stabilised:'Finances stabilised before review',
    participant_moved:'Player moved before review',
    participant_unavailable:'Participant unavailable',
  }[event.resolutionCode] ?? event.resolutionCode ?? event.status);

  async function choose(event, choice) {
    if (busy) return;
    busy = event.id;
    try {
      const result = await resolveCareerEvent(event.id, choice.id);
      if (result.event?.resolutionCode === 'manager_approach_accept') {
        const handover = await tryCompletePendingUserHandover();
        toast(handover.completed ? 'Job accepted. Club handover complete.' : 'Job accepted. The handover will complete when the current match queue is clear.', 'success', 5500);
      } else {
        toast(result.followUp ? 'Decision recorded. This story may return later.' : 'Decision recorded.', 'success');
      }
      await load();
    } catch (error) {
      const message = error.message === 'CAREER_EVENT_EXPIRED'
        ? 'This decision has expired.'
        : error.message === 'WINDOW_CLOSED'
          ? 'A loan cannot be completed while the transfer window is closed.'
          : error.message === 'NO_LOAN_TAKERS'
            ? 'No suitable club is currently available for that loan.'
            : 'This decision is no longer available.';
      toast(message, 'warning');
      await load();
    } finally {
      busy = '';
    }
  }
</script>

<div class="inbox-screen">
  <header><div><div class="eyebrow">Career Desk</div><h1>Inbox</h1></div><span class="count">{events.length} awaiting</span></header>
  <div class="tabs" role="tablist" aria-label="Inbox views">
    <button class:active={tab === 'pending'} onclick={() => tab = 'pending'}>Pending ({events.length})</button>
    <button class:active={tab === 'resolved'} onclick={() => tab = 'resolved'}>Resolved</button>
    <button class:active={tab === 'news'} onclick={() => tab = 'news'}>News</button>
  </div>
  <div class="list">
    {#if !list.length}<div class="empty">{tab === 'pending' ? 'No decisions are waiting. Your career will create stories from what happens on the pitch and around the club.' : 'Nothing here yet.'}</div>{/if}
    {#each list as item (item.id)}
      {#if tab === 'news'}
        <article class="card news"><strong>{item.title}</strong>{#if item.body}<p>{item.body}</p>{/if}</article>
      {:else}
        <article class="card" class:muted={tab === 'resolved'}>
          <div class="meta">{item.category} · {tab === 'pending' ? `Respond by GW ${item.expiryGameweek}` : resolutionFor(item)}</div>
          <h2>{titleFor(item)}</h2><p>{bodyFor(item)}</p>
          {#if tab === 'pending'}<div class="choices">{#each careerEventChoices(item) as choice (choice.id)}<button disabled={busy === item.id} onclick={() => choose(item, choice)}>{choice.label}</button>{/each}</div>{/if}
        </article>
      {/if}
    {/each}
  </div>
</div>

<style>
  .inbox-screen { flex:1; min-height:0; overflow:auto; padding:18px 16px calc(24px + env(safe-area-inset-bottom)); color:var(--color-tx, var(--tx)); }
  header { display:flex; justify-content:space-between; align-items:flex-end; gap:12px; } h1 { margin:0; font-size:28px; } .eyebrow,.meta { font-size:10px; letter-spacing:1.6px; text-transform:uppercase; color:var(--color-club, var(--acc)); } .count { font-size:12px; color:var(--tx2); }
  .tabs { display:flex; gap:8px; margin:18px 0 12px; overflow:auto; } .tabs button,.choices button { min-height:44px; border-radius:10px; border:1px solid var(--bd, #273447); background:var(--card, #111923); color:inherit; padding:0 13px; font:inherit; } .tabs button.active { border-color:var(--color-club, var(--acc)); color:var(--color-club, var(--acc)); }
  .list { display:grid; gap:10px; } .card { padding:15px; border:1px solid var(--bd, #273447); border-radius:14px; background:var(--card, #111923); } h2 { font-size:17px; margin:6px 0; } p { color:var(--tx2); line-height:1.45; margin:0; } .choices { display:grid; gap:8px; margin-top:14px; } .choices button:first-child { border-color:var(--color-club, var(--acc)); } .muted { opacity:.72; } .news strong { display:block; margin-bottom:5px; } .empty { padding:34px 12px; text-align:center; color:var(--tx2); line-height:1.5; }
  @media (min-width:700px) { .inbox-screen { max-width:820px; margin:0 auto; } .choices { grid-template-columns:1fr 1fr; } }
</style>
