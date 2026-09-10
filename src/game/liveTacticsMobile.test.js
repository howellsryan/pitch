import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const tacticsSrc = readFileSync(resolve(here, '../lib/ui/LiveTacticsSheet.svelte'), 'utf8');
const matchScreenSrc = readFileSync(resolve(here, '../lib/ui/MatchScreen.svelte'), 'utf8');

function sourceOf(functionName) {
  const asyncStart = matchScreenSrc.indexOf(`async function ${functionName}(`);
  const syncStart = matchScreenSrc.indexOf(`function ${functionName}(`);
  const starts = [asyncStart, syncStart].filter(index => index >= 0);
  if (!starts.length) return '';
  const start = Math.min(...starts);
  const tail = matchScreenSrc.slice(start);
  const nextMatch = tail.slice(1).match(/\n {2}(?:async )?function\s+[A-Za-z0-9_$]+\s*\(/);
  const end = nextMatch ? start + 1 + nextMatch.index : matchScreenSrc.length;
  return matchScreenSrc.slice(start, end);
}

describe('mobile live tactics UX contract', () => {
  it('uses a full-height mobile sheet with safe-area scrolling and an explicit return to match', () => {
    expect(tacticsSrc).toContain('height:100dvh');
    expect(tacticsSrc).toContain('overflow-y:auto');
    expect(tacticsSrc).toContain('env(safe-area-inset-bottom)');
    expect(tacticsSrc).toContain('aria-label="Back to match">Back to match</button>');
    expect(tacticsSrc).toContain('@media (max-width:390px)');
    expect(tacticsSrc).toContain('.lt-bench-grid{grid-template-columns:1fr}');
  });

  it('keeps Shape, Subs and Instructions as compact dedicated sections rather than one clipped modal', () => {
    expect(tacticsSrc).toContain('>Shape</button>');
    expect(tacticsSrc).toContain('>Subs <span>{subsLeft}</span></button>');
    expect(tacticsSrc).toContain('>Instructions</button>');
    expect(tacticsSrc).toContain('Make a substitution · {subsLeft} left');
  });

  it('applies formation changes immediately without a separate apply button', () => {
    expect(tacticsSrc).toContain('onclick={() => onformation(item)}');
    expect(tacticsSrc).not.toContain('Apply Formation');
    const apply = sourceOf('applyTactics');
    expect(apply).toContain('applyFormationChange(live.liveState, live.userIsHome, formation)');
    expect(apply).toContain('live = { ...live, liveState:newLs }');
    expect(apply).toContain('replaceBroadcastLineups(broadcastSimulation');
  });

  it('makes substitutions an explicit two-step direct replacement flow', () => {
    expect(tacticsSrc).toContain('Choose the player coming on');
    expect(tacticsSrc).toContain('Choose exactly who comes off');
    expect(tacticsSrc).toContain('No automatic reshuffle');
    expect(tacticsSrc).toContain('aria-label={`Replace ${player.name}`}');
  });

  it('pauses while tactics are open and resumes only through the explicit close path', () => {
    const open = sourceOf('openTacticsSheet');
    expect(open).toContain('if (!live.paused) togglePause()');
    expect(open).toContain('tacticsSheetOpen = true');
    const close = sourceOf('closeTacticsSheet');
    expect(close).toContain('tacticsSheetOpen = false');
    expect(close).toContain('if (!tacticsSheetWasPaused) togglePause()');
  });
});
