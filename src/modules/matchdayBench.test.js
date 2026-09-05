import { describe, expect, it } from 'vitest';
import { MAX_MATCHDAY_BENCH, pruneBenchToSquad, selectBench, selectEleven, selectReserves, simulateMatch } from './matchEngine.js';

function makePlayer(id, position, rating, extra = {}) {
  return {
    id,
    name:id,
    position,
    age:24,
    attack:['ST','CF','RW','LW','CAM'].includes(position) ? rating : rating - 12,
    midfield:['CM','CDM','CAM','RM','LM','RW','LW'].includes(position) ? rating : rating - 9,
    defence:['CB','RB','LB','CDM'].includes(position) ? rating : rating - 15,
    goalkeeping:position === 'GK' ? rating : 8,
    fitness:88,
    form:6,
    injured:false,
    suspended:false,
    inSquad:true,
    ...extra,
  };
}

/** 26 players: an XI, a full bench and a genuine reserve group behind it. */
function makeSquad(prefix = 'p') {
  const positions = [
    'GK','GK','GK','CB','CB','CB','CB','RB','RB','LB','LB','CDM','CDM',
    'CM','CM','CM','CAM','CAM','RW','RW','LW','LW','ST','ST','CF','RM',
  ];
  return positions.map((position, index) => makePlayer(
    `${prefix}_${String(index).padStart(2, '0')}`,
    position,
    // Descending so bench order is unambiguous and easy to assert against.
    90 - index,
  ));
}

