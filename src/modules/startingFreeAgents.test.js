import { describe, expect, it } from 'vitest';
import { isVerifiedStartingFreeAgent, normalizeFreeAgentName, prepareStartingFreeAgent } from './startingFreeAgents.js';

describe('starting free agents', () => {
  it('matches verified names without losing accent variants', () => {
    expect(normalizeFreeAgentName('  Nathan Aké ')).toBe('nathan ake');
    expect(isVerifiedStartingFreeAgent('Nathan Ake')).toBe(true);
    expect(isVerifiedStartingFreeAgent('Dušan Vlahović')).toBe(true);
  });

  it('does not classify ordinary contracted players', () => {
    expect(isVerifiedStartingFreeAgent('Erling Haaland')).toBe(false);
  });

  it('moves the existing canonical row into the shared pool', () => {
    const player = {
      id:'ake', name:'Nathan Aké', teamId:'man_city', contractExpiry:2028,
      transferListed:true, inSquad:true, signedThisSeason:true, squadRole:'important',
    };
    const prepared = prepareStartingFreeAgent(player);
    expect(prepared.id).toBe(player.id);
    expect(prepared.teamId).toBe('free_agents');
    expect(prepared.contractExpiry).toBeNull();
    expect(prepared.inSquad).toBe(false);
    expect(prepared.transferListed).toBe(false);
    expect(prepared.signedThisSeason).toBe(false);
  });
});
