import {
  PLAYABLE_MOMENT_VERSION,
  resolveInteractiveShotOutcome,
} from '../modules/matchActionResolver.js';
import {
  MATCH_SET_PIECE_VERSION,
  buildSetPiecePlayableGeometry,
  resolveDirectFreeKickOutcome,
  resolvePenaltyOutcome,
} from '../modules/matchSetPieces.js';

export const POC_ATTACKING_SCENARIOS = Object.freeze([
  Object.freeze({ id:'shot', label:'Open-play shot', hint:'OPEN-PLAY SHOT · place the finish away from the goalkeeper' }),
  Object.freeze({ id:'one_on_one', label:'1v1', hint:'1V1 · the keeper has less effective reach, so good placement is rewarded' }),
  Object.freeze({ id:'long_shot', label:'Long shot', hint:'LONG SHOT · TOP CORNER ONLY TO SCORE' }),
  Object.freeze({ id:'free_kick', label:'Free kick', hint:'DIRECT FREE KICK · BEND YOUR SWIPE AROUND OR OVER THE WALL' }),
  Object.freeze({ id:'penalty', label:'Penalty', hint:'PENALTY · THE GOALKEEPER DIVE DIRECTION IS RNG · PICK YOUR SIDE' }),
]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value)));
}

function stableUnit(input) {
  let hash = 2166136261;
  for (const char of String(input)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) + .5) / 0x100000000;
}

function packet(scenario, attempt = 0) {
  const fields = [
    'possession','route','actor','target','defender','execution','outcome',
    'chance','shooter','shot','finish','assist','discipline','injury',
  ];
  const result = { version:1 };
  for (const field of fields) result[field] = stableUnit(`poc:${scenario}:${attempt}:${field}`);
  // Keep the POC focused on the finish instead of random initial blocks.
  result.outcome = .92;
  result.assist = .92;
  return result;
}

function player(id, position, rating) {
  const goalkeeper = position === 'GK';
  const defender = ['CB','RB','LB','CDM'].includes(position);
  return {
    id,
    name:id.replaceAll('-', ' '),
    teamId:id.startsWith('poc-away') ? 'poc-away' : 'poc-home',
    position,
    matchPosition:position,
    age:25,
    attack:goalkeeper ? 15 : rating,
    midfield:goalkeeper ? 20 : rating,
    defence:goalkeeper ? 28 : defender ? rating : rating - 15,
    goalkeeping:goalkeeper ? rating : 8,
    fitness:96,
    form:55,
    individualMorale:55,
    sharpness:65,
    traits:[],
    positionSuitability:{ [position]:1 },
    attributeProfile:{
      version:1,
      pace:rating,
      shooting:goalkeeper ? 15 : rating,
      passing:goalkeeper ? 45 : rating,
      dribbling:goalkeeper ? 25 : rating,
      defending:defender ? rating : 45,
      physical:rating,
    },
  };
}

const SHOOTER = Object.freeze(player('poc-home-attacker', 'ST', 88));
const KEEPER = Object.freeze(player('poc-away-keeper', 'GK', 82));
const PRESSURE = Object.freeze(player('poc-away-defender', 'CB', 74));
const WALL_PLAYERS = Object.freeze([
  player('poc-away-wall-1', 'CB', 80),
  player('poc-away-wall-2', 'CB', 79),
  player('poc-away-wall-3', 'CDM', 78),
  player('poc-away-wall-4', 'RB', 77),
]);
const DEFENDERS = Object.freeze([KEEPER, PRESSURE, ...WALL_PLAYERS]);

function openPlayGeometry({ variant, distance, keeperDepth, xg }) {
  const longShot = xg <= .12;
  const oneOnOne = variant.startsWith('one_on_one');
  return {
    coordinateSystem:'goal-facing-v1',
    goal:{ width:7.32, height:2.44 },
    channel:0,
    distance,
    staging:{
      version:1,
      variant,
      channel:0,
      channelBand:'central',
      distance,
      distanceBand:longShot ? 'edge' : oneOnOne ? 'close' : 'box',
      pressureLevel:oneOnOne ? 'low' : 'medium',
      pressureScore:oneOnOne ? 55 : 74,
      keeperStartingDepth:oneOnOne ? 'advancing' : 'set',
      keeperDepth,
      defenderRelationship:oneOnOne ? 'trailing' : 'closing',
    },
    legalActions:{ attack:['aim','power','timing'] },
    continuousLocomotion:false,
    shooter:{ x:0, y:0, z:distance },
    goalkeeper:{ x:0, y:0, z:keeperDepth },
    defender:{ x:.9, y:0, z:oneOnOne ? distance + .9 : distance * .70 },
    ball:{ x:0, y:.11, z:distance - .55 },
    wall:null,
  };
}

function freeKickSetPiece() {
  const distance = 22;
  const wallZ = distance - 9.15;
  const members = WALL_PLAYERS.map((member, index) => ({
    id:member.id,
    name:member.name,
    x:(index - 1.5) * .48,
    y:0,
    z:wallZ,
  }));
  return {
    version:MATCH_SET_PIECE_VERSION,
    kind:'direct_free_kick',
    awardReason:'poc_direct_free_kick',
    attackingTeamId:'poc-home',
    defendingTeamId:'poc-away',
    takerId:SHOOTER.id,
    takerName:SHOOTER.name,
    goalkeeperId:KEEPER.id,
    goalkeeperName:KEEPER.name,
    directAttemptEligible:true,
    xg:.12,
    location:{ coordinateSystem:'goal-facing-v1', distance, channel:0, x:0 },
    wall:{ size:members.length, distanceFromBall:9.15, centreX:0, z:wallZ, members },
  };
}

