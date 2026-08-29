import { describe, expect, it } from 'vitest';
import { makeBroadcastFrame } from './matchPresentation.js';
const side = id => ['GK','RB','CB','CB','LB','CM','CDM','CM','RW','ST','LW'].map((position, i) => ({ id:`${id}-${i}`, name:`${id}-${i}`, position }));
describe('makeBroadcastFrame', () => {
  const base = { phase: 10, possessionTeamId:'home', homeTeamId:'home', homeFormation:'4-3-3', awayFormation:'4-3-3', homePlayers:side('h'), awayPlayers:side('a') };
  it('renders all 22 players deterministically', () => { const frame = makeBroadcastFrame(base); expect(frame.markers).toHaveLength(22); expect(frame).toEqual(makeBroadcastFrame(base)); });
  it('uses the real scorer and goal target for a goal event', () => { const frame = makeBroadcastFrame({ ...base, event:{type:'goal',playerId:'h-9',assistId:'h-5'} }); expect(frame.ball).toMatchObject({x:50,y:3,shooting:true}); expect(frame.ball.from.id).toBe('h-5'); expect(frame.ball.to.id).toBe('h-9'); });
});
