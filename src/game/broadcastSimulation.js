import { SLOT_LAYOUT, SLOT_POS_MAP } from './formationLayout.js';

const FORWARDS = new Set(['ST', 'CF', 'RW', 'LW', 'CAM']);
const DEFENDERS = new Set(['CB', 'RB', 'LB']);
const WIDE = new Set(['RB', 'LB', 'RW', 'LW', 'RM', 'LM']);

function clamp(value, min = 3, max = 97) { return Math.max(min, Math.min(max, value)); }
function hash(value) { let h = 2166136261; for (const c of String(value)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function direction(sim, teamId) { return teamId === sim.homeTeamId ? -1 : 1; }
function teamPlayers(sim, teamId) { return sim.players.filter(player => player.teamId === teamId); }
function opponentPlayers(sim, teamId) { return sim.players.filter(player => player.teamId !== teamId); }

function assign(players, formation, home, teamId) {
  const slots = SLOT_LAYOUT[formation] ?? SLOT_LAYOUT['4-3-3'];
  const remaining = [...players];
  return slots.map((slot, shirt) => {
    const accepted = SLOT_POS_MAP[slot.p] ?? [slot.p];
    const index = remaining.findIndex(player => accepted.includes(player.position));
    const player = remaining.splice(index >= 0 ? index : 0, 1)[0];
    if (!player) return null;
    return {
      id: player.id, shirt: shirt + 1, position: player.position, teamId,
      team: home ? 'home' : 'away', baseX: slot.x, baseY: home ? slot.y : 100 - slot.y,
      x: slot.x, y: home ? slot.y : 100 - slot.y, targetX: slot.x,
      targetY: home ? slot.y : 100 - slot.y, vx: 0, vy: 0,
    };
  }).filter(Boolean);
}

function kickoffPoint(player, takingTeamId, homeTeamId, kickerId) {
  const home = player.teamId === homeTeamId;
  if (player.id === kickerId) return { x: 50, y: 50 };
  if (player.position === 'GK') return { x: 50, y: home ? 91 : 9 };
  if (DEFENDERS.has(player.position)) return { x: player.baseX, y: home ? 76 : 24 };
  if (FORWARDS.has(player.position)) {
    const taking = player.teamId === takingTeamId;
    return { x: player.baseX, y: home ? (taking ? 58 : 60) : (taking ? 42 : 40) };
  }
  return { x: player.baseX, y: home ? 64 : 36 };
}

function closest(players, point, predicate = () => true) {
  return players.filter(predicate).sort((a, b) => distance(a, point) - distance(b, point))[0] ?? null;
}

function kickoffSupport(sim, teamId, kickerId) {
  const kicker = sim.players.find(player => player.id === kickerId);
  return closest(teamPlayers(sim, teamId), kicker, player => player.id !== kickerId && player.position !== 'GK');
}

function prepareKickoff(sim, takingTeamId) {
  const side = teamPlayers(sim, takingTeamId);
  const kicker = closest(side, { x: 50, y: 50 }, player => FORWARDS.has(player.position))
    ?? closest(side, { x: 50, y: 50 }, player => player.position !== 'GK');
  for (const player of sim.players) {
    const point = kickoffPoint(player, takingTeamId, sim.homeTeamId, kicker.id);
    player.x = point.x; player.y = point.y; player.targetX = point.x; player.targetY = point.y;
    player.vx = 0; player.vy = 0; player.pressing = false; player.receiving = false; player.rushing = false;
  }
  sim.possessionTeamId = takingTeamId;
  sim.desiredPossessionTeamId = takingTeamId;
  sim.ball = { x: 50, y: 50, ownerId: kicker.id, flight: null, shooting: false };
  sim.mode = 'kickoff'; sim.action = 'KICK OFF · TEAMS SET'; sim.nextActionAt = sim.clock + 650;
  sim.kickoffKickerId = kicker.id;
}

export function createBroadcastSimulation({ homeTeamId, awayTeamId, possessionTeamId, homeFormation, awayFormation, homePlayers, awayPlayers }) {
  const sim = {
    homeTeamId, awayTeamId, possessionTeamId, desiredPossessionTeamId: possessionTeamId,
    players: [...assign(homePlayers, homeFormation, true, homeTeamId), ...assign(awayPlayers, awayFormation, false, awayTeamId)],
    ball: null, clock: 0, sequence: 0, nextActionAt: 0, mode: 'kickoff', action: 'KICK OFF',
    pendingGoal: null, goalHoldUntil: 0, restart: null, restartKey: null, kickoffKickerId: null,
  };
  prepareKickoff(sim, possessionTeamId);
  return sim;
}

export function derivedRestart(phase) {
  if (!phase || phase % 13 !== 0) return null;
  const types = ['throw-in', 'free-kick', 'corner', 'goal-kick'];
  return { type: types[Math.floor(phase / 13) % types.length], variant: Math.floor(phase / 13), key: phase };
}

export function updateBroadcastSimulation(sim, { phase, possessionTeamId, event = null, restart = null }) {
  sim.desiredPossessionTeamId = possessionTeamId;
  if (event?.type === 'goal' && sim.pendingGoal?.key !== `${event.minute}:${event.playerId}`) {
    sim.pendingGoal = { ...event, key: `${event.minute}:${event.playerId}`, stage: 'create' };
    sim.restart = null;
    sim.nextActionAt = Math.min(sim.nextActionAt, sim.clock + 120);
  } else if (restart && !sim.pendingGoal && sim.restartKey !== restart.key) {
    sim.restartKey = restart.key;
    beginRestart(sim, restart, possessionTeamId);
  }
  sim.phase = phase;
  return sim;
}

export function replaceBroadcastLineups(sim, { homeFormation, awayFormation, homePlayers, awayPlayers }) {
  const fresh = [
    ...assign(homePlayers, homeFormation, true, sim.homeTeamId),
    ...assign(awayPlayers, awayFormation, false, sim.awayTeamId),
  ];
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
  if (dir < 0) return Math.min(sim.ball.y, secondLast) + 1.5;
  return Math.max(sim.ball.y, secondLast) - 1.5;
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
  const home = player.teamId === sim.homeTeamId;
  const ownPossession = player.teamId === sim.possessionTeamId;
  const danger = home ? sim.ball.y > 72 : sim.ball.y < 28;
  player.targetX = clamp(50 + (sim.ball.x - 50) * (danger ? .28 : .08), 38, 62);
  if (home) player.targetY = clamp(ownPossession ? 86 : (danger ? 82 - (sim.ball.y - 72) * .28 : 90), 76, 93);
  else player.targetY = clamp(ownPossession ? 14 : (danger ? 18 + (28 - sim.ball.y) * .28 : 10), 7, 24);
  player.rushing = danger && !ownPossession;
}

function updateLiveTargets(sim) {
  const carrier = sim.players.find(player => player.id === sim.ball.ownerId);
  const attack = teamPlayers(sim, sim.possessionTeamId);
  const defence = opponentPlayers(sim, sim.possessionTeamId);
  for (const player of sim.players) {
    player.pressing = false; player.receiving = sim.ball.flight?.toId === player.id; player.rushing = false;
    if (player.position === 'GK') { setGoalkeeperTarget(sim, player); continue; }
    const target = roleTarget(sim, player); player.targetX = target.x; player.targetY = target.y;
  }
  if (!carrier) return;
  const dir = direction(sim, sim.possessionTeamId);
  carrier.targetX = clamp(carrier.x + (50 - carrier.x) * .06, 5, 95);
  carrier.targetY = clamp(carrier.y + dir * 4, 7, 93);

  const support = attack.filter(player => player.id !== carrier.id && player.position !== 'GK')
    .sort((a, b) => distance(a, carrier) - distance(b, carrier)).slice(0, 2);
  support.forEach((player, index) => {
    player.targetX = clamp(carrier.x + (index ? 10 : -10), 6, 94);
    player.targetY = clamp(carrier.y - dir * (index ? 5 : 8), 7, 93);
  });

  const pressers = defence.filter(player => player.position !== 'GK')
    .sort((a, b) => distance(a, carrier) - distance(b, carrier)).slice(0, sim.ball.y > 30 && sim.ball.y < 70 ? 2 : 1);
  pressers.forEach((player, index) => {
    player.targetX = clamp(carrier.x + (index ? 2.8 : -2.8), 5, 95);
    player.targetY = clamp(carrier.y - dir * 1.5, 5, 95);
    player.pressing = true;
  });

  const line = offsideLine(sim, sim.possessionTeamId);
  for (const player of attack) {
    if (!FORWARDS.has(player.position) || player.id === carrier.id) continue;
    player.targetY = dir < 0 ? Math.max(player.targetY, line) : Math.min(player.targetY, line);
  }
}

function updateKickoffTargets(sim) {
  for (const player of sim.players) {
    const point = kickoffPoint(player, sim.possessionTeamId, sim.homeTeamId, sim.kickoffKickerId);
    player.targetX = point.x; player.targetY = point.y; player.pressing = false; player.receiving = false; player.rushing = false;
  }
}

function restartSpot(sim, restart, teamId) {
  const dir = direction(sim, teamId); const side = restart.variant % 2 ? 5 : 95;
  if (restart.type === 'throw-in') return { x: side, y: 44 };
  if (restart.type === 'free-kick') return { x: 50, y: dir < 0 ? 31 : 69 };
  if (restart.type === 'corner') return { x: side, y: dir < 0 ? 4 : 96 };
  return { x: 50, y: dir < 0 ? 88 : 12 };
}

function beginRestart(sim, restart, teamId) {
  const spot = restartSpot(sim, restart, teamId);
  const side = teamPlayers(sim, teamId);
  const taker = restart.type === 'goal-kick'
    ? side.find(player => player.position === 'GK')
    : closest(side, spot, player => player.position !== 'GK');
  sim.restart = { ...restart, teamId, takerId: taker.id, spot };
  sim.mode = 'restart'; sim.possessionTeamId = teamId; sim.desiredPossessionTeamId = teamId;
  sim.ball.ownerId = null; sim.ball.flight = null; sim.ball.x = spot.x; sim.ball.y = spot.y; sim.ball.shooting = false;
  sim.action = `${restart.type.toUpperCase()} · PLAYERS RESETTING`;
  sim.nextActionAt = sim.clock + 850;
}

function updateRestartTargets(sim) {
  updateLiveTargets(sim);
  const restart = sim.restart;
  const taker = sim.players.find(player => player.id === restart.takerId);
  taker.targetX = restart.spot.x; taker.targetY = restart.spot.y;
  taker.receiving = true;
  if (restart.type === 'corner') {
    const dir = direction(sim, restart.teamId);
    teamPlayers(sim, restart.teamId).filter(player => player.id !== taker.id && player.position !== 'GK').forEach((player, index) => {
      player.targetX = clamp(35 + (index % 4) * 10, 8, 92); player.targetY = dir < 0 ? 14 + (index % 3) * 5 : 86 - (index % 3) * 5;
    });
  }
}

function candidateScore(sim, carrier, candidate) {
  const dir = direction(sim, carrier.teamId);
  const dist = distance(carrier, candidate);
  const forward = (candidate.y - carrier.y) * dir;
  const space = Math.min(...opponentPlayers(sim, carrier.teamId).map(player => distance(player, candidate)));
  const variation = (hash(`${sim.sequence}:${candidate.id}`) % 100) / 100;
  return forward * .55 + space * .34 - Math.abs(dist - 18) * .23 + variation * 4;
}

function selectPass(sim, carrier) {
  const all = teamPlayers(sim, carrier.teamId).filter(player => player.id !== carrier.id && player.position !== 'GK' && isOnside(sim, player));
  const maximum = sim.sequence % 7 === 6 ? 58 : 34;
  const candidates = all.filter(player => distance(carrier, player) <= maximum);
  if (!candidates.length && all.length) return all.sort((a, b) => distance(a, carrier) - distance(b, carrier))[0];
  if (!candidates.length) return closest(teamPlayers(sim, carrier.teamId), carrier, player => player.id !== carrier.id);
  const ranked = candidates.map(player => ({ player, score: candidateScore(sim, carrier, player) })).sort((a, b) => b.score - a.score);
  return ranked[Math.min(ranked.length - 1, sim.sequence % 4 === 3 ? 1 : 0)].player;
}

function startPass(sim, from, to, action = 'PASSING MOVE') {
  const dist = distance(from, to);
  const curveSign = hash(`${sim.sequence}:${from.id}:${to.id}`) % 2 ? 1 : -1;
  sim.ball.ownerId = null;
  sim.ball.flight = { kind: 'pass', fromId: from.id, toId: to.id, startX: sim.ball.x, startY: sim.ball.y, elapsed: 0, duration: clamp(260 + dist * 11, 340, 720), curve: curveSign * Math.min(3.2, dist * .08) };
  sim.action = action; sim.sequence++; sim.nextActionAt = Number.POSITIVE_INFINITY;
}

function startShot(sim, scorer) {
  const dir = direction(sim, scorer.teamId);
  sim.ball.ownerId = null;
  sim.ball.flight = { kind: 'shot', fromId: scorer.id, toId: null, startX: sim.ball.x, startY: sim.ball.y, endX: 50, endY: dir < 0 ? 2.5 : 97.5, elapsed: 0, duration: 430, curve: (hash(scorer.id) % 2 ? 1 : -1) * 1.4 };
  sim.ball.shooting = true; sim.action = 'SHOT · ON GOAL'; sim.nextActionAt = Number.POSITIVE_INFINITY;
}

function beginTurnover(sim) {
  const oldCarrier = sim.players.find(player => player.id === sim.ball.ownerId) ?? { x: sim.ball.x, y: sim.ball.y };
  const winner = closest(teamPlayers(sim, sim.desiredPossessionTeamId), oldCarrier, player => player.position !== 'GK');
  sim.possessionTeamId = sim.desiredPossessionTeamId;
  sim.ball.ownerId = null;
  sim.ball.flight = { kind:'turnover', fromId:oldCarrier.id, toId:winner.id, startX:sim.ball.x, startY:sim.ball.y, elapsed:0, duration:280, curve:0 };
  sim.action = 'TACKLE WON · TURNOVER'; sim.nextActionAt = Number.POSITIVE_INFINITY; sim.sequence++;
}

function decide(sim) {
  if (sim.mode === 'goal') return;
  if (sim.mode === 'kickoff') {
    const kicker = sim.players.find(player => player.id === sim.kickoffKickerId);
    const support = kickoffSupport(sim, sim.possessionTeamId, kicker.id);
    startPass(sim, kicker, support, 'KICK OFF · PLAYED BACK'); sim.mode = 'live';
    return;
  }
  if (sim.mode === 'restart') {
    const taker = sim.players.find(player => player.id === sim.restart.takerId);
    sim.ball.ownerId = taker.id; sim.ball.x = taker.x; sim.ball.y = taker.y;
    const receiver = selectPass(sim, taker);
    startPass(sim, taker, receiver, `${sim.restart.type.toUpperCase()} · IN PLAY`);
    sim.restart = null; sim.mode = 'live';
    return;
  }
  if (sim.desiredPossessionTeamId !== sim.possessionTeamId) { beginTurnover(sim); return; }
  const carrier = sim.players.find(player => player.id === sim.ball.ownerId);
  if (!carrier) return;
  if (sim.pendingGoal) {
    const scorer = sim.players.find(player => player.id === sim.pendingGoal.playerId);
    if (scorer && !isOnside(sim, scorer)) { sim.action = 'ATTACKER CHECKS THE RUN'; sim.nextActionAt = sim.clock + 100; return; }
    if (scorer && scorer.id !== carrier.id) { startPass(sim, carrier, scorer, `CHANCE · ${sim.pendingGoal.playerName}`); sim.pendingGoal.stage = 'receiving'; return; }
    startShot(sim, scorer ?? carrier); sim.pendingGoal.stage = 'shooting'; return;
  }
  const receiver = selectPass(sim, carrier);
  startPass(sim, carrier, receiver, distance(carrier, receiver) > 42 ? 'SWITCHING PLAY' : FORWARDS.has(receiver.position) ? 'PROGRESSIVE PASS' : 'PASSING TRIANGLE');
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
  if (t < 1) return;
  sim.ball.flight = null;
  if (flight.kind === 'shot') {
    sim.action = 'GOAL'; sim.mode = 'goal'; sim.goalHoldUntil = sim.clock + 1500;
    return;
  }
  sim.ball.ownerId = receiver.id; sim.possessionTeamId = receiver.teamId; sim.ball.shooting = false;
  sim.nextActionAt = sim.clock + 360 + (hash(`${sim.sequence}:${receiver.id}`) % 260);
  if (sim.pendingGoal?.stage === 'receiving') sim.nextActionAt = sim.clock + 180;
}

function maxSpeed(player) {
  if (player.position === 'GK') return player.rushing ? 8 : 4.5;
  if (player.receiving || player.pressing) return 11.5;
  if (FORWARDS.has(player.position)) return 10;
  return 8.5;
}

function steer(player, dt) {
  const dx = player.targetX - player.x; const dy = player.targetY - player.y; const dist = Math.hypot(dx, dy);
  const speed = maxSpeed(player) * Math.min(1, dist / 5);
  const desiredX = dist > .001 ? dx / dist * speed : 0; const desiredY = dist > .001 ? dy / dist * speed : 0;
  const blend = Math.min(1, dt * (player.pressing || player.receiving ? 4.2 : 3.2));
  player.vx += (desiredX - player.vx) * blend; player.vy += (desiredY - player.vy) * blend;
}

function separate(sim, dt) {
  for (let i = 0; i < sim.players.length; i++) for (let j = i + 1; j < sim.players.length; j++) {
    const a = sim.players[i]; const b = sim.players[j]; const dx = a.x - b.x; const dy = a.y - b.y; const dist = Math.hypot(dx, dy); const minimum = a.pressing || b.pressing ? 2.7 : 3.6;
    if (dist >= minimum) continue;
    const nx = dist > .001 ? dx / dist : (i % 2 ? 1 : -1); const ny = dist > .001 ? dy / dist : (j % 2 ? .25 : -.25); const force = (minimum - dist) * 8;
    a.vx += nx * force * dt; a.vy += ny * force * dt; b.vx -= nx * force * dt; b.vy -= ny * force * dt;
  }
}

export function advanceBroadcastSimulation(sim, elapsedMs) {
  const safeElapsed = clamp(elapsedMs, 0, 50); const dt = safeElapsed / 1000; sim.clock += safeElapsed;
  if (sim.mode === 'goal' && sim.clock >= sim.goalHoldUntil) {
    const scoringTeam = sim.pendingGoal?.teamId ?? sim.possessionTeamId;
    const takingTeam = scoringTeam === sim.homeTeamId ? sim.awayTeamId : sim.homeTeamId;
    sim.pendingGoal = null; prepareKickoff(sim, takingTeam);
  }
  if (sim.mode === 'kickoff') updateKickoffTargets(sim);
  else if (sim.mode === 'restart') updateRestartTargets(sim);
  else updateLiveTargets(sim);
  if (!sim.ball.flight && sim.clock >= sim.nextActionAt) decide(sim);
  for (const player of sim.players) steer(player, dt);
  separate(sim, dt);
  for (const player of sim.players) { player.x = clamp(player.x + player.vx * dt); player.y = clamp(player.y + player.vy * dt); }
  advanceBall(sim, safeElapsed);
  return snapshotBroadcastSimulation(sim);
}

export function snapshotBroadcastSimulation(sim) {
  return {
    action: sim.action,
    markers: sim.players.map(player => ({ id: player.id, shirt: player.shirt, position: player.position, team: player.team, x: player.x, y: player.y, pressing: player.pressing, receiving: player.receiving, rushing: player.rushing })),
    ball: { x: sim.ball.x, y: sim.ball.y, shooting: sim.ball.shooting },
  };
}
