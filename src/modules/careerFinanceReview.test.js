import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyLedgerMovement, buildClubFinanceBackfill, createClubFinance, settleClubPayrollWeek, seedClubOperatingIncome,
} from './clubFinance.js';
import { coachingWeeklyCost, withDefaultCoaching } from './coaching.js';
import { getAllTeamData, startingBudget, startNewGame } from './save.js';

const state = vi.hoisted(() => ({ save:null, teams:[], players:[], standings:[], seasons:[], managers:[] }));
vi.mock('./db.js', async importOriginal => ({
  ...await importOriginal(),
  getSave:vi.fn(async () => state.save),
  getAllTeams:vi.fn(async () => state.teams),
  getTeam:vi.fn(async id => state.teams.find(team => team.id === id)),
  getAllPlayers:vi.fn(async () => state.players),
  getAllStandings:vi.fn(async () => state.standings),
  getAllSeasons:vi.fn(async () => state.seasons),
  getAllTransfers:vi.fn(async () => []),
  getAllManagers:vi.fn(async () => state.managers),
  getManager:vi.fn(async id => state.managers.find(manager => manager.id === id)),
  getStanding:vi.fn(async id => state.standings.find(row => row.teamId === id)),
  prepareActiveCareerSlotForNewSave:vi.fn(async () => { state.players = []; state.teams = []; state.save = null; }),
  runSeasonRolloverAtomic:vi.fn(async operation => operation()),
  putTeamsBulk:vi.fn(async teams => { state.teams = teams; }),
  putManagersBulk:vi.fn(async patches => {
    const byId = new Map(state.managers.map(manager => [manager.id, manager]));
    for (const manager of patches) byId.set(manager.id, manager);
    state.managers = [...byId.values()];
  }),
  putTeam:vi.fn(async patch => { state.teams = state.teams.map(team => team.id === patch.id ? patch : team); }),
  putPlayersBulk:vi.fn(async patches => {
    const byId = new Map(state.players.map(player => [player.id, player]));
    for (const player of patches) byId.set(player.id, player);
    state.players = [...byId.values()];
  }),
  deletePlayersBulk:vi.fn(async ids => { state.players = state.players.filter(player => !ids.includes(player.id)); }),
  putSave:vi.fn(async save => { state.save = save; }),
  addHonor:vi.fn(async () => {}),
  addSeason:vi.fn(async summary => { state.seasons.push(summary); }),
  putSeasonsBulk:vi.fn(async patches => {
    state.seasons = state.seasons.map(record => patches.find(patch => patch.season === record.season) ?? record);
  }),
  replaceAllFixtures:vi.fn(async () => {}),
  replaceAllStandings:vi.fn(async () => {}),
}));
vi.mock('./promotion.js', async importOriginal => ({
  ...await importOriginal(),
  processLeagueChanges:vi.fn(async () => ({ userRelInfo:{ relegated:false } })),
  assignCupsFromPosition:vi.fn(() => []),
}));
vi.mock('./youthAcademy.js', async importOriginal => ({
  ...await importOriginal(), runYouthIntake:vi.fn(async () => []),
}));

import { calculatePrizeMoney, payWeeklyWages, processEndOfSeason } from './season.js';
import { createPlayingTimeAgreement } from './playerModel.js';
import { updateTeamMorale } from './standings.js';
import { normalizePlayerStatus, transitionPlayerStatus } from './playerStatus.js';
import { addHonor } from './db.js';
import { processLeagueChanges } from './promotion.js';

function careerPlayer(id, teamId, extra = {}) {
  return {
    id, name:id, teamId, position:'CM', age:25,
    attack:65, midfield:65, defence:65, goalkeeping:15,
    value:1_000_000, wage:10_000, contractExpiry:2028, inSquad:true,
    ...extra,
  };
}

beforeEach(() => {
  state.save = {
    userTeamId:'user', userLeague:'Premier League', managerName:'Manager',
    season:'2025/26', currentGameweek:47, totalGameweeks:38, worldTotalGameweeks:46,
    currentDate:'2026-06-27T00:00:00.000Z', cups:{}, pendingEvents:[], jobSecurity:65,
    lineup:['expired','retiring','keeper'], bench:['expired','retiring'],
    boardContract:{ objectives:[{ kind:'youth', target:5, weight:1 }] },
  };
  state.teams = ['user', 'other'].map(id => ({
    id, name:id, reputation:60, league:'Premier League', budget:10_000_000,
    finance:createClubFinance(10_000_000), morale:50,
  }));
  state.players = [
    careerPlayer('expired','user', {
      contractExpiry:2026, playerStatus:'first_team', contractTeamId:'user', registeredTeamId:'user',
      squadRole:'important', squadRoleTeamId:'user', playingTimeAgreement:createPlayingTimeAgreement('important','user'),
    }),
    careerPlayer('retiring','user', { age:35 }),
    careerPlayer('keeper','user', { position:'GK', contractExpiry:2027 }),
    careerPlayer('academy','user', { age:16, isYouth:true, youthTeamId:'user', playerStatus:'academy', inSquad:false, wage:0, contractExpiry:null }),
    careerPlayer('outgoing','other', { age:20, onLoan:true, loanedFrom:'user', loanOriginalTeamId:'user', appearances:30 }),
    careerPlayer('incoming','user', { age:20, onLoan:true, loanedFrom:'other', loanOriginalTeamId:'other', appearances:6 }),
  ];
  state.standings = state.teams.map((team,index) => ({
    teamId:team.id, teamName:team.name, league:team.league, position:index + 1,
    points:50-index, played:38, goalDifference:10-index, goalsFor:50, goalsAgainst:40, form:[],
  }));
  state.seasons = [];
  state.managers = [];
  vi.clearAllMocks();
});

