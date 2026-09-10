import { SAVE_SCHEMA_VERSION, getActiveSlotId, openDB, store } from './db.js';
import { playableEventKey } from './playableMomentsCareer.js';
import { assertSupportedCompetitionShootoutSession } from './competitionShootoutSession.js';

/**
 * Compare-and-swap persistence for Phase 7 shootouts.
 *
 * The shootout lives on the already-authoritative pending cup event. No new DB
 * store, queue or fixture lifecycle is introduced. Persisting the exact pending
 * kick before presentation makes refresh/export/cloud restore deterministic.
 */

function competitionShootoutSaveRow(current, pendingEvents) {
  return {
    ...current,
    id:'active',
    slotId:getActiveSlotId(),
    saveSchemaVersion:SAVE_SCHEMA_VERSION,
    lastPlayedAt:new Date().toISOString(),
    pendingEvents,
  };
}

function locatePendingCupEvent(current, eventKey) {
  const pendingEvents = [...(current.pendingEvents ?? [])];
  const index = pendingEvents.findIndex(event => playableEventKey(event) === eventKey);
  if (index < 0) throw new Error('COMPETITION_SHOOTOUT_EVENT_MISSING');
  const event = pendingEvents[index];
  if (event?.type !== 'cup' || event?.leaguePhase) throw new Error('COMPETITION_SHOOTOUT_EVENT_INVALID');
  return { pendingEvents, index, event };
}

async function atomicCompetitionShootoutMutation(mutator) {
  await openDB();
  return new Promise((resolve, reject) => {
    const saves = store('save', 'readwrite');
    const tx = saves.transaction;
    let result = null;
    let failure = null;

    const abort = error => {
      failure = error instanceof Error ? error : new Error(String(error));
      try { tx.abort(); } catch {}
    };

    const request = saves.get('active');
    request.onerror = () => abort(request.error ?? new Error('COMPETITION_SHOOTOUT_SAVE_READ_FAILED'));
    request.onsuccess = () => {
      try {
        const current = request.result;
        if (!current || current._deleted) throw new Error('COMPETITION_SHOOTOUT_SAVE_NOT_FOUND');
        if (current.slotId && current.slotId !== getActiveSlotId()) throw new Error('COMPETITION_SHOOTOUT_SAVE_SLOT_STALE');
        const mutation = mutator(current);
        result = mutation.result;
        if (mutation.write !== false) saves.put(competitionShootoutSaveRow(current, mutation.pendingEvents));
      } catch (error) {
        abort(error);
      }
    };

    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(failure ?? tx.error ?? new Error('COMPETITION_SHOOTOUT_SAVE_TRANSACTION_FAILED'));
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('COMPETITION_SHOOTOUT_SAVE_TRANSACTION_ABORTED'));
  });
}

export async function startCompetitionShootoutSessionAtomic(event, session) {
  assertSupportedCompetitionShootoutSession(session);
  const eventKey = playableEventKey(event);
  return atomicCompetitionShootoutMutation(current => {
    const located = locatePendingCupEvent(current, eventKey);
    const existing = located.event.shootoutSession ?? null;
    if (existing) {
      assertSupportedCompetitionShootoutSession(existing);
      if (existing.shootoutId === session.shootoutId) {
        return { write:false, result:{ session:existing, event:located.event, idempotent:true } };
      }
      throw new Error('COMPETITION_SHOOTOUT_ALREADY_ACTIVE');
    }
    located.pendingEvents[located.index] = { ...located.event, shootoutSession:session };
    return {
      pendingEvents:located.pendingEvents,
      result:{ session, event:located.pendingEvents[located.index], idempotent:false },
    };
  });
}

export async function persistCompetitionShootoutSessionAtomic(session, { eventKey, expectedRevision } = {}) {
  assertSupportedCompetitionShootoutSession(session);
  if (!eventKey) throw new Error('COMPETITION_SHOOTOUT_EVENT_KEY_REQUIRED');
  return atomicCompetitionShootoutMutation(current => {
    const located = locatePendingCupEvent(current, eventKey);
    const existing = located.event.shootoutSession ?? null;
    if (!existing) throw new Error('COMPETITION_SHOOTOUT_SESSION_MISSING');
    assertSupportedCompetitionShootoutSession(existing);
    if (existing.shootoutId !== session.shootoutId) throw new Error('COMPETITION_SHOOTOUT_SESSION_STALE');

    // Lost-response retry: if the desired revision is already durable and the
    // payload is byte-equivalent JSON, return it instead of appending/rewriting.
    if (existing.revision === session.revision) {
      if (JSON.stringify(existing) !== JSON.stringify(session)) throw new Error('COMPETITION_SHOOTOUT_REVISION_COLLISION');
      return { write:false, result:{ session:existing, event:located.event, idempotent:true } };
    }

    if (expectedRevision != null && existing.revision !== expectedRevision) throw new Error('COMPETITION_SHOOTOUT_SESSION_REVISION_STALE');
    if (session.revision <= existing.revision) throw new Error('COMPETITION_SHOOTOUT_SESSION_REVISION_NOT_ADVANCED');
    located.pendingEvents[located.index] = { ...located.event, shootoutSession:session };
    return {
      pendingEvents:located.pendingEvents,
      result:{ session, event:located.pendingEvents[located.index], idempotent:false },
    };
  });
}

export function restoredCompetitionShootoutSession(event) {
  const session = event?.shootoutSession ?? null;
  return session ? assertSupportedCompetitionShootoutSession(session) : null;
}
