import { normalizeTeamInstructions } from './tactics.js';

/** Compact, engine-owned football intent. Tracking frames never enter a save.
 * Coordinates describe tactical destinations on a105x68m pitch, not measured
 * tracking. The broadcast integrates physical movement towards these intents.
 */
export const FOOTBALL_INTENT_VERSION = 1;
export const FOOTBALL_PITCH = Object.freeze({ width:68, length:105, goalWidth:7.32 });
const footballClamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const footballPoint = (x, y) => ({ x:Math.round(footballClamp(x, 0, 68) * 100) / 100, y:Math.round(footballClamp(y, 0, 105) * 100) / 100 });
const footballSlot = p => p?.matchPosition ?? p?.position;
const footballLane = p => ['LB', 'LW', 'LM'].includes(footballSlot(p)) ? 11 : ['RB', 'RW', 'RM'].includes(footballSlot(p)) ? 57 : 34;

export function createFootballState(homeTeamId, awayTeamId) {
  return { version:FOOTBALL_INTENT_VERSION, homeTeamId, awayTeamId, firstKickoffTeamId:homeTeamId,
    possessionTeamId:homeTeamId, carrierId:null, ball:footballPoint(34, 52.5), phase:0,
    restart:{ type:'kickoff', teamId:homeTeamId }, sequence:0 };
}

export function footballPossessionTeam(state, homeShare, roll, phase) {
  if (phase === 61) return state.firstKickoffTeamId === state.homeTeamId ? state.awayTeamId : state.homeTeamId;
  if (state.restart) return state.restart.teamId;
  // Each episode covers45match seconds, so midfield share selects the next
  // attack. Its opening explicitly carries the previous owner/recovery. Dead
  // balls override that selection; a second persistence boost would amplify
  // result-dependent restarts and distort venue/tactical calibration.
  return roll < homeShare ? state.homeTeamId : state.awayTeamId;
}

function footballDirection(state, teamId, phase) {
  return (teamId === state.homeTeamId ? -1 : 1) * (phase > 60 ? -1 : 1);
}

