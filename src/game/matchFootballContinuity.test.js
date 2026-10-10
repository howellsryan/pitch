import { describe, expect, it } from 'vitest';
import { buildLiveMatchState, finaliseLiveMatch, simulateMatchSegment } from '../modules/matchEngine.js';
import { createFootballState, resolveFootballIntent } from '../modules/matchFootball.js';

const positions = ['GK', 'RB', 'CB', 'CB', 'LB', 'CM', 'CDM', 'CM', 'RW', 'ST', 'LW'];
const squad = prefix => positions.map((position, i) => ({ id:`${prefix}${i}`, name:`${prefix}${i}`, position, age:25, attack:78, midfield:78, defence:78, goalkeeping:position === 'GK' ? 78 : 10, fitness:100, form:50, inSquad:true }));
const home = { id:'h', name:'Home', reputation:78 };
const away = { id:'a', name:'Away', reputation:78 };
const initial = seed => buildLiveMatchState(home, away, squad('h'), squad('a'), '4-3-3', '4-3-3', null, null, 'balanced', 'balanced', { seed });
function play(seed, chunk = 120) {
  let state = initial(seed);
  const events = [];
  for (let phase = 1; phase <= 120; phase += chunk) {
    const next = simulateMatchSegment(home, away, state, phase, Math.min(120, phase + chunk - 1));
    state = next.updatedState;
    events.push(...next.segEvents);
  }
  return { state, events, result:finaliseLiveMatch(home, away, state, events) };
}

describe('engine-owned football continuity', () => {
  it.each(['h','a'])('kicks every restart into legal play for %s',teamId=>{
    const attackers=squad(teamId),defenders=squad(teamId==='h'?'a':'h');
    for(const type of ['kickoff','goal_kick','corner','free_kick']) {
      const state={...createFootballState('h','a'),restart:{type,teamId},ball:{x:0,y:teamId==='h'?0:105}};
      const record={phase:1,teamId,opponentTeamId:teamId==='h'?'a':'h',actorId:`${teamId}9`,targetId:`${teamId}9`,route:'carry',outcome:'retain'};
      const f=resolveFootballIntent(state,record,{attackers,defenders,packet:{target:.5}}).record.football;
      expect(f.actions[0].type).toBe('pass');
      expect(f.actions[0].actorId).not.toBe(f.actions[0].targetId);
      expect(f.actions[0].target.y).toBeGreaterThan(0);
      expect(f.actions[0].target.y).toBeLessThan(105);
      if(type==='goal_kick') expect((f.actions[0].target.y-f.actions[0].origin.y)*f.direction).toBeGreaterThan(0);
      if(type==='corner') expect(f.actions.at(-1).target.y).toBeGreaterThan(0);
    }
  });
  it('keeps a blocked shot terminal at the defending contact',()=>{
    const record={phase:1,teamId:'h',opponentTeamId:'a',actorId:'h9',targetId:'h9',defenderId:'a2',route:'carry',outcome:'shot',shotId:'h9',finish:'blocked',xg:.2};
    const f=resolveFootballIntent(createFootballState('h','a'),record,{attackers:squad('h'),defenders:squad('a'),packet:{target:.5,finish:.5}}).record.football;
    expect(f.terminal.carrierId).toBe('a2');
    expect(f.terminal.ball.y).toBeGreaterThan(0);
    expect(f.terminal.ball.y).toBeLessThan(f.actions.at(-1).origin.y);
  });
  it('starts from a real centre restart and keeps tracking out of saved results', () => {
    const state = initial(34);
    expect(state.football).toMatchObject({ version:1, ball:{ x:34, y:52.5 }, restart:{ type:'kickoff', teamId:'h' } });
    const { result } = play(34);
    expect(result).not.toHaveProperty('football');
    expect(result).not.toHaveProperty('actionLedger');
  });
  it.each([1, 7, 30])('preserves complete action and football state for %s-phase chunks', chunk => {
    const full = play(34);
    const segmented = play(34, chunk);
    expect(segmented.state.football).toBeDefined();
    expect(segmented.state.football).toEqual(full.state.football);
    expect(segmented.state.actionLedger).toEqual(full.state.actionLedger);
    expect(segmented.result).toEqual(full.result);
  });
  it.each([12, 34, 56])('emits causal action chains and correct restart ownership for seed %s', seed => {
    const { state, events } = play(seed);
    const ids = new Set([...squad('h'), ...squad('a')].map(p => p.id));
    for (let i = 0; i < state.actionLedger.length; i++) {
      const record = state.actionLedger[i];
      const football = record.football;
      expect(football?.version).toBe(1);
      expect(football.actions.length).toBeGreaterThan(0);
      for (const action of football.actions) {
        expect(ids.has(action.actorId)).toBe(true);
        if (action.targetId) expect(ids.has(action.targetId)).toBe(true);
        for (const point of [action.origin, action.target].filter(Boolean)) {
          expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
          expect(point.x).toBeGreaterThanOrEqual(0);
          expect(point.x).toBeLessThanOrEqual(68);
          expect(point.y).toBeGreaterThanOrEqual(0);
          expect(point.y).toBeLessThanOrEqual(105);
        }
      }
      if (football.nextRestart && i < 119 && record.phase !== 60) {
        expect(state.actionLedger[i + 1].teamId).toBe(football.nextRestart.teamId);
        expect(state.actionLedger[i + 1].football.opening.type).toBe(football.nextRestart.type);
      }
      if (record.finish === 'goal') {
        const shot = football.actions.at(-1);
        expect(shot.type).toBe('shot');
        expect(shot.actorId).toBe(record.shotId);
        const passes = football.actions.filter(a => ['pass', 'cross'].includes(a.type));
        if (record.assistId) {
          expect(passes.at(-1)?.actorId).toBe(record.assistId);
          expect(passes.at(-1)?.targetId).toBe(record.shotId);
          expect(events.find(e => e.type === 'goal' && e.minute === record.minute && e.playerId === record.shotId)?.assistId).toBe(record.assistId);
        }
      }
      const shot = football.actions.find(a => a.type === 'shot');
      expect(Boolean(shot)).toBe(Boolean(record.shotId));
      if (record.outcome === 'intercepted') expect(football.actions.find(a => a.type === 'pass' && a.purpose === record.route)?.outcome).toBe('intercepted');
    }
  });
});
