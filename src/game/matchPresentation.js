/**
 * Deterministic broadcast choreography. It visualises the match engine's
 * existing possession counts and events; it never contributes to a result.
 */
import { SLOT_LAYOUT, SLOT_POS_MAP } from './formationLayout.js';

function hash(value) { let h = 2166136261; for (const c of String(value)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function assign(players, formation, home) {
  const slots = SLOT_LAYOUT[formation] ?? SLOT_LAYOUT['4-3-3'];
  const remaining = [...players];
  return slots.map((slot, shirt) => {
    const accepted = SLOT_POS_MAP[slot.p] ?? [slot.p];
    const i = remaining.findIndex(p => accepted.includes(p.position));
    const player = remaining.splice(i >= 0 ? i : 0, 1)[0];
    if (!player) return null;
    return { id: player.id, shirt: shirt + 1, x: slot.x, y: home ? slot.y : 100 - slot.y, position: player.position };
  }).filter(Boolean);
}
function findMarker(markers, id) { return markers.find(marker => marker.id === id); }
function clamp(value) { return Math.max(4, Math.min(96, value)); }
function roam(marker, phase) {
  const seed = hash(`${marker.id}:${phase}`);
  const amplitude = marker.position === 'GK' ? 1.2 : marker.position === 'CB' ? 2.8 : 5.2;
  const x = clamp(marker.x + Math.sin((phase + (seed % 17)) * .62) * amplitude);
  const y = clamp(marker.y + Math.cos((phase + ((seed >>> 5) % 19)) * .47) * amplitude * .72);
  return { ...marker, x, y };
}

export function makeBroadcastFrame({ phase, possessionTeamId, homeTeamId, homeFormation, awayFormation, homePlayers, awayPlayers, event = null }) {
  const home = assign(homePlayers, homeFormation, true);
  const away = assign(awayPlayers, awayFormation, false);
  const homeInPossession = possessionTeamId === homeTeamId;
  const attackers = homeInPossession ? home : away;
  const defenders = homeInPossession ? away : home;
  const seed = hash(`${phase}:${possessionTeamId}`);
  const outfield = attackers.filter(p => p.position !== 'GK');
  const from = event?.assistId ? findMarker(attackers, event.assistId) : outfield[seed % Math.max(1, outfield.length)];
  const to = event?.playerId ? findMarker(attackers, event.playerId) : outfield[(seed >>> 8) % Math.max(1, outfield.length)];
  const goalY = homeInPossession ? 3 : 97;
  const isGoal = event?.type === 'goal';
  const ballTarget = isGoal ? { x: 50, y: goalY } : (to ?? from ?? { x: 50, y: 50 });
  const presser = from ? [...defenders].sort((a, b) => ((a.x-from.x)**2+(a.y-from.y)**2)-((b.x-from.x)**2+(b.y-from.y)**2))[0] : null;
  const keeper = defenders.find(p => p.position === 'GK');
  const adjustedDefenders = defenders.map(p => p.id === presser?.id && from ? { ...p, x: p.x + (from.x-p.x)*.34, y: p.y + (from.y-p.y)*.34, pressing: true } : p);
  const adjustedAttackers = attackers.map(p => p.id === to?.id && !isGoal ? { ...p, x: p.x + (50-p.x)*.08, y: p.y + ((homeInPossession ? 12 : 88)-p.y)*.1, receiving: true } : p);
  const movedKeeper = isGoal && keeper ? { ...keeper, x: 50, y: homeInPossession ? 15 : 85, rushing: true } : null;
  const team = marker => homeInPossession ? (adjustedAttackers.some(p => p.id === marker.id) ? 'home' : 'away') : (adjustedAttackers.some(p => p.id === marker.id) ? 'away' : 'home');
  const markers = [...adjustedAttackers, ...adjustedDefenders].map(marker => roam(movedKeeper?.id === marker.id ? movedKeeper : { ...marker, team: team(marker) }, phase));
  return { markers, ball: { ...ballTarget, from, to, shooting: isGoal }, action: isGoal ? 'SHOT · GOAL' : presser ? 'PASSING MOVE' : 'IN POSSESSION' };
}
