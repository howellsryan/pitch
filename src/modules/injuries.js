/** modules/injuries.js — Realistic injury system.
 *  Target: ~20 injuries per team per season (~0.4 per match across ~50 games).
 *  Duration skewed toward short injuries; long-term injuries are rare.
 *  Durations always displayed in weeks.
 */

export const INJURY_TYPES = [
  { name:'Hamstring Strain',     type:'muscle',    minGW:1,  maxGW:3,  weight:14 },
  { name:'Calf Strain',          type:'muscle',    minGW:1,  maxGW:2,  weight:12 },
  { name:'Quadricep Strain',     type:'muscle',    minGW:1,  maxGW:3,  weight:9  },
  { name:'Groin Strain',         type:'muscle',    minGW:1,  maxGW:2,  weight:10 },
  { name:'Adductor Tear',        type:'muscle',    minGW:2,  maxGW:5,  weight:4  },
  { name:'Knee Ligament Sprain', type:'knee',      minGW:2,  maxGW:5,  weight:4  },
  { name:'Meniscus Injury',      type:'knee',      minGW:4,  maxGW:8,  weight:2  },
  { name:'ACL Tear',             type:'knee',      minGW:20, maxGW:30, weight:1  },
  { name:'Patellar Tendinitis',  type:'knee',      minGW:1,  maxGW:3,  weight:5  },
  { name:'Ankle Sprain',         type:'ankle',     minGW:1,  maxGW:2,  weight:12 },
  { name:'Ankle Ligament Tear',  type:'ankle',     minGW:3,  maxGW:5,  weight:3  },
  { name:'Foot Fracture',        type:'bone',      minGW:4,  maxGW:8,  weight:1  },
  { name:'Shin Splints',         type:'lower_leg', minGW:1,  maxGW:2,  weight:7  },
  { name:'Achilles Tendinitis',  type:'tendon',    minGW:2,  maxGW:4,  weight:3  },
  { name:'Achilles Rupture',     type:'tendon',    minGW:18, maxGW:26, weight:1  },
  { name:'Back Spasm',           type:'back',      minGW:1,  maxGW:2,  weight:7  },
  { name:'Hip Flexor Strain',    type:'muscle',    minGW:1,  maxGW:3,  weight:6  },
  { name:'Shoulder Dislocation', type:'shoulder',  minGW:2,  maxGW:4,  weight:2  },
  { name:'Rib Contusion',        type:'torso',     minGW:1,  maxGW:2,  weight:4  },
  { name:'Concussion',           type:'head',      minGW:1,  maxGW:2,  weight:4  },
  { name:'Illness',              type:'illness',   minGW:1,  maxGW:1,  weight:6  },
];

export const _INJ_TOTAL_WEIGHT = INJURY_TYPES.reduce((s,t) => s + t.weight, 0);

function _injuryRandomValue(rng) { return typeof rng === 'function' ? rng() : Math.random(); }

export function _pickInjuryType(rng = Math.random) {
  let roll = _injuryRandomValue(rng) * _INJ_TOTAL_WEIGHT;
  for (const type of INJURY_TYPES) {
    roll -= type.weight;
    if (roll <= 0) return type;
  }
  return INJURY_TYPES[0];
}

/**
 * Roll whether a player gets injured. `rng` is injectable so Match Engine 2.0
 * can keep Quick Sim and segmented Broadcast on the exact same random stream.
 * Older callers may continue to omit it and receive Math.random behaviour.
 */
export function rollInjuryCheck(player, isHighIntensity, forceRoll, rng = Math.random) {
  if (player.injured) return null;

  if (!forceRoll) {
    const isGK = player.position === 'GK';
    let baseChance = isGK ? 0.015 : 0.045;
    const fit = player.fitness ?? 90;
    if (fit < 50) baseChance *= 1.80;
    else if (fit < 70) baseChance *= 1.40;

    const age = player.age ?? 24;
    if (age >= 36) baseChance *= 1.45;
    else if (age >= 34) baseChance *= 1.25;
    else if (age >= 32) baseChance *= 1.10;
    if (isHighIntensity) baseChance *= 1.15;
    if (_injuryRandomValue(rng) > baseChance) return null;
  }

  const injType = _pickInjuryType(rng);
  const range = injType.maxGW - injType.minGW + 1;
  const roll1 = Math.floor(_injuryRandomValue(rng) * range);
  const roll2 = Math.floor(_injuryRandomValue(rng) * range);
  const gwSpan = injType.minGW + Math.min(roll1, roll2);
  return {
    injuryName:injType.name,
    injuryType:injType.type,
    injuryGWsLeft:gwSpan,
    injuryGWsTotal:gwSpan,
  };
}

export function tickInjuryRecovery(allPlayers) {
  const recovered = [];
  for (const player of allPlayers) {
    if (!player.injured) continue;
    const gwLeft = (player.injuryGWsLeft ?? 1) - 1;
    if (gwLeft <= 0) {
      player.injured = false;
      player.injuryName = null;
      player.injuryType = null;
      player.injuryGWsLeft = 0;
      player.injuryGWsTotal = 0;
      player.fitness = 60;
      recovered.push(player);
    } else {
      player.injuryGWsLeft = gwLeft;
    }
  }
  return recovered;
}

export function applyInjury(player, injData) {
  player.injured = true;
  player.injuryName = injData.injuryName;
  player.injuryType = injData.injuryType;
  player.injuryGWsLeft = injData.injuryGWsLeft;
  player.injuryGWsTotal = injData.injuryGWsTotal;
}

export function injuryDurationLabel(gwsLeft) {
  if (!gwsLeft) return 'Unknown';
  if (gwsLeft === 1) return '~1 week';
  if (gwsLeft % 4 === 0) {
    const months = gwsLeft / 4;
    return `${months} month${months !== 1 ? 's' : ''}`;
  }
  return `${gwsLeft} weeks`;
}
