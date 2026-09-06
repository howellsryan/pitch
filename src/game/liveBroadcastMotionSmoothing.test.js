import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const appCss = readFileSync(resolve(here, '../app.css'), 'utf8');
const matchScreenSrc = readFileSync(resolve(here, '../lib/ui/MatchScreen.svelte'), 'utf8');

describe('live broadcast rendered-motion continuity', () => {
  it('interpolates player and ball coordinates instead of exposing internal catch-up jumps', () => {
    expect(matchScreenSrc).toContain('class="broadcast-player {marker.team}"');
    expect(matchScreenSrc).toContain('class="broadcast-ball"');
    expect(appCss).toContain('.broadcast-player {\n  transition: left 180ms linear, top 180ms linear;\n}');
    expect(appCss).toContain('.broadcast-ball {\n  transition: left 90ms linear, top 90ms linear;\n}');
  });

  it('keeps the interpolation presentation-only and honours the global reduced-motion contract', () => {
    expect(appCss).toContain('display-only interpolation layer');
    expect(appCss).toContain('transition-duration: 1ms !important;');
    expect(matchScreenSrc).toContain('const WATCH_TICK_MS         = 750;');
    expect(matchScreenSrc).toContain('const TOTAL_PHASES          = 120;');
  });
});
