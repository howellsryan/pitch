import { describe, expect, it } from 'vitest';
import { deriveGoalMotion } from './matchMotion.js';
const xi = [{id:'gk',position:'GK',name:'Keeper'},{id:'rb',position:'RB',name:'Right Back'},{id:'cb1',position:'CB',name:'Centre Back'},{id:'cb2',position:'CB',name:'Other Centre Back'},{id:'lb',position:'LB',name:'Left Back'},{id:'cm1',position:'CM',name:'Midfielder One'},{id:'dm',position:'CDM',name:'Anchor'},{id:'cm2',position:'CM',name:'Midfielder Two'},{id:'rw',position:'RW',name:'Winger'},{id:'st',position:'ST',name:'Scorer'},{id:'lw',position:'LW',name:'Left Winger'}];
describe('deriveGoalMotion', () => {
  const event = { type:'goal', minute:63, playerId:'st', playerName:'Scorer', assistId:'cm1', assistName:'Midfielder One' };
  it('is deterministic for the same engine event', () => expect(deriveGoalMotion(event, '4-3-3', xi)).toEqual(deriveGoalMotion(event, '4-3-3', xi)));
  it('uses the real assister and scorer before the goal', () => { const path = deriveGoalMotion(event, '4-3-3', xi); expect(path[0]).toMatchObject({playerId:'cm1',playerName:'Midfielder One'}); expect(path.some(p => p.playerId === 'st' && p.playerName === 'Scorer')).toBe(true); expect(path.at(-1)).toMatchObject({playerId:'goal',x:50,y:4}); });
  it('mirrors the goal direction for the away attack', () => expect(deriveGoalMotion(event, '4-3-3', xi, {attackingUp:false}).at(-1)).toMatchObject({y:96}));
});
