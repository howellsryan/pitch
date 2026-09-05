/**
 * Keeping a named matchday bench honest when the starting XI moves.
 *
 * `save.bench` is a list of player ids the manager named, and the match engine
 * honours it exactly — it never quietly promotes someone they did not pick. That
 * makes it the caller's job to keep the two in step: promote a substitute into
 * the XI and their id would otherwise sit in `save.bench` where `selectBench`
 * skips it, playing the match a substitute short.
 *
 * Pure and DOM-free: this is squad arithmetic, not rendering.
 */

/**
 * @param bench      the manager's named bench, or null/undefined when automatic
 * @param lineup     the starting XI's player ids, after the change
 * @param promoted   the player moved into the XI, if any
 * @param displaced  the player they moved out of it, if any
 */
export function reconcileBenchWithLineup(bench, lineup, promoted = null, displaced = null) {
  // An automatic bench re-resolves itself from the new XI; there is nothing
  // stored to keep in step.
  if (!Array.isArray(bench)) return bench;

  const starting = new Set((lineup ?? []).map(id => String(id)));
  const promotedId = promoted?.id == null ? null : String(promoted.id);
  // Ids are compared as strings because a save may hold either, but the value
  // written back is the player's own: `selectBench` resolves it through a Map
  // keyed on the raw id, where a stringified number would miss.
  const seats = displaced?.id != null && !starting.has(String(displaced.id)) ? displaced.id : null;
  const alreadyBenched = seats != null && bench.some(id => String(id) === String(seats));

  const next = [];
  let seated = false;
  for (const id of bench) {
    const key = String(id);
    if (key === promotedId) {
      // The player coming out of the XI takes the seat, so a straight swap
      // leaves the bench exactly the size the manager named it.
      if (seats != null && !alreadyBenched && !seated) {
        next.push(seats);
        seated = true;
      }
      continue;
    }
    // Anyone else who has since ended up in the XI simply leaves the bench.
    if (!starting.has(key)) next.push(id);
  }
  return next;
}

