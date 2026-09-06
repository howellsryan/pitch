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
    return {
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
  },
}));

import { createShootoutState } from './matchShootout.js';
import {
  acknowledgeCompetitionShootoutSession,
  createCompetitionShootoutSession,
  resolveCompetitionShootoutSession,
} from './competitionShootoutSession.js';
import {
  persistCompetitionShootoutSessionAtomic,
  restoredCompetitionShootoutSession,
  startCompetitionShootoutSessionAtomic,
} from './competitionShootoutPersistence.js';
import { playableEventKey } from './playableMomentsCareer.js';

function player(id, teamId, position, rating = 80) {
  return {
    id,
    name:id,
    teamId,
    position,
    matchPosition:position,
    attack:rating,
    midfield:rating,
    defence:rating,
    goalkeeping:position === 'GK' ? rating : 8,
    fitness:90,
    form:50,
    individualMorale:50,
    sharpness:50,
    attributeProfile:{ shooting:rating, physical:rating, passing:rating, pace:rating, dribbling:rating, defending:rating },
  };
}

function side(prefix, teamId, rating = 80) {
  return [
    player(`${prefix}-gk`, teamId, 'GK', rating),
    ...Array.from({ length:10 }, (_, index) => player(`${prefix}-${index + 1}`, teamId, index < 2 ? 'ST' : 'CM', rating - index)),
  ];
}

const HOME = side('h', 'home', 84);
const AWAY = side('a', 'away', 78);

function event(overrides = {}) {
  return {
    type:'cup',
    cupId:'fa_cup',
    gw:20,
    roundIdx:3,
    roundName:'Round 4',
    opponentId:'away',
    opponentName:'Away',
    userIsHome:true,
    shootoutVersion:1,
    ...overrides,
  };
}

function regulationResult() {
  return {
    homeTeamId:'home', awayTeamId:'away',
    homeGoals:1, awayGoals:1,
    homeTeamName:'Home', awayTeamName:'Away',
    homeScorers:[], awayScorers:[], events:[], stats:{}, seed:9182,
  };
}

function session(seed = 9182) {
  const shootoutState = createShootoutState({
    seed,
    homeTeamId:'home', awayTeamId:'away',
    homePlayers:HOME, awayPlayers:AWAY,
    firstTeamId:'home',
  });
  return createCompetitionShootoutSession({
    shootoutState,
    controlledTeamId:'home',
    regulationResult:regulationResult(),
  });
}

function baseSave(pendingEvent = event()) {
  return {
    id:'active', slotId:'career_a', saveSchemaVersion:2,
    userTeamId:'home', currentGameweek:20,
    pendingEvents:[pendingEvent, { type:'league', gw:20, fixtureId:'later' }],
  };
}

beforeEach(() => {
  dbHarness.activeSlot = 'career_a';
  dbHarness.row = baseSave();
});

