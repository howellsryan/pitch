import { SLOT_LAYOUT, SLOT_POS_MAP } from './formationLayout.js';
import { FOOTBALL_PITCH } from '../modules/matchFootball.js';
import { normalizeTeamInstructions } from '../modules/tactics.js';

export const FOOTBALL_STEP_MS = 20;
export const FOOTBALL_MAX_ACCELERATION = 5.8;
const GRASS_DECELERATION = 3.2;
const { width:W, length:L } = FOOTBALL_PITCH;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const player = (sim, id) => sim.byId.get(id);
const other = (sim, teamId) => teamId === sim.homeTeamId ? sim.awayTeamId : sim.homeTeamId;
const dir = (sim, teamId) => (teamId === sim.homeTeamId ? -1 : 1) * (sim.endsSwapped ? -1 : 1);
const side = (sim, teamId) => sim.players.filter(p => p.teamId === teamId);
const shortName = p => p?.name?.split(' ').at(-1) ?? 'The player';
const forwards = new Set(['ST', 'CF', 'RW', 'LW', 'CAM']);
const defenders = new Set(['CB', 'RB', 'LB']);
const routeLabels = { circulation:'Patient build-up', direct_pass:'Playing through the lines', pass_into_space:'Attacking the space', carry:'Taking on the defence', wide_delivery:'Creating width', final_ball:'Opening the defence' };

/** Project the authoritative live fitness/role maps without mutating its XI. */
export function footballLineupOptions(state) {
  const players=(active,fitness,roles)=>active.map(p=>({...p,fitness:fitness?.get(p.id)??p.fitness,
    tacticalRole:roles?.[p.id]??p.tacticalRole}));
  return {homeFormation:state.homeFormation,awayFormation:state.awayFormation,
    homePlayers:players(state.hActive,state.hFitness,state.homeRoles),
    awayPlayers:players(state.aActive,state.aFitness,state.awayRoles),
    homeTactics:state.homeTactics,awayTactics:state.awayTactics};
}

function assign(players, formation, teamId, home, swapped = false) {
  const slots = SLOT_LAYOUT[formation] ?? SLOT_LAYOUT['4-3-3'];
  const remaining = [...players];
  // Reserve exact roles before fallback fits can consume a later slot's player.
  const assigned=slots.map(s=>{
    const index=remaining.findIndex(p=>(p.matchPosition??p.position)===s.p);
    return index>=0 ? remaining.splice(index,1)[0] : null;
  });
  slots.forEach((s,i)=>{
    if(assigned[i])return;
    const index=remaining.findIndex(p=>(SLOT_POS_MAP[s.p]??[s.p]).includes(p.position));
    assigned[i]=remaining.splice(index>=0?index:0,1)[0];
  });
  return slots.map((s, i) => {
    const source = assigned[i];
    if (!source) return null;
    const baseX = s.x * W / 100;
    const baseY = (home !== swapped ? s.y : 100 - s.y) * L / 100;
    return { id:source.id, name:source.name ?? source.id, position:s.p, naturalPosition:source.position,
      teamId, team:home ? 'home' : 'away', shirt:i + 1, role:source.tacticalRole?.id ?? source.tacticalRole ?? '',
      pace:source.attributeProfile?.pace ?? source.pace ?? 65, fitness:source.fitness ?? 90,
      passing:source.attributeProfile?.passing ?? source.midfield ?? 65,
      x:baseX, y:baseY, px:baseX, py:baseY, vx:0, vy:0, baseX, baseY,
      tx:baseX, ty:baseY, facing:home ? Math.PI : 0, stride:0, pose:'stand', pressing:false, receiving:false };
  }).filter(Boolean);
}

export function footballPlayerMaxSpeed(p) {
  const fitness = .80 + clamp(Number(p.fitness) || 0, 0, 100) * .002;
  return (4.9 + clamp(Number(p.pace) || 65, 1, 99) * .035) * fitness;
}

function rebuildIndex(sim) { sim.byId = new Map(sim.players.map(p => [p.id, p])); }
function setIntent(p, x, y) { if (p) { p.tx = clamp(x, .3, W - .3); p.ty = clamp(y, .3, L - .3); } }
function owner(sim) { return player(sim, sim.ball.ownerId); }
function narrate(sim, action, detail, phaseLabel) {
  if (sim.action === action && sim.detail === detail) return;
  sim.action = action; sim.detail = detail; sim.commentaryVersion++;
  if (phaseLabel) sim.phaseLabel = phaseLabel;
}

function kicker(sim, teamId) {
  const players = side(sim, teamId);
  return players.find(p => p.position === 'ST') ?? players.find(p => forwards.has(p.position)) ?? players.find(p => p.position !== 'GK');
}

function kickoffTargets(sim, takingTeamId, takerId, initial = false) {
  for (const p of sim.players) {
    const d = dir(sim, p.teamId);
    const ownHalf = d < 0 ? 1 : -1;
    let y = p.position === 'GK' ? (d < 0 ? 101 : 4)
      : L / 2 + ownHalf * (defenders.has(p.position) ? 28 : forwards.has(p.position) ? 13 : 20);
    let x = p.baseX;
    if (p.id === takerId) { x = W / 2; y = L / 2; }
    setIntent(p, x, y);
    if (initial) { p.x = p.tx; p.y = p.ty; p.px = p.x; p.py = p.y; }
  }
}

