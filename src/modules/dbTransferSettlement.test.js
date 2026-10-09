import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClubFinance } from './clubFinance.js';
import { openDB, settleTransferMarketDealAtomic } from './db.js';
import { normalizePlayerStatus } from './playerStatus.js';
import { decodeStoredPlayer } from './playerStorageCodec.js';

let database = null;
afterEach(() => { database?.onversionchange?.(); database = null; vi.unstubAllGlobals(); });

async function setup(player, type = 'free_agent') {
  const deal = { id:'deal', idempotencyKey:'deal-once', state:'agreed', termsValid:true, type,
    playerId:player.id, buyerTeamId:'buyer', sellerTeamId:type === 'renewal' ? 'buyer' : 'free_agents',
    terms:{ contract:{ wage:1000, duration:3, squadRole:'rotation', signingBonus:100 }, fee:{ upfront:0, installments:[] } } };
  const rows = {
    save:new Map([['active', { id:'active', season:'2026/27', currentGameweek:4, currentDate:'2026-09-01', userTeamId:'buyer', transferMarket:{ activeDeals:[deal], reservedCommitments:[] } }]]),
    teams:new Map([['buyer', { id:'buyer', budget:10000, finance:createClubFinance(10000) }]]),
    players:new Map([[player.id, globalThis.structuredClone(player)]]), transfers:new Map(),
  };
  database = { close() {}, transaction(names) {
    const working = Object.fromEntries(names.map(name => [name, new Map(rows[name])]));
    let pending = 0;
    let ended = false;
    const tx = { abort() { ended = true; globalThis.queueMicrotask(() => tx.onabort?.()); }, objectStore(name) {
      const request = action => {
        const req = {};
        pending++;
        globalThis.queueMicrotask(() => {
          if (ended) return;
          pending--;
          req.result = action();
          req.onsuccess?.();
          globalThis.queueMicrotask(() => {
            if (ended || pending) return;
            ended = true;
            for (const table of names) rows[table] = working[table];
            tx.oncomplete?.();
          });
        });
        return req;
      };
      return {
        get:key => request(() => globalThis.structuredClone(working[name].get(key))),
        getAll:() => request(() => globalThis.structuredClone([...working[name].values()])),
        put:row => request(() => working[name].set(row.id, globalThis.structuredClone(row))),
        add:row => request(() => working[name].set(working[name].size + 1, globalThis.structuredClone(row))),
      };
    } };
    return tx;
  } };
  vi.stubGlobal('indexedDB', { open() {
    const req = {};
    globalThis.queueMicrotask(() => req.onsuccess?.({ target:{ result:database } }));
    return req;
  } });
  await openDB();
  return rows;
}

describe('transfer settlement ownership boundaries', () => {
  it('rejects an agreed free-agent deal when another club has already signed the player', async () => {
    const rows = await setup(normalizePlayerStatus({ id:'p', teamId:'another-club', position:'ST' }));
    const result = await settleTransferMarketDealAtomic('deal');
    expect(result).toMatchObject({ success:false, error:'player_ownership_changed' });
    expect(rows.teams.get('buyer').finance.cash).toBe(10000);
    expect(rows.players.get('p').teamId).toBe('another-club');
    expect(rows.transfers.size).toBe(0);
  });

  it('signs a genuine free agent at zero transfer fee exactly once, charging only the agreed bonus', async () => {
    const rows = await setup(normalizePlayerStatus({ id:'p', teamId:'free_agents', position:'ST', inSquad:false }));
    expect((await settleTransferMarketDealAtomic('deal')).success).toBe(true);
    expect(rows.players.get('p').__pitchPlayerStorage).toBe(2);
    expect(decodeStoredPlayer(rows.players.get('p'))).toMatchObject({ teamId:'buyer', inSquad:true, contractTeamId:'buyer' });
    expect(rows.teams.get('buyer').finance.cash).toBe(9900);
    expect(rows.transfers.size).toBe(1);
    expect((await settleTransferMarketDealAtomic('deal')).idempotent).toBe(true);
    expect(rows.teams.get('buyer').finance.cash).toBe(9900);
  });

  it('rejects a borrowed-player renewal without changing its owner or charging a signing bonus', async () => {
    const rows = await setup(normalizePlayerStatus({ id:'p', teamId:'buyer', position:'ST', onLoan:true, loanedFrom:'parent', loanOriginalTeamId:'parent' }), 'renewal');
    const result = await settleTransferMarketDealAtomic('deal');
    expect(result).toMatchObject({ success:false, error:'player_on_loan' });
    expect(rows.players.get('p')).toMatchObject({ playerStatus:'loan', contractTeamId:'parent', registeredTeamId:'buyer' });
    expect(rows.teams.get('buyer').finance.cash).toBe(10000);
    expect(rows.transfers.size).toBe(0);
  });

  it('cannot trade a borrowed player as an exchange asset owned by the buyer', async () => {
    const rows = await setup(normalizePlayerStatus({ id:'p', teamId:'seller', position:'ST' }), 'transfer');
    rows.teams.set('seller', { id:'seller', budget:10000, finance:createClubFinance(10000) });
    for (let index = 0; index < 10; index++) {
      const squadPlayer = normalizePlayerStatus({ id:`seller-${index}`, teamId:'seller', position:index === 0 ? 'GK' : 'CM' });
      rows.players.set(squadPlayer.id, squadPlayer);
    }
    rows.players.set('borrowed', normalizePlayerStatus({ id:'borrowed', teamId:'buyer', position:'ST', onLoan:true, loanedFrom:'parent', loanOriginalTeamId:'parent' }));
    const agreed = rows.save.get('active').transferMarket.activeDeals[0];
    agreed.sellerTeamId = 'seller';
    agreed.terms.fee.exchangePlayerId = 'borrowed';
    const result = await settleTransferMarketDealAtomic('deal');
    expect(result).toMatchObject({ success:false, error:'invalid_exchange_player' });
    expect(rows.players.get('borrowed')).toMatchObject({ playerStatus:'loan', contractTeamId:'parent', registeredTeamId:'buyer' });
    expect(rows.teams.get('buyer').finance.cash).toBe(10000);
    expect(rows.transfers.size).toBe(0);
  });
});
