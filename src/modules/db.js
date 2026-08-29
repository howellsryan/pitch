/** modules/db.js — IndexedDB ops: openDB, bulkPut, clearAndBulkPut, deleteDB. Stores: save,teams,players,fixtures,standings,transfers,honors,seasons */
export const DB_NAME    = 'pitch_fc';
export const DB_VERSION = 3;
export let _db = null;

export function openDB() {
  return new Promise((resolve, reject) => {
    if (_db) { resolve(_db); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      const make = (name, opts) => { if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, opts); };
      make('save',      { keyPath:'id' });
      make('teams',     { keyPath:'id' });
      make('standings', { keyPath:'teamId' });
      make('transfers', { keyPath:'id', autoIncrement:true });
      make('honors',    { keyPath:'id', autoIncrement:true });
      make('seasons',   { keyPath:'id', autoIncrement:true });
      if (!db.objectStoreNames.contains('players')) {
        const ps = db.createObjectStore('players', { keyPath:'id' });
        ps.createIndex('by_team', 'teamId', { unique:false });
      }
      if (!db.objectStoreNames.contains('fixtures')) {
        const fs = db.createObjectStore('fixtures', { keyPath:'id' });
        fs.createIndex('by_gameweek', 'gameweek', { unique:false });
      }
    };
    req.onsuccess  = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror    = (e) => reject(e.target.error);
  });
}

export const req2p = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
export const store  = (name, mode='readonly') => _db.transaction(name, mode).objectStore(name);

export function bulkPut(storeName, items) {
  return new Promise((resolve, reject) => {
    const tx = _db.transaction(storeName, 'readwrite');
    const s  = tx.objectStore(storeName);
    items.forEach(item => s.put(item));
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
  });
}

// Clear a store then bulk-insert — used for season rollover
export function clearAndBulkPut(storeName, items) {
  return new Promise((resolve, reject) => {
    const tx = _db.transaction(storeName, 'readwrite');
    const s  = tx.objectStore(storeName);
    const clearReq = s.clear();
    clearReq.onsuccess = () => { items.forEach(item => s.put(item)); };
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
  });
}

export const getSave            = ()    => req2p(store('save').get('active'));
export const putSave            = (d)   => req2p(store('save','readwrite').put({ id:'active', ...d }));
export const getAllTeams         = ()    => req2p(store('teams').getAll());
export const getTeam            = (id)  => req2p(store('teams').get(id));
export const putTeam            = (t)   => req2p(store('teams','readwrite').put(t));
export const putTeamsBulk       = (ts)  => bulkPut('teams', ts);
export const getAllPlayers       = ()    => req2p(store('players').getAll());
export const getPlayer          = (id)  => req2p(store('players').get(id));
export const getPlayersByTeam   = (tid) => req2p(store('players').index('by_team').getAll(tid));
export const putPlayer          = (p)   => req2p(store('players','readwrite').put(p));
export const putPlayersBulk     = (ps)  => bulkPut('players', ps);
export function deletePlayersBulk(ids) {
  return new Promise((resolve, reject) => {
    const tx = _db.transaction('players', 'readwrite');
    const s  = tx.objectStore('players');
    ids.forEach(id => s.delete(id));
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
  });
}
export const getAllFixtures      = ()    => req2p(store('fixtures').getAll());
export const getFixture         = (id)  => req2p(store('fixtures').get(id));
export const getFixturesByGW    = (gw)  => req2p(store('fixtures').index('by_gameweek').getAll(gw));
export const putFixture         = (f)   => req2p(store('fixtures','readwrite').put(f));
export const putFixturesBulk    = (fs)  => bulkPut('fixtures', fs);
// Season rollover: clear ALL old fixtures first, then insert new ones
export const replaceAllFixtures  = (fs) => clearAndBulkPut('fixtures', fs);
export const getAllStandings     = ()    => req2p(store('standings').getAll());
export const getStanding        = (id)  => req2p(store('standings').get(id));
export const putStanding        = (s)   => req2p(store('standings','readwrite').put(s));
export const putStandingsBulk   = (ss)  => bulkPut('standings', ss);
export const replaceAllStandings= (ss)  => clearAndBulkPut('standings', ss);
export const getAllTransfers     = ()    => req2p(store('transfers').getAll());
export const addTransfer        = (t)   => req2p(store('transfers','readwrite').add(t));
export const getAllHonors        = ()    => req2p(store('honors').getAll());
export const addHonor           = (h)   => req2p(store('honors','readwrite').add(h));
export const getAllSeasons       = ()    => req2p(store('seasons').getAll());
export const addSeason          = (s)   => req2p(store('seasons','readwrite').add(s));

