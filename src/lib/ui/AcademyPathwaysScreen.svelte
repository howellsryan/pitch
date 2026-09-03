<script>
  import { getSave, getTeam, openDB } from '../../modules/db.js';
  import { primaryRating } from '../../modules/matchEngine.js';
  import { getPotentialLabel } from '../../modules/potential.js';
  import { DEVELOPMENT_PLAN_DEFS } from '../../modules/training.js';
  import { setManagedDevelopmentPlan } from '../../modules/p5Runtime.js';
  import {
    cancelManagedYouthScoutingAssignment,
    createManagedYouthScoutingAssignment,
    getManagedAcademyPlayers,
    promoteManagedAcademyPlayer,
    releaseManagedAcademyPlayer,
  } from '../../modules/p9Runtime.js';
  import { academyReadiness, youthScoutingPositionGroups, youthScoutingRegions } from '../../modules/academyPathways.js';
  import { ACADEMY_INVESTMENT_COST_PER_POINT, academyInvestmentPointsForSpend, getAcademyInfo, investInAcademy } from '../../modules/youthAcademy.js';
  import { fmt, navigateTo, toast } from '../../ui/helpers.js';
  import { screenTicks } from '../state/screens.svelte.js';

  let loaded = $state(false);
  let busy = $state(false);
  let save = $state(null);
  let team = $state(null);
  let players = $state([]);
  let investAmount = $state(500_000);
  let scoutingRegion = $state('UK & Ireland');
  let scoutingGroup = $state('MID');

  const regions = youthScoutingRegions();
  const positionGroups = youthScoutingPositionGroups();
  const plans = Object.values(DEVELOPMENT_PLAN_DEFS).filter(plan => !['recovery','sharpness','position_conversion'].includes(plan.id));

  async function load() {
    await openDB();
    players = await getManagedAcademyPlayers();
    save = await getSave();
    if (!save || save._deleted) return;
    team = await getTeam(save.userTeamId);
    loaded = true;
  }

  $effect(() => {
    void screenTicks.academy;
    void load();
  });

  const info = $derived(team ? getAcademyInfo(team.reputation ?? 70, team.academyInvestment ?? 0) : null);
  const assignments = $derived(save?.academyPathways?.youthScoutingAssignments ?? []);
  const activeAssignments = $derived(assignments.filter(item => item.status === 'active'));
  const completedAssignments = $derived([...assignments].filter(item => item.status === 'complete').reverse().slice(0, 4));
  const maxInvestSpend = $derived(team ? Math.min(team.budget ?? 0, (100 - (team.academyInvestment ?? 0)) * ACADEMY_INVESTMENT_COST_PER_POINT) : 0);
  const investPreviewPoints = $derived(team ? academyInvestmentPointsForSpend(team.academyInvestment, investAmount) : 0);

  function readiness(player) { return academyReadiness(player); }
  function evidence(player) { return player.academyEvidence ?? {}; }

  async function invest() {
    if (busy || investPreviewPoints <= 0) return;
    busy = true;
    try {
      const result = await investInAcademy(investAmount);
      toast(`Academy investment +${result.pointsGained}`, 'success');
      screenTicks.academy++;
    } catch (error) {
      toast(error.message === 'INSUFFICIENT_FUNDS' ? 'Not enough budget.' : 'Could not invest right now.', 'error');
    } finally { busy = false; }
  }

  async function assignScout() {
    if (busy) return;
    busy = true;
    try {
      await createManagedYouthScoutingAssignment({ region:scoutingRegion, positionGroup:scoutingGroup });
      toast(`Academy scout sent to ${scoutingRegion}`, 'success');
      screenTicks.academy++;
    } catch (error) {
      toast(error.message === 'YOUTH_SCOUTING_ASSIGNMENT_CAP' ? 'All academy scouting slots are already in use.' : 'Could not create academy assignment.', 'error');
    } finally { busy = false; }
  }

  async function cancelScout(id) {
    await cancelManagedYouthScoutingAssignment(id);
    screenTicks.academy++;
  }

  async function setPlan(player, planId) {
    try {
      await setManagedDevelopmentPlan(player.id, planId);
      toast(`${player.name}: ${DEVELOPMENT_PLAN_DEFS[planId]?.label ?? 'plan'} assigned`, 'success');
      screenTicks.academy++;
    } catch { toast('Could not update development plan.', 'error'); }
  }

  async function promote(player) {
    if (!confirm(`Promote ${player.name} to the first team?`)) return;
    try {
      await promoteManagedAcademyPlayer(player.id);
      toast(`${player.name} promoted to the first team`, 'success');
      screenTicks.academy++;
      screenTicks.squad++;
    } catch (error) {
      toast(error.message === 'SQUAD_FULL' ? 'Your senior squad is full.' : 'Could not promote this player.', 'error');
    }
  }

  async function release(player) {
    if (!confirm(`Release ${player.name} to free agency?`)) return;
    await releaseManagedAcademyPlayer(player.id);
    toast(`${player.name} released`, 'info');
    screenTicks.academy++;
    screenTicks.transfers++;
  }
