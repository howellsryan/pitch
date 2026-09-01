<script>
  import { getSave, getTeam, openDB } from '../../modules/db.js';
  import { primaryRating } from '../../modules/matchEngine.js';
  import { getPotentialLabel, getPotentialStars } from '../../modules/potential.js';
  import { ACADEMY_INVESTMENT_COST_PER_POINT, academyInvestmentPointsForSpend, getAcademyInfo, investInAcademy, promoteYouthPlayer, releaseYouthPlayer } from '../../modules/youthAcademy.js';
  import { fmt, posGroup, toast } from '../../ui/helpers.js';
  import { newsYouthPromotion } from '../../ui/inbox.js';
  import { screenTicks } from '../state/screens.svelte.js';

  const POT_COLORS = ['', '#8a9ab0', 'var(--color-live)', '#3b82f6', 'var(--color-warn)', 'var(--color-bad)'];
  const TIER_COLORS = { elite: 'var(--color-warn)', top: '#3b82f6', good: 'var(--color-live)', average: '#f97316', poor: 'var(--color-tx-3)' };
  const WONDERKID_CHANCE = { elite: '25%', top: '10%', good: '5%', average: '1%', poor: '1%' };

  let loaded = $state(false);
  let save = $state(null);
  let team = $state(null);
  let info = $state(null);
  let confirmAction = $state(null); // { type: 'promote'|'release', player }
  let busy = $state(false);
  let investAmount = $state(500_000);
  let investBusy = $state(false);

  async function load() {
    await openDB();
    const s = await getSave();
    if (!s || s._deleted) return;
    save = s;
    team = await getTeam(s.userTeamId);
    info = getAcademyInfo(team?.reputation ?? 70, team?.academyInvestment ?? 0);
    loaded = true;
  }

  $effect(() => {
    void screenTicks.academy;
    load();
  });

  const cohort = $derived(save?.youthCohort ?? []);
  const sortedCohort = $derived(
    [...cohort].sort((a, b) => (
      b.isWonderkid !== a.isWonderkid
        ? (b.isWonderkid ? 1 : -1)
        : getPotentialStars(b) - getPotentialStars(a) || primaryRating(b) - primaryRating(a)
    ))
  );
  const agingOutCount = $derived(cohort.filter(p => p.age >= 19).length);

  const maxInvestSpend = $derived(team ? Math.min(team.budget ?? 0, (100 - (team.academyInvestment ?? 0)) * ACADEMY_INVESTMENT_COST_PER_POINT) : 0);
  const investPreviewPoints = $derived(team ? academyInvestmentPointsForSpend(team.academyInvestment, investAmount) : 0);

  async function doInvest() {
    if (investBusy) return;
    investBusy = true;
    try {
      const res = await investInAcademy(investAmount);
      toast(`Academy investment +${res.pointsGained} (now ${res.newInvestment}/100)`, 'success');
      screenTicks.academy++;
    } catch (err) {
      const msg = err.message === 'INSUFFICIENT_FUNDS' ? 'Not enough budget.'
        : err.message === 'NOTHING_TO_INVEST' ? 'Already at maximum investment, or the amount is too small to buy a point.'
        : 'Could not invest right now.';
      toast(msg, 'error');
    } finally {
      investBusy = false;
    }
  }

  function fitnessColor(fit) {
    return fit >= 75 ? 'var(--color-live)' : fit >= 50 ? 'var(--color-warn)' : 'var(--color-bad)';
  }

  function askPromote(p) { confirmAction = { type: 'promote', player: p }; }
  function askRelease(p) { confirmAction = { type: 'release', player: p }; }
  function closeConfirm() { if (!busy) confirmAction = null; }

  async function confirmPromote(p) {
    busy = true;
    try {
      await promoteYouthPlayer(p.id);
      toast(`${p.name} promoted to first team!`, 'success');
      const sv = await getSave();
      newsYouthPromotion?.(p, sv).catch(() => {});
      confirmAction = null;
      screenTicks.academy++;
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      busy = false;
    }
  }

  async function confirmRelease(p) {
    busy = true;
    try {
      await releaseYouthPlayer(p.id);
      toast(`${p.name} has been released.`, 'info');
      confirmAction = null;
      screenTicks.academy++;
    } finally {
      busy = false;
    }
  }
</script>

