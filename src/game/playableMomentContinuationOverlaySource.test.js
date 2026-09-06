import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const overlay = readFileSync(resolve(here, '../lib/ui/PlayableMomentOverlay.svelte'), 'utf8');
const director = readFileSync(resolve(here, 'playableMomentsSceneDirector.js'), 'utf8');
const renderer = readFileSync(resolve(here, 'playableMomentsContinuationRenderer.js'), 'utf8');

function functionSource(source, name, length = 2600) {
  const start = source.indexOf(`function ${name}`);
  const asyncStart = source.indexOf(`async function ${name}`);
  const actualStart = start === -1 ? asyncStart : asyncStart === -1 ? start : Math.min(start, asyncStart);
  return actualStart === -1 ? '' : source.slice(actualStart, actualStart + length);
}

describe('Phase 5 continuation overlay authority boundary', () => {
  it('keeps the dedicated continuation renderer lazy behind the Phase 8 scene director', () => {
    const mount = functionSource(overlay, 'mountRenderer', 2400);
    const adapter = functionSource(director, 'mountPlayableSceneRenderer', 1800);
    expect(overlay).toContain("moment?.interactionType === 'continuation'");
    expect(mount).toContain('mountPlayableSceneRenderer(canvas, moment, scenePlan)');
    expect(adapter).toContain("plan.rendererId === 'three-continuation-legacy'");
    expect(adapter).toContain("await import('./playableMomentsContinuationRenderer.js')");
    expect(adapter).toContain('mountThreePlayableContinuation');
    expect(adapter).toContain("await import('./playableMomentsThreeRenderer.js')");
    expect(adapter).toContain('mountThreePlayablePoc');
  });

  it('returns only target, weight and timing for a continuation and never a receiver id', () => {
    const accessible = functionSource(overlay, 'accessibleIntent', 1800);
    const pointer = functionSource(overlay, 'pointerUp', 3200);
    expect(accessible).toContain('continuation:{');
    expect(accessible).toContain('targetX:');
    expect(accessible).toContain('targetY:');
    expect(accessible).toContain('weight:');
    expect(accessible).toContain('timing:.82');
    expect(pointer).toContain('continuationIntentFromClientPoint');
    expect(pointer).toContain('continuation:{');
    expect(accessible).not.toContain('receiverId');
    expect(pointer).not.toContain('receiverId');
  });

  it('renders the domain-authorized receiver and interceptor rather than selecting presentation participants', () => {
    expect(renderer).toContain('const receiverPose = geometry.receiver');
    expect(renderer).toContain('const defenderPose = geometry.interceptor');
    expect(renderer).not.toContain('chooseReceiver');
    expect(renderer).not.toContain('receiverId:');
    expect(renderer).not.toContain('Math.random');
  });

  it('animates only from the committed continuation result and keeps renderer failure on the same automatic fallback', () => {
    expect(renderer).toContain('const continuation = resolution?.continuation ?? null');
    expect(renderer).toContain('continuation.success');
    expect(renderer).toContain('continuation.target');
    expect(renderer).not.toContain('chanceCreated =');
    expect(renderer).not.toContain('finish:');
    expect(functionSource(overlay, 'automaticFallback', 900)).toContain('await onsimulate()');
  });

  it('retains reduced-motion and repository touch-target accessibility for continuation input', () => {
    expect(overlay).toContain('min-height:44px');
    expect(overlay).toContain("prefers-reduced-motion: reduce");
    expect(overlay).toContain('Accessible continuation controls');
    expect(overlay).toContain('Play Pass');
    expect(overlay).toContain('Cut Back');
    expect(overlay).toContain('Cross');
  });
});
