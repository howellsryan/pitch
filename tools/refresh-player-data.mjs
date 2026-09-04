#!/usr/bin/env node
/**
 * Stable entry point for Pitch's football-data refresh.
 *
 * EA SPORTS FC 27 is the source of truth for player club affiliation, overall
 * rating, position and public face attributes. The implementation lives in the
 * FC27-specific module so future editions can be introduced without changing
 * package/workflow entry points.
 */
import './refresh-player-data-fc27.mjs';
