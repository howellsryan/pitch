/**
 * src/game/opponents.js — Synthetic squads for AI opponents who have a
 * strength rating but no real players stored in IndexedDB (European
 * opposition drawn by name only). Pure, DOM-free. Ported unchanged from
 * ui/prematch.js's _generateStubPlayers (Phase 5,
 * docs/plan/04-migration-phases.md).
 */
export function generateStubPlayers(team, strength) {
  const s = Math.max(40, Math.min(95, strength));
  const v = (base, spread) => Math.round(base + (Math.random() - 0.5) * spread);
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
