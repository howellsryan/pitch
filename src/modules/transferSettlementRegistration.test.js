import { describe, expect, it } from 'vitest';
import { buildSettledMarketPlayer } from './transferMarket.js';
import { assignDefaultSquadRoles } from './playerModel.js';
import { normalizePlayerStatus } from './playerStatus.js';

const player = normalizePlayerStatus({ id:'p', teamId:'seller', position:'ST', age:25, attack:90, midfield:70, defence:30, goalkeeping:10, wage:1000, squadRole:'crucial', squadRoleSource:'manager', squadRoleTeamId:'seller', playingTimeAgreement:{ teamId:'seller', status:'broken' } });
const save = { userTeamId:'buyer', season:'2026/27', currentGameweek:4 };
const deal = { id:'d', type:'transfer', buyerTeamId:'buyer', sellerTeamId:'seller', terms:{ contract:{ wage:2000, squadRole:'squad', duration:3 }, fee:{} } };

describe('settled transfer registrations and agreed squad roles', () => {
  it('retains a negotiated role through the next squad normalization', () => {
    const settled = buildSettledMarketPlayer(player, deal, save);
    const refreshed = assignDefaultSquadRoles([settled], { managedTeamId:'buyer', currentYear:2026 })[0];
    expect(refreshed.squadRole).toBe('squad');
    expect(refreshed.squadRoleTeamId).toBe('buyer');
    expect(refreshed.playingTimeAgreement.teamId).toBe('buyer');
    expect(refreshed.playingTimeAgreement.status).not.toBe('broken');
    expect(normalizePlayerStatus(settled)).toMatchObject({ teamId:'buyer', contractTeamId:'buyer', registeredTeamId:'buyer', playerStatus:'first_team', contractExpiry:2029, wage:2000 });
  });

  it('clears former managed playing-time promises when an AI club buys', () => {
    const settled = buildSettledMarketPlayer(player, deal, { ...save, userTeamId:'seller' });
    expect(settled.playingTimeAgreement).toBeNull();
    expect(settled.squadRoleTeamId).toBe('buyer');
  });

  it('starts a fresh agreed promise when a contract is renewed', () => {
    const renewed = buildSettledMarketPlayer(player, { ...deal, type:'renewal', buyerTeamId:'seller' }, { ...save, userTeamId:'seller' });
    expect(renewed.teamId).toBe('seller');
    expect(renewed.squadRole).toBe('squad');
    expect(renewed.playingTimeAgreement.status).not.toBe('broken');
  });

  it('records a loan agreement with its real owner, destination and terms', () => {
    const loan = buildSettledMarketPlayer(player, { ...deal, type:'loan', terms:{ ...deal.terms, loan:{ recall:true, wageContributionPercentage:50 } } }, save);
    expect(normalizePlayerStatus(loan)).toMatchObject({ playerStatus:'loan', contractTeamId:'seller', registeredTeamId:'buyer', onLoan:true });
    expect(loan.activeLoanAgreement).toMatchObject({ parentTeamId:'seller', loanTeamId:'buyer', recallAllowed:true, wageContributionPercentage:50 });
  });

  it('registers a signed free agent as an eligible senior rather than retaining the free-agent exclusion', () => {
    const freeAgent = normalizePlayerStatus({ ...player, teamId:'free_agents', onLoan:false, inSquad:false });
    const signed = buildSettledMarketPlayer(freeAgent, { ...deal, type:'free_agent', sellerTeamId:'free_agents' }, save);
    expect(normalizePlayerStatus(signed)).toMatchObject({ teamId:'buyer', playerStatus:'first_team', inSquad:true });
  });

  it('does not turn a borrowed player into a permanent signing through renewal', () => {
    const borrowed = buildSettledMarketPlayer(player, { ...deal, type:'loan' }, save);
    expect(() => buildSettledMarketPlayer(borrowed, { ...deal, type:'renewal', sellerTeamId:'buyer' }, save)).toThrow('PLAYER_ON_LOAN');
    expect(normalizePlayerStatus(borrowed)).toMatchObject({ playerStatus:'loan', contractTeamId:'seller', registeredTeamId:'buyer' });
  });
});