export function createFootballSimulation(options) {
  const sim = { continuous:true, ...options, clock:0, accumulator:0, completedPhase:0, activePhase:null,
    endsSwapped:false, halftimeCompleted:false, mode:'kickoff', phaseLabel:'Kick off', action:'KICK OFF',
    detail:'The teams take their positions.', commentaryVersion:0, goalSerial:0, goal:null,
    homeTactics:normalizeTeamInstructions(options.homeTactics), awayTactics:normalizeTeamInstructions(options.awayTactics),
    players:[...assign(options.homePlayers, options.homeFormation, options.homeTeamId, true), ...assign(options.awayPlayers, options.awayFormation, options.awayTeamId, false)],
    ball:{ x:W/2, y:L/2, px:W/2, py:L/2, z:0, ownerId:null, flight:null, hidden:false },
    lastContact:null, flightSerial:0, pendingLineups:null, nextDecisionAt:0, holdUntil:0, deadball:null };
  rebuildIndex(sim);
  const first = kicker(sim, options.possessionTeamId ?? options.homeTeamId);
  sim.firstKickoffTeamId = first?.teamId ?? options.homeTeamId;
  kickoffTargets(sim, sim.firstKickoffTeamId, first?.id, true);
  sim.ball.ownerId = first?.id ?? null;
  sim.deadball = { type:'kickoff', teamId:sim.firstKickoffTeamId, takerId:first?.id, spot:{x:W/2,y:L/2}, ready:true };
  return sim;
}

export function isFootballReady(sim) {
  return !sim.activePhase && !sim.ball.flight && !sim.goal && (sim.mode === 'live' || sim.deadball?.ready);
}

export function queueFootballPhase(sim, record) {
  if (sim.activePhase || record.phase <= sim.completedPhase) return;
  if (record.football?.version !== 1) throw new Error('Watched football requires a supported engine-owned spatial intent.');
  const actions = record.football.actions.map(a => ({ ...a, origin:{...a.origin}, target:{...a.target} }));
  sim.activePhase = { record, actions, index:0, stage:'prepare', startedAt:sim.clock, stageAt:sim.clock,
    actionAt:sim.clock, launched:false, contest:false };
  sim.phaseLabel = routeLabels[record.route] ?? 'Building the attack';
  const opening = record.football.opening;
  if (['kickoff', 'corner', 'goal_kick', 'free_kick'].includes(opening.type)) {
    prepareDeadball(sim, opening.type, record.teamId, actions[0].origin, actions[0].actorId);
  } else { sim.deadball = null; sim.mode = 'live'; }
  sim.nextDecisionAt = sim.clock;
}

function prepareDeadball(sim, type, teamId, spot, takerId) {
  sim.mode = type === 'kickoff' ? 'kickoff' : 'restart';
  sim.deadball = { type, teamId, spot:{...spot}, takerId, ready:false, since:sim.clock };
  sim.ball.ownerId = null; sim.ball.flight = null; sim.ball.z = 0; sim.ball.hidden = true;
  if (type === 'kickoff') kickoffTargets(sim, teamId, takerId);
  setIntent(player(sim, takerId), spot.x, spot.y);
  const label = { kickoff:'KICK OFF', corner:'CORNER', goal_kick:'GOAL KICK', free_kick:'FREE KICK' }[type];
  narrate(sim, label, type === 'kickoff' ? 'The teams move into their own halves.' : 'Players organise for the restart.', label);
}

function advanceDeadball(sim) {
  const dead = sim.deadball;
  const taker = player(sim, dead?.takerId);
  if (!dead || !taker) return;
  setIntent(taker, dead.spot.x, dead.spot.y);
  let ready = dist(taker, dead.spot) < .95;
  if (dead.type === 'kickoff') {
    ready &&= sim.players.every(p => p.id === taker.id || (dir(sim, p.teamId) < 0 ? p.y >= L/2 + .5 : p.y <= L/2 - .5));
  } else if (dead.type === 'corner') {
    const d = dir(sim, dead.teamId);
    for (const p of sim.players) {
      if (p.id === taker.id || p.position === 'GK') continue;
      if (forwards.has(p.position) || (p.teamId !== dead.teamId && defenders.has(p.position))) {
        setIntent(p, 34 + (p.baseX - 34) * .55, d < 0 ? 12 + (p.shirt % 3) * 3 : 93 - (p.shirt % 3) * 3);
        ready &&= Math.hypot(p.tx-p.x,p.ty-p.y)<2.5;
      }
    }
    ready &&= sim.clock - dead.since > 1600;
  } else if (dead.type === 'free_kick') {
    const d = dir(sim, dead.teamId);
    const wall = side(sim, other(sim, dead.teamId)).filter(p => defenders.has(p.position)).slice(0,3);
    wall.forEach((p,i) => {
      // Leave a metre for avoidance/arrival tolerance. A wall aimed exactly at
      // the minimum distance can be held illegally forward by a nearby keeper.
      const wallDistance=10.35,y=dead.spot.y+d*wallDistance;
      if(y>=.3&&y<=L-.3) setIntent(p,dead.spot.x+(i-1)*1.2,y);
      else setIntent(p,dead.spot.x+(dead.spot.x<W/2?1:-1)*(wallDistance+i*.8),dead.spot.y);
      ready &&= Math.hypot(p.x-p.tx,p.y-p.ty)<1;
    });
    for (const p of sim.players) {
      if (p.id===taker.id || wall.includes(p)) continue;
      const distance=dist(p,dead.spot),minimum=p.teamId===dead.teamId ? 2.5 : 10.35;
      if (distance>=minimum) continue;
      const dx=p.x-dead.spot.x,dy=p.y-dead.spot.y;
      setIntent(p,dead.spot.x+(distance>.05?dx/distance:1)*minimum,dead.spot.y+(distance>.05?dy/distance:0)*minimum);
      if(Math.hypot(p.tx-dead.spot.x,p.ty-dead.spot.y)<minimum-.1) {
        setIntent(p,dead.spot.x+(dead.spot.x<W/2?1:-1)*minimum,dead.spot.y);
      }
    }
    ready &&= sim.clock - dead.since > 1200;
    ready &&= side(sim,other(sim,dead.teamId)).every(p=>dist(p,dead.spot)>=9.15);
  }
  if (!ready) return;
  dead.ready = true;
  sim.ball.x = dead.spot.x; sim.ball.y = dead.spot.y; sim.ball.px = sim.ball.x; sim.ball.py = sim.ball.y;
  sim.ball.hidden = false; sim.ball.ownerId = taker.id;
  if (sim.activePhase) { sim.deadball = null; sim.mode = 'live'; sim.activePhase.actionAt = sim.clock + 160; }
}

