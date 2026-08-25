import { applyClubTheme } from '../lib/theme.mjs';
import { BUNDESLIGA_TEAMS } from '../data/bundesliga.js';
import { CHAMPIONSHIP_TEAMS } from '../data/championship.js';
import { EREDIVISIE_TEAMS } from '../data/eredivisie.js';
import { EXTRA_LEAGUES_TEAMS } from '../data/extraLeagues.js';
import { LA_LIGA_TEAMS } from '../data/laLiga.js';
import { LEAGUE_ONE_TEAMS } from '../data/leagueOne.js';
import { LEAGUE_TWO_TEAMS } from '../data/leagueTwo.js';
import { LIGUE_1_TEAMS } from '../data/ligue1.js';
import { PL_TEAMS } from '../data/plTeams.js';
import { SERIE_A_TEAMS } from '../data/serieA.js';
import { deleteDB, exportSaveFile, getAllPlayers, getAllSeasons, getSave, getTeam, importSaveFile, importSaveFromCode, openDB, putPlayersBulk } from '../modules/db.js';
import { CUP_META } from '../modules/cups.js';
import { assignPotentials } from '../modules/potential.js';
import { startNewGame } from '../modules/save.js';
import { getHonorsForTeam } from '../modules/season.js';
import { fmt, navigateTo, registerScreen, showModal, toast } from './helpers.js';
import { renderHome, renderTransfers } from './home_transfers.js';
import { renderSquad, renderTactics } from './squad_tactics_offers.js';
import { renderAcademy } from './academy.js';
import { _updateInboxBadge, renderInbox } from './inbox.js';
import { screenTicks } from '../lib/state/screens.svelte.js';

// ── Full-screen overlay for blocking operations ─────────────
export function _showFullOverlay(msg) {
  _removeFullOverlay();
  const ov = document.createElement('div');
  ov.id = 'pitch-full-overlay';
  ov.style.cssText = 'position:fixed;inset:0;z-index:10001;background:var(--night,#0a0e14);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px';
  ov.innerHTML = '<div class="loader-spin"></div><div style="color:var(--tx,#fff);font-family:var(--fd,sans-serif);font-size:18px;letter-spacing:1px">' + (msg || 'Loading…') + '</div>';
  document.body.appendChild(ov);
}
export function _removeFullOverlay() {
  document.getElementById('pitch-full-overlay')?.remove();
}

// ── COMPETITIONS ─────────────────────────────────────────────
// Migrated to src/lib/ui/LeagueScreen.svelte (Phase 3, docs/plan/04-migration-phases.md).
// registerScreen('competitions', ...) below just bumps screenTicks.competitions
// so the mounted Svelte island knows to refetch.