describe('season-close career boundaries', () => {
  it('keeps an unemployed manager between clubs without reviewing or crediting the former club as their own', async () => {
    state.save = {
      ...state.save, userManagerId:'user-manager', jobSecurity:0, sacked:true,
      boardObjective:{ kind:'top_half', label:'Top half' }, cups:{ fa_cup:{ status:'winner' } },
    };
    state.managers = [
      { id:'user-manager', name:'Manager', age:40, status:'unemployed', currentClubId:null, record:{ sackings:1 } },
      { id:'caretaker', name:'Caretaker', age:50, status:'employed', currentClubId:'user' },
    ];
    state.teams[0].managerId = 'caretaker';
    const { summary, newSave } = await processEndOfSeason();
    expect(summary).toMatchObject({ managedClub:false, boardObjective:null, boardContract:null, sacked:false, dismissalRecommended:false });
    expect(addHonor).not.toHaveBeenCalled();
    expect(summary.clubHistory.find(club => club.teamId === 'user').manager).toBe('Caretaker');
    expect(newSave).toMatchObject({ boardObjective:null, boardContract:null, userManagerId:'user-manager', jobSecurity:0 });
    expect(state.managers.find(manager => manager.id === 'user-manager')).toMatchObject({ status:'unemployed', currentClubId:null, record:{ sackings:1 } });
    expect(state.teams[0].managerId).toBe('caretaker');
    expect(state.teams[0].finance.cash).toBeGreaterThan(10_000_000);
  });

  it('returns canonical loans to their owner and keeps them there after lifecycle normalization', async () => {
    const player = state.players.find(row => row.id === 'incoming');
    state.players = state.players.map(row => row.id === player.id ? transitionPlayerStatus(player, {
      status:'loan', contractTeamId:'other', registeredTeamId:'user',
      season:'2025/26', gameweek:1, reason:'loan_started', idempotencyKey:'loan:incoming',
      activeLoanAgreement:{ id:'agreement:incoming', parentTeamId:'other', loanTeamId:'user', startSeason:'2025/26' },
    }) : row);
    await processEndOfSeason();
    const returned = normalizePlayerStatus(state.players.find(row => row.id === player.id));
    expect(returned).toMatchObject({
      teamId:'other', playerStatus:'first_team', contractTeamId:'other', registeredTeamId:'other',
      onLoan:false, loanedFrom:null, loanedTo:null, loanOriginalTeamId:null, activeLoanAgreement:null, activeAgreementId:null,
    });
    expect(returned.lifecycleTransitionKeys).toContain('season-loan-return:2025/26:incoming');
    expect(returned.registrationSpells.some(spell => spell.reason === 'loan_return')).toBe(true);
  });

  it('simulates promotion playoffs on outgoing availability before loans return and injuries reset', async () => {
    const actualPromotion = await vi.importActual('./promotion.js');
    state.teams = Array.from({ length:24 }, (_, index) => ({
      id:`club_${index + 1}`, name:`Club ${index + 1}`, league:'Championship', reputation:65,
      budget:10_000_000, finance:createClubFinance(10_000_000), morale:50,
    }));
    state.players = state.teams.flatMap(team => ['GK','RB','CB','CB','LB','CM','CM','CAM','RW','LW','ST'].map((position, index) =>
      careerPlayer(`${team.id}_p${index}`, team.id, {
        position, goalkeeping:position === 'GK' ? 70 : 10, fitness:40,
      })));
    state.players[22].injured = true;
    state.players[22].injuryGWsLeft = 10;
    state.players.push(careerPlayer('loan_keeper','club_3', {
      position:'GK', goalkeeping:66, onLoan:true, loanOriginalTeamId:'club_1', loanedFrom:'club_1',
    }));
    state.save = { ...state.save, userTeamId:'club_3', userLeague:'Championship', boardContract:null, lineup:null, bench:null };
    state.standings = state.teams.map((team, index) => ({
      teamId:team.id, teamName:team.name, league:team.league, position:index + 1,
      points:24-index, played:46, goalDifference:0, goalsFor:50, goalsAgainst:50, form:[],
    }));
    const expected = actualPromotion.runPlayoffs(['club_3','club_4','club_5','club_6'], state.teams, state.players, { save:state.save });
    processLeagueChanges.mockImplementationOnce((...args) => actualPromotion.processLeagueChanges(...args));

    const { summary } = await processEndOfSeason();

    expect(summary.leagueChanges.playoffResults.Championship).toEqual(expected.playoffResults);
    expect(state.players.find(player => player.id === 'loan_keeper').teamId).toBe('club_1');
    expect(state.players.find(player => player.id === 'club_3_p0').injured).toBe(false);
  });

  it('starts a new career in the season represented by the refreshed roster data', async () => {
    const source = getAllTeamData()[0];
    const save = await startNewGame(source.id, 'Launch Manager');
    expect(save.season).toBe('2026/27');
    expect(save.currentDate).toBe('2026-08-09T00:00:00.000Z');
    expect(state.players.filter(player => player.teamId === source.id && player.inSquad !== false)
      .every(player => player.contractExpiry >= 2027)).toBe(true);
    expect(state.teams.find(team => team.id === source.id).finance.operatingIncomePerWeek).toBeGreaterThan(0);
  });

  it('expires the current one-year contract canonically and prunes departed matchday selections', async () => {
    const { summary } = await processEndOfSeason();
    const expired = state.players.find(player => player.id === 'expired');
    expect(expired).toMatchObject({
      teamId:'free_agents', playerStatus:'free_agent', contractTeamId:null,
      registeredTeamId:'free_agents', inSquad:false, contractExpiry:null,
      squadRole:null, playingTimeAgreement:null,
    });
    expect(state.players.find(player => player.id === 'keeper').teamId).toBe('user');
    expect(state.players.find(player => player.id === 'academy')).toMatchObject({ playerStatus:'academy', contractExpiry:null });
    expect(state.save.lineup).toEqual(['keeper']);
    expect(state.save.bench).toEqual([]);
    expect(summary.expiredContracts).toEqual([{ id:'expired', name:'expired', position:'CM' }]);
  });

  it('judges youth use and archives player clubs before returning season-long loans', async () => {
    const { summary } = await processEndOfSeason();
    expect(summary.boardContract.objectives[0].progress).toBe(6);
    expect(summary.playerHistory.find(player => player.playerId === 'outgoing').clubs).toEqual(['other']);
    expect(summary.playerHistory.find(player => player.playerId === 'incoming').clubs).toEqual(['user']);
    expect(state.players.find(player => player.id === 'outgoing').teamId).toBe('user');
    expect(state.players.find(player => player.id === 'incoming').teamId).toBe('other');
  });

  it('renews the last AI goalkeeper while leaving the user responsible for their own expiry', async () => {
    state.players = [
      careerPlayer('user_keeper', 'user', { position:'GK', contractExpiry:2026 }),
      careerPlayer('ai_keeper_1', 'other', { position:'GK', contractExpiry:2026 }),
      careerPlayer('ai_keeper_2', 'other', { position:'GK', contractExpiry:2026 }),
    ];
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    try { await processEndOfSeason(); }
    finally { random.mockRestore(); }
    expect(state.players.find(player => player.id === 'user_keeper')).toMatchObject({ playerStatus:'free_agent', contractExpiry:null });
    const retained = state.players.filter(player => player.teamId === 'other' && player.position === 'GK');
    expect(retained).toHaveLength(1);
    expect(retained[0].contractExpiry).toBeGreaterThan(2026);
  });

  it('pays the same position-based league prize to AI clubs and never adds annual operating income twice', async () => {
    await processEndOfSeason();
    const other = state.teams.find(team => team.id === 'other');
    expect(other.finance.cash).toBe(10_000_000 + calculatePrizeMoney(2, {}, 'Premier League'));
    expect(other.finance.seasonTotals.operating_income ?? 0).toBe(0);
  });

  it('opens the next finance period without losing debt or erasing its first coaching payment', async () => {
    state.teams[0].finance = {
      ...state.teams[0].finance, periodSeason:'2025/26', seasonTotals:{ wages:-400_000 },
      obligations:[{ id:'future-installment', amount:-100_000, dueSeason:'2026/27', dueGameweek:4 }],
    };
    await processEndOfSeason();
    expect(state.teams[0].finance).toMatchObject({
      periodSeason:'2026/27', seasonTotals:{},
      obligations:[{ id:'future-installment', amount:-100_000 }],
    });
    state.teams[0] = applyLedgerMovement(state.teams[0], { category:'coaching_costs', amount:-1_000 });
    await payWeeklyWages();
    expect(state.teams[0].finance.seasonTotals.coaching_costs).toBe(-1_000);
  });
});