export function footballOffsideLine(sim, attackingTeamId) {
  const ys = side(sim, other(sim, attackingTeamId)).map(p => p.y).sort((a,b) => a-b);
  const d = dir(sim, attackingTeamId);
  const defender = d < 0 ? ys[1] ?? 0 : ys.at(-2) ?? L;
  return d < 0 ? Math.min(sim.ball.y, defender) : Math.max(sim.ball.y, defender);
}

export function footballOnside(sim, receiver, teamId = receiver?.teamId) {
  if (!receiver || receiver.id === sim.ball.ownerId) return true;
  const d = dir(sim, teamId);
  if (d < 0 ? receiver.y >= L/2 : receiver.y <= L/2) return true;
  const line = footballOffsideLine(sim, teamId);
  return d < 0 ? receiver.y >= line - .01 : receiver.y <= line + .01;
}

function shapeTargets(sim) {
  const carrier = owner(sim);
  const possessing = carrier?.teamId ?? sim.activePhase?.record.teamId ?? sim.firstKickoffTeamId;
  const ball = sim.ball;
  for (const p of sim.players) {
    p.pressing = false; p.receiving = false;
    if (sim.clock > (p.poseUntil ?? 0)) p.pose = 'run';
    const d = dir(sim, p.teamId);
    const possession = p.teamId === possessing;
    const tactics = p.teamId === sim.homeTeamId ? sim.homeTactics : sim.awayTactics;
    if (p.position === 'GK') {
      const ownY = d < 0 ? L - 2.5 : 2.5;
      const danger = !possession && Math.abs(ball.y-ownY) < 20;
      const depth = possession ? (p.role === 'sweeper_keeper' ? 9 : 5) : danger ? 3.5 : 1.5;
      setIntent(p, 34 + clamp((ball.x-34)*(danger ? .22 : .08), -4, 4), ownY + d * depth);
      continue;
    }
    const width = (possession ? tactics.attackingWidth : tactics.defensiveWidth) === 'wide' ? 1.13
      : (possession ? tactics.attackingWidth : tactics.defensiveWidth) === 'narrow' ? .70 : possession ? 1 : .84;
    const progress = (d < 0 ? L-ball.y : ball.y) / L;
    const lineShift = possession ? d * (progress-.48)*24 : d * (tactics.defensiveLine === 'high' ? 9 : tactics.defensiveLine === 'low' ? -9 : 0);
    // The block travels with play. Anchors preserve relative role depth, not
    // fixed spots that all22 players eventually stand on.
    let y = p.baseY + lineShift + (ball.y-L/2)*.48;
    if (possession && forwards.has(p.position) && p.id !== carrier?.id) {
      const line = footballOffsideLine(sim, p.teamId);
      y = d < 0 ? Math.max(y,line+.8) : Math.min(y,line-.8);
    }
    setIntent(p,34+(p.baseX-34)*width+(ball.x-34)*.16,y);
  }
  if (carrier) {
    const support=side(sim,carrier.teamId).filter(p=>p.id!==carrier.id&&p.position!=='GK'&&!defenders.has(p.position))
      .sort((a,b)=>dist(a,carrier)-dist(b,carrier)).slice(0,2).sort((a,b)=>a.baseX-b.baseX);
    if(carrier.position!=='GK')support.forEach((p,i)=>{
      const d=dir(sim,p.teamId),line=footballOffsideLine(sim,p.teamId);
      const y=carrier.y-d*(i===0?6:9);
      setIntent(p,carrier.x+(i===0?-1:1)*10,d<0?Math.max(y,line+1.4):Math.min(y,line-1.4));
    });
    const opponents = side(sim, other(sim, carrier.teamId)).filter(p => p.position !== 'GK');
    const nearest = opponents.reduce((best,p) => !best || dist(p,carrier)<dist(best,carrier) ? p : best,null);
    const tactics = nearest?.teamId === sim.homeTeamId ? sim.homeTactics : sim.awayTactics;
    if (nearest && tactics.pressing !== 'passive') {
      const close = dist(nearest,carrier) < (tactics.pressing === 'aggressive' ? 25 : 13);
      if (close) { nearest.pressing=true; setIntent(nearest,carrier.x,carrier.y+dir(sim,carrier.teamId)*1.5); }
    }
    // The next defender covers the goal-side lane rather than following the
    // same point as the presser. Other defenders mark nearby forward runs.
    const cover=opponents.filter(p=>p!==nearest).sort((a,b)=>dist(a,carrier)-dist(b,carrier))[0];
    if(cover&&dist(cover,carrier)<24)setIntent(cover,carrier.x,carrier.y+dir(sim,carrier.teamId)*5);
    for(const p of opponents.filter(p=>defenders.has(p.position)&&p!==nearest&&p!==cover)) {
      const threat=side(sim,carrier.teamId).filter(q=>forwards.has(q.position)).sort((a,b)=>dist(p,a)-dist(p,b))[0];
      if(threat&&dist(p,threat)<16)setIntent(p,threat.x,threat.y+dir(sim,carrier.teamId)*2.2);
    }
  }
  anticipateAction(sim);
}

function anticipateAction(sim) {
  const scene=sim.activePhase;
  if(!scene)return;
  const next=scene.actions[scene.index+1],shot=scene.actions.find(a=>a.type==='shot');
  const runner=player(sim,next?.actorId),carrier=owner(sim);
  if(runner&&runner.id!==carrier?.id&&runner.position!=='GK') {
    const goal=next.type==='shot'?next.origin:next.target,d=dir(sim,runner.teamId),line=footballOffsideLine(sim,runner.teamId);
    setIntent(runner,goal.x,d<0?Math.max(goal.y,line+1.4):Math.min(goal.y,line-1.4));
  }
  const action=currentAction(sim),opponent=player(sim,action?.defenderId??shot?.defenderId);
  if(opponent&&action&&['turnover','foul_won','corner_won','intercepted','blocked'].includes(action.outcome)) {
    opponent.pressing=true;
    const target=player(sim,action.targetId)??player(sim,action.actorId);
    if(target)setIntent(opponent,target.x,target.y);
  }
  // Begin closing the chance during its build-up, not after the shooter has
  // already arrived. A recorded block must not summon a defender from midfield.
  if(shot?.outcome==='blocked') {
    const blocker=player(sim,shot.defenderId);
    if(blocker) {blocker.pressing=true;setIntent(blocker,shot.origin.x,shot.origin.y);}
  }
}