// ── TROPHIES (merged Cups + Honours) ─────────────────────────
export async function renderTrophies(){
  const save=await getSave();
  const el=document.getElementById('trophies-content');
  if(!el) return;
  const team=await getTeam(save.userTeamId);
  const league=team?.league??save.userLeague??'Premier League';

  // ── Shared lookup tables ──────────────────────────────────
  const leagueTitleKey = {
    'Premier League':'premier_league','Championship':'championship',
    'League One':'league_one','League Two':'league_two',
    'La Liga':'la_liga','Bundesliga':'bundesliga',
    'Serie A':'serie_a','Ligue 1':'ligue_1','Eredivisie':'eredivisie',
  }[league] ?? 'premier_league';

  const leagueTitleName = {
    'Premier League':'Premier League','Championship':'Championship',
    'League One':'League One','League Two':'League Two',
    'La Liga':'La Liga','Bundesliga':'Bundesliga',
    'Serie A':'Serie A','Ligue 1':'Ligue 1','Eredivisie':'Eredivisie',
  }[league] ?? 'League Title';

  const domesticCupDefs = {
    'Premier League': [{key:'fa_cup',name:'FA Cup',icon:'🏆',color:'#f5c842'},{key:'league_cup',name:'Carabao Cup',icon:'🥛',color:'#c084fc'}],
    'Championship':   [{key:'fa_cup',name:'FA Cup',icon:'🏆',color:'#f5c842'},{key:'league_cup',name:'Carabao Cup',icon:'🥛',color:'#c084fc'}],
    'League One':     [{key:'fa_cup',name:'FA Cup',icon:'🏆',color:'#f5c842'},{key:'league_cup',name:'Carabao Cup',icon:'🥛',color:'#c084fc'}],
    'League Two':     [{key:'fa_cup',name:'FA Cup',icon:'🏆',color:'#f5c842'},{key:'league_cup',name:'Carabao Cup',icon:'🥛',color:'#c084fc'}],
    'Eredivisie':     [{key:'knvb_beker',name:'KNVB Beker',icon:'🏆',color:'#FF6600'}],
    'La Liga':        [{key:'copa_del_rey',name:'Copa del Rey',icon:'👑',color:'#c8102e'},{key:'supercopa',name:'Supercopa de España',icon:'🔴',color:'#f5c842'}],
    'Bundesliga':     [{key:'dfb_pokal',name:'DFB-Pokal',icon:'🏆',color:'#000000'},{key:'dfb_supercup',name:'DFL-Supercup',icon:'⚡',color:'#d4a017'}],
    'Serie A':        [{key:'coppa_italia',name:'Coppa Italia',icon:'🏆',color:'#009246'},{key:'supercoppa',name:'Supercoppa Italiana',icon:'🔵',color:'#009246'}],
    'Ligue 1':        [{key:'coupe_de_france',name:'Coupe de France',icon:'🏆',color:'#003189'},{key:'trophee_des_champions',name:"Trophée des Champions",icon:'🔵',color:'#e8151b'}],
  }[league] ?? [{key:'fa_cup',name:'FA Cup',icon:'🏆',color:'#f5c842'},{key:'league_cup',name:'League Cup',icon:'🥛',color:'#c084fc'}];

  const trophyDefs=[
    {key:leagueTitleKey, name:leagueTitleName, icon:'🏆', color:'#3b82f6'},
    ...domesticCupDefs,
    {key:'ucl',  name:'Champions League', icon:'⭐', color:'#3b82f6'},
    {key:'uel',  name:'Europa League',    icon:'🟠', color:'#f97316'},
    {key:'uecl', name:'Conference Lge',   icon:'🟢', color:'#22c55e'},
  ];

  // ── SECTION 1: Current Season cups ───────────────────────
  const cups   = save.cups ?? {};
  const INVITATION_GATED = new Set(['dfb_supercup','supercopa','supercoppa','trophee_des_champions']);
  const activeCupIds = Object.keys(cups).filter(cupId => {
    const meta = CUP_META[cupId];
    if(!meta) return false;
    if(!INVITATION_GATED.has(cupId)) return true;
    const st=cups[cupId];
    if(!st) return false;
    return (st.results??[]).length>0 || (st.roundIndex??0)>0 || (st.leaguePhase?.matchday??0)>0;
  });

  const cupsHTML = activeCupIds.length ? activeCupIds.map(cupId=>{
    const meta=CUP_META[cupId];
    if(!meta) return '';
    const state=cups[cupId];
    const badgeCls=state.status==='winner'?'won':state.status==='eliminated'?'out':'active';
    const badgeTxt=state.status==='winner'?'WON 🏆':state.status==='eliminated'?'OUT':'ACTIVE';

    let progressSection='';
    let resultsSection='';

    if(cupId==='ucl' && meta.isGroupStage && !state.leaguePhaseComplete){
      const lp=state.leaguePhase??{};
      const md=lp.matchday??0;
      const pts=lp.points??0;
      progressSection=`
        <div style="margin-bottom:8px">
          <div style="font-size:10px;color:var(--tx2);font-family:var(--fm);letter-spacing:1px;margin-bottom:4px">LEAGUE PHASE</div>
          <div style="display:flex;justify-content:space-between;font-size:13px">
            <span>MD ${md}/8</span>
            <span style="font-family:var(--fm);color:var(--acc2)"><strong>${pts}</strong> pts</span>
            <span style="color:var(--tx2);font-size:11px">GD: ${lp.gd>=0?'+':''}${lp.gd??0}</span>
          </div>
          <div class="cup-pw" style="margin-top:6px"><div class="cup-pb" style="width:${(md/8)*100}%;background:${meta.color}"></div></div>
          <div style="font-size:10px;color:var(--tx2);margin-top:4px">
            ${pts>=12?'✅ On course to qualify directly':pts>=8?'🔶 Likely playoff spot':md<4?'Season underway':'⚠ Need points to qualify'}
          </div>
        </div>`;
    } else {
      const roundIdx=state.roundIndex??0;
      const roundName=state.status==='winner'?'Trophy Won!':state.status==='eliminated'?`Out (${meta.rounds[Math.max(0,roundIdx-1)]??'Early'})`:(meta.rounds[roundIdx]??'Final');
      const progress=Math.round((roundIdx/meta.rounds.length)*100);
      progressSection=`
        <div class="cup-pw"><div class="cup-pb" style="width:${progress}%;background:${meta.color}"></div></div>
        <div class="cup-round">📍 ${roundName}</div>`;
    }

    const results=state.results??[];
    if(results.length){
      resultsSection=`<div class="cup-results">
        ${results.slice(-4).map(r=>{
          const isUCLMD=r.isUCLMatchday;
          const won=isUCLMD?r.result==='W':r.userWon;
          const lbl=isUCLMD?`MD${r.matchday}: ${r.result} vs ${r.opponentName} (${r.userGoals}-${r.oppGoals}) [${r.points} pts]`
                            :`${r.roundName}: ${won?'✅':'❌'} vs ${r.opponentName} (${r.userGoals}-${r.oppGoals})`;
          return`<div class="cup-res-row ${won?'won':'lost'}">${lbl}</div>`;
        }).join('')}
      </div>`;
    }

    return`<div class="cup-card cup-${cupId}">
      <div class="cup-bdg ${badgeCls}">${badgeTxt}</div>
      <div class="cup-icon">${meta.icon}</div>
      <div class="cup-name">${meta.name}</div>
      <div class="cup-desc">${meta.description}</div>
      ${progressSection}
      ${resultsSection}
    </div>`;
  }).join('')
  : `<div class="no-data" style="grid-column:1/-1;padding:40px">No cup competitions this season.</div>`;

  // ── SECTION 2: Club History honours ──────────────────────
  const {combined,earned}=await getHonorsForTeam(save.userTeamId);

  const honoursHTML=trophyDefs.map(t=>{
    const total=combined[t.key]||0;
    const myEarned=earned.filter(h=>h.trophy===t.key);
    return`<div class="hon-card">
      <div class="hon-icon">${t.icon}</div>
      <div class="hon-name">${t.name}</div>
      <div class="hon-count" style="color:${t.color}">${total}</div>
      <div class="hon-sub">All-time wins</div>
      ${myEarned.length?`<div class="hon-earned">+${myEarned.length} in your save</div>
        <div class="hon-history">${myEarned.map(h=>`<div class="hon-season">🏆 ${h.season}</div>`).join('')}</div>`:''}
    </div>`;
  }).join('');

  el.innerHTML=`
    <div class="trophies-layout">
      <div class="trophies-section">
        <div class="trophies-section-hdr">
          <div class="trophies-section-title">Current Season</div>
          <div class="trophies-section-sub">Active competitions</div>
        </div>
        <div class="trophies-grid-wrap"><div class="cups-layout">${cupsHTML}</div></div>
      </div>
      <div class="trophies-section">
        <div class="trophies-section-hdr" style="border-top:1px solid var(--bdr)">
          <div class="trophies-section-title">Club History</div>
          <div class="trophies-section-sub">All-time trophy record</div>
        </div>
        <div class="trophies-grid-wrap"><div class="honours-layout">${honoursHTML}</div></div>
      </div>
    </div>`;
}