</script>

<div class="p9-academy">
  <header class="p9-head">
    <div>
      <div class="eyebrow">Youth development</div>
      <h1>Academy</h1>
      <p>One player, one career path — academy evidence, development and promotion all stay on the same record.</p>
    </div>
    {#if info}
      <div class="quality"><strong>{'★'.repeat(info.stars)}{'☆'.repeat(5 - info.stars)}</strong><span>{info.label}</span></div>
    {/if}
  </header>

  {#if !loaded}
    <div class="empty">Loading academy…</div>
  {:else}
    <div class="scroll">
      <section class="summary-grid">
        <article><span>Prospects</span><strong>{players.length}/24</strong><small>canonical player rows</small></article>
        <article><span>Investment</span><strong>{info?.investment ?? 0}/100</strong><small>{info?.cohortSize ?? 10} intake baseline</small></article>
        <article><span>Scouts out</span><strong>{activeAssignments.length}</strong><small>regional assignments</small></article>
      </section>

      <section class="panel">
        <div class="panel-head"><div><h2>Regional scouting</h2><p>Brief the academy network by region and position group. Reports narrow the quality band; they never guarantee a star.</p></div></div>
        <div class="controls">
          <label>Region<select bind:value={scoutingRegion}>{#each regions as region}<option value={region}>{region}</option>{/each}</select></label>
          <label>Position<select bind:value={scoutingGroup}>{#each positionGroups as group}<option value={group}>{group}</option>{/each}</select></label>
          <button class="primary" disabled={busy} onclick={assignScout}>Assign scout</button>
        </div>
        {#if activeAssignments.length}
          <div class="assignments">
            {#each activeAssignments as assignment (assignment.id)}
              <div><span><strong>{assignment.region}</strong> · {assignment.positionGroup}</span><small>{assignment.weeks}/{assignment.targetWeeks} weeks</small><button onclick={() => cancelScout(assignment.id)}>Cancel</button></div>
            {/each}
          </div>
        {/if}
        {#if completedAssignments.length}
          <div class="reports">
            {#each completedAssignments as assignment (assignment.id)}
              <div><strong>{assignment.region} · {assignment.positionGroup}</strong><span>{assignment.report?.potentialBand?.min ?? '—'}–{assignment.report?.potentialBand?.max ?? '—'} potential band</span><small>{Math.round((assignment.report?.confidence ?? 0) * 100)}% confidence{assignment.prospectId ? ' · prospect added' : ''}</small></div>
            {/each}
          </div>
        {/if}
      </section>

      <section class="panel">
        <div class="panel-head"><div><h2>Academy investment</h2><p>{info?.description}</p></div><strong>{fmt.money(team?.budget ?? 0)}</strong></div>
        <div class="investment-row">
          <input type="range" min="0" max={Math.max(0, maxInvestSpend)} step={ACADEMY_INVESTMENT_COST_PER_POINT} bind:value={investAmount} disabled={maxInvestSpend <= 0} />
          <span>{fmt.money(investPreviewPoints * ACADEMY_INVESTMENT_COST_PER_POINT)} · +{investPreviewPoints}</span>
          <button class="primary" disabled={busy || investPreviewPoints <= 0} onclick={invest}>Invest</button>
        </div>
      </section>

      <section class="panel prospects">
        <div class="panel-head"><div><h2>Development pathways</h2><p>Readiness comes from durable ability plus separate academy minutes and ratings — never senior appearances.</p></div><button onclick={() => navigateTo('transfers')}>Open loan market</button></div>
        {#if !players.length}
          <div class="empty">No academy prospects. Regional scouts and the next seasonal intake can replenish the pathway.</div>
        {:else}
          {#each players as player (player.id)}
            {@const ready = readiness(player)}
            {@const ev = evidence(player)}
            <article class="prospect-card">
              <div class="rating">{primaryRating(player)}</div>
              <div class="identity">
                <div class="name"><strong>{player.name}</strong><span>{player.position} · Age {player.age}</span></div>
                <div class="meter"><div style={`width:${ready.score}%`}></div></div>
                <div class="readiness"><strong>{ready.status}</strong><span>{ready.score}/100 readiness</span></div>
                <div class="evidence">
                  <span>{ev.appearances ?? 0} academy apps</span><span>{ev.minutes ?? 0} mins</span><span>{ev.averageRating ? `${ev.averageRating} avg` : 'No rating yet'}</span>
                </div>
                <small>{getPotentialLabel(player)}</small>
              </div>
              <div class="actions">
                <select value={player.developmentPlan?.id ?? 'balanced'} onchange={event => setPlan(player, event.currentTarget.value)}>
                  {#each plans as plan}<option value={plan.id}>{plan.label}</option>{/each}
                </select>
                <button class="primary" onclick={() => promote(player)}>Promote</button>
                <button onclick={() => release(player)}>Release</button>
              </div>
            </article>
          {/each}
        {/if}
      </section>
    </div>
  {/if}
</div>

<style>
  .p9-academy{display:flex;flex-direction:column;min-height:0;height:100%;color:var(--color-tx);font-family:var(--font-body)}
  .p9-head{display:flex;justify-content:space-between;gap:16px;padding:18px 16px 12px;border-bottom:1px solid var(--color-line)}
  .p9-head h1{margin:2px 0 5px;font-family:var(--font-display);font-size:28px}.p9-head p,.panel p{margin:0;color:var(--color-tx-2);font-size:11px;line-height:1.45;max-width:620px}.eyebrow{text-transform:uppercase;letter-spacing:2px;font-size:9px;color:var(--color-club)}
  .quality{display:flex;flex-direction:column;align-items:flex-end;font-size:12px}.quality strong{letter-spacing:1px}.quality span{color:var(--color-tx-2);font-size:10px}
  .scroll{overflow:auto;padding:12px 16px 28px;display:flex;flex-direction:column;gap:12px}.summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.summary-grid article,.panel{background:var(--color-surface);border:1px solid var(--color-line);border-radius:12px;padding:12px}.summary-grid span,.summary-grid small{display:block;color:var(--color-tx-2);font-size:9px}.summary-grid strong{display:block;font-family:var(--font-display);font-size:20px;margin:2px 0}
  .panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px}.panel h2{margin:0 0 3px;font-size:14px}.controls{display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:end}.controls label{font-size:9px;color:var(--color-tx-2);display:flex;flex-direction:column;gap:4px}select,input,button{font:inherit}select{background:var(--color-raised);color:var(--color-tx);border:1px solid var(--color-line);border-radius:8px;padding:8px}button{border:1px solid var(--color-line);background:var(--color-raised);color:var(--color-tx);border-radius:8px;padding:8px 10px;cursor:pointer}.primary{background:var(--color-club);color:var(--color-bg);border-color:var(--color-club);font-weight:700}button:disabled{opacity:.45;cursor:not-allowed}
  .assignments,.reports{display:flex;flex-direction:column;gap:6px;margin-top:10px}.assignments>div,.reports>div{display:flex;align-items:center;gap:8px;padding:8px;background:var(--color-raised);border-radius:8px;font-size:10px}.assignments span,.reports strong{flex:1}.assignments small,.reports span,.reports small{color:var(--color-tx-2)}.reports>div{align-items:flex-start;flex-direction:column}
  .investment-row{display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center;font-size:10px;color:var(--color-tx-2)}
  .prospects{display:flex;flex-direction:column;gap:8px}.prospect-card{display:grid;grid-template-columns:46px 1fr auto;gap:10px;padding:10px;background:var(--color-raised);border:1px solid var(--color-line);border-radius:10px}.rating{font-family:var(--font-display);font-size:24px;display:grid;place-items:center}.identity{min-width:0}.name{display:flex;gap:8px;align-items:baseline}.name span,.identity small{color:var(--color-tx-2);font-size:9px}.meter{height:5px;background:var(--color-surface);border-radius:4px;overflow:hidden;margin:6px 0 4px}.meter div{height:100%;background:var(--color-club)}.readiness,.evidence{display:flex;gap:8px;flex-wrap:wrap;font-size:9px}.readiness span,.evidence{color:var(--color-tx-2)}.actions{display:flex;flex-direction:column;gap:5px;min-width:104px}.actions select,.actions button{font-size:9px;padding:6px}.empty{padding:24px;text-align:center;color:var(--color-tx-2);font-size:11px}
  @media(max-width:620px){.p9-head{padding-top:14px}.p9-head p{display:none}.summary-grid{grid-template-columns:1fr 1fr 1fr}.controls{grid-template-columns:1fr 1fr}.controls .primary{grid-column:1/-1}.investment-row{grid-template-columns:1fr auto}.investment-row .primary{grid-column:1/-1}.prospect-card{grid-template-columns:40px 1fr}.actions{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr 1fr}.panel-head{align-items:center}}
</style>
