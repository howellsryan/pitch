/**
 * src/game/opponents.js — Synthetic squads for AI opponents who have a
 * strength rating but no real players stored in IndexedDB (European
 * opposition drawn by name only). Pure, DOM-free. Ported from
 * ui/prematch.js's _generateStubPlayers (Phase 5,
 * docs/plan/04-migration-phases.md).
 *
 * T5.2 makes the default synthetic squad deterministic so Team News, Watch
 * and any repeated resolver for the same team/strength see the same players.
 */

function stubSeed(value) {
  let hash = 2166136261;
  for (const ch of String(value ?? '')) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stubRng(seed) {
  let state = seed || 1;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateStubPlayers(team, strength, rng = null) {
  const s = Math.max(40, Math.min(95, strength));
  const random = typeof rng === 'function'
    ? rng
    : stubRng(stubSeed(`${team?.id ?? team?.name ?? 'opponent'}:${s}`));
  const v = (base, spread) => Math.round(base + (random() - 0.5) * spread);
  const POSITIONS = [
    'GK',
    'CB','CB','RB','LB',
    'CM','CM','CDM',
    'RW','LW','ST',
    // bench
    'GK','CB','CM','ST','LW',
  ];
  const STUB_NAMES = [
    'M. Kovačević','L. Fernández','A. Müller','D. Santos','J. Andersen',
    'R. Silva','K. Traoré','P. Johansson','N. Popescu','T. García',
    'S. Eriksen','C. Moretti','H. Yamamoto','B. Olsen','F. Laurent',
    'O. Novak',
  ];
  return POSITIONS.map((pos, i) => ({
    id:          `${team.id}_stub_${i}`,
    name:        STUB_NAMES[i] ?? `Player ${i+1}`,
    position:    pos,
    teamId:      team.id,
    attack:      pos==='GK' ? 20 : v(s,14),
    midfield:    v(s - (pos==='GK'?30:0), 14),
    defence:     v(s - (['ST','RW','LW'].includes(pos)?20:0), 14),
    goalkeeping: pos==='GK' ? v(s,10) : 20,
    fitness:     90,
    inSquad:     true,
    injured:     false,
    suspended:   false,
  }));
}