// Keep old names as aliases so any lingering references don't break
export async function renderHonours(){ await renderTrophies(); }
export async function renderCupsLegacy(){ await renderTrophies(); }

// ── SETTINGS ──────────────────────────────────────────────────
export async function renderSettings(){
  const save=await getSave();
  const seasons=await getAllSeasons();
  const histEl=document.getElementById('season-history');
  if(histEl){
    if(!seasons.length){histEl.innerHTML=`<div class="no-data">No completed seasons yet.</div>`;}
    else{
      histEl.innerHTML=[...seasons].reverse().map(s=>`
        <div class="sh-row">
          <div class="sh-season">Season ${s.season}</div>
          <div class="sh-detail">
            ${s.userFinish}${['st','nd','rd'][s.userFinish-1]||'th'} place ·
            ${s.topScorers?.[0]?`Top scorer: ${s.topScorers[0].name} (${s.topScorers[0].goals}g)`:''}
            ${s.topAssists?.[0]?`· Top assists: ${s.topAssists[0].name} (${s.topAssists[0].assists}a)`:''}
            ${s.prizeMoney?`· Prize: ${fmt.money(s.prizeMoney)}`:''}
          </div>
        </div>`).join('');
    }
  }
  // Manager trophies
  const mgrEl=document.getElementById('manager-trophies');
  if(mgrEl && save){
    const {earned}=await getHonorsForTeam(save.userTeamId);
    const mgrName=save.managerName||'The Manager';
    if(!earned.length){
      mgrEl.innerHTML=`<div style="color:var(--txd);font-size:12px;padding:8px 0">No trophies won yet — keep going!</div>`;
    } else {
      // Group by trophy type
      const byTrophy={};
      earned.forEach(h=>{ if(!byTrophy[h.trophy]) byTrophy[h.trophy]=[];  byTrophy[h.trophy].push(h.season); });
      const TROPHY_NAMES={
        premier_league:'Premier League',championship:'Championship',league_one:'League One',league_two:'League Two',
        la_liga:'La Liga',bundesliga:'Bundesliga',serie_a:'Serie A',ligue_1:'Ligue 1',eredivisie:'Eredivisie',
        fa_cup:'FA Cup',league_cup:'Carabao Cup',copa_del_rey:'Copa del Rey',dfb_pokal:'DFB-Pokal',
        coppa_italia:'Coppa Italia',coupe_de_france:'Coupe de France',knvb_beker:'KNVB Beker',
        ucl:'Champions League',uel:'Europa League',uecl:'Conference League',
        dfb_supercup:'DFL Supercup',supercopa:'Supercopa',supercoppa:'Supercoppa',trophee_des_champions:'Trophée des Champions',
      };
      const TROPHY_ICONS={
        premier_league:'🏆',championship:'🏆',league_one:'🏆',league_two:'🏆',la_liga:'🏆',bundesliga:'🏆',
        serie_a:'🏆',ligue_1:'🏆',eredivisie:'🏆',fa_cup:'🏆',league_cup:'🥛',copa_del_rey:'👑',dfb_pokal:'🏆',
        coppa_italia:'🏆',coupe_de_france:'🏆',knvb_beker:'🏆',ucl:'⭐',uel:'🟠',uecl:'🟢',
        dfb_supercup:'⚡',supercopa:'🔴',supercoppa:'🔵',trophee_des_champions:'🔵',
      };
      mgrEl.innerHTML=`
        <div style="font-size:11px;color:var(--tx2);margin-bottom:10px">Won under <strong style="color:var(--tx)">${mgrName}</strong> · ${earned.length} total</div>
        <div style="display:flex;flex-direction:column;gap:5px">
          ${Object.entries(byTrophy).map(([trophy,seasons])=>`
            <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;background:var(--sur2);border-radius:8px;border-left:2px solid var(--acc2)">
              <div style="display:flex;align-items:center;gap:8px">
                <span style="font-size:16px">${TROPHY_ICONS[trophy]||'🏆'}</span>
                <div>
                  <div style="font-size:12px;font-weight:600">${TROPHY_NAMES[trophy]||trophy}</div>
                  <div style="font-size:10px;color:var(--tx2)">${seasons.join(' · ')}</div>
                </div>
              </div>
              <div style="font-family:var(--fd);font-size:20px;color:var(--acc2)">${seasons.length}×</div>
            </div>`).join('')}
        </div>`;
    }
  }
  // ── Recalculate Potentials button ─────────────────────────
  const recalcEl=document.getElementById('btn-recalc-potentials');
  if(recalcEl){
    recalcEl.onclick=async()=>{
      recalcEl.disabled=true;
      recalcEl.textContent='Recalculating…';
      try {
        const allPlayers=await getAllPlayers();
        // Re-run assignPotentials over all players — recalculates potentialRating,
        // growthPoints (reset to 0), and peakAge fresh from current ratings/ages.
        const updated=assignPotentials(allPlayers);
        await putPlayersBulk(updated);
        recalcEl.textContent='✅ Done!';
        toast('Potentials recalculated for all players — transfer market now up to date.','success',5000);
        setTimeout(()=>{ recalcEl.disabled=false; recalcEl.textContent='🔄 Recalculate Potentials'; },3000);
      } catch(err){
        recalcEl.disabled=false;
        recalcEl.textContent='🔄 Recalculate Potentials';
        toast('Error: '+err.message,'error');
      }
    };
  }
}
export function renderNewGame(){
  const grid=document.getElementById('team-grid');
  let selId=null,leagueFilter='all';

  // Auto-collects all *_TEAMS arrays — add new leagues via csv_to_league.py, no code changes needed
  const ALL_TEAMS_DATA=[
    ...(typeof PL_TEAMS!=='undefined'?PL_TEAMS:[]),
    ...(typeof EXTRA_LEAGUES_TEAMS!=='undefined'?EXTRA_LEAGUES_TEAMS:[]),
    ...(typeof LA_LIGA_TEAMS!=='undefined'?LA_LIGA_TEAMS:[]),
    ...(typeof SERIE_A_TEAMS!=='undefined'?SERIE_A_TEAMS:[]),
    ...(typeof BUNDESLIGA_TEAMS!=='undefined'?BUNDESLIGA_TEAMS:[]),
    ...(typeof LIGUE_1_TEAMS!=='undefined'?LIGUE_1_TEAMS:[]),
    ...(typeof CHAMPIONSHIP_TEAMS!=='undefined'?CHAMPIONSHIP_TEAMS:[]),
    ...(typeof LEAGUE_ONE_TEAMS!=='undefined'?LEAGUE_ONE_TEAMS:[]),
    ...(typeof LEAGUE_TWO_TEAMS!=='undefined'?LEAGUE_TWO_TEAMS:[]),
    ...(typeof SEGUNDA_TEAMS!=='undefined'?SEGUNDA_TEAMS:[]),
    ...(typeof ZWEITE_LIGA_TEAMS!=='undefined'?ZWEITE_LIGA_TEAMS:[]),
    ...(typeof SERIE_B_TEAMS!=='undefined'?SERIE_B_TEAMS:[]),
    ...(typeof LIGUE_2_TEAMS!=='undefined'?LIGUE_2_TEAMS:[]),
    ...(typeof EREDIVISIE_TEAMS!=='undefined'?EREDIVISIE_TEAMS:[]),
  ];

  const leagues=[...new Set(ALL_TEAMS_DATA.map(t=>t.league||'Premier League'))];

  // Build league filter buttons
  const filterEl=document.getElementById('ng-filters');
  if(filterEl){
    filterEl.innerHTML=`<button class="ng-f on" data-league="all">All (${ALL_TEAMS_DATA.length})</button>`
      +leagues.map(l=>{
        const count=ALL_TEAMS_DATA.filter(t=>(t.league||'Premier League')===l).length;
        const icons={'Premier League':'🏴󠁧󠁢󠁥󠁮󠁧󠁿','Championship':'🏴󠁧󠁢󠁥󠁮󠁧󠁿','League One':'🏴󠁧󠁢󠁥󠁮󠁧󠁿','League Two':'🏴󠁧󠁢󠁥󠁮󠁧󠁿','La Liga':'🇪🇸','Segunda División':'🇪🇸','Bundesliga':'🇩🇪','2. Bundesliga':'🇩🇪','Serie A':'🇮🇹','Serie B':'🇮🇹','Ligue 1':'🇫🇷','Ligue 2':'🇫🇷','Eredivisie':'🇳🇱'};
        return `<button class="ng-f" data-league="${l}">${icons[l]||'🌐'} ${l} (${count})</button>`;
      }).join('');
  }

  function buildGrid(){
    const teams=leagueFilter==='all'?ALL_TEAMS_DATA:ALL_TEAMS_DATA.filter(t=>(t.league||'Premier League')===leagueFilter);
    grid.innerHTML=teams.map(t=>`
      <div class="team-card ${t.id===selId?'sel':''}" data-tid="${t.id}">
        <div class="tc-crest">${t.crest}</div>
        <div class="tc-name">${t.name}</div>
        <div class="tc-rep">${t.league||'Premier League'} · Rep ${t.reputation}</div>
        <div class="tc-budget">${fmt.money(t.budget)}</div>
      </div>`).join('');
    grid.querySelectorAll('.team-card').forEach(card=>{
      card.onclick=()=>{
        grid.querySelectorAll('.team-card').forEach(c=>c.classList.remove('sel'));
        card.classList.add('sel');
        selId=card.dataset.tid;
        document.getElementById('btn-start').disabled=false;
      };
    });
  }

  buildGrid();

  document.querySelectorAll('#ng-filters .ng-f').forEach(btn=>{
    btn.onclick=()=>{
      document.querySelectorAll('#ng-filters .ng-f').forEach(b=>b.classList.remove('on'));
      btn.classList.add('on');
      btn.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
      leagueFilter=btn.dataset.league;
      buildGrid();
    };
  });

  document.getElementById('btn-start').onclick=async()=>{
    if(!selId) return;
    const btn=document.getElementById('btn-start');
    const managerName=(document.getElementById('ng-manager-name')?.value?.trim())||'The Manager';
    btn.disabled=true; btn.textContent='Setting up…';
    try{
      await startNewGame(selId, managerName);
      await themeForTeam(selId);
      document.getElementById('ng').style.display='none';
      document.getElementById('app').style.display='flex';
      initUI();
      await navigateTo('home');
    }catch(err){
      btn.disabled=false; btn.textContent='Start Season →';
      toast(err.message,'error');
    }
  };

  // ── Import save from new game screen ──────────────────────
  const ngImportBtn = document.getElementById('btn-import-ng');
  const ngImportInput = document.getElementById('import-save-ng');
  ngImportBtn?.addEventListener('click', () => {
    showModal('Import Save', `
      <p style="color:var(--tx2);line-height:1.7;margin-bottom:10px">Paste a save code to resume a previous career.</p>
      <textarea id="ng-save-code-input" placeholder="Paste save code here…" style="width:100%;height:90px;background:var(--sur);color:var(--tx);border:1px solid var(--bdr);border-radius:8px;padding:10px;font-family:monospace;font-size:10px;resize:none;word-break:break-all"></textarea>
    `, [
      { id:'ng-import-code', label:'📋 Load from Code', cls:'btn-p', handler: async () => {
        const code = document.getElementById('ng-save-code-input')?.value?.trim();
        if (!code) { toast('Paste a save code first', 'error'); return false; }
        _showFullOverlay('Loading save…');
        try {
          await importSaveFromCode(code);
          location.reload();
        } catch (err) {
          _removeFullOverlay();
          toast('Import failed: ' + err.message, 'error');
          return false;
        }
      }},
      { id:'ng-import-file', label:'📂 Load from File', cls:'btn-s', handler: () => { ngImportInput?.click(); return false; } },
      { id:'cancel', label:'Cancel', cls:'btn-s' }
    ]);
  });
  ngImportInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    _showFullOverlay('Loading save…');
    try {
      await importSaveFile(file);
      location.reload();
    } catch (err) {
      _removeFullOverlay();
      toast('Import failed: ' + err.message, 'error');
    } finally {
      ngImportInput.value = '';
    }
  });
}

