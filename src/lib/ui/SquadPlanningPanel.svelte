<script>
  import { getSave, getTeam, openDB } from '../../modules/db.js';
  import { coachingDepartmentLabel, coachingEffects } from '../../modules/coaching.js';
  import { getCoachMarket, getManagedSquadPlan, hireManagedCoach } from '../../modules/p5Runtime.js';
  import { fmt, toast } from '../../ui/helpers.js';

  let needs = $state([]);
  let team = $state(null);
  let save = $state(null);
  let loaded = $state(false);
  let busy = $state(false);
  let marketDepartment = $state(null);
  let coachCandidates = $state([]);

  const departments = ['goalkeeping','defence','midfield','attack'];
  const reasonLabels = {
    coverage_shortfall:'Coverage', age_risk:'Age risk', contract_risk:'Contract risk', injury_cover:'Injury cover',
    loan_return_risk:'Loan planning', tactical_role_gap:'Tactical fit', succession_gap:'Succession', academy_pathway:'Academy option',
  };

  async function load() {
    await openDB();
    save = await getSave();
    if (!save) return;
    team = await getTeam(save.userTeamId);
    needs = await getManagedSquadPlan();
    loaded = true;
  }

  $effect(() => { load(); });

  function urgencyLabel(value) {
    return value >= 70 ? 'High' : value >= 40 ? 'Medium' : 'Low';
  }

  async function reviewCoaches(department) {
    if (busy) return;
    busy = true;
    try {
      marketDepartment = department;
      coachCandidates = await getCoachMarket(department);
    } catch {
      toast('Could not load coaching candidates.', 'error', 2800);
    } finally {
      busy = false;
    }
  }

  async function hireCoach(candidate) {
    if (busy) return;
    busy = true;
    try {
      const result = await hireManagedCoach(candidate.department, candidate.id);
      team = result.team;
      toast(`${candidate.name} hired as ${coachingDepartmentLabel(candidate.department)} coach.`, 'success', 3200);
      coachCandidates = await getCoachMarket(candidate.department);
      needs = await getManagedSquadPlan();
    } catch (error) {
      toast(error.message === 'INSUFFICIENT_FUNDS' ? 'Not enough transfer budget to hire this coach.' : 'Could not hire coach.', 'error', 3000);
    } finally {
      busy = false;
    }
  }
</script>

