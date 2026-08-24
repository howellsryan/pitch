/**
 * Vite entry point.
 *
 * Phase 2 of the rebuild (docs/plan/04-migration-phases.md): the game is now
 * assembled by Vite from real ES modules instead of by concatenating globals.
 * The UI is deliberately unchanged here — ui/*.js are imported for their side
 * effects exactly as they were concatenated before, and get replaced screen by
 * screen from Phase 3 onward.
 */

import './app.css';

import { navigateTo } from './ui/helpers.js';

// ui/renderers.js registers the DOMContentLoaded → boot() handler, so importing
// these for their side effects is what starts the game. Order mirrors
// src/build.py's MODULES list; with real imports it no longer has to, but
// keeping it makes the two build paths easy to compare.
import './ui/helpers.js';
import './ui/home_transfers.js';
import './ui/renderers.js';
import './ui/squad_tactics_offers.js';
import './ui/academy.js';
import './ui/inbox.js';
import './ui/prematch.js';
import './ui/watchmatch.js';

// src/shell.html has two inline onclick="navigateTo(...)" handlers, which
// resolve against the global scope rather than this module's. Everything else
// in ui/ binds handlers programmatically.
window.navigateTo = navigateTo;
