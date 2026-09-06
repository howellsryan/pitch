import { effectiveAttribute, effectiveDetailedAttribute } from './playerModel.js';

export const MATCH_CONTACT_ACTION_VERSION = 1;
export const PLAYABLE_CONTACT_INTENT_VERSION = 1;

export const MATCH_CONTACT_TYPES = Object.freeze([
  'standing_header',
  'running_header',
  'volley',
  'half_volley',
]);

export const GOALKEEPER_INTERVENTIONS = Object.freeze([
  'catch',
  'parry',
  'smother',
  'spread',
]);

function contactClamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function contactRound(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function contactNumeric(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function contactDetailed(player, attribute) {
  const value = Number(effectiveDetailedAttribute(player, attribute));
  return Number.isFinite(value) ? value : 50;
}

function contactWeighted(player, weights = {}) {
  if (!player) return 50;
  let total = 0;
  let sum = 0;
  for (const [attribute, weight] of Object.entries(weights)) {
    const amount = Number(weight);
    if (!(amount > 0)) continue;
    total += amount;
    sum += contactDetailed(player, attribute) * amount;
  }
  return contactClamp(total ? sum / total : 50, 1, 99);
}

function contactStableUnit(input) {
  let hash = 2166136261;
  for (const character of String(input ?? '')) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x100000000;
}

function deriveContactType(prepared, continuation) {
  const family = prepared?.continuationAction?.family ?? continuation?.family ?? null;
  if (!family || !continuation?.success || !continuation?.downstreamChance) return null;
  const roll = contactStableUnit(`${prepared.phase}:${prepared.teamId}:${continuation.receiverId}:${family}:contact-v1`);
  if (family === 'cross') return roll < .56 ? 'standing_header' : 'running_header';
  if (family === 'cutback') return roll < .52 ? 'half_volley' : 'volley';
  if (family === 'final_pass') return roll < .32 ? 'volley' : roll < .56 ? 'half_volley' : null;
  if (family === 'through_ball') return roll < .24 ? 'half_volley' : null;
  return null;
}

function contactDefinitionFor(type) {
  switch (type) {
    case 'standing_header':
      return { contactHeight:1.72, approach:'set', preferredPower:.60, xgMultiplier:.92, spreadBase:.39 };
    case 'running_header':
      return { contactHeight:1.64, approach:'running', preferredPower:.66, xgMultiplier:1.02, spreadBase:.38 };
    case 'volley':
      return { contactHeight:.78, approach:'set', preferredPower:.76, xgMultiplier:.96, spreadBase:.37 };
    case 'half_volley':
      return { contactHeight:.34, approach:'bounce', preferredPower:.72, xgMultiplier:.99, spreadBase:.35 };
    default:
      return null;
  }
}

export function derivePlayableContactAction(prepared, continuation) {
  const type = deriveContactType(prepared, continuation);
  const definition = contactDefinitionFor(type);
  const downstream = continuation?.downstreamChance;
  if (!type || !definition || !downstream) return null;
  const shooter = prepared?.attackers?.find?.(player => player.id === downstream.shooterId) ?? prepared?.target ?? null;
  const defender = prepared?.defenders?.find?.(player => player.id === downstream.pressureDefenderId) ?? prepared?.defender ?? null;
  if (!shooter || !defender) return null;

  const sourceXg = contactClamp(contactNumeric(downstream.xg, .12), .045, .48);
  return {
    version:MATCH_CONTACT_ACTION_VERSION,
    type,
    phase:prepared.phase,
    minute:prepared.minute,
    attackingTeamId:prepared.teamId,
    defendingTeamId:prepared.opponentTeamId,
    sourceContinuationFamily:prepared.continuationAction.family,
    sourceContinuationVersion:prepared.continuationAction.version,
    shooterId:shooter.id,
    shooterName:shooter.name,
    pressureDefenderId:defender.id,
    pressureDefenderName:defender.name,
    xg:contactRound(contactClamp(sourceXg * definition.xgMultiplier, .04, .48), 3),
    contactHeight:definition.contactHeight,
    approach:definition.approach,
    preferredPower:definition.preferredPower,
    spreadBase:definition.spreadBase,
  };
}

export function normalizeContactIntent(input = {}) {
  const rawAttack = input?.attack && typeof input.attack === 'object' ? input.attack : null;
  const rawKeeper = input?.goalkeeper && typeof input.goalkeeper === 'object' ? input.goalkeeper : null;
  return {
    version:PLAYABLE_CONTACT_INTENT_VERSION,
    attack:rawAttack ? {
      aimX:contactClamp(contactNumeric(rawAttack.aimX, 0), -1.25, 1.25),
      aimY:contactClamp(contactNumeric(rawAttack.aimY, .48), -.2, 1.2),
      power:contactClamp(contactNumeric(rawAttack.power, .68), 0, 1),
      timing:contactClamp(contactNumeric(rawAttack.timing, .65), 0, 1),
    } : null,
    goalkeeper:rawKeeper ? {
      x:contactClamp(contactNumeric(rawKeeper.x, 0), -1, 1),
      y:contactClamp(contactNumeric(rawKeeper.y, .45), 0, 1),
      timing:contactClamp(contactNumeric(rawKeeper.timing, .65), 0, 1),
    } : null,
  };
}

function contactAbilityScore(type, shooter) {
  if (type === 'standing_header') return contactWeighted(shooter, { shooting:.42, physical:.46, pace:.12 });
  if (type === 'running_header') return contactWeighted(shooter, { shooting:.40, physical:.34, pace:.26 });
  if (type === 'volley') return contactWeighted(shooter, { shooting:.70, physical:.17, pace:.13 });
  return contactWeighted(shooter, { shooting:.62, physical:.18, pace:.20 });
}

function contactPressureAbility(defender) {
  return contactWeighted(defender, { defending:.60, physical:.25, pace:.15 });
}

function contactAutomaticAttack(action, packet, ability) {
  const execution = contactClamp((ability - 42) / 57, 0, 1);
  return {
    aimX:contactClamp((contactNumeric(packet?.shot, .5) - .5) * (1.58 - execution * .52), -.98, .98),
    aimY:contactClamp(.18 + contactNumeric(packet?.finish, .5) * .66, .08, .92),
    power:contactClamp(action.preferredPower + (execution - .5) * .12, .42, .92),
    timing:contactClamp(.42 + execution * .48, .30, .94),
  };
}

function contactTrajectory({ action, attack, packet, ability, pressure }) {
  const powerControl = 1 - Math.abs(attack.power - action.preferredPower) * 1.05;
  const canonical = contactClamp(ability / 100, .05, .99);
  const executionQuality = contactClamp(canonical * .62 + attack.timing * .25 + contactClamp(powerControl, 0, 1) * .13, .04, .99);
  const pressurePenalty = contactClamp((pressure - 58) / 110, 0, .30);
  const spread = contactClamp(action.spreadBase - executionQuality * .27 + pressurePenalty, .04, .46);
  return {
    x:contactRound(attack.aimX + (contactNumeric(packet?.finish, .5) - .5) * 2 * spread, 4),
    y:contactRound(attack.aimY + (contactNumeric(packet?.shot, .5) - .5) * 2 * spread * .62, 4),
    power:contactRound(attack.power, 4),
    executionQuality:contactRound(executionQuality, 4),
  };
}

function contactAutomaticKeeper(target, packet, goalkeeping) {
  const ability = contactClamp((goalkeeping - 35) / 64, 0, 1);
  const error = .64 - ability * .47;
  return {
    x:contactClamp(target.x + (contactNumeric(packet?.finish, .5) - .5) * 2 * error, -1, 1),
    y:contactClamp(target.y + (contactNumeric(packet?.shot, .5) - .5) * error * .70, 0, 1),
    timing:contactClamp(.46 + ability * .44, .38, .94),
  };
}

export function classifyGoalkeeperIntervention({
  finish,
  target = {},
  power = .7,
  xg = .15,
  goalkeeping = 70,
  keeper = null,
  contactType = null,
} = {}) {
  if (finish !== 'saved') return null;
  const lateral = Math.abs(contactClamp(contactNumeric(target.x, 0), -1.25, 1.25));
  const height = contactClamp(contactNumeric(target.y, .45), 0, 1.2);
  const shotPower = contactClamp(contactNumeric(power, .7), 0, 1);
  const chance = contactClamp(contactNumeric(xg, .15), 0, .6);
  const keeping = contactClamp(contactNumeric(goalkeeping, 70), 1, 99);
  const keeperX = Math.abs(contactClamp(contactNumeric(keeper?.x, 0), -1, 1));

  // Close, low chances are saved with body/feet rather than transformed into a
  // catch simply because the goalkeeper has a high rating.
  if (chance >= .30 && height <= .48 && (contactType === 'half_volley' || keeperX >= .38 || lateral >= .48)) return 'spread';
  if (height <= .24 && chance >= .18 && lateral <= .62 && shotPower <= .82) return 'smother';

  const catchControl = (keeping / 100) * .52
    + (1 - shotPower) * .22
    + (1 - Math.min(1, lateral)) * .14
    + (1 - Math.min(1, height)) * .12;
  if (catchControl >= .62 && lateral <= .70 && height <= .80 && shotPower <= .78) return 'catch';
  return 'parry';
}

export function classifyAutomaticSavedShot({ packet, xg, shooting, goalkeeping } = {}) {
  const target = {
    x:contactClamp((contactNumeric(packet?.finish, .5) - .5) * 1.70, -.95, .95),
    y:contactClamp(.16 + contactNumeric(packet?.shot, .5) * .72, .10, .92),
  };
  const power = contactClamp(.52 + contactClamp(contactNumeric(xg, .12), 0, .5) * .62 + (contactNumeric(shooting, 70) - 70) * .003, .44, .90);
  const action = classifyGoalkeeperIntervention({ finish:'saved', target, power, xg, goalkeeping });
  return { action, target:{ x:contactRound(target.x, 4), y:contactRound(target.y, 4) }, power:contactRound(power, 4) };
}

export function resolveContactShotOutcome({ action, shooter, defender, defenders = [], packet, intent = null } = {}) {
  if (!action || action.version !== MATCH_CONTACT_ACTION_VERSION || !MATCH_CONTACT_TYPES.includes(action.type)) {
    throw new Error('Contact resolution requires a supported authoritative contact action');
  }
  if (!packet || Number(packet.version) !== 1) throw new Error('Contact resolution requires the existing fixed phase packet');
  if (shooter?.id !== action.shooterId || defender?.id !== action.pressureDefenderId) {
    throw new Error('Contact participants do not match authoritative action');
  }

  const goalkeeper = (defenders ?? []).find(player => (player?.matchPosition ?? player?.position) === 'GK') ?? null;
  const goalkeeping = Number(effectiveAttribute(goalkeeper, 'goalkeeping') ?? goalkeeper?.goalkeeping ?? 50);
  const ability = contactAbilityScore(action.type, shooter);
  const pressure = contactPressureAbility(defender);
  const normalized = normalizeContactIntent(intent ?? {});
  const attack = normalized.attack ?? contactAutomaticAttack(action, packet, ability);
  const target = contactTrajectory({ action, attack, packet, ability, pressure });
  const blockChance = contactClamp(.055 + (pressure - 68) * .0032 - action.xg * .055 - attack.power * .018, .02, .23);

  if (contactNumeric(packet.outcome, .5) < blockChance) {
    return {
      finish:'blocked', onTarget:false, goal:false,
      contactType:action.type, contactAbility:contactRound(ability), pressure:contactRound(pressure), goalkeeping:contactRound(goalkeeping),
      goalkeeperIntervention:null,
      presentation:{ target, blockerId:defender?.id ?? null, keeper:null, contact:'block', contactType:action.type },
    };
  }

  const insideGoal = Math.abs(target.x) <= 1 && target.y >= 0 && target.y <= 1;
  if (!insideGoal) {
    return {
      finish:'missed', onTarget:false, goal:false,
      contactType:action.type, contactAbility:contactRound(ability), pressure:contactRound(pressure), goalkeeping:contactRound(goalkeeping),
      goalkeeperIntervention:null,
      presentation:{ target, blockerId:null, keeper:null, contact:'miss', contactType:action.type },
    };
  }

  const keeperIntent = normalized.goalkeeper ?? contactAutomaticKeeper(target, packet, goalkeeping);
  const keeperAbility = contactClamp((goalkeeping - 35) / 64, 0, 1);
  const reach = contactClamp(.21 + keeperAbility * .245 + keeperIntent.timing * .12 - Math.max(0, action.xg - .20) * .12, .18, .58);
  const dx = target.x - keeperIntent.x;
  const dy = (target.y - keeperIntent.y) * 1.18;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const powerPenalty = contactClamp((attack.power - action.preferredPower) * .15, -.035, .055);
  const saved = distance <= contactClamp(reach - powerPenalty, .16, .61);
  const finish = saved ? 'saved' : 'goal';
  const goalkeeperIntervention = classifyGoalkeeperIntervention({
    finish,
    target,
    power:attack.power,
    xg:action.xg,
    goalkeeping,
    keeper:keeperIntent,
    contactType:action.type,
  });

  return {
    finish,
    onTarget:true,
    goal:!saved,
    contactType:action.type,
    contactAbility:contactRound(ability),
    pressure:contactRound(pressure),
    goalkeeping:contactRound(goalkeeping),
    goalkeeperIntervention,
    presentation:{
      target,
      blockerId:null,
      keeper:{
        x:contactRound(keeperIntent.x, 4), y:contactRound(keeperIntent.y, 4), timing:contactRound(keeperIntent.timing, 4), reach:contactRound(reach, 4),
        intervention:goalkeeperIntervention,
      },
      contact:saved ? 'save' : 'goal',
      contactType:action.type,
      goalkeeperIntervention,
    },
  };
}

export function buildContactPlayableGeometry(action) {
  if (!action || action.version !== MATCH_CONTACT_ACTION_VERSION) return null;
  const family = action.sourceContinuationFamily;
  const channelRoll = contactStableUnit(`${action.attackingTeamId}:${action.shooterId}:${family}:contact-channel`);
  const channel = contactRound((channelRoll - .5) * 1.16, 3);
  const x = contactRound(channel * 3.0, 3);
  const distance = family === 'cross' ? 8.7 : family === 'cutback' ? 10.1 : family === 'through_ball' ? 11.0 : 12.4;
  const running = action.type === 'running_header';
  const defenderX = contactRound(x + (x <= 0 ? .82 : -.82), 3);
  const defenderZ = contactRound(Math.max(3.2, distance * .62), 3);
  const ballZ = contactRound(distance + (action.type.includes('header') ? 1.15 : .65), 3);
  return {
    coordinateSystem:'goal-facing-v1',
    goal:{ width:7.32, height:2.44 },
    channel,
    distance,
    staging:{
      version:1,
      variant:action.type,
      contactType:action.type,
      contactHeight:action.contactHeight,
      approach:action.approach,
      sourceContinuationFamily:family,
    },
    legalActions:{ attack:['aim','power','timing'], goalkeeper:['position','timing'] },
    continuousLocomotion:false,
    shooter:{ x, y:0, z:contactRound(distance + (running ? 1.25 : 0), 3) },
    goalkeeper:{ x:0, y:0, z:action.xg >= .30 ? 1.25 : .48 },
    defender:{ x:defenderX, y:0, z:defenderZ },
    ball:{ x, y:action.contactHeight, z:ballZ },
    contact:{ x, y:action.contactHeight, z:distance },
  };
}