<details class="career-depth" open>
  <summary>Squad Planning &amp; Coaching</summary>
  {#if !loaded}
    <div class="empty">Loading squad plan…</div>
  {:else}
    <div class="planner-grid">
      <section>
        <div class="section-head"><span>Squad plan</span><strong>Now → 3 seasons</strong></div>
        {#if !needs.length}
          <div class="empty">The squad currently has no material coverage, contract or succession gaps.</div>
        {:else}
          <div class="need-list">
            {#each needs.slice(0, 5) as need (need.id)}
              <article class="need-card">
                <div class="need-head">
                  <div><strong>{need.position}</strong><span>{need.group} · {urgencyLabel(need.urgency)} priority</span></div>
                  <span class="ability">{need.targetAbilityBand.min}–{need.targetAbilityBand.max}</span>
                </div>
                <div class="chips">{#each need.reasons as reason (reason)}<span>{reasonLabels[reason] ?? reason}</span>{/each}</div>
                <div class="coverage">
                  <div><span>XI</span><strong>{need.coverage.xi}</strong></div>
                  <div><span>Rotation</span><strong>{need.coverage.rotation}</strong></div>
                  <div><span>Depth</span><strong>{need.coverage.depth}</strong></div>
                  {#each need.future as horizon (horizon.seasons)}
                    <div><span>Y{horizon.seasons}</span><strong class:warning={horizon.shortfall > 0}>{horizon.shortfall ? `-${horizon.shortfall}` : 'OK'}</strong></div>
                  {/each}
                </div>
                <div class="budget-line">Recruitment allowance <strong>{fmt.money(need.maxBudget)}</strong></div>
              </article>
            {/each}
          </div>
        {/if}
      </section>

      <section>
        <div class="section-head"><span>Coaching staff</span><strong>Four departments</strong></div>
        <div class="coach-list">
          {#each departments as department (department)}
            {@const coach = team?.coaching?.[department]}
            {@const effect = coachingEffects(team, department === 'goalkeeping' ? 'GK' : department === 'defence' ? 'CB' : department === 'midfield' ? 'CM' : 'ST')}
            <article class="coach-card">
              <div>
                <strong>{coachingDepartmentLabel(department)}</strong>
                <span>{coach?.name ?? 'Staff'} · {coach?.quality ?? 3}/5 · {coach?.specialism ?? 'balanced'}</span>
                <span>Dev ×{effect.development.toFixed(2)} · Assess ×{effect.assessment.toFixed(2)} · {fmt.wage(coach?.wage ?? 0)}/wk</span>
              </div>
              <button disabled={busy} onclick={() => reviewCoaches(department)}>Review</button>
            </article>
          {/each}
        </div>

        {#if marketDepartment}
          <div class="coach-market">
            <div class="market-title">{coachingDepartmentLabel(marketDepartment)} candidates</div>
            {#each coachCandidates as candidate (candidate.id)}
              <div class="candidate">
                <div><strong>{candidate.name}</strong><span>{candidate.quality}/5 · {candidate.specialism} · {fmt.wage(candidate.wage)}/wk</span></div>
                <button disabled={busy || (team?.budget ?? 0) < candidate.signingCost} onclick={() => hireCoach(candidate)}>Hire · {fmt.money(candidate.signingCost)}</button>
              </div>
            {/each}
          </div>
        {/if}
      </section>
    </div>
  {/if}
</details>

<style>
  .career-depth { margin:0 16px 12px; border:1px solid var(--color-line); border-radius:12px; background:var(--color-surface); overflow:hidden; flex-shrink:0; }
  .career-depth > summary { padding:10px 12px; cursor:pointer; font:700 10px var(--font-mono); letter-spacing:.07em; text-transform:uppercase; color:var(--color-tx-2); background:var(--color-raised); }
  .planner-grid { display:grid; grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr); gap:12px; padding:11px; }
  section { min-width:0; }
  .section-head { display:flex; justify-content:space-between; gap:8px; align-items:center; margin-bottom:7px; }
  .section-head span, .coverage span { color:var(--color-tx-3); font:700 8px var(--font-mono); text-transform:uppercase; letter-spacing:.06em; }
  .section-head strong { font-size:10px; color:var(--color-club); }
  .need-list, .coach-list { display:grid; gap:6px; }
  .need-card, .coach-card, .candidate { padding:9px; border:1px solid var(--color-line); border-radius:9px; background:var(--color-raised); }
  .need-head, .coach-card, .candidate { display:flex; justify-content:space-between; gap:8px; align-items:center; }
  .need-head strong, .coach-card strong, .candidate strong { display:block; font-size:11px; }
  .need-head span, .coach-card span, .candidate span { display:block; margin-top:2px; color:var(--color-tx-3); font:8px var(--font-mono); }
  .ability { flex-shrink:0; margin:0 !important; font:16px var(--font-display) !important; color:var(--color-club) !important; }
  .chips { display:flex; flex-wrap:wrap; gap:4px; margin-top:7px; }
  .chips span { padding:2px 5px; border:1px solid var(--color-line); border-radius:999px; color:var(--color-tx-2); font:8px var(--font-mono); }
  .coverage { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:4px; margin-top:7px; }
  .coverage div { padding:5px; border-radius:6px; background:var(--color-surface); text-align:center; }
  .coverage strong { display:block; margin-top:2px; font:11px var(--font-display); }
  .coverage strong.warning { color:var(--color-warn); }
  .budget-line { margin-top:6px; color:var(--color-tx-3); font-size:9px; }
  .budget-line strong { color:var(--color-tx-2); }
  .coach-card button, .candidate button { flex-shrink:0; min-height:32px; padding:0 9px; border:1px solid var(--color-line); border-radius:7px; background:var(--color-surface); color:var(--color-tx-2); font:600 9px var(--font-body); cursor:pointer; }
  .candidate button { background:var(--color-club); color:var(--color-on-club,#fff); border-color:transparent; }
  button:disabled { opacity:.45; cursor:not-allowed; }
  .coach-market { margin-top:8px; padding-top:8px; border-top:1px solid var(--color-line); display:grid; gap:5px; }
  .market-title { color:var(--color-tx-3); font:700 8px var(--font-mono); text-transform:uppercase; letter-spacing:.06em; }
  .empty { padding:14px; text-align:center; color:var(--color-tx-3); font-size:10px; }
  @media (max-width:760px) {
    .planner-grid { grid-template-columns:1fr; }
    .career-depth { margin-inline:10px; }
  }
  @media (max-width:460px) {
    .coverage { grid-template-columns:repeat(3,minmax(0,1fr)); }
    .candidate { align-items:flex-start; flex-direction:column; }
    .candidate button { width:100%; }
  }
</style>
