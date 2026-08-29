/** Presentational motion derived from engine events; never simulation input. */
import { SLOT_LAYOUT, SLOT_POS_MAP } from './formationLayout.js';

function hash(value) { let h = 0x811c9dc5; for (const char of String(value)) { h ^= char.charCodeAt(0); h = Math.imul(h, 0x01000193); } return h >>> 0; }
function assignSlots(players, slots) {
  const unused = [...players];
  return slots.map(slot => { const accepted = SLOT_POS_MAP[slot.p] ?? [slot.p]; const index = unused.findIndex(p => accepted.includes(p.position)); const player = unused.splice(index >= 0 ? index : 0, 1)[0]; return player ? { ...slot, player } : null; }).filter(Boolean);
}
function pointFor(playerId, assigned) { const slot = assigned.find(item => item.player.id === playerId); return slot && { x: slot.x, y: slot.y, playerId: slot.player.id, playerName: slot.player.name }; }

/** A plausible repeatable path for a real goal, using real player slots. */
export function deriveGoalMotion(event, formation, lineup, { attackingUp = true } = {}) {
  if (!event || event.type !== 'goal' || !Array.isArray(lineup) || !lineup.length) return [];
  const assigned = assignSlots(lineup, SLOT_LAYOUT[formation] ?? SLOT_LAYOUT['4-3-3']);
  const orient = point => attackingUp ? point : { ...point, y: 100 - point.y };
  const scorer = pointFor(event.playerId, assigned);
  if (!scorer) return [];
  const assister = event.assistId ? pointFor(event.assistId, assigned) : null;
  const seed = hash(`${event.minute}:${event.playerId}`);
  const candidates = assigned.map(item => orient({ x: item.x, y: item.y, playerId: item.player.id, playerName: item.player.name })).filter(point => point.playerId !== event.playerId && point.playerId !== event.assistId).sort((a, b) => (attackingUp ? a.y - b.y : b.y - a.y) || String(a.playerId).localeCompare(String(b.playerId)));
  const bridge = candidates.length ? candidates[seed % candidates.length] : null;
  return [assister && orient(assister), bridge, orient(scorer), { x: 50, y: attackingUp ? 4 : 96, playerId: 'goal', playerName: 'Goal' }].filter(Boolean).filter((point, index, all) => index === 0 || point.playerId !== all[index - 1].playerId);
}
