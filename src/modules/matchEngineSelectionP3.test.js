import { describe, expect, it } from 'vitest';
import { FORMATIONS, primaryRating, selectBench, selectEleven } from './matchEngine.js';
import { currentEffectiveLevel } from './playerModel.js';

function makePlayer(id, position, rating, extra = {}) {
  return {
    id,
    name:id,
    position,
    age:24,
    attack:['ST','CF','RW','LW','CAM'].includes(position) ? rating : rating - 12,
    midfield:['CM','CDM','CAM','RM','LM','RW','LW'].includes(position) ? rating : rating - 9,
    defence:['CB','RB','LB','CDM'].includes(position) ? rating : rating - 15,
    goalkeeping:position === 'GK' ? rating : 8,
    fitness:88,
    form:6,
    injured:false,
    suspended:false,
    inSquad:true,
    ...extra,
  };
}

function makeSquad() {
  const positions = [
    'GK','GK','CB','CB','CB','RB','RB','LB','LB','CDM','CDM','CM','CM','CM',
    'CAM','RW','RW','LW','LW','ST','ST','CF','RM','LM',
  ];
  return positions.map((position, index) => makePlayer(
    `player_${String(index).padStart(2, '0')}`,
    position,
    68 + (index * 7) % 18,
    index === 5 ? { sharpness:74, individualMorale:64 } : {},
  ));
}

function formationSlots(formation) {
  const shape = FORMATIONS[formation] ?? FORMATIONS['4-3-3'];
  return Object.entries(shape).flatMap(([position, count]) => Array.from({ length:count }, () => position));
}

function slotEligible(player, slot) {
  if (slot === 'GK') return player.position === 'GK';
  return player.position !== 'GK';
}

function slotRating(player, slot) {
  const level = currentEffectiveLevel(player, { position:slot });
  return Number.isFinite(level) ? level : -Infinity;
}

function withMatchPosition(player, position) {
  return { ...player, matchPosition:position ?? player.position };
}

function oldAssignRequestedLineup(players, formation) {
  const remaining = [...players];
  const assigned = [];
  for (const slot of formationSlots(formation)) {
    const eligible = remaining.filter(player => slotEligible(player, slot));
    if (!eligible.length) continue;
    eligible.sort((a,b) => slotRating(b, slot) - slotRating(a, slot) || String(a.id).localeCompare(String(b.id)));
    const player = eligible[0];
    assigned.push(withMatchPosition(player, slot));
    remaining.splice(remaining.findIndex(item => item.id === player.id), 1);
  }
  for (const player of remaining) assigned.push(withMatchPosition(player, player.position));
  return assigned.slice(0, 11);
}

function oldSelectEleven(players, formation = '4-3-3', lineup = null) {
  const avail = players.filter(p => !p.injured && !p.suspended && p.inSquad !== false);
  const used = new Set();

  if (lineup && lineup.length === 11) {
    const availableById = new Map(avail.map(p => [p.id, p]));
    const requested = [];
    for (const pid of lineup) {
      const player = availableById.get(pid);
      if (player && !used.has(player.id)) {
        requested.push(player);
        used.add(player.id);
      }
    }
    if (requested.length === 11) return oldAssignRequestedLineup(requested, formation);
    used.clear();
  }

  const chosen = [];
  for (const slot of formationSlots(formation)) {
    const candidates = avail
      .filter(player => !used.has(player.id) && slotEligible(player, slot))
      .sort((a,b) => slotRating(b, slot) - slotRating(a, slot) || String(a.id).localeCompare(String(b.id)));
    const pick = candidates[0];
    if (!pick) continue;
    chosen.push(withMatchPosition(pick, slot));
    used.add(pick.id);
  }

  if (chosen.length < 11) {
    const rem = avail.filter(p => !used.has(p.id))
      .sort((a,b) => (primaryRating(b) ?? 0) - (primaryRating(a) ?? 0) || String(a.id).localeCompare(String(b.id)));
    for (const player of rem) {
      if (chosen.length >= 11) break;
      chosen.push(withMatchPosition(player, player.position));
      used.add(player.id);
    }
  }
  return chosen.slice(0, 11);
}

function oldSelectBench(players, eleven) {
  const usedIds = new Set(eleven.map(p => p.id));
  return players
    .filter(p => !p.injured && !p.suspended && p.inSquad !== false && !usedIds.has(p.id))
    .sort((a,b) => (primaryRating(b) ?? 0) - (primaryRating(a) ?? 0) || String(a.id).localeCompare(String(b.id)));
}

describe('P3 optimized lineup selection', () => {
  it('preserves the pre-optimization XI and bench ordering across formations', () => {
    const squad = makeSquad();
    for (const formation of ['4-3-3', '4-2-3-1', '3-5-2', '5-3-2']) {
      const expectedXI = oldSelectEleven(squad, formation);
      const actualXI = selectEleven(squad, formation);
      expect(actualXI.map(player => [player.id, player.matchPosition])).toEqual(
        expectedXI.map(player => [player.id, player.matchPosition]),
      );
      expect(selectBench(squad, actualXI).map(player => player.id)).toEqual(
        oldSelectBench(squad, expectedXI).map(player => player.id),
      );
    }
  });

  it('preserves requested-lineup assignment and lexical tie breaking', () => {
    const squad = makeSquad();
    squad[11] = makePlayer('aaa_tie', 'CM', 80);
    squad[12] = makePlayer('zzz_tie', 'CM', 80);
    const requested = [squad[0], ...squad.filter(player => player.position !== 'GK').slice(0, 10)].map(player => player.id);

    const expected = oldSelectEleven(squad, '4-3-3', requested);
    const actual = selectEleven(squad, '4-3-3', requested);
    expect(actual.map(player => [player.id, player.matchPosition])).toEqual(
      expected.map(player => [player.id, player.matchPosition]),
    );
  });
});
