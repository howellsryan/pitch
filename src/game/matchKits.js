import { contrastRatio, hexToRgb, relativeLuminance, resolveAccent, textOn } from '../lib/theme.mjs';

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

/** Presentation metadata only; never decorate or mutate a persisted moment. */
export function resolvePlayableAppearance(moment, homeTeam, awayTeam, homePlayers = [], awayPlayers = []) {
  const kits = resolveMatchKits(homeTeam, awayTeam);
  const attacksAway = moment?.attackingTeamId != null && moment.attackingTeamId === awayTeam?.id;
  const attack = attacksAway ? kits.away : kits.home;
  const defence = attacksAway ? kits.home : kits.away;
  const players = attacksAway ? awayPlayers : homePlayers;
  const shooter = (players ?? []).find(player => player.id === moment?.shooterId);
  // No persistent squad-number system exists yet: use an explicit number if
  // supplied, otherwise the stable striker/keeper presentation defaults.
  const number = Number(shooter?.shirtNumber);
  const keeperColor = ['#F7C948', '#986FE3', '#34CBB6'].sort((a, b) => {
    const score = color => Math.min(...[attack.color, defence.color].map(kitColor => contrastRatio(hexToRgb(color), hexToRgb(kitColor))));
    return score(b) - score(a);
  })[0];
  return {
    attack:{ ...attack, shorts:'#17212A', number:Number.isInteger(number) && number > 0 && number < 100 ? number : 9 },
    defence:{ ...defence, shorts:'#E7EAE3', number:4 },
    keeper:{ color:keeperColor, numberColor:textOn(hexToRgb(keeperColor)), shorts:'#17212A', number:1 },
  };
}
