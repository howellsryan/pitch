import { describeBroadcastLedgerRecord } from './broadcastLedgerSemantics.js';

export const BROADCAST_FRAME_SEMANTICS_VERSION = 2;

/**
 * Text-first presentation adapter for the existing ledger-driven Broadcast
 * sequencer. The sequencer now exists only to pace readable commentary stages;
 * this adapter never mutates simulation state or changes timing, RNG, score,
 * actions or readiness gating.
 */
export function describeBroadcastFrame(frame, simulation) {
  const fallback = {
    phaseLabel:frame?.phaseLabel ?? 'Match flow',
    action:frame?.action ?? 'TEAMS RESETTING',
    detail:frame?.carrierName ? `${frame.carrierName} is involved in the next phase.` : 'Both sides reorganise for the next phase of play.',
  };
  const scene = simulation?.activePhase;
  if (!scene?.record) return fallback;

  const playersById = new Map((simulation.players ?? []).map(player => [player.id, player]));
  const presentation = describeBroadcastLedgerRecord(scene.record, {
    playersById,
    stage:scene.stage ?? 'route',
  });

  return {
    phaseLabel:presentation.label || fallback.phaseLabel,
    action:presentation.action || fallback.action,
    detail:presentation.detail || fallback.detail,
  };
}
