/**
 * Paging for the recruitment lists.
 *
 * The Buy market used to hand every player in the world through the scouting
 * projection on each load — roughly five thousand rows, re-run on every screen
 * tick, which is what stopped the list appearing at all on a phone. Paging is
 * what makes that affordable: the list is sorted whole, but only one page of
 * rows is ever projected for display.
 *
 * Pure and DOM-free by design so the paging arithmetic is testable on its own
 * rather than living inside a component.
 */

/** One page of recruitment rows. */
export const MARKET_PAGE_SIZE = 100;

export function marketPageCount(total, pageSize = MARKET_PAGE_SIZE) {
  const rows = Math.max(0, Math.floor(Number(total) || 0));
  const size = Math.max(1, Math.floor(Number(pageSize) || MARKET_PAGE_SIZE));
  return Math.max(1, Math.ceil(rows / size));
}

/**
 * Keep a page index inside the list it belongs to. Filters change the list
 * under a manager who is already on page 7, and landing on an empty page reads
 * as "no results" when there are plenty.
 */
export function clampMarketPage(page, total, pageSize = MARKET_PAGE_SIZE) {
  const pages = marketPageCount(total, pageSize);
  const requested = Math.floor(Number(page) || 0);
  return Math.min(Math.max(requested, 0), pages - 1);
}

/** The half-open row range a page covers, already clamped to the list. */
export function marketPageRange(page, total, pageSize = MARKET_PAGE_SIZE) {
  const rows = Math.max(0, Math.floor(Number(total) || 0));
  const size = Math.max(1, Math.floor(Number(pageSize) || MARKET_PAGE_SIZE));
  const start = clampMarketPage(page, rows, size) * size;
  return { start:Math.min(start, rows), end:Math.min(start + size, rows) };
}

export function marketPageSlice(rows, page, pageSize = MARKET_PAGE_SIZE) {
  const list = Array.isArray(rows) ? rows : [];
  const { start, end } = marketPageRange(page, list.length, pageSize);
  return list.slice(start, end);
}

/** "101–200 of 4,812" for the pager's own label. */
export function marketPageLabel(page, total, pageSize = MARKET_PAGE_SIZE) {
  const rows = Math.max(0, Math.floor(Number(total) || 0));
  if (!rows) return 'No players';
  const { start, end } = marketPageRange(page, rows, pageSize);
  return `${(start + 1).toLocaleString()}–${end.toLocaleString()} of ${rows.toLocaleString()}`;
}
