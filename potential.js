/** modules/potential.js — FIFA-style potential/development: assignPotentials, applyDevelopment, getPotentialStars */
import { getAllPlayers, putPlayersBulk } from './db.js';

// ─── Assign initial potentials ────────────────────────────────
/**
 * Called when a new game is seeded. Each player gets:
 *   - potentialRating: their ceiling (hidden from user, shown as stars)
 *   - growthPoints: accumulates form → triggers stat improvements
 */
export function assignPotentials(players) {
  return players.map(p => ({
    ...p,
    potentialRating: calcPotential(p),
    growthPoints:    0,
    peakAge:         calcPeakAge(p),
  }));
}

function calcPotential(p) {
  const current = _primaryRating(p);
  const age     = p.age ?? 24;

  // Young players have higher potential ceiling above current rating
  const headroom =
    age <= 17 ? 25 + Math.floor(Math.random() * 20) :  // Max +45
    age <= 19 ? 18 + Math.floor(Math.random() * 18) :  // Max +36
    age <= 21 ? 12 + Math.floor(Math.random() * 15) :  // Max +27
    age <= 23 ? 6  + Math.floor(Math.random() * 12) :  // Max +18
    age <= 26 ? 2  + Math.floor(Math.random() * 8)  :  // Max +10
    age <= 29 ? 0  + Math.floor(Math.random() * 4)  :  // Max +4
               -Math.floor(Math.random() * 3);          // Can decline

  return Math.min(99, Math.max(current, current + headroom));
}

function calcPeakAge(p) {
  // Defenders peak later, attackers earlier
  const pos = p.position;
  if (['GK','CB'].includes(pos))              return 29 + Math.floor(Math.random()*3);
  if (['RB','LB','CDM'].includes(pos))        return 28 + Math.floor(Math.random()*3);
  if (['CM','CAM','RM','LM'].includes(pos))   return 27 + Math.floor(Math.random()*3);
  if (['ST','CF'].includes(pos))              return 27 + Math.floor(Math.random()*2);
  if (['RW','LW'].includes(pos))              return 26 + Math.floor(Math.random()*3);
  return 28;
}

// ─── Apply development after each gameweek ───────────────────
/**
 * Called after each match is simulated.
 * Players who performed (scored, assisted, kept clean sheet) earn
 * growthPoints. Enough points triggers an attribute upgrade.
 */
export async function applyDevelopment(matchResults) {
  const allPlayers = await getAllPlayers();
  const cache      = new Map(allPlayers.map(p => [p.id, { ...p }]));
  const changed    = [];

  // Collect this GW's goal/assist/CS events
  const gwStats = new Map(); // playerId → { goals, assists, cleanSheets, played }
  for (const result of matchResults) {
    const allScorers = [...(result.homeScorers ?? []), ...(result.awayScorers ?? [])];
    for (const s of allScorers) {
      const e = gwStats.get(s.playerId) ?? { goals:0, assists:0, cleanSheets:0, played:1 };
      e.goals++; gwStats.set(s.playerId, e);
      if (s.assistId) {
        const ae = gwStats.get(s.assistId) ?? { goals:0, assists:0, cleanSheets:0, played:1 };
        ae.assists++; gwStats.set(s.assistId, ae);
      }
    }
    // Clean sheet for starting GK
    const csTeams = [];
    if (result.awayGoals === 0) csTeams.push(result.homeTeamId);
    if (result.homeGoals === 0) csTeams.push(result.awayTeamId);
    for (const tid of csTeams) {
      for (const p of cache.values()) {
        if (p.teamId === tid && p.position === 'GK' && p.inSquad !== false) {
          const e = gwStats.get(p.id) ?? { goals:0, assists:0, cleanSheets:0, played:1 };
          e.cleanSheets++; gwStats.set(p.id, e);
          break;
        }
      }
    }
  }

  // Apply growth points and potential upgrades
  for (const [pid, stats] of gwStats) {
    const p = cache.get(pid);
    if (!p) continue;

    const age = p.age ?? 24;
    const pot = p.potentialRating ?? _primaryRating(p);
    const cur = _primaryRating(p);

    // Skip if already at or above potential
    if (cur >= pot) continue;
    // Players over 33 develop very slowly
    if (age > 33 && Math.random() > 0.15) continue;

    // Growth points this GW
    let gp = 0;
    gp += stats.goals * 3;
    gp += stats.assists * 2;
    gp += stats.cleanSheets * 2;
    gp += 1; // Just for playing

    // Young players get a bonus
    const youthMult = age <= 20 ? 2.5 : age <= 23 ? 1.8 : age <= 26 ? 1.2 : 1.0;
    gp = Math.round(gp * youthMult);

    const newGP = (p.growthPoints ?? 0) + gp;
    const threshold = growthThreshold(age, cur, pot);

    if (newGP >= threshold) {
      // Level up! Improve primary attribute
      const updatedP = applyStatBoost(p);
      updatedP.growthPoints = newGP - threshold;
      updatedP._dev = true;
      cache.set(pid, updatedP);
      changed.push(pid);
    } else {
      p.growthPoints = newGP;
      cache.set(pid, p);
      changed.push(pid);
    }
  }

  if (changed.length > 0) {
    const toSave = changed.map(id => { const p = cache.get(id); delete p._dev; return p; });
    await putPlayersBulk(toSave);
  }

  return changed.length;
}

