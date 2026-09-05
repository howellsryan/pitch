import {
  SAVE_SCHEMA_VERSION,
  getActiveSlotId,
  openDB,
  store,
} from './db.js';
import {
  assertSupportedPlayableSession,
  samePlayableIntent,
} from './playableMomentsCareer.js';

/**
 * Compare-and-swap persistence for Phase 2 Play Key Moments.
 *
 * The session remains a field on the existing active save row. We intentionally
 * use db.js's active-store adapter rather than opening another IndexedDB database
 * or adding another gameweek queue/store.
 */

function nextSaveRow(current, playableMatchSession) {
  return {
    ...current,
    id:'active',
    slotId:getActiveSlotId(),
    saveSchemaVersion:SAVE_SCHEMA_VERSION,
    lastPlayedAt:new Date().toISOString(),
    playableMatchSession,
  };
}

function atomicSaveMutation(mutator) {
  return new Promise(async (resolve, reject) => {
    try {
      await openDB();
      const saves = store('save', 'readwrite');
      const tx = saves.transaction;
      let result = null;
      let failure = null;

      const abort = error => {
        failure = error instanceof Error ? error : new Error(String(error));
        try { tx.abort(); } catch {}
      };

      const request = saves.get('active');
      request.onerror = () => abort(request.error ?? new Error('PLAYABLE_SAVE_READ_FAILED'));
      request.onsuccess = () => {
        try {
          const current = request.result;
          if (!current || current._deleted) throw new Error('PLAYABLE_SAVE_NOT_FOUND');
          const mutation = mutator(current);
          result = mutation.result;
          if (mutation.write !== false) saves.put(nextSaveRow(current, mutation.session ?? null));
        } catch (error) {
          abort(error);
        }
      };

      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(failure ?? tx.error ?? new Error('PLAYABLE_SAVE_TRANSACTION_FAILED'));
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('PLAYABLE_SAVE_TRANSACTION_ABORTED'));
    } catch (error) {
      reject(error);
    }
  });
}

export async function startPlayableMatchSessionAtomic(session) {
  assertSupportedPlayableSession(session);
  return atomicSaveMutation(current => {
    const existing = current.playableMatchSession ?? null;
    if (existing) {
      assertSupportedPlayableSession(existing);
      if (existing.sessionId === session.sessionId) {
        return { write:false, result:{ session:existing, idempotent:true } };
      }
      throw new Error('PLAYABLE_MATCH_ALREADY_ACTIVE');
    }
    return { session, result:{ session, idempotent:false } };
  });
}

export async function persistPlayableSessionAtomic(session, { expectedSessionId, expectedRevision } = {}) {
  assertSupportedPlayableSession(session);
  return atomicSaveMutation(current => {
    const existing = current.playableMatchSession ?? null;
    if (!existing) throw new Error('PLAYABLE_SESSION_MISSING');
    assertSupportedPlayableSession(existing);
    if (expectedSessionId && existing.sessionId !== expectedSessionId) throw new Error('PLAYABLE_SESSION_STALE');
    if (expectedRevision != null && existing.revision !== expectedRevision) throw new Error('PLAYABLE_SESSION_REVISION_STALE');
    if (session.sessionId !== existing.sessionId) throw new Error('PLAYABLE_SESSION_ID_CHANGED');
    if (session.revision <= existing.revision) throw new Error('PLAYABLE_SESSION_REVISION_NOT_ADVANCED');
    return { session, result:{ session, idempotent:false } };
  });
}

export async function commitPlayableMomentAtomic({ sessionId, momentId, expectedRevision, intent = null, nextSession, receipt } = {}) {
  assertSupportedPlayableSession(nextSession);
  if (!sessionId || !momentId || !receipt) throw new Error('PLAYABLE_COMMIT_ARGUMENTS_INVALID');
  return atomicSaveMutation(current => {
    const existing = current.playableMatchSession ?? null;
    if (!existing) throw new Error('PLAYABLE_SESSION_MISSING');
    assertSupportedPlayableSession(existing);
    if (existing.sessionId !== sessionId) throw new Error('PLAYABLE_SESSION_STALE');

    if (existing.lastReceipt?.momentId === momentId) {
      if (!samePlayableIntent(existing.lastReceipt.intent, intent)) throw new Error('PLAYABLE_MOMENT_ALREADY_COMMITTED_DIFFERENT_INTENT');
      return { write:false, result:{ session:existing, receipt:existing.lastReceipt, idempotent:true } };
    }

    if (existing.revision !== expectedRevision) throw new Error('PLAYABLE_SESSION_REVISION_STALE');
    if (existing.status !== 'pending' || existing.pending?.momentId !== momentId) throw new Error('PLAYABLE_MOMENT_STALE');
    if (receipt.momentId !== momentId || nextSession.lastReceipt?.momentId !== momentId) throw new Error('PLAYABLE_RECEIPT_MISMATCH');
    if (!samePlayableIntent(receipt.intent, intent)) throw new Error('PLAYABLE_RECEIPT_INTENT_MISMATCH');
    if (nextSession.sessionId !== sessionId || nextSession.revision <= existing.revision) throw new Error('PLAYABLE_SESSION_COMMIT_INVALID');

    return { session:nextSession, result:{ session:nextSession, receipt, idempotent:false } };
  });
}

export async function clearPlayableMatchSessionAtomic({ sessionId, expectedRevision = null } = {}) {
  return atomicSaveMutation(current => {
    const existing = current.playableMatchSession ?? null;
    if (!existing) return { write:false, result:{ cleared:true, idempotent:true } };
    assertSupportedPlayableSession(existing);
    if (existing.sessionId !== sessionId) throw new Error('PLAYABLE_SESSION_STALE');
    if (expectedRevision != null && existing.revision !== expectedRevision) throw new Error('PLAYABLE_SESSION_REVISION_STALE');
    return { session:null, result:{ cleared:true, idempotent:false } };
  });
}
