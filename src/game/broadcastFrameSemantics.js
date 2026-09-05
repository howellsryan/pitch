import { describeBroadcastLedgerRecord } from './broadcastLedgerSemantics.js';

export const BROADCAST_FRAME_SEMANTICS_VERSION = 1;

/**
 * T6 presentation adapter for the existing ledger-driven Broadcast engine.
 * Reads the current scene but never mutates simulation state or changes timing,
 * geometry, RNG, score, actions or readiness gating.
 */
export function describeBroadcastFrame(frame, simulation) {
  const fallback = {
    phaseLabel:frame?.phaseLabel ?? 'Kick off',
    action:frame?.action ?? 'TEAMS SET',
    detail:frame?.carrierName || 'Ball in flight',
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
    action:fallback.action,
    detail:presentation.detail || fallback.detail,
  };
}
