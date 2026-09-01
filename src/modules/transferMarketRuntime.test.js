import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('P4 transfer-market runtime integration', () => {
  it('settles against all authoritative stores in one readwrite transaction', () => {
    const source = readFileSync(new URL('./db.js', import.meta.url), 'utf8');
    const start = source.indexOf('export function settleTransferMarketDealAtomic');
    const end = source.indexOf('export const getAllHonors', start);
    const settlement = source.slice(start, end);
    expect(settlement).toContain("transaction(['save', 'teams', 'players', 'transfers'], 'readwrite')");
    expect(settlement).toContain('idempotencyKey');
    expect(settlement).toContain("deal.state !== 'agreed'");
    expect(settlement).toContain('player_ownership_changed');
    expect(settlement).toContain('historyStore.add');
  });

  it('advances the persisted market once from the shared world-week closeout', () => {
    const source = readFileSync(new URL('./gameweek.js', import.meta.url), 'utf8');
    const start = source.indexOf('async function runEndOfWorldGameweek');
    const end = source.indexOf('export async function advanceOneFixture', start);
    const closeout = source.slice(start, end);
    expect(closeout.match(/advanceTransferMarketWeek/g)).toHaveLength(1);
    expect(closeout).not.toContain('simulateAITransfers');
    expect(closeout).not.toContain('simulateAILoans');
    expect(closeout).not.toContain('generateAIOffers');
  });

  it('projects transfer UI from persisted deals instead of the legacy offers modal', () => {
    const source = readFileSync(new URL('../lib/ui/TransfersScreen.svelte', import.meta.url), 'utf8');
    expect(source).toContain("tab === 'deals'");
    expect(source).toContain('save?.transferMarket?.activeDeals');
    expect(source).toContain('createUserMarketDeal');
    expect(source).not.toContain('showOffersModal');
  });
});