function currentAction(sim) { return sim.activePhase?.actions[sim.activePhase.index]; }
function advanceAction(sim, text, detail) {
  const scene = sim.activePhase;
  if (!scene) return;
  scene.index++; scene.stage='prepare'; scene.stageAt=sim.clock; scene.actionAt=sim.clock+120; scene.launched=false; scene.contest=false;scene.meeting=null;
  if (text) narrate(sim,text,detail);
  if (scene.index >= scene.actions.length) finishPhase(sim);
}

function finishPhase(sim) {
  const scene = sim.activePhase;
  if (!scene) return;
  sim.completedPhase=scene.record.phase;
  sim.activePhase=null;
  if (sim.pendingLineups) { const pending=sim.pendingLineups; sim.pendingLineups=null; replaceFootballLineups(sim,pending); }
  if (sim.completedPhase === 60 && !sim.goal) beginHalfTime(sim);
}

function beginHalfTime(sim) {
  sim.mode='half-time'; sim.holdUntil=sim.clock+1800; sim.ball.ownerId=null; sim.ball.hidden=true;
  for (const p of sim.players) setIntent(p,p.x,p.y);
  narrate(sim,'HALF TIME','The players change ends.','Half time');
}

function stageAction(sim) {
  const scene=sim.activePhase, action=currentAction(sim);
  if (!scene || !action || sim.ball.flight || sim.deadball || sim.mode !== 'live' || sim.clock < scene.actionAt) return;
  const actor=player(sim,action.actorId);
  if (!actor) throw new Error(`Football action references inactive player ${String(action.actorId)}.`);
  const carrier=owner(sim);
  if (action.type === 'recovery') {
    if (!carrier) { setIntent(actor,sim.ball.x,sim.ball.y); if (dist(actor,sim.ball)<.8) { takeBall(sim,actor,'recovery'); advanceAction(sim,'POSSESSION WON',`${shortName(actor)} gathers the loose ball.`); } return; }
    if(dist(actor,sim.ball)<1.1) { takeBall(sim,actor,'recovery');advanceAction(sim,'POSSESSION WON',`${shortName(actor)} wins the ball.`);return; }
    // A phase-level change of possession is not necessarily a tackle by a
    // player66m away. Project a lost distribution into that player's reachable
    // zone; do not freeze the old carrier while the named recoverer runs there.
    const loft=dist(carrier,actor)>30?2:0;
    const kick=planReception(sim.ball,actor,{x:actor.x,y:actor.y},23,loft===0);
    startFlight(sim,{kind:'recovery',actor:carrier,endpoint:kick.endpoint,duration:kick.duration,toId:actor.id,loft,action});
    carrier.pose='kick';carrier.poseUntil=sim.clock+180;
    narrate(sim,'LOOSE BALL',`${shortName(carrier)} loses the distribution; ${shortName(actor)} moves to collect.`);
    return;
  }
  if (scene.contest) { resolveContest(sim,action,carrier ?? actor); return; }
  if (carrier?.id !== actor.id) {
    // Reconcile substitutions or a dead-ball taker through actual contact,
    // never transfer ownership to a remote named participant.
    if(carrier) {
      const kick=planReception(sim.ball,actor,{x:actor.x,y:actor.y},19);
      startFlight(sim,{kind:'handover',actor:carrier,endpoint:kick.endpoint,duration:kick.duration,toId:actor.id,action});
    } else {
      setIntent(actor,sim.ball.x,sim.ball.y);
      if(dist(actor,sim.ball)<1.1)takeBall(sim,actor,'handover');
    }
    return;
  }
  if (action.type === 'carry') {
    if (!scene.carryTarget) scene.carryTarget={ x:clamp(actor.x+(action.target.x-action.origin.x),2,W-2), y:clamp(actor.y+(action.target.y-action.origin.y),4,L-4) };
    setIntent(actor,scene.carryTarget.x,scene.carryTarget.y);
    narrate(sim,'CARRYING FORWARD',`${shortName(actor)} advances with the ball.`,routeLabels[action.purpose]);
    if (dist(actor,scene.carryTarget)<1 || sim.clock-scene.stageAt>4500) {
      scene.carryTarget=null;
      if (['turnover','foul_won','corner_won'].includes(action.outcome)) resolveContest(sim,action,actor);
      else advanceAction(sim,'PROGRESSION',`${shortName(actor)} takes the attack forward.`);
    }
    return;
  }
  if (action.type === 'shot') { prepareShot(sim,action,actor); return; }
  preparePass(sim,action,actor);
}

function takeBall(sim,p,kind) {
  sim.ball.ownerId=p.id; sim.ball.z=0; sim.ball.hidden=false;
  sim.lastContact={ playerId:p.id, kind, clock:sim.clock, ball:{x:sim.ball.x,y:sim.ball.y}, player:{x:p.x,y:p.y} };
}

/** Predict a receiving run with the same acceleration/braking limits. The
 * conservative reach leaves room for avoidance and a first touch; it does not
 * require the runner to stop before release. No tracking result is persisted. */
