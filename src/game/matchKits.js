import { hexToRgb, relativeLuminance, resolveAccent, textOn } from '../lib/theme.mjs';

const HOME_FALLBACK = '#D7263D';
const AWAY_FALLBACK = '#F3F0E7';

function colourDistance(a, b) {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

function kit(raw, fallback) {
  const resolved = resolveAccent(raw || fallback);
  const rgb = hexToRgb(resolved.hex);
  return { color:resolved.hex, numberColor:textOn(rgb) };
}

/**
 * Use both clubs' real primary colours unless they are too similar to read as
 * separate teams. With no away-kit field in the data model, the away side
 * receives a neutral light/dark change strip chosen against the home shirt.
 */
export function resolveMatchKits(homeTeam, awayTeam) {
  const home = kit(homeTeam?.primaryColor || homeTeam?.primary_color, HOME_FALLBACK);
  let away = kit(awayTeam?.primaryColor || awayTeam?.primary_color, AWAY_FALLBACK);
  const homeRgb = hexToRgb(home.color);
  const awayRgb = hexToRgb(away.color);
  const clashes = colourDistance(homeRgb, awayRgb) < .30;

  if (clashes) {
    const neutral = relativeLuminance(homeRgb) > .42 ? '#17201B' : '#F3F0E7';
    away = kit(neutral, AWAY_FALLBACK);
  }

  return { home, away, clashResolved:clashes };
}
