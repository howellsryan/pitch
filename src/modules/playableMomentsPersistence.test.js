import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbHarness = vi.hoisted(() => ({
  row:null,
  activeSlot:'career_a',
}));

vi.mock('./db.js', () => ({
  SAVE_SCHEMA_VERSION:2,
  getActiveSlotId:() => dbHarness.activeSlot,
  openDB:async () => ({}),
  store:() => {
    const tx = {
      oncomplete:null,
      onerror:null,
      onabort:null,
      error:null,
      aborted:false,
      abort() {
        this.aborted = true;
        queueMicrotask(() => this.onabort?.());
      },
    };
    const objectStore = {
      transaction:tx,
      get() {
        const request = { result:null, error:null, onsuccess:null, onerror:null };
        queueMicrotask(() => {
          if (tx.aborted) return;
          request.result = dbHarness.row == null ? null : structuredClone(dbHarness.row);
          request.onsuccess?.();
          queueMicrotask(() => { if (!tx.aborted) tx.oncomplete?.(); });
        });
        return request;
      },
      put(next) {
        dbHarness.row = structuredClone(next);
      },
    };
    return objectStore;
  },
}));

import {
  attachPendingPlayableMoment,
  commitPlayableMomentToSession,
  createPlayableMatchSession,
} from './playableMomentsCareer.js';
import {
  clearPlayableMatchSessionAtomic,
  commitPlayableMomentAtomic,
  persistPlayableSessionAtomic,
  startPlayableMatchSessionAtomic,
} from './playableMomentsPersistence.js';

function liveState() {
  return {
    matchEngineVersion:1, actionResolverVersion:2, actionLedgerVersion:1, rngPacketVersion:1,
    hFitness:new Map([['h1', 90]]), aFitness:new Map([['a1', 90]]),
    hActive:[{id:'h1'}], aActive:[{id:'a1'}], hBenchLeft:[], aBenchLeft:[],
    hGoals:0, aGoals:0, hPhases:0, aPhases:0, hSubsLeft:3, aSubsLeft:3,
    actionLedger:[], seed:11, rngState:11,
  };
}

function baseSave() {
  return {
    id:'active', slotId:'career_a', saveSchemaVersion:2,
    userTeamId:'home', currentGameweek:3, pendingEvents:[{ type:'league', gw:3, fixtureId:'f1' }],
  };
}

function session(fixtureId = 'f1') {
  return createPlayableMatchSession({
    slotId:'career_a',
    event:{ type:'league', gw:3, fixtureId, userIsHome:true },
    userTeamId:'home', userIsHome:true, liveState:liveState(),
  });
}

function continuation() {
  return {
    version:1, phase:20, minute:15,
    packet:{ version:1, possession:.1, route:.2, actor:.3, target:.4, defender:.5, execution:.6, outcome:.7, chance:.1, shooter:.3, shot:.6, finish:.4, assist:.2, discipline:.8, injury:.9 },
    preparedAction:{ version:1, phase:20 }, isHome:true, rngState:20,
    hActive:[{id:'h1'}], aActive:[{id:'a1'}], hBenchLeft:[], aBenchLeft:[],
    hFitness:new Map([['h1',89.8]]), aFitness:new Map([['a1',89.9]]),
    hSubsLeft:3, aSubsLeft:3, hGoals:0, aGoals:0, hPhases:1, aPhases:0,
    hStr:{attack:80}, aStr:{goalkeeping:80}, actionLedger:[],
  };
}

function moment() {
  return {
    version:1, phase:20, minute:15, mode:'attack', attackingTeamId:'home', defendingTeamId:'away',
    shooterId:'h1', shooterName:'H One', goalkeeperId:'a1', goalkeeperName:'A One', defenderId:null,
    route:'carry', xg:.24,
    geometry:{ coordinateSystem:'goal-facing-v1', goal:{width:7.32,height:2.44}, channel:0, distance:10, shooter:{x:0,y:0,z:10}, goalkeeper:{x:0,y:0,z:.35}, ball:{x:0,y:.11,z:9.5} },
  };
}

beforeEach(() => {
  dbHarness.activeSlot = 'career_a';
  dbHarness.row = baseSave();
});

