import { getAllPlayers, putPlayersBulk } from './db.js';

/** modules/potential.js — FIFA-style potential/development: assignPotentials, applyDevelopment, getPotentialStars */
// ─── Assign initial potentials ────────────────────────────────
/**
 * Called when a new game is seeded. Each player gets:
 *   - potentialRating: their ceiling (hidden from user, shown as stars)
 *   - growthPoints: accumulates form → triggers stat improvements
 */
export function assignPotentials(players) {
  return players.map(p => {
    const cur = _primaryRating(p);
    const age = p.age ?? 24;

    // Respect potentialRating baked into CSV data — this is the real-world-researched
    // ceiling for known players. Only roll random headroom for players without one.
    const hasBakedPot = p.potentialRating && p.potentialRating > 0;

    // isWonderkid: respect CSV flag if set, otherwise auto-detect from age+rating
    const isWonderkid = p.isWonderkid === true || (
      (age <= 18 && cur >= 75) ||
      (age <= 20 && cur >= 80) ||
      (age <= 22 && cur >= 85)
    );

    const potentialRating = hasBakedPot
      ? p.potentialRating  // trust the data
      : calcPotential({...p, isWonderkid});

    return {
      ...p,
      isWonderkid,
      potentialRating,
      growthPoints: 0,
      peakAge:      calcPeakAge(p),
    };
  });
}

export function calcPotential(p) {
  const current = _primaryRating(p);
  const age     = p.age ?? 24;

  // Wider headroom so the full star spread is well populated.
  // Elite teens reliably hit 4-5★; lower-league youth top out at 2-3★.
  // The isWonderkid flag (auto-set above) lowers the 5★ threshold by 2 pts.
  const headroom =
    age <= 17 ? 10 + Math.floor(Math.random() * 12) :  // +10..21
    age <= 19 ?  8 + Math.floor(Math.random() * 10) :  // +8..17
    age <= 21 ?  5 + Math.floor(Math.random() * 9)  :  // +5..13
    age <= 23 ?  2 + Math.floor(Math.random() * 8)  :  // +2..9
    age <= 26 ?  0 + Math.floor(Math.random() * 5)  :  // +0..4
    age <= 29 ?  0 + Math.floor(Math.random() * 3)  :  // +0..2
               -Math.floor(Math.random() * 3);          // can decline

  return Math.min(99, Math.max(current, current + headroom));
}

