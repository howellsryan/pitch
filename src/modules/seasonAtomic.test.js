import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _db, _fnv1a, _PITCH_MAGIC, _PITCH_SALT, _restoreFromEnvelope, buildSaveEnvelope, bulkPut, getAllPlayers, getAllSeasons, getManager, getSave, getTeam, openDB, putSave, runSeasonRolloverAtomic } from './db.js';
import { resignAsManager, tryCompletePendingUserHandover } from './managerUserActions.js';
import { ensureSeasonHistoryCompaction } from './save.js';

// IO double models transaction commit/abort; game writes use the actual DB API.
function transactionalDatabase() {
  const rows = new Map();
  const database = {
    rows,
    objectStoreNames:{ contains:() => true },
    close() {},
    transaction(names, mode) {
      const working = globalThis.structuredClone(rows);
      if (mode === 'readonly') database.afterReadSnapshot?.();
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
              catch (error) { tx.error = error; req.error = error; req.onerror?.(); tx.onerror?.(); tx.abort(); }
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
            getKey:key => request(() => table.has(key) ? key : undefined),
            getAll:() => request(() => globalThis.structuredClone([...table.values()])),
            index:() => ({ getAll:gameweek => request(() => globalThis.structuredClone([...table.values()].filter(row => row.gameweek === gameweek))) }),
            put(value) {
              const key = value.id ?? value.teamId;
              if (key == null) throw new Error('Missing row key');
              return request(() => {
                if (database.failWritesTo === name) throw new Error('Injected write failure');
                table.set(key, globalThis.structuredClone(value)); return key;
              });
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

  it('keeps the manager employed when resignation fails after writing a caretaker', async () => {
    await bulkPut('managers', [{ id:'mgr_user', isUser:true, status:'employed', currentClubId:'club', record:{} }]);
    await bulkPut('teams', [{ id:'club', name:'Club', league:'Premier League', managerId:'mgr_user' }]);
    await putSave({ season:'2026/27', currentGameweek:2, userTeamId:'club', userManagerId:'mgr_user', pendingEvents:[], managerMarket:{ vacancies:[] } });
    await new Promise(resolve => globalThis.setTimeout(resolve, 5));
    _db.failWritesTo = 'teams';
    await expect(resignAsManager()).rejects.toThrow('Injected write failure');
    expect(await getManager('mgr_user')).toMatchObject({ status:'employed', currentClubId:'club' });
    expect(await getTeam('club')).toMatchObject({ managerId:'mgr_user' });
    expect((await getSave()).managerMarket.vacancies).toEqual([]);
  });

  it('rolls back both club ownership and manager status when the final handover save fails', async () => {
    const vacancy = { id:'vac_new', clubId:'new', status:'completed', hiredManagerId:'mgr_user', caretakerManagerId:'caretaker' };
    await bulkPut('managers', [
      { id:'mgr_user', isUser:true, status:'unemployed', currentClubId:null, record:{} },
      { id:'caretaker', status:'caretaker', currentClubId:'new', record:{} },
    ]);
    await bulkPut('teams', [
      { id:'old', name:'Old', league:'Premier League', managerId:'old_ai', reputation:70 },
      { id:'new', name:'New', league:'Premier League', managerId:'caretaker', reputation:70 },
    ]);
    await putSave({
      season:'2026/27', currentGameweek:2, currentDate:'2026-08-16T00:00:00.000Z',
      userTeamId:'old', userManagerId:'mgr_user', pendingEvents:[],
      managerMarket:{ vacancies:[vacancy], pendingUserHandover:{ clubId:'new', vacancyId:'vac_new' } },
    });
    await new Promise(resolve => globalThis.setTimeout(resolve, 5));
    _db.failWritesTo = 'save';
    await expect(tryCompletePendingUserHandover()).rejects.toThrow('Injected write failure');
    expect(await getManager('mgr_user')).toMatchObject({ status:'unemployed', currentClubId:null });
    expect(await getManager('caretaker')).toMatchObject({ currentClubId:'new' });
    expect(await getTeam('new')).toMatchObject({ managerId:'caretaker' });
    expect(await getSave()).toMatchObject({ userTeamId:'old', managerMarket:{ pendingUserHandover:{ clubId:'new' } } });
  });

  it('backfills old archive detail atomically while retaining the latest full world season', async () => {
    const history = [{ playerId:'opponent', clubs:['other'], appearances:10, spells:[{ status:'first_team' }] }];
    await bulkPut('seasons', [
      { id:1, season:'2024/25', playerHistory:history },
      { id:2, season:'2025/26', playerHistory:history },
    ]);
    await new Promise(resolve => globalThis.setTimeout(resolve, 5));
    const original = await getSave();
    _db.failWritesTo = 'save';
    await expect(ensureSeasonHistoryCompaction(original)).rejects.toThrow('Injected write failure');
    expect((await getAllSeasons())[0].playerHistory[0].spells).toHaveLength(1);
    expect((await getSave()).seasonHistoryCompactionVersion).toBeUndefined();
    _db.failWritesTo = null;
    const result = await ensureSeasonHistoryCompaction(original);
    const records = await getAllSeasons();
    expect(result.seasonHistoryCompactionVersion).toBe(3);
    expect(records[0].playerHistory[0]).toMatchObject({ playerId:'opponent', appearances:10 });
    expect(records[0].playerHistory[0].spells).toBeUndefined();
    expect(records[1].playerHistory[0].spells).toHaveLength(1);
  });

  it('exports one coherent snapshot while another career checkpoint commits', async () => {
    _db.afterReadSnapshot = () => {
      _db.afterReadSnapshot = null;
      // Model an external committed checkpoint after the read snapshot starts.
      _db.rows.get('players').set('captain', { id:'captain', age:29 });
      _db.rows.get('save').set('active', { id:'active', season:'2027/28', currentGameweek:1 });
    };
    const { envelope } = await buildSaveEnvelope();
    const { snapshot } = JSON.parse(JSON.parse(envelope).d);
    expect(snapshot.save[0].season).toBe('2026/27');
    expect(snapshot.players[0].age).toBe(28);
    expect((await getSave()).season).toBe('2027/28');
    expect((await getAllPlayers())[0].age).toBe(29);
  });
});
