import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  getAllPlayers: vi.fn(async () => []),
  getPlayer: vi.fn(async () => null),
  getSave: vi.fn(async () => null),
  getTeam: vi.fn(async () => null),
  putPlayer: vi.fn(async () => {}),
  putPlayersBulk: vi.fn(async () => {}),
  putSave: vi.fn(async () => {}),
  putTeamsBulk: vi.fn(async () => {}),
}));

vi.mock('./db.js', () => db);

import { runYouthIntake } from './youthAcademy.js';

function academyPlayer(id, teamId, overrides = {}) {
  return {
    id,
    name:id,
    teamId,
    youthTeamId:teamId,
    contractTeamId:teamId,
    registeredTeamId:teamId,
    playerStatus:'academy',
    isYouth:true,
    inSquad:false,
    onLoan:false,
    loanedFrom:null,
    loanedTo:null,
    loanOriginalTeamId:null,
    position:'CM',
    age:18,
    attack:48,
    midfield:56,
    defence:47,
    goalkeeping:12,
    potentialRating:76,
    value:1_500_000,
    wage:0,
    fitness:100,
    form:50,
    ...overrides,
  };
}

const save = {
  season:'2025/26',
  currentGameweek:38,
  userTeamId:'user',
  userLeague:'Premier League',
};

describe('P9 canonical academy rollover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  it('auto-promotes an eligible AI prospect on the same player id with a three-year first-team contract', async () => {
    db.getAllPlayers.mockResolvedValue([
      academyPlayer('ai_prospect', 'ai', { age:18, potentialRating:78 }),
    ]);
    const teams = [
      { id:'user', name:'User', league:'Premier League', reputation:70, academyInvestment:0 },
      { id:'ai', name:'AI', league:'Premier League', reputation:70, academyInvestment:0 },
    ];

    const legacyCohort = await runYouthIntake(save, teams);

    expect(legacyCohort).toEqual([]);
    expect(db.putPlayersBulk).toHaveBeenCalledTimes(1);
    const promoted = db.putPlayersBulk.mock.calls[0][0].find(player => player.id === 'ai_prospect');
    expect(promoted).toMatchObject({
      id:'ai_prospect',
      playerStatus:'first_team',
      contractTeamId:'ai',
      registeredTeamId:'ai',
      teamId:'ai',
      isYouth:false,
      inSquad:true,
      contractExpiry:2029,
      signedThisSeason:false,
      squadRole:'prospect',
    });
  });

  it('writes next-season intake as canonical academy player rows while keeping the retired legacy cohort empty', async () => {
    db.getAllPlayers.mockResolvedValue([
      academyPlayer('user_prospect', 'user', { age:17, potentialRating:68 }),
    ]);
    const teams = [
      { id:'user', name:'User', league:'Premier League', reputation:70, academyInvestment:0 },
    ];

    const legacyCohort = await runYouthIntake(save, teams);

    expect(legacyCohort).toEqual([]);
    const patches = db.putPlayersBulk.mock.calls[0][0];
    const retained = patches.find(player => player.id === 'user_prospect');
    const intake = patches.filter(player => String(player.id).startsWith('academy_user_2026_27_'));
    expect(retained).toMatchObject({
      id:'user_prospect', playerStatus:'academy', teamId:'user', contractTeamId:'user', inSquad:false,
    });
    expect(intake.length).toBeGreaterThan(0);
    expect(intake.every(player =>
      player.playerStatus === 'academy'
      && player.teamId === 'user'
      && player.contractTeamId === 'user'
      && player.registeredTeamId === 'user'
      && player.inSquad === false
    )).toBe(true);
  });

  it('seeds a new career academy into the canonical players store rather than save.youthCohort', () => {
    const source = readFileSync(new URL('./save.js', import.meta.url), 'utf8');
    const start = source.indexOf('export async function startNewGame');
    const body = start >= 0 ? source.slice(start) : '';

    expect(body).toContain('const canonicalInitialCohort = initialCohort.map');
    expect(body).toContain("playerStatus:'academy'");
    expect(body).toContain('await putPlayersBulk([...assignedPlayers, ...canonicalInitialCohort])');
    expect(body).toContain('...createFreshP9SaveFields()');
    expect(body).not.toContain('youthCohort: initialCohort');
  });
});
