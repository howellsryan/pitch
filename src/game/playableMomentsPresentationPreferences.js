export const PLAYABLE_PRESENTATION_PREFERENCES_VERSION = 1;
export const PLAYABLE_PRESENTATION_STORAGE_KEY = 'pitch.playablePresentation.v1';

export const PLAYABLE_PRESENTATION_QUALITY = Object.freeze(['auto', 'low', 'medium', 'high']);
export const PLAYABLE_PRESENTATION_MOTION = Object.freeze(['system', 'full', 'reduced']);
export const PLAYABLE_PRESENTATION_SCENARIOS = Object.freeze([
  'open_play',
  'direct_free_kick',
  'penalty',
  'shootout',
]);

export const DEFAULT_PLAYABLE_PRESENTATION_PREFERENCES = Object.freeze({
  version:PLAYABLE_PRESENTATION_PREFERENCES_VERSION,
  enabled:true,
  quality:'auto',
  motion:'system',
  audioEnabled:true,
  audioVolume:.45,
  replayEnabled:true,
  scenarios:Object.freeze({
    open_play:true,
    direct_free_kick:true,
    penalty:true,
    shootout:true,
  }),
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function browserStorage() {
  try { return globalThis.localStorage ?? null; }
  catch { return null; }
}

export function normalizePlayablePresentationPreferences(value = {}) {
  const quality = PLAYABLE_PRESENTATION_QUALITY.includes(value?.quality)
    ? value.quality
    : DEFAULT_PLAYABLE_PRESENTATION_PREFERENCES.quality;
  const motion = PLAYABLE_PRESENTATION_MOTION.includes(value?.motion)
    ? value.motion
    : DEFAULT_PLAYABLE_PRESENTATION_PREFERENCES.motion;
  const scenarios = Object.fromEntries(PLAYABLE_PRESENTATION_SCENARIOS.map(key => [
    key,
    value?.scenarios?.[key] !== false,
  ]));

  return {
    version:PLAYABLE_PRESENTATION_PREFERENCES_VERSION,
    enabled:value?.enabled !== false,
    quality,
    motion,
    audioEnabled:value?.audioEnabled !== false,
    audioVolume:Number(clamp(finite(value?.audioVolume, DEFAULT_PLAYABLE_PRESENTATION_PREFERENCES.audioVolume), 0, 1).toFixed(2)),
    replayEnabled:value?.replayEnabled !== false,
    scenarios,
  };
}

export function resolvePresentationReducedMotion(preferences, systemReducedMotion = false) {
  const normalized = normalizePlayablePresentationPreferences(preferences);
  if (normalized.motion === 'reduced') return true;
  if (normalized.motion === 'full') return false;
  return Boolean(systemReducedMotion);
}

export function resolvePresentationQuality(preferences, capabilities = {}) {
  const normalized = normalizePlayablePresentationPreferences(preferences);
  if (normalized.quality !== 'auto') return normalized.quality;

  const deviceMemory = finite(capabilities.deviceMemory, 4);
  const hardwareConcurrency = finite(capabilities.hardwareConcurrency, 4);
  const devicePixelRatio = finite(capabilities.devicePixelRatio, 1);
  const webgl = capabilities.webgl !== false;

  if (!webgl || deviceMemory <= 2 || hardwareConcurrency <= 2) return 'low';
  if (deviceMemory >= 8 && hardwareConcurrency >= 8 && devicePixelRatio <= 2.5) return 'high';
  return 'medium';
}

export function presentationQualityProfile(tier = 'medium') {
  const profiles = {
    low:{ tier:'low', targetFps:30, maxPixelRatio:1, antialias:false, shadows:false, geometryDetail:.65, atmosphere:false },
    medium:{ tier:'medium', targetFps:45, maxPixelRatio:1.25, antialias:true, shadows:true, geometryDetail:.85, atmosphere:true },
    high:{ tier:'high', targetFps:60, maxPixelRatio:1.5, antialias:true, shadows:true, geometryDetail:1, atmosphere:true },
  };
  return { ...(profiles[tier] ?? profiles.medium) };
}

export function isPlayablePresentationScenarioEnabled(preferences, scenarioFamily) {
  const normalized = normalizePlayablePresentationPreferences(preferences);
  if (!normalized.enabled) return false;
  if (!PLAYABLE_PRESENTATION_SCENARIOS.includes(scenarioFamily)) return false;
  return normalized.scenarios[scenarioFamily] !== false;
}

export function readPlayablePresentationPreferences(storage) {
  const target = storage === undefined ? browserStorage() : storage;
  if (!target?.getItem) return normalizePlayablePresentationPreferences();
  try {
    const raw = target.getItem(PLAYABLE_PRESENTATION_STORAGE_KEY);
    return raw ? normalizePlayablePresentationPreferences(JSON.parse(raw)) : normalizePlayablePresentationPreferences();
  } catch {
    return normalizePlayablePresentationPreferences();
  }
}

export function writePlayablePresentationPreferences(preferences, storage) {
  const normalized = normalizePlayablePresentationPreferences(preferences);
  const target = storage === undefined ? browserStorage() : storage;
  try { target?.setItem?.(PLAYABLE_PRESENTATION_STORAGE_KEY, JSON.stringify(normalized)); } catch { /* optional local preference */ }
  return normalized;
}

export function browserPresentationCapabilities(navigatorLike = globalThis?.navigator, windowLike = globalThis?.window) {
  return {
    deviceMemory:finite(navigatorLike?.deviceMemory, 4),
    hardwareConcurrency:finite(navigatorLike?.hardwareConcurrency, 4),
    devicePixelRatio:finite(windowLike?.devicePixelRatio, 1),
    webgl:true,
  };
}
