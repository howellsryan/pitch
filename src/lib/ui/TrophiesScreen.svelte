<script>
  import { getSave, getTeam, openDB } from '../../modules/db.js';
  import { CUP_META, cupRunStageLabel, describeCupResult } from '../../modules/cups.js';
  import { getHonorsForTeam } from '../../modules/season.js';
  import { screenTicks } from '../state/screens.svelte.js';
  import Icon from './kit/Icon.svelte';

  const LEAGUE_TITLE_KEY = {
    'Premier League': 'premier_league', 'Championship': 'championship',
    'League One': 'league_one', 'League Two': 'league_two',
    'La Liga': 'la_liga', 'Bundesliga': 'bundesliga',
    'Serie A': 'serie_a', 'Ligue 1': 'ligue_1', 'Eredivisie': 'eredivisie',
  };
  const DOMESTIC_CUP_DEFS = {
    'Premier League': [{ key: 'fa_cup', name: 'FA Cup', icon: 'cup', color: '#f5c842' }, { key: 'league_cup', name: 'Carabao Cup', icon: 'cup', color: '#c084fc' }],
    'Championship':   [{ key: 'fa_cup', name: 'FA Cup', icon: 'cup', color: '#f5c842' }, { key: 'league_cup', name: 'Carabao Cup', icon: 'cup', color: '#c084fc' }],
    'League One':     [{ key: 'fa_cup', name: 'FA Cup', icon: 'cup', color: '#f5c842' }, { key: 'league_cup', name: 'Carabao Cup', icon: 'cup', color: '#c084fc' }],
    'League Two':     [{ key: 'fa_cup', name: 'FA Cup', icon: 'cup', color: '#f5c842' }, { key: 'league_cup', name: 'Carabao Cup', icon: 'cup', color: '#c084fc' }],
    'Eredivisie':     [{ key: 'knvb_beker', name: 'KNVB Beker', icon: 'cup', color: '#FF6600' }],
    'La Liga':        [{ key: 'copa_del_rey', name: 'Copa del Rey', icon: 'cup', color: '#c8102e' }, { key: 'supercopa', name: 'Supercopa de España', icon: 'trophy', color: '#f5c842' }],
    'Bundesliga':     [{ key: 'dfb_pokal', name: 'DFB-Pokal', icon: 'cup', color: '#000000' }, { key: 'dfb_supercup', name: 'DFL-Supercup', icon: 'trophy', color: '#d4a017' }],
    'Serie A':        [{ key: 'coppa_italia', name: 'Coppa Italia', icon: 'cup', color: '#009246' }, { key: 'supercoppa', name: 'Supercoppa Italiana', icon: 'trophy', color: '#009246' }],
    'Ligue 1':        [{ key: 'coupe_de_france', name: 'Coupe de France', icon: 'cup', color: '#003189' }, { key: 'trophee_des_champions', name: 'Trophée des Champions', icon: 'trophy', color: '#e8151b' }],
  };
  const INVITATION_GATED = new Set(['dfb_supercup', 'supercopa', 'supercoppa', 'trophee_des_champions']);

  const CUP_ICON = {
    ucl: 'star',
    uel: 'spark',
    uecl: 'cup',
    fa_cup: 'cup',
    league_cup: 'cup',
    knvb_beker: 'cup',
    copa_del_rey: 'cup',
    supercopa: 'trophy',
    dfb_pokal: 'cup',
    dfb_supercup: 'trophy',
    coppa_italia: 'cup',
    supercoppa: 'trophy',
    coupe_de_france: 'cup',
    trophee_des_champions: 'trophy',
  };

  let loaded = $state(false);
  let league = $state('Premier League');
  let cups = $state({});
  let combined = $state({});
  let earned = $state([]);

  async function load() {
    await openDB();
    const save = await getSave();
    if (!save || save._deleted) return;
    const team = await getTeam(save.userTeamId);
    league = team?.league ?? save.userLeague ?? 'Premier League';
    cups = save.cups ?? {};
    const honors = await getHonorsForTeam(save.userTeamId);
    combined = honors.combined;
    earned = honors.earned;
    loaded = true;
  }

  $effect(() => {
    void screenTicks.trophies;
    load();
  });

  const trophyDefs = $derived.by(() => {
    const leagueTitleKey = LEAGUE_TITLE_KEY[league] ?? 'premier_league';
    const domesticCupDefs = DOMESTIC_CUP_DEFS[league] ?? [{ key: 'fa_cup', name: 'FA Cup', icon: 'cup', color: '#f5c842' }, { key: 'league_cup', name: 'League Cup', icon: 'cup', color: '#c084fc' }];
    return [
      { key: leagueTitleKey, name: league, icon: 'trophy', color: '#3b82f6' },
      ...domesticCupDefs,
      { key: 'ucl', name: 'Champions League', icon: 'star', color: '#3b82f6' },
      { key: 'uel', name: 'Europa League', icon: 'spark', color: '#f97316' },
      { key: 'uecl', name: 'Conference Lge', icon: 'cup', color: '#22c55e' },
    ];
  });

  const activeCups = $derived.by(() => {
    return Object.keys(cups)
      .filter(cupId => {
        const meta = CUP_META[cupId];
        if (!meta) return false;
        if (!INVITATION_GATED.has(cupId)) return true;
        const st = cups[cupId];
        if (!st) return false;
        return (st.results ?? []).length > 0 || (st.roundIndex ?? 0) > 0 || (st.leaguePhase?.matchday ?? 0) > 0;
      })
      .map(cupId => {
        const meta = CUP_META[cupId];
        const state = cups[cupId];
        const badge = state.status === 'winner' ? { cls: 'won', text: 'WON' } : state.status === 'eliminated' ? { cls: 'out', text: 'OUT' } : { cls: 'active', text: 'ACTIVE' };

        let leaguePhase = null;
        let roundInfo = null;
        if (meta.isGroupStage && !state.leaguePhaseComplete) {
          const lp = state.leaguePhase ?? {};
          const md = lp.matchday ?? 0;
          const pts = lp.points ?? 0;
          const total = Math.max(1, meta.groupStageGWs?.length || 8);
          const verdict = pts >= total * 1.5 ? 'On course to qualify directly' : pts >= total ? 'Likely playoff spot' : md < total / 2 ? 'Season underway' : 'Need points to qualify';
          leaguePhase = { md, total, pts, gd: lp.gd ?? 0, pct: (md / total) * 100, verdict };
        } else {
          const roundIdx = state.roundIndex ?? 0;
          // A club knocked out in a UEFA league phase stores roundIndex 0, which
          // read back as the knockout play-off it never reached; cupRunStageLabel
          // is the shared reader that already handles that.
          const exitStage = state.leaguePhaseComplete && (state.leaguePhase?.qualificationRoute ?? state.qualificationRoute) === 'eliminated'
            ? cupRunStageLabel(cupId, state)
            : meta.rounds[Math.max(0, roundIdx - 1)] ?? 'Early';
          const roundName = state.status === 'winner' ? 'Trophy Won!' : state.status === 'eliminated' ? `Out (${exitStage})` : cupRunStageLabel(cupId, state);
          roundInfo = { roundName, pct: Math.round((roundIdx / meta.rounds.length) * 100) };
        }

        const results = (state.results ?? []).slice(-4).map(r => describeCupResult(r, cupId));

        return { cupId, meta, icon: CUP_ICON[cupId] ?? 'cup', badge, leaguePhase, roundInfo, results };
      });
  });

  const honoursCards = $derived(
    trophyDefs.map(t => ({
      ...t,
      total: combined[t.key] || 0,
      mine: earned.filter(h => h.trophy === t.key),
    }))
  );
