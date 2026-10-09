import { describe, expect, it } from 'vitest';
import { lineupAvailability } from './matchLineupAvailability.js';

function squad() {
  return ['GK','RB','CB','CB','LB','CM','CDM','CM','RW','ST','LW'].map((position, index) => ({
    id:`p${index}`, teamId:'club', position, inSquad:true, fitness:90,
    attack:70, midfield:70, defence:70, goalkeeping:70,
  }));
}

describe('team-news lineup availability', () => {
  it.each([null, undefined])('allows an automatic XI after a handover or formation reset (%s)', lineup => {
    const players = squad();
    expect(lineupAvailability(lineup, players, '4-2-3-1').lineupBlocked).toBe(false);
    expect(players.every(player => player.inSquad)).toBe(true);
  });

  it('blocks an automatic selection with fewer than eleven available players', () => {
    expect(lineupAvailability(null, squad().slice(0, 10)).lineupBlocked).toBe(true);
  });

  it('allows a complete named starting XI', () => {
    const players = squad();
    expect(lineupAvailability(players.map(player => player.id), players).lineupBlocked).toBe(false);
  });

  it.each([
    [], ['p0'], Array(11).fill('p0'), [...Array.from({ length:10 }, (_, index) => `p${index}`), 'departed'],
  ].map(lineup => [lineup]))('blocks incomplete, duplicate or departed named selections (%j)', lineup => {
    expect(lineupAvailability(lineup, squad()).lineupBlocked).toBe(true);
  });

  it('keeps an explicit injured selection blocked instead of silently replacing it', () => {
    const players = squad();
    players[1].injured = true;
    const result = lineupAvailability(players.map(player => player.id), players);
    expect(result.lineupBlocked).toBe(true);
    expect(result.injuredInLineup).toEqual([players[1]]);
  });

  it('blocks and explains an explicit suspended selection', () => {
    const players = squad();
    players[1].suspended = true;
    const result = lineupAvailability(players.map(player => player.id), players);
    expect(result.lineupBlocked).toBe(true);
    expect(result.suspendedInLineup).toEqual([players[1]]);
  });

  it.each([{ inSquad:false }, { isYouth:true, youthTeamId:'club' }])('blocks a named player outside the senior squad (%j)', flags => {
    const players = squad();
    Object.assign(players[1], flags);
    expect(lineupAvailability(players.map(player => player.id), players).lineupBlocked).toBe(true);
  });

  it('uses healthy available reserves for an automatic selection', () => {
    const players = squad();
    players[1].injured = true;
    players[2].suspended = true;
    players.push({ ...players[1], id:'reserve1', injured:false }, { ...players[2], id:'reserve2', suspended:false });
    expect(lineupAvailability(null, players).lineupBlocked).toBe(false);
  });
});
