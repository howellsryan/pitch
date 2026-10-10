import { describe, expect, it } from 'vitest';
import { buildLiveMatchState, simulateMatchSegment } from '../modules/matchEngine.js';
import { advanceFootballSimulation, createFootballSimulation, footballLineupOptions, FOOTBALL_MAX_ACCELERATION, footballPlayerMaxSpeed, isFootballReady, queueFootballPhase, replaceFootballLineups, snapshotFootballSimulation } from './footballSimulation.js';
import { matchPlaybackElapsed } from './matchPlayback.js';

const positions=['GK','RB','CB','CB','LB','CM','CDM','CM','RW','ST','LW'];
const squad=prefix=>positions.map((position,i)=>({id:`${prefix}${i}`,name:`Player ${prefix}${i}`,position,age:25,attack:77,midfield:77,defence:77,goalkeeping:position==='GK'?78:10,fitness:100,form:50,inSquad:true}));
const home={id:'h',name:'Home',reputation:77},away={id:'a',name:'Away',reputation:77};
function fixture(seed=34) {
  const state=buildLiveMatchState(home,away,squad('h'),squad('a'),'4-3-3','4-3-3',null,null,'balanced','balanced',{seed});
  const sim=createFootballSimulation({homeTeamId:'h',awayTeamId:'a',possessionTeamId:'h',homeFormation:state.homeFormation,awayFormation:state.awayFormation,homePlayers:state.hActive,awayPlayers:state.aActive});
  return {state,sim};
}
function drain(sim,check=()=>{}) {
  for (let i=0;i<4000;i++) {
    if(isFootballReady(sim)) return;
    const previous=sim.players.map(p=>({id:p.id,x:p.x,y:p.y,vx:p.vx,vy:p.vy,maxSpeed:footballPlayerMaxSpeed(p)}));
    advanceFootballSimulation(sim,20);
    check(previous);
  }
  throw new Error(`Stalled phase${sim.activePhase?.record.phase}: action${sim.activePhase?.index}/${sim.activePhase?.actions.length} ${sim.action}; mode${sim.mode}; owner${sim.ball.ownerId}`);
}

function openScene(sim, actions) {
  sim.mode='live';sim.deadball=null;
  queueFootballPhase(sim,{phase:2,teamId:'h',route:'direct_pass',football:{version:1,opening:{type:'open_play'},actions}});
}

