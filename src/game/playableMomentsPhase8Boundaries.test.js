import { beforeEach, describe, expect, it } from 'vitest';
import { playablePresentationAudioCues } from './playableMomentsPresentationAudio.js';
import {
  PLAYABLE_PRESENTATION_DIAGNOSTIC_LIMIT,
  playablePresentationDiagnosticsSnapshot,
  recordPlayablePresentationDiagnostic,
  resetPlayablePresentationDiagnostics,
  sanitizePlayablePresentationDiagnostic,
} from './playableMomentsPresentationDiagnostics.js';
import {
  PLAYABLE_PRESENTATION_HISTORY_LIMIT,
  compactPlayablePresentationHistory,
  presentationHistoryWithinBudget,
  stripNonDurablePresentationState,
} from './playableMomentsPresentationStorage.js';

describe('Phase 8 generated audio semantics', () => {
  it('maps only committed authoritative result data to a bounded cue set', () => {
    expect(playablePresentationAudioCues(
      { setPiece:{ kind:'penalty' } },
      { shot:{ finish:'goal', presentation:{ contact:'goal' } } },
    )).toEqual(['whistle', 'strike', 'net', 'crowd']);
    expect(playablePresentationAudioCues(
      {},
      { shot:{ finish:'saved', goalkeeperIntervention:'catch' } },
    )).toEqual(['strike', 'keeper']);
    expect(playablePresentationAudioCues({}, {})).toEqual([]);
  });
});

describe('Phase 8 bounded local diagnostics', () => {
  beforeEach(() => resetPlayablePresentationDiagnostics());

  it('does not retain arbitrary user/player fields', () => {
    expect(sanitizePlayablePresentationDiagnostic({
      type:'renderer_ready', version:1, scenario:'penalty', quality:'high', durationMs:83,
      playerName:'Do not retain', aimX:.9, userId:'private',
    })).toEqual({
      type:'renderer_ready', version:1, scenario:'penalty', quality:'high', durationMs:83,
      fallback:false, replayCount:0,
    });
  });

  it('caps diagnostic history instead of growing with a career', () => {
    for (let i = 0; i < PLAYABLE_PRESENTATION_DIAGNOSTIC_LIMIT + 20; i += 1) {
      recordPlayablePresentationDiagnostic({ type:'replay', scenario:'open_play', quality:'medium', replayCount:i });
    }
    const snapshot = playablePresentationDiagnosticsSnapshot();
    expect(snapshot).toHaveLength(PLAYABLE_PRESENTATION_DIAGNOSTIC_LIMIT);
    expect(snapshot.at(-1).replayCount).toBe(3);
  });
});

describe('Phase 8 long-career presentation storage', () => {
  it('keeps only compact bounded receipts and stays under the presentation metadata budget', () => {
    const history = Array.from({ length:500 }, (_, index) => ({
      version:1,
      scenario:index % 2 ? 'open_play' : 'shootout',
      renderer:'three-shot',
      quality:'medium',
      fallback:false,
      replayCount:index % 4,
      scene:{ enormous:'x'.repeat(10000) },
      replayFrames:Array(1000).fill({ x:index }),
    }));
    const compact = compactPlayablePresentationHistory(history);
    const budget = presentationHistoryWithinBudget(history);
    expect(compact).toHaveLength(PLAYABLE_PRESENTATION_HISTORY_LIMIT);
    expect(compact[0]).not.toHaveProperty('scene');
    expect(compact[0]).not.toHaveProperty('replayFrames');
    expect(budget.withinBudget).toBe(true);
  });

  it('explicitly strips renderer/audio/replay-frame state from a durable object', () => {
    expect(stripNonDurablePresentationState({
      authoritativeReceipt:{ id:'keep' },
      scene:{ id:'drop' },
      frames:[1,2],
      replayFrames:[3,4],
      audioState:{ playing:true },
      rendererState:{ webgl:true },
    })).toEqual({ authoritativeReceipt:{ id:'keep' } });
  });
});
