import { describe, expect, it } from 'vitest';
import {
  STARTING_FREE_AGENT_NAMES,
  isVerifiedStartingFreeAgent,
  normalizeFreeAgentName,
  prepareStartingFreeAgent,
} from './startingFreeAgents.js';

describe('starting free agents', () => {
  it('normalizes accents and recognizes every generated free-agent name', () => {
    expect(normalizeFreeAgentName('  Nathan Aké ')).toBe('nathan ake');
    expect(Array.isArray(STARTING_FREE_AGENT_NAMES)).toBe(true);
    for (const name of STARTING_FREE_AGENT_NAMES) {
      expect(normalizeFreeAgentName(name)).not.toBe('');
      expect(isVerifiedStartingFreeAgent(name), name).toBe(true);
    }
  });

  it('does not classify ordinary contracted players', () => {
    expect(isVerifiedStartingFreeAgent('Erling Haaland')).toBe(false);
  });

  it('moves the existing canonical row into the shared pool', () => {
    const player = {
      id:'test-player', name:'Test Player', teamId:'test-club', contractExpiry:2028,
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