// Wipes the active career (save/teams/players/fixtures/standings/transfers)
// but keeps honors and seasons — used when a sacked manager starts a new
// job rather than a full "Reset Game", which wipes everything including
// trophy history.
export async function resetForNewCareer() {
  await clearAndBulkPut('save', []);
  await clearAndBulkPut('teams', []);
  await clearAndBulkPut('players', []);
  await clearAndBulkPut('fixtures', []);
  await clearAndBulkPut('standings', []);
  await clearAndBulkPut('transfers', []);
}

export function deleteDB() {
  if (_db) { try { _db.close(); } catch(e) {} }
  _db = null;
  return new Promise((res, rej) => {
    const r = indexedDB.deleteDatabase(DB_NAME);
    r.onsuccess = res;
    r.onerror = () => rej(r.error);
    r.onblocked = () => res(); // If still blocked, just proceed — reload will clean up
  });
}

// ─── Save File Export / Import ────────────────────────────────
// Exports all IndexedDB stores as a single compressed, obfuscated
// .pitch file. Includes an integrity hash to detect tampering.
export const _PITCH_SALT = 'pitch_fc_v3_2025';
export const _PITCH_MAGIC = 'PITCH_SAVE_V1';

// Simple hash for integrity checking (FNV-1a 32-bit, then hex)
export function _fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// Builds the same base64 envelope exportSaveFile() writes to a .pitch file —
// snapshot of all 8 stores, meta, FNV-1a integrity hash — without the
// DOM-touching file-download side effects. Cloud save (ROADMAP.md item 7)
// reuses this directly as save_blob rather than inventing a second save
// format the server would need to understand.
export async function buildSaveEnvelope() {
  const db = await openDB();
  const storeNames = ['save','teams','players','fixtures','standings','transfers','honors','seasons'];
  const snapshot = {};

  for (const name of storeNames) {
    const tx = db.transaction(name, 'readonly');
    const s  = tx.objectStore(name);
    snapshot[name] = await req2p(s.getAll());
  }

  // Build save metadata
  const saveData = snapshot.save?.find(s => s.id === 'active');
  const meta = {
    version: _PITCH_MAGIC,
    exportedAt: new Date().toISOString(),
    teamId: saveData?.userTeamId ?? 'unknown',
    season: saveData?.season ?? 1,
    gameweek: saveData?.currentGameweek ?? 1,
  };

  const payload = JSON.stringify({ meta, snapshot });
  const hash = _fnv1a(_PITCH_SALT + payload);
  const envelope = JSON.stringify({ h: hash, d: payload });

  // Base64 encode the envelope (universal, no compression dependency)
  const saveCode = btoa(unescape(encodeURIComponent(envelope)));

  return { saveCode, meta, envelope };
}

// Cloud save (ROADMAP.md item 7) pushes this envelope over the wire on every
// match-checkpoint auto-save, unlike the .pitch export which is a rare,
// user-initiated action — so unlike saveCode above, this path compresses.
// A brand-new career already carries every club's full roster (186 clubs,
// ~3,900 players — the whole game world, not just the user's league), which
// alone is ~2.3MB base64-encoded before a single gameweek is played: over
// both functions/api/save.js's MAX_SAVE_BYTES and D1's 2,000,000-byte column
// cap. Gzip cuts that to ~180KB (highly repetitive player-record JSON), with
// headroom for a season's worth of fixtures/transfers/honors growth.
// CompressionStream/DecompressionStream are native and already used by
// importSaveFile()'s legacy-gzip fallback below — same approach, no new
// dependency.
async function _gzipString(str) {
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(new TextEncoder().encode(str));
  writer.close();
  const compressed = await new Response(cs.readable).arrayBuffer();
  return new Uint8Array(compressed);
}

async function _gunzipToString(bytes) {
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const decompressed = await new Response(ds.readable).arrayBuffer();
  return new TextDecoder().decode(decompressed);
}

function _bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function _base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function buildCloudSaveBlob() {
  const { envelope, meta } = await buildSaveEnvelope();
  const compressed = await _gzipString(envelope);
  return { blob: _bytesToBase64(compressed), meta };
}

