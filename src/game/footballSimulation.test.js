import { describe, expect, it } from 'vitest';
import { buildLiveMatchState, simulateMatchSegment } from '../modules/matchEngine.js';
import { advanceFootballSimulation, createFootballSimulation, footballLineupOptions, FOOTBALL_MAX_ACCELERATION, footballPlayerMaxSpeed, isFootballReady, queueFootballPhase, replaceFootballLineups, snapshotFootballSimulation } from './footballSimulation.js';

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

describe('continuous metric football',()=>{
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
    for(let phase=1;phase<=120;phase++) {
      const next=simulateMatchSegment(home,away,state,phase,phase);
      state=next.updatedState;
      const record=state.actionLedger.at(-1);
      queueFootballPhase(sim,record);
      replaceFootballLineups(sim,footballLineupOptions(state));
      let lastFlightId=0;
      drain(sim,previous=>{
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