function predictRun(p,target,seconds) {
  let x=p.x,y=p.y,vx=p.vx,vy=p.vy;
  const max=footballPlayerMaxSpeed(p);
  for(let remaining=seconds;remaining>0;remaining-=.02) {
    const dt=Math.min(.02,remaining),dx=target.x-x,dy=target.y-y,length=Math.hypot(dx,dy);
    const speed=Math.min(max,Math.sqrt(2*3.8*length));
    const ax=(length>.025?dx/length*speed:0)-vx,ay=(length>.025?dy/length*speed:0)-vy;
    const change=Math.hypot(ax,ay),ratio=change>0?Math.min(1,FOOTBALL_MAX_ACCELERATION*dt/change):0;
    vx+=ax*ratio;vy+=ay*ratio;x+=vx*dt;y+=vy*dt;
  }
  return {x:clamp(x,1,W-1),y:clamp(y,1,L-1)};
}

/** One kick-weight model for both planning and flight integration. */
function kickTrajectory(start,endpoint,nominalDuration,ground) {
  const length=dist(start,endpoint),timing={duration:Math.max(.08,nominalDuration)};
  if(length<=.01)return timing;
  const dx=(endpoint.x-start.x)/length,dy=(endpoint.y-start.y)/length;
  const space=Math.max(.05,Math.min(dx>0?(W-.15-endpoint.x)/dx:dx<0?(.15-endpoint.x)/dx:Infinity,
    dy>0?(L-.15-endpoint.y)/dy:dy<0?(.15-endpoint.y)/dy:Infinity));
  if(ground) {
    // Constant grass drag; choose a softer kick near the boundary so a late
    // first touch still has playable roll. This never homes to a moving player.
    const nominal=length/timing.duration*1.2,drag=2*GRASS_DECELERATION;
    const launch=Math.max(Math.sqrt(drag*length+.01),Math.min(nominal,Math.sqrt(drag*(length+space))));
    const arrival=Math.sqrt(Math.max(0,launch*launch-drag*length));
    timing.duration=2*length/(launch+arrival);
    timing.travelRatio=arrival*timing.duration/length;timing.rollingSpeed=arrival;
  } else timing.rollingSpeed=Math.min(length/timing.duration*.35,Math.sqrt(2*GRASS_DECELERATION*space));
  return timing;
}

function planReception(start,receiver,target,speed,ground=true) {
  let endpoint={x:receiver.x,y:receiver.y};
  const nominal=()=>Math.max(.18,dist(start,endpoint)/(speed*.90));
  const arrivalTime=()=>kickTrajectory(start,endpoint,nominal(),ground).duration;
  for(let i=0;i<4;i++)endpoint=predictRun(receiver,target,arrivalTime()*.72);
  // Validate the final run against the SAME drag-adjusted arrival time and
  // endpoint that startFlight will use, including near-boundary soft passes.
  for(let i=0;i<6;i++) {
    const arrival=predictRun(receiver,endpoint,arrivalTime());
    if(dist(arrival,endpoint)<.45)break;
    endpoint={x:endpoint.x+(arrival.x-endpoint.x)*.75,y:endpoint.y+(arrival.y-endpoint.y)*.75};
  }
  return {endpoint,duration:nominal()};
}

function carryInSpace(sim,actor,towards=null) {
  const d=dir(sim,actor.teamId);
  // Keep a controlled touch while checking a lane, rather than pinning the
  // owner. A contest can close from both sides without a remote stationary wait.
  const goal=towards??{x:clamp(actor.x+(actor.x<34?1:-1)*4,3,W-3),y:clamp(actor.y+d*3,5,L-5)};
  setIntent(actor,goal.x,goal.y);
}

function preparePass(sim,action,actor) {
  const scene=sim.activePhase,receiver=player(sim,action.targetId);
  if(!receiver)throw new Error(`Football pass references inactive receiver ${String(action.targetId)}.`);
  receiver.receiving=true;
  if(receiver.x<1||receiver.x>W-1||receiver.y<1||receiver.y>L-1) {
    setIntent(receiver,clamp(receiver.x,3,W-3),clamp(receiver.y,3,L-3));
    carryInSpace(sim,actor);
    narrate(sim,'OFFERING AN OPTION',`${shortName(receiver)} returns inside as ${shortName(actor)} carries.`);
    return;
  }
  const d=dir(sim,actor.teamId),line=footballOffsideLine(sim,actor.teamId);
  const exempt=scene.index===0&&['corner','goal_kick'].includes(scene.record.football.opening.type);
  if(!footballOnside(sim,receiver,actor.teamId)&&!exempt) {
    // Checking back a metre is enough; halfway is only the fallback legal line.
    const legal=d<0?Math.min(line+1.4,L/2+.5):Math.max(line-1.4,L/2-.5);
    setIntent(receiver,receiver.x,legal);carryInSpace(sim,actor);
    narrate(sim,'CHECKING THE RUN',`${shortName(receiver)} checks back as ${shortName(actor)} carries.`);
    return;
  }
  const speed=action.type==='cross'?19:13.5+actor.passing*.075;
  const defender=action.outcome==='intercepted'?player(sim,action.defenderId):null;
  let destination=action.target;
  // Prepare the final run during the pass rather than catching deep and then
  // dribbling the entire unopposed distance to an absolute shooting coordinate.
  const next=scene.actions[scene.index+1];
  if(next?.type==='shot'&&next.actorId===receiver.id)destination=next.origin;
  let kick=planReception(sim.ball,receiver,destination,speed,action.type!=='cross'&&!(action.loft>0));
  if(defender) {
    const lane=kick.endpoint,dx=lane.x-actor.x,dy=lane.y-actor.y;
    const fraction=clamp(((defender.x-actor.x)*dx+(defender.y-actor.y)*dy)/(dx*dx+dy*dy||1),.12,.95);
    kick=planReception(sim.ball,defender,{x:actor.x+dx*fraction,y:actor.y+dy*fraction},speed,action.type!=='cross'&&!(action.loft>0));
    defender.pressing=true;
  }
  scene.stage='flight';scene.launched=true;
  actor.pose='kick';actor.poseUntil=sim.clock+180;
  narrate(sim,action.type==='cross'?'CROSS INTO THE AREA':'PASS',`${shortName(actor)} ${action.type==='cross'?'delivers toward':'plays towards'} ${shortName(receiver)}.`,routeLabels[action.purpose]);
  startFlight(sim,{kind:defender?'intercept':'pass',actor,endpoint:kick.endpoint,
    toId:defender?defender.id:receiver.id,intendedId:receiver.id,
    duration:kick.duration,loft:action.type==='cross'?Math.max(2,action.loft??0):action.loft??0,action,offsideExempt:exempt});
}