function penaltySetPiece() {
  return {
    version:MATCH_SET_PIECE_VERSION,
    kind:'penalty',
    awardReason:'poc_penalty',
    attackingTeamId:'poc-home',
    defendingTeamId:'poc-away',
    takerId:SHOOTER.id,
    takerName:SHOOTER.name,
    goalkeeperId:KEEPER.id,
    goalkeeperName:KEEPER.name,
    directAttemptEligible:true,
    xg:.76,
    location:{ coordinateSystem:'goal-facing-v1', distance:11, channel:0, x:0 },
    wall:null,
  };
}

export function createPocAttackingMoment(scenario = 'shot', attempt = 0) {
  const chosen = POC_ATTACKING_SCENARIOS.some(item => item.id === scenario) ? scenario : 'shot';
  const rng = packet(chosen, attempt);
  let route = 'carry';
  let xg = .20;
  let setPiece = null;
  let geometry;

  if (chosen === 'one_on_one') {
    route = 'pass_into_space';
    xg = .36;
    geometry = openPlayGeometry({ variant:'one_on_one_advancing_keeper', distance:7.8, keeperDepth:1.8, xg });
  } else if (chosen === 'long_shot') {
    route = 'circulation';
    xg = .09;
    geometry = openPlayGeometry({ variant:'edge_of_box_attempt', distance:18, keeperDepth:.55, xg });
  } else if (chosen === 'free_kick') {
    route = 'set_piece';
    setPiece = freeKickSetPiece();
    xg = setPiece.xg;
    geometry = buildSetPiecePlayableGeometry(setPiece);
  } else if (chosen === 'penalty') {
    route = 'penalty';
    setPiece = penaltySetPiece();
    xg = setPiece.xg;
    geometry = buildSetPiecePlayableGeometry(setPiece);
  } else {
    geometry = openPlayGeometry({ variant:'central_snapshot', distance:13.2, keeperDepth:.55, xg });
  }

  return {
    version:PLAYABLE_MOMENT_VERSION,
    phase:42,
    minute:32,
    mode:'attack',
    interactionType:setPiece ? 'set_piece' : 'shot',
    attackingTeamId:'poc-home',
    defendingTeamId:'poc-away',
    shooterId:SHOOTER.id,
    shooterName:SHOOTER.name,
    goalkeeperId:KEEPER.id,
    goalkeeperName:KEEPER.name,
    defenderId:setPiece ? null : PRESSURE.id,
    route,
    xg,
    setPiece,
    geometry,
    syntheticScenario:chosen,
    syntheticAttempt:attempt,
    syntheticPacket:rng,
  };
}

export function resolvePocAttackingMoment(moment, intent = null) {
  if (!moment || moment.mode !== 'attack') throw new Error('POC attacking moment required');
  const rng = moment.syntheticPacket ?? packet(moment.syntheticScenario ?? 'shot', moment.syntheticAttempt ?? 0);
  if (moment.setPiece?.kind === 'direct_free_kick') {
    return resolveDirectFreeKickOutcome({
      setPiece:moment.setPiece,
      shooter:SHOOTER,
      defenders:DEFENDERS,
      packet:rng,
      intent,
    });
  }
  if (moment.setPiece?.kind === 'penalty') {
    return resolvePenaltyOutcome({
      setPiece:moment.setPiece,
      shooter:SHOOTER,
      defenders:DEFENDERS,
      packet:rng,
      intent,
    });
  }
  return resolveInteractiveShotOutcome({
    shooter:SHOOTER,
    defender:PRESSURE,
    defenders:DEFENDERS,
    xg:moment.xg,
    packet:rng,
    intent,
    route:moment.route,
  });
}

export function pocScenarioHint(scenario) {
  return POC_ATTACKING_SCENARIOS.find(item => item.id === scenario)?.hint
    ?? POC_ATTACKING_SCENARIOS[0].hint;
}

export function pocScenarioStatus(moment, shot) {
  const scenario = moment?.syntheticScenario ?? 'shot';
  const finish = String(shot?.finish ?? 'resolved').toUpperCase();
  if (scenario === 'penalty') {
    const keeperX = Number(shot?.presentation?.keeper?.x ?? 0);
    const dive = keeperX < -.2 ? 'left' : keeperX > .2 ? 'right' : 'centre';
    return `${finish} — the goalkeeper committed ${dive} from the deterministic RNG packet.`;
  }
  if (scenario === 'free_kick') {
    const curve = Number(shot?.presentation?.curve ?? 0);
    const technique = shot?.presentation?.kickStyle ?? 'laces';
    return shot?.goal
      ? `GOAL — ${technique} strike with ${Math.abs(curve).toFixed(2)} curl cleared the wall and beat the keeper.`
      : `${finish} — the swipe supplied ${Math.abs(curve).toFixed(2)} curl; placement, wall clearance and goalkeeper reach all matter.`;
  }
  if (scenario === 'long_shot') {
    return shot?.goal
      ? 'GOAL — the long-range effort reached a top corner.'
      : `${finish} — long shots must resolve into a top corner to score.`;
  }
  if (scenario === 'one_on_one') {
    return `${finish} — 1v1s use reduced block risk and goalkeeper reach compared with an ordinary shot.`;
  }
  return `${finish} — ordinary open-play shot resolved through the interactive match resolver.`;
}

export function pocPenaltyDiveDirection(moment) {
  const roll = clamp(moment?.syntheticPacket?.defender ?? .5, 0, .999999);
  return roll < .42 ? 'left' : roll > .58 ? 'right' : 'centre';
}