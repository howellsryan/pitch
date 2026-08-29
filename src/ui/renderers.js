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
import { getSave, getTeam, importSaveFile, importSaveFromCode, openDB } from '../modules/db.js';
import { startNewGame } from '../modules/save.js';
import { fmt, navigateTo, registerScreen, showModal, toast } from './helpers.js';
import { renderHome } from './home_transfers.js';
import { _updateInboxBadge, renderInbox } from './inbox.js';
import { screenTicks } from '../lib/state/screens.svelte.js';
import { captureTokenFromHash, isSignedIn } from '../cloud/api.js';
import { pullAndApplyCloudSave } from '../cloud/sync.js';

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
// Migrated to src/lib/ui/TrophiesScreen.svelte (Phase 4,
// docs/plan/04-migration-phases.md) — same reasoning as Competitions above.
// registerScreen('trophies', ...) below just bumps screenTicks.trophies.

// ── SETTINGS ──────────────────────────────────────────────────
// Migrated to src/lib/ui/SettingsScreen.svelte (Phase 4,
// docs/plan/04-migration-phases.md) — same reasoning as Competitions above.
// The export/import/reset button wiring that used to live in initUI() below
// (querying static shell.html elements at boot time) moved into the
// component too, since those elements no longer exist until the Svelte
// island mounts and renders them — a boot-time getElementById() would have
// raced that. registerScreen('settings', ...) below just bumps
// screenTicks.settings.
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
  registerScreen('match',        () => { screenTicks.match++; });
  registerScreen('transfers',    () => { screenTicks.transfers++; });
  registerScreen('competitions', () => { screenTicks.competitions++; });
  registerScreen('trophies',     () => { screenTicks.trophies++; });
  registerScreen('squad',        () => { screenTicks.squad++; });
  registerScreen('academy',      () => { screenTicks.academy++; });
  registerScreen('tactics',      () => { screenTicks.tactics++; });
  registerScreen('inbox',        renderInbox);
  registerScreen('settings',     () => { screenTicks.settings++; });

  document.querySelectorAll('[data-nav]').forEach(el=>{
    el.addEventListener('click',()=>navigateTo(el.dataset.nav));
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
    // Pick up a #token=... dropped by the Google OAuth redirect (ROADMAP.md
    // item 7) before anything else reads the URL or decides new-game vs
    // continue.
    captureTokenFromHash();
    await openDB();
    let save=await getSave();
    if((!save||save._deleted) && isSignedIn()){
      // No local career yet, but signed in — best-effort restore from the
      // cloud (e.g. a fresh browser/device) before falling to team-select.
      // Never runs when a local career already exists, so it can't clobber
      // one — see src/cloud/sync.js's pullAndApplyCloudSave().
      const pulled = await pullAndApplyCloudSave();
      if(pulled.applied) save=await getSave();
    }
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