function resolveContest(sim,action,actor) {
  const opponent=player(sim,action.defenderId);
  if (!opponent) { advanceAction(sim); return; }
  sim.activePhase.contest=true;
  opponent.pressing=true;
  const meeting=sim.activePhase.meeting??={x:clamp((actor.x+opponent.x)/2,2,W-2),y:clamp((actor.y+opponent.y)/2,3,L-3)};
  setIntent(opponent,meeting.x,meeting.y);carryInSpace(sim,actor,meeting);
  if(dist(opponent,actor)<3)setIntent(opponent,sim.ball.x,sim.ball.y);
  if (dist(opponent,sim.ball)>.95) return;
  if (action.outcome === 'turnover') { takeBall(sim,opponent,'tackle'); advanceAction(sim,'TACKLE',`${shortName(opponent)} takes the ball from ${shortName(actor)}.`); }
  else if (action.outcome === 'foul_won') { actor.pose='fall'; actor.poseUntil=sim.clock+800; narrate(sim,'FREE KICK AWARDED',`${shortName(actor)} is brought down by ${shortName(opponent)}.`); sim.ball.ownerId=null; advanceAction(sim); }
  else {
    const d=dir(sim,actor.teamId), target={x:clamp(actor.x,1,W-1),y:d<0 ? -.2 : L+.2};
    startFlight(sim,{kind:'corner_deflection',actor:opponent,endpoint:target,duration:dist(sim.ball,target)/21,toId:null,loft:0,action});
    narrate(sim,'DEFLECTED BEHIND',`${shortName(opponent)} blocks the delivery.`);
  }
}

function prepareShot(sim,action,shooter) {
  const scene=sim.activePhase;
  const intended=action.origin;
  setIntent(shooter,intended.x,intended.y);
  if (dist(shooter,intended)>1.3) { narrate(sim,'CHANCE DEVELOPING',`${shortName(shooter)} moves into a shooting position.`); return; }
  const d=dir(sim,shooter.teamId), keeper=player(sim,action.goalkeeperId), blocker=player(sim,action.defenderId);
  let endpoint={...action.target},toId=null,kind=action.outcome;
  const speed=24.5;
  if (action.outcome === 'saved') {
    endpoint={x:action.target.x,y:d<0 ? 2.3 : L-2.3}; toId=keeper?.id;
    if (keeper) {
      endpoint=planReception(sim.ball,keeper,endpoint,speed,false).endpoint;
    }
  } else if (action.outcome === 'blocked' && blocker) {
    const lane={x:shooter.x+(action.target.x-shooter.x)*.28,y:shooter.y+(action.target.y-shooter.y)*.28};toId=blocker.id;
    endpoint=planReception(sim.ball,blocker,lane,speed,false).endpoint;blocker.pressing=true;
    if(d*(endpoint.y-sim.ball.y)<0) {
      // A nearby rear challenge blocks the forward kick at the shooter's foot;
      // it must not turn the actual shot into a backwards pass to the blocker.
      endpoint.y=sim.ball.y+d*.15;
      setIntent(blocker,endpoint.x,endpoint.y);
      if(dist(blocker,endpoint)>1.1) {carryInSpace(sim,shooter);return;}
    }
  } else endpoint.y += d * .7;
  if (keeper) { keeper.pose='dive';keeper.poseUntil=sim.clock+1200;setIntent(keeper,action.target.x,d<0 ? 1.7 : L-1.7); }
  shooter.pose='kick';shooter.poseUntil=sim.clock+280;
  scene.stage='shot';scene.launched=true;
  narrate(sim,'SHOT',`${shortName(shooter)} strikes at goal.`);
  startFlight(sim,{kind,actor:shooter,endpoint,duration:Math.max(.1,dist(shooter,endpoint)/speed),toId,loft:action.loft ?? .45,action});
}

function startFlight(sim,{kind,actor,endpoint,duration,toId=null,intendedId=null,loft=0,action,offsideExempt=false}) {
  const start={x:sim.ball.x,y:sim.ball.y};
  sim.flightSerial++;
  sim.ball.flight={ id:sim.flightSerial,kind,fromId:actor.id,toId,intendedId,start,end:{...endpoint},
    duration:Math.max(.08,duration),elapsed:0,loft,action,releaseOnside:offsideExempt||!intendedId||footballOnside(sim,player(sim,intendedId),actor.teamId) };
  if(toId)Object.assign(sim.ball.flight,kickTrajectory(start,endpoint,duration,
    ['pass','intercept','recovery','handover'].includes(kind)&&loft===0));
  sim.ball.ownerId=null;
}

function flightPosition(flight,seconds=flight.elapsed) {
  const t=clamp(seconds/flight.duration,0,1),dx=flight.end.x-flight.start.x,dy=flight.end.y-flight.start.y;
  // A grass pass loses some pace but still rolls after the planned contact.
  // Its release vector and planned endpoint never home towards the runner.
  const ground=['pass','intercept','recovery','handover'].includes(flight.kind)&&flight.loft===0;
  const ratio=flight.travelRatio??.8;
  const travel=ground?t*(2-ratio)+(ratio-1)*t*t:t;
  const late=Math.max(0,seconds-flight.duration),length=Math.hypot(dx,dy);
  const speed=flight.rollingSpeed??(ground ? .8 : .35)*length/flight.duration,deceleration=GRASS_DECELERATION;
  const rollTime=Math.min(late,speed/deceleration),roll=speed*rollTime-.5*deceleration*rollTime*rollTime;
  return {x:flight.start.x+dx*travel+(length?dx/length*roll:0),
    y:flight.start.y+dy*travel+(length?dy/length*roll:0),z:4*flight.loft*t*(1-t)};
}

