import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const renderer = readFileSync(resolve(here, './playableMomentsThreeRenderer.js'), 'utf8');
const director = readFileSync(resolve(here, './playableMomentsSceneDirector.js'), 'utf8');
const matchScreen = readFileSync(resolve(here, '../lib/ui/MatchScreen.svelte'), 'utf8');
const eventPolicy = readFileSync(resolve(here, '../modules/playableMomentsCareer.js'), 'utf8');

describe('Phase 8 coherent visual system', () => {
  it('keeps one procedural humanoid ecosystem with explicit goalkeeper contrast', () => {
    expect(renderer).toContain('function makeHumanoid(');
    expect(renderer).toContain('keeper:new THREE.MeshStandardMaterial');
    expect(renderer).toContain('keeperShorts:new THREE.MeshStandardMaterial');
    expect(renderer).toContain('gloves:new THREE.MeshStandardMaterial');
    expect(renderer).toContain('makeHumanoid(materials.keeper');
  });

  it('keeps set-piece walls and ordinary chances inside the same shot renderer adapter', () => {
    expect(renderer).toContain('MAX_SET_PIECE_WALL_PLAYERS');
    expect(renderer).toContain('wallModels');
    expect(director).toContain("rendererId:scenario === 'legacy_continuation' ? 'three-continuation-legacy' : 'three-shot'");
  });

  it('keeps renderer delivery lazy rather than pulling Three.js into automatic match paths', () => {
    expect(director).toContain("await import('./playableMomentsThreeRenderer.js')");
    expect(matchScreen).not.toContain("from '../../game/playableMomentsThreeRenderer.js'");
    expect(matchScreen).not.toContain("from '../../game/playableMomentsContinuationRenderer.js'");
  });
});

describe('Phase 8 automatic-mode and event-policy independence', () => {
  it('leaves Sim Instantly and Watch Match as first-class match modes independent of presentation flags', () => {
    expect(matchScreen).toContain('onclick={simInstant}');
    expect(matchScreen).toContain('onclick={startWatch}');
    expect(matchScreen).toContain('onclick={startPlayableKeyMoments}');
    expect(matchScreen).not.toContain('readPlayablePresentationPreferences');
  });

  it('does not broaden playable selection to continuation/contact events', () => {
    expect(eventPolicy).toContain("if (interactionType === 'continuation' || interactionType === 'contact') return null");
  });
});
