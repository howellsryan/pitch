import { applyClubTheme } from '../lib/theme.mjs';
import { getSave, getTeam, openDB } from '../modules/db.js';
import { navigateTo, registerScreen, restoreScreenFromHistory } from './helpers.js';
import { renderHome } from './home_transfers.js';
import { _updateInboxBadge, renderInbox } from './inbox.js';
import { screenTicks } from '../lib/state/screens.svelte.js';
import { entryState } from '../lib/state/entry.svelte.js';
import { captureTokenFromHash, isSignedIn } from '../cloud/api.js';
import { pullAndApplyCloudSave } from '../cloud/sync.js';

// ── Full-screen overlay for blocking operations ─────────────
export function _showFullOverlay(msg) {
  _removeFullOverlay();
  const ov = document.createElement('div');
  ov.id = 'pitch-full-overlay';
  ov.style.cssText = 'position:fixed;inset:0;z-index:10001;background:var(--night,#0a0e14);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px';
  ov.innerHTML = '<div class="loader-spin" data-motion="essential"></div><div style="color:var(--tx,#fff);font-family:var(--fd,sans-serif);font-size:18px;letter-spacing:1px">' + (msg || 'Loading…') + '</div>';
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
// ── ENTRY ────────────────────────────────────────────────────
// Migrated to src/lib/ui/EntryScreen.svelte (R1, docs/plan/07-redesign.md).
// renderNewGame() built the team grid, league filters, manager-name field and
// both import paths with innerHTML; the component owns all of it now, and
// reaches back into this file only for enterGame() below. boot() still decides
// whether the entry route or the game shell is shown.

// ── INIT UI ────────────────────────────────────────────────────
// R7 makes the title route reachable from inside a running career. Returning
// from it must not bind the static sidebar/popstate handlers a second time.
let uiInitialised = false;
export function initUI(){
  if (uiInitialised) return;
  uiInitialised = true;

  registerScreen('home',         renderHome);
  registerScreen('match',        () => { screenTicks.match++; });
  registerScreen('transfers',    () => { screenTicks.transfers++; });
  registerScreen('competitions', () => { screenTicks.competitions++; });
  registerScreen('trophies',     () => { screenTicks.trophies++; });
  registerScreen('squad',        () => { screenTicks.squad++; });
  registerScreen('academy',      () => { screenTicks.academy++; });
  registerScreen('inbox',        renderInbox);
  registerScreen('settings',     () => { screenTicks.settings++; });

  // Desktop sidebar is legacy HTML. The mobile Broadcast pill owns its own
  // handlers in TabBar.svelte, so only these static controls are wired here.
  document.querySelectorAll('.sidebar [data-nav]').forEach(el=>{
    el.addEventListener('click',()=>navigateTo(el.dataset.nav));
  });

  // The shell is not a client-side router yet, but its destinations are real
  // history entries. Keep the bridge narrow: a Back/Forward traversal changes
  // screens without pushing another entry or re-running boot.
  if (!window.__pitchHistoryWired) {
    window.__pitchHistoryWired = true;
    window.addEventListener('popstate', () => { restoreScreenFromHistory(); });
  }
}

// ── TITLE / ENTRY ROUTE ───────────────────────────────────────
/**
 * Return to PITCH's title route without touching IndexedDB.
 *
 * R1 deliberately had no route back here because manufacturing one with a
 * sticky hash exposed stale-career data and doubled boot handlers. R7 makes
 * it explicit and ephemeral instead: Settings calls this, the app shell is
 * simply hidden, and CareerMenu offers Continue or a separately-confirmed
 * destructive reset. Reloading still resumes the career directly.
 */
export function showEntryMenu(){
  const ng = document.getElementById('ng');
  const app = document.getElementById('app');
  if (!ng || !app) return;
  app.style.display='none';
  ng.style.display='flex';
  entryState.hasSave=true;
  entryState.showing=true;
  ng.focus?.();
}

// ── ENTER THE GAME SHELL ──────────────────────────────────────
/**
 * Hide the entry route, reveal the app, wire the screens, land on Home.
 *
 * Shared by boot()'s resume branch and EntryScreen's start-a-career and
 * continue-a-career handoffs. Kept in one place deliberately: three callers
 * doing these four things by hand is how the new-career path and the resume
 * path drift out of step.
 */
export async function enterGame(){
  entryState.showing=false;
  entryState.hasSave=true;
  document.getElementById('ng').style.display='none';
  const app=document.getElementById('app');
  app.style.display='flex';
  initUI();
  await navigateTo('home', { history: 'replace' });
  _updateInboxBadge();
  // The entry route's sheet restores focus to the club card that started the
  // career — which #ng's display:none has just removed from the page, leaving
  // keyboard and screen-reader users on <body>. Park focus on the shell the
  // player was moved to instead.
  app.focus?.();
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
      // Only now may EntryScreen offer to start a career: until the cloud
      // pull above has settled, one might still arrive.
      entryState.hasSave=false;
      entryState.showing=true;
    } else {
      entryState.hasSave=true;
      await themeForTeam(save.userTeamId);
      await enterGame();
    }
  }catch(err){
    console.error('[boot]',err);
    document.body.innerHTML=`<div style="color:var(--acc3);padding:40px;font-family:monospace;background:var(--night)">Fatal error: ${err.message}<br><br><button onclick="location.reload()" style="padding:8px 16px;margin-top:12px;cursor:pointer">Reload</button></div>`;
  }
}

document.addEventListener('DOMContentLoaded',boot);