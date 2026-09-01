<script>
  import { setManagedDevelopmentPlan } from '../../modules/p5Runtime.js';
  import { DEVELOPMENT_PLAN_DEFS, automaticPlanRecommendation, effectiveDevelopmentPlan } from '../../modules/training.js';
  import { toast } from '../../ui/helpers.js';

  let { player, onchange = () => {} } = $props();
  let busy = $state(false);
  let selected = $derived(player?.developmentPlan?.id ?? 'balanced');

  const effective = $derived(effectiveDevelopmentPlan({ ...player, developmentPlan:{ ...(player?.developmentPlan ?? {}), id:selected } }));
  const recommendation = $derived(automaticPlanRecommendation(player));
  const options = $derived(Object.values(DEVELOPMENT_PLAN_DEFS));

  async function choose(id) {
    if (busy || !player) return;
    busy = true;
    try {
      const updated = await setManagedDevelopmentPlan(player.id, id);
      selected = updated.developmentPlan?.id ?? id;
      toast(`${player.name}: ${DEVELOPMENT_PLAN_DEFS[id]?.label ?? id} plan set.`, 'success', 2400);
      await onchange(updated);
    } catch (error) {
      toast(error.message === 'PLAYER_NOT_IN_SQUAD' ? 'This player is no longer in your squad.' : 'Could not update development plan.', 'error', 2800);
    } finally {
      busy = false;
    }
  }
</script>

<div class="development-panel">
  <div class="development-head">
    <div><span>Development plan</span><strong>{DEVELOPMENT_PLAN_DEFS[selected]?.label ?? 'Balanced'}</strong></div>
    <div class="recommendation">Recommended: {DEVELOPMENT_PLAN_DEFS[recommendation]?.label ?? 'Balanced'}</div>
  </div>

  {#if effective.overridden}
    <div class="override">Recovery is temporarily overriding the manager plan while this player rebuilds medical or match readiness.</div>
  {/if}

  <div class="plan-grid">
    {#each options as option (option.id)}
      <button class:active={selected === option.id} disabled={busy} onclick={() => choose(option.id)}>
        <strong>{option.label}</strong>
        <span>{option.description}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .development-panel { display:flex; flex-direction:column; gap:9px; padding:11px; border:1px solid var(--color-line); border-radius:11px; background:var(--color-surface); }
  .development-head { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
  .development-head span { display:block; color:var(--color-tx-3); font:700 8px var(--font-mono); text-transform:uppercase; letter-spacing:.08em; }
  .development-head strong { display:block; margin-top:3px; font:15px var(--font-display); }
  .recommendation { padding:4px 7px; border-radius:999px; border:1px solid var(--color-line); color:var(--color-club); font:700 8px var(--font-mono); text-transform:uppercase; }
  .override { padding:8px 9px; border:1px solid color-mix(in oklch, var(--color-warn) 45%, var(--color-line)); border-radius:8px; color:var(--color-warn); font-size:10px; line-height:1.4; }
  .plan-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; }
  .plan-grid button { min-width:0; min-height:56px; padding:8px; text-align:left; border:1px solid var(--color-line); border-radius:8px; background:var(--color-raised); color:var(--color-tx); cursor:pointer; }
  .plan-grid button.active { border-color:var(--color-club); background:color-mix(in oklch, var(--color-club) 12%, var(--color-raised)); }
  .plan-grid button:disabled { opacity:.5; cursor:not-allowed; }
  .plan-grid strong, .plan-grid span { display:block; }
  .plan-grid strong { font-size:10px; }
  .plan-grid span { margin-top:3px; color:var(--color-tx-3); font-size:9px; line-height:1.3; }
  @media (max-width:480px) { .development-head { flex-direction:column; } }
</style>
