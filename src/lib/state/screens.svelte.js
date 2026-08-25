/**
 * Bridges legacy-driven screen navigation (helpers.js's registerScreen /
 * navigateTo, which toggles a `.screen`'s `active` class) to Svelte islands
 * mounted inside those same `.screen` elements. Svelte doesn't own the
 * screen-switching lifecycle yet — Phase 3 replaces one screen at a time,
 * not the router — so an island that needs to refetch when its screen
 * becomes active again registers an onEnter hook via registerScreen() that
 * bumps its counter here instead of duplicating navigation state.
 */
export const screenTicks = $state({ competitions: 0, home: 0, squad: 0, tactics: 0 });