describe('matchday bench', () => {
  it('caps the automatic bench at a realistic matchday size', () => {
    // `null` means "pick for me" — an untouched career keeps that behaviour.
    const squad = makeSquad();
    const eleven = selectEleven(squad, '4-3-3');
    const bench = selectBench(squad, eleven);

    expect(squad.length - eleven.length).toBeGreaterThan(MAX_MATCHDAY_BENCH);
    expect(bench).toHaveLength(MAX_MATCHDAY_BENCH);
    expect(bench.some(player => eleven.some(starter => starter.id === player.id))).toBe(false);
  });

  it('always leaves a seat for a reserve goalkeeper', () => {
    // A real squad's backup keeper is rated below its nine best outfielders, so
    // taking the top nine by rating alone benches no keeper at all — and
    // substitutions are GK-for-GK only, leaving an injured keeper unreplaceable.
    const squad = makeSquad().map(player => (
      player.position === 'GK' && player.id !== 'p_00' ? { ...player, goalkeeping:52 } : player
    ));
    const eleven = selectEleven(squad, '4-3-3');
    const bench = selectBench(squad, eleven);

    expect(bench.filter(player => player.position === 'GK').length).toBeGreaterThanOrEqual(1);
    // The keeper takes the last seat, so the three a match can actually reach
    // are the same outfielders as before.
    expect(bench.at(-1).position).toBe('GK');
    expect(bench.slice(0, 3).some(player => player.position === 'GK')).toBe(false);
    expect(bench).toHaveLength(MAX_MATCHDAY_BENCH);
  });

  it('does not invent a keeper when the club has none spare', () => {
    const squad = makeSquad().filter(player => player.position !== 'GK' || player.id === 'p_00');
    const eleven = selectEleven(squad, '4-3-3');
    const bench = selectBench(squad, eleven);

    expect(bench.some(player => player.position === 'GK')).toBe(false);
    expect(bench).toHaveLength(MAX_MATCHDAY_BENCH);
  });

  it('names the manager’s chosen substitutes first, in the order they picked', () => {
    const squad = makeSquad();
    const eleven = selectEleven(squad, '4-3-3');
    const automatic = selectBench(squad, eleven);
    const reserves = selectReserves(squad, eleven, automatic);
    expect(reserves.length).toBeGreaterThan(0);

    const chosen = [reserves[1].id, reserves[0].id];
    const bench = selectBench(squad, eleven, chosen);

    expect(bench.map(player => player.id)).toEqual(chosen);
  });

  it('leaves a named substitute’s seat empty when they are unavailable', () => {
    const squad = makeSquad();
    const eleven = selectEleven(squad, '4-3-3');
    const automatic = selectBench(squad, eleven);
    const named = automatic.map(player => player.id);
    const injuredId = named[0];
    const withInjury = squad.map(player => (player.id === injuredId ? { ...player, injured:true } : player));

    const bench = selectBench(withInjury, eleven, named);

    // A knock shortens the bench rather than silently promoting someone the
    // manager did not name, exactly as it would on a real team sheet.
    expect(bench.map(player => player.id)).not.toContain(injuredId);
    expect(bench).toHaveLength(named.length - 1);
    expect(bench[0].id).toBe(named[1]);
  });

  it('removes a substitute the manager drops instead of re-adding the best reserve', () => {
    const squad = makeSquad();
    const eleven = selectEleven(squad, '4-3-3');
    const named = selectBench(squad, eleven).map(player => player.id);

    const afterRemoval = selectBench(squad, eleven, named.filter(id => id !== named[0]));

    expect(afterRemoval).toHaveLength(named.length - 1);
    expect(afterRemoval.map(player => player.id)).not.toContain(named[0]);
  });

  it('ignores a duplicated or unknown id in a stored selection', () => {
    const squad = makeSquad();
    const eleven = selectEleven(squad, '4-3-3');
    const automatic = selectBench(squad, eleven);
    const pick = automatic[2].id;

    const bench = selectBench(squad, eleven, [pick, pick, 'sold_last_window', eleven[0].id]);

    // A duplicate, a player sold since the bench was named, and a name now in
    // the XI are each skipped rather than producing a phantom substitute.
    expect(bench.map(player => player.id)).toEqual([pick]);
  });

  it('treats everyone not starting or benched as a reserve', () => {
    const squad = makeSquad();
    const eleven = selectEleven(squad, '4-3-3');
    const bench = selectBench(squad, eleven);
    const reserves = selectReserves(squad, eleven, bench);

    expect(eleven.length + bench.length + reserves.length).toBe(squad.length);
    const named = new Set([...eleven, ...bench].map(player => player.id));
    expect(reserves.some(player => named.has(player.id))).toBe(false);
  });

  it('drops a named substitute who has left the club, and only them', () => {
    const squad = makeSquad();
    const named = ['p_20','p_21','p_22','p_23'];
    const sold = squad.filter(player => player.id !== 'p_21');

    const pruned = pruneBenchToSquad(named, sold);

    expect(pruned).toEqual(['p_20','p_22','p_23']);
    // An injured substitute is still at the club and keeps their seat.
    const injured = squad.map(player => (player.id === 'p_22' ? { ...player, injured:true } : player));
    expect(pruneBenchToSquad(named, injured)).toBe(named);
  });

  it('returns the same bench reference when nothing is stale, so callers can skip the write', () => {
    const squad = makeSquad();
    const named = ['p_20','p_21'];
    expect(pruneBenchToSquad(named, squad)).toBe(named);
    expect(pruneBenchToSquad(null, squad)).toBeNull();
    expect(pruneBenchToSquad([], squad)).toEqual([]);
  });

  it('never reaches past the front of an AI bench, which is why capping it is outcome-neutral', () => {
    const home = { id:'home', name:'Home', reputation:76, league:'Premier League' };
    const away = { id:'away', name:'Away', reputation:74, league:'Premier League' };
    const homePlayers = makeSquad('h');
    const awayPlayers = makeSquad('a');

    const result = simulateMatch(home, away, homePlayers, awayPlayers, '4-3-3', '4-3-3', null, null, undefined, undefined, { seed:4242 });
    const benchIdsFor = (players) => selectBench(players, selectEleven(players, '4-3-3')).map(player => player.id);
    const benches = { home:benchIdsFor(homePlayers), away:benchIdsFor(awayPlayers) };

    for (const [side, teamId] of [['home','home'], ['away','away']]) {
      const usedIn = result.events.filter(event => event.type === 'sub' && event.teamId === teamId).map(event => event.inId);
      // Three substitutes, taken off the front of a rating-sorted bench: no
      // match can reach a tenth name, so the cap cannot change any outcome.
      expect(usedIn.length).toBeLessThanOrEqual(3);
      for (const id of usedIn) expect(benches[side].indexOf(id)).toBeLessThan(3);
    }
  });
});