function flightIntent(sim) {
  const flight=sim.ball.flight,receiver=player(sim,flight?.toId);
  if(!receiver)return;
  const target=flight.elapsed<flight.duration?flight.end:flightPosition(flight,flight.elapsed+.12);
  receiver.receiving=true;setIntent(receiver,target.x,target.y);
}

function advanceBall(sim,dt) {
  const b=sim.ball,flight=b.flight;
  if (!flight) {
    const carrier=owner(sim);
    if (carrier) {
      const offset=.42;
      b.x=carrier.x+Math.sin(carrier.facing)*offset;b.y=carrier.y-Math.cos(carrier.facing)*offset;b.z=0;
    }
    return;
  }
  flight.elapsed+=dt;
  const t=clamp(flight.elapsed/flight.duration,0,1);
  const position=flightPosition(flight);
  b.x=position.x;b.y=position.y;b.z=position.z;
  const receiver=player(sim,flight.toId);
  const contact=receiver&&dist(receiver,b)<=.95&&b.z<.65&&t>=.72;
  if(receiver?!contact:t<1)return;
  b.flight=null;b.z=0;
  if (flight.kind === 'goal') {
    sim.goal={ serial:++sim.goalSerial,record:sim.activePhase.record };
    sim.mode='goal';sim.holdUntil=sim.clock+1800;
    narrate(sim,'GOAL',`${shortName(player(sim,flight.fromId))} finds the net.`,'Goal');
    finishPhase(sim);return;
  }
  if (flight.kind === 'missed') { narrate(sim,'WIDE',`${shortName(player(sim,flight.fromId))} misses the target.`);advanceAction(sim);return; }
  if (flight.kind === 'corner_deflection') { advanceAction(sim,'CORNER', 'The block sends the ball behind.');return; }
  if (receiver) { takeBall(sim,receiver,flight.kind);sim.lastContact.intendedId=flight.intendedId; }
  if(flight.kind==='handover') {sim.activePhase.actionAt=sim.clock+100;return;}
  if (flight.kind === 'saved') { receiver.pose='catch';receiver.poseUntil=sim.clock+800;advanceAction(sim,'SAVED',`${shortName(receiver)} holds the shot.`); }
  else if (flight.kind === 'blocked') {
    if (flight.action.cornerWon) {
      const d=dir(sim,player(sim,flight.fromId).teamId),end={x:clamp(b.x,1,W-1),y:d<0 ? -.2 : L+.2};
      startFlight(sim,{kind:'corner_deflection',actor:receiver,endpoint:end,duration:dist(b,end)/20,action:flight.action});
      narrate(sim,'SHOT BLOCKED',`${shortName(receiver)} gets in the way.`);
    } else advanceAction(sim,'SHOT BLOCKED',`${shortName(receiver)} blocks the effort.`);
  } else if (flight.kind === 'intercept') advanceAction(sim,'INTERCEPTION',`${shortName(receiver)} cuts out the pass before it reaches ${shortName(player(sim,flight.intendedId))}.`);
  else if(flight.kind==='recovery')advanceAction(sim,'POSSESSION WON',`${shortName(receiver)} gathers the loose ball and looks forward.`);
  else if (['turnover','foul_won','corner_won'].includes(flight.action.outcome)) { sim.activePhase.contest=true;sim.activePhase.stage='contest';sim.activePhase.actionAt=sim.clock+180; }
  else advanceAction(sim,'RECEIVED',`${shortName(receiver)} controls the ball.`);
}

function movePlayers(sim,dt) {
  for (const p of sim.players) {
    const dx=p.tx-p.x,dy=p.ty-p.y,length=Math.hypot(dx,dy);
    const max=footballPlayerMaxSpeed(p),speed=Math.min(max,Math.sqrt(2*3.8*length));
    let desiredX=length>.025 ? dx/length*speed : 0,desiredY=length>.025 ? dy/length*speed : 0;
    // Local avoidance steers intention; it cannot add uncapped displacement.
    for (const q of sim.players) {
      if (p===q || (p.pressing && q.id===sim.ball.ownerId) || (p.id===sim.ball.ownerId&&q.pressing)) continue;
      // Near first touch the receiving/contact run owns the movement. Players
      // contest that space; avoidance must not steer the named receiver away
      // from a kick whose weight was planned against this actual endpoint.
      if(p.id===sim.ball.flight?.toId&&dist(p,sim.ball.flight.end)<4)continue;
      const sx=p.x-q.x,sy=p.y-q.y,apart=Math.hypot(sx,sy);
      if (apart>1.25 || apart<.01) continue;
      desiredX+=sx/apart*(1.25-apart)*3;desiredY+=sy/apart*(1.25-apart)*3;
    }
    const wantedLength=Math.hypot(desiredX,desiredY);
    if (wantedLength>max) { desiredX*=max/wantedLength;desiredY*=max/wantedLength; }
    // Fatigue can lower the speed ceiling between episodes. Reserve part of
    // the same acceleration budget to decelerate before steering, so a turn
    // cannot keep a tired runner above the new ceiling.
    const currentSpeed=Math.hypot(p.vx,p.vy),budget=FOOTBALL_MAX_ACCELERATION*dt;
    const braking=Math.min(budget,Math.max(0,currentSpeed-max));
    if(braking>0) {const ratio=(currentSpeed-braking)/currentSpeed;p.vx*=ratio;p.vy*=ratio;}
    const ax=desiredX-p.vx,ay=desiredY-p.vy,change=Math.hypot(ax,ay),limit=budget-braking;
    const ratio=change>limit ? limit/change : 1;
    p.vx+=ax*ratio;p.vy+=ay*ratio;
    // Players may naturally run just beyond a touchline. Do not instantaneously
    // zero their velocity at the painted line; acceleration stays bounded.
    const nx=clamp(p.x+p.vx*dt,-4,W+4),ny=clamp(p.y+p.vy*dt,-4,L+4);
    const travelled=Math.hypot(nx-p.x,ny-p.y);p.stride+=travelled*2.5;p.x=nx;p.y=ny;
    const moving=Math.hypot(p.vx,p.vy)>.3;
    const facing=moving ? Math.atan2(p.vx,-p.vy) : Math.atan2(sim.ball.x-p.x,-(sim.ball.y-p.y));
    const angle=Math.atan2(Math.sin(facing-p.facing),Math.cos(facing-p.facing));
    const turned=p.facing+clamp(angle,-4.4*dt,4.4*dt);
    p.facing=Math.atan2(Math.sin(turned),Math.cos(turned));
    if (sim.clock>(p.poseUntil ?? 0)) p.pose=moving ? 'run' : 'stand';
  }
}

