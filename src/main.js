/**
 * Vite entry point.
 *
 * Phase 2 of the rebuild (docs/plan/04-migration-phases.md) made the game a
 * real ES module graph instead of a concatenated global bundle. The legacy
 * `ui/*.js` renderers are still imported for their side effects, unchanged.
 * Phase 3 adds the first real Svelte pieces as islands mounted into specific
 * elements of that same legacy shell (src/shell.html) — not a rewrite of
 * main.js's boot flow, which stays exactly as Phase 2 left it. Screens move
 * out of `ui/` and into `lib/ui/` one at a time; see the plan doc's Phase 4
 * table for what's still legacy.
 */

import './app.css';
import './r6.css';
import './mobile-ux.css';
import './r7.css';
import './r7-mobile-fixes.css';
import './p5.css';
import './touchline-ledger-polish.css';

import { mount } from 'svelte';
import { navigateTo } from './ui/helpers.js';
import EntryScreen from './lib/ui/EntryScreenClean.svelte';
import CareerMenu from './lib/ui/CareerMenu.svelte';
import TabBar from './lib/ui/TabBar.svelte';
import LeagueScreen from './lib/ui/LeagueScreen.svelte';
import HomeScreen from './lib/ui/HomeScreen.svelte';
import SquadScreen from './lib/ui/SquadScreen.svelte';
import AcademyScreen from './lib/ui/AcademyPathwaysScreen.svelte';
import LoanPathwaysPanel from './lib/ui/LoanPathwaysPanel.svelte';
import TrophiesScreen from './lib/ui/TrophiesScreen.svelte';
import SettingsScreen from './lib/ui/SettingsScreenClean.svelte';
import TransfersScreen from './lib/ui/TransfersScreen.svelte';
import ScoutingDrawer from './lib/ui/ScoutingDrawer.svelte';
import MatchScreen from './lib/ui/MatchScreen.svelte';
import InboxScreen from './lib/ui/InboxScreen.svelte';

// ui/renderers.js registers the DOMContentLoaded → boot() handler, so importing
// these for their side effects is what starts the game. Order mirrors
// src/build.py's MODULES list; with real imports it no longer has to, but
// keeping it makes the two build paths easy to compare.
import './ui/helpers.js';
import './ui/home_transfers.js';
import './ui/renderers.js';
import './ui/squad_tactics_offers.js';
import './ui/inbox.js';
import './ui/accessibilityEnhancements.js';

// src/shell.html has two inline onclick="navigateTo(...)" handlers, which
// resolve against the global scope rather than this module's. Everything else
// in ui/ binds handlers programmatically.
window.navigateTo = navigateTo;

// Svelte islands (Phase 3) — mounted straight into the legacy shell's markup.
// All but the entry island sit inside #app, which boot() (ui/renderers.js)
// shows only once a save exists, so they stay inert until then exactly like
// the rest of the legacy screens do.

const entryMount = document.getElementById('entry-mount');
if (entryMount) mount(EntryScreen, { target:entryMount });

const entryStage = document.getElementById('ng');
if (entryStage) mount(CareerMenu, { target:entryStage });

const tabbarMount = document.getElementById('tabbar-mount');
if (tabbarMount) mount(TabBar, { target:tabbarMount });

const leagueMount = document.getElementById('screen-competitions');
if (leagueMount) mount(LeagueScreen, { target:leagueMount });

const homeMount = document.getElementById('screen-home');
if (homeMount) mount(HomeScreen, { target:homeMount });

const squadMount = document.getElementById('screen-squad');
if (squadMount) mount(SquadScreen, { target:squadMount });

const academyMount = document.getElementById('screen-academy');
if (academyMount) mount(AcademyScreen, { target:academyMount });

const trophiesMount = document.getElementById('screen-trophies');
if (trophiesMount) mount(TrophiesScreen, { target:trophiesMount });

const settingsMount = document.getElementById('screen-settings');
if (settingsMount) mount(SettingsScreen, { target:settingsMount });

const transfersMount = document.getElementById('screen-transfers');
if (transfersMount) {
  mount(TransfersScreen, { target:transfersMount });
  mount(ScoutingDrawer, { target:transfersMount });
  // Loan pathways belongs to the loan market. The component gates its launcher
  // against Transfers' active Loans tab so it cannot float over Squad or other
  // market surfaces while retaining the existing P9 pathway workflow.
  mount(LoanPathwaysPanel, { target:transfersMount });
}

const matchMount = document.getElementById('screen-match');
if (matchMount) mount(MatchScreen, { target:matchMount });

const inboxMount = document.getElementById('screen-inbox');
if (inboxMount) mount(InboxScreen, { target:inboxMount });

// Phase 1 Playable Key Moments is deliberately dev-only and lazy. The POC UI
// and both 3D renderer adapters stay completely outside the ordinary management
// load unless this explicit query flag is present. Nothing in this harness can
// write a real career fixture.
const playablePocEnabled = new window.URLSearchParams(window.location.search).get('playable-poc') === '1';
if (playablePocEnabled) {
  const playablePocMount = document.createElement('div');
  playablePocMount.id = 'playable-poc-mount';
  document.body.appendChild(playablePocMount);
  import('./lib/ui/PlayableMomentsPoc.svelte')
    .then(({ default:PlayableMomentsPoc }) => mount(PlayableMomentsPoc, { target:playablePocMount }))
    .catch(error => console.error('Playable Key Moments POC failed to load', error));
}
