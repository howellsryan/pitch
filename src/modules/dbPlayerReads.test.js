import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPlayersByTeams, openDB } from './db.js';

let activeDb;
afterEach(() => { activeDb?.onversionchange?.(); activeDb = null; vi.unstubAllGlobals(); });

async function setup(players, failTeam = null) {
  const transactions = [], queried = [];
  activeDb = { close() {}, transaction(name, mode) {
    transactions.push({ name, mode });
    return { objectStore:() => ({ index:() => ({ getAll(teamId) {
      queried.push(teamId);
      const request = {};
      queueMicrotask(() => {
        if (teamId === failTeam) { request.error = new Error('read failed'); request.onerror?.(); }
        else { request.result = structuredClone(players.filter(player => player.teamId === teamId).sort((a,b) => a.id.localeCompare(b.id))); request.onsuccess?.(); }
      });
      return request;
    } }) }) };
  } };
  vi.stubGlobal('indexedDB', { open() { const request = {}; queueMicrotask(() => request.onsuccess?.({ target:{ result:activeDb } })); return request; } });
  await openDB();
  return { transactions, queried };
}

describe('indexed club player snapshots', () => {
  it('preserves each club’s primary-key order in one snapshot without duplicate or unrelated players', async () => {
    const { transactions, queried } = await setup([
      { id:'z', teamId:'home' }, { id:'b', teamId:'away' }, { id:'a', teamId:'home' },
      { id:'free', teamId:'free_agents' }, { id:'other', teamId:'other' },
    ]);
    expect(await getPlayersByTeams(['home','away','home'])).toEqual([
      { id:'a', teamId:'home' }, { id:'z', teamId:'home' }, { id:'b', teamId:'away' },
    ]);
    expect(queried).toEqual(['home','away']);
    expect(transactions).toEqual([{ name:'players', mode:'readonly' }]);
  });

  it('does not open a transaction for an empty request', async () => {
    const { transactions } = await setup([]);
    expect(await getPlayersByTeams([])).toEqual([]);
    expect(transactions).toEqual([]);
  });

  it('rejects an incomplete snapshot when any requested club read fails', async () => {
    await setup([{ id:'a', teamId:'home' }], 'away');
    await expect(getPlayersByTeams(['home','away'])).rejects.toThrow('read failed');
  });
});
