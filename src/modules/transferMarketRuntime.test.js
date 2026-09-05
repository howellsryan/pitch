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

  it('clears a departing player from the manager\u2019s named bench, and only from their own', () => {
    // `selectBench` honours a named bench exactly, so an id it cannot resolve
    // is not inert — the match is played a substitute short. The lineup
    // self-heals through `selectEleven`; the bench has to be cleared here.
    const source = readFileSync(new URL('./db.js', import.meta.url), 'utf8');
    const start = source.indexOf('export function settleTransferMarketDealAtomic');
    const end = source.indexOf('export const getAllHonors', start);
    const settlement = source.slice(start, end);
    // Decided on where each player ends up, so a loan out and an exchange
    // player leaving are both covered and a loan-back player is not evicted.
    expect(settlement).toContain('const departedIds = [nextPlayer,');
    expect(settlement).toContain("String(row.teamId) !== managedTeamId");
    expect(settlement).toContain('save.bench.filter(id => !departedIds.includes(String(id)))');
    expect(settlement).toContain('bench:benchAfter');
  });

  it('P7 WP2: settles budget through the finance ledger, never raw budget arithmetic that could drift from finance.cash', () => {
    const source = readFileSync(new URL('./db.js', import.meta.url), 'utf8');
    const start = source.indexOf('export function settleTransferMarketDealAtomic');
    const end = source.indexOf('export const getAllHonors', start);
    const settlement = source.slice(start, end);
    expect(settlement).toContain("applyLedgerMovement(buyer, { category:'transfer_fee_out'");
    expect(settlement).toContain("applyLedgerMovement(seller, { category:'transfer_fee_in'");
    expect(settlement).not.toContain('budget:Number(buyer.budget');
    expect(settlement).not.toContain('budget:Number(seller.budget');
  });

  it('P7 WP3: pays only the upfront portion now and schedules each installment as a due-dated obligation instead of paying the full deal value immediately', () => {
    const source = readFileSync(new URL('./db.js', import.meta.url), 'utf8');
    const start = source.indexOf('export function settleTransferMarketDealAtomic');
    const end = source.indexOf('export const getAllHonors', start);
    const settlement = source.slice(start, end);
    expect(settlement).toContain('const upfrontFee = deal.type');
    expect(settlement).toContain('const upfrontCost = deal.type');
    // Affordability must reserve the buyer's own already-scheduled unpaid
    // installments (availableFunds), not just compare raw budget — otherwise
    // a club could serially agree to more installment debt than it can service.
    expect(settlement).toContain('availableFunds(buyer, market, deal.id) < upfrontCost');
    expect(settlement).not.toContain('Number(buyer.budget ?? 0) < upfrontCost');
    expect(settlement).toContain("scheduleObligation(nextBuyer, { id:`${deal.id}:installment:${installment.id}`, category:'transfer_fee_out'");
    expect(settlement).toContain("scheduleObligation(sellerSoFar, { id:`${deal.id}:installment:${installment.id}`, category:'transfer_fee_in'");
    expect(settlement).toContain('dueSeason:installment.dueSeason, dueGameweek:installment.dueGameweek');
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
