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
        getAll:() => {
          if (name === 'players') throw new Error('Settlement must not read unrelated world players');
          return request(() => globalThis.structuredClone([...working[name].values()]));
        },
        index:indexName => ({ getAll:teamId => {
          if (name !== 'players' || indexName !== 'by_team') throw new Error('Unexpected settlement index');
          return request(() => globalThis.structuredClone([...working.players.values()].filter(row => row.teamId === teamId)));
        } }),
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
  it('renews a club’s only goalkeeper without treating him as a departure', async () => {
    const rows = await setup(normalizePlayerStatus({ id:'keeper', teamId:'buyer', position:'GK' }), 'renewal');
    expect((await settleTransferMarketDealAtomic('deal')).success).toBe(true);
    expect(decodeStoredPlayer(rows.players.get('keeper'))).toMatchObject({ teamId:'buyer', contractTeamId:'buyer', position:'GK' });
  });
  it('keeps numeric legacy player IDs reachable from string deal references', async () => {
    const rows = await setup(normalizePlayerStatus({ id:7, teamId:'free_agents', position:'ST' }));
    rows.save.get('active').transferMarket.activeDeals[0].playerId = '7';
    expect((await settleTransferMarketDealAtomic('deal')).success).toBe(true);
    expect(decodeStoredPlayer(rows.players.get(7)).id).toBe(7);
  });
  it('rejects a departure that leaves the seller without its only goalkeeper', async () => {
    const rows = await setup(normalizePlayerStatus({ id:'keeper', teamId:'seller', position:'GK' }), 'transfer');
    rows.teams.set('seller', { id:'seller', budget:10000, finance:createClubFinance(10000) });
    rows.save.get('active').transferMarket.activeDeals[0].sellerTeamId = 'seller';
    for (let index=0; index<11; index++) rows.players.set(`outfield-${index}`, normalizePlayerStatus({ id:`outfield-${index}`, teamId:'seller', position:'CM' }));
    expect(await settleTransferMarketDealAtomic('deal')).toMatchObject({ success:false, error:'seller_no_goalkeeper' });
    expect(rows.teams.get('buyer').finance.cash).toBe(10000);
    expect(rows.players.get('keeper').teamId).toBe('seller');
  });
  it('allows a loan-back that keeps the seller’s existing eleven and keeper registered', async () => {
    const rows = await setup(normalizePlayerStatus({ id:'keeper', teamId:'seller', position:'GK' }), 'transfer');
    rows.teams.set('seller', { id:'seller', budget:10000, finance:createClubFinance(10000) });
    const deal = rows.save.get('active').transferMarket.activeDeals[0];
    deal.sellerTeamId = 'seller';deal.terms.fee.loanBack = true;
    for (let index=0; index<10; index++) rows.players.set(`outfield-${index}`, normalizePlayerStatus({ id:`outfield-${index}`, teamId:'seller', position:'CM' }));
    expect((await settleTransferMarketDealAtomic('deal')).success).toBe(true);
    expect(decodeStoredPlayer(rows.players.get('keeper'))).toMatchObject({ playerStatus:'loan', contractTeamId:'buyer', registeredTeamId:'seller', teamId:'seller' });
  });
});