describe('Phase 7 competition shootout persistence', () => {
  it('stores the session on the existing pending cup event without creating another queue item', async () => {
    const matchEvent = event();
    const created = session();
    const result = await startCompetitionShootoutSessionAtomic(matchEvent, created);
    expect(result.idempotent).toBe(false);
    expect(dbHarness.row.pendingEvents).toHaveLength(2);
    expect(dbHarness.row.pendingEvents[0].shootoutSession).toEqual(created);
    expect(dbHarness.row.pendingEvents[1]).toEqual({ type:'league', gw:20, fixtureId:'later' });
    expect(dbHarness.row.slotId).toBe('career_a');
  });

  it('treats a retry of the same shootout start as idempotent and rejects a different shootout', async () => {
    const matchEvent = event();
    const created = session();
    await startCompetitionShootoutSessionAtomic(matchEvent, created);
    const retry = await startCompetitionShootoutSessionAtomic(matchEvent, created);
    expect(retry.idempotent).toBe(true);
    expect(retry.session).toEqual(created);

    await expect(startCompetitionShootoutSessionAtomic(matchEvent, session(7777)))
      .rejects.toThrow('COMPETITION_SHOOTOUT_ALREADY_ACTIVE');
  });

  it('persists revision progress with compare-and-swap protection', async () => {
    const matchEvent = event();
    const created = session();
    await startCompetitionShootoutSessionAtomic(matchEvent, created);
    const committed = resolveCompetitionShootoutSession(created, null).session;
    const saved = await persistCompetitionShootoutSessionAtomic(committed, {
      eventKey:playableEventKey(matchEvent),
      expectedRevision:created.revision,
    });
    expect(saved.idempotent).toBe(false);
    expect(dbHarness.row.pendingEvents[0].shootoutSession.status).toBe('committed');

    const next = acknowledgeCompetitionShootoutSession(committed);
    dbHarness.row.pendingEvents[0].shootoutSession.revision += 1;
    await expect(persistCompetitionShootoutSessionAtomic(next, {
      eventKey:playableEventKey(matchEvent),
      expectedRevision:committed.revision,
    })).rejects.toThrow('COMPETITION_SHOOTOUT_SESSION_REVISION_STALE');
  });

  it('makes a lost-response retry of an identical already-written revision idempotent', async () => {
    const matchEvent = event();
    const created = session();
    await startCompetitionShootoutSessionAtomic(matchEvent, created);
    const committed = resolveCompetitionShootoutSession(created, null).session;
    await persistCompetitionShootoutSessionAtomic(committed, {
      eventKey:playableEventKey(matchEvent),
      expectedRevision:created.revision,
    });
    const retry = await persistCompetitionShootoutSessionAtomic(structuredClone(committed), {
      eventKey:playableEventKey(matchEvent),
      expectedRevision:created.revision,
    });
    expect(retry.idempotent).toBe(true);
    expect(retry.session).toEqual(committed);
  });

  it('rejects a same-revision payload collision instead of accepting divergent state', async () => {
    const matchEvent = event();
    const created = session();
    await startCompetitionShootoutSessionAtomic(matchEvent, created);
    const committed = resolveCompetitionShootoutSession(created, null).session;
    await persistCompetitionShootoutSessionAtomic(committed, {
      eventKey:playableEventKey(matchEvent),
      expectedRevision:created.revision,
    });
    const corrupt = structuredClone(committed);
    corrupt.lastShot.finish = corrupt.lastShot.finish === 'goal' ? 'saved' : 'goal';
    await expect(persistCompetitionShootoutSessionAtomic(corrupt, {
      eventKey:playableEventKey(matchEvent),
      expectedRevision:created.revision,
    })).rejects.toThrow('COMPETITION_SHOOTOUT_REVISION_COLLISION');
  });

  it('restores and validates the exact saved session from the pending event', async () => {
    const created = session();
    await startCompetitionShootoutSessionAtomic(event(), created);
    const restored = restoredCompetitionShootoutSession(dbHarness.row.pendingEvents[0]);
    expect(restored).toEqual(created);
    expect(restored.pending.kick.packet).toEqual(created.pending.kick.packet);
  });

  it('rejects writes to a different active career slot', async () => {
    dbHarness.activeSlot = 'career_b';
    await expect(startCompetitionShootoutSessionAtomic(event(), session()))
      .rejects.toThrow('COMPETITION_SHOOTOUT_SAVE_SLOT_STALE');
  });

  it('rejects a missing, non-cup or league-phase event rather than inventing a new lifecycle', async () => {
    await expect(startCompetitionShootoutSessionAtomic(event({ cupId:'missing' }), session()))
      .rejects.toThrow('COMPETITION_SHOOTOUT_EVENT_MISSING');

    dbHarness.row = baseSave({ ...event(), type:'league' });
    await expect(startCompetitionShootoutSessionAtomic({ ...event(), type:'league' }, session()))
      .rejects.toThrow('COMPETITION_SHOOTOUT_EVENT_INVALID');

    dbHarness.row = baseSave(event({ leaguePhase:true }));
    await expect(startCompetitionShootoutSessionAtomic(event({ leaguePhase:true }), session()))
      .rejects.toThrow('COMPETITION_SHOOTOUT_EVENT_INVALID');
  });
});
