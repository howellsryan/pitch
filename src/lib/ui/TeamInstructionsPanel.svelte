<script>
  import {
    DEFAULT_TEAM_INSTRUCTIONS,
    TEAM_INSTRUCTION_DEFS,
    normalizeTeamInstructions,
  } from '../../modules/tactics.js';
  import { buildTacticalPlanFeedback } from '../../modules/tacticalPlanFeedback.js';

  let {
    instructions = DEFAULT_TEAM_INSTRUCTIONS,
    players = [],
    rolesById = {},
    onchange = () => {},
    compact = false,
    collapsible = false,
  } = $props();

  const PHASES = [
    ['in_possession', 'In possession'],
    ['transition', 'Transition'],
    ['out_of_possession', 'Out of possession'],
    ['shape', 'Shape'],
    ['set_pieces', 'Set pieces'],
  ];
  let expandedPhases = $state({ in_possession:true });

  const normalized = $derived.by(() => normalizeTeamInstructions(instructions));
  const feedback = $derived.by(() => buildTacticalPlanFeedback({
    players,
    rolesById,
    instructions:normalized,
  }));

  function defsFor(phase) {
    return TEAM_INSTRUCTION_DEFS.filter(def => def.phase === phase);
  }

  function phaseSummary(defs) {
    const changed = defs.filter(def => normalized[def.id] !== DEFAULT_TEAM_INSTRUCTIONS[def.id]);
    if (!changed.length) return 'Balanced defaults';
    const labels = changed.slice(0, 2).map(def => def.values.find(([value]) => value === normalized[def.id])?.[1]);
    return labels.join(' · ') + (changed.length > 2 ? ` +${changed.length - 2}` : '');
  }

  function rememberPhase(event, phase) {
    const open = event.currentTarget.open;
    if (Boolean(expandedPhases[phase]) !== open) expandedPhases[phase] = open;
  }
</script>

