import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const matchScreenSrc = readFileSync(resolve(here, '../lib/ui/MatchScreen.svelte'), 'utf8');

function sourceOf(functionName, length = 9000) {
  const asyncStart = matchScreenSrc.indexOf(`async function ${functionName}`);
  const syncStart = matchScreenSrc.indexOf(`function ${functionName}`);
  const start = asyncStart >= 0 ? asyncStart : syncStart;
  return start === -1 ? '' : matchScreenSrc.slice(start, start + length);
}

describe('MatchScreen live timing and presentation authority', () => {
  it('keeps the authoritative regulation engine at 120 phases with one phase per normal tick', () => {
    expect(matchScreenSrc).toContain('const WATCH_PHASES_PER_TICK = 1');
    expect(matchScreenSrc).toContain('const WATCH_TICK_MS         = 750');
    expect(matchScreenSrc).toContain('const TOTAL_PHASES          = 120');
  });

  it('uses one live speed with no 1x/2x/4x control or speed multiplier', () => {
    expect(matchScreenSrc).not.toContain('speedMultiplier');
    expect(matchScreenSrc).not.toContain('function setSpeed');
    expect(matchScreenSrc).not.toContain('class="speed-wrap"');
    expect(matchScreenSrc).not.toContain('class="speed-btn"');
  });

  it('waits for the previous ledger scene before simulating another authoritative phase', () => {
    const runTick = sourceOf('runTick');
    expect(runTick).toContain('!isBroadcastReady(broadcastSimulation)');
    expect(runTick.indexOf('!isBroadcastReady(broadcastSimulation)')).toBeLessThan(runTick.indexOf('simulateMatchSegment('));
    expect(runTick).toContain('scheduleTick(PRESENTATION_RETRY_MS - WATCH_TICK_MS)');
  });

  it('stops ticking for pauses and unresolved playable moments', () => {
    const scheduleTick = sourceOf('scheduleTick', 2000);
    expect(scheduleTick).toContain('if (!live || live.paused) return');
    expect(scheduleTick).toContain("playableSession?.status !== 'active'");
    expect(scheduleTick).toContain('Math.max(PRESENTATION_RETRY_MS, WATCH_TICK_MS + extraDelay)');
  });

  it('queues authoritative goals and reveals them only when the visible scene reaches GOAL', () => {
    const events = sourceOf('handleNewEvents', 2500);
    expect(events).toContain("if (ev.type === 'goal')");
    expect(events).toContain('queuedGoalNotice = { ...ev, isUser }');
    expect(events).not.toContain('revealGoalNotice();');

    const presentation = sourceOf('startPresentation', 3500);
    expect(presentation).toContain("if (broadcastFrame.action === 'GOAL') revealGoalNotice()");
  });

  it('uses the football-style stoppage clock instead of a raw 1–90 phase calculation', () => {
    expect(matchScreenSrc).toContain('regulationClockForPhase(live.currentPhase');
    expect(matchScreenSrc).toContain("<div class=\"sb-clock\">{clock.label}'</div>");
    expect(matchScreenSrc).not.toContain('Math.ceil((live.currentPhase / TOTAL_PHASES) * 90)}');
  });
});
