<script>
  import { getSave, getTeam, openDB } from '../../modules/db.js';
  import { coachingDepartmentLabel, coachingEffects } from '../../modules/coaching.js';
  import { getCoachMarket, getManagedSquadPlan, hireManagedCoach } from '../../modules/p5Runtime.js';
  import { SQUAD_GROUP_TARGETS } from '../../modules/squadPlanning.js';
  import { fmt, toast } from '../../ui/helpers.js';

  let needs = $state([]);
  let team = $state(null);
  let save = $state(null);
  let loaded = $state(false);
  let busy = $state(false);
  let marketDepartment = $state(null);
  let coachCandidates = $state([]);

  const departments = ['goalkeeping','defence','midfield','attack'];

  // Each department coaches the players in its own positions; nothing here is
  // abstract "staff quality", so the panel says exactly who each coach trains.
  const departmentCopy = {
    goalkeeping:{ covers:'Goalkeepers', example:'GK' },
    defence:{ covers:'Defenders', example:'CB · RB · LB' },
    midfield:{ covers:'Midfielders', example:'CDM · CM · CAM · RM · LM' },
    attack:{ covers:'Forwards', example:'ST · CF · RW · LW' },
  };
  const specialismCopy = {
    balanced:'No bias — a little of everything',
    assessment:'Sharper scouting reports on players in this department',
    development:'Faster attribute growth for these players',
    recovery:'Quicker injury recovery and match sharpness',
  };
  const groupToDepartment = { GK:'goalkeeping', DEF:'defence', MID:'midfield', ATT:'attack' };

  // The squad plan reports why a position needs attention; the raw reason codes
  // meant nothing on screen without the sentence behind them.
  const reasonLabels = {
    coverage_shortfall:'Coverage', age_risk:'Age risk', contract_risk:'Contract risk', injury_cover:'Injury cover',
    loan_return_risk:'Loan planning', tactical_role_gap:'Tactical fit', succession_gap:'Succession', academy_pathway:'Academy option',
  };
  const reasonHelp = {
    coverage_shortfall:'Fewer players here than a full squad needs',
    age_risk:'Several players in this group are near the end of their careers',
    contract_risk:'Contracts here expire within a year',
    injury_cover:'Players in this group are injured or suspended',
    loan_return_risk:'Loanees here go back to their parent clubs',
    tactical_role_gap:'This group fits your chosen roles poorly',
    succession_gap:'The gap grows over the next three seasons',
    academy_pathway:'An academy player could fill this instead of a signing',
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
        <div class="section-head"><span>Squad plan</span><strong>Where you are short</strong></div>
        <p class="lede">Positions your squad is thin in today, or will be within three seasons. Each card names the position to sign, the ability level to aim for, and roughly what your budget can carry.</p>
        {#if !needs.length}
          <div class="empty">The squad currently has no material coverage, contract or succession gaps.</div>
        {:else}
          <div class="need-list">
            {#each needs.slice(0, 5) as need (need.id)}
              {@const dept = groupToDepartment[need.group]}
              <article class="need-card">
                <div class="need-head">
                  <div>
                    <strong>Sign a {need.position}</strong>
                    <span>{departmentCopy[dept]?.covers ?? need.group} · {urgencyLabel(need.urgency)} priority</span>
                  </div>
                  <div class="ability-block">
                    <span class="ability">{need.targetAbilityBand.min}–{need.targetAbilityBand.max}</span>
                    <small>Target ability</small>
                  </div>
                </div>
                <div class="chips">{#each need.reasons as reason (reason)}<span title={reasonHelp[reason] ?? ''}>{reasonLabels[reason] ?? reason}</span>{/each}</div>
                <p class="why">{need.reasons.map(reason => reasonHelp[reason]).filter(Boolean)[0] ?? 'This group needs attention.'}</p>
                <div class="coverage-block">
                  <div class="coverage-title">Players you have now <b>{need.coverage.current}</b> of {SQUAD_GROUP_TARGETS[need.group] ?? need.coverage.target} wanted</div>
                  <div class="coverage">
                    <div><span>Starters</span><strong>{need.coverage.xi}</strong></div>
                    <div><span>Rotation</span><strong>{need.coverage.rotation}</strong></div>
                    <div><span>Backup</span><strong>{need.coverage.depth}</strong></div>
                    {#each need.future as horizon (horizon.seasons)}
                      <div><span>In {horizon.seasons}y</span><strong class:warning={horizon.shortfall > 0}>{horizon.shortfall ? `${horizon.shortfall} short` : 'OK'}</strong></div>
                    {/each}
                  </div>
                </div>
                <div class="budget-line">Suggested spend on this position <strong>{fmt.money(need.maxBudget)}</strong></div>
              </article>
            {/each}
          </div>
        {/if}
      </section>

      <section>
        <div class="section-head"><span>Coaching staff</span><strong>One coach per area</strong></div>
        <p class="lede">Each coach trains only the players in their own area. A better coach develops those players faster, gets them fit sooner and gives you sharper scouting on them. Their wages come out of the club's budget every week.</p>
        <div class="coach-list">
          {#each departments as department (department)}
            {@const coach = team?.coaching?.[department]}
            {@const copy = departmentCopy[department]}
            {@const effect = coachingEffects(team, department === 'goalkeeping' ? 'GK' : department === 'defence' ? 'CB' : department === 'midfield' ? 'CM' : 'ST')}
            <article class="coach-card">
              <div class="coach-copy">
                <strong>{copy.covers} coach<em class="dept-tag">{coachingDepartmentLabel(department)}</em></strong>
                <span class="covers">Trains your {copy.example}</span>
                <span>{coach?.name ?? 'Staff'} · {'★'.repeat(coach?.quality ?? 3)}{'☆'.repeat(5 - (coach?.quality ?? 3))} · {fmt.wage(coach?.wage ?? 0)}/wk</span>
                <span class="specialism">{specialismCopy[coach?.specialism ?? 'balanced']}</span>
                <span class="effects">
                  Development {effect.development >= 1 ? '+' : ''}{Math.round((effect.development - 1) * 100)}% ·
                  Scouting {effect.assessment >= 1 ? '+' : ''}{Math.round((effect.assessment - 1) * 100)}% ·
                  Recovery {effect.recovery >= 1 ? '+' : ''}{Math.round((effect.recovery - 1) * 100)}%
                </span>
              </div>
              <button disabled={busy} onclick={() => reviewCoaches(department)}>Replace</button>
            </article>
          {/each}
        </div>

        {#if marketDepartment}
          <div class="coach-market">
            <div class="market-title">Available {departmentCopy[marketDepartment]?.covers.toLowerCase()} coaches</div>
            {#each coachCandidates as candidate (candidate.id)}
              <div class="candidate">
                <div>
                  <strong>{candidate.name}</strong>
                  <span>{'★'.repeat(candidate.quality)}{'☆'.repeat(5 - candidate.quality)} · {fmt.wage(candidate.wage)}/wk{candidate.improvement > 0 ? ` · ${candidate.improvement} better than your current coach` : candidate.improvement < 0 ? ' · worse than your current coach' : ' · same as your current coach'}</span>
                  <span class="specialism">{specialismCopy[candidate.specialism]}</span>
                </div>
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
  .lede { margin:0 0 8px; color:var(--color-tx-2); font-size:10px; line-height:1.5; }
  .need-list, .coach-list { display:grid; gap:6px; }
  .need-card, .coach-card, .candidate { padding:9px; border:1px solid var(--color-line); border-radius:9px; background:var(--color-raised); }
  .need-head, .coach-card, .candidate { display:flex; justify-content:space-between; gap:8px; align-items:center; }
  .need-head strong, .coach-card strong, .candidate strong { display:block; font-size:11px; }
  .need-head span, .coach-card span, .candidate span { display:block; margin-top:2px; color:var(--color-tx-3); font:8px var(--font-mono); }
  .ability-block { flex-shrink:0; text-align:right; }
  .ability { display:block; margin:0 !important; font:16px var(--font-display) !important; color:var(--color-club) !important; }
  .ability-block small { display:block; margin-top:2px; color:var(--color-tx-3); font:8px var(--font-mono); text-transform:uppercase; letter-spacing:.06em; }
  .why { margin:6px 0 0; color:var(--color-tx-2); font-size:10px; line-height:1.45; }
  .coverage-block { margin-top:8px; }
  .coverage-title { color:var(--color-tx-3); font:8px var(--font-mono); text-transform:uppercase; letter-spacing:.06em; }
  .coverage-title b { color:var(--color-tx); font-size:11px; }
  .coach-copy { min-width:0; flex:1; }
  .coach-copy strong { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
  .dept-tag { flex-shrink:0; padding:1px 5px; border-radius:999px; background:color-mix(in oklch,var(--color-club) 20%,transparent); color:var(--color-club); font:700 7px var(--font-mono); font-style:normal; text-transform:uppercase; letter-spacing:.06em; }
  .covers { color:var(--color-tx-2) !important; }
  .specialism { color:var(--color-tx-2) !important; font-family:var(--font-body) !important; font-size:9px !important; line-height:1.4 !important; white-space:normal !important; }
  .effects { color:var(--color-tx-3) !important; }
  .chips { display:flex; flex-wrap:wrap; gap:4px; margin-top:7px; }
  .chips span { padding:2px 5px; border:1px solid var(--color-line); border-radius:999px; color:var(--color-tx-2); font:8px var(--font-mono); }
  .coverage { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:4px; margin-top:5px; }
  .coverage div { padding:5px; border-radius:6px; background:var(--color-surface); text-align:center; }
  .coverage strong { display:block; margin-top:2px; font:10px var(--font-display); }
  .coverage strong.warning { color:var(--color-warn); }
  .budget-line { margin-top:6px; color:var(--color-tx-3); font-size:9px; }
  .budget-line strong { color:var(--color-tx-2); }
  .coach-card button, .candidate button { flex-shrink:0; min-height:44px; padding:0 11px; border:1px solid var(--color-line); border-radius:7px; background:var(--color-surface); color:var(--color-tx-2); font:600 9px var(--font-body); cursor:pointer; }
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
    .coach-card { align-items:flex-start; flex-direction:column; }
    .coach-card button { width:100%; }
    .candidate { align-items:flex-start; flex-direction:column; }
    .candidate button { width:100%; }
  }
</style>
