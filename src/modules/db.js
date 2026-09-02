/**
 * modules/db.js — IndexedDB persistence, career-slot isolation and save envelopes.
 *
 * P0 keeps the existing `pitch_fc` database as the legacy/first career so an
 * installed browser career is never orphaned by the migration. New careers
 * receive their own IndexedDB database. The active slot is only a pointer;
 * every existing domain/store API continues to operate on one active DB.
 */
export const DB_NAME = 'pitch_fc';
export const DB_VERSION = 4;
export const LEGACY_SLOT_ID = 'legacy';
export const SAVE_SCHEMA_VERSION = 2;
export const CAREER_SLOT_REGISTRY_VERSION = 1;

const ACTIVE_SLOT_KEY = 'pitch_active_career_slot_v1';
const SLOT_REGISTRY_KEY = 'pitch_career_slots_v1';
const STORE_NAMES = ['save','teams','players','fixtures','standings','transfers','honors','seasons','managers'];
const SAFE_SLOT_ID = /^[a-zA-Z0-9_-]{1,80}$/;

export let _db = null;
let _dbSlotId = null;

function _storage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {}
  return null;
}

function _readRegistry() {
  const storage = _storage();
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(SLOT_REGISTRY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(id => typeof id === 'string' && SAFE_SLOT_ID.test(id)) : [];
  } catch {
    return [];
  }
}

function _writeRegistry(ids) {
  const storage = _storage();
  if (!storage) return;
  const clean = [...new Set(ids.filter(id => typeof id === 'string' && SAFE_SLOT_ID.test(id)))];
  storage.setItem(SLOT_REGISTRY_KEY, JSON.stringify(clean));
}

function _registerSlot(slotId) {
  if (!SAFE_SLOT_ID.test(slotId)) throw new Error('Invalid career slot ID.');
  const ids = _readRegistry();
  if (!ids.includes(slotId)) _writeRegistry([...ids, slotId]);
}

function _unregisterSlot(slotId) {
  _writeRegistry(_readRegistry().filter(id => id !== slotId));
}

export function getActiveSlotId() {
  const storage = _storage();
  const id = storage?.getItem(ACTIVE_SLOT_KEY);
  return id && SAFE_SLOT_ID.test(id) ? id : LEGACY_SLOT_ID;
}

export function getCareerSlotIds() {
  // Always probe legacy once: pre-P0 users have no registry entry yet.
  return [...new Set([LEGACY_SLOT_ID, ..._readRegistry()])];
}

export function careerSlotDbName(slotId = getActiveSlotId()) {
  if (!SAFE_SLOT_ID.test(slotId)) throw new Error('Invalid career slot ID.');
  return slotId === LEGACY_SLOT_ID ? DB_NAME : `${DB_NAME}_slot_${slotId}`;
}

