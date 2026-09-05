import { describe, expect, it } from 'vitest';
import { reconcileBenchWithLineup } from './matchdaySquad.js';

const XI = ['a1','a2','a3','a4','a5','a6','a7','a8','a9','a10','a11'];
const BENCH = ['b1','b2','b3','b4','b5','b6','b7','b8','b9'];

describe('keeping a named bench in step with the XI', () => {
  it('seats the displaced starter when a substitute is promoted', () => {
    const lineup = XI.map(id => (id === 'a7' ? 'b3' : id));
    const next = reconcileBenchWithLineup(BENCH, lineup, { id:'b3' }, { id:'a7' });

    // Same length: a straight swap must not quietly shorten the bench.
    expect(next).toHaveLength(BENCH.length);
    expect(next).toEqual(['b1','b2','a7','b4','b5','b6','b7','b8','b9']);
  });

  it('leaves an automatic bench alone', () => {
    expect(reconcileBenchWithLineup(null, XI, { id:'b3' }, { id:'a7' })).toBeNull();
    expect(reconcileBenchWithLineup(undefined, XI, { id:'b3' }, { id:'a7' })).toBeUndefined();
  });

  it('drops a promoted substitute when nobody comes the other way', () => {
    const lineup = [...XI.slice(0, 10), 'b2'];
    const next = reconcileBenchWithLineup(BENCH, lineup, { id:'b2' }, null);

    expect(next).not.toContain('b2');
    expect(next).toHaveLength(BENCH.length - 1);
  });

  it('never lists a player who is now starting', () => {
    // A drag straight onto the pitch can leave several bench names in the XI.
    const lineup = ['b1','b5', ...XI.slice(2)];
    const next = reconcileBenchWithLineup(BENCH, lineup, { id:'b1' }, { id:'a1' });

    expect(next).not.toContain('b1');
    expect(next).not.toContain('b5');
    expect(next).toContain('a1');
  });

  it('does not seat a displaced starter who is already on the bench', () => {
    const bench = ['a7','b2','b3'];
    const lineup = XI.map(id => (id === 'a7' ? 'b3' : id));
    const next = reconcileBenchWithLineup(bench, lineup, { id:'b3' }, { id:'a7' });

    expect(next.filter(id => id === 'a7')).toHaveLength(1);
    expect(next).toEqual(['a7','b2']);
  });

  it('compares ids as strings, since a save may hold either', () => {
    const next = reconcileBenchWithLineup([7, 8], [1, 2, 7], { id:'7' }, { id:9 });
    expect(next).toEqual([9, 8]);
  });

  it('empties cleanly rather than returning holes', () => {
    expect(reconcileBenchWithLineup([], XI, { id:'b1' }, { id:'a1' })).toEqual([]);
  });
});
