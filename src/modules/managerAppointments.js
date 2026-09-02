/**
 * modules/managerAppointments.js — P6 WP3: the shared appointment state
 * machine. Pure/DOM-free. A vacancy (created by managerCareer.js's dismissal
 * transition, or later by resignation/retirement/user departure) moves
 * through the same legal stages whether the eventual hire is AI- or
 * user-driven:
 *
 *   caretaker -> candidates_assembled -> offer_extended
 *     -> accepted -> completed
 *     -> declined | expired (back to candidates_assembled with that
 *        candidate excluded, or exhausted -> caretaker stays permanent)
 *
 * WP4 drives this for AI clubs synchronously within one bounded tick. WP5
 * reuses the same functions for the user's own applications/approaches, but
 * pauses at `offer_extended` for a human decision instead of auto-resolving.
 */

export const HARD_BLOCK_REASONS = Object.freeze({
  NOT_AVAILABLE:'not_available',
  ALREADY_RESERVED:'already_reserved',
});

/** A candidate must be genuinely available: unemployed, or this vacancy's own caretaker. */
export function isEligibleCandidate(manager, vacancy) {
  if (!manager) return false;
  if (manager.status === 'unemployed') return true;
  return manager.status === 'employed' && manager.currentClubId === vacancy.clubId
    && manager.availability?.caretakerEligible === true;
}

/**
 * Explainable, bounded fit score in [0, 100]. Every input is named so a
 * rejection reason can be surfaced later without recomputing anything.
 */
export function scoreCandidateFit(manager, team) {
  const reputationGap = Math.abs((manager.reputation?.overall ?? 50) - (team.reputation ?? 50));
  const reputationFit = Math.max(0, 100 - reputationGap * 1.4);
  const matches = manager.record?.matches ?? 0;
  const winRate = matches > 0 ? (manager.record.wins / matches) : 0.4;
  const trackRecord = Math.round(winRate * 100);
  const youthFit = manager.reputation?.youth ?? 50;
  const overall = Math.round(reputationFit * 0.55 + trackRecord * 0.30 + youthFit * 0.15);
  return {
    overall:Math.max(0, Math.min(100, overall)),
    reasons:{ reputationFit:Math.round(reputationFit), trackRecord, youthFit, matches },
  };
}

/**
 * Rank every eligible candidate (unemployed pool plus the vacancy's own
 * caretaker) by fit. `excludeIds` lets a caller remove candidates already
 * reserved for another vacancy earlier in the same deterministic pass, or
 * who already declined this vacancy.
 */
export function assembleCandidates(vacancy, team, managerPool, { excludeIds = [] } = {}) {
  const excluded = new Set(excludeIds);
  return managerPool
    .filter(manager => !excluded.has(manager.id) && isEligibleCandidate(manager, vacancy))
    .map(manager => ({ managerId:manager.id, fit:scoreCandidateFit(manager, team) }))
    .sort((a, b) => b.fit.overall - a.fit.overall);
}

/** No-op unless the vacancy is actually open for a new offer — never overwrites a pending one. */
export function extendOffer(vacancy, candidateManagerId, { weekKey } = {}) {
  if (vacancy.status === 'completed' || vacancy.status === 'offer_extended') return vacancy;
  return {
    ...vacancy,
    status:'offer_extended',
    offer:{ candidateManagerId, extendedWeekKey:weekKey, idempotencyKey:`${vacancy.id}:offer:${weekKey}` },
  };
}

/**
 * Resolve a pending offer. `accepted` moves straight to `completed` — the
 * actual manager/team patching happens in the caller (p6Runtime.js /
 * WP5's user flow), which has the manager/team rows this pure function
 * deliberately doesn't touch.
 */
export function resolveOffer(vacancy, outcome, { weekKey } = {}) {
  if (!vacancy.offer || vacancy.status !== 'offer_extended') return vacancy;
  if (outcome === 'accepted') {
    return { ...vacancy, status:'completed', resolvedWeekKey:weekKey };
  }
  return {
    ...vacancy,
    status:'candidates_assembled',
    declinedCandidateIds:[...(vacancy.declinedCandidateIds ?? []), vacancy.offer.candidateManagerId],
    offer:null,
  };
}

/** Idempotent: calling this again on an already-completed vacancy is a no-op. */
export function completeHandover(vacancy, { hiredManagerId, weekKey } = {}) {
  if (vacancy.status === 'completed' && vacancy.hiredManagerId) return vacancy;
  return { ...vacancy, status:'completed', hiredManagerId, resolvedWeekKey:vacancy.resolvedWeekKey ?? weekKey };
}

export function isVacancyOpen(vacancy) {
  return vacancy && vacancy.status !== 'completed';
}

/**
 * Narrower than `isVacancyOpen`: true only while the vacancy has no offer
 * already out (`caretaker` or `candidates_assembled`). A vacancy sitting at
 * `offer_extended` is mid-decision for a specific candidate and must not be
 * treated as available for a *different* new approach/application until that
 * offer resolves — `isVacancyOpen` alone doesn't draw this distinction.
 */
export function isVacancyAvailableForNewCandidate(vacancy) {
  return vacancy?.status === 'caretaker' || vacancy?.status === 'candidates_assembled';
}

/**
 * The manager-entity side effects of a completed hire, shared by WP4's AI
 * resolution (p6Runtime.js) and WP6's user handover (managerClubHandover.js)
 * so both apply the exact same rule rather than two hand-rolled copies:
 *
 *  - hiring the vacancy's own caretaker confirms them permanently (same
 *    club, same tenure, just no longer interim);
 *  - hiring anyone else moves that manager to the club and returns the
 *    caretaker to the unemployed pool.
 *
 * Pure: takes the three manager rows involved and returns the patches,
 * without touching a store or a `workingById` map itself.
 */
export function applyHireOutcome({ vacancy, hiredManagerId, hiredManager, caretakerManager, currentDate }) {
  const wasCaretaker = hiredManagerId === vacancy.caretakerManagerId;
  if (wasCaretaker) {
    return {
      hiredManagerPatch:{ ...hiredManager, availability:{ ...hiredManager.availability, caretakerEligible:false } },
      displacedCaretakerPatch:null,
    };
  }
  return {
    hiredManagerPatch:{
      ...hiredManager,
      status:'employed',
      currentClubId:vacancy.clubId,
      employment:{ clubId:vacancy.clubId, startDate:currentDate, contractEndSeason:null },
      history:[...(hiredManager.history ?? []), { clubId:vacancy.clubId, startedWeekKey:vacancy.resolvedWeekKey ?? null, endedWeekKey:null, endReason:null }],
    },
    displacedCaretakerPatch:caretakerManager ? {
      ...caretakerManager,
      status:'unemployed',
      currentClubId:null,
      employment:{ clubId:null, startDate:null, contractEndSeason:null },
      availability:{ ...caretakerManager.availability, caretakerEligible:false },
    } : null,
  };
}
