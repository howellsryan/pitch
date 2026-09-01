<script>
  import { addScoutingAssignment, removeScoutingAssignment } from '../../modules/p5Runtime.js';
  import { MAX_SCOUTING_ASSIGNMENTS } from '../../modules/scouting.js';
  import { toast } from '../../ui/helpers.js';

  let { save, players = [], teams = [], onchange = () => {} } = $props();
  let busy = $state(false);
  let assignmentType = $state('position');
  let position = $state('ST');
  let league = $state('Premier League');

  const scouting = $derived(save?.scouting ?? { assignments:[], reports:[] });
  const assignments = $derived(scouting.assignments ?? []);
  const reports = $derived([...(scouting.reports ?? [])].reverse().slice(0, 20));
  const playerById = $derived(new Map(players.map(player => [String(player.id), player])));
  const leagueOptions = $derived([...new Set(teams.map(team => team.league).filter(Boolean))].sort());
  const activeCount = $derived(assignments.filter(item => item.status === 'active').length);

  function stageLabel(stage) {
    return stage === 'complete' ? 'Complete' : stage === 'detailed' ? 'Detailed' : stage === 'observed' ? 'Observed' : 'Assigned';
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
        {#each ['GK','CB','RB','LB','CDM','CM','CAM','RW','LW','ST'] as option}<option value={option}>{option}</option>{/each}
      </select>
    {:else}
      <select bind:value={league} aria-label="Scouting league">
        {#each leagueOptions as option}<option value={option}>{option}</option>{/each}
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
        <div class="assignment-row">
          <div>
            <strong>{assignment.label ?? assignment.position ?? assignment.league ?? 'Player report'}</strong>
            <span>{stageLabel(assignment.stage)} · {assignment.weeks ?? 0} week{assignment.weeks === 1 ? '' : 's'} of evidence</span>
          </div>
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
            <span class="confidence">{report.confidenceLabel} confidence</span>
          </div>
          <div class="report-grid">
            <div><span>Current</span><strong>{report.current?.min}–{report.current?.max}</strong></div>
            <div><span>Future</span><strong>{report.future?.min}–{report.future?.max}</strong></div>
            <div><span>Tactical</span><strong>{report.tactical?.fit ?? 'Unknown'}</strong></div>
            <div><span>Interest</span><strong>{report.status?.joiningInterest ?? 'Unknown'}</strong></div>
          </div>
        </article>
      {/each}
    </div>
  {/if}
</div>

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
  .assignment-row > div { min-width:0; flex:1; }
  .assignment-row strong, .assignment-row span { display:block; }
  .assignment-row strong { font-size:12px; color:var(--color-tx); }
  .assignment-row span { margin-top:3px; color:var(--color-tx-3); font:9px var(--font-mono); }
  .assignment-row button { border:1px solid var(--color-line); background:var(--color-raised); color:var(--color-tx-2); }
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
  @media (max-width:620px) {
    .scouting-summary { grid-template-columns:1fr; }
    .assignment-builder { grid-template-columns:1fr 1fr; }
    .assignment-builder .primary { grid-column:1 / -1; }
    .report-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
  }
</style>
