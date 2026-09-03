import { describe, expect, it } from 'vitest';
import {
  ensureOpenRegistrationSpell,
  isAcademyPlayer,
  isOwnedByTeam,
  isSeniorEligiblePlayer,
  normalizePlayerStatus,
  playerStatusNeedsNormalization,
  transitionPlayerStatus,
} from './playerStatus.js';

function player(overrides = {}) {
  return {
    id:'p1', name:'Prospect', position:'CM', teamId:'parent', age:18,
    appearances:3, starts:1, minutes:120, goals:0, assists:1,
    inSquad:true, onLoan:false, isYouth:false,
    ...overrides,
  };
}

describe('P9 canonical player lifecycle', () => {
  it('migrates a legacy academy row without changing its ID or owning team index', () => {
    const legacy = player({ isYouth:true, youthTeamId:'parent', teamId:null, inSquad:false });
    const migrated = normalizePlayerStatus(legacy);
    expect(migrated.id).toBe(legacy.id);
    expect(migrated.playerStatus).toBe('academy');
    expect(migrated.contractTeamId).toBe('parent');
    expect(migrated.registeredTeamId).toBe('parent');
    expect(migrated.teamId).toBe('parent');
    expect(migrated.inSquad).toBe(false);
    expect(isAcademyPlayer(migrated, 'parent')).toBe(true);
    expect(isSeniorEligiblePlayer(migrated, 'parent')).toBe(false);
    expect(playerStatusNeedsNormalization(legacy)).toBe(true);
  });

  it('projects legacy loan flags into explicit ownership, registration and agreement state', () => {
    const legacy = player({
      teamId:'loan_club', onLoan:true, loanedFrom:'parent', loanOriginalTeamId:'parent',
      loanSeason:'2025/26', loanRecallable:true, squadRole:'rotation',
    });
    const migrated = normalizePlayerStatus(legacy);
    expect(migrated.playerStatus).toBe('loan');
    expect(migrated.contractTeamId).toBe('parent');
    expect(migrated.registeredTeamId).toBe('loan_club');
    expect(migrated.activeAgreementId).toContain('legacy-loan:p1:2025/26');
    expect(migrated.activeLoanAgreement.recallAllowed).toBe(true);
    expect(isOwnedByTeam(migrated, 'parent')).toBe(true);
    expect(isSeniorEligiblePlayer(migrated, 'loan_club')).toBe(true);
    expect(isSeniorEligiblePlayer(migrated, 'parent')).toBe(false);
  });

  it('promotes the same row and records an idempotent registration spell', () => {
    const academy = ensureOpenRegistrationSpell(normalizePlayerStatus(player({
      isYouth:true, youthTeamId:'parent', teamId:null, inSquad:false,
    })), { season:'2025/26', gameweek:4 });
    const promoted = transitionPlayerStatus(academy, {
      status:'first_team', contractTeamId:'parent', registeredTeamId:'parent',
      season:'2025/26', gameweek:5, reason:'promotion', idempotencyKey:'promotion:p1:2025/26:5',
      patch:{ contractExpiry:2028, inSquad:true },
    });
    expect(promoted.id).toBe('p1');
    expect(promoted.playerStatus).toBe('first_team');
    expect(promoted.isYouth).toBe(false);
    expect(promoted.inSquad).toBe(true);
    expect(promoted.registrationSpells).toHaveLength(2);
    expect(promoted.registrationSpells[0].endReason).toBe('promotion');
    expect(transitionPlayerStatus(promoted, {
      status:'first_team', season:'2025/26', gameweek:5,
      idempotencyKey:'promotion:p1:2025/26:5',
    })).toBe(promoted);
  });

  it('releases to the shared free-agent pool without changing identity', () => {
    const academy = normalizePlayerStatus(player({ isYouth:true, youthTeamId:'parent', teamId:null, inSquad:false }));
    const released = transitionPlayerStatus(academy, {
      status:'free_agent', season:'2025/26', gameweek:10, reason:'academy_release',
      idempotencyKey:'release:p1:2025/26:10', patch:{ contractExpiry:null },
    });
    expect(released.id).toBe('p1');
    expect(released.teamId).toBe('free_agents');
    expect(released.contractTeamId).toBeNull();
    expect(released.registeredTeamId).toBe('free_agents');
    expect(released.isYouth).toBe(false);
    expect(released.inSquad).toBe(false);
  });

  it('returns a loan to its contract club on the same row', () => {
    const loan = normalizePlayerStatus(player({
      teamId:'loan_club', onLoan:true, loanedFrom:'parent', loanOriginalTeamId:'parent',
      activeLoanAgreement:{ id:'deal_1', parentTeamId:'parent', loanTeamId:'loan_club', recallAllowed:true },
    }));
    const returned = transitionPlayerStatus(loan, {
      status:'first_team', contractTeamId:'parent', registeredTeamId:'parent',
      season:'2025/26', gameweek:38, reason:'loan_return', idempotencyKey:'return:deal_1',
      patch:{ inSquad:true },
    });
    expect(returned.id).toBe(loan.id);
    expect(returned.playerStatus).toBe('first_team');
    expect(returned.teamId).toBe('parent');
    expect(returned.activeAgreementId).toBeNull();
    expect(returned.onLoan).toBe(false);
    expect(returned.loanedFrom).toBeNull();
  });

  it('absorbs a legacy loan-return write even when explicit P9 loan fields are stale', () => {
    const canonicalLoan = normalizePlayerStatus(player({
      teamId:'loan_club', onLoan:true, loanedFrom:'parent', loanOriginalTeamId:'parent',
      activeLoanAgreement:{ id:'deal_2', parentTeamId:'parent', loanTeamId:'loan_club' },
    }));
    const legacyReturn = {
      ...canonicalLoan,
      teamId:'parent',
      onLoan:false,
      loanedFrom:null,
      loanOriginalTeamId:null,
      loanedTo:null,
      loanRecallable:false,
    };
    const normalized = normalizePlayerStatus(legacyReturn);
    expect(normalized.playerStatus).toBe('first_team');
    expect(normalized.contractTeamId).toBe('parent');
    expect(normalized.registeredTeamId).toBe('parent');
    expect(normalized.activeAgreementId).toBeNull();
  });

  it('absorbs a legacy permanent-transfer teamId write instead of reverting it to the old owner', () => {
    const oldClub = normalizePlayerStatus(player({ teamId:'seller' }));
    const legacyTransfer = { ...oldClub, teamId:'buyer' };
    const normalized = normalizePlayerStatus(legacyTransfer);
    expect(normalized.playerStatus).toBe('first_team');
    expect(normalized.contractTeamId).toBe('buyer');
    expect(normalized.registeredTeamId).toBe('buyer');
  });
});