{#snippet instructionRows(defs)}
  <div class="instruction-list">
    {#each defs as def (def.id)}
      <div class="instruction-row">
        <span class="instruction-label">{def.label}</span>
        <div class="instruction-options" role="group" aria-label={def.label}>
          {#each def.values as [value, optionLabel] (value)}
            <button
              class:active={normalized[def.id] === value}
              aria-pressed={normalized[def.id] === value}
              onclick={() => onchange(def.id, value)}
            >{optionLabel}</button>
          {/each}
        </div>
      </div>
    {/each}
  </div>
{/snippet}

<div class:compact class:collapsible class="team-instructions-panel">
  <section class="plan-fit" aria-label="Tactical plan fit">
    <div class="fit-score">
      <span>XI fit</span>
      <strong>{feedback.fitScore}</strong>
      <small>{feedback.grade}</small>
    </div>
    <div class="fit-notes">
      {#each feedback.strengths as strength (strength)}
        <div class="fit-note strength"><span>+</span><p>{strength}</p></div>
      {/each}
      {#each feedback.risks as risk (risk)}
        <div class="fit-note risk"><span>!</span><p>{risk}</p></div>
      {/each}
      {#each feedback.conflicts as conflict (conflict)}
        <div class="fit-note conflict"><span>×</span><p>{conflict}</p></div>
      {/each}
    </div>
  </section>

  {#each PHASES as [phase, label] (phase)}
    {@const defs = defsFor(phase)}
    {#if defs.length}
      {#if collapsible}
        <details class="phase-disclosure" open={Boolean(expandedPhases[phase])} ontoggle={event => rememberPhase(event, phase)}>
          <summary>
            <span><strong>{label}</strong><small>{phaseSummary(defs)}</small></span>
            <svg class="phase-chevron" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" /></svg>
          </summary>
          {@render instructionRows(defs)}
        </details>
      {:else}
        <section class="instruction-phase">
          <div class="phase-heading">{label}</div>
          {@render instructionRows(defs)}
        </section>
      {/if}
    {/if}
  {/each}
</div>

<style>
  .team-instructions-panel { display:grid; gap:14px; padding:0 2px 8px; }
  .plan-fit { display:grid; grid-template-columns:86px 1fr; gap:10px; padding:10px; border:1px solid var(--color-line); border-radius:12px; background:var(--color-raised); }
  .fit-score { display:flex; flex-direction:column; justify-content:center; align-items:center; min-height:76px; border-radius:10px; background:var(--color-surface); text-align:center; }
  .fit-score span, .fit-score small { color:var(--color-tx-3); font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; }
  .fit-score strong { color:var(--color-tx-1); font-size:28px; line-height:1; margin:4px 0; }
  .fit-score small { text-transform:none; letter-spacing:0; font-size:9px; }
  .fit-notes { display:grid; gap:5px; min-width:0; }
  .fit-note { display:grid; grid-template-columns:18px 1fr; align-items:start; gap:5px; font-size:11px; line-height:1.25; color:var(--color-tx-2); }
  .fit-note span { display:grid; place-items:center; width:17px; height:17px; border-radius:50%; font-size:10px; font-weight:900; }
  .fit-note p { margin:1px 0 0; }
  .fit-note.strength span { background:color-mix(in srgb, var(--color-live) 18%, transparent); color:var(--color-live); }
  .fit-note.risk span { background:color-mix(in srgb, var(--color-warn) 18%, transparent); color:var(--color-warn); }
  .fit-note.conflict span { background:color-mix(in srgb, var(--color-bad) 18%, transparent); color:var(--color-bad); }
  .instruction-phase { display:grid; gap:7px; }
  .phase-heading { color:var(--color-tx-3); font-size:10px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; padding:0 2px; }
  .instruction-list { display:grid; gap:7px; }
  .instruction-row { display:grid; gap:6px; padding:9px; border:1px solid var(--color-line); border-radius:11px; background:var(--color-surface); }
  .instruction-label { color:var(--color-tx-2); font-size:11px; font-weight:750; }
  .instruction-options { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:5px; }
  .instruction-options button { min-height:34px; border:1px solid var(--color-line); border-radius:8px; background:var(--color-raised); color:var(--color-tx-2); font:inherit; font-size:10px; font-weight:750; padding:6px 4px; cursor:pointer; }
  .instruction-options button.active { border-color:var(--color-live); background:color-mix(in srgb, var(--color-live) 13%, var(--color-raised)); color:var(--color-tx-1); }
  .compact { gap:10px; }
  .compact .plan-fit { grid-template-columns:72px 1fr; padding:8px; }
  .compact .fit-score { min-height:64px; }
  .compact .fit-score strong { font-size:23px; }
  .compact .fit-note { font-size:10px; }
  .compact .instruction-row { padding:7px; }
  .compact .instruction-options button { min-height:31px; font-size:9px; }

  .collapsible { gap:12px; }
  .collapsible .plan-fit { grid-template-columns:80px minmax(0,1fr); }
  .collapsible .fit-score span, .collapsible .fit-score small { color:var(--color-tx-2); font-size:11px; }
  .collapsible .fit-note { font-size:12px; line-height:1.4; }
  .phase-disclosure { min-width:0; border:1px solid var(--color-line); border-radius:12px; background:var(--color-surface); }
  .phase-disclosure summary { display:flex; align-items:center; justify-content:space-between; gap:12px; min-height:60px; padding:10px 12px; list-style:none; cursor:pointer; }
  .phase-disclosure summary::-webkit-details-marker { display:none; }
  .phase-disclosure summary strong { display:block; color:var(--color-tx); font-size:14px; }
  .phase-disclosure summary small { display:block; margin-top:4px; color:var(--color-tx-2); font-size:11px; line-height:1.4; }
  .phase-chevron { flex:0 0 auto; color:var(--color-tx-2); }
  .phase-disclosure[open] .phase-chevron { transform:rotate(180deg); }
  .collapsible .instruction-list { padding:0 10px 10px; gap:10px; }
  .collapsible .instruction-row { padding:0; border:none; border-radius:0; gap:7px; }
  .collapsible .instruction-label { color:var(--color-tx); font-size:12px; }
  .collapsible .instruction-options button { min-height:44px; font-size:12px; line-height:1.3; overflow-wrap:anywhere; }
  .collapsible button:focus-visible, .phase-disclosure summary:focus-visible { outline:2px solid var(--color-live); outline-offset:2px; }

  @media (min-width:768px) {
    .team-instructions-panel:not(.compact):not(.collapsible) { grid-template-columns:repeat(2,minmax(0,1fr)); align-items:start; }
    .team-instructions-panel:not(.compact):not(.collapsible) .plan-fit { grid-column:1 / -1; }
    .team-instructions-panel:not(.compact):not(.collapsible) .instruction-phase:first-of-type { grid-column:1 / -1; }
  }
</style>
