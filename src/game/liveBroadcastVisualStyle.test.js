import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, '../live-broadcast-tactical.css'), 'utf8');
const appCss = readFileSync(resolve(here, '../app.css'), 'utf8');
const screen = readFileSync(resolve(here, '../lib/ui/MatchScreen.svelte'), 'utf8');
const reader = readFileSync(resolve(here, '../lib/ui/MatchCommentary.svelte'), 'utf8');
const main = readFileSync(resolve(here, '../main.js'), 'utf8');

describe('live match text-first tactical presentation', () => {
  it('loads the text broadcast presentation after the shared app styles', () => {
    expect(main).toContain("import './live-broadcast-tactical.css';");
    expect(main.indexOf("import './live-broadcast-tactical.css';"))
      .toBeGreaterThan(main.indexOf("import './touchline-ledger-polish.css';"));
  });

  it('removes the retired pitch and its motion styling from the active presentation', () => {
    expect(screen).not.toContain('class="broadcast-pitch"');
    expect(screen).not.toContain('class="broadcast-ball"');
    expect(screen).not.toContain('broadcastFrame?.markers');
    expect(appCss).not.toContain('.broadcast-player');
    expect(appCss).not.toContain('.broadcast-ball');
    expect(screen).toContain('<MatchCommentary');
  });

  it('types visual commentary progressively while keeping assistive announcements atomic', () => {
    expect(reader).toContain('aria-label="Match commentary"');
    expect(reader).toContain('typedDetail = $state');
    expect(reader).toContain('typingTarget =');
    expect(reader).toContain('characterDelay(');
    expect(reader).toContain('next.startsWith(typingTarget) || next.startsWith(typedDetail)');
    expect(reader).toContain('aria-hidden="true">{typedDetail}');
    expect(reader).toContain('reader-announcement');
    expect(reader).toContain('aria-live="polite" aria-atomic="true"');
    expect(reader).toContain('{action}. {detail}');
    expect(css).toContain("content: 'POSSESSION SHARE'");
    expect(css).toContain('overflow-y: auto');
  });

  it('freezes progressive commentary while paused and honours reduced motion', () => {
    expect(reader).toContain('if (paused || reducedMotion || typedDetail.length >= typingTarget.length)');
    expect(reader).toContain("window.matchMedia?.('(prefers-reduced-motion: reduce)')");
    expect(reader).toContain('typedDetail = typingTarget');
    expect(reader).toContain('reader-caret');
  });

  it('keeps the primary live commentary and score context readable on phone-sized layouts', () => {
    expect(reader).toContain('.reader-detail { margin:0; max-width:60ch; color:var(--color-tx-2); font:400 16px/1.68');
    expect(reader).toContain('.reader-phase { margin:0 0 12px; color:var(--color-tx-2); font:500 11px/1.5');
    expect(reader).toContain('h2 { font-size:clamp(27px, 8vw, 34px); }');
    expect(css).toContain('.broadcast-label { font-size: 11px');
    expect(css).toContain('.sb-status { margin-top: 5px; font-size: 10px');
    expect(css).toContain('.sb-name { font-size: 13px; }');
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
