import { describe, expect, it } from 'vitest';
import {
  MARKET_PAGE_SIZE,
  clampMarketPage,
  marketPageCount,
  marketPageLabel,
  marketPageRange,
  marketPageSlice,
} from './marketPagination.js';

const rows = (count) => Array.from({ length:count }, (_, i) => i);

describe('recruitment list paging', () => {
  it('pages a world-sized list a hundred rows at a time', () => {
    expect(MARKET_PAGE_SIZE).toBe(100);
    expect(marketPageCount(4812)).toBe(49);
    expect(marketPageSlice(rows(4812), 0)).toHaveLength(100);
    expect(marketPageSlice(rows(4812), 0)[0]).toBe(0);
    expect(marketPageSlice(rows(4812), 1)[0]).toBe(100);
    expect(marketPageSlice(rows(4812), 48)).toHaveLength(12);
  });

  it('always reports at least one page, even when nothing matches', () => {
    expect(marketPageCount(0)).toBe(1);
    expect(marketPageSlice([], 0)).toEqual([]);
    expect(marketPageLabel(0, 0)).toBe('No players');
  });

  it('pulls a page index back into a list that filters have shrunk', () => {
    // The manager is on page 7 when a filter cuts the list to 40 rows; landing
    // on an empty page would read as "no results" when there are plenty.
    expect(clampMarketPage(7, 40)).toBe(0);
    expect(marketPageSlice(rows(40), 7)).toHaveLength(40);
    expect(clampMarketPage(-3, 4812)).toBe(0);
    expect(clampMarketPage(999, 250)).toBe(2);
  });

  it('describes the visible range rather than only the total', () => {
    expect(marketPageLabel(0, 4812)).toBe('1–100 of 4,812');
    expect(marketPageLabel(1, 4812)).toBe('101–200 of 4,812');
    expect(marketPageLabel(48, 4812)).toBe('4,801–4,812 of 4,812');
  });

  it('clamps a range to the end of the list', () => {
    expect(marketPageRange(0, 12)).toEqual({ start:0, end:12 });
    expect(marketPageRange(2, 250)).toEqual({ start:200, end:250 });
  });
});
