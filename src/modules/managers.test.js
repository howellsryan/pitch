import { describe, expect, it } from 'vitest';
import {
  MANAGER_MODEL_VERSION,
  USER_MANAGER_ID,
  aiManagerIdForClub,
  buildManagersBackfill,
  createManager,
  createUserManager,
  generateAIManagerForClub,
  generateManagerIdentity,
  managersNeedBackfill,
  normalizeManager,
} from './managers.js';

const TEAM_A = { id:'club_a', league:'Premier League', reputation:88 };
const TEAM_B = { id:'club_b', league:'La Liga', reputation:60 };

describe('manager entity defaults', () => {
  it('fills every required field for a minimal input', () => {
    const manager = createManager({ id:'m1', currentClubId:'club_a' });
    expect(manager.id).toBe('m1');
    expect(manager.status).toBe('employed');
    expect(manager.employment.clubId).toBe('club_a');
    expect(manager.record).toMatchObject({ matches:0, wins:0, sackings:0 });
    expect(manager.reputation).toMatchObject({ overall:60 });
    expect(manager.dna).toMatchObject({ matches:0 });
    expect(Array.isArray(manager.history)).toBe(true);
  });

  it('defaults to unemployed with no club', () => {
    const manager = createManager({ id:'m2' });
    expect(manager.status).toBe('unemployed');
    expect(manager.currentClubId).toBeNull();
  });

  it('normalizeManager fills defaults on a partial/legacy row without rewriting a current one', () => {
    const partial = { id:'m3', version:1 };
    const normalized = normalizeManager(partial);
    expect(normalized.record).toBeDefined();
    expect(normalized.reputation).toBeDefined();

    const current = createManager({ id:'m4' });
    expect(normalizeManager(current)).toBe(current);
  });
});

describe('deterministic AI manager generation', () => {
  it('produces an identical entity for the same club across calls', () => {
    const a = generateAIManagerForClub(TEAM_A, { currentDate:'2025-08-09T00:00:00.000Z', seasonStartYear:2025 });
    const b = generateAIManagerForClub(TEAM_A, { currentDate:'2025-08-09T00:00:00.000Z', seasonStartYear:2025 });
    expect(a).toEqual(b);
  });

  it('assigns a stable club-derived id and nation-aware identity', () => {
    const manager = generateAIManagerForClub(TEAM_A);
    expect(manager.id).toBe(aiManagerIdForClub('club_a'));
    expect(manager.currentClubId).toBe('club_a');
    expect(manager.name.split(' ').length).toBeGreaterThanOrEqual(2);
  });

  it('varies identity by league nationality pool', () => {
    const spanish = generateManagerIdentity('club_b', 'La Liga');
    const english = generateManagerIdentity('club_b', 'Premier League');
    expect(spanish.nationality).toBe('🇪🇸');
    expect(english.nationality).toBe('🏴󠁧󠁢󠁥󠁮󠁧󠁿');
  });

  it('keeps reputation bounded and seeded from club reputation', () => {
    const strong = generateAIManagerForClub(TEAM_A);
    const weak = generateAIManagerForClub(TEAM_B);
    expect(strong.reputation.overall).toBeGreaterThanOrEqual(30);
    expect(strong.reputation.overall).toBeLessThanOrEqual(96);
    expect(weak.reputation.overall).toBeGreaterThanOrEqual(30);
    expect(weak.reputation.overall).toBeLessThanOrEqual(96);
  });
});

describe('user manager creation', () => {
  it('carries the supplied name, club and DNA', () => {
    const dna = { matches:12, wins:7 };
    const manager = createUserManager({ name:'Alex Carter', currentClubId:'club_a', dna, currentDate:'2025-08-09T00:00:00.000Z' });
    expect(manager.id).toBe(USER_MANAGER_ID);
    expect(manager.isUser).toBe(true);
    expect(manager.name).toBe('Alex Carter');
    expect(manager.currentClubId).toBe('club_a');
    expect(manager.dna.matches).toBe(12);
  });
});

describe('managers backfill', () => {
  const save = {
    userTeamId:'club_a',
    season:'2025/26',
    currentDate:'2025-08-09T00:00:00.000Z',
    managerName:'Sam Rivers',
    managerDNA:{ matches:5, wins:3 },
  };
  const teams = [TEAM_A, TEAM_B, { id:'club_c', league:'Bundesliga', reputation:70 }];

  it('needs backfill below the current version and not after', () => {
    expect(managersNeedBackfill(save)).toBe(true);
    expect(managersNeedBackfill({ ...save, managerModelVersion:MANAGER_MODEL_VERSION })).toBe(false);
    expect(managersNeedBackfill(null)).toBe(true);
  });

  it('creates exactly one manager per club, with the user club owning the user manager', () => {
    const result = buildManagersBackfill(save, teams);
    expect(result.managers).toHaveLength(teams.length);
    const byClub = new Map(result.managers.map(m => [m.currentClubId, m]));
    expect(byClub.get('club_a').id).toBe(USER_MANAGER_ID);
    expect(byClub.get('club_a').isUser).toBe(true);
    expect(byClub.get('club_b').isUser).toBe(false);
    expect(byClub.get('club_c').isUser).toBe(false);
    const ids = new Set(result.managers.map(m => m.id));
    expect(ids.size).toBe(teams.length);
  });

  it('carries save.managerName/managerDNA into the user manager entity', () => {
    const result = buildManagersBackfill(save, teams);
    const userManager = result.managers.find(m => m.id === USER_MANAGER_ID);
    expect(userManager.name).toBe('Sam Rivers');
    expect(userManager.dna.matches).toBe(5);
  });

  it('patches every team with a managerId matching its assigned manager', () => {
    const result = buildManagersBackfill(save, teams);
    expect(result.teamPatches).toHaveLength(teams.length);
    for (const team of result.teamPatches) {
      const manager = result.managers.find(m => m.currentClubId === team.id);
      expect(team.managerId).toBe(manager.id);
    }
  });

  it('is a no-op patch set once teams already carry the right managerId', () => {
    const first = buildManagersBackfill(save, teams);
    const alreadyPatched = teams.map(team => ({
      ...team,
      managerId:first.managers.find(m => m.currentClubId === team.id).id,
    }));
    const second = buildManagersBackfill(save, alreadyPatched);
    expect(second.teamPatches).toHaveLength(0);
  });

  it('sets managerModelVersion and userManagerId on the migrated save', () => {
    const result = buildManagersBackfill(save, teams);
    expect(result.save.managerModelVersion).toBe(MANAGER_MODEL_VERSION);
    expect(result.save.userManagerId).toBe(USER_MANAGER_ID);
  });

  it('creates an empty managerMarket for an existing save that never had one', () => {
    const result = buildManagersBackfill(save, teams);
    expect(result.save.managerMarket).toMatchObject({ vacancies:[], reviewedCheckpoints:[], processedWeekKeys:[] });
  });

  it('preserves an existing managerMarket rather than overwriting it', () => {
    const withMarket = { ...save, managerMarket:{ version:1, vacancies:[{ id:'vac_1' }], reviewedCheckpoints:['2025/26:10'], processedWeekKeys:['2025/26:10'] } };
    const result = buildManagersBackfill(withMarket, teams);
    expect(result.save.managerMarket.vacancies).toHaveLength(1);
    expect(result.save.managerMarket.reviewedCheckpoints).toEqual(['2025/26:10']);
  });
});
