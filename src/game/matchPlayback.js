/** UI speed labels are relative to the watchable baseline, twice the
 * original physical presentation. Keep integration steps unchanged. */
export const MATCH_PLAYBACK_BASE_RATE = 2;
export function matchPlaybackRate(multiplier = 1) {
  return MATCH_PLAYBACK_BASE_RATE * ([1,2,4].includes(multiplier) ? multiplier : 1);
}

export function matchPlaybackElapsed(elapsedMs, multiplier = 1) {
  return Math.min(100,Math.max(0,Number(elapsedMs)||0)) * matchPlaybackRate(multiplier);
}