describe('continuous metric football',()=>{
  it.each([false,true])('resumes a preparing kickoff after a formation change (replace taker: %s)',replaceTaker=>{
    const {sim,state}=fixture();
    sim.deadball.ready=false;
    sim.deadball.since=sim.clock;
    const oldTaker=sim.deadball.takerId;
    const returningWinger=sim.players.find(p=>p.teamId==='h'&&p.position==='RW');
    returningWinger.y=20;
    returningWinger.py=20;
    const options={...footballLineupOptions(state),homeFormation:'4-2-3-1'};
    if(replaceTaker) options.homePlayers=options.homePlayers.map(p=>p.id===oldTaker?{...p,id:'kickoff-substitute'}:p);
    const positions=new Map(sim.players.map(p=>[p.id,{x:p.x,y:p.y}]));
    replaceFootballLineups(sim,options);
    for(const p of sim.players) {
      const before=positions.get(p.id);
      if(before) expect({x:p.x,y:p.y}).toEqual(before);
    }
    drain(sim);
    expect(sim.deadball.ready).toBe(true);
    expect(sim.byId.has(sim.deadball.takerId)).toBe(true);
    expect(sim.ball.ownerId).toBe(sim.deadball.takerId);
    expect(sim.players.every(p=>p.id===sim.deadball.takerId||(p.teamId==='h'?p.y>=53:p.y<=52))).toBe(true);
  });
  it('checks a marginal offside run behind the defensive line without retreating to halfway',()=>{
    const {sim}=fixture(),actor=sim.byId.get('h5'),receiver=sim.byId.get('h9');
    actor.x=34;actor.y=30;receiver.x=34;receiver.y=18;
    for(const p of sim.players.filter(p=>p.team==='away'))p.y=p.position==='GK'?3:19;
    sim.ball.ownerId=actor.id;sim.ball.x=34;sim.ball.y=30;
    openScene(sim,[{type:'pass',actorId:actor.id,targetId:receiver.id,origin:{x:34,y:30},target:{x:34,y:12},outcome:'complete'}]);
    advanceFootballSimulation(sim,20);
    expect(receiver.ty).toBeGreaterThan(19);
    expect(receiver.ty).toBeLessThan(23);
  });
  it('keeps the receiving intent ahead of formation movement on every flight step',()=>{
    const {sim}=fixture(),actor=sim.byId.get('h5'),receiver=sim.byId.get('h9');
    actor.x=30;actor.y=55;receiver.x=40;receiver.y=45;
    sim.ball.ownerId=actor.id;sim.ball.x=30;sim.ball.y=55;
    openScene(sim,[{type:'pass',actorId:actor.id,targetId:receiver.id,origin:{x:30,y:55},target:{x:42,y:36},outcome:'complete'}]);
    let flights=0,late=0;
    for(let i=0;i<400&&!isFootballReady(sim);i++) {
      advanceFootballSimulation(sim,20);
      const f=sim.ball.flight;
      if(f) {
        flights++;
        expect(Math.hypot(receiver.tx-f.end.x,receiver.ty-f.end.y)).toBeLessThan(3);
        if(f.elapsed>=f.duration)late+=20;
      }
    }
    expect(flights).toBeGreaterThan(0);expect(late).toBeLessThan(300);
    expect(sim.lastContact.playerId).toBe(receiver.id);
  });
  it('moves possession through a remote recovery instead of freezing the carrier',()=>{
    const {sim}=fixture(),carrier=sim.byId.get('a9'),recoverer=sim.byId.get('h2');
    carrier.x=12;carrier.y=18;recoverer.x=56;recoverer.y=85;
    sim.ball.ownerId=carrier.id;sim.ball.x=12;sim.ball.y=18;
    openScene(sim,[{type:'recovery',actorId:recoverer.id,fromId:carrier.id,origin:{x:12,y:18},target:{x:12,y:18}}]);
    let still=0,maxStill=0;
    for(let i=0;i<600&&!isFootballReady(sim);i++) {
      const old={...sim.ball};advanceFootballSimulation(sim,20);
      still=Math.hypot(old.x-sim.ball.x,old.y-sim.ball.y)<.001?still+20:0;
      maxStill=Math.max(maxStill,still);
    }
    expect(isFootballReady(sim)).toBe(true);expect(sim.ball.ownerId).toBe(recoverer.id);
    expect(maxStill).toBeLessThan(400);
  });
  it('sets a near-goal free-kick wall legally despite a keeper sharing its lane',()=>{
    const {sim}=fixture(),actor=sim.byId.get('h2');
    sim.mode='live';sim.deadball=null;
    for(const p of sim.players.filter(p=>p.team==='away')) {p.x=34;p.y=3.65;}
    queueFootballPhase(sim,{phase:2,teamId:'h',route:'direct_pass',football:{version:1,opening:{type:'free_kick'},actions:[
      {type:'pass',actorId:actor.id,targetId:'h5',origin:{x:34,y:13},target:{x:40,y:20},outcome:'complete'},
    ]}});
    drain(sim);
    expect(sim.completedPhase).toBe(2);
  });
  it('lets a late first touch chase a rolling ball instead of parking at the pass endpoint',()=>{
    const {sim}=fixture(),receiver=sim.byId.get('h5');
    receiver.x=30;receiver.y=52;receiver.vx=0;receiver.vy=0;
    openScene(sim,[{type:'pass',actorId:'h2',targetId:receiver.id,outcome:'complete',origin:{x:20,y:50},target:{x:30,y:50}}]);
    sim.ball.ownerId=null;
    sim.ball.flight={id:1,kind:'pass',fromId:'h2',toId:receiver.id,start:{x:20,y:50},end:{x:30,y:50},duration:1.2,elapsed:1.2,loft:0,action:sim.activePhase.actions[0]};
    sim.ball.x=30;sim.ball.y=50;
    advanceFootballSimulation(sim,20);
    expect(sim.ball.x).toBeGreaterThan(30.1);
    expect(sim.ball.flight.end).toEqual({x:30,y:50});
    drain(sim);
    expect(sim.lastContact.playerId).toBe(receiver.id);
    expect(Math.hypot(sim.lastContact.ball.x-sim.lastContact.player.x,sim.lastContact.ball.y-sim.lastContact.player.y)).toBeLessThan(1);
  });
  it('blocks a forward shot at the foot instead of aiming backwards at a rear challenge',()=>{
    const {sim}=fixture(),shooter=sim.byId.get('h9'),blocker=sim.byId.get('a2');
    shooter.x=34;shooter.y=15;blocker.x=34;blocker.y=16;
    sim.ball.ownerId=shooter.id;sim.ball.x=34;sim.ball.y=15;
    openScene(sim,[{type:'shot',actorId:shooter.id,defenderId:blocker.id,outcome:'blocked',origin:{x:34,y:15},target:{x:34,y:0}}]);
    let shots=0;
    drain(sim,()=>{const f=sim.ball.flight;if(f?.kind==='blocked'){shots++;expect(f.end.y).toBeLessThanOrEqual(f.start.y);}});
    expect(shots).toBeGreaterThan(0);expect(sim.lastContact.playerId).toBe(blocker.id);
  });
  it('brings an outside receiver inside before a crowded short pass near the goal line',()=>{
    const {sim}=fixture(),actor=sim.byId.get('h5'),receiver=sim.byId.get('h2'),opponent=sim.byId.get('a9');
    actor.x=49.52;actor.y=2.03;receiver.x=42.87;receiver.y=-.31;receiver.vx=4.27;receiver.vy=.14;
    opponent.x=44.53;opponent.y=1.71;
    sim.ball.ownerId=actor.id;sim.ball.x=actor.x;sim.ball.y=actor.y;
    openScene(sim,[{type:'pass',actorId:actor.id,targetId:receiver.id,origin:{x:49.52,y:2.03},target:{x:43.75,y:3},outcome:'complete'}]);
    advanceFootballSimulation(sim,20);
    expect(sim.ball.flight).toBeNull();expect(receiver.ty).toBeGreaterThan(1);
    drain(sim,()=>{if(sim.ball.flight){expect(sim.ball.y).toBeGreaterThanOrEqual(0);expect(sim.ball.x).toBeGreaterThanOrEqual(0);}});
    expect(sim.lastContact.playerId).toBe(receiver.id);
  });
  it('keeps a late intercepted first touch within a collectable rolling corridor',()=>{
    const {sim}=fixture(),actor=sim.byId.get('h9'),receiver=sim.byId.get('h2'),defender=sim.byId.get('a5');
    actor.x=34;actor.y=24;receiver.x=50;receiver.y=35;
    defender.x=18;defender.y=31;defender.vx=-7;defender.vy=0;
    sim.ball.ownerId=actor.id;sim.ball.x=actor.x;sim.ball.y=actor.y;
    openScene(sim,[{type:'pass',actorId:actor.id,targetId:receiver.id,defenderId:defender.id,origin:{x:34,y:24},target:{x:40,y:20},outcome:'intercepted'}]);
    drain(sim,()=>{if(sim.ball.flight){expect(sim.ball.x).toBeGreaterThanOrEqual(0);expect(sim.ball.y).toBeGreaterThanOrEqual(0);}});
    expect(sim.lastContact.playerId).toBe(defender.id);
  });
  it('projects current fitness and canonical roles without mutating the XI',()=>{
    const {state}=fixture();
    const p=state.hActive[1],fitness=p.fitness;
    state.hFitness.set(p.id,40);state.homeRoles[p.id]='ball_playing_defender';
    const options=footballLineupOptions(state),view=options.homePlayers.find(v=>v.id===p.id);
    expect(view.fitness).toBe(40);expect(view.tacticalRole).toBe('ball_playing_defender');
    expect(p.fitness).toBe(fitness);expect(view).not.toBe(p);
  });
  it('names and renders the same emergency keeper when natural keepers are unavailable',()=>{
    const depleted=squad('a').filter(p=>p.position!=='GK');
    depleted.push({...depleted[0],id:'extra',goalkeeping:22});
    const state=buildLiveMatchState(home,away,squad('h'),depleted,'4-3-3','4-3-3',null,null,'balanced','balanced',{seed:34});
    const keeper=state.aActive.find(p=>p.matchPosition==='GK');
    expect(keeper).toBeDefined();expect(keeper.position).not.toBe('GK');
    const sim=createFootballSimulation({homeTeamId:'h',awayTeamId:'a',...footballLineupOptions(state)});
    expect(sim.players.find(p=>p.team==='away'&&p.position==='GK').id).toBe(keeper.id);
    const full=simulateMatchSegment(home,away,state,1,120).updatedState;
    const save=full.actionLedger.find(r=>r.teamId==='h'&&r.finish==='saved');
    expect(save).toBeDefined();expect(save.football.actions.at(-1).goalkeeperId).toBe(keeper.id);
    queueFootballPhase(sim,save);drain(sim);
    expect(sim.ball.ownerId).toBe(keeper.id);
  });
  it('uses legal kickoff halves and has no zero-time mutation',()=>{
    const {sim}=fixture();
    for(const p of sim.players) {
      if(p.id===sim.ball.ownerId) continue;
      expect(p.team==='home'?p.y>=52.5:p.y<=52.5).toBe(true);
    }
    const before=snapshotFootballSimulation(sim);
    expect(advanceFootballSimulation(sim,0)).toEqual(before);
  });
  it('has the same physical state under60Hz,25Hz and irregular frame partitions',()=>{
    function run(chunks) {
      const {sim,state}=fixture();
      const next=simulateMatchSegment(home,away,state,1,1).updatedState;
      queueFootballPhase(sim,next.actionLedger[0]);
      for(const ms of chunks) advanceFootballSimulation(sim,ms);
      return snapshotFootballSimulation(sim);
    }
    const exact=run(Array(160).fill(20));
    expect(run(Array(200).fill(16))).toEqual(exact);
    expect(run(Array(40).fill(80))).toEqual(exact);
  });
  it.each([1,2,4])('preserves physical state across frame partitions at new%s× playback',rate=>{
    function run(chunks) {
      const {sim,state}=fixture();
      queueFootballPhase(sim,simulateMatchSegment(home,away,state,1,1).updatedState.actionLedger[0]);
      for(const elapsed of chunks) {
        let remaining=matchPlaybackElapsed(elapsed,rate);
        while(remaining>0){const step=Math.min(50,remaining);advanceFootballSimulation(sim,step);remaining-=step;}
      }
      return snapshotFootballSimulation(sim);
    }
    expect(run(Array(25).fill(16))).toEqual(run(Array(10).fill(40)));
  });
  it('locks the kick endpoint and receives only at physical contact',()=>{
    const {sim,state}=fixture();
    queueFootballPhase(sim,simulateMatchSegment(home,away,state,1,1).updatedState.actionLedger[0]);
    let end;
    for(let i=0;i<3000&&!isFootballReady(sim);i++) {
      const flight=sim.ball.flight;
      if(flight) {
        if(end?.id!==flight.id) end={id:flight.id,...flight.end};
        expect(flight.end).toEqual({x:end.x,y:end.y});
      }
      advanceFootballSimulation(sim,20);
      if(sim.lastContact) expect(Math.hypot(sim.lastContact.ball.x-sim.lastContact.player.x,sim.lastContact.ball.y-sim.lastContact.player.y)).toBeLessThanOrEqual(1.15);
    }
    expect(end).toBeDefined();
    expect(isFootballReady(sim)).toBe(true);
  });
  it.each(['3-5-2','4-4-2','5-2-3'])('finishes %s with fatigue and automatic substitutes while reserving the backup keeper',formation=>{
    const players=prefix=>[...squad(prefix).map(p=>({...p,fitness:65})),
      ...['CM','ST','CB','GK'].map((position,i)=>({...squad(prefix)[i],id:`${prefix}bench${i}`,position,fitness:100,goalkeeping:position==='GK'?95:10}))];
    let state=buildLiveMatchState(home,away,players('h'),players('a'),formation,formation,null,null,'balanced','balanced',{seed:34});
    const sim=createFootballSimulation({homeTeamId:'h',awayTeamId:'a',...footballLineupOptions(state)});
    let substitutions=0;
    for(let phase=1;phase<=120;phase++) {
      const {updatedState,segEvents}=simulateMatchSegment(home,away,state,phase,phase);
      state=updatedState;
      for(const event of segEvents.filter(e=>e.type==='sub')) {
        substitutions++;
        const incoming=[...state.hActive,...state.aActive].find(p=>p.id===event.inId);
        expect(incoming.position==='GK' ? incoming.matchPosition==='GK' : true).toBe(true);
      }
      queueFootballPhase(sim,state.actionLedger.at(-1));
      replaceFootballLineups(sim,footballLineupOptions(state));drain(sim);
    }
    expect(substitutions).toBeGreaterThan(0);
    expect(sim.completedPhase).toBe(120);
    expect(sim.goalSerial).toBe(state.hGoals+state.aGoals);
  },20000);
  it.each([12,34,56])('completes the authoritative90minutes without teleports or invented goals(seed%s)',seed=>{
    let {sim,state}=fixture(seed);
    let interceptions=0,saves=0;
    let maxSpeedRatio=0,maxAcceleration=0,illegalReleases=0,wrongInterceptors=0;
    let staticMs=0,maxStaticMs=0;
    for(let phase=1;phase<=120;phase++) {
      const next=simulateMatchSegment(home,away,state,phase,phase);
      state=next.updatedState;
      const record=state.actionLedger.at(-1);
      queueFootballPhase(sim,record);
      replaceFootballLineups(sim,footballLineupOptions(state));
      let lastFlightId=0;
      let lastBall={x:sim.ball.x,y:sim.ball.y};
      drain(sim,previous=>{
        const ballStep=Math.hypot(sim.ball.x-lastBall.x,sim.ball.y-lastBall.y);
        staticMs=sim.mode==='live'&&!sim.ball.hidden&&ballStep<.001?staticMs+20:0;
        maxStaticMs=Math.max(maxStaticMs,staticMs);lastBall={x:sim.ball.x,y:sim.ball.y};
        for(const old of previous) {
          const p=sim.byId.get(old.id);
          if(!p)continue;
          const movement=Math.hypot(p.x-old.x,p.y-old.y);
          // A completed scene applies the next fitness map after this movement.
          // Measure against the ceiling that governed the integrated step.
          maxSpeedRatio=Math.max(maxSpeedRatio,movement/(old.maxSpeed*.02));
          maxAcceleration=Math.max(maxAcceleration,Math.hypot(p.vx-old.vx,p.vy-old.vy)/.02);
        }
        const flight=sim.ball.flight;
        if(flight&&flight.id!==lastFlightId) {
          lastFlightId=flight.id;
          if(!flight.releaseOnside)illegalReleases++;
          if(flight.kind==='intercept') {interceptions++;if(flight.toId!==record.defenderId)wrongInterceptors++;}
          if(flight.kind==='saved') saves++;
        }
        if(sim.lastContact?.kind==='intercept'&&sim.lastContact.playerId===sim.lastContact.intendedId)wrongInterceptors++;
      });
      expect(sim.completedPhase).toBe(phase);
      expect(sim.goalSerial).toBe(state.actionLedger.filter(r=>r.finish==='goal').length);
      if(record.finish==='saved') expect(sim.ball.ownerId).toBe(record.football.terminal.carrierId);
      queueFootballPhase(sim,record);
      expect(sim.activePhase).toBe(null);
    }
    expect(sim.halftimeCompleted).toBe(true);
    expect(interceptions).toBeGreaterThan(0);
    expect(saves).toBeGreaterThan(0);
    expect(maxSpeedRatio).toBeLessThanOrEqual(1.00001);
    expect(maxAcceleration).toBeLessThanOrEqual(FOOTBALL_MAX_ACCELERATION+.00001);
    expect(illegalReleases).toBe(0);
    expect(wrongInterceptors).toBe(0);
    expect(maxStaticMs).toBeLessThan(500);
  },20000);
  it('keeps an already-resolved scorer until the scene completes and preserves substitution position',()=>{
    let {sim,state}=fixture(34);
    for(let phase=1;phase<=120;phase++) {
      state=simulateMatchSegment(home,away,state,phase,phase).updatedState;
      const r=state.actionLedger.at(-1);
      queueFootballPhase(sim,r);
      if(r.finish!=='goal') {drain(sim);continue;}
      const side=r.teamId==='h'?'homePlayers':'awayPlayers';
      const before=sim.byId.get(r.shotId);
      const lineup={homeFormation:state.homeFormation,awayFormation:state.awayFormation,homePlayers:state.hActive,awayPlayers:state.aActive};
      lineup[side]=lineup[side].map(p=>p.id===r.shotId?{...p,id:'replacement'}:p);
      replaceFootballLineups(sim,lineup);
      expect(sim.byId.has(r.shotId)).toBe(true);
      drain(sim);
      expect(sim.byId.has('replacement')).toBe(true);
      expect(sim.byId.has(r.shotId)).toBe(false);
      expect(Number.isFinite(sim.byId.get('replacement').x)).toBe(true);
      expect(before).toBeDefined();
      return;
    }
    throw new Error('Fixture must contain a goal for the substitution contract.');
  },20000);
});
