import { afterEach, expect, it, vi } from 'vitest';
import { _db, _fnv1a, _PITCH_MAGIC, _PITCH_SALT, _restoreFromEnvelope, getActiveSlotId, openDB } from './db.js';

afterEach(() => { _db?.onversionchange?.(); vi.unstubAllGlobals(); });

it('restores the previous active career when the import destination cannot open', async () => {
  const storage = new Map();
  vi.stubGlobal('localStorage', { getItem:key => storage.get(key) ?? null, setItem:(key, value) => storage.set(key, value) });
  const oldDatabase = { close() {} };
  vi.stubGlobal('indexedDB', { open(name) {
    const req = {};
    globalThis.queueMicrotask(() => {
      if (name === 'pitch_fc_slot_import_target') {
        req.error = new Error('destination cannot open');
        req.onerror?.({ target:req });
      } else req.onsuccess?.({ target:{ result:oldDatabase } });
    });
    return req;
  } });
  await openDB();
  const payload = JSON.stringify({
    meta:{ version:_PITCH_MAGIC, schemaVersion:2, slotId:'legacy' },
    snapshot:{ save:[{ id:'active', season:'2026/27' }], teams:[], players:[] },
  });
  const envelope = JSON.stringify({ h:_fnv1a(_PITCH_SALT + payload), d:payload });
  await expect(_restoreFromEnvelope(envelope, 'import_target')).rejects.toThrow('destination cannot open');
  expect(getActiveSlotId()).toBe('legacy');
  expect(_db).toBe(oldDatabase);
});
