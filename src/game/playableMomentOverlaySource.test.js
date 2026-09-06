import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, '../lib/ui/PlayableMomentOverlay.svelte'), 'utf8');
const rendererSource = readFileSync(resolve(here, 'playableMomentsThreeRenderer.js'), 'utf8');

function functionSource(name, length = 1800) {
  const start = source.indexOf(`function ${name}`);
  const asyncStart = source.indexOf(`async function ${name}`);
  const actualStart = start === -1 ? asyncStart : asyncStart === -1 ? start : Math.min(start, asyncStart);
  return actualStart === -1 ? '' : source.slice(actualStart, actualStart + length);
}

describe('PlayableMomentOverlay lifecycle contracts', () => {
  it('does not accept pointer or accessible input while renderer initialization can still trigger automatic fallback', () => {
    expect(functionSource('accessibleIntent')).toContain('resolution || busy || rendererLoading');
    expect(functionSource('pointerDown')).toContain('resolution || busy || rendererLoading');
    expect(functionSource('pointerUp')).toContain('resolution || busy || rendererLoading');
    expect(source).toContain('disabled={busy || rendererLoading}');
  });

  it('falls back by simulating the same saved pending moment rather than manufacturing a presentation result', () => {
    const mount = functionSource('mountRenderer', 2200);
    const fallback = functionSource('automaticFallback', 900);
    expect(mount).toContain('resolving this same saved moment automatically');
    expect(mount).toContain('await automaticFallback()');
    expect(fallback).toContain('await onsimulate()');
    expect(source).toContain('The result above is already committed to the authoritative match state.');
  });

  it('keeps keyboard/tap controls at the repository touch-target floor and honours reduced motion', () => {
    expect(source).toContain('min-height:44px');
    expect(source).toContain("prefers-reduced-motion: reduce");
    expect(source).toContain("window.matchMedia?.('(prefers-reduced-motion: reduce)')");
  });

  it('names penalties and direct free kicks without inventing a curl control', () => {
    expect(source).toContain('TAKE THE PENALTY');
    expect(source).toContain('FACE THE PENALTY');
    expect(source).toContain('TAKE THE FREE KICK');
    expect(source).toContain('DEFEND THE FREE KICK');
    expect(source).toContain('There is no hidden curl control');
    expect(source).not.toContain("curl:");
  });
});

describe('Phase 4 Three.js set-piece authority boundary', () => {
  it('renders only domain-provided wall members and hides the lone defender when the moment explicitly has none', () => {
    expect(rendererSource).toContain('moment?.geometry?.wall?.members');
    expect(rendererSource).toContain('wallMembers[index] ?? null');
    expect(rendererSource).toContain("Object.prototype.hasOwnProperty.call(moment.geometry, 'defender')");
    expect(rendererSource).toContain('defender.root.visible = !hasWall && hasExplicitDefender');
  });

  it('uses the committed blocker id to animate the authoritative wall member rather than choosing a presentation blocker', () => {
    expect(rendererSource).toContain('const blockerId = shot?.presentation?.blockerId ?? null');
    expect(rendererSource).toContain('blockerId === member.id');
    expect(rendererSource).not.toContain('nearestWall');
  });
});
