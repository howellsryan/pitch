import { describe, expect, it } from 'vitest';
import {
  normalizePlayablePresentationPreferences,
  presentationQualityProfile,
  resolvePresentationQuality,
  resolvePresentationReducedMotion,
} from './playableMomentsPresentationPreferences.js';
import { buildPlayableScenePlan, playablePresentationScenario } from './playableMomentsSceneDirector.js';

function moment(overrides = {}) {
  return {
    version:3,
    phase:48,
    minute:36,
    mode:'attack',
    shooterId:'a',
    goalkeeperId:'g',
    xg:.24,
    geometry:{ goal:{ width:7.32, height:2.44 }, distance:11, ball:{ x:0, y:.11, z:11 } },
    ...overrides,
  };
}

describe('Phase 8 presentation preferences', () => {
  it('normalizes corrupt settings without leaking unknown scenario switches', () => {
    expect(normalizePlayablePresentationPreferences({
      quality:'cinema', motion:'warp', audioVolume:7,
      scenarios:{ open_play:false, unknown:false },
    })).toMatchObject({
      version:1,
      quality:'auto',
      motion:'system',
      audioVolume:1,
      scenarios:{ open_play:false, direct_free_kick:true, penalty:true, shootout:true },
    });
  });

  it('resolves bounded quality tiers without touching football data', () => {
    expect(resolvePresentationQuality({ quality:'auto' }, { deviceMemory:2, hardwareConcurrency:8, devicePixelRatio:1, webgl:true })).toBe('low');
    expect(resolvePresentationQuality({ quality:'auto' }, { deviceMemory:8, hardwareConcurrency:8, devicePixelRatio:2, webgl:true })).toBe('high');
    expect(resolvePresentationQuality({ quality:'auto' }, { deviceMemory:4, hardwareConcurrency:4, devicePixelRatio:3, webgl:true })).toBe('medium');
    expect(presentationQualityProfile('low')).toMatchObject({ maxPixelRatio:1, shadows:false });
    expect(presentationQualityProfile('high').maxPixelRatio).toBeLessThanOrEqual(1.5);
  });

  it('honours explicit motion preference ahead of the system setting', () => {
    expect(resolvePresentationReducedMotion({ motion:'system' }, true)).toBe(true);
    expect(resolvePresentationReducedMotion({ motion:'full' }, true)).toBe(false);
    expect(resolvePresentationReducedMotion({ motion:'reduced' }, false)).toBe(true);
  });
});

describe('Phase 8 pure scene director', () => {
  it('classifies current supported shot families and legacy compatibility families', () => {
    expect(playablePresentationScenario(moment())).toBe('open_play');
    expect(playablePresentationScenario(moment({ setPiece:{ kind:'direct_free_kick' } }))).toBe('direct_free_kick');
    expect(playablePresentationScenario(moment({ setPiece:{ kind:'penalty' } }))).toBe('penalty');
    expect(playablePresentationScenario(moment({ kickId:'shootout:kick:1', setPiece:{ kind:'penalty' } }))).toBe('shootout');
    expect(playablePresentationScenario(moment({ interactionType:'continuation' }))).toBe('legacy_continuation');
    expect(playablePresentationScenario(moment({ interactionType:'contact' }))).toBe('legacy_contact');
  });

  it('builds a presentation plan without mutating the authoritative moment or preferences', () => {
    const authoritativeMoment = moment({ setPiece:{ kind:'penalty' }, geometry:{ goal:{ width:7.32, height:2.44 }, distance:11 } });
    const preferences = { quality:'low', motion:'reduced', audioEnabled:false, scenarios:{ penalty:true } };
    const beforeMoment = structuredClone(authoritativeMoment);
    const beforePreferences = structuredClone(preferences);
    const plan = buildPlayableScenePlan({ authoritativeMoment, moment:authoritativeMoment, preferences, capabilities:{ webgl:true } });

    expect(plan).toMatchObject({
      version:1,
      scenario:'penalty',
      rendererId:'three-shot',
      quality:{ tier:'low', shadows:false },
      reducedMotion:true,
      audio:{ enabled:false },
    });
    expect(authoritativeMoment).toEqual(beforeMoment);
    expect(preferences).toEqual(beforePreferences);
  });

  it('uses rollout switches only to disable presentation, never to rewrite scenario authority', () => {
    const authoritativeMoment = moment({ setPiece:{ kind:'direct_free_kick' } });
    const plan = buildPlayableScenePlan({
      moment:authoritativeMoment,
      preferences:{ enabled:true, scenarios:{ direct_free_kick:false } },
      capabilities:{ webgl:true },
    });
    expect(plan.scenario).toBe('direct_free_kick');
    expect(plan.enabled).toBe(false);
    expect(authoritativeMoment.setPiece.kind).toBe('direct_free_kick');
  });

  it('keeps old continuation scenes compatibility-readable without reclassifying them as current rollout families', () => {
    const plan = buildPlayableScenePlan({
      moment:moment({ interactionType:'continuation', continuationType:'through_ball' }),
      preferences:{ enabled:false },
      capabilities:{ webgl:true },
    });
    expect(plan).toMatchObject({ scenario:'legacy_continuation', compatibilityOnly:true, enabled:true, rendererId:'three-continuation-legacy' });
  });
});