function fixedStep(sim) {
  const dt=FOOTBALL_STEP_MS/1000;
  for (const p of sim.players) { p.px=p.x;p.py=p.y; }
  sim.ball.px=sim.ball.x;sim.ball.py=sim.ball.y;
  sim.clock+=FOOTBALL_STEP_MS;
  if (sim.mode === 'goal' && sim.clock>=sim.holdUntil) {
    const record=sim.goal.record;sim.goal=null;
    if (record.phase===60) beginHalfTime(sim);
    else if (record.phase===120) { sim.mode='live';sim.ball.hidden=true; }
    else prepareDeadball(sim,'kickoff',other(sim,record.teamId),{x:W/2,y:L/2},kicker(sim,other(sim,record.teamId))?.id);
  }
  if (sim.mode === 'half-time' && sim.clock>=sim.holdUntil) {
    sim.endsSwapped=true;sim.halftimeCompleted=true;
    for (const p of sim.players) p.baseY=L-p.baseY;
    const teamId=other(sim,sim.firstKickoffTeamId);
    prepareDeadball(sim,'kickoff',teamId,{x:W/2,y:L/2},kicker(sim,teamId)?.id);
  }
  if (sim.mode==='live' && sim.clock>=sim.nextDecisionAt) { shapeTargets(sim);sim.nextDecisionAt=sim.clock+100; }
  if (sim.deadball) advanceDeadball(sim);
  if (sim.mode==='live') stageAction(sim);
  // Active flight intent owns the receiving run before movement.
  flightIntent(sim);
  movePlayers(sim,dt);
  advanceBall(sim,dt);
}

export function advanceFootballSimulation(sim,elapsedMs) {
  sim.accumulator+=clamp(Number(elapsedMs)||0,0,200);
  while (sim.accumulator>=FOOTBALL_STEP_MS) { fixedStep(sim);sim.accumulator-=FOOTBALL_STEP_MS; }
  return snapshotFootballSimulation(sim);
}

export function snapshotFootballSimulation(sim,interpolated=false) {
  const alpha=interpolated ? sim.accumulator/FOOTBALL_STEP_MS : 1;
  const scene=sim.activePhase;
  // A coarse result episode represents45match seconds. Interpolate that clock
  // through the visible sequence; never announce the next minute at its start.
  const progress=scene ? Math.min(.97,(scene.index+Math.min(.95,(sim.clock-scene.stageAt)/4500))/scene.actions.length) : 0;
  const matchSeconds=(scene ? scene.record.phase-1+progress : sim.completedPhase)*45;
  return { continuous:true, space:'metres', clock:sim.clock, matchSeconds, completedPhase:sim.completedPhase,
    action:sim.action, detail:sim.detail, commentaryVersion:sim.commentaryVersion, phaseLabel:sim.phaseLabel,
    mode:sim.mode, half:sim.halftimeCompleted ? 2 : 1, goalSerial:sim.goalSerial,
    carrierName:owner(sim)?.name ?? '',
    markers:sim.players.map(p => ({ ...p,x:p.px+(p.x-p.px)*alpha,y:p.py+(p.y-p.py)*alpha,
      owner:sim.ball.ownerId===p.id,moving:Math.hypot(p.vx,p.vy)>.3,speed:Math.hypot(p.vx,p.vy) })),
    ball:{x:sim.ball.px+(sim.ball.x-sim.ball.px)*alpha,y:sim.ball.py+(sim.ball.y-sim.ball.py)*alpha,
      z:sim.ball.z,hidden:sim.ball.hidden,shooting:['goal','saved','missed','blocked'].includes(sim.ball.flight?.kind),flightId:sim.ball.flight?.id ?? null},
  };
}

export function replaceFootballLineups(sim,options) {
  if (sim.activePhase) { sim.pendingLineups=options;return; }
  const fresh=[...assign(options.homePlayers,options.homeFormation,sim.homeTeamId,true,sim.endsSwapped),...assign(options.awayPlayers,options.awayFormation,sim.awayTeamId,false,sim.endsSwapped)];
  const previous=sim.byId;
  sim.players=fresh.map(next => {
    const old=previous.get(next.id) ?? sim.players.find(p=>p.teamId===next.teamId&&p.shirt===next.shirt);
    return old ? {...next,x:old.x,y:old.y,px:old.px,py:old.py,vx:old.vx,vy:old.vy,facing:old.facing,stride:old.stride,
      ...(old.id===next.id ? {pose:old.pose,poseUntil:old.poseUntil} : {})} : next;
  });
  if (options.homeTactics) sim.homeTactics=normalizeTeamInstructions(options.homeTactics);
  if (options.awayTactics) sim.awayTactics=normalizeTeamInstructions(options.awayTactics);
  rebuildIndex(sim);
  if (sim.ball.ownerId&&!sim.byId.has(sim.ball.ownerId)) {
    const slotReplacement=sim.players.find(p=>p.teamId===previous.get(sim.ball.ownerId)?.teamId&&p.shirt===previous.get(sim.ball.ownerId)?.shirt);
    sim.ball.ownerId=slotReplacement?.id ?? null;
  }
}