</script>

<div class="trophies-screen">
  <div class="tr-hdr">
    <div class="tr-eyebrow">Club History</div>
    <div class="tr-title">Trophies</div>
  </div>

  {#if !loaded}
    <div class="tr-empty">Loading…</div>
  {:else}
    <div class="tr-scroll">
      <div class="tr-section">
        <div class="tr-section-hdr">
          <div class="tr-section-title">Current Season</div>
          <div class="tr-section-sub">Active competitions</div>
        </div>
        {#if !activeCups.length}
          <div class="tr-empty-inline">No cup competitions this season.</div>
        {:else}
          <div class="cup-grid">
            {#each activeCups as c (c.cupId)}
              <div class="cup-card">
                <div class="cup-badge cup-badge-{c.badge.cls}">{c.badge.text}</div>
                <div class="cup-icon" style="color:{c.meta.color}"><Icon name={c.icon} size={20} /></div>
                <div class="cup-name">{c.meta.name}</div>
                <div class="cup-desc">{c.meta.description}</div>
                {#if c.leaguePhase}
                  <div class="cup-lp">
                    <div class="cup-lp-hdr">League Phase</div>
                    <div class="cup-lp-row">
                      <span>MD {c.leaguePhase.md}/{c.leaguePhase.total}</span>
                      <span class="cup-lp-pts">{c.leaguePhase.pts} pts</span>
                      <span class="cup-lp-gd">GD: {c.leaguePhase.gd >= 0 ? '+' : ''}{c.leaguePhase.gd}</span>
                    </div>
                    <div class="cup-pw"><div class="cup-pb" style="width:{c.leaguePhase.pct}%;background:{c.meta.color}"></div></div>
                    <div class="cup-lp-verdict">{c.leaguePhase.verdict}</div>
                  </div>
                {:else if c.roundInfo}
                  <div class="cup-pw"><div class="cup-pb" style="width:{c.roundInfo.pct}%;background:{c.meta.color}"></div></div>
                  <div class="cup-round">{c.roundInfo.roundName}</div>
                {/if}
                {#if c.results.length}
                  <div class="cup-results">
                    {#each c.results as r, i (i)}
                      <div class="cup-res-row {r.outcome === 'W' ? 'won' : r.outcome === 'D' ? 'drew' : 'lost'}">{r.shortLabel}</div>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <div class="tr-section">
        <div class="tr-section-hdr tr-section-hdr-line">
          <div class="tr-section-title">Club History</div>
          <div class="tr-section-sub">All-time trophy record</div>
        </div>
        <div class="hon-grid">
          {#each honoursCards as h (h.key)}
            <div class="hon-card">
              <div class="hon-icon" style="color:{h.color}"><Icon name={h.icon} size={18} /></div>
              <div class="hon-name">{h.name}</div>
              <div class="hon-count" style="color:{h.color}">{h.total}</div>
              <div class="hon-sub">All-time wins</div>
              {#if h.mine.length}
                <div class="hon-earned">+{h.mine.length} in your save</div>
                <div class="hon-history">
                  {#each h.mine as season (season.season)}
                    <div class="hon-season">{season.season}</div>
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .trophies-screen {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    font-family: var(--font-body);
    color: var(--color-tx);
  }

  .tr-hdr { padding: 18px 16px 12px; flex-shrink: 0; }
  .tr-eyebrow { font-family: var(--font-mono); font-size: 10px; letter-spacing: 3px; text-transform: uppercase; color: var(--color-club); margin-bottom: 3px; }
  .tr-title { font-family: var(--font-display); font-size: clamp(22px, 5vw, 28px); letter-spacing: 1px; line-height: 1; }

  .tr-empty { color: var(--color-tx-3); font-size: 12px; padding: 24px; text-align: center; }
  .tr-empty-inline { color: var(--color-tx-3); font-size: 12px; padding: 24px; text-align: center; background: var(--color-surface); border: 1px solid var(--color-line); border-radius: 12px; }
  .tr-scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 16px 24px; display: flex; flex-direction: column; gap: 20px; }

  .tr-section-hdr { padding-bottom: 10px; }
  .tr-section-hdr-line { border-top: 1px solid var(--color-line); padding-top: 16px; }
  .tr-section-title { font-family: var(--font-display); font-size: 17px; letter-spacing: 0.5px; }
  .tr-section-sub { font-size: 10px; color: var(--color-tx-2); font-family: var(--font-mono); margin-top: 2px; }

  .cup-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
  .cup-card {
    background: var(--color-surface); border: 1px solid var(--color-line); border-radius: 12px;
    padding: 14px; position: relative; display: flex; flex-direction: column; gap: 4px;
  }
  .cup-badge {
    position: absolute; top: 10px; right: 10px; padding: 2px 7px; border-radius: 4px;
    font-size: 9px; font-family: var(--font-mono); font-weight: 700; letter-spacing: 0.5px;
  }
  .cup-badge-active { background: color-mix(in oklch, var(--color-live) 18%, transparent); color: var(--color-live); border: 1px solid color-mix(in oklch, var(--color-live) 35%, transparent); }
  .cup-badge-won { background: color-mix(in oklch, var(--color-warn) 20%, transparent); color: var(--color-warn); border: 1px solid color-mix(in oklch, var(--color-warn) 40%, transparent); }
  .cup-badge-out { background: color-mix(in oklch, var(--color-bad) 15%, transparent); color: var(--color-bad); border: 1px solid color-mix(in oklch, var(--color-bad) 30%, transparent); }
  .cup-icon, .hon-icon { display: flex; align-items: center; line-height: 1; }
  .cup-name { font-family: var(--font-display); font-size: 15px; letter-spacing: 0.3px; padding-right: 44px; }
  .cup-desc { font-size: 11px; color: var(--color-tx-2); margin-bottom: 4px; line-height: 1.3; }
  .cup-pw { height: 5px; background: var(--color-raised); border-radius: 3px; overflow: hidden; }
  .cup-pb { height: 100%; border-radius: 3px; transition: width 0.4s; }
  .cup-round { font-size: 11px; color: var(--color-tx-2); }
  .cup-lp { display: flex; flex-direction: column; gap: 4px; margin-bottom: 2px; }
  .cup-lp-hdr { font-size: 9px; color: var(--color-tx-3); font-family: var(--font-mono); letter-spacing: 1px; }
  .cup-lp-row { display: flex; justify-content: space-between; font-size: 12px; }
  .cup-lp-pts { font-family: var(--font-mono); color: var(--color-club); font-weight: 700; }
  .cup-lp-gd { color: var(--color-tx-2); font-size: 11px; }
  .cup-lp-verdict { font-size: 10px; color: var(--color-tx-2); }
  .cup-results { display: flex; flex-direction: column; gap: 2px; margin-top: 4px; }
  .cup-res-row { font-size: 9px; padding: 2px 6px; border-radius: 4px; background: var(--color-raised); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cup-res-row.won { border-left: 2px solid var(--color-live); }
  .cup-res-row.drew { border-left: 2px solid var(--color-tx-3); }
  .cup-res-row.lost { border-left: 2px solid var(--color-bad); }

  .hon-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; }
  .hon-card {
    background: var(--color-surface); border: 1px solid var(--color-line); border-radius: 12px;
    padding: 12px; display: flex; flex-direction: column; gap: 2px;
  }
  .hon-name { font-size: 11px; font-weight: 600; color: var(--color-tx-2); line-height: 1.2; margin-top: 4px; }
  .hon-count { font-family: var(--font-display); font-size: 28px; line-height: 1; }
  .hon-sub { font-size: 9px; color: var(--color-tx-3); }
  .hon-earned { font-size: 9px; color: var(--color-live); margin-top: 4px; }
  .hon-history { display: flex; flex-direction: column; gap: 2px; margin-top: 4px; }
  .hon-season { font-size: 9px; color: var(--color-tx-2); background: var(--color-raised); padding: 2px 6px; border-radius: 4px; }

  @media (min-width: 700px) {
    .cup-grid { grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
  }
</style>
