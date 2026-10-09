import { decodeStorageGraph, encodeStorageGraph } from './playerStorageCodec.js';

/** Archive rows reuse the published graph codec; file/cloud history is canonical. */
export function encodeStoredSeason(season) {
  const row = { __pitchSeasonStorage:2, payload:encodeStorageGraph(season) };
  if (season.id !== undefined) row.id = season.id;
  return row;
}

export function decodeStoredSeason(row) {
  if (!row || !Object.hasOwn(row, '__pitchSeasonStorage')) return row;
  const season = decodeStorageGraph(row.payload, row.__pitchSeasonStorage);
  if (season.id !== undefined && season.id !== row.id) throw new Error('Stored season index does not match. Restore a file backup.');
  // An add() without a supplied key assigns the ID to the physical wrapper.
  // Inject it in the same position native IndexedDB used for canonical rows.
  if (season.id === undefined && row.id !== undefined) season.id = row.id;
  return season;
}