describe('Phase 2 playable atomic persistence', () => {
  it('starts one session on the existing save row and treats the same retry as idempotent', async () => {
    const created = session();
    const first = await startPlayableMatchSessionAtomic(created);
    expect(first.idempotent).toBe(false);
    expect(dbHarness.row.playableMatchSession.sessionId).toBe(created.sessionId);
    expect(dbHarness.row.slotId).toBe('career_a');
    expect(dbHarness.row.saveSchemaVersion).toBe(2);

    const retry = await startPlayableMatchSessionAtomic(created);
    expect(retry.idempotent).toBe(true);
    expect(retry.session.sessionId).toBe(created.sessionId);
  });

  it('rejects a different active fixture instead of creating a parallel match lifecycle', async () => {
    await startPlayableMatchSessionAtomic(session('f1'));
    await expect(startPlayableMatchSessionAtomic(session('f2'))).rejects.toThrow('PLAYABLE_MATCH_ALREADY_ACTIVE');
  });

  it('uses revision compare-and-swap for pending/session progress', async () => {
    const created = session();
    await startPlayableMatchSessionAtomic(created);
    const pending = attachPendingPlayableMoment(created, { moment:moment(), continuation:continuation() });
    await persistPlayableSessionAtomic(pending, { expectedSessionId:created.sessionId, expectedRevision:created.revision });
    expect(dbHarness.row.playableMatchSession.status).toBe('pending');

    const stale = { ...pending, revision:pending.revision + 1, status:'active', pending:null };
    dbHarness.row.playableMatchSession.revision += 1;
    await expect(persistPlayableSessionAtomic(stale, {
      expectedSessionId:created.sessionId,
      expectedRevision:pending.revision,
    })).rejects.toThrow('PLAYABLE_SESSION_REVISION_STALE');
  });

  it('returns the stored receipt for an identical duplicate submit and rejects a different second intent', async () => {
    const created = session();
    await startPlayableMatchSessionAtomic(created);
    const pending = attachPendingPlayableMoment(created, { moment:moment(), continuation:continuation() });
    await persistPlayableSessionAtomic(pending, { expectedSessionId:created.sessionId, expectedRevision:created.revision });

    const intent = { attack:{ aimX:.3, aimY:.6, power:.75, timing:.82 } };
    const resolution = { moment:moment(), shot:{ finish:'saved', goal:false, presentation:{contact:'save'} }, record:{phase:20,finish:'saved'} };
    const committed = commitPlayableMomentToSession(pending, {
      momentId:pending.pending.momentId,
      intent,
      resolution,
      updatedState:{ ...liveState(), rngState:20 },
      segEvents:[],
    });
    const first = await commitPlayableMomentAtomic({
      sessionId:created.sessionId,
      momentId:pending.pending.momentId,
      expectedRevision:pending.revision,
      intent,
      nextSession:committed.session,
      receipt:committed.receipt,
    });
    expect(first.idempotent).toBe(false);

    const duplicate = await commitPlayableMomentAtomic({
      sessionId:created.sessionId,
      momentId:pending.pending.momentId,
      expectedRevision:pending.revision,
      intent,
      nextSession:committed.session,
      receipt:committed.receipt,
    });
    expect(duplicate.idempotent).toBe(true);
    expect(duplicate.receipt).toEqual(committed.receipt);

    await expect(commitPlayableMomentAtomic({
      sessionId:created.sessionId,
      momentId:pending.pending.momentId,
      expectedRevision:pending.revision,
      intent:{ attack:{ aimX:-.8, aimY:.6, power:.75, timing:.82 } },
      nextSession:committed.session,
      receipt:committed.receipt,
    })).rejects.toThrow('PLAYABLE_MOMENT_ALREADY_COMMITTED_DIFFERENT_INTENT');
  });

  it('clears only the matching session and is idempotent after successful fixture closeout', async () => {
    const created = session();
    await startPlayableMatchSessionAtomic(created);
    const cleared = await clearPlayableMatchSessionAtomic({ sessionId:created.sessionId, expectedRevision:created.revision });
    expect(cleared.idempotent).toBe(false);
    expect(dbHarness.row.playableMatchSession).toBeNull();

    const retry = await clearPlayableMatchSessionAtomic({ sessionId:created.sessionId });
    expect(retry.idempotent).toBe(true);
  });
});
