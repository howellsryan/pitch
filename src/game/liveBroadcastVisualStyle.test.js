import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, '../live-broadcast-tactical.css'), 'utf8');
const screen = readFileSync(resolve(here, '../lib/ui/MatchScreen.svelte'), 'utf8');
const reader = readFileSync(resolve(here, '../lib/ui/MatchCommentary.svelte'), 'utf8');
const main = readFileSync(resolve(here, '../main.js'), 'utf8');

describe('live match text-first tactical presentation', () => {
  it('loads the text broadcast presentation after the shared app styles', () => {
    expect(main).toContain("import './live-broadcast-tactical.css';");
    expect(main.indexOf("import './live-broadcast-tactical.css';"))
      .toBeGreaterThan(main.indexOf("import './touchline-ledger-polish.css';"));
  });

  it('removes the retired pitch from the DOM and accessibility tree', () => {
    expect(screen).not.toContain('class="broadcast-pitch"');
    expect(screen).not.toContain('class="broadcast-ball"');
    expect(screen).not.toContain('broadcastFrame?.markers');
    expect(screen).toContain('<MatchCommentary');
  });

  it('exposes the actual commentary text as one polite atomic passage', () => {
    expect(reader).toContain('aria-label="Match commentary"');
    expect(reader).toContain('aria-live="polite" aria-atomic="true"');
    expect(reader).toContain('<h2>{action}</h2>');
    expect(reader).toContain('{detail}</p>');
    expect(css).toContain("content: 'POSSESSION SHARE'");
    expect(css).toContain('overflow-y: auto');
  });

  it('keeps the goal notice driven by the existing reveal gate', () => {
    expect(screen).toContain('goal={goalNotice ?');
    expect(reader).toContain('{#if goal}');
    expect(reader).toContain('role="status"');
    expect(reader).toContain('{goal.playerName}');
  });

  it('does not install the retired DOM motion smoother at application boot', () => {
    expect(main).not.toContain('installLiveBroadcastMotionSmoother');
    expect(main).not.toContain("from './game/liveBroadcastMotionSmoother.js'");
  });
});