// ─── How many growth points to level up ──────────────────────
function growthThreshold(age, currentRating, potential) {
  const gap = potential - currentRating;
  // Harder to grow when: old, high current rating, small gap remaining
  const base =
    age <= 20 ? 8 :
    age <= 23 ? 12 :
    age <= 26 ? 18 :
    age <= 29 ? 28 :
    age <= 32 ? 45 : 80;

  // Also harder when gap is small (last few points are toughest)
  const gapMult = gap <= 2 ? 3.0 : gap <= 5 ? 1.8 : gap <= 10 ? 1.2 : 1.0;
  return Math.round(base * gapMult);
}

// ─── Apply a stat boost to a player ──────────────────────────
function applyStatBoost(player) {
  const p   = { ...player };
  const pos = p.position;

  // Boost primary attribute, with small chance of boosting secondary
  const roll = Math.random();

  if (['ST','CF'].includes(pos)) {
    if (roll < 0.65) p.attack    = Math.min(99, p.attack    + 1);
    else if (roll < 0.85) p.midfield = Math.min(99, p.midfield + 1);
    else                  p.defence  = Math.min(99, p.defence  + 1);
  } else if (['RW','LW','CAM'].includes(pos)) {
    if (roll < 0.50) p.attack    = Math.min(99, p.attack    + 1);
    else if (roll < 0.85) p.midfield = Math.min(99, p.midfield + 1);
    else                  p.defence  = Math.min(99, p.defence  + 1);
  } else if (['CM','CDM','RM','LM'].includes(pos)) {
    if (roll < 0.55) p.midfield  = Math.min(99, p.midfield  + 1);
    else if (roll < 0.80) p.attack    = Math.min(99, p.attack    + 1);
    else                  p.defence   = Math.min(99, p.defence   + 1);
  } else if (['CB','RB','LB'].includes(pos)) {
    if (roll < 0.60) p.defence   = Math.min(99, p.defence   + 1);
    else if (roll < 0.85) p.midfield  = Math.min(99, p.midfield  + 1);
    else                  p.attack    = Math.min(99, p.attack    + 1);
  } else if (pos === 'GK') {
    if (roll < 0.75) p.goalkeeping = Math.min(99, p.goalkeeping + 1);
    else             p.defence     = Math.min(99, p.defence     + 1);
  }

  // Always update value based on new rating
  p.value = updatedValue(p);
  return p;
}

// ─── Recalculate value after stat change ──────────────────────
function updatedValue(p) {
  const rating = _primaryRating(p);
  const age    = p.age ?? 24;
  const ageMult =
    age <= 20 ? 0.7 :
    age <= 23 ? 0.9 :
    age <= 27 ? 1.0 :
    age <= 29 ? 0.95 :
    age <= 31 ? 0.85 :
    age <= 33 ? 0.70 : 0.50;

  // Exponential value curve: rating 60=£5m, 75=£25m, 85=£70m, 90=£120m, 95=£200m
  const baseVal = Math.pow((rating - 50) / 49, 2.2) * 220_000_000;
  return Math.max(500_000, Math.round(baseVal * ageMult));
}

function _primaryRating(p) {
  const pos = p.position;
  if (['ST','CF','RW','LW','CAM'].includes(pos)) return p.attack;
  if (['CM','CDM','RM','LM'].includes(pos))       return p.midfield;
  if (['CB','RB','LB'].includes(pos))             return p.defence;
  return p.goalkeeping;
}

// ─── Get potential stars (1-5, like FIFA) ────────────────────
export function getPotentialStars(player) {
  const pot = player.potentialRating ?? _primaryRating(player);
  if (pot >= 90) return 5;
  if (pot >= 84) return 4;
  if (pot >= 76) return 3;
  if (pot >= 68) return 2;
  return 1;
}

export function getPotentialLabel(player) {
  const stars = getPotentialStars(player);
  const labels = ['','Average','Good','Great','World Class','Legendary'];
  return labels[stars] ?? 'Unknown';
}

// ─── End-of-season aging with potential awareness ────────────
export function agingValueAdjust(player) {
  const age = player.age ?? 24;
  const pot = player.potentialRating ?? _primaryRating(player);
  const cur = _primaryRating(player);
  const headroom = pot - cur;

  // Young players with high potential get value boost even before peak
  const potBonus = age <= 23 && headroom > 10 ? 1.15 : 1.0;

  const m =
    age < 20 ? 1.12 :
    age < 24 ? 1.06 :
    age < 28 ? 1.02 :
    age < 32 ? 0.94 :
    age < 35 ? 0.82 : 0.65;

  return Math.round((player.value ?? 10_000_000) * m * potBonus);
}
