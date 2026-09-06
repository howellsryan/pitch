/**
 * Presentation-only football clock for the live match route.
 *
 * The authoritative match engine remains 120 regulation phases. This module
 * only maps those phases onto football-style period labels, including
 * deterministic stoppage time, so presentation can show 45+N / 90+N without
 * changing simulation RNG, action packets or result timing.
 */

export const REGULATION_PHASES = 120;
export const REGULATION_HALF_PHASES = REGULATION_PHASES / 2;

const PERIOD_STARTS = Object.freeze({
  first:0,
  second:45,
  extra_first:90,
  extra_second:105,
});

function clockHash(input) {
  let hash = 2166136261;
  for (const character of String(input ?? '')) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function periodStartMinute(period) {
  return PERIOD_STARTS[period] ?? 0;
}

export function regulationAddedTime(seed, half) {
  const roll = clockHash(`${seed ?? 1}:added-time:${half}`);
  if (half === 1) return 1 + (roll % 3); // 1–3
  return 2 + (roll % 5); // 2–6
}

function firstHalfClock(phase, added) {
  const corePhases = REGULATION_HALF_PHASES - added;
  if (phase > corePhases) {
    const plus = Math.min(added, Math.max(1, phase - corePhases));
    return { period:'first', minute:45, added:plus, label:`45+${plus}` };
  }
  const minute = Math.max(0, Math.min(45, Math.ceil((phase / Math.max(1, corePhases)) * 45)));
  return { period:'first', minute, added:0, label:String(minute) };
}

function secondHalfClock(phase, added) {
  const localIndex = Math.max(0, phase - REGULATION_HALF_PHASES - 1);
  const corePhases = REGULATION_HALF_PHASES - added;
  if (localIndex >= corePhases) {
    const plus = Math.min(added, localIndex - corePhases + 1);
    return { period:'second', minute:90, added:plus, label:`90+${plus}` };
  }
  const denominator = Math.max(1, corePhases - 1);
  const minute = 45 + Math.ceil((localIndex / denominator) * 45);
  return { period:'second', minute:Math.min(90, minute), added:0, label:String(Math.min(90, minute)) };
}

export function regulationClockForPhase(phase, { seed = 1, secondHalfStarted = false } = {}) {
  const safePhase = Math.max(0, Math.min(REGULATION_PHASES, Number(phase) || 0));
  if (secondHalfStarted && safePhase <= REGULATION_HALF_PHASES) {
    return { period:'second', minute:45, added:0, label:'45' };
  }
  if (safePhase <= REGULATION_HALF_PHASES) {
    return firstHalfClock(safePhase, regulationAddedTime(seed, 1));
  }
  return secondHalfClock(safePhase, regulationAddedTime(seed, 2));
}

/**
 * Generic period anchor for future/competition extra-time presentation. The
 * current match engine still owns regulation only; this does not add ET phases.
 */
export function periodClock(period, elapsedMinutes = 0, addedMinutes = 0) {
  const start = periodStartMinute(period);
  const elapsed = Math.max(0, Number(elapsedMinutes) || 0);
  const added = Math.max(0, Number(addedMinutes) || 0);
  const minute = start + elapsed;
  return {
    period,
    minute,
    added,
    label:added > 0 ? `${minute}+${added}` : String(minute),
  };
}
