import { describe, expect, it } from 'vitest';
import { contractTerminationQuote, releasePlayerToFreeAgency, remainingContractWeeks } from './contracts.js';

describe('managed contract termination', () => {
  const save = { season:'2025/26', currentGameweek:10, worldTotalGameweeks:46 };

  it('pays the remaining current season plus every future contracted season', () => {
    const player = { contractExpiry:2028, wage:25_000 };
    expect(remainingContractWeeks(player, save)).toBe(37 + 46 + 46);
    expect(contractTerminationQuote(player, save)).toEqual({
      weeks:129,
      weeklyWage:25_000,
      payout:3_225_000,
    });
  });

  it('owes nothing once the contract has reached its expiry year', () => {
    expect(remainingContractWeeks({ contractExpiry:2025, wage:10_000 }, save)).toBe(0);
  });

  it('keeps one canonical player row while clearing club-only contract state', () => {
    const released = releasePlayerToFreeAgency({
      id:'p1', name:'Player One', teamId:'club_a', contractExpiry:2027,
      signedThisSeason:true, transferListed:true, inSquad:true,
      squadRole:'important', squadRoleSource:'manager', squadRoleTeamId:'club_a',
      playingTimeAgreement:{ status:'settling' },
    });

    expect(released.id).toBe('p1');
    expect(released.teamId).toBe('free_agents');
    expect(released.contractExpiry).toBeNull();
    expect(released.signedThisSeason).toBe(false);
    expect(released.transferListed).toBe(false);
    expect(released.inSquad).toBe(false);
    expect(released.squadRole).toBeNull();
    expect(released.playingTimeAgreement).toBeNull();
  });
});