describe('sustainable fixed club operating revenue', () => {
  it('migrates revenue additively from seed squads while preserving cash, debt and accrued transactions', () => {
    const finance = { ...createClubFinance(800_000), obligations:[{ id:'bill', amount:-100_000 }], seasonTotals:{ wages:-20_000 } };
    const teams = [{ id:'club', reputation:60, budget:800_000, finance }];
    const seedTeams = [{ id:'club', reputation:60, players:[{ wage:10_000 }] }];
    const first = buildClubFinanceBackfill({ season:'2025/26', clubFinanceVersion:1 }, teams, { seedTeams, weeklyCoachingFor:() => 2_000, weeksPerSeason:46 });
    const migrated = first.teamPatches[0];
    expect(migrated.finance.cash).toBe(800_000);
    expect(migrated.finance.obligations).toEqual(finance.obligations);
    expect(migrated.finance.seasonTotals).toEqual(finance.seasonTotals);
    expect(migrated.finance.operatingIncomePerWeek).toBeGreaterThan(12_000);
    expect(buildClubFinanceBackfill(first.save, [migrated], { seedTeams, weeklyCoachingFor:() => 99_000 })).toMatchObject({ teamPatches:[] });
  });

  it('keeps all real seeded clubs solvent through fifteen unchanged-squad seasons', () => {
    for (const source of getAllTeamData()) {
      const wages = source.players.reduce((sum, player) => sum + (player.wage ?? 0), 0);
      const coaching = coachingWeeklyCost(withDefaultCoaching(source));
      const cash = startingBudget(source.reputation);
      let team = seedClubOperatingIncome({ ...source, budget:cash, finance:createClubFinance(cash) }, {
        baselineWeeklyWages:wages, baselineWeeklyCoaching:coaching, weeksPerSeason:46,
      });
      for (let year = 2025; year < 2040; year++) {
        for (let week = 1; week <= 46; week++) {
          const save = { season:`${year}/${String(year + 1).slice(2)}`, currentGameweek:week };
          team = settleClubPayrollWeek(team, wages + coaching, save);
          expect(team.finance.cash, `${source.name}, season ${save.season}, week ${week}`).toBeGreaterThanOrEqual(cash);
        }
      }
    }
  });

  it('does not increase fixed revenue to cover a new signing and ignores a repeated week', () => {
    const team = seedClubOperatingIncome({ id:'club', reputation:60, budget:1_000_000, finance:createClubFinance(1_000_000) }, { baselineWeeklyWages:20_000, weeksPerSeason:46 });
    const week = { season:'2025/26', currentGameweek:1 };
    const ordinary = settleClubPayrollWeek(team, 20_000, week);
    const signing = settleClubPayrollWeek(team, 45_000, week);
    expect(ordinary.finance.cash - signing.finance.cash).toBe(25_000);
    expect(signing.finance.operatingIncomePerWeek).toBe(team.finance.operatingIncomePerWeek);
    expect(settleClubPayrollWeek(signing, 45_000, week)).toBe(signing);
    expect(settleClubPayrollWeek(signing, 45_000, { ...week, currentGameweek:2 }).finance.cash).not.toBe(signing.finance.cash);
  });

  it('pays each weekly club payroll once, excludes prepaid loans, and records income and wages separately', async () => {
    state.save.currentGameweek = 4;
    state.players = [careerPlayer('senior','user'), careerPlayer('prepaid-loan','user', { onLoan:true, wage:100_000 }), careerPlayer('academy','user', { inSquad:false, isYouth:true, wage:0 })];
    state.teams = state.teams.map(team => seedClubOperatingIncome(team, { baselineWeeklyWages:10_000, weeksPerSeason:46 }));
    await payWeeklyWages();
    const once = state.teams.find(team => team.id === 'user');
    expect(once.finance.seasonTotals.wages).toBe(-10_000);
    expect(once.finance.seasonTotals.operating_income).toBeGreaterThan(10_000);
    await payWeeklyWages();
    expect(state.teams.find(team => team.id === 'user')).toBe(once);
  });

  it('advances team morale once when a week closeout resumes', async () => {
    state.save.currentGameweek = 4;
    state.standings[0].form = ['W', 'W', 'W'];
    await updateTeamMorale('user');
    const once = state.teams[0];
    expect(once.morale).toBeGreaterThan(50);
    await updateTeamMorale('user');
    expect(state.teams[0]).toBe(once);
    state.save.currentGameweek++;
    await updateTeamMorale('user');
    expect(state.teams[0].morale).toBeGreaterThan(once.morale);
  });
});
