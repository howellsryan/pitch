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

import { mount } from 'svelte';
import { navigateTo } from './ui/helpers.js';
import TabBar from './lib/ui/TabBar.svelte';
import LeagueScreen from './lib/ui/LeagueScreen.svelte';
import HomeScreen from './lib/ui/HomeScreen.svelte';
import SquadScreen from './lib/ui/SquadScreen.svelte';
import TacticsScreen from './lib/ui/TacticsScreen.svelte';
import AcademyScreen from './lib/ui/AcademyScreen.svelte';
import TrophiesScreen from './lib/ui/TrophiesScreen.svelte';
import SettingsScreen from './lib/ui/SettingsScreen.svelte';
import TransfersScreen from './lib/ui/TransfersScreen.svelte';

// ui/renderers.js registers the DOMContentLoaded → boot() handler, so importing
// these for their side effects is what starts the game. Order mirrors
// src/build.py's MODULES list; with real imports it no longer has to, but
// keeping it makes the two build paths easy to compare.
import './ui/helpers.js';
import './ui/home_transfers.js';
import './ui/renderers.js';
import './ui/squad_tactics_offers.js';
import './ui/inbox.js';
import './ui/prematch.js';
import './ui/watchmatch.js';

// src/shell.html has two inline onclick="navigateTo(...)" handlers, which
// resolve against the global scope rather than this module's. Everything else
// in ui/ binds handlers programmatically.
window.navigateTo = navigateTo;

// Svelte islands (Phase 3) — mounted straight into the legacy shell's markup.
// Both mount points sit inside #app, which boot() (ui/renderers.js) shows
// only once a save exists, so these stay inert until then exactly like the
// rest of the legacy screens do.
const tabbarMount = document.getElementById('tabbar-mount');
if (tabbarMount) mount(TabBar, { target: tabbarMount });

const leagueMount = document.getElementById('screen-competitions');
if (leagueMount) mount(LeagueScreen, { target: leagueMount });

const homeMount = document.getElementById('screen-home');
if (homeMount) mount(HomeScreen, { target: homeMount });

const squadMount = document.getElementById('screen-squad');
if (squadMount) mount(SquadScreen, { target: squadMount });

const tacticsMount = document.getElementById('screen-tactics');
if (tacticsMount) mount(TacticsScreen, { target: tacticsMount });

const academyMount = document.getElementById('screen-academy');
if (academyMount) mount(AcademyScreen, { target: academyMount });

const trophiesMount = document.getElementById('screen-trophies');
if (trophiesMount) mount(TrophiesScreen, { target: trophiesMount });

const settingsMount = document.getElementById('screen-settings');
if (settingsMount) mount(SettingsScreen, { target: settingsMount });

const transfersMount = document.getElementById('screen-transfers');
if (transfersMount) mount(TransfersScreen, { target: transfersMount });
