/** modules/db.js — IndexedDB ops: openDB, bulkPut, clearAndBulkPut, deleteDB. Stores: save,teams,players,fixtures,standings,transfers,honors,seasons */
const DB_NAME    = 'pitch_fc';
const DB_VERSION = 3;
let _db = null;

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

export function deleteDB() {
  _db = null;
  return new Promise((res, rej) => {
    const r = indexedDB.deleteDatabase(DB_NAME);
    r.onsuccess = res; r.onerror = rej;
  });
}
