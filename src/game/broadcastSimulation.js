import { SLOT_LAYOUT, SLOT_POS_MAP } from './formationLayout.js';

const FORWARDS = new Set(['ST', 'CF', 'RW', 'LW', 'CAM']);
const DEFENDERS = new Set(['CB', 'RB', 'LB']);
const WIDE = new Set(['RB', 'LB', 'RW', 'LW', 'RM', 'LM']);

function clamp(value, min = 3, max = 97) { return Math.max(min, Math.min(max, value)); }
function hash(value) { let h = 2166136261; for (const c of String(value)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function direction(sim, teamId) {
  const homeDirection = sim.endsSwapped ? 1 : -1;
  return teamId === sim.homeTeamId ? homeDirection : -homeDirection;
}
function teamPlayers(sim, teamId) { return sim.players.filter(player => player.teamId === teamId); }
function opponentPlayers(sim, teamId) { return sim.players.filter(player => player.teamId !== teamId); }
function otherTeamId(sim, teamId) { return teamId === sim.homeTeamId ? sim.awayTeamId : sim.homeTeamId; }
function attackingGoalY(sim, teamId) { return direction(sim, teamId) < 0 ? 2.5 : 97.5; }
function inFinalThird(sim, player, teamId = player.teamId) {
  return direction(sim, teamId) < 0 ? player.y <= 33 : player.y >= 67;
}
function inPenaltyArea(sim, player, teamId = player.teamId) {
  const nearGoal = direction(sim, teamId) < 0 ? player.y <= 18 : player.y >= 82;
  return nearGoal && player.x >= 22 && player.x <= 78;
}
function hasShootingLane(sim, player, teamId = player.teamId) {
  const goalDistance = Math.abs(player.y - attackingGoalY(sim, teamId));
  return inPenaltyArea(sim, player, teamId)
    || (inFinalThird(sim, player, teamId) && goalDistance <= 30 && player.x >= 18 && player.x <= 82);
}

function assign(players, formation, home, teamId) {
  const slots = SLOT_LAYOUT[formation] ?? SLOT_LAYOUT['4-3-3'];
  const remaining = [...players];
  return slots.map((slot, shirt) => {
    const accepted = SLOT_POS_MAP[slot.p] ?? [slot.p];
    const index = remaining.findIndex(player => accepted.includes(player.position));
    const player = remaining.splice(index >= 0 ? index : 0, 1)[0];
    if (!player) return null;
    return {
      id: player.id, name: player.name ?? player.id, pace: player.attributeProfile?.pace ?? 65, shirt: shirt + 1, position: player.position, teamId,
      team: home ? 'home' : 'away', baseX: slot.x, baseY: home ? slot.y : 100 - slot.y,
      x: slot.x, y: home ? slot.y : 100 - slot.y, targetX: slot.x,
      targetY: home ? slot.y : 100 - slot.y, vx: 0, vy: 0,
    };
  }).filter(Boolean);
}

function kickoffPoint(sim, player, takingTeamId, kickerId) {
  const dir = direction(sim, player.teamId);
  if (player.id === kickerId) return { x: 50, y: 50 };
  if (player.position === 'GK') return { x: 50, y: dir < 0 ? 91 : 9 };
  if (DEFENDERS.has(player.position)) return { x: player.baseX, y: dir < 0 ? 76 : 24 };
  if (FORWARDS.has(player.position)) {
    const taking = player.teamId === takingTeamId;
    return { x: player.baseX, y: dir < 0 ? (taking ? 58 : 60) : (taking ? 42 : 40) };
  }
  return { x: player.baseX, y: dir < 0 ? 64 : 36 };
}

function closest(players, point, predicate = () => true) {
  return players.filter(predicate).sort((a, b) => distance(a, point) - distance(b, point))[0] ?? null;
}

function prepareKickoff(sim, takingTeamId) {
  const side = teamPlayers(sim, takingTeamId);
  const kicker = closest(side, { x: 50, y: 50 }, player => FORWARDS.has(player.position))
    ?? closest(side, { x: 50, y: 50 }, player => player.position !== 'GK');
  for (const player of sim.players) {
    const point = kickoffPoint(sim, player, takingTeamId, kicker.id);
    Object.assign(player, { x:point.x, y:point.y, targetX:point.x, targetY:point.y, vx:0, vy:0, pressing:false, receiving:false, rushing:false });
  }
  sim.possessionTeamId = takingTeamId;
  sim.desiredPossessionTeamId = takingTeamId;
  sim.ball = { x: 50, y: 50, ownerId: kicker.id, flight: null, shooting: false };
  sim.mode = 'kickoff';
  sim.action = sim.halftimeCompleted ? 'SECOND HALF · TEAMS SET' : 'KICK OFF · TEAMS SET';
  sim.nextActionAt = sim.clock + 650;
  sim.kickoffKickerId = kicker.id;
  sim.sequenceSinceRestart = 0;
}

export function createBroadcastSimulation({ homeTeamId, awayTeamId, possessionTeamId, homeFormation, awayFormation, homePlayers, awayPlayers, ledgerDriven = false }) {
  const sim = {
    ledgerDriven, activePhase: null, completedPhase: 0, phaseLabel: 'Kick off',
    homeTeamId, awayTeamId, possessionTeamId, desiredPossessionTeamId: possessionTeamId,
    enginePossessionTeamId: possessionTeamId, possessionLockTeamId: null, possessionLockUntil: 0,
    firstKickoffTeamId: possessionTeamId, endsSwapped: false, halftimeCompleted: false,
    halftimePending: false, halftimeHoldUntil: 0, phase: 0,
    players: [...assign(homePlayers, homeFormation, true, homeTeamId), ...assign(awayPlayers, awayFormation, false, awayTeamId)],
    ball: null, clock: 0, sequence: 0, sequenceSinceRestart: 0, outcomeIndex: 0,
    nextActionAt: 0, mode: 'kickoff', action: 'KICK OFF',
    pendingGoal: null, goalHoldUntil: 0, restart: null, kickoffKickerId: null,
  };
  prepareKickoff(sim, possessionTeamId);
  return sim;
}

function beginHalfTime(sim) {
  sim.halftimePending = false; sim.mode = 'half-time'; sim.action = 'HALF TIME';
  sim.ball.ownerId = null; sim.ball.flight = null; sim.ball.shooting = false;
  sim.halftimeHoldUntil = sim.clock + 1800; sim.nextActionAt = Number.POSITIVE_INFINITY;
  for (const player of sim.players) {
    Object.assign(player, { targetX:player.x, targetY:player.y, vx:player.vx * .25, vy:player.vy * .25, pressing:false, receiving:false, rushing:false });
  }
}

export function updateBroadcastSimulation(sim, { phase, possessionTeamId, event = null, record = null }) {
  if (sim.ledgerDriven && record) {
    if (sim.activePhase || record.phase <= sim.completedPhase) return sim;
    sim.activePhase = { record: { ...record }, stage: 'acquire' };
    if (record.finish === 'goal' && !event) event = { type:'goal', minute:record.minute, teamId:record.teamId, playerId:record.shotId, playerName:ledgerPlayer(sim, record.shotId)?.name ?? '' };
    sim.phaseLabel = ROUTE_LABELS[record.route] ?? 'Build up';
    sim.nextActionAt = Math.min(sim.nextActionAt, sim.clock + 120);
  }
  sim.enginePossessionTeamId = possessionTeamId;
  if (!sim.possessionLockTeamId || sim.clock >= sim.possessionLockUntil) {
    sim.possessionLockTeamId = null;
    sim.desiredPossessionTeamId = possessionTeamId;
  }
  const crossedHalfTime = !sim.halftimeCompleted && phase >= 60 && sim.phase < 60;
  if (event?.type === 'goal' && sim.pendingGoal?.key !== `${event.minute}:${event.playerId}`) {
    sim.possessionLockTeamId = null;
    sim.possessionLockUntil = 0;
    sim.desiredPossessionTeamId = possessionTeamId;
    sim.pendingGoal = { ...event, key: `${event.minute}:${event.playerId}`, stage: 'build' };
    sim.restart = null;
    sim.nextActionAt = Math.min(sim.nextActionAt, sim.clock + 120);
    if (crossedHalfTime) sim.halftimePending = true;
  } else if (crossedHalfTime) {
    if (sim.mode === 'goal' || sim.pendingGoal || sim.activePhase) sim.halftimePending = true;
    else beginHalfTime(sim);
  }
  sim.phase = phase;
  return sim;
}

export function replaceBroadcastLineups(sim, { homeFormation, awayFormation, homePlayers, awayPlayers }) {
  if (sim.ledgerDriven && sim.activePhase) {
    sim.pendingLineups = { homeFormation, awayFormation, homePlayers, awayPlayers };
    return sim;
  }
  const fresh = [
    ...assign(homePlayers, homeFormation, true, sim.homeTeamId),
    ...assign(awayPlayers, awayFormation, false, sim.awayTeamId),
  ];
  if (sim.endsSwapped) fresh.forEach(player => { player.baseY = 100 - player.baseY; });
  const existingById = new Map(sim.players.map(player => [player.id, player]));
  sim.players = fresh.map(next => {
    const existing = existingById.get(next.id)
      ?? sim.players.find(player => player.teamId === next.teamId && player.shirt === next.shirt);
    return existing ? { ...next, x:existing.x, y:existing.y, targetX:existing.targetX, targetY:existing.targetY, vx:existing.vx, vy:existing.vy } : next;
  });
  if (sim.ball.ownerId && !sim.players.some(player => player.id === sim.ball.ownerId)) {
    const replacement = closest(teamPlayers(sim, sim.possessionTeamId), sim.ball, player => player.position !== 'GK');
    sim.ball.ownerId = replacement?.id ?? null;
  }
  return sim;
}

function offsideLine(sim, attackingTeamId) {
  const dir = direction(sim, attackingTeamId);
  const defenders = opponentPlayers(sim, attackingTeamId).map(player => player.y).sort((a, b) => a - b);
  const secondLast = dir < 0 ? defenders[1] : defenders[defenders.length - 2];
  return dir < 0 ? Math.min(sim.ball.y, secondLast) + 1.5 : Math.max(sim.ball.y, secondLast) - 1.5;
}

export function isOnside(sim, player, teamId = player.teamId) {
  if (sim.ball.ownerId === player.id) return true;
  const dir = direction(sim, teamId);
  if ((dir < 0 && player.y >= 50) || (dir > 0 && player.y <= 50)) return true;
  const line = offsideLine(sim, teamId);
  return dir < 0 ? player.y >= line - .01 : player.y <= line + .01;
}

function roleTarget(sim, player) {
  const hasBall = player.teamId === sim.possessionTeamId;
  const dir = direction(sim, player.teamId);
  const progress = dir < 0 ? (100 - sim.ball.y) / 100 : sim.ball.y / 100;
  let x = player.baseX; let y = player.baseY;
  if (hasBall) {
    y += dir * (progress - .5) * 12;
    x += (sim.ball.x - 50) * (WIDE.has(player.position) ? .06 : .13);
    if (WIDE.has(player.position)) x += player.baseX < 50 ? -3 : 3;
  } else {
    y -= dir * (progress - .5) * 8;
    x = 50 + (player.baseX - 50) * .78 + (sim.ball.x - 50) * .16;
  }
  return { x: clamp(x, 5, 95), y: clamp(y, 5, 95) };
}

function setGoalkeeperTarget(sim, player) {
  const dir = direction(sim, player.teamId);
  const ownPossession = player.teamId === sim.possessionTeamId;
  const goalY = dir < 0 ? 94 : 6;
  const goalDistance = Math.abs(sim.ball.y - attackingGoalY(sim, otherTeamId(sim, player.teamId)));
  const centralDanger = !ownPossession && goalDistance < 15 && sim.ball.x > 29 && sim.ball.x < 71;
  const emergencyRush = centralDanger && goalDistance < 9;
  player.targetX = clamp(50 + (sim.ball.x - 50) * (centralDanger ? .18 : .06), 41, 59);
  player.targetY = goalY + (dir < 0 ? -1 : 1) * (emergencyRush ? 5 : centralDanger ? 2.5 : ownPossession ? 1.5 : 0);
  player.rushing = emergencyRush;
}

function updateLiveTargets(sim) {
  const carrier = sim.players.find(player => player.id === sim.ball.ownerId);
  const attack = teamPlayers(sim, sim.possessionTeamId);
  const defence = opponentPlayers(sim, sim.possessionTeamId);
  for (const player of sim.players) {
    player.pressing = false; player.receiving = sim.ball.flight?.toId === player.id; player.rushing = false;
    if (player.position === 'GK') { setGoalkeeperTarget(sim, player); continue; }
    Object.assign(player, { targetX:roleTarget(sim, player).x, targetY:roleTarget(sim, player).y });
  }
  if (!carrier) return;
  const dir = direction(sim, sim.possessionTeamId);
  if (carrier.position === 'GK') {
    attack.filter(player => DEFENDERS.has(player.position)).slice(0, 2).forEach((player, index) => {
      player.targetX = index ? 68 : 32;
      player.targetY = dir < 0 ? 78 : 22;
      player.receiving = true;
    });
    return;
  }
  carrier.targetX = clamp(carrier.x + (50 - carrier.x) * .06, 5, 95);
  carrier.targetY = clamp(carrier.y + dir * 4, 7, 93);
  attack.filter(player => player.id !== carrier.id && player.position !== 'GK')
    .sort((a, b) => distance(a, carrier) - distance(b, carrier)).slice(0, 2)
    .forEach((player, index) => {
      player.targetX = clamp(carrier.x + (index ? 10 : -10), 6, 94);
      player.targetY = clamp(carrier.y - dir * (index ? 5 : 8), 7, 93);
    });
  defence.filter(player => player.position !== 'GK')
    .sort((a, b) => distance(a, carrier) - distance(b, carrier)).slice(0, sim.ball.y > 30 && sim.ball.y < 70 ? 2 : 1)
    .forEach((player, index) => {
      player.targetX = clamp(carrier.x + (index ? 2.8 : -2.8), 5, 95);
      player.targetY = clamp(carrier.y - dir * 1.5, 5, 95);
      player.pressing = true;
    });
  const line = offsideLine(sim, sim.possessionTeamId);
  for (const player of attack) {
    if (!FORWARDS.has(player.position) || player.id === carrier.id) continue;
    player.targetY = dir < 0 ? Math.max(player.targetY, line) : Math.min(player.targetY, line);
  }
  const scorer = sim.pendingGoal && sim.players.find(player => player.id === sim.pendingGoal.playerId);
  if (scorer && !sim.ledgerDriven && sim.pendingGoal.stage === 'build') {
    scorer.targetX = clamp(scorer.baseX + (50 - scorer.baseX) * .22, 24, 76);
    const desiredY = dir < 0 ? 27 : 73;
    scorer.targetY = dir < 0 ? Math.max(desiredY, line) : Math.min(desiredY, line);
    scorer.receiving = true;
    if (scorer.id === carrier.id) scorer.targetY = desiredY;
  }
}

function updateKickoffTargets(sim) {
  for (const player of sim.players) {
    const point = kickoffPoint(sim, player, sim.possessionTeamId, sim.kickoffKickerId);
    Object.assign(player, { targetX:point.x, targetY:point.y, pressing:false, receiving:false, rushing:false });
  }
}

function beginRestart(sim, type, teamId, spot, cause) {
  const restartSpot = { x: clamp(spot.x), y: clamp(spot.y) };
  const side = teamPlayers(sim, teamId);
  const taker = type === 'goal-kick'
    ? side.find(player => player.position === 'GK')
    : closest(side, restartSpot, player => player.position !== 'GK');
  sim.restart = { type, teamId, takerId: taker.id, spot: restartSpot, cause, startedAt:sim.clock };
  sim.mode = 'restart'; sim.possessionTeamId = teamId; sim.desiredPossessionTeamId = teamId;
  sim.possessionLockTeamId = null; sim.possessionLockUntil = 0;
  Object.assign(sim.ball, { ownerId:null, flight:null, x:restartSpot.x, y:restartSpot.y, shooting:false });
  sim.action = `${type.toUpperCase()} · ${cause}`;
  sim.nextActionAt = sim.clock + 850;
  sim.sequenceSinceRestart = 0;
}

function updateRestartTargets(sim) {
  const restart = sim.restart;
  const taker = sim.players.find(player => player.id === restart.takerId);
  for (const player of sim.players) {
    player.pressing = false; player.receiving = false; player.rushing = false;
    if (player.position === 'GK') setGoalkeeperTarget(sim, player);
    else Object.assign(player, { targetX:roleTarget(sim, player).x, targetY:roleTarget(sim, player).y });
  }
  taker.targetX = restart.spot.x; taker.targetY = restart.spot.y; taker.receiving = true;
  const dir = direction(sim, restart.teamId);
  const attack = teamPlayers(sim, restart.teamId).filter(player => player.id !== taker.id && player.position !== 'GK');
  const defence = opponentPlayers(sim, restart.teamId).filter(player => player.position !== 'GK');
  if (restart.type === 'corner') {
    attack.forEach((player, index) => {
      player.targetX = 34 + (index % 5) * 8; player.targetY = dir < 0 ? 10 + (index % 3) * 5 : 90 - (index % 3) * 5;
    });
    defence.forEach((player, index) => {
      player.targetX = 35 + (index % 5) * 7.5; player.targetY = dir < 0 ? 7 + (index % 3) * 4 : 93 - (index % 3) * 4;
    });
  } else if (restart.type === 'free-kick') {
    const plan = freeKickPlan(sim, restart);
    const wallY = restart.spot.y + dir * 9;
    const wallSize = plan === 'shot' ? 4 : plan === 'cross' ? 3 : 2;
    defence.slice(0, wallSize).forEach((player, index) => {
      player.targetX = 50 + (index - (wallSize - 1) / 2) * 4;
      player.targetY = wallY;
    });
    attack.slice(0, plan === 'pass' ? 3 : 6).forEach((player, index) => {
      player.targetX = 32 + index * 9; player.targetY = dir < 0 ? 17 + (index % 2) * 7 : 83 - (index % 2) * 7;
    });
  } else if (restart.type === 'goal-kick') {
    attack.filter(player => DEFENDERS.has(player.position)).slice(0, 4).forEach((player, index) => {
      player.targetX = index % 2 ? 72 : 28; player.targetY = dir < 0 ? 78 - Math.floor(index / 2) * 9 : 22 + Math.floor(index / 2) * 9;
    });
  } else if (restart.type === 'throw-in') {
    attack.slice(0, 3).forEach((player, index) => {
      player.targetX = restart.spot.x === 3 ? 11 + index * 5 : 89 - index * 5;
      player.targetY = clamp(restart.spot.y + (index - 1) * 8, 10, 90);
    });
  }
}

function candidateScore(sim, carrier, candidate) {
  const dir = direction(sim, carrier.teamId);
  const dist = distance(carrier, candidate);
  const forward = (candidate.y - carrier.y) * dir;
  const space = Math.min(...opponentPlayers(sim, carrier.teamId).map(player => distance(player, candidate)));
  return forward * .55 + space * .34 - Math.abs(dist - 18) * .23 + (hash(`${sim.sequence}:${candidate.id}`) % 100) / 25;
}

function selectPass(sim, carrier, predicate = () => true) {
  const all = teamPlayers(sim, carrier.teamId).filter(player => player.id !== carrier.id && player.position !== 'GK' && isOnside(sim, player) && predicate(player));
  const dir = direction(sim, carrier.teamId);
  const finalThird = inFinalThird(sim, carrier);
  const progressive = finalThird ? all.filter(player => (player.y - carrier.y) * dir >= -2 && !DEFENDERS.has(player.position)) : all;
  const pool = progressive.length ? progressive : all;
  const candidates = pool.filter(player => distance(carrier, player) <= (sim.sequence % 7 === 6 ? 58 : 34));
  if (!candidates.length && pool.length) return [...pool].sort((a, b) => distance(a, carrier) - distance(b, carrier))[0];
  if (!candidates.length) return closest(teamPlayers(sim, carrier.teamId), carrier, player => player.id !== carrier.id);
  const ranked = candidates.map(player => ({ player, score: candidateScore(sim, carrier, player) })).sort((a, b) => b.score - a.score);
  return ranked[Math.min(ranked.length - 1, sim.sequence % 4 === 3 ? 1 : 0)].player;
}

function startFlight(sim, kind, from, { to = null, end = null, duration, curve = 0, action, meta = {} }) {
  sim.ball.ownerId = null;
  sim.ball.flight = {
    kind, fromId: from?.id ?? null, toId: to?.id ?? null, startX: sim.ball.x, startY: sim.ball.y,
    endX: end?.x, endY: end?.y, elapsed: 0, duration, curve, ...meta,
  };
  sim.action = action; sim.sequence++; sim.sequenceSinceRestart++; sim.nextActionAt = Number.POSITIVE_INFINITY;
}

function startPass(sim, from, to, action = 'PASSING MOVE', kind = 'pass') {
  const dist = distance(from, to);
  const curveSign = hash(`${sim.sequence}:${from.id}:${to.id}`) % 2 ? 1 : -1;
  startFlight(sim, kind, from, { to, duration:clamp(260 + dist * 11, 340, 720), curve:curveSign * Math.min(3.2, dist * .08), action });
}

function startGoalShot(sim, scorer) {
  startFlight(sim, 'goal-shot', scorer, {
    end:{ x:50, y:attackingGoalY(sim, scorer.teamId) }, duration:430,
    curve:(hash(scorer.id) % 2 ? 1 : -1) * 1.4, action:'SHOT · ON GOAL',
    meta:{ scoringTeamId:scorer.teamId },
  });
  sim.ball.shooting = true; sim.pendingGoal.stage = 'shooting';
}

function startOpenPlayOutcome(sim, carrier) {
  const attackingTeamId = carrier.teamId; const defendingTeamId = otherTeamId(sim, attackingTeamId);
  const goalY = attackingGoalY(sim, attackingTeamId);
  const closeRange = inPenaltyArea(sim, carrier);
  let outcome = (closeRange ? ['save', 'corner', 'save', 'foul'] : ['save', 'corner', 'wide', 'foul'])[sim.outcomeIndex++ % 4];
  const blocker = closest(opponentPlayers(sim, attackingTeamId), carrier, player => player.position !== 'GK');
  if (outcome === 'corner' && (!blocker || distance(blocker, carrier) > 9)) outcome = 'save';
  if (outcome === 'foul') {
    beginRestart(sim, 'free-kick', attackingTeamId, { x:sim.ball.x, y:sim.ball.y }, 'FOUL WON'); return;
  }
  if (outcome === 'save') {
    const keeper = teamPlayers(sim, defendingTeamId).find(player => player.position === 'GK');
    startFlight(sim, 'save', carrier, { to:keeper, duration:420, curve:(carrier.x < 50 ? 1 : -1) * 1.2, action:'SHOT · SAVED', meta:{ restartTeamId:defendingTeamId } });
    sim.ball.shooting = true; return;
  }
  if (outcome === 'wide') {
    const sideX = carrier.x < 50 ? 31 : 69;
    startFlight(sim, 'shot-wide', carrier, { end:{ x:sideX, y:goalY }, duration:450, curve:(sideX < 50 ? -1 : 1) * 2, action:'SHOT · WIDE', meta:{ restartTeamId:defendingTeamId } });
    sim.ball.shooting = true; return;
  }
  const sideX = carrier.x < 50 ? 3 : 97;
  blocker.targetX = carrier.x + (50 - carrier.x) * .12;
  blocker.targetY = carrier.y + direction(sim, attackingTeamId) * 2;
  blocker.pressing = true;
  startFlight(sim, 'blocked-corner', carrier, { end:{ x:sideX, y:goalY }, duration:420, curve:(sideX < 50 ? -1 : 1) * 2.5, action:'SHOT BLOCKED · DEFLECTION', meta:{ restartTeamId:attackingTeamId } });
  sim.ball.shooting = true;
}

function tryPressuredThrowIn(sim, carrier) {
  if (carrier.x > 10 && carrier.x < 90) return false;
  const defender = closest(opponentPlayers(sim, carrier.teamId), carrier, player => player.position !== 'GK');
  if (!defender || distance(defender, carrier) > 6) return false;
  const sideX = carrier.x < 50 ? 3 : 97;
  const dir = direction(sim, carrier.teamId);
  startFlight(sim, 'throw-out', defender, {
    end:{ x:sideX, y:clamp(carrier.y + dir * 5, 10, 90) }, duration:340,
    action:'TACKLE · DEFLECTED OUT', meta:{ restartTeamId:carrier.teamId },
  });
  return true;
}

function beginTurnover(sim) {
  const oldCarrier = sim.players.find(player => player.id === sim.ball.ownerId) ?? { x: sim.ball.x, y: sim.ball.y };
  const winner = closest(teamPlayers(sim, sim.desiredPossessionTeamId), oldCarrier, player => player.position !== 'GK');
  sim.possessionTeamId = sim.desiredPossessionTeamId;
  startFlight(sim, 'turnover', oldCarrier, { to:winner, duration:280, action:'TACKLE WON · TURNOVER' });
}

function restartReceiver(sim, restart, taker) {
  const side = teamPlayers(sim, restart.teamId).filter(player => player.id !== taker.id);
  if (restart.type === 'corner') {
    return closest(side, { x:50, y:direction(sim, restart.teamId) < 0 ? 15 : 85 }, player => player.position !== 'GK');
  }
  if (restart.type === 'free-kick') {
    return closest(side, { x:50, y:direction(sim, restart.teamId) < 0 ? 15 : 85 }, player => player.position !== 'GK' && isOnside(sim, player, restart.teamId));
  }
  if (restart.type === 'goal-kick') return closest(side, taker, player => DEFENDERS.has(player.position));
  return closest(side, restart.spot, player => player.position !== 'GK');
}

function cornerReady(sim, restart) {
  const dir = direction(sim, restart.teamId);
  const inBox = player => player.x >= 22 && player.x <= 78 && (dir < 0 ? player.y <= 24 : player.y >= 76);
  const attackers = teamPlayers(sim, restart.teamId).filter(player => player.id !== restart.takerId && player.position !== 'GK');
  const defenders = opponentPlayers(sim, restart.teamId).filter(player => player.position !== 'GK');
  const attackingReady = attackers.filter(inBox).length >= Math.ceil(attackers.length * .6);
  const defendingReady = defenders.filter(inBox).length >= Math.ceil(defenders.length * .5);
  return sim.clock - restart.startedAt >= 1200 && attackingReady && defendingReady;
}

function freeKickPlan(sim, restart) {
  const goalDistance = Math.abs(restart.spot.y - attackingGoalY(sim, restart.teamId));
  if (goalDistance <= 30 && restart.spot.x >= 25 && restart.spot.x <= 75) return 'shot';
  if (goalDistance <= 52) return 'cross';
  return 'pass';
}

function freeKickReady(sim, restart) {
  const dir = direction(sim, restart.teamId);
  const plan = freeKickPlan(sim, restart);
  const wallSize = plan === 'shot' ? 4 : plan === 'cross' ? 3 : 2;
  const wallY = restart.spot.y + dir * 9;
  const defenders = opponentPlayers(sim, restart.teamId).filter(player => player.position !== 'GK').slice(0, wallSize);
  const wallReady = defenders.every((player, index) => distance(player, {
    x:50 + (index - (wallSize - 1) / 2) * 4, y:wallY,
  }) <= 4);
  if (sim.clock - restart.startedAt < 1000 || !wallReady) return false;
  if (plan !== 'cross') return true;
  const attackers = teamPlayers(sim, restart.teamId).filter(player => player.id !== restart.takerId && player.position !== 'GK');
  const inBox = player => player.x >= 22 && player.x <= 78 && (dir < 0 ? player.y <= 25 : player.y >= 75);
  return attackers.filter(inBox).length >= 5;
}

function startFreeKickShot(sim, taker) {
  const defendingTeamId = otherTeamId(sim, taker.teamId);
  const keeper = teamPlayers(sim, defendingTeamId).find(player => player.position === 'GK');
  const outcome = ['save', 'corner', 'wide'][sim.outcomeIndex++ % 3];
  if (outcome === 'save') {
    startFlight(sim, 'save', taker, { to:keeper, duration:520, curve:(taker.x < 50 ? 1 : -1) * 2.4, action:'FREE KICK · ON TARGET', meta:{ restartTeamId:defendingTeamId } });
  } else if (outcome === 'wide') {
    startFlight(sim, 'shot-wide', taker, { end:{ x:taker.x < 50 ? 31 : 69, y:attackingGoalY(sim, taker.teamId) }, duration:540, curve:(taker.x < 50 ? -1 : 1) * 3, action:'FREE KICK · JUST WIDE', meta:{ restartTeamId:defendingTeamId } });
  } else {
    startFlight(sim, 'blocked-corner', taker, { end:{ x:taker.x < 50 ? 3 : 97, y:attackingGoalY(sim, taker.teamId) }, duration:480, curve:(taker.x < 50 ? -1 : 1) * 2, action:'FREE KICK · WALL BLOCKS', meta:{ restartTeamId:taker.teamId } });
  }
  sim.ball.shooting = true;
}

function decide(sim) {
  if (sim.mode === 'goal' || sim.mode === 'half-time') return;
  if (sim.mode === 'kickoff') {
    const kicker = sim.players.find(player => player.id === sim.kickoffKickerId);
    const support = closest(teamPlayers(sim, sim.possessionTeamId), kicker, player => player.id !== kicker.id && player.position !== 'GK');
    startPass(sim, kicker, support, sim.halftimeCompleted ? 'SECOND HALF · PLAYED BACK' : 'KICK OFF · PLAYED BACK');
    sim.mode = 'live'; return;
  }
  if (sim.mode === 'restart') {
    const taker = sim.players.find(player => player.id === sim.restart.takerId);
    if (distance(taker, sim.restart.spot) > 2.2) {
      sim.action = `${sim.restart.type.toUpperCase()} · WAITING FOR THE WHISTLE`; sim.nextActionAt = sim.clock + 180; return;
    }
    if (sim.restart.type === 'corner' && !cornerReady(sim, sim.restart)) {
      sim.action = 'CORNER · PLAYERS MOVING INTO THE BOX'; sim.nextActionAt = sim.clock + 180; return;
    }
    if (sim.restart.type === 'free-kick' && !freeKickReady(sim, sim.restart)) {
      sim.action = 'FREE KICK · WALL AND RUNNERS SETTING'; sim.nextActionAt = sim.clock + 180; return;
    }
    Object.assign(sim.ball, { ownerId:taker.id, x:sim.restart.spot.x, y:sim.restart.spot.y });
    const restart = sim.restart;
    if (!sim.ledgerDriven && restart.type === 'free-kick' && freeKickPlan(sim, restart) === 'shot') {
      startFreeKickShot(sim, taker);
      sim.restart = null; sim.mode = 'live'; return;
    }
    const receiver = restartReceiver(sim, sim.restart, taker);
    const action = sim.restart.type === 'corner' ? 'CORNER · CROSS INTO THE BOX'
      : sim.restart.type === 'free-kick' && freeKickPlan(sim, sim.restart) === 'cross' ? 'FREE KICK · CROSS INTO THE BOX'
      : sim.restart.type === 'free-kick' ? 'FREE KICK · PLAYED ONSIDE'
      : sim.restart.type === 'goal-kick' ? 'GOAL KICK · PLAYED SHORT'
      : 'THROW-IN · BACK IN PLAY';
    const restartKind = sim.restart.type === 'corner' || (sim.restart.type === 'free-kick' && freeKickPlan(sim, sim.restart) === 'cross') ? 'cross' : 'pass';
    startPass(sim, taker, receiver, action, restartKind);
    sim.restart = null; sim.mode = 'live';
    if (sim.activePhase) sim.activePhase.stage = 'settle';
    return;
  }
  const carrier = sim.players.find(player => player.id === sim.ball.ownerId);
  if (!carrier) return;
  if (sim.ledgerDriven) { decideLedgerPhase(sim, carrier); return; }
  if (sim.pendingGoal) {
    const scorer = sim.players.find(player => player.id === sim.pendingGoal.playerId) ?? carrier;
    const ready = inFinalThird(sim, scorer) && isOnside(sim, scorer);
    if (scorer.id === carrier.id && inFinalThird(sim, scorer)) { startGoalShot(sim, scorer); return; }
    if (ready) { startPass(sim, carrier, scorer, `CHANCE · ${sim.pendingGoal.playerName}`); sim.pendingGoal.stage = 'receiving'; return; }
    if (!isOnside(sim, scorer)) { sim.action = 'ATTACKER CHECKS THE RUN'; sim.nextActionAt = sim.clock + 160; return; }
    startPass(sim, carrier, selectPass(sim, carrier, player => player.id !== scorer.id), 'BUILDING THE ATTACK'); return;
  }
  if (carrier.position === 'GK') {
    const receiver = closest(teamPlayers(sim, carrier.teamId), carrier, player => DEFENDERS.has(player.position));
    startPass(sim, carrier, receiver, 'GOALKEEPER · SAFE DISTRIBUTION', 'keeper-distribution'); return;
  }
  if (sim.desiredPossessionTeamId !== sim.possessionTeamId) { beginTurnover(sim); return; }
  if (tryPressuredThrowIn(sim, carrier)) return;
  if (hasShootingLane(sim, carrier)) { startOpenPlayOutcome(sim, carrier); return; }
  if (inFinalThird(sim, carrier) && sim.sequenceSinceRestart >= 4) { startOpenPlayOutcome(sim, carrier); return; }
  const receiver = selectPass(sim, carrier);
  startPass(sim, carrier, receiver, distance(carrier, receiver) > 42 ? 'SWITCHING PLAY' : FORWARDS.has(receiver.position) ? 'PROGRESSIVE PASS' : 'PASSING TRIANGLE');
}

function completeFlight(sim, flight, receiver) {
  sim.ball.flight = null; sim.ball.shooting = false;
  if (flight.kind === 'goal-shot') {
    sim.action = 'GOAL'; sim.mode = 'goal'; sim.goalHoldUntil = sim.clock + 1500; return;
  }
  if (flight.kind === 'shot-wide') {
    const teamId = flight.restartTeamId;
    beginRestart(sim, 'goal-kick', teamId, { x:50, y:direction(sim, teamId) < 0 ? 92 : 8 }, 'SHOT WIDE'); return;
  }
  if (flight.kind === 'blocked-corner') {
    beginRestart(sim, 'corner', flight.restartTeamId, { x:flight.endX, y:flight.endY }, 'DEFLECTED BEHIND'); return;
  }
  if (flight.kind === 'throw-out') {
    beginRestart(sim, 'throw-in', flight.restartTeamId, { x:flight.endX, y:flight.endY }, 'BALL OUT OF PLAY'); return;
  }
  if (!receiver) return;
  sim.ball.ownerId = receiver.id; sim.possessionTeamId = receiver.teamId;
  sim.nextActionAt = sim.clock + (flight.kind === 'save' ? 780 : 360 + (hash(`${sim.sequence}:${receiver.id}`) % 260));
  if (flight.kind === 'save') {
    sim.action = 'GOALKEEPER SAVES · LOOKING TO DISTRIBUTE';
    sim.desiredPossessionTeamId = receiver.teamId;
    sim.possessionLockTeamId = receiver.teamId;
    sim.possessionLockUntil = sim.clock + 1800;
  } else if (flight.kind === 'keeper-distribution') {
    sim.action = 'GOALKEEPER · BUILDING FROM THE BACK';
    sim.desiredPossessionTeamId = receiver.teamId;
    sim.possessionLockTeamId = receiver.teamId;
    sim.possessionLockUntil = sim.clock + 900;
  }
  if (sim.pendingGoal?.stage === 'receiving') sim.nextActionAt = sim.clock + 180;
}

function advanceBall(sim, elapsedMs) {
  const flight = sim.ball.flight;
  if (!flight) {
    if (sim.mode === 'kickoff') { sim.ball.x = 50; sim.ball.y = 50; return; }
    const owner = sim.players.find(player => player.id === sim.ball.ownerId);
    if (owner) {
      const speed = Math.hypot(owner.vx, owner.vy);
      sim.ball.x = owner.x + (speed > .1 ? owner.vx / speed : 0) * .65;
      sim.ball.y = owner.y + (speed > .1 ? owner.vy / speed : direction(sim, owner.teamId)) * .65;
    }
    return;
  }
  flight.elapsed += elapsedMs;
  const t = clamp(flight.elapsed / flight.duration, 0, 1);
  const receiver = flight.toId && sim.players.find(player => player.id === flight.toId);
  const endX = receiver ? receiver.x + receiver.vx * .04 : flight.endX;
  const endY = receiver ? receiver.y + receiver.vy * .04 : flight.endY;
  const dx = endX - flight.startX; const dy = endY - flight.startY; const length = Math.max(1, Math.hypot(dx, dy));
  const curveX = (-dy / length) * Math.sin(Math.PI * t) * flight.curve;
  const curveY = (dx / length) * Math.sin(Math.PI * t) * flight.curve;
  sim.ball.x = clamp(flight.startX + dx * t + curveX); sim.ball.y = clamp(flight.startY + dy * t + curveY);
  if (t >= 1) completeFlight(sim, flight, receiver);
}

function maxSpeed(player) {
  if (player.position === 'GK') return player.rushing ? 8 : 4.5;
  if (player.receiving || player.pressing) return 11.5;
  if (FORWARDS.has(player.position)) return 10;
  return 8.5;
}

function steer(player, dt) {
  const dx = player.targetX - player.x; const dy = player.targetY - player.y; const dist = Math.hypot(dx, dy);
  const speed = maxSpeed(player) * (.82 + clamp(player.pace ?? 65, 1, 99) / 300) * Math.min(1, dist / 5);
  const desiredX = dist > .001 ? dx / dist * speed : 0; const desiredY = dist > .001 ? dy / dist * speed : 0;
  const blend = Math.min(1, dt * (player.pressing || player.receiving ? 4.2 : 3.2));
  player.vx += (desiredX - player.vx) * blend; player.vy += (desiredY - player.vy) * blend;
}

function separate(sim, dt) {
  for (let i = 0; i < sim.players.length; i++) for (let j = i + 1; j < sim.players.length; j++) {
    const a = sim.players[i]; const b = sim.players[j]; const dx = a.x - b.x; const dy = a.y - b.y;
    const dist = Math.hypot(dx, dy); const minimum = a.pressing || b.pressing ? 2.7 : 3.6;
    if (dist >= minimum) continue;
    const nx = dist > .001 ? dx / dist : (i % 2 ? 1 : -1); const ny = dist > .001 ? dy / dist : (j % 2 ? .25 : -.25); const force = (minimum - dist) * 8;
    a.vx += nx * force * dt; a.vy += ny * force * dt; b.vx -= nx * force * dt; b.vy -= ny * force * dt;
  }
}

export function advanceBroadcastSimulation(sim, elapsedMs) {
  const safeElapsed = clamp(elapsedMs, 0, 50); const dt = safeElapsed / 1000; sim.clock += safeElapsed;
  if (sim.possessionLockTeamId && sim.clock >= sim.possessionLockUntil) {
    sim.possessionLockTeamId = null;
    sim.desiredPossessionTeamId = sim.enginePossessionTeamId;
  }
  if (sim.mode === 'goal' && sim.clock >= sim.goalHoldUntil) {
    const scoringTeam = sim.pendingGoal?.teamId ?? sim.possessionTeamId;
    sim.pendingGoal = null;
    if (sim.halftimePending) beginHalfTime(sim);
    else prepareKickoff(sim, otherTeamId(sim, scoringTeam));
  }
  if (sim.mode === 'half-time' && sim.clock >= sim.halftimeHoldUntil) {
    sim.endsSwapped = true; sim.halftimeCompleted = true;
    for (const player of sim.players) player.baseY = 100 - player.baseY;
    prepareKickoff(sim, otherTeamId(sim, sim.firstKickoffTeamId));
  }
  if (sim.mode === 'kickoff') updateKickoffTargets(sim);
  else if (sim.mode === 'restart') updateRestartTargets(sim);
  else if (sim.mode === 'live') {
    updateLiveTargets(sim);
    if (sim.ledgerDriven) updateLedgerTargets(sim);
  }
  if (!sim.ball.flight && sim.clock >= sim.nextActionAt) decide(sim);
  for (const player of sim.players) steer(player, dt);
  separate(sim, dt);
  for (const player of sim.players) { player.x = clamp(player.x + player.vx * dt); player.y = clamp(player.y + player.vy * dt); }
  advanceBall(sim, safeElapsed);
  return snapshotBroadcastSimulation(sim);
}

export function snapshotBroadcastSimulation(sim) {
  return {
    phaseLabel: sim.phaseLabel, completedPhase: sim.completedPhase,
    carrierName: sim.players.find(player => player.id === sim.ball.ownerId)?.name ?? '',
    action: sim.action, mode:sim.mode, half:sim.halftimeCompleted ? 2 : 1,
    markers: sim.players.map(player => ({ id: player.id, name: player.name ?? player.id, pace: player.attributeProfile?.pace ?? 65, shirt: player.shirt, position: player.position, team: player.team, owner: sim.ball.ownerId === player.id, moving: Math.hypot(player.vx, player.vy) > 1, facing: Math.atan2(player.vx, -player.vy) * 180 / Math.PI, x: player.x, y: player.y, pressing: player.pressing, receiving: player.receiving, rushing: player.rushing })),
    ball: { x: sim.ball.x, y: sim.ball.y, shooting: sim.ball.shooting },
  };
}


const ROUTE_LABELS = {
  circulation: 'Build up · retain possession', direct_pass: 'Progression · direct ball',
  pass_into_space: 'Penetration · run in behind', carry: 'Progression · carry forward',
  wide_delivery: 'Wide attack · delivery', aerial_duel: 'Direct play · aerial contest',
};

export function isBroadcastReady(sim) {
  return !!sim && !sim.activePhase && !sim.ball.flight && !sim.pendingGoal
    && !sim.restart && sim.mode === 'live';
}

function ledgerPlayer(sim, id) { return sim.players.find(player => player.id === id); }
function finishLedgerPhase(sim) {
  sim.completedPhase = sim.activePhase.record.phase;
  sim.activePhase = null;
  if (sim.pendingLineups) {
    const lineups = sim.pendingLineups;
    sim.pendingLineups = null;
    replaceBroadcastLineups(sim, lineups);
  }
  sim.nextActionAt = sim.clock + 250;
  if (sim.halftimePending && !sim.pendingGoal && sim.mode === 'live') beginHalfTime(sim);
}

function updateLedgerTargets(sim) {
  const scene = sim.activePhase;
  if (!scene) return;
  const r = scene.record;
  const actor = ledgerPlayer(sim, r.actorId);
  const runner = ledgerPlayer(sim, r.targetId);
  const defender = ledgerPlayer(sim, r.defenderId);
  const dir = direction(sim, r.teamId);
  const carrier = ledgerPlayer(sim, sim.ball.ownerId);
  if (scene.stage === 'acquire' && actor) {
    actor.targetX = clamp(sim.ball.x + (actor.baseX < 50 ? -8 : 8), 9, 91);
    actor.targetY = clamp(sim.ball.y - dir * 4, 12, 88);
    actor.receiving = true;
    if (carrier && carrier.teamId !== r.teamId) {
      actor.targetX = carrier.x; actor.targetY = carrier.y; actor.pressing = true;
      carrier.targetX = carrier.x; carrier.targetY = carrier.y;
    }
  }
  if (scene.stage === 'route' && carrier) {
    if (r.route === 'wide_delivery') {
      carrier.targetX = carrier.baseX < 50 ? 10 : 90;
      carrier.targetY = dir < 0 ? 26 : 74;
    } else if (r.route !== 'circulation') {
      carrier.targetY = clamp(carrier.y + dir * 12, 15, 85);
    }
    if (runner && runner.id !== carrier.id) {
      runner.targetX = r.route === 'wide_delivery' ? 50 : clamp(carrier.x + (runner.baseX < 50 ? -12 : 12), 18, 82);
      const y = carrier.y + dir * (r.route === 'circulation' ? -5 : 14);
      const line = offsideLine(sim, r.teamId);
      runner.targetY = clamp(dir < 0 ? Math.max(y, line) : Math.min(y, line), 12, 88);
      runner.receiving = true;
    }
  }
  if (scene.stage === 'chance') {
    const shooter = ledgerPlayer(sim, r.shotId);
    if (shooter) {
      const line = offsideLine(sim, r.teamId);
      const y = dir < 0 ? 20 : 80;
      shooter.targetX = 50 + (shooter.baseX - 50) * .25;
      shooter.targetY = shooter.id === carrier?.id ? y : dir < 0 ? Math.max(y, line) : Math.min(y, line);
      shooter.receiving = true;
      if (carrier && carrier.id !== shooter.id) carrier.targetY = clamp(carrier.y + dir * 10, 18, 82);
    }
  }
  if (defender && carrier && ['route', 'contest'].includes(scene.stage)) {
    defender.targetX = carrier.x + 1.5;
    defender.targetY = carrier.y + dir * 2;
    defender.pressing = true;
    if (scene.stage === 'contest') { carrier.targetX = carrier.x; carrier.targetY = carrier.y; }
  }
}

function decideLedgerPhase(sim, carrier) {
  const scene = sim.activePhase;
  if (!scene) { sim.action = 'TEAMS RESETTING'; sim.nextActionAt = sim.clock + 250; return; }
  const r = scene.record;
  const actor = ledgerPlayer(sim, r.actorId) ?? closest(teamPlayers(sim, r.teamId), carrier, p => p.position !== 'GK');
  const runner = ledgerPlayer(sim, r.targetId) ?? actor;
  const defender = ledgerPlayer(sim, r.defenderId) ?? closest(opponentPlayers(sim, r.teamId), carrier, p => p.position !== 'GK');
  if (scene.stage === 'acquire') {
    if (carrier.teamId !== r.teamId) {
      actor.targetX = carrier.x; actor.targetY = carrier.y; actor.pressing = true;
      if (distance(actor, carrier) > 5) {
        carrier.targetX = carrier.x; carrier.targetY = carrier.y;
        sim.action = 'TRANSITION · CLOSING DOWN'; sim.nextActionAt = sim.clock + 120; return;
      }
      startFlight(sim, 'turnover', carrier, { to:actor, duration:320, action:'TRANSITION · POSSESSION WON' }); return;
    }
    if (carrier.id !== actor.id) {
      if (!isOnside(sim, actor)) { sim.nextActionAt = sim.clock + 120; return; }
      startPass(sim, carrier, actor, 'BUILD UP · FINDING THE PASSER'); return;
    }
    scene.stage = 'route'; scene.routeAt = sim.clock;
    sim.action = ROUTE_LABELS[r.route] ?? 'BUILDING THE ATTACK'; sim.nextActionAt = sim.clock + 850; return;
  }
  if (scene.stage === 'route') {
    if (r.route === 'wide_delivery' && (Math.abs(carrier.x - 50) < 32 || !inFinalThird(sim, carrier))) {
      sim.action = 'WIDE ATTACK · OVERLAPPING RUN'; sim.nextActionAt = sim.clock + 160; return;
    }
    if (r.route === 'carry' && sim.clock - scene.routeAt < 1500) {
      sim.action = 'CARRY · DRIVING AT THE DEFENCE'; sim.nextActionAt = sim.clock + 160; return;
    }
    scene.stage = 'contest';
    if (r.route !== 'carry' && runner.id !== carrier.id) {
      if (!isOnside(sim, runner)) { scene.stage = 'route'; sim.nextActionAt = sim.clock + 120; return; }
      startPass(sim, carrier, runner, ROUTE_LABELS[r.route], ['wide_delivery', 'aerial_duel'].includes(r.route) ? 'cross' : 'pass'); return;
    }
  }
  if (scene.stage === 'contest') {
    if (['turnover', 'intercepted'].includes(r.outcome)) {
      if (distance(defender, carrier) > 5) { sim.action = 'CONTEST · DEFENDER ENGAGING'; sim.nextActionAt = sim.clock + 120; return; }
      scene.stage = 'settle';
      startFlight(sim, 'turnover', carrier, { to:defender, duration:320, action:r.outcome === 'intercepted' ? 'INTERCEPTION · PASS CUT OUT' : 'TACKLE · POSSESSION LOST' }); return;
    }
    if (r.outcome === 'foul_won') {
      if (distance(defender, carrier) > 5) { sim.action = 'CONTEST · DEFENDER ENGAGING'; sim.nextActionAt = sim.clock + 120; return; }
      scene.stage = 'restart'; beginRestart(sim, 'free-kick', r.teamId, sim.ball, 'FOUL WON'); return;
    }
    if (r.outcome === 'corner_won') {
      if (distance(defender, carrier) > 6) { sim.action = 'DELIVERY · DEFENDER CLOSING'; sim.nextActionAt = sim.clock + 120; return; }
      scene.stage = 'restart';
      startFlight(sim, 'blocked-corner', carrier, { end:{ x:carrier.x < 50 ? 3 : 97, y:attackingGoalY(sim, r.teamId) }, duration:550, action:'CROSS BLOCKED · CORNER', meta:{ restartTeamId:r.teamId } }); return;
    }
    if (r.shotId) scene.stage = 'chance';
    else { sim.action = r.outcome === 'retain' ? 'POSSESSION RETAINED' : 'PROGRESSION · LINE BROKEN'; finishLedgerPhase(sim); return; }
  }
  if (scene.stage === 'chance') {
    const shooter = ledgerPlayer(sim, r.shotId) ?? actor;
    if (carrier.id !== shooter.id) {
      if (!isOnside(sim, shooter) || !inFinalThird(sim, shooter)) {
        sim.action = 'CHANCE · RUNNER FINDING SPACE'; sim.nextActionAt = sim.clock + 120; return;
      }
      startPass(sim, carrier, shooter, 'CHANCE · FINAL BALL'); return;
    }
    if (!inFinalThird(sim, shooter) || Math.abs(shooter.x - 50) > 25) {
      sim.action = 'CHANCE · ATTACKING THE BOX'; sim.nextActionAt = sim.clock + 120; return;
    }
    scene.stage = 'settle';
    if (r.finish === 'goal') { startGoalShot(sim, shooter); return; }
    if (r.finish === 'saved') {
      const keeper = opponentPlayers(sim, r.teamId).find(p => p.position === 'GK');
      startFlight(sim, 'save', shooter, { to:keeper, duration:500, action:'SHOT · SAVED', meta:{ restartTeamId:r.opponentTeamId } });
    } else if (r.finish === 'missed') {
      scene.stage = 'restart';
      startFlight(sim, 'shot-wide', shooter, { end:{ x:shooter.x < 50 ? 35 : 65, y:attackingGoalY(sim, r.teamId) }, duration:500, action:'SHOT · WIDE', meta:{ restartTeamId:r.opponentTeamId } });
    } else if (r.cornerWon) {
      scene.stage = 'restart';
      startFlight(sim, 'blocked-corner', shooter, { end:{ x:shooter.x < 50 ? 3 : 97, y:attackingGoalY(sim, r.teamId) }, duration:500, action:'SHOT BLOCKED · CORNER', meta:{ restartTeamId:r.teamId } });
    } else {
      startFlight(sim, 'turnover', shooter, { to:defender, duration:350, action:'SHOT · BLOCKED' });
    }
    sim.ball.shooting = true; return;
  }
  if (scene.stage === 'settle') {
    if (carrier.position === 'GK') {
      const receiver = closest(teamPlayers(sim, carrier.teamId), carrier, p => DEFENDERS.has(p.position));
      startPass(sim, carrier, receiver, 'GOALKEEPER · BUILDING FROM THE BACK', 'keeper-distribution'); return;
    }
    finishLedgerPhase(sim);
  }
}
