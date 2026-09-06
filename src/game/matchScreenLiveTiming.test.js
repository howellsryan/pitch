import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const matchScreenSrc = readFileSync(resolve(here, '../lib/ui/MatchScreen.svelte'), 'utf8');

function sourceOf(functionName, length = 7000) {
  const asyncStart = matchScreenSrc.indexOf(`async function ${functionName}`);
  const syncStart = matchScreenSrc.indexOf(`function ${functionName}`);
  const start = asyncStart >= 0 ? asyncStart : syncStart;
  return start === -1 ? '' : matchScreenSrc.slice(start, start + length);
}

describe('MatchScreen fixed live regulation clock', () => {
  it('maps the unchanged 120 authoritative phases to 90 real seconds', () => {
    expect(matchScreenSrc).toContain('const WATCH_PHASES_PER_TICK = 1');
    expect(matchScreenSrc).toContain('const WATCH_TICK_MS         = 750');
    expect(matchScreenSrc).toContain('const TOTAL_PHASES          = 120');
    expect(120 * 750).toBe(90_000);
  });

  it('uses one fixed live speed with no 1x/2x/4x control or speed multiplier', () => {
    expect(matchScreenSrc).not.toContain('speedMultiplier');
    expect(matchScreenSrc).not.toContain('function setSpeed');
    expect(matchScreenSrc).not.toContain('class="speed-wrap"');
    expect(matchScreenSrc).not.toContain('class="speed-btn"');
  });

  it('does not let presentation readiness delay the authoritative regulation clock', () => {
    const runTick = sourceOf('runTick');
    expect(runTick).not.toContain('isBroadcastReady');
    expect(runTick).toContain('simulateMatchSegment(');
    expect(runTick).toContain('else scheduleTick()');
  });

  it('stops the fixed clock for pauses and unresolved playable moments', () => {
    const scheduleTick = sourceOf('scheduleTick', 1800);
    expect(scheduleTick).toContain('if (!live || live.paused) return');
    expect(scheduleTick).toContain("playableSession?.status !== 'active'");
    expect(scheduleTick).toContain('WATCH_TICK_MS + extraDelay');
  });

  it('reveals authoritative goals without waiting for a routine visual scene to finish', () => {
    const events = sourceOf('handleNewEvents', 2200);
    expect(events).toContain("if (ev.type === 'goal')");
    expect(events).toContain('queuedGoalNotice = { ...ev, isUser }');
    expect(events).toContain('revealGoalNotice()');
  });
});