export function makeCareerSlotId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `career_${crypto.randomUUID().replace(/-/g, '')}`;
    }
  } catch {}
  return `career_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function _upgradeSchema(db) {
  const make = (name, opts) => {
    if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, opts);
  };
  make('save', { keyPath:'id' });
  make('teams', { keyPath:'id' });
  make('standings', { keyPath:'teamId' });
  make('transfers', { keyPath:'id', autoIncrement:true });
  make('honors', { keyPath:'id', autoIncrement:true });
  make('seasons', { keyPath:'id', autoIncrement:true });
  if (!db.objectStoreNames.contains('players')) {
    const ps = db.createObjectStore('players', { keyPath:'id' });
    ps.createIndex('by_team', 'teamId', { unique:false });
  }
  if (!db.objectStoreNames.contains('fixtures')) {
    const fs = db.createObjectStore('fixtures', { keyPath:'id' });
    fs.createIndex('by_gameweek', 'gameweek', { unique:false });
  }
  if (!db.objectStoreNames.contains('managers')) {
    const ms = db.createObjectStore('managers', { keyPath:'id' });
    ms.createIndex('by_club', 'currentClubId', { unique:false });
  }
}

function _openNamedDB(name) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, DB_VERSION);
    req.onupgradeneeded = e => _upgradeSchema(e.target.result);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
}

export async function openDB() {
  const slotId = getActiveSlotId();
  if (_db && _dbSlotId === slotId) return _db;
  if (_db) {
    try { _db.close(); } catch {}
    _db = null;
    _dbSlotId = null;
  }
  _db = await _openNamedDB(careerSlotDbName(slotId));
  _dbSlotId = slotId;
  _registerSlot(slotId);
  _db.onversionchange = () => {
    try { _db?.close(); } catch {}
    _db = null;
    _dbSlotId = null;
  };
  return _db;
}

export async function activateCareerSlot(slotId) {
  if (!SAFE_SLOT_ID.test(slotId)) throw new Error('Invalid career slot ID.');
  if (_db) {
    try { _db.close(); } catch {}
    _db = null;
    _dbSlotId = null;
  }
  _registerSlot(slotId);
  _storage()?.setItem(ACTIVE_SLOT_KEY, slotId);
  return slotId;
}

export async function createCareerSlot({ activate = true } = {}) {
  const slotId = makeCareerSlotId();
  _registerSlot(slotId);
  if (activate) await activateCareerSlot(slotId);
  return slotId;
}

export const req2p = r => new Promise((res, rej) => {
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
export const store = (name, mode='readonly') => _db.transaction(name, mode).objectStore(name);

export function bulkPut(storeName, items) {
  return _bulkPutToDB(_db, storeName, items);
}

function _bulkPutToDB(db, storeName, items) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const s = tx.objectStore(storeName);
    items.forEach(item => s.put(item));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export function clearAndBulkPut(storeName, items) {
  return new Promise((resolve, reject) => {
    const tx = _db.transaction(storeName, 'readwrite');
    const s = tx.objectStore(storeName);
    const clearReq = s.clear();
    clearReq.onsuccess = () => items.forEach(item => s.put(item));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function getSave() {
  const raw = await req2p(store('save').get('active'));
  if (!raw) return raw;
  return {
    ...raw,
    slotId: raw.slotId ?? getActiveSlotId(),
    saveSchemaVersion: raw.saveSchemaVersion ?? 1,
  };
}

export function putSave(data) {
  const slotId = getActiveSlotId();
  _registerSlot(slotId);
  const next = {
    ...data,
    id:'active',
    slotId,
    saveSchemaVersion:SAVE_SCHEMA_VERSION,
    lastPlayedAt:new Date().toISOString(),
  };
  return req2p(store('save','readwrite').put(next));
}

export const getAllTeams = () => req2p(store('teams').getAll());
export const getTeam = id => req2p(store('teams').get(id));
export const putTeam = t => req2p(store('teams','readwrite').put(t));
export const putTeamsBulk = ts => bulkPut('teams', ts);
export const getAllPlayers = () => req2p(store('players').getAll());
export const getPlayer = id => req2p(store('players').get(id));
export const getPlayersByTeam = tid => req2p(store('players').index('by_team').getAll(tid));
export const putPlayer = p => req2p(store('players','readwrite').put(p));
export const putPlayersBulk = ps => bulkPut('players', ps);
export function deletePlayersBulk(ids) {
  return new Promise((resolve, reject) => {
    const tx = _db.transaction('players', 'readwrite');
    const s = tx.objectStore('players');
    ids.forEach(id => s.delete(id));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
export const getAllFixtures = () => req2p(store('fixtures').getAll());
export const getFixture = id => req2p(store('fixtures').get(id));
export const getFixturesByGW = gw => req2p(store('fixtures').index('by_gameweek').getAll(gw));
export const putFixture = f => req2p(store('fixtures','readwrite').put(f));
export const putFixturesBulk = fs => bulkPut('fixtures', fs);
export const replaceAllFixtures = fs => clearAndBulkPut('fixtures', fs);
export const getAllStandings = () => req2p(store('standings').getAll());
export const getStanding = id => req2p(store('standings').get(id));
export const putStanding = s => req2p(store('standings','readwrite').put(s));
export const putStandingsBulk = ss => bulkPut('standings', ss);
export const replaceAllStandings = ss => clearAndBulkPut('standings', ss);
export const getAllTransfers = () => req2p(store('transfers').getAll());
export const addTransfer = t => req2p(store('transfers','readwrite').add(t));

/**
 * Complete one agreed P4 deal in a single IndexedDB transaction. The deal is
 * re-read inside the transaction and immutable history is checked first, so a
 * retry after an interrupted UI flow cannot charge or move a player twice.
 */
export function settleTransferMarketDealAtomic(dealId) {
  return new Promise((resolve, reject) => {
    const tx = _db.transaction(['save', 'teams', 'players', 'transfers'], 'readwrite');
    const saves = tx.objectStore('save');
    const teamsStore = tx.objectStore('teams');
    const playersStore = tx.objectStore('players');
    const historyStore = tx.objectStore('transfers');
    let result = null;
    let failure = null;
    const requests = [saves.get('active'), teamsStore.getAll(), playersStore.getAll(), historyStore.getAll()];
    let remaining = requests.length;

    const fail = error => {
      failure = error instanceof Error ? error : new Error(String(error));
      try { tx.abort(); } catch {}
    };
    for (const request of requests) {
      request.onerror = () => fail(request.error ?? new Error('TRANSFER_SETTLEMENT_READ_FAILED'));
      request.onsuccess = () => {
        remaining -= 1;
        if (remaining || failure) return;
        try {
          const [saveReq, teamReq, playerReq, historyReq] = requests;
          const save = saveReq.result;
          const allTeams = teamReq.result ?? [];
          const allPlayers = playerReq.result ?? [];
          const history = historyReq.result ?? [];
          const market = save?.transferMarket;
          const existingByDeal = history.find(item => item.dealId === dealId);
          if (existingByDeal) {
            result = { success:true, idempotent:true, deal:null, history:existingByDeal };
            return;
          }
          const deal = market?.activeDeals?.find(item => item.id === dealId);
          if (!deal) throw new Error('DEAL_NOT_FOUND');
          const existing = history.find(item => item.idempotencyKey === deal.idempotencyKey);
          if (existing) {
            result = { success:true, idempotent:true, deal, history:existing };
            return;
          }
          if (deal.state !== 'agreed') throw new Error('DEAL_NOT_READY');

          const rejectSettlement = reasonCode => {
            const rejectedDeal = { ...deal, state:'rejected', awaiting:null, stateOwner:'system', decisionLog:[...(deal.decisionLog ?? []), { eventKey:`${deal.idempotencyKey}:settlement-rejected`, weekKey:market.lastTickKey ?? deal.updatedWeekKey, from:'agreed', to:'rejected', actor:'system', reasonCode }].slice(-24) };
            const activeDeals = market.activeDeals.map(item => item.id === deal.id ? rejectedDeal : item);
            saves.put({ ...save, transferMarket:{ ...market, activeDeals, reservedCommitments:(market.reservedCommitments ?? []).filter(item => item.dealId !== deal.id) }, inboundOffers:(save.inboundOffers ?? []).filter(item => item.dealId !== deal.id), lastPlayedAt:new Date().toISOString() });
            result = { success:false, idempotent:false, deal:rejectedDeal, error:reasonCode };
          };
          if (!deal.termsValid) { rejectSettlement('invalid_terms'); return; }

          const player = allPlayers.find(item => String(item.id) === String(deal.playerId));
          const buyer = allTeams.find(item => item.id === deal.buyerTeamId);
          const seller = allTeams.find(item => item.id === deal.sellerTeamId);
          if (!player) { rejectSettlement('player_not_found'); return; }
          if (deal.type !== 'renewal' && deal.type !== 'free_agent' && player.teamId !== deal.sellerTeamId) { rejectSettlement('player_ownership_changed'); return; }
          if (deal.type === 'renewal' && player.teamId !== deal.buyerTeamId) { rejectSettlement('player_ownership_changed'); return; }
          if (!buyer) { rejectSettlement('buyer_not_found'); return; }

          const terms = deal.terms;
          const installments = terms.fee?.installments ?? [];
          const fee = deal.type === 'loan'
            ? Number(terms.loan?.fee ?? 0)
            : Number(terms.fee?.upfront ?? 0) + installments.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
          const signingBonus = Number(terms.contract?.signingBonus ?? 0);
          const remainingWeeks = Math.max(0, Number(save.totalGameweeks ?? 38) - Number(save.currentGameweek ?? 1) + 1);
          const loanWages = deal.type === 'loan' ? Number(terms.contract?.wage ?? 0) * remainingWeeks * Number(terms.loan?.wageContributionPercentage ?? 100) / 100 : 0;
          const cost = deal.type === 'renewal' || deal.type === 'free_agent' ? signingBonus : fee + signingBonus + loanWages;
          if (Number(buyer.budget ?? 0) < cost) { rejectSettlement('insufficient_funds'); return; }

          const exchangePlayerId = terms.fee?.exchangePlayerId;
          const exchangePlayer = exchangePlayerId ? allPlayers.find(item => String(item.id) === String(exchangePlayerId)) : null;
          if (exchangePlayerId && (!exchangePlayer || exchangePlayer.teamId !== buyer.id || buyer.id === seller?.id)) { rejectSettlement('invalid_exchange_player'); return; }
          const buyerSquad = allPlayers.filter(item => item.teamId === buyer.id && !item.onLoan);
          const sellerSquad = allPlayers.filter(item => item.teamId === seller?.id && !item.onLoan);
          if (deal.type !== 'renewal' && buyerSquad.length + (exchangePlayer ? 0 : 1) > 30) { rejectSettlement('buyer_squad_full'); return; }
          if (seller && !['renewal','free_agent'].includes(deal.type) && sellerSquad.length - 1 + (exchangePlayer ? 1 : 0) < 11) { rejectSettlement('seller_squad_floor'); return; }
          if (seller && player.position === 'GK' && !sellerSquad.some(item => item.id !== player.id && item.position === 'GK') && exchangePlayer?.position !== 'GK') { rejectSettlement('seller_no_goalkeeper'); return; }

          const nextBuyer = { ...buyer, budget:Number(buyer.budget ?? 0) - cost };
          const changedTeams = new Map([[nextBuyer.id, nextBuyer]]);
          if (seller && seller.id !== buyer.id && fee > 0) changedTeams.set(seller.id, { ...seller, budget:Number(seller.budget ?? 0) + fee });
          for (const team of changedTeams.values()) teamsStore.put(team);

          const seasonYear = Number.parseInt(String(save.season ?? '').split('/')[0], 10) || 0;
          let nextPlayer;
          if (deal.type === 'renewal') {
            nextPlayer = { ...player, wage:terms.contract.wage, squadRole:terms.contract.squadRole, contractExpiry:seasonYear + terms.contract.duration, releaseClause:terms.contract.releaseClause || null };
          } else if (deal.type === 'loan') {
            nextPlayer = { ...player, teamId:buyer.id, onLoan:true, loanedFrom:deal.sellerTeamId, loanOriginalTeamId:deal.sellerTeamId, loanSeason:save.season, loanRecallable:Boolean(terms.loan?.recall), signedThisSeason:true };
          } else if (terms.fee?.loanBack && seller) {
            nextPlayer = { ...player, teamId:seller.id, wage:terms.contract.wage, squadRole:terms.contract.squadRole, contractExpiry:seasonYear + terms.contract.duration, releaseClause:terms.contract.releaseClause || null, signedThisSeason:true, onLoan:true, loanedFrom:buyer.id, loanOriginalTeamId:buyer.id, loanSeason:save.season, loanRecallable:false };
          } else {
            nextPlayer = { ...player, teamId:buyer.id, wage:terms.contract.wage, squadRole:terms.contract.squadRole, contractExpiry:seasonYear + terms.contract.duration, releaseClause:terms.contract.releaseClause || null, signedThisSeason:true, onLoan:false, loanedFrom:null, loanedTo:null };
          }
          playersStore.put(nextPlayer);
          if (exchangePlayer && seller) playersStore.put({ ...exchangePlayer, teamId:seller.id, signedThisSeason:true, contractExpiry:seasonYear + 3, onLoan:false, loanedFrom:null, loanedTo:null });

          const completedDeal = { ...deal, state:'completed', awaiting:null, stateOwner:'system', updatedWeekKey:market.lastTickKey ?? deal.updatedWeekKey, decisionLog:[...(deal.decisionLog ?? []), { eventKey:`${deal.idempotencyKey}:completed`, weekKey:market.lastTickKey ?? deal.updatedWeekKey, from:'agreed', to:'completed', actor:'system', reasonCode:'settled' }].slice(-24) };
          const activeDeals = market.activeDeals.map(item => item.id === deal.id ? completedDeal : item);
          const reservedCommitments = (market.reservedCommitments ?? []).filter(item => item.dealId !== deal.id);
          const nextSave = { ...save, transferMarket:{ ...market, activeDeals, reservedCommitments }, inboundOffers:(save.inboundOffers ?? []).filter(item => item.dealId !== deal.id), lastPlayedAt:new Date().toISOString() };
          saves.put(nextSave);
          const historyRow = { idempotencyKey:deal.idempotencyKey, dealId:deal.id, playerId:player.id, playerName:player.name, fromTeamId:deal.sellerTeamId, toTeamId:deal.buyerTeamId, fee, type:deal.type, terms, obligations:{ installments, loanWages, sellOnPercentage:terms.fee?.sellOnPercentage ?? 0, optionToBuy:terms.loan?.optionToBuy ?? 0, obligationToBuy:terms.loan?.obligationToBuy ?? 0 }, date:save.currentDate, season:save.season };
          historyStore.add(historyRow);
          result = { success:true, idempotent:false, deal:completedDeal, player:nextPlayer, history:historyRow };
        } catch (error) {
          fail(error);
        }
      };
    }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(failure ?? tx.error ?? new Error('TRANSFER_SETTLEMENT_FAILED'));
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('TRANSFER_SETTLEMENT_ABORTED'));
  });
}
export const getAllHonors = () => req2p(store('honors').getAll());
export const addHonor = h => req2p(store('honors','readwrite').add(h));
export const getAllSeasons = () => req2p(store('seasons').getAll());
export const addSeason = s => req2p(store('seasons','readwrite').add(s));
export const getAllManagers = () => req2p(store('managers').getAll());
export const getManager = id => req2p(store('managers').get(id));
export const putManager = m => req2p(store('managers','readwrite').put(m));
export const putManagersBulk = ms => bulkPut('managers', ms);

export async function resetForNewCareer() {
  await clearAndBulkPut('save', []);
  await clearAndBulkPut('teams', []);
  await clearAndBulkPut('players', []);
  await clearAndBulkPut('fixtures', []);
  await clearAndBulkPut('standings', []);
  await clearAndBulkPut('transfers', []);
  await clearAndBulkPut('managers', []);
}

async function _clearNamedDB(name) {
  const db = await _openNamedDB(name);
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAMES, 'readwrite');
      for (const storeName of STORE_NAMES) tx.objectStore(storeName).clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    try { db.close(); } catch {}
  }
}

function _deleteNamedDB(name) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = resolve;
    req.onerror = () => reject(req.error);
    // A CareerMenu refresh can still be finishing a read-only summary against
    // this inactive DB. `blocked` is therefore a wait state, not successful
    // deletion: that reader closes in its finally block and IndexedDB then
    // delivers onsuccess.
    req.onblocked = () => {};
  });
}

async function _resetNamedSlot(slotId) {
  if (slotId === LEGACY_SLOT_ID) {
    await _clearNamedDB(DB_NAME);
  } else {
    await _deleteNamedDB(careerSlotDbName(slotId));
  }
}

export async function deleteCareerSlot(slotId) {
  if (!SAFE_SLOT_ID.test(slotId)) throw new Error('Invalid career slot ID.');
  if (_db && _dbSlotId === slotId) {
    try { _db.close(); } catch {}
    _db = null;
    _dbSlotId = null;
  }
  // The legacy DB name is deliberately probed forever so pre-P0 browsers can
  // be discovered without a registry entry. Reset it in place; generated slot
  // DBs have no compatibility role and are physically deleted.
  await _resetNamedSlot(slotId);
  _unregisterSlot(slotId);

  if (getActiveSlotId() === slotId) {
    const next = _readRegistry().find(id => id !== slotId) ?? LEGACY_SLOT_ID;
    _storage()?.setItem(ACTIVE_SLOT_KEY, next);
  }
}

// Compatibility: "Reset Game" now deletes the active career only. Other P0
// slots are intentionally isolated and must never be destroyed by this path.
export function deleteDB() {
  return deleteCareerSlot(getActiveSlotId());
}

/**
 * Stable metadata shared by local slot cards, .pitch envelopes and cloud rows.
 * UI-only state such as `isActive` is deliberately added by callers instead
 * of becoming part of the persisted metadata contract.
 */
export function buildCareerMetadata(slotId, save, team = null, standing = null) {
  return {
    slotId,
    managerName:save?.managerName ?? 'The Manager',
    teamId:save?.userTeamId ?? null,
    clubName:team?.name ?? save?.userTeamId ?? 'Unknown Club',
    clubCrest:team?.crest ?? '⚽',
    clubColor:team?.color ?? team?.primaryColor ?? '#16a34a',
    season:save?.season ?? '—',
    league:save?.userLeague ?? team?.league ?? '—',
    leaguePosition:Number.isFinite(standing?.position) ? standing.position : null,
    gameweek:save?.currentGameweek ?? 1,
    lastPlayedAt:save?.lastPlayedAt ?? null,
    saveSchemaVersion:save?.saveSchemaVersion ?? 1,
  };
}

async function _readSlotSummary(slotId) {
  const isActive = slotId === getActiveSlotId();
  const db = isActive ? await openDB() : await _openNamedDB(careerSlotDbName(slotId));
  try {
    const save = await req2p(db.transaction('save', 'readonly').objectStore('save').get('active'));
    if (!save) return null;
    const team = save.userTeamId
      ? await req2p(db.transaction('teams', 'readonly').objectStore('teams').get(save.userTeamId))
      : null;
    const standing = save.userTeamId
      ? await req2p(db.transaction('standings', 'readonly').objectStore('standings').get(save.userTeamId))
      : null;
    return { ...buildCareerMetadata(slotId, save, team, standing), isActive };
  } finally {
    if (!isActive) {
      try { db.close(); } catch {}
    }
  }
}

export async function getCareerSlotSummaries() {
  const summaries = [];
  for (const slotId of getCareerSlotIds()) {
    try {
      const summary = await _readSlotSummary(slotId);
      if (summary) summaries.push(summary);
    } catch {}
  }
  return summaries.sort((a, b) => {
    const ad = a.lastPlayedAt ? Date.parse(a.lastPlayedAt) : 0;
    const bd = b.lastPlayedAt ? Date.parse(b.lastPlayedAt) : 0;
    return bd - ad || a.clubName.localeCompare(b.clubName);
  });
}

// ─── Versioned .pitch / cloud save envelope ───────────────────
export const _PITCH_SALT = 'pitch_fc_v3_2025';
export const _PITCH_MAGIC = 'PITCH_SAVE_V2';
export const _PITCH_LEGACY_MAGIC = 'PITCH_SAVE_V1';

export function _fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export const SAVE_MIGRATORS = Object.freeze({
  1(data, targetSlotId) {
    const snapshot = data.snapshot ?? {};
    return {
      ...data,
      meta:{
        ...(data.meta ?? {}),
        version:_PITCH_MAGIC,
        schemaVersion:SAVE_SCHEMA_VERSION,
        migratedFrom:_PITCH_LEGACY_MAGIC,
        slotId:targetSlotId,
      },
      snapshot:{
        ...snapshot,
        save:(snapshot.save ?? []).map(row => ({
          ...row,
          slotId:targetSlotId,
          saveSchemaVersion:SAVE_SCHEMA_VERSION,
        })),
      },
    };
  },
});

function _saveVersionFromMagic(magic) {
  if (magic === _PITCH_LEGACY_MAGIC) return 1;
  if (magic === _PITCH_MAGIC) return SAVE_SCHEMA_VERSION;
  return null;
}

export function migrateSavePayload(data, targetSlotId = getActiveSlotId()) {
  let version = Number(data?.meta?.schemaVersion) || _saveVersionFromMagic(data?.meta?.version);
  if (!version) throw new Error('Unsupported save version.');
  let migrated = data;
  while (version < SAVE_SCHEMA_VERSION) {
    const migrator = SAVE_MIGRATORS[version];
    if (!migrator) throw new Error(`No migration path for save version ${version}.`);
    migrated = migrator(migrated, targetSlotId);
    version += 1;
  }
  if (version > SAVE_SCHEMA_VERSION) throw new Error('Save was created by a newer version of PITCH.');

  const snapshot = migrated.snapshot ?? {};
  return {
    ...migrated,
    meta:{
      ...(migrated.meta ?? {}),
      version:_PITCH_MAGIC,
      schemaVersion:SAVE_SCHEMA_VERSION,
      slotId:targetSlotId,
    },
    snapshot:{
      ...snapshot,
      save:(snapshot.save ?? []).map(row => ({
        ...row,
        slotId:targetSlotId,
        saveSchemaVersion:SAVE_SCHEMA_VERSION,
      })),
    },
  };
}

async function _snapshotSlot(slotId) {
  const isActive = slotId === getActiveSlotId();
  const db = isActive ? await openDB() : await _openNamedDB(careerSlotDbName(slotId));
  try {
    const snapshot = {};
    for (const name of STORE_NAMES) {
      snapshot[name] = await req2p(db.transaction(name, 'readonly').objectStore(name).getAll());
    }
    return snapshot;
  } finally {
    if (!isActive) {
      try { db.close(); } catch {}
    }
  }
}

export async function buildSaveEnvelope(slotId = getActiveSlotId()) {
  const snapshot = await _snapshotSlot(slotId);
  const rawSave = snapshot.save?.find(s => s.id === 'active');
  if (rawSave) {
    snapshot.save = snapshot.save.map(row => row.id === 'active'
      ? { ...row, slotId, saveSchemaVersion:SAVE_SCHEMA_VERSION }
      : row);
  }
  const saveData = snapshot.save?.find(s => s.id === 'active');
  const teamData = saveData?.userTeamId
    ? snapshot.teams?.find(team => team.id === saveData.userTeamId) ?? null
    : null;
  const standingData = saveData?.userTeamId
    ? snapshot.standings?.find(row => row.teamId === saveData.userTeamId) ?? null
    : null;
  const meta = {
    version:_PITCH_MAGIC,
    schemaVersion:SAVE_SCHEMA_VERSION,
    exportedAt:new Date().toISOString(),
    ...buildCareerMetadata(slotId, saveData, teamData, standingData),
  };
  const payload = JSON.stringify({ meta, snapshot });
  const hash = _fnv1a(_PITCH_SALT + payload);
  const envelope = JSON.stringify({ h:hash, d:payload });
  const saveCode = btoa(unescape(encodeURIComponent(envelope)));
  return { saveCode, meta, envelope };
}

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

export async function buildCloudSaveBlob(slotId = getActiveSlotId()) {
  const { envelope, meta } = await buildSaveEnvelope(slotId);
  const compressed = await _gzipString(envelope);
  return { blob:_bytesToBase64(compressed), meta, slotId };
}

export async function restoreFromCloudBlob(blob, targetSlotId = getActiveSlotId()) {
  let envelopeStr;
  try {
    envelopeStr = await _gunzipToString(_base64ToBytes(blob));
  } catch {
    envelopeStr = decodeURIComponent(escape(atob(blob.trim())));
  }
  return _restoreFromEnvelope(envelopeStr, targetSlotId);
}

export async function exportSaveFile(slotId = getActiveSlotId()) {
  const { saveCode, meta } = await buildSaveEnvelope(slotId);
  const teamName = (meta.teamId ?? 'team').replace(/[^a-zA-Z0-9_]/g, '_');
  const filename = `PITCH_${teamName}_S${meta.season}_GW${meta.gameweek}.pitch`;
  let fileDownloaded = false;
  try {
    const blob = new Blob([saveCode], { type:'text/plain' });
    try {
      const file = new File([blob], filename, { type:'text/plain' });
      if (navigator.canShare && navigator.canShare({ files:[file] })) {
        await navigator.share({ files:[file], title:'PITCH Save', text:filename });
        fileDownloaded = true;
      }
    } catch (e) {
      if (e.name === 'AbortError') fileDownloaded = true;
    }
    if (!fileDownloaded) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 2000);
    }
  } catch {}
  return { filename, size:saveCode.length, meta, saveCode, slotId };
}

export async function importSaveFromCode(code, targetSlotId = getActiveSlotId()) {
  let envelopeStr;
  try {
    envelopeStr = decodeURIComponent(escape(atob(code.trim())));
  } catch {
    throw new Error('Invalid save code — could not decode.');
  }
  return _restoreFromEnvelope(envelopeStr, targetSlotId);
}

export async function importSaveFile(file, targetSlotId = getActiveSlotId()) {
  const text = await file.text();
  let envelopeStr;
  try {
    envelopeStr = decodeURIComponent(escape(atob(text.trim())));
  } catch {
    try {
      const buf = await file.arrayBuffer();
      if (typeof DecompressionStream === 'undefined') throw new Error('Cannot decompress');
      const ds = new DecompressionStream('gzip');
      const writer = ds.writable.getWriter();
      writer.write(new Uint8Array(buf));
      writer.close();
      const decompressed = await new Response(ds.readable).arrayBuffer();
      envelopeStr = new TextDecoder().decode(decompressed);
    } catch {
      throw new Error('Invalid save file — could not decode.');
    }
  }
  return _restoreFromEnvelope(envelopeStr, targetSlotId);
}

export function parseAndMigrateEnvelope(envelopeStr, targetSlotId = getActiveSlotId()) {
  let envelope;
  try { envelope = JSON.parse(envelopeStr); }
  catch { throw new Error('Invalid save data — corrupted format.'); }
  if (!envelope.h || !envelope.d) throw new Error('Invalid save data — missing integrity check.');
  const expectedHash = _fnv1a(_PITCH_SALT + envelope.d);
  if (envelope.h !== expectedHash) throw new Error('Save data integrity check failed — data may have been modified.');

  let data;
  try { data = JSON.parse(envelope.d); }
  catch { throw new Error('Invalid save data — corrupted payload.'); }
  const migrated = migrateSavePayload(data, targetSlotId);
  const snapshot = migrated.snapshot;
  if (!snapshot || !snapshot.save || !snapshot.teams || !snapshot.players) {
    throw new Error('Invalid save data — missing game data.');
  }
  return migrated;
}

export async function _restoreFromEnvelope(envelopeStr, targetSlotId = getActiveSlotId()) {
  if (!SAFE_SLOT_ID.test(targetSlotId)) throw new Error('Invalid career slot ID.');
  const data = parseAndMigrateEnvelope(envelopeStr, targetSlotId);
  const snapshot = data.snapshot;

  if (_db && _dbSlotId === targetSlotId) {
    try { _db.close(); } catch {}
    _db = null;
    _dbSlotId = null;
  }
  await _resetNamedSlot(targetSlotId);
  _registerSlot(targetSlotId);
  await activateCareerSlot(targetSlotId);
  const db = await openDB();

  for (const name of STORE_NAMES) {
    const items = snapshot[name];
    if (items?.length) await _bulkPutToDB(db, name, items);
  }
  return data.meta;
}
