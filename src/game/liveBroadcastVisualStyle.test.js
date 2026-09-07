import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, '../live-broadcast-tactical.css'), 'utf8');
const main = readFileSync(resolve(here, '../main.js'), 'utf8');

describe('live match text-first tactical presentation', () => {
  it('loads the text broadcast presentation after the shared app styles', () => {
    expect(main).toContain("import './live-broadcast-tactical.css';");
    expect(main.indexOf("import './live-broadcast-tactical.css';"))
      .toBeGreaterThan(main.indexOf("import './touchline-ledger-polish.css';"));
  });

  it('retires the animated pitch, player markers and ball from the visible live match', () => {
    expect(css).toContain('#screen-match .broadcast-pitch > :not(.goal-takeover)');
    expect(css).toMatch(/\.broadcast-pitch > :not\(\.goal-takeover\)[\s\S]*?display:\s*none\s*!important/);
    expect(css).toContain('aspect-ratio: auto !important');
    expect(css).toContain('background: transparent !important');
  });

  it('promotes authoritative commentary to the primary live-match surface', () => {
    expect(css).toContain("content: 'WHAT IS HAPPENING'");
    expect(css).toContain('#screen-match .match-commentary strong');
    expect(css).toContain('#screen-match .match-commentary span');
    expect(css).toContain("content: 'POSSESSION SHARE'");
  });

  it('keeps goal events visible without restoring the pitch animation', () => {
    expect(css).toContain('#screen-match .broadcast-pitch .goal-takeover');
    expect(css).toContain('position: relative !important');
  });

  it('does not install the retired DOM motion smoother at application boot', () => {
    expect(main).not.toContain('installLiveBroadcastMotionSmoother');
    expect(main).not.toContain("from './game/liveBroadcastMotionSmoother.js'");
  });
});
