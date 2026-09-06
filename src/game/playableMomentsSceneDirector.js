import {
  browserPresentationCapabilities,
  isPlayablePresentationScenarioEnabled,
  normalizePlayablePresentationPreferences,
  presentationQualityProfile,
  resolvePresentationQuality,
  resolvePresentationReducedMotion,
} from './playableMomentsPresentationPreferences.js';

export const PLAYABLE_PRESENTATION_VERSION = 1;

export function playablePresentationScenario(moment = {}) {
  if (moment?.interactionType === 'continuation') return 'legacy_continuation';
  if (moment?.interactionType === 'contact') return 'legacy_contact';
  if (
    moment?.interactionType === 'shootout'
    || moment?.kickId
    || moment?.shootoutId
    || moment?.route === 'competition_shootout'
    || moment?.route === 'penalty_shootout'
  ) return 'shootout';
  if (moment?.setPiece?.kind === 'direct_free_kick') return 'direct_free_kick';
  if (moment?.setPiece?.kind === 'penalty') return 'penalty';
  return 'open_play';
}

function cameraRecipe(scenario, mode) {
  if (scenario === 'direct_free_kick') return { id:'set-piece-wide', fov:46, focus:'goal-and-wall' };
  if (scenario === 'penalty' || scenario === 'shootout') return { id:'penalty-end', fov:44, focus:mode === 'goalkeeper' ? 'keeper-read' : 'goal-mouth' };
  if (scenario === 'legacy_continuation') return { id:'legacy-continuation', fov:48, focus:'passing-lane' };
  return { id:'chance-end', fov:46, focus:mode === 'goalkeeper' ? 'keeper-read' : 'goal-mouth' };
}

function interactionFamily(moment, scenario) {
  if (scenario === 'legacy_continuation') return 'continuation';
  if (scenario === 'legacy_contact') return 'contact';
  if (moment?.mode === 'goalkeeper') return 'goalkeeper';
  return 'attack';
}

function replayRecipe(moment, scenario, enabled) {
  const minute = Number(moment?.minute ?? 0);
  const highDrama = scenario === 'shootout' || scenario === 'penalty' || minute >= 80;
  return {
    enabled,
    maxReplays:3,
    variant:highDrama ? 'dramatic' : 'standard',
    durationMs:highDrama ? 2350 : 1850,
    resultHoldMs:highDrama ? 520 : 280,
    camera:highDrama ? 'tight-result' : 'repeat-primary',
  };
}

export function buildPlayableScenePlan({
  moment = {},
  preferences = {},
  capabilities = browserPresentationCapabilities(),
  systemReducedMotion = false,
} = {}) {
  const normalizedPreferences = normalizePlayablePresentationPreferences(preferences);
  const scenario = playablePresentationScenario(moment);
  const compatibilityOnly = scenario.startsWith('legacy_');
  const qualityTier = resolvePresentationQuality(normalizedPreferences, capabilities);
  const quality = presentationQualityProfile(qualityTier);
  const reducedMotion = resolvePresentationReducedMotion(normalizedPreferences, systemReducedMotion);
  const enabled = compatibilityOnly
    ? true
    : isPlayablePresentationScenarioEnabled(normalizedPreferences, scenario);

  return {
    version:PLAYABLE_PRESENTATION_VERSION,
    scenario,
    compatibilityOnly,
    enabled,
    rendererId:scenario === 'legacy_continuation' ? 'three-continuation-legacy' : 'three-shot',
    interaction:interactionFamily(moment, scenario),
    camera:cameraRecipe(scenario, moment?.mode),
    quality,
    reducedMotion,
    audio:{ enabled:normalizedPreferences.audioEnabled, volume:normalizedPreferences.audioVolume },
    replay:replayRecipe(moment, scenario, normalizedPreferences.replayEnabled && !reducedMotion),
  };
}

export async function mountPlayableSceneRenderer(canvas, moment, plan) {
  if (!plan?.enabled) throw new Error('PLAYABLE_PRESENTATION_DISABLED');
  const options = { quality:plan.quality, presentationVersion:plan.version, scenario:plan.scenario, camera:plan.camera };
  if (plan.rendererId === 'three-continuation-legacy') {
    const module = await import('./playableMomentsContinuationRenderer.js');
    return module.mountThreePlayableContinuation(canvas, moment, options);
  }
  const module = await import('./playableMomentsThreeRenderer.js');
  return module.mountThreePlayablePoc(canvas, moment, options);
}
