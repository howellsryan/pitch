import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _db, _fnv1a, _PITCH_MAGIC, _PITCH_SALT, _restoreFromEnvelope, bulkPut, getAllPlayers, getSave, openDB, putSave, runSeasonRolloverAtomic } from './db.js';

// IO double models transaction commit/abort; game writes use the actual DB API.
function transactionalDatabase() {
  const rows = new Map();
  const database = {
    objectStoreNames:{ contains:() => true },
    close() {},
    transaction(names, mode) {
      const working = globalThis.structuredClone(rows);
      let pending = 0;
      let ended = false;
      const tx = {
        error:null,
        objectStore(name) {
          if (!working.has(name)) working.set(name, new Map());
          const table = working.get(name);
          const request = operation => {
            const req = {};
            pending++;
            globalThis.setTimeout(() => {
              pending--;
              if (ended) return;
              try { req.result = operation(); req.onsuccess?.(); }
              catch (error) { tx.error = error; req.error = error; req.onerror?.(); tx.abort(); }
              globalThis.setTimeout(() => {
                if (ended || pending) return;
                ended = true;
                if (mode === 'readwrite') {
                  for (const [key, value] of working) rows.set(key, value);
                }
                tx.oncomplete?.();
              }, 0);
            }, 0);
            return req;
          };
          return {
            get:key => request(() => globalThis.structuredClone(table.get(key))),
            getAll:() => request(() => globalThis.structuredClone([...table.values()])),
            put(value) {
              const key = value.id ?? value.teamId;
              if (key == null) throw new Error('Missing row key');
              return request(() => { table.set(key, globalThis.structuredClone(value)); return key; });
            },
            clear:() => request(() => table.clear()),
            delete:key => request(() => table.delete(key)),
          };
        },
        abort() { if (!ended) { ended=true; globalThis.queueMicrotask(() => tx.onabort?.()); } },
      };
      return tx;
    },
  };
  return database;
}

describe('atomic season rollover', () => {
  beforeEach(async () => {
    _db?.onversionchange?.();
    const database = transactionalDatabase();
    vi.stubGlobal('indexedDB', { open:() => {
      const request = {};
      globalThis.setTimeout(() => request.onsuccess?.({ target:{ result:database } }), 0);
      return request;
    } });
    await openDB();
    await bulkPut('players', [{ id:'captain', age:28 }]);
    await putSave({ season:'2026/27', currentGameweek:47 });
    // Wait for the ordinary single-store commit before a new transaction.
    await new Promise(resolve => globalThis.setTimeout(resolve, 5));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('rolls back aging and calendar together when rollover fails', async () => {
    await expect(runSeasonRolloverAtomic(async () => {
      await bulkPut('players', [{ id:'captain', age:29 }]);
      await putSave({ season:'2027/28', currentGameweek:1 });
      throw new Error('interrupted rollover');
    })).rejects.toThrow('interrupted rollover');
    expect((await getAllPlayers())[0].age).toBe(28);
    expect((await getSave()).season).toBe('2026/27');
  });

  it('publishes the complete next season only after every write succeeds', async () => {
    await runSeasonRolloverAtomic(async () => {
      await bulkPut('players', [{ id:'captain', age:29 }]);
      await putSave({ season:'2027/28', currentGameweek:1 });
    });
    expect((await getAllPlayers())[0].age).toBe(29);
    expect((await getSave()).season).toBe('2027/28');
  });

  it('preserves the existing career when a restore fails midway through writes', async () => {
    const payload = JSON.stringify({
      meta:{ version:_PITCH_MAGIC, schemaVersion:2, slotId:'legacy' },
      snapshot:{ save:[{ id:'active', season:'2027/28' }], teams:[], players:[{ age:99 }] },
    });
    const envelope = JSON.stringify({ h:_fnv1a(_PITCH_SALT + payload), d:payload });
    await expect(_restoreFromEnvelope(envelope)).rejects.toThrow();
    expect((await getAllPlayers())[0].age).toBe(28);
    expect((await getSave()).season).toBe('2026/27');
  });
});
