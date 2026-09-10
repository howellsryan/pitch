export const PLAYABLE_PRESENTATION_DIAGNOSTIC_LIMIT = 32;
const ALLOWED_TYPES = new Set(['load_start', 'renderer_ready', 'renderer_fallback', 'result_presented', 'replay']);
const ALLOWED_SCENARIOS = new Set(['open_play', 'direct_free_kick', 'penalty', 'shootout', 'legacy_continuation', 'legacy_contact']);
const ALLOWED_QUALITY = new Set(['low', 'medium', 'high']);
let events = [];

function boundedNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(min, Math.min(max, Math.round(number)));
}

export function sanitizePlayablePresentationDiagnostic(event = {}) {
  if (!ALLOWED_TYPES.has(event.type)) return null;
  return {
    type:event.type,
    version:boundedNumber(event.version, 1, 99) ?? 1,
    scenario:ALLOWED_SCENARIOS.has(event.scenario) ? event.scenario : 'open_play',
    quality:ALLOWED_QUALITY.has(event.quality) ? event.quality : 'medium',
    durationMs:boundedNumber(event.durationMs, 0, 60000),
    fallback:Boolean(event.fallback),
    replayCount:boundedNumber(event.replayCount, 0, 3) ?? 0,
  };
}

export function recordPlayablePresentationDiagnostic(event) {
  const sanitized = sanitizePlayablePresentationDiagnostic(event);
  if (!sanitized) return null;
  events = [...events, sanitized].slice(-PLAYABLE_PRESENTATION_DIAGNOSTIC_LIMIT);
  return { ...sanitized };
}

export function playablePresentationDiagnosticsSnapshot() {
  return events.map(event => ({ ...event }));
}

export function resetPlayablePresentationDiagnostics() {
  events = [];
}
