import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, '../lib/ui/PlayableMomentOverlay.svelte'), 'utf8');

function sourceOf(functionName) {
  const asyncStart = source.indexOf(`async function ${functionName}(`);
  const syncStart = source.indexOf(`function ${functionName}(`);
  const starts = [asyncStart, syncStart].filter(index => index >= 0);
  if (!starts.length) return '';
  const start = Math.min(...starts);
  const tail = source.slice(start);
  const next = tail.slice(1).match(/\n {2}(?:async )?function\s+[A-Za-z0-9_$]+\s*\(/);
  const end = next ? start + 1 + next.index : source.length;
  return source.slice(start, end);
}

describe('Phase 8 playable overlay source contracts', () => {
  it('uses the scene director rather than importing scenario renderers directly', () => {
    expect(source).toContain("import { buildPlayableScenePlan, mountPlayableSceneRenderer } from '../../game/playableMomentsSceneDirector.js'");
    expect(source).not.toContain("import('../../game/playableMomentsThreeRenderer.js')");
    expect(source).not.toContain("import('../../game/playableMomentsContinuationRenderer.js')");
  });

  it('keeps replay presentation-only with no authoritative resolver/writeback callback', () => {
    const replay = sourceOf('replayPresentation');
    expect(replay).toContain('controller?.render?.({ moment, resolution, progress:1 })');
    expect(replay).toContain("diagnostic('replay')");
    expect(replay).not.toContain('onsubmit');
    expect(replay).not.toContain('onsimulate');
    expect(replay).not.toContain('oncontinue');
  });

  it('never auto-resolves a renderer failure after an authoritative result exists', () => {
    const fallback = sourceOf('automaticFallback');
    expect(fallback).toContain('if (fallbackTriggered || resolution) return');
    expect(fallback).toContain('await onsimulate()');
  });

  it('keeps accessible button input alongside pointer gestures', () => {
    expect(source).toContain('aria-label="Horizontal target"');
    expect(source).toContain('aria-label="Vertical target"');
    expect(source).toContain('function accessibleIntent()');
    expect(source).toContain('onpointercancel={() => { pointerStart = null; }}');
  });

  it('exposes bounded quality/audio controls and an explicit replay skip', () => {
    expect(source).toContain('function toggleAudio()');
    expect(source).toContain('function cycleQuality()');
    expect(source).toContain("replayActive ? 'Skip Replay'");
    expect(source).toContain('data-presentation-version={scenePlan.version}');
  });
});