<div class="academy-screen">
  <div class="ac-hdr">
    <div>
      <div class="ac-eyebrow">Youth Development</div>
      <div class="ac-title">Academy</div>
    </div>
    {#if info}
      <div class="ac-tier" style="color:{TIER_COLORS[info.tier]}">
        <div class="ac-tier-stars">{'★'.repeat(info.stars)}{'☆'.repeat(5 - info.stars)}</div>
        <div class="ac-tier-label">{info.label}</div>
      </div>
    {/if}
  </div>

  {#if !loaded}
    <div class="ac-empty">Loading…</div>
  {:else}
    <div class="ac-scroll">
      <div class="ac-info-card">
        <div class="ac-info-desc">{info.description}</div>
        <div class="ac-stats-grid">
          <div class="stat-tile"><div class="stl">Intake</div><div class="stv" style="color:var(--color-live)">{info.cohortSize}</div><div class="sts">per season</div></div>
          <div class="stat-tile"><div class="stl">Wonderkid</div><div class="stv" style="color:{info.stars >= 3 ? 'var(--color-warn)' : 'var(--color-tx-3)'}">{WONDERKID_CHANCE[info.tier]}</div><div class="sts">chance</div></div>
          <div class="stat-tile"><div class="stl">In Academy</div><div class="stv" style="color:var(--color-club)">{cohort.length}</div><div class="sts">youth players</div></div>
        </div>
      </div>

      <div class="ac-invest-card">
        <div class="ac-invest-hdr">
          <span class="ac-invest-title">Academy Investment</span>
          <span class="ac-invest-level">{info.investment}/100</span>
        </div>
        <div class="ac-invest-track"><div class="ac-invest-fill" style="width:{info.investment}%"></div></div>
        <div class="ac-invest-desc">Spending raises effective academy quality (worth up to one tier at 100) and widens the yearly intake.</div>
        {#if info.investment >= 100}
          <div class="ac-invest-maxed">Fully invested — nothing more to gain here.</div>
        {:else}
          <div class="ac-invest-row">
            <input type="range" min="0" max={Math.max(0, maxInvestSpend)} step={ACADEMY_INVESTMENT_COST_PER_POINT} bind:value={investAmount} disabled={maxInvestSpend <= 0} />
            <div class="ac-invest-amount">{fmt.money(investAmount)}</div>
          </div>
          <div class="ac-invest-preview">+{investPreviewPoints} point{investPreviewPoints === 1 ? '' : 's'} for {fmt.money(investPreviewPoints * ACADEMY_INVESTMENT_COST_PER_POINT)}</div>
          <button class="btn-full btn-primary" disabled={investBusy || investPreviewPoints <= 0} onclick={doInvest}>{investBusy ? 'Investing…' : 'Invest'}</button>
        {/if}
      </div>

      {#if agingOutCount > 0}
        <div class="ac-warning">
          <strong>{agingOutCount} player{agingOutCount > 1 ? 's' : ''}</strong> will be released at season end — promote or lose them
        </div>
      {/if}

      {#if !cohort.length}
        <div class="ac-intake-empty">
          <div class="ac-intake-title">First intake arriving end of season</div>
          <div class="ac-intake-desc">
            Your academy runs automatically. At the end of every season, a new cohort of
            <strong>10 youth players</strong> aged 15–18 will arrive for you to promote or release.
          </div>
        </div>
      {:else}
        <div class="ac-cards">
          {#each sortedCohort as p (p.id)}
            {@const stars = getPotentialStars(p)}
            {@const fit = Math.round(p.fitness ?? 100)}
            <div class="ac-card {p.isWonderkid ? 'is-wonderkid' : ''} {p.age >= 19 ? 'is-aging-out' : ''}">
              <div class="ac-card-top">
                <div class="ac-card-rating">{primaryRating(p)}</div>
                <div class="ac-card-main">
                  <div class="ac-card-name-line">
                    <span class="pos-badge pos-{posGroup(p.position)}">{p.position}</span>
                    <span class="ac-card-name">{p.name}</span>
                    {#if p.isWonderkid}<span class="ac-wk-badge">WK</span>{/if}
                    {#if p.age >= 19}<span class="ac-age-warn" title="Will be released at season end" aria-label="Warning">!</span>{/if}
                  </div>
                  <div class="ac-card-meta-line">
                    <span>Age {p.age}</span>
                    <span style="color:{fitnessColor(fit)}">{fit}% fit</span>
                    <span style="color:{POT_COLORS[stars]}" title={getPotentialLabel(p)}>{'★'.repeat(stars)}{'☆'.repeat(5 - stars)}</span>
                  </div>
                </div>
                <div class="ac-card-value">{fmt.money(p.value)}</div>
              </div>
              <div class="ac-card-actions">
                <button class="btn-half btn-primary" onclick={() => askPromote(p)}>Promote</button>
                <button class="btn-half btn-secondary" onclick={() => askRelease(p)}>Release</button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

{#if confirmAction}
  {@const p = confirmAction.player}
  <button class="sheet-backdrop" onclick={closeConfirm} aria-label="Close"></button>
  <div class="sheet">
    <div class="sheet-handle"></div>
    {#if confirmAction.type === 'promote'}
      <div class="confirm-title">Promote {p.name}?</div>
      <div class="confirm-body">
        <div class="confirm-row"><span>Age</span><strong>{p.age} · {p.position}</strong></div>
        <div class="confirm-row"><span>Value</span><strong>{fmt.money(p.value)}</strong></div>
        <div class="confirm-row"><span>Potential</span><strong>{getPotentialLabel(p)}</strong></div>
        <div class="confirm-note">Promoting adds them to your first team squad. Their wage will be {fmt.wage(Math.max(1000, Math.round(p.value * 0.05 / 52)))}/week.</div>
      </div>
      <div class="sheet-actions">
        <button class="btn-full btn-primary" disabled={busy} onclick={() => confirmPromote(p)}>{busy ? 'Promoting…' : 'Promote to First Team'}</button>
        <button class="btn-full btn-secondary" disabled={busy} onclick={closeConfirm}>Cancel</button>
      </div>
    {:else}
      <div class="confirm-title">Release {p.name}?</div>
      <div class="confirm-body">
        <div class="confirm-note warn">This cannot be undone. They will leave the club permanently.</div>
      </div>
      <div class="sheet-actions">
        <button class="btn-full btn-danger" disabled={busy} onclick={() => confirmRelease(p)}>{busy ? 'Releasing…' : 'Release Player'}</button>
        <button class="btn-full btn-secondary" disabled={busy} onclick={closeConfirm}>Keep</button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .academy-screen {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    font-family: var(--font-body);
    color: var(--color-tx);
  }

  .ac-hdr { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 18px 16px 12px; flex-shrink: 0; }
  .ac-eyebrow { font-family: var(--font-mono); font-size: 10px; letter-spacing: 3px; text-transform: uppercase; color: var(--color-club); margin-bottom: 3px; }
  .ac-title { font-family: var(--font-display); font-size: clamp(22px, 5vw, 28px); letter-spacing: 1px; line-height: 1; }
  .ac-tier { text-align: right; }
  .ac-tier-stars { font-size: 16px; letter-spacing: 2px; }
  .ac-tier-label { font-size: 12px; font-weight: 600; color: var(--color-tx); margin-top: 1px; }

  .ac-empty { color: var(--color-tx-3); font-size: 12px; padding: 24px; text-align: center; }
  .ac-scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 16px 24px; display: flex; flex-direction: column; gap: 12px; }

  .ac-info-card { background: var(--color-surface); border: 1px solid var(--color-line); border-radius: 14px; padding: 14px; }
  .ac-info-desc { font-size: 12px; color: var(--color-tx-2); line-height: 1.5; margin-bottom: 12px; }
  .ac-stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .stat-tile { background: var(--color-raised); border: 1px solid var(--color-line); border-radius: 10px; padding: 10px; }
  .stl { font-size: 9px; color: var(--color-tx-2); margin-bottom: 2px; }
  .stv { font-family: var(--font-display); font-size: clamp(16px, 3vw, 20px); line-height: 1; }
  .sts { font-size: 8px; color: var(--color-tx-3); margin-top: 2px; }

  .ac-invest-card { background: var(--color-surface); border: 1px solid var(--color-line); border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 8px; }
  .ac-invest-hdr { display: flex; justify-content: space-between; align-items: baseline; }
  .ac-invest-title { font-size: 13px; font-weight: 600; }
  .ac-invest-level { font-family: var(--font-mono); font-size: 11px; color: var(--color-tx-2); }
  .ac-invest-track { height: 6px; border-radius: 3px; background: var(--color-raised); overflow: hidden; }
  .ac-invest-fill { height: 100%; background: var(--color-club); border-radius: 3px; }
  .ac-invest-desc { font-size: 11px; color: var(--color-tx-2); line-height: 1.4; }
  .ac-invest-maxed { font-size: 12px; color: var(--color-live); font-weight: 600; }
  .ac-invest-row { display: flex; align-items: center; gap: 10px; }
  .ac-invest-row input[type="range"] { flex: 1; }
  .ac-invest-amount { font-family: var(--font-mono); font-size: 12px; min-width: 72px; text-align: right; }
  .ac-invest-preview { font-size: 11px; color: var(--color-tx-2); }

  .ac-warning {
    background: color-mix(in oklch, var(--color-bad) 12%, transparent);
    border: 1px solid color-mix(in oklch, var(--color-bad) 30%, transparent);
    border-radius: 10px; padding: 10px 14px; font-size: 12px; color: var(--color-tx);
  }
  .ac-warning strong { color: var(--color-bad); }

  .ac-intake-empty { text-align: center; padding: 32px 16px; color: var(--color-tx-2); }
  .ac-intake-title { font-family: var(--font-display); font-size: 18px; letter-spacing: 0.5px; color: var(--color-tx); margin-bottom: 8px; }
  .ac-intake-desc { font-size: 12px; line-height: 1.6; max-width: 380px; margin: 0 auto; }
  .ac-intake-desc strong { color: var(--color-tx); }

  .ac-cards { display: flex; flex-direction: column; gap: 8px; }
  .ac-card { background: var(--color-surface); border: 1px solid var(--color-line); border-radius: 12px; padding: 12px; }
  .ac-card.is-wonderkid { border-color: color-mix(in oklch, var(--color-warn) 40%, var(--color-line)); }
  .ac-card.is-aging-out { border-color: color-mix(in oklch, var(--color-bad) 35%, var(--color-line)); }

  .ac-card-top { display: flex; align-items: center; gap: 12px; }
  .ac-card-rating { font-family: var(--font-display); font-size: 24px; color: var(--color-club); min-width: 32px; text-align: center; flex-shrink: 0; }
  .ac-card-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .ac-card-name-line { display: flex; align-items: center; gap: 6px; }
  .ac-card-name { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ac-card-meta-line { display: flex; align-items: center; gap: 10px; font-size: 11px; color: var(--color-tx-2); font-family: var(--font-mono); }
  .ac-card-value { font-family: var(--font-mono); font-size: 12px; color: var(--color-tx-2); flex-shrink: 0; }

  .ac-wk-badge {
    font-size: 9px; font-family: var(--font-mono); font-weight: 700; padding: 1px 5px; border-radius: 4px; flex-shrink: 0;
    background: linear-gradient(135deg, var(--color-warn), #f97316); color: #14171c;
  }
  .ac-age-warn { color: var(--color-bad); font-size: 12px; flex-shrink: 0; }

  .pos-badge {
    font-family: var(--font-mono); font-size: 10px; font-weight: 700; letter-spacing: 0.5px;
    padding: 2px 6px; border-radius: 5px; flex-shrink: 0;
    background: var(--color-raised); color: var(--color-tx-2); border: 1px solid var(--color-line);
  }
  .pos-badge.pos-GK { color: #7c83e8; }
  .pos-badge.pos-DEF { color: var(--color-live); }
  .pos-badge.pos-MID { color: var(--color-warn); }
  .pos-badge.pos-FWD { color: var(--color-bad); }

  .ac-card-actions { display: flex; gap: 8px; margin-top: 10px; }
  .btn-half { flex: 1; min-height: 38px; border-radius: 9px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: var(--font-body); }

  /* ── Confirm bottom sheet ─────────────────────────────────── */
  .sheet-backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,0.6);
    z-index: 900; animation: fade-in 0.2s ease; border: none; padding: 0; cursor: default;
  }
  .sheet {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 901;
    background: var(--color-surface);
    border: 1px solid var(--color-line);
    border-bottom: none;
    border-radius: 18px 18px 0 0;
    padding: 10px 18px calc(20px + env(safe-area-inset-bottom));
    animation: slide-up 0.22s ease;
    font-family: var(--font-body);
    color: var(--color-tx);
  }
  @media (prefers-reduced-motion: reduce) { .sheet-backdrop, .sheet { animation: none; } }
  @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes slide-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
  .sheet-handle { width: 36px; height: 4px; border-radius: 2px; background: var(--color-line); margin: 4px auto 14px; }

  .confirm-title { font-family: var(--font-display); font-size: 19px; letter-spacing: 0.5px; margin-bottom: 12px; }
  .confirm-body { margin-bottom: 16px; }
  .confirm-row { display: flex; justify-content: space-between; font-size: 12px; color: var(--color-tx-2); padding: 4px 0; }
  .confirm-row strong { color: var(--color-tx); }
  .confirm-note { font-size: 12px; color: var(--color-tx-2); margin-top: 8px; line-height: 1.5; }
  .confirm-note.warn { color: var(--color-bad); }

  .sheet-actions { display: flex; flex-direction: column; gap: 8px; }
  .btn-full { min-height: 44px; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font-body); }
  .btn-primary { border: none; background: var(--color-club); color: var(--color-on-club, #fff); }
  .btn-secondary { border: 1px solid var(--color-line); background: var(--color-raised); color: var(--color-tx-2); }
  .btn-danger { border: none; background: var(--color-bad); color: #fff; }
  .btn-full:disabled, .btn-half:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