export function calcPeakAge(p) {
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
 * ALL players who participated earn growthPoints — just playing grows you.
 * Goals, assists, clean sheets accelerate growth.
 * Uses fitnessUpdates from match results to identify actual participants.
 */
export async function applyDevelopment(matchResults) {
  const allPlayers = await getAllPlayers();
  const cache      = new Map(allPlayers.map(p => [p.id, { ...p }]));
  const changed    = [];

  // Collect this GW's performance stats for every participant
  const gwStats = new Map(); // playerId → { goals, assists, cleanSheets, played, cleanSheetDef }

  for (const result of matchResults) {
    // 1. Register ALL match participants via fitnessUpdates (contains every starter)
    for (const fu of (result.fitnessUpdates ?? [])) {
      if (!gwStats.has(fu.id)) {
        gwStats.set(fu.id, { goals:0, assists:0, cleanSheets:0, played:1, cleanSheetDef:0 });
      }
    }

    // 2. Credit goals and assists
    const allScorers = [...(result.homeScorers ?? []), ...(result.awayScorers ?? [])];
    for (const s of allScorers) {
      const e = gwStats.get(s.playerId) ?? { goals:0, assists:0, cleanSheets:0, played:1, cleanSheetDef:0 };
      e.goals++; gwStats.set(s.playerId, e);
      if (s.assistId) {
        const ae = gwStats.get(s.assistId) ?? { goals:0, assists:0, cleanSheets:0, played:1, cleanSheetDef:0 };
        ae.assists++; gwStats.set(s.assistId, ae);
      }
    }

    // 3. Clean sheets — use fitnessUpdates to find the actual starting GK per team
    const csTeams = [];
    if (result.awayGoals === 0) csTeams.push(result.homeTeamId);
    if (result.homeGoals === 0) csTeams.push(result.awayTeamId);
    for (const tid of csTeams) {
      // Find the GK who actually played (listed in fitnessUpdates for this team)
      const participantIds = new Set((result.fitnessUpdates ?? []).filter(fu => fu.teamId === tid).map(fu => fu.id));
      const startingGK = allPlayers.find(p => p.teamId === tid && p.position === 'GK' && participantIds.has(p.id));
      if (startingGK) {
        const e = gwStats.get(startingGK.id) ?? { goals:0, assists:0, cleanSheets:0, played:1, cleanSheetDef:0 };
        e.cleanSheets++; gwStats.set(startingGK.id, e);
      }
      // Defenders also benefit from clean sheets (smaller bonus)
      for (const fu of (result.fitnessUpdates ?? [])) {
        if (fu.teamId !== tid) continue;
        const pl = cache.get(fu.id);
        if (pl && ['CB','RB','LB','CDM'].includes(pl.position)) {
          const e = gwStats.get(fu.id) ?? { goals:0, assists:0, cleanSheets:0, played:1, cleanSheetDef:0 };
          e.cleanSheetDef++; gwStats.set(fu.id, e);
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

    // Growth points this GW — tuned so max ~5-7 rating gains per season
    let gp = 0;
    gp += stats.goals * 2;
    gp += stats.assists * 1;
    gp += stats.cleanSheets * 2;       // GK clean sheet
    gp += (stats.cleanSheetDef ?? 0);   // Defenders get 1pt per CS
    gp += 1; // Base points just for playing

    // Young players get a moderate bonus (not explosive)
    const youthMult = age <= 20 ? 1.5 : age <= 23 ? 1.3 : age <= 26 ? 1.1 : 1.0;
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
export function growthThreshold(age, currentRating, potential) {
  const gap = potential - currentRating;
  // Harder to grow when: old, high current rating, small gap remaining
  // Tuned so even the best young players max out around 5-7 gains per 38-GW season
  const base =
    age <= 20 ? 18 :
    age <= 23 ? 24 :
    age <= 26 ? 35 :
    age <= 29 ? 50 :
    age <= 32 ? 70 : 120;

  // Also harder when gap is small (last few points are toughest)
  const gapMult = gap <= 2 ? 3.0 : gap <= 5 ? 2.0 : gap <= 10 ? 1.4 : 1.0;
  return Math.round(base * gapMult);
}

// ─── Apply a stat boost to a player ──────────────────────────
export function applyStatBoost(player) {
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
export function updatedValue(p) {
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
  const norm = Math.max(0, (rating - 50) / 49);
  const baseVal = Math.pow(norm, 2.2) * 220_000_000;
  return Math.max(500_000, Math.round(baseVal * ageMult));
}

export function _primaryRating(p) {
  const pos = p.position;
  if (['ST','CF','RW','LW','CAM'].includes(pos)) return p.attack;
  if (['CM','CDM','RM','LM'].includes(pos))       return p.midfield;
  if (['CB','RB','LB'].includes(pos))             return p.defence;
  return p.goalkeeping;
}

// ─── Get potential stars (1-5, like FIFA) ────────────────────
export function getPotentialStars(player) {
  const pot = player.potentialRating ?? _primaryRating(player);
  // 5★ — elite world-class ceiling
  if (pot >= 88) return 5;
  if (player.isWonderkid && pot >= 86) return 5;
  // 4★ — top-tier potential
  if (pot >= 82) return 4;
  // 3★ — solid professional ceiling
  if (pot >= 74) return 3;
  // 2★ — decent but limited
  if (pot >= 66) return 2;
  return 1;
}

export function getPotentialLabel(player) {
  const stars = getPotentialStars(player);
  const labels = ['','Average','Good','Great','World Class','Legendary'];
  return labels[stars] ?? 'Unknown';
}

// ─── End-of-season aging with potential awareness ────────────
export function agingValueAdjust(player) {
  const age = (player.age ?? 24) + 1; // +1 because this runs before age increment
  const pot = player.potentialRating ?? _primaryRating(player);
  const cur = _primaryRating(player);
  const headroom = pot - cur;

  // Young players with high potential get value boost even before peak
  const potBonus = age <= 23 && headroom > 10 ? 1.15 : 1.0;

  // Smoother depreciation — less aggressive than before
  const m =
    age < 20 ? 1.12 :
    age < 24 ? 1.06 :
    age < 28 ? 1.02 :
    age < 30 ? 0.97 :
    age < 32 ? 0.92 :
    age < 34 ? 0.85 :
    age < 36 ? 0.75 : 0.60;

  return Math.max(500_000, Math.round((Number(player.value) || 10_000_000) * m * potBonus));
}

// ─── End-of-season stat decline for aging players ────────────
// Returns a copy of the player with reduced stats if past peak age.
// Decline is gradual: small chance per stat per year, increasing with age.
export function applyAgingDecline(player) {
  const p   = { ...player };
  const age = p.age ?? 24;
  const peak = p.peakAge ?? 28;

  // No decline before peak age + 1 grace year
  if (age <= peak + 1) return p;

  // Decline probability increases with years past peak
  const yearsPast = age - peak - 1;
  const declineChance =
    yearsPast <= 1 ? 0.15 :  // 1 year past peak: 15% per stat
    yearsPast <= 3 ? 0.30 :  // 2-3 years: 30%
    yearsPast <= 5 ? 0.50 :  // 4-5 years: 50%
    yearsPast <= 7 ? 0.70 :  // 6-7 years: 70%
                     0.85;    // 8+ years: 85%

  // Decline amount increases slightly with age
  const maxDrop = yearsPast <= 2 ? 1 : yearsPast <= 5 ? 2 : 3;

  // Physical stats decline faster (attack for forwards, defence for defenders)
  const primary = _primaryRating(p);
  const pos = p.position;

  // Apply decline to each stat independently
  if (Math.random() < declineChance) {
    const drop = 1 + Math.floor(Math.random() * maxDrop);
    if (['ST','CF','RW','LW','CAM'].includes(pos)) {
      p.attack = Math.max(30, p.attack - drop);
    } else if (['CM','CDM','RM','LM'].includes(pos)) {
      p.midfield = Math.max(30, p.midfield - drop);
    } else if (['CB','RB','LB'].includes(pos)) {
      p.defence = Math.max(30, p.defence - drop);
    } else if (pos === 'GK') {
      p.goalkeeping = Math.max(30, p.goalkeeping - drop);
    }
  }

  // Secondary stats also decline but at lower rate
  if (Math.random() < declineChance * 0.5) {
    if (['ST','CF','RW','LW','CAM'].includes(pos)) {
      p.midfield = Math.max(20, p.midfield - 1);
    } else if (['CM','CDM','RM','LM'].includes(pos)) {
      if (Math.random() < 0.5) p.attack = Math.max(20, p.attack - 1);
      else p.defence = Math.max(20, p.defence - 1);
    } else if (['CB','RB','LB'].includes(pos)) {
      p.midfield = Math.max(20, p.midfield - 1);
    }
  }

  // Recalculate value after stat decline
  p.value = updatedValue(p);
  return p;
}

