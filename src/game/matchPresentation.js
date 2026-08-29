/** Deterministic broadcast choreography. It visualises phases, never results. */
import { SLOT_LAYOUT, SLOT_POS_MAP } from './formationLayout.js';
function hash(value) { let h = 2166136261; for (const c of String(value)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function clamp(value) { return Math.max(4, Math.min(96, value)); }
function assign(players, formation, home) {
  const slots = SLOT_LAYOUT[formation] ?? SLOT_LAYOUT['4-3-3']; const remaining = [...players];
  return slots.map((slot, shirt) => { const accepted = SLOT_POS_MAP[slot.p] ?? [slot.p]; const i = remaining.findIndex(p => accepted.includes(p.position)); const player = remaining.splice(i >= 0 ? i : 0, 1)[0]; return player ? { id: player.id, shirt: shirt + 1, x: slot.x, y: home ? slot.y : 100 - slot.y, position: player.position } : null; }).filter(Boolean);
}
function findMarker(markers, id) { return markers.find(marker => marker.id === id); }
function isWide(position) { return ['RB', 'LB', 'RW', 'LW', 'RM', 'LM'].includes(position); }
function isForward(position) { return ['ST', 'CF', 'RW', 'LW', 'CAM'].includes(position); }
function shape(marker, { attacking, direction, phase }) {
  const seed = hash(marker.id); const wave = Math.sin(phase * .55 + seed % 23) * (marker.position === 'GK' ? .5 : 1.7); const drift = Math.cos(phase * .42 + (seed >>> 5) % 19) * 1.1;
  let x = marker.x + wave; let y = marker.y + drift;
  if (attacking) { y += direction * (marker.position === 'GK' ? 2 : isForward(marker.position) ? 15 : isWide(marker.position) ? 11 : 8); if (isWide(marker.position)) x += marker.x < 50 ? -7 : 7; if (['RB', 'LB'].includes(marker.position)) y += direction * 5; if (['ST', 'CF'].includes(marker.position)) x += marker.x < 50 ? -3 : 3; }
  else { y -= direction * (marker.position === 'GK' ? 0 : 6); x = 50 + (x - 50) * (marker.position === 'GK' ? 1 : .72); }
  return { ...marker, x: clamp(x), y: clamp(y) };
}
function restartFrame(restart, attackers, defenders, direction) {
  const attack = attackers.map((p, i) => ({ ...p, x: clamp(50 + (p.x - 50) * .7 + ((i % 3) - 1) * 2), y: clamp(p.y + direction * 12) })); const defend = defenders.map(p => ({ ...p, x: clamp(50 + (p.x - 50) * .64), y: clamp(p.y - direction * 7) })); const side = restart.variant % 2 ? 5 : 95; const goalY = direction < 0 ? 4 : 96;
  if (restart.type === 'throw-in') return { attackers: attack, defenders: defend, ball: { x: side, y: 45 }, action: 'THROW-IN · RESETTING SHAPE' };
  if (restart.type === 'free-kick') return { attackers: attack, defenders: defend, ball: { x: 50, y: direction < 0 ? 28 : 72 }, action: 'FREE KICK · SET PIECE' };
  if (restart.type === 'corner') return { attackers: attack, defenders: defend, ball: { x: side, y: goalY }, action: 'CORNER · PLAY SLOWED' };
  return { attackers: attack, defenders: defend, ball: { x: 50, y: direction < 0 ? 8 : 92 }, action: 'GOAL KICK · BUILDING FROM THE BACK' };
}
export function derivedRestart(phase) { if (!phase || phase % 13 !== 0) return null; const types = ['throw-in', 'free-kick', 'corner', 'goal-kick']; return { type: types[Math.floor(phase / 13) % types.length], variant: Math.floor(phase / 13) }; }
export function makeBroadcastFrame({ phase, possessionTeamId, homeTeamId, homeFormation, awayFormation, homePlayers, awayPlayers, event = null, restart = null }) {
  const home = assign(homePlayers, homeFormation, true); const away = assign(awayPlayers, awayFormation, false); const homeInPossession = possessionTeamId === homeTeamId; const attackers = homeInPossession ? home : away; const defenders = homeInPossession ? away : home; const direction = homeInPossession ? -1 : 1; const seed = hash(`${phase}:${possessionTeamId}`); const outfield = attackers.filter(p => p.position !== 'GK'); const from = event?.assistId ? findMarker(attackers, event.assistId) : outfield[seed % Math.max(1, outfield.length)]; const to = event?.playerId ? findMarker(attackers, event.playerId) : outfield[(seed >>> 8) % Math.max(1, outfield.length)]; const isGoal = event?.type === 'goal'; const setPiece = restart ? restartFrame(restart, attackers, defenders, direction) : null;
  const attackShape = (setPiece?.attackers ?? attackers).map(p => shape(p, { attacking: !setPiece, direction, phase })); const defendShape = (setPiece?.defenders ?? defenders).map(p => shape(p, { attacking: false, direction, phase })); const shapedFrom = from && attackShape.find(p => p.id === from.id); const shapedTo = to && attackShape.find(p => p.id === to.id); const presser = shapedFrom ? [...defendShape].filter(p => p.position !== 'GK').sort((a, b) => ((a.x - shapedFrom.x) ** 2 + (a.y - shapedFrom.y) ** 2) - ((b.x - shapedFrom.x) ** 2 + (b.y - shapedFrom.y) ** 2))[0] : null;
  const pressedDefence = defendShape.map(p => p.id === presser?.id && shapedFrom ? { ...p, x: p.x + (shapedFrom.x - p.x) * .42, y: p.y + (shapedFrom.y - p.y) * .42, pressing: true } : p); const movedAttack = attackShape.map(p => p.id === shapedTo?.id && !isGoal && !setPiece ? { ...p, x: clamp(p.x + (50 - p.x) * .15), y: clamp(p.y + direction * 5), receiving: true } : p); const keeper = pressedDefence.find(p => p.position === 'GK'); const movedKeeper = isGoal && keeper ? { ...keeper, x: 50, y: direction < 0 ? 15 : 85, rushing: true } : null; const team = marker => homeInPossession ? (movedAttack.some(p => p.id === marker.id) ? 'home' : 'away') : (movedAttack.some(p => p.id === marker.id) ? 'away' : 'home'); const markers = [...movedAttack, ...pressedDefence].map(marker => ({ ...(movedKeeper?.id === marker.id ? movedKeeper : marker), team: team(marker) })); const ball = isGoal ? { x: 50, y: direction < 0 ? 3 : 97, shooting: true } : (setPiece?.ball ?? { ...(shapedTo ?? shapedFrom ?? { x: 50, y: 50 }), shooting: false });
  return { markers, ball: { ...ball, from: shapedFrom, to: shapedTo }, action: isGoal ? 'SHOT · GOAL' : (setPiece?.action ?? (presser ? 'PASSING MOVE · PRESSURE' : 'BUILDING AN ATTACK')) };
}
