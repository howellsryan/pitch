import { describe, expect, it } from 'vitest';
import { matchPlaybackElapsed, matchPlaybackRate } from './matchPlayback.js';

describe('watchable match playback',()=>{
  it.each([[1,4],[2,8],[4,16]])('scales the labelled%s× pace to%s× physical time', (label,rate)=>{
    expect(matchPlaybackRate(label)).toBe(rate);
    expect(matchPlaybackElapsed(20,label)).toBe(20*rate);
  });
  it('bounds frame stalls and invalid rates without changing the physical step',()=>{
    expect(matchPlaybackElapsed(10000,4)).toBe(1600);
    expect(matchPlaybackElapsed(-1,1)).toBe(0);
    expect(matchPlaybackElapsed(NaN,1)).toBe(0);
    expect(matchPlaybackRate(0)).toBe(4);
  });
});
