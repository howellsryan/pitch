import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeStoredPlayer } from './playerStorageCodec.js';

import { commitMatchEventAtomic, openDB } from './db.js';

function memoryDatabase(rows, failStore = null) {
  return {
    close() {},
    transaction(names) {
      const stores = Object.fromEntries(names.map(name => [name, new Map(rows[name])]));
      let aborted = false;
      let scheduled = false;
      const complete = () => {
        if (scheduled) return;
        scheduled = true;
        globalThis.queueMicrotask(() => {
          if (aborted) return;
          for (const name of names) rows[name] = stores[name];
          tx.oncomplete?.();
        });
      };
      const tx = {
        abort() { aborted = true; globalThis.queueMicrotask(() => tx.onabort?.()); },
        objectStore(name) {
          return {
            get(key) {
              const request = {};
              globalThis.queueMicrotask(() => {
                request.result = globalThis.structuredClone(stores[name].get(key));
                request.onsuccess?.();
                complete();
              });
              return request;
            },
            put(value) {
              if (name === failStore) throw new Error('storage interrupted');
              stores[name].set(value.id, globalThis.structuredClone(value));
              complete();
            },
          };
        },
      };
      return tx;
    },
  };
}

async function setup(failStore = null) {
  const event = { type:'league', fixtureId:'match', gw:1 };
  const rows = {
    save:new Map([['active', { id:'active', slotId:'legacy', season:'2025/26', currentGameweek:1, pendingEvents:[event], untouched:'preserved' }]]),
    fixtures:new Map([['match', { id:'match', played:false }]]),
    players:new Map([['player', { id:'player', appearances:0 }]]),
  };
  const db = memoryDatabase(rows, failStore);
  vi.stubGlobal('indexedDB', { open() {
    const request = {};
    globalThis.queueMicrotask(() => request.onsuccess?.({ target:{ result:db } }));
    return request;
  } });
  // openDB caches a connection; invoke its real version-change invalidation
  // after each test so every test gets an isolated database.
  await openDB();
  return { event, rows, db };
}

let activeDb = null;
afterEach(() => { activeDb?.onversionchange?.(); activeDb = null; vi.unstubAllGlobals(); });

describe('atomic managed match checkpoint', () => {
  it('commits fixture, participant stats and queue together and preserves save identity', async () => {
    const { event, rows, db } = await setup();
    activeDb = db;
    const saved = await commitMatchEventAtomic({
      event, season:'2025/26', gameweek:1,
      savePatch:{ pendingEvents:[], managerDNA:{ matches:1 } },
      fixture:{ id:'match', played:true, homeGoals:2 }, players:[{ id:'player', appearances:1 }],
    });
    expect(rows.fixtures.get('match').played).toBe(true);
    expect(rows.players.get('player').__pitchPlayerStorage).toBe(1);
    expect(decodeStoredPlayer(rows.players.get('player')).appearances).toBe(1);
    expect(rows.save.get('active')).toMatchObject({ slotId:'legacy', untouched:'preserved', pendingEvents:[], saveSchemaVersion:2 });
    expect(saved).toEqual(rows.save.get('active'));
  });

  it('aborts every write if participant persistence fails after the fixture write', async () => {
    const { event, rows, db } = await setup('players');
    activeDb = db;
    await expect(commitMatchEventAtomic({
      event, season:'2025/26', gameweek:1, savePatch:{ pendingEvents:[] },
      fixture:{ id:'match', played:true }, players:[{ id:'player', appearances:1 }],
    })).rejects.toThrow('storage interrupted');
    expect(rows.fixtures.get('match').played).toBe(false);
    expect(rows.players.get('player').appearances).toBe(0);
    expect(rows.save.get('active').pendingEvents).toEqual([event]);
  });

  it('rejects a stale queue head before changing any authoritative rows', async () => {
    const { rows, db } = await setup();
    activeDb = db;
    await expect(commitMatchEventAtomic({
      event:{ type:'league', fixtureId:'wrong', gw:1 }, season:'2025/26', gameweek:1,
      savePatch:{ pendingEvents:[] }, fixture:{ id:'match', played:true },
    })).rejects.toThrow('MATCH_EVENT_CHANGED');
    expect(rows.fixtures.get('match').played).toBe(false);
    expect(rows.save.get('active').pendingEvents).toHaveLength(1);
  });
});