/** Enrich one canonical result record; no extra RNG draw or new shot outcome. */
export function resolveFootballIntent(state, record, { attackers = [], defenders = [], instructions = {}, packet, goalEvent } = {}) {
  const plan = normalizeTeamInstructions(instructions);
  const byId = new Map([...attackers, ...defenders].map(p => [p.id, p]));
  const actor = byId.get(record.actorId) ?? attackers.find(p => footballSlot(p) !== 'GK') ?? attackers[0];
  if (!actor) return { record, state:{ ...state, phase:record.phase }, goalEvent };
  const dir = footballDirection(state, record.teamId, record.phase);
  const restart = record.phase === 61 ? { type:'kickoff', teamId:record.teamId } : state.restart;
  const opening = { type:restart?.type ?? (state.possessionTeamId === record.teamId ? 'open_play' : 'transition'),
    teamId:record.teamId, carrierId:state.carrierId, previousTeamId:state.possessionTeamId };
  const ownGoalY = dir < 0 ? 105 : 0;
  const origin = restart?.type === 'kickoff' ? footballPoint(34, 52.5)
    : restart?.type === 'goal_kick' ? footballPoint(34, ownGoalY + dir * 5.5)
    : restart?.type === 'corner' ? footballPoint(state.ball.x < 34 ? 0 : 68, dir < 0 ? 0 : 105)
    : footballPoint(state.ball.x, state.ball.y);
  const actions = [];
  let carrierId = state.carrierId;
  let release = origin;
  const restartTaker = opening.type === 'kickoff'
    ? attackers.find(p => footballSlot(p) === 'ST') ?? actor
    : opening.type === 'goal_kick' ? attackers.find(p => footballSlot(p) === 'GK') ?? actor
    : ['corner','free_kick'].includes(opening.type) ? actor : null;
  if (restartTaker) {
    // Every stationary restart begins with a kick, even when its sampled route
    // is a carry. Goal kicks/corners enter the field; kickoff can go backwards.
    const receiver=restartTaker.id!==actor.id ? actor : attackers.find(p=>p.id===record.targetId&&p.id!==actor.id)
      ?? attackers.find(p=>p.id!==actor.id&&footballSlot(p)!=='GK');
    if (receiver) {
      const intoField=opening.type==='corner' ? -dir : opening.type==='kickoff' ? -dir : dir;
      const reception = footballPoint(origin.x + footballClamp(footballLane(receiver) - origin.x, -12, 12), footballClamp(origin.y + intoField * 6,3,102));
      actions.push({ type:'pass', actorId:restartTaker.id, targetId:receiver.id, origin, target:reception,
        purpose:opening.type === 'goal_kick' ? 'keeper_distribution' : opening.type, outcome:'complete' });
      release = reception;
      if(receiver.id!==actor.id) {
        const returnPoint=footballPoint(origin.x+(34-origin.x)*.25,footballClamp(origin.y+intoField*10,3,102));
        actions.push({type:'pass',actorId:receiver.id,targetId:actor.id,origin:reception,target:returnPoint,purpose:'build_up',outcome:'complete'});
        release=returnPoint;
      }
    }
  }
  if (opening.type === 'transition') {
    actions.push({ type:'recovery', actorId:actor.id, fromId:carrierId, origin, target:origin });
    carrierId = actor.id;
  } else if (carrierId && carrierId !== actor.id && byId.has(carrierId) && !['kickoff', 'corner', 'goal_kick', 'free_kick'].includes(opening.type)) {
    const reception = footballPoint(origin.x + footballClamp(footballLane(actor) - origin.x, -12, 12), origin.y + dir * (footballSlot(actor) === 'GK' ? -6 : 2));
    actions.push({ type:'pass', actorId:carrierId, targetId:actor.id, origin, target:reception, purpose:'build_up', outcome:'complete' });
    release = reception;
  }
  carrierId = actor.id;
  const runner = byId.get(record.targetId) ?? actor;
  const variation = ((packet?.target ?? .5) - .5) * 8;
  const forward = record.route === 'circulation' ? -3 : record.route === 'pass_into_space' ? 16 : record.route === 'carry' ? 10 : 11;
  let destination = footballPoint(release.x + footballClamp(footballLane(runner) - release.x, -18, 18) + variation, release.y + dir * forward);
  destination.y=footballClamp(destination.y,3,102);
  if (record.route === 'wide_delivery') destination = footballPoint(34 + variation, dir < 0 ? 13 : 92);
  if (record.shotId && record.targetId === record.shotId) destination = footballShotPosition(record, dir, variation);
  const type = record.route === 'carry' || runner.id === actor.id ? 'carry' : record.route === 'wide_delivery' ? 'cross' : 'pass';
  const routeAction = { type, actorId:actor.id, ...(type !== 'carry' ? { targetId:runner.id } : {}), origin:release, target:destination,
    purpose:record.route, outcome:record.outcome, defenderId:record.defenderId,
    loft:record.route === 'wide_delivery' ? 3.5 : record.route === 'pass_into_space' && plan.buildUp === 'direct' ? 1.8 : 0 };
  actions.push(routeAction);
  carrierId = type === 'carry' ? actor.id : runner.id;
  let end = destination;
  let possessionTeamId = record.teamId;
  let nextRestart = null;

  if (['turnover', 'intercepted'].includes(record.outcome)) {
    carrierId = record.defenderId;
    possessionTeamId = record.opponentTeamId;
    if (record.outcome === 'intercepted') end = footballPoint(release.x + (destination.x - release.x) * .58, release.y + (destination.y - release.y) * .58);
  } else if (record.outcome === 'foul_won') {
    nextRestart = { type:'free_kick', teamId:record.teamId };
  } else if (record.outcome === 'corner_won') {
    nextRestart = { type:'corner', teamId:record.teamId };
    end = footballPoint(destination.x < 34 ? 0 : 68, dir < 0 ? 0 : 105);
  }

  let finalPass = actions.filter(a => ['pass', 'cross'].includes(a.type)).at(-1);
  if (record.shotId) {
    const shootingPoint = footballShotPosition(record, dir, variation);
    if (carrierId !== record.shotId) {
      finalPass = { type:'pass', actorId:carrierId, targetId:record.shotId, origin:end, target:shootingPoint,
        purpose:'final_ball', outcome:'complete', loft:0 };
      actions.push(finalPass);
    }
    const goalX = 34 + ((packet?.finish ?? .5) - .5) * 5.6;
    const goalY = dir < 0 ? 0 : 105;
    const shotTarget = footballPoint(record.finish === 'missed' ? 34 + (variation < 0 ? -1 : 1) * (5.3 + Math.abs(variation)) : goalX, goalY);
    actions.push({ type:'shot', actorId:record.shotId, origin:shootingPoint, target:shotTarget,
      outcome:record.finish, defenderId:record.defenderId, goalkeeperId:defenders.find(p => footballSlot(p) === 'GK')?.id ?? null,
      cornerWon:Boolean(record.cornerWon), loft:record.route === 'wide_delivery' ? 1.1 : .45 });
    end = shotTarget;
    if (record.finish === 'goal') {
      nextRestart = { type:'kickoff', teamId:record.opponentTeamId };
      end = footballPoint(34, 52.5);
      carrierId = null;
      possessionTeamId = record.opponentTeamId;
    } else if (record.finish === 'saved') {
      carrierId = defenders.find(p => footballSlot(p) === 'GK')?.id ?? record.defenderId;
      end = footballPoint(goalX, goalY - dir * 2.5);
      possessionTeamId = record.opponentTeamId;
      nextRestart = { type:'keeper_ball', teamId:record.opponentTeamId };
    } else if (record.finish === 'missed') {
      nextRestart = { type:'goal_kick', teamId:record.opponentTeamId };
      carrierId = null;
      possessionTeamId = record.opponentTeamId;
    } else if (record.cornerWon) {
      nextRestart = { type:'corner', teamId:record.teamId };
      carrierId = null;
    } else {
      carrierId = record.defenderId;
      possessionTeamId = record.opponentTeamId;
      end=footballPoint(shootingPoint.x+(shotTarget.x-shootingPoint.x)*.28,shootingPoint.y+(shotTarget.y-shootingPoint.y)*.28);
    }
  }

  const assistId = record.shotId && finalPass?.targetId === record.shotId && finalPass.actorId !== record.shotId && (packet?.assist ?? 1) < .86 ? finalPass.actorId : null;
  const football = { version:FOOTBALL_INTENT_VERSION, direction:dir, opening, actions, nextRestart,
    terminal:{ carrierId, teamId:possessionTeamId, ball:end }, tactics:plan };
  const enriched = { ...record, assistId, football };
  const nextState = { ...state, possessionTeamId, carrierId, ball:end, restart:nextRestart,
    phase:record.phase, sequence:state.sequence + 1 };
  const event = goalEvent ? { ...goalEvent, assistId, assistName:assistId ? byId.get(assistId)?.name ?? null : null } : goalEvent;
  return { record:enriched, state:nextState, goalEvent:event };
}

function footballShotPosition(record, dir, variation) {
  // Existing calibrated xG determines an intended chance zone; it is not a
  // tracking-derived xG claim. Better chances occur nearer goal and centrally.
  const distance = footballClamp(27 - Number(record.xg ?? .15) * 54, 6, 25);
  return footballPoint(34 + variation * (record.route === 'wide_delivery' ? .5 : 1.7), dir < 0 ? distance : 105 - distance);
}