// Falls back to the older uncompressed format (plain base64 of the envelope,
// same as saveCode above) so a save_blob written before this fix shipped
// still restores.
export async function restoreFromCloudBlob(blob) {
  let envelopeStr;
  try {
    envelopeStr = await _gunzipToString(_base64ToBytes(blob));
  } catch {
    envelopeStr = decodeURIComponent(escape(atob(blob.trim())));
  }
  return _restoreFromEnvelope(envelopeStr);
}

export async function exportSaveFile() {
  const { saveCode, meta } = await buildSaveEnvelope();

  // Build filename for display
  const teamName = (meta.teamId ?? 'team').replace(/[^a-zA-Z0-9_]/g, '_');
  const filename = `PITCH_${teamName}_S${meta.season}_GW${meta.gameweek}.pitch`;

  // Try file download as a bonus (works on desktop, may fail in sandboxed iframe)
  let fileDownloaded = false;
  try {
    const blob = new Blob([saveCode], { type: 'text/plain' });

    // Try Web Share API first (mobile)
    try {
      const file = new File([blob], filename, { type: 'text/plain' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'PITCH Save', text: filename });
        fileDownloaded = true;
      }
    } catch (e) {
      if (e.name === 'AbortError') fileDownloaded = true;
    }

    // Try anchor download (desktop)
    if (!fileDownloaded) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 2000);
    }
  } catch (e) { /* File download failed — saveCode modal is the fallback */ }

  return { filename, size: saveCode.length, meta, saveCode };
}

export async function importSaveFromCode(code) {
  // Decode base64 save code
  let envelopeStr;
  try {
    envelopeStr = decodeURIComponent(escape(atob(code.trim())));
  } catch (e) {
    throw new Error('Invalid save code — could not decode.');
  }

  return _restoreFromEnvelope(envelopeStr);
}

export async function importSaveFile(file) {
  // Read file as text — save files are now base64-encoded text
  const text = await file.text();

  // Try interpreting as raw base64 save code first
  let envelopeStr;
  try {
    envelopeStr = decodeURIComponent(escape(atob(text.trim())));
  } catch (e) {
    // Maybe it's an older gzip-compressed file
    try {
      const buf = await file.arrayBuffer();
      if (typeof DecompressionStream !== 'undefined') {
        const ds = new DecompressionStream('gzip');
        const writer = ds.writable.getWriter();
        writer.write(new Uint8Array(buf));
        writer.close();
        const decompressed = await new Response(ds.readable).arrayBuffer();
        envelopeStr = new TextDecoder().decode(decompressed);
      } else {
        throw new Error('Cannot decompress');
      }
    } catch (e2) {
      throw new Error('Invalid save file — could not decode.');
    }
  }

  return _restoreFromEnvelope(envelopeStr);
}

export async function _restoreFromEnvelope(envelopeStr) {
  // Parse envelope
  let envelope;
  try {
    envelope = JSON.parse(envelopeStr);
  } catch (e) {
    throw new Error('Invalid save data — corrupted format.');
  }

  if (!envelope.h || !envelope.d) {
    throw new Error('Invalid save data — missing integrity check.');
  }

  // Verify integrity hash
  const expectedHash = _fnv1a(_PITCH_SALT + envelope.d);
  if (envelope.h !== expectedHash) {
    throw new Error('Save data integrity check failed — data may have been modified.');
  }

  // Parse payload
  let data;
  try {
    data = JSON.parse(envelope.d);
  } catch (e) {
    throw new Error('Invalid save data — corrupted payload.');
  }

  if (data.meta?.version !== _PITCH_MAGIC) {
    throw new Error('Unsupported save version.');
  }

  const snapshot = data.snapshot;
  if (!snapshot || !snapshot.save || !snapshot.teams || !snapshot.players) {
    throw new Error('Invalid save data — missing game data.');
  }

  // Wipe current DB and restore all stores
  if (_db) { _db.close(); _db = null; }
  await new Promise((res, rej) => {
    const r = indexedDB.deleteDatabase(DB_NAME);
    r.onsuccess = res; r.onerror = () => rej(r.error);
  });

  await openDB();

  const storeNames = ['save','teams','players','fixtures','standings','transfers','honors','seasons'];
  for (const name of storeNames) {
    const items = snapshot[name];
    if (items && items.length > 0) {
      await bulkPut(name, items);
    }
  }

  return data.meta;
}

