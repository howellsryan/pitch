import { describe, expect, it } from 'vitest';
import {
  sharePlayerHistorySnapshots,
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

  it('keeps valid registration evidence and sanitizes malformed bounded histories', () => {
    const canonical = normalizePlayerStatus(player());
    const spells = Array.from({ length:30 }, (_, i) => ({ id:`s${i}`, startStats:{ goals:i }, endSeason:'2024/25' }));
    const input = { ...canonical, registrationSpells:[null, {}, ...spells], lifecycleTransitionKeys:[null, ...spells.map(s => s.id)] };
    const result = normalizePlayerStatus(input);
    expect(result.registrationSpells.map(s => s.id)).toEqual(spells.slice(-24).map(s => s.id));
    expect(result.registrationSpells.at(-1).startStats).toEqual({ goals:29 });
    expect(result.lifecycleTransitionKeys).toEqual(spells.slice(-24).map(s => s.id));
    expect(input.registrationSpells).toHaveLength(32);
    expect(normalizePlayerStatus(result)).toBe(result);
    expect(isSeniorEligiblePlayer(result, 'parent')).toBe(true);
  });

  it('restores missing history arrays on otherwise canonical imported rows', () => {
    const input = normalizePlayerStatus(player());
    delete input.registrationSpells;
    delete input.lifecycleTransitionKeys;
    const result = normalizePlayerStatus(input);
    expect(result.registrationSpells).toEqual([]);
    expect(result.lifecycleTransitionKeys).toEqual([]);
    expect(() => transitionPlayerStatus(result, { status:'free_agent', idempotencyKey:'release' })).not.toThrow();
  });
});

describe('lossless history snapshot sharing', () => {
  it('shares identical snapshots without changing values, inputs or lifecycle identity', () => {
    const stats = { appearances:3, minutes:120 };
    const evidence = { season:'2026/27', appearances:20, minutes:1300 };
    const source = player({ academyEvidence:evidence, registrationSpells:[
      { id:'old', startStats:{ ...stats }, endStats:{ ...stats }, endAcademyEvidence:{ ...evidence } },
      { id:'open', startStats:{ ...stats }, startAcademyEvidence:{ ...evidence }, endSeason:null },
    ] });
    const result = sharePlayerHistorySnapshots(source);
    expect(JSON.stringify(result)).toBe(JSON.stringify(source));
    expect(result.registrationSpells[0].startStats).toBe(result.registrationSpells[1].startStats);
    expect(result.registrationSpells[0].endAcademyEvidence).toBe(result.academyEvidence);
    expect(source.registrationSpells[0].startStats).not.toBe(source.registrationSpells[1].startStats);
    expect(sharePlayerHistorySnapshots(result)).toBe(result);
    const restored = structuredClone(result);
    expect(restored.registrationSpells[0].startStats).toBe(restored.registrationSpells[1].startStats);
    expect(sharePlayerHistorySnapshots(restored)).toBe(restored);
  });
  it('keeps distinct snapshots and copies changed evidence without changing historical totals', () => {
    const source = player({ academyEvidence:{ appearances:5 }, registrationSpells:[
      { id:'old', startStats:{ appearances:2 }, endStats:{ appearances:3 }, endAcademyEvidence:{ appearances:5 } },
    ] });
    const result = sharePlayerHistorySnapshots(source);
    expect(result.registrationSpells[0].startStats).not.toBe(result.registrationSpells[0].endStats);
    const advanced = { ...result, academyEvidence:{ ...result.academyEvidence, appearances:6 } };
    expect(advanced.registrationSpells[0].endAcademyEvidence.appearances).toBe(5);
    expect(sharePlayerHistorySnapshots({ ...source, registrationSpells:[] })).toEqual({ ...source, registrationSpells:[] });
  });
});