// ── INIT UI ────────────────────────────────────────────────────
export function initUI(){
  registerScreen('home',         renderHome);
  registerScreen('transfers',    renderTransfers);
  registerScreen('competitions', () => { screenTicks.competitions++; });
  registerScreen('trophies',     renderTrophies);
  registerScreen('squad',        renderSquad);
  registerScreen('academy',      renderAcademy);
  registerScreen('tactics',      renderTactics);
  registerScreen('inbox',        renderInbox);
  registerScreen('settings',     renderSettings);

  document.querySelectorAll('[data-nav]').forEach(el=>{
    el.addEventListener('click',()=>navigateTo(el.dataset.nav));
  });
  document.getElementById('btn-reset')?.addEventListener('click',()=>{
    showModal('Reset Game?',
      '<p style="color:var(--tx2);line-height:1.7">Delete all progress and return to team selection. Cannot be undone.</p>',
      [{id:'reset',label:'Reset',cls:'btn-d',handler:async()=>{
        _showFullOverlay('Resetting…');
        try { await deleteDB(); } catch(e) { console.error(e); }
        location.reload();
      }},
       {id:'cancel',label:'Cancel',cls:'btn-s'}]
    );
  });

  // ── Shared save/load handlers ────────────────────────────────
  function _handleExportClick() {
    (async () => {
      try {
        const result = await exportSaveFile();
        showModal('Save Exported', `
          <p style="color:var(--tx2);line-height:1.7;margin-bottom:10px">Your save code is below. <strong>Copy it</strong> and paste it somewhere safe to restore later.</p>
          <p style="color:var(--txd);font-size:11px;margin-bottom:8px">Season ${result.meta.season} · GW ${result.meta.gameweek} · ${result.meta.teamId}</p>
          <textarea id="save-code-output" readonly style="width:100%;height:90px;background:var(--sur);color:var(--tx);border:1px solid var(--bdr);border-radius:8px;padding:10px;font-family:monospace;font-size:10px;resize:none;word-break:break-all">${result.saveCode}</textarea>
        `, [
          { id:'copy-code', label:'📋 Copy Save Code', cls:'btn-p', handler: async () => {
            const ta = document.getElementById('save-code-output');
            try { await navigator.clipboard.writeText(ta.value); toast('Save code copied to clipboard!'); }
            catch(e) { ta.select(); document.execCommand('copy'); toast('Save code copied!'); }
            return false;
          }},
          { id:'done', label:'Done', cls:'btn-s' }
        ]);
      } catch (err) { toast('Export failed: ' + err.message, 'error'); }
    })();
  }

  function _handleImportClick(fileInputId) {
    const fileInput = document.getElementById(fileInputId);
    showModal('Import Save', `
      <p style="color:var(--tx2);line-height:1.7;margin-bottom:10px">This will <strong>replace</strong> your current career. Paste a save code below, or choose a .pitch file.</p>
      <textarea id="save-code-input" placeholder="Paste save code here…" style="width:100%;height:90px;background:var(--sur);color:var(--tx);border:1px solid var(--bdr);border-radius:8px;padding:10px;font-family:monospace;font-size:10px;resize:none;word-break:break-all"></textarea>
    `, [
      { id:'import-code', label:'📋 Load from Code', cls:'btn-p', handler: async () => {
        const code = document.getElementById('save-code-input')?.value?.trim();
        if (!code) { toast('Paste a save code first', 'error'); return false; }
        _showFullOverlay('Loading save…');
        try { await importSaveFromCode(code); location.reload(); }
        catch (err) { _removeFullOverlay(); toast('Import failed: ' + err.message, 'error'); return false; }
      }},
      { id:'import-file', label:'📂 Load from File', cls:'btn-s', handler: () => { fileInput?.click(); return false; } },
      { id:'cancel', label:'Cancel', cls:'btn-s' }
    ]);
  }

  // ── Settings Export Save ───────────────────────────────────
  document.getElementById('btn-export-save')?.addEventListener('click', _handleExportClick);

  // ── Settings Import Save ───────────────────────────────────
  document.getElementById('btn-import-save')?.addEventListener('click', () => _handleImportClick('import-save-input'));
  const importInput = document.getElementById('import-save-input');
  importInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    _showFullOverlay('Loading save…');
    try { await importSaveFile(file); location.reload(); }
    catch (err) { _removeFullOverlay(); toast('Import failed: ' + err.message, 'error'); }
    finally { importInput.value = ''; }
  });
}

// ── BOOT ──────────────────────────────────────────────────────
/** Paints the club accent. Cosmetic — never let it block or break boot. */
export async function themeForTeam(teamId){
  try{
    if(!teamId) return;
    applyClubTheme(await getTeam(teamId));
  }catch(err){ console.warn('[theme]',err); }
}

export async function boot(){
  try{
    await openDB();
    const save=await getSave();
    if(!save||save._deleted){
      document.getElementById('ng').style.display='flex';
      document.getElementById('app').style.display='none';
      renderNewGame();
    } else {
      await themeForTeam(save.userTeamId);
      document.getElementById('ng').style.display='none';
      document.getElementById('app').style.display='flex';
      initUI();
      await navigateTo('home');
      if(typeof _updateInboxBadge==='function') _updateInboxBadge();
    }
  }catch(err){
    console.error('[boot]',err);
    document.body.innerHTML=`<div style="color:var(--acc3);padding:40px;font-family:monospace;background:var(--night)">Fatal error: ${err.message}<br><br><button onclick="location.reload()" style="padding:8px 16px;margin-top:12px;cursor:pointer">Reload</button></div>`;
  }
}

document.addEventListener('DOMContentLoaded',boot);

