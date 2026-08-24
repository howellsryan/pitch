/** modules/injuries.js — Realistic injury system.
 *  Target: ~20 injuries per team per season (~0.4 per match across ~50 games).
 *  Duration skewed toward short injuries; long-term injuries are rare.
 *  Durations always displayed in weeks.
 */

// ─── Injury catalogue ────────────────────────────────────────
// weight = relative probability among injury types (higher = more common)
// minGW/maxGW = recovery time in gameweeks (1 GW ≈ 1 week)
// Skewed so ~60% are 1-2 weeks, ~25% are 3-4 weeks, ~12% are 5-8 weeks, ~3% are 9+ weeks
export const INJURY_TYPES = [
  // Muscle injuries — most common, mostly short
  { name: 'Hamstring Strain',    type: 'muscle',   minGW: 1,  maxGW: 3,  weight: 14 },
  { name: 'Calf Strain',         type: 'muscle',   minGW: 1,  maxGW: 2,  weight: 12 },
  { name: 'Quadricep Strain',    type: 'muscle',   minGW: 1,  maxGW: 3,  weight: 9  },
  { name: 'Groin Strain',        type: 'muscle',   minGW: 1,  maxGW: 2,  weight: 10 },
  { name: 'Adductor Tear',       type: 'muscle',   minGW: 2,  maxGW: 5,  weight: 4  },
  // Knee injuries — range from minor to season-ending
  { name: 'Knee Ligament Sprain',type: 'knee',     minGW: 2,  maxGW: 5,  weight: 4  },
  { name: 'Meniscus Injury',     type: 'knee',     minGW: 4,  maxGW: 8,  weight: 2  },
  { name: 'ACL Tear',            type: 'knee',     minGW: 20, maxGW: 30, weight: 1  },
  { name: 'Patellar Tendinitis', type: 'knee',     minGW: 1,  maxGW: 3,  weight: 5  },
  // Ankle injuries — mostly short
  { name: 'Ankle Sprain',        type: 'ankle',    minGW: 1,  maxGW: 2,  weight: 12 },
  { name: 'Ankle Ligament Tear', type: 'ankle',    minGW: 3,  maxGW: 5,  weight: 3  },
  // Foot / lower leg
  { name: 'Foot Fracture',       type: 'bone',     minGW: 4,  maxGW: 8,  weight: 1  },
  { name: 'Shin Splints',        type: 'lower_leg',minGW: 1,  maxGW: 2,  weight: 7  },
  { name: 'Achilles Tendinitis', type: 'tendon',   minGW: 2,  maxGW: 4,  weight: 3  },
  { name: 'Achilles Rupture',    type: 'tendon',   minGW: 18, maxGW: 26, weight: 1  },
  // Back / hip — mostly minor
  { name: 'Back Spasm',          type: 'back',     minGW: 1,  maxGW: 2,  weight: 7  },
  { name: 'Hip Flexor Strain',   type: 'muscle',   minGW: 1,  maxGW: 3,  weight: 6  },
  // Upper body — short
  { name: 'Shoulder Dislocation',type: 'shoulder', minGW: 2,  maxGW: 4,  weight: 2  },
  { name: 'Rib Contusion',       type: 'torso',    minGW: 1,  maxGW: 2,  weight: 4  },
  { name: 'Concussion',          type: 'head',     minGW: 1,  maxGW: 2,  weight: 4  },
  // Illness — very short
  { name: 'Illness',             type: 'illness',  minGW: 1,  maxGW: 1,  weight: 6  },
];

export const _INJ_TOTAL_WEIGHT = INJURY_TYPES.reduce((s, t) => s + t.weight, 0);

export function _pickInjuryType() {
  let roll = Math.random() * _INJ_TOTAL_WEIGHT;
  for (const t of INJURY_TYPES) {
    roll -= t.weight;
    if (roll <= 0) return t;
  }
  return INJURY_TYPES[0];
}

// ─── Roll whether a player gets injured in a match ────────────
// Base chance per match ~4.5% for outfield, ~1.5% for GK.
// Modified by: fitness (tired players injure more), age (34+), high-intensity.
// Real PL data: ~3.5 injuries per team per 38 games (91 per season / 26 squad avg).
//
// When forceRoll=true (called from match engine which already gated by per-phase rate),
// skip the base-chance check and just pick the injury type/duration.
export function rollInjuryCheck(player, isHighIntensity, forceRoll) {
  if (player.injured) return null; // already injured

  if (!forceRoll) {
    const isGK      = player.position === 'GK';
    let baseChance  = isGK ? 0.015 : 0.045;

    // Fitness penalty: low fitness → higher injury risk
    const fit = player.fitness ?? 90;
    if (fit < 70) baseChance *= 1.40;
    else if (fit < 50) baseChance *= 1.80;

    // Age penalty: 32+ players injure more
    const age = player.age ?? 24;
    if (age >= 36) baseChance *= 1.45;
    else if (age >= 34) baseChance *= 1.25;
    else if (age >= 32) baseChance *= 1.10;

    // High intensity (cup match, derby) slight boost
    if (isHighIntensity) baseChance *= 1.15;

    if (Math.random() > baseChance) return null;
  }

  const injType = _pickInjuryType();
  // Skew toward shorter durations: use min of two random rolls (biases toward minGW)
  const range   = injType.maxGW - injType.minGW + 1;
  const roll1   = Math.floor(Math.random() * range);
  const roll2   = Math.floor(Math.random() * range);
  const gwSpan  = injType.minGW + Math.min(roll1, roll2);

  return {
    injuryName:       injType.name,
    injuryType:       injType.type,
    injuryGWsLeft:    gwSpan,
    injuryGWsTotal:   gwSpan,
  };
}

// ─── Tick injury recovery at end of each GW ──────────────────
// Returns array of recovered players for toast notifications.
// Called once per GW after all matches are processed.
// A 2-GW injury: set GW5 → injuryGWsLeft=2. Tick GW5→1. Tick GW6→0 → clear.
export function tickInjuryRecovery(allPlayers) {
  const recovered = [];
  for (const p of allPlayers) {
    if (!p.injured) continue;
    const gwLeft = (p.injuryGWsLeft ?? 1) - 1;
    if (gwLeft <= 0) {
      p.injured        = false;
      p.injuryName     = null;
      p.injuryType     = null;
      p.injuryGWsLeft  = 0;
      p.injuryGWsTotal = 0;
      p.fitness        = 60; // returns at reduced fitness
      recovered.push(p);
    } else {
      p.injuryGWsLeft = gwLeft;
    }
  }
  return recovered;
}

// ─── Apply injury to a player object in-place ────────────────
export function applyInjury(player, injData) {
  player.injured        = true;
  player.injuryName     = injData.injuryName;
  player.injuryType     = injData.injuryType;
  player.injuryGWsLeft  = injData.injuryGWsLeft;
  player.injuryGWsTotal = injData.injuryGWsTotal;
}

// ─── Injury duration label ─────────────────────────────────────
// Show months ONLY for exact multiples of 4 weeks (1 month, 2 months, etc.)
// Everything else displays in weeks.
export function injuryDurationLabel(gwsLeft) {
  if (!gwsLeft) return 'Unknown';
  if (gwsLeft === 1) return '~1 week';
  if (gwsLeft % 4 === 0) {
    const months = gwsLeft / 4;
    return `${months} month${months !== 1 ? 's' : ''}`;
  }
  return `${gwsLeft} weeks`;
}
