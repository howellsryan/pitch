// tools/lib/diff.mjs
// Ports footy-sim's added/removed/moved-club diff (playergeneration/lib.js's
// diffClubs) plus Step 5's new third category: departures. Matching is by
// player name, same heuristic footy-sim's own generator uses ("a real
// rename looks identical to a retirement+new-signing" - good enough to
// sanity-check a regeneration, not a formal identity system).

export function flattenToNameTeam(teams, playersByTeam) {
  const map = new Map();
  for (const t of teams) {
    for (const p of playersByTeam.get(t.team_id) || []) {
      map.set(p.name, t.name);
    }
  }
  return map;
}

export function diffClubs(oldMap, newMap) {
  const added = [];
  const removed = [];
  const moved = [];
  for (const [name, club] of newMap) {
    if (!oldMap.has(name)) added.push({ name, club });
    else if (oldMap.get(name) !== club) moved.push({ name, from: oldMap.get(name), to: club });
  }
  for (const [name, club] of oldMap) {
    if (!newMap.has(name)) removed.push({ name, club });
  }
  return { added, removed, moved };
}

// A departed player is in the PREVIOUS generation of some tracked league and
// absent from EVERY tracked league in the NEW generation - ruling out a
// same-universe transfer, which is just a normal "moved club" diff within a
// league (or would show as removed+added across two leagues, which isn't
// treated as a departure here since the plan scopes departures to "no
// longer in any tracked league's CSV").
export function computeDepartures(prevAllNames, newAllNames) {
  const departed = [];
  for (const name of prevAllNames) {
    if (!newAllNames.has(name)) departed.push(name);
  }
  return departed;
}
