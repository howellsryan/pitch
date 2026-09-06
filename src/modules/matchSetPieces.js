import { effectiveAttribute, effectiveDetailedAttribute } from './playerModel.js';

export const MATCH_SET_PIECE_VERSION = 1;

const PENALTY_XG = .76;
const WALL_DISTANCE_METRES = 9.15;

function setPieceClamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function setPieceRound(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function slot(player) {
  return player?.matchPosition ?? player?.position;
}

function outfield(player) {
  return slot(player) !== 'GK';
}

function detailed(player, attribute) {
  const value = Number(effectiveDetailedAttribute(player, attribute));
  return Number.isFinite(value) ? value : 50;
}

function weightedDetailed(player, weights = {}) {
  if (!player) return 50;
  let total = 0;
  let sum = 0;
  for (const [attribute, weight] of Object.entries(weights)) {
    const numericWeight = Number(weight);
    if (!(numericWeight > 0)) continue;
    total += numericWeight;
    sum += detailed(player, attribute) * numericWeight;
  }
  return setPieceClamp(total ? sum / total : 50, 1, 99);
}

function goalkeeper(players = []) {
  return players.find(player => slot(player) === 'GK') ?? null;
}

function keeperRating(players = []) {
  const keeper = goalkeeper(players);
  const value = Number(effectiveAttribute(keeper, 'goalkeeping') ?? keeper?.goalkeeping ?? 50);
  return setPieceClamp(Number.isFinite(value) ? value : 50, 1, 99);
}

function stableCandidateSort(left, right, scoreFor) {
  return scoreFor(right) - scoreFor(left) || String(left.id).localeCompare(String(right.id));
}

function selectSetPieceTaker(attackers = [], kind, roll = .5) {
  const candidates = attackers.filter(outfield);
  if (!candidates.length) return null;
  const scoreFor = kind === 'penalty'
    ? player => weightedDetailed(player, { shooting:.82, physical:.18 })
    : player => weightedDetailed(player, { shooting:.58, passing:.34, physical:.08 });
  const ranked = [...candidates].sort((left, right) => stableCandidateSort(left, right, scoreFor));
  const top = ranked.slice(0, Math.min(4, ranked.length));
  const index = Math.min(top.length - 1, Math.floor(setPieceClamp(Number(roll) || 0, 0, .999999) * top.length));
  return top[index] ?? ranked[0];
}

function wallParticipants(defenders = [], size) {
  const candidates = defenders.filter(outfield);
  const scoreFor = player => weightedDetailed(player, { defending:.58, physical:.34, pace:.08 });
  return [...candidates]
    .sort((left, right) => stableCandidateSort(left, right, scoreFor))
    .slice(0, size);
}

function freeKickDistance(chanceRoll) {
  const normalized = setPieceClamp((Number(chanceRoll) - .02) / .08, 0, 1);
  return setPieceRound(18 + normalized * 10, 2);
}

function freeKickChannel(targetRoll) {
  return setPieceRound(setPieceClamp((Number(targetRoll) - .5) * 1.5, -.72, .72), 3);
}

function freeKickWall({ defenders, distance, channel }) {
  const size = setPieceClamp(Math.round(5 - (distance - 18) / 3.3), 2, 5);
  const selected = wallParticipants(defenders, size);
  const wallZ = setPieceRound(Math.max(2.2, distance - WALL_DISTANCE_METRES), 2);
  const centreX = setPieceRound(channel * 1.15, 3);
  const spacing = .48;
  const members = selected.map((player, index) => ({
    id:player.id,
    name:player.name,
    x:setPieceRound(centreX + (index - (selected.length - 1) / 2) * spacing, 3),
    y:0,
    z:wallZ,
  }));
  return {
    size:members.length,
    distanceFromBall:WALL_DISTANCE_METRES,
    centreX,
    z:wallZ,
    members,
  };
}

export function deriveAuthoritativeSetPiece(prepared) {
  if (!prepared?.packet || prepared.outcome !== 'foul_won') return null;
  if (prepared.route === 'circulation') return null;

  // Phase 4 deliberately derives the award before terminal shot resolution.
  // Only packet fields consumed before shot/finish are used here so eligibility
  // cannot leak a would-have-been result into the set-piece decision.
  const awardRoll = setPieceClamp(Number(prepared.packet.chance) || 0, 0, .999999);
  if (awardRoll >= .10) return null;

  const kind = awardRoll < .02 ? 'penalty' : 'direct_free_kick';
  const taker = selectSetPieceTaker(prepared.attackers, kind, prepared.packet.shooter);
  const keeper = goalkeeper(prepared.defenders);
  if (!taker || !keeper) return null;

  if (kind === 'penalty') {
    return {
      version:MATCH_SET_PIECE_VERSION,
      kind,
      awardReason:'penalty_area_foul',
      attackingTeamId:prepared.teamId,
      defendingTeamId:prepared.opponentTeamId,
      takerId:taker.id,
      takerName:taker.name,
      goalkeeperId:keeper.id,
      goalkeeperName:keeper.name,
      directAttemptEligible:true,
      xg:PENALTY_XG,
      location:{ coordinateSystem:'goal-facing-v1', distance:11, channel:0, x:0 },
      wall:null,
    };
  }

  const distance = freeKickDistance(awardRoll);
  const channel = freeKickChannel(prepared.packet.target);
  const xg = setPieceRound(setPieceClamp(.17 - (distance - 18) * .009 - Math.abs(channel) * .025, .055, .17), 3);
  return {
    version:MATCH_SET_PIECE_VERSION,
    kind,
    awardReason:'shooting_range_foul',
    attackingTeamId:prepared.teamId,
    defendingTeamId:prepared.opponentTeamId,
    takerId:taker.id,
    takerName:taker.name,
    goalkeeperId:keeper.id,
    goalkeeperName:keeper.name,
    directAttemptEligible:true,
    xg,
    location:{ coordinateSystem:'goal-facing-v1', distance, channel, x:setPieceRound(channel * 2.4, 3) },
    wall:freeKickWall({ defenders:prepared.defenders, distance, channel }),
  };
}

function targetFromAutomaticPacket(packet, { yBase = .48, yRange = .36 } = {}) {
  return {
    x:setPieceRound(setPieceClamp((Number(packet.finish) - .5) * 1.48, -.96, .96), 4),
    y:setPieceRound(setPieceClamp(yBase + (Number(packet.shot) - .5) * yRange, .10, .92), 4),
    power:.78,
    executionQuality:.72,
  };
}

function normalizedAttack(intent) {
  const attack = intent?.attack;
  if (!attack) return null;
  return {
    aimX:setPieceClamp(Number(attack.aimX) || 0, -1.25, 1.25),
    aimY:setPieceClamp(Number.isFinite(Number(attack.aimY)) ? Number(attack.aimY) : .5, -.2, 1.2),
    power:setPieceClamp(Number.isFinite(Number(attack.power)) ? Number(attack.power) : .72, 0, 1),
    timing:setPieceClamp(Number.isFinite(Number(attack.timing)) ? Number(attack.timing) : .65, 0, 1),
  };
}

function normalizedKeeper(intent) {
  const keeperIntent = intent?.goalkeeper;
  if (!keeperIntent) return null;
  return {
    x:setPieceClamp(Number(keeperIntent.x) || 0, -1, 1),
    y:setPieceClamp(Number.isFinite(Number(keeperIntent.y)) ? Number(keeperIntent.y) : .5, 0, 1),
    timing:setPieceClamp(Number.isFinite(Number(keeperIntent.timing)) ? Number(keeperIntent.timing) : .65, 0, 1),
  };
}

function setPieceTrajectory({ attack, packet, technique, pressure = 0, type }) {
  const ability = setPieceClamp((technique - 45) / 54, 0, 1);
  const timing = setPieceClamp(attack.timing, 0, 1);
  const preferredPower = type === 'penalty' ? .76 : .70;
  const powerControl = 1 - Math.abs(attack.power - preferredPower) * .72;
  const baseSpread = type === 'penalty' ? .18 : .26;
  const spread = setPieceClamp(baseSpread - ability * .11 + (1 - timing) * .11 + pressure * .08, .025, .34);
  return {
    x:setPieceRound(attack.aimX + (Number(packet.finish) - .5) * 2 * spread, 4),
    y:setPieceRound(attack.aimY + (Number(packet.shot) - .5) * spread * .7, 4),
    power:setPieceRound(attack.power, 4),
    executionQuality:setPieceRound(setPieceClamp(ability * .62 + timing * .28 + powerControl * .10, .08, .99), 4),
  };
}

function automaticKeeper(target, packet, keeping, { penalty = false } = {}) {
  const ability = setPieceClamp((keeping - 35) / 64, 0, 1);
  const error = (penalty ? .58 : .50) - ability * .38;
  return {
    x:setPieceClamp(target.x + (Number(packet.shot) - .5) * 2 * error, -1, 1),
    y:setPieceClamp(target.y + (Number(packet.finish) - .5) * error * .62, 0, 1),
    timing:setPieceClamp(.48 + ability * .42, .4, .93),
  };
}

function interactiveKeeperSave({ target, keeperIntent, keeping, power, penalty = false }) {
  const ability = setPieceClamp((keeping - 35) / 64, 0, 1);
  const reach = setPieceClamp((penalty ? .19 : .20) + ability * .24 + keeperIntent.timing * .12, .18, .58);
  const dx = target.x - keeperIntent.x;
  const dy = (target.y - keeperIntent.y) * 1.16;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const powerPenalty = setPieceClamp((power - .72) * .14, -.04, .05);
  return {
    save:distance <= setPieceClamp(reach - powerPenalty, .17, .62),
    reach:setPieceRound(reach, 4),
    keeper:{
      x:setPieceRound(keeperIntent.x, 4),
      y:setPieceRound(keeperIntent.y, 4),
      timing:setPieceRound(keeperIntent.timing, 4),
      reach:setPieceRound(reach, 4),
    },
  };
}

export function resolvePenaltyOutcome({ setPiece, shooter, defenders = [], packet, intent = null } = {}) {
  if (setPiece?.kind !== 'penalty') throw new Error('Penalty resolver requires a penalty set piece');
  const shooting = weightedDetailed(shooter, { shooting:.86, physical:.14 });
  const keeping = keeperRating(defenders);
  const attack = normalizedAttack(intent);

  if (!attack) {
    const missChance = setPieceClamp(.105 - (shooting - 75) * .0022, .045, .17);
    if (Number(packet.shot) < missChance) {
      const target = { ...targetFromAutomaticPacket(packet), x:Math.sign(Number(packet.finish) - .5 || 1) * 1.08 };
      return {
        setPieceType:'penalty', finish:'missed', onTarget:false, goal:false,
        shooting:setPieceRound(shooting), pressure:0, goalkeeping:setPieceRound(keeping), restart:'goal_kick',
        presentation:{ target, blockerId:null, keeper:null, contact:'miss' },
      };
    }
    const conversion = setPieceClamp(.76 + (shooting - 75) * .0034 - (keeping - 75) * .0026, .58, .88);
    const goal = Number(packet.finish) < conversion;
    const target = targetFromAutomaticPacket(packet, { yBase:.51, yRange:.34 });
    const keeperIntent = automaticKeeper(target, packet, keeping, { penalty:true });
    return {
      setPieceType:'penalty', finish:goal ? 'goal' : 'saved', onTarget:true, goal,
      shooting:setPieceRound(shooting), pressure:0, goalkeeping:setPieceRound(keeping), goalChance:setPieceRound(conversion),
      restart:goal ? 'kickoff' : 'keeper_possession',
      presentation:{
        target,
        blockerId:null,
        keeper:{ x:setPieceRound(keeperIntent.x, 4), y:setPieceRound(keeperIntent.y, 4), timing:setPieceRound(keeperIntent.timing, 4), reach:setPieceRound(.46, 4) },
        contact:goal ? 'goal' : 'save',
      },
    };
  }

  const target = setPieceTrajectory({ attack, packet, technique:shooting, type:'penalty' });
  const insideGoal = Math.abs(target.x) <= 1 && target.y >= 0 && target.y <= 1;
  if (!insideGoal) {
    return {
      setPieceType:'penalty', finish:'missed', onTarget:false, goal:false,
      shooting:setPieceRound(shooting), pressure:0, goalkeeping:setPieceRound(keeping), restart:'goal_kick',
      presentation:{ target, blockerId:null, keeper:null, contact:'miss' },
    };
  }

  const keeperIntent = normalizedKeeper(intent) ?? automaticKeeper(target, packet, keeping, { penalty:true });
  const saveResult = interactiveKeeperSave({ target, keeperIntent, keeping, power:attack.power, penalty:true });
  return {
    setPieceType:'penalty', finish:saveResult.save ? 'saved' : 'goal', onTarget:true, goal:!saveResult.save,
    shooting:setPieceRound(shooting), pressure:0, goalkeeping:setPieceRound(keeping),
    restart:saveResult.save ? 'keeper_possession' : 'kickoff',
    presentation:{ target, blockerId:null, keeper:saveResult.keeper, contact:saveResult.save ? 'save' : 'goal' },
  };
}

function freeKickTechnique(shooter) {
  return weightedDetailed(shooter, { shooting:.62, passing:.30, physical:.08 });
}

function nearestWallMember(setPiece, targetX) {
  const members = setPiece?.wall?.members ?? [];
  if (!members.length) return null;
  const goalWidthHalf = 7.32 / 2;
  const targetMetres = targetX * goalWidthHalf;
  return [...members].sort((left, right) => Math.abs(left.x - targetMetres) - Math.abs(right.x - targetMetres))[0];
}

function freeKickBlockThreshold(setPiece, target, technique) {
  const wallSize = Number(setPiece?.wall?.size ?? 0);
  const distance = Number(setPiece?.location?.distance ?? 24);
  const heightExposure = setPieceClamp((.68 - Number(target.y ?? .5)) * .32, -.05, .10);
  const sizeEffect = wallSize * .025;
  const distanceEffect = setPieceClamp((25 - distance) * .008, -.03, .05);
  const skillEffect = setPieceClamp((technique - 75) * .0022, -.04, .05);
  return setPieceClamp(.14 + sizeEffect + distanceEffect + heightExposure - skillEffect, .08, .34);
}

export function resolveDirectFreeKickOutcome({ setPiece, shooter, defenders = [], packet, intent = null } = {}) {
  if (setPiece?.kind !== 'direct_free_kick') throw new Error('Free-kick resolver requires a direct free kick');
  const technique = freeKickTechnique(shooter);
  const keeping = keeperRating(defenders);
  const attack = normalizedAttack(intent);
  const target = attack
    ? setPieceTrajectory({ attack, packet, technique, type:'direct_free_kick' })
    : targetFromAutomaticPacket(packet, { yBase:.60, yRange:.42 });

  const blockThreshold = freeKickBlockThreshold(setPiece, target, technique);
  if (Number(packet.assist) < blockThreshold) {
    const blocker = nearestWallMember(setPiece, target.x) ?? setPiece.wall?.members?.[0] ?? null;
    return {
      setPieceType:'direct_free_kick', finish:'blocked', onTarget:false, goal:false,
      shooting:setPieceRound(technique), pressure:setPieceRound(blockThreshold * 100), goalkeeping:setPieceRound(keeping),
      restart:'defensive_restart',
      presentation:{ target, blockerId:blocker?.id ?? null, keeper:null, contact:'block' },
    };
  }

  if (attack) {
    const insideGoal = Math.abs(target.x) <= 1 && target.y >= 0 && target.y <= 1;
    if (!insideGoal) {
      return {
        setPieceType:'direct_free_kick', finish:'missed', onTarget:false, goal:false,
        shooting:setPieceRound(technique), pressure:setPieceRound(blockThreshold * 100), goalkeeping:setPieceRound(keeping), restart:'goal_kick',
        presentation:{ target, blockerId:null, keeper:null, contact:'miss' },
      };
    }
    const keeperIntent = normalizedKeeper(intent) ?? automaticKeeper(target, packet, keeping);
    const saveResult = interactiveKeeperSave({ target, keeperIntent, keeping, power:attack.power });
    return {
      setPieceType:'direct_free_kick', finish:saveResult.save ? 'saved' : 'goal', onTarget:true, goal:!saveResult.save,
      shooting:setPieceRound(technique), pressure:setPieceRound(blockThreshold * 100), goalkeeping:setPieceRound(keeping),
      restart:saveResult.save ? 'keeper_possession' : 'kickoff',
      presentation:{ target, blockerId:null, keeper:saveResult.keeper, contact:saveResult.save ? 'save' : 'goal' },
    };
  }

  const distance = Number(setPiece.location?.distance ?? 24);
  const onTargetChance = setPieceClamp(.30 + (technique - 70) * .0055 - (distance - 20) * .010, .18, .58);
  if (Number(packet.shot) > onTargetChance) {
    return {
      setPieceType:'direct_free_kick', finish:'missed', onTarget:false, goal:false,
      shooting:setPieceRound(technique), pressure:setPieceRound(blockThreshold * 100), goalkeeping:setPieceRound(keeping), restart:'goal_kick',
      presentation:{ target:{ ...target, x:Math.sign(target.x || 1) * 1.08 }, blockerId:null, keeper:null, contact:'miss' },
    };
  }

  const goalChance = setPieceClamp(.105 + (technique - 75) * .0032 - (keeping - 75) * .0022 - (distance - 20) * .0045, .035, .24);
  const goal = Number(packet.finish) < goalChance;
  const keeperIntent = automaticKeeper(target, packet, keeping);
  return {
    setPieceType:'direct_free_kick', finish:goal ? 'goal' : 'saved', onTarget:true, goal,
    shooting:setPieceRound(technique), pressure:setPieceRound(blockThreshold * 100), goalkeeping:setPieceRound(keeping), goalChance:setPieceRound(goalChance),
    restart:goal ? 'kickoff' : 'keeper_possession',
    presentation:{
      target,
      blockerId:null,
      keeper:{ x:setPieceRound(keeperIntent.x, 4), y:setPieceRound(keeperIntent.y, 4), timing:setPieceRound(keeperIntent.timing, 4), reach:setPieceRound(.44, 4) },
      contact:goal ? 'goal' : 'save',
    },
  };
}

export function buildSetPiecePlayableGeometry(setPiece) {
  if (!setPiece || setPiece.version !== MATCH_SET_PIECE_VERSION) return null;
  const distance = Number(setPiece.location?.distance ?? (setPiece.kind === 'penalty' ? 11 : 22));
  const channel = Number(setPiece.location?.channel ?? 0);
  const channelX = Number(setPiece.location?.x ?? channel * 2.4);
  const keeperDepth = setPiece.kind === 'penalty' ? .32 : .45;
  const wall = setPiece.wall ? {
    ...setPiece.wall,
    members:(setPiece.wall.members ?? []).map(member => ({ ...member })),
  } : null;
  const firstWallMember = wall?.members?.[0] ?? null;
  return {
    coordinateSystem:'goal-facing-v1',
    goal:{ width:7.32, height:2.44 },
    channel,
    distance,
    staging:{
      version:1,
      variant:setPiece.kind,
      channel,
      channelBand:channel < -.28 ? 'left' : channel > .28 ? 'right' : 'central',
      distance,
      distanceBand:setPiece.kind === 'penalty' ? 'penalty' : 'set_piece',
      pressureLevel:setPiece.kind === 'penalty' ? 'none' : 'wall',
      pressureScore:setPiece.kind === 'penalty' ? 0 : Number(wall?.size ?? 0),
      keeperStartingDepth:'set',
      keeperDepth,
      defenderRelationship:setPiece.kind === 'penalty' ? 'none' : 'wall',
    },
    legalActions:{ attack:['aim', 'power', 'timing'], goalkeeper:['position', 'timing'] },
    continuousLocomotion:false,
    shooter:{ x:channelX, y:0, z:distance },
    goalkeeper:{ x:0, y:0, z:keeperDepth },
    defender:firstWallMember ? { x:firstWallMember.x, y:firstWallMember.y, z:firstWallMember.z } : null,
    ball:{ x:channelX, y:.11, z:distance - .55 },
    wall,
  };
}