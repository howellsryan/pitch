/** modules/db.js — IndexedDB ops: openDB, bulkPut, clearAndBulkPut, deleteDB. Stores: save,teams,players,fixtures,standings,transfers,honors,seasons */
const DB_NAME    = 'pitch_fc';
const DB_VERSION = 3;
let _db = null;

function openDB() {
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

const req2p = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const store  = (name, mode='readonly') => _db.transaction(name, mode).objectStore(name);

function bulkPut(storeName, items) {
  return new Promise((resolve, reject) => {
    const tx = _db.transaction(storeName, 'readwrite');
    const s  = tx.objectStore(storeName);
    items.forEach(item => s.put(item));
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
  });
}

// Clear a store then bulk-insert — used for season rollover
function clearAndBulkPut(storeName, items) {
  return new Promise((resolve, reject) => {
    const tx = _db.transaction(storeName, 'readwrite');
    const s  = tx.objectStore(storeName);
    const clearReq = s.clear();
    clearReq.onsuccess = () => { items.forEach(item => s.put(item)); };
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
  });
}

const getSave            = ()    => req2p(store('save').get('active'));
const putSave            = (d)   => req2p(store('save','readwrite').put({ id:'active', ...d }));
const getAllTeams         = ()    => req2p(store('teams').getAll());
const getTeam            = (id)  => req2p(store('teams').get(id));
const putTeam            = (t)   => req2p(store('teams','readwrite').put(t));
const putTeamsBulk       = (ts)  => bulkPut('teams', ts);
const getAllPlayers       = ()    => req2p(store('players').getAll());
const getPlayer          = (id)  => req2p(store('players').get(id));
const getPlayersByTeam   = (tid) => req2p(store('players').index('by_team').getAll(tid));
const putPlayer          = (p)   => req2p(store('players','readwrite').put(p));
const putPlayersBulk     = (ps)  => bulkPut('players', ps);
function deletePlayersBulk(ids) {
  return new Promise((resolve, reject) => {
    const tx = _db.transaction('players', 'readwrite');
    const s  = tx.objectStore('players');
    ids.forEach(id => s.delete(id));
    tx.oncomplete = resolve;
    tx.onerror    = () => reject(tx.error);
  });
}
const getAllFixtures      = ()    => req2p(store('fixtures').getAll());
const getFixture         = (id)  => req2p(store('fixtures').get(id));
const getFixturesByGW    = (gw)  => req2p(store('fixtures').index('by_gameweek').getAll(gw));
const putFixture         = (f)   => req2p(store('fixtures','readwrite').put(f));
const putFixturesBulk    = (fs)  => bulkPut('fixtures', fs);
// Season rollover: clear ALL old fixtures first, then insert new ones
const replaceAllFixtures  = (fs) => clearAndBulkPut('fixtures', fs);
const getAllStandings     = ()    => req2p(store('standings').getAll());
const getStanding        = (id)  => req2p(store('standings').get(id));
const putStanding        = (s)   => req2p(store('standings','readwrite').put(s));
const putStandingsBulk   = (ss)  => bulkPut('standings', ss);
const replaceAllStandings= (ss)  => clearAndBulkPut('standings', ss);
const getAllTransfers     = ()    => req2p(store('transfers').getAll());
const addTransfer        = (t)   => req2p(store('transfers','readwrite').add(t));
const getAllHonors        = ()    => req2p(store('honors').getAll());
const addHonor           = (h)   => req2p(store('honors','readwrite').add(h));
const getAllSeasons       = ()    => req2p(store('seasons').getAll());
const addSeason          = (s)   => req2p(store('seasons','readwrite').add(s));

function deleteDB() {
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
const _PITCH_SALT = 'pitch_fc_v3_2025';
const _PITCH_MAGIC = 'PITCH_SAVE_V1';

// Simple hash for integrity checking (FNV-1a 32-bit, then hex)
function _fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

async function exportSaveFile() {
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

  // Build filename for display
  const teamName = (saveData?.userTeamId ?? 'team').replace(/[^a-zA-Z0-9_]/g, '_');
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

async function importSaveFromCode(code) {
  // Decode base64 save code
  let envelopeStr;
  try {
    envelopeStr = decodeURIComponent(escape(atob(code.trim())));
  } catch (e) {
    throw new Error('Invalid save code — could not decode.');
  }

  return _restoreFromEnvelope(envelopeStr);
}

async function importSaveFile(file) {
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

async function _restoreFromEnvelope(envelopeStr) {
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

