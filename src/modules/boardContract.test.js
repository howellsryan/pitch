import { describe, expect, it } from 'vitest';
import {
  BOARD_CONTRACT_VERSION,
  OBJECTIVE_STATUS,
  boardContractNeedsBackfill,
  buildBoardContractBackfill,
  evaluateBoardContractSeasonClose,
  evaluateBoardObjective,
  generateBoardContract,
  generateBoardObjective,
  liveBoardContractConfidence,
  youthAppearancesFor,
} from './boardContract.js';

const bigClub = { id:'club_big', name:'Big FC', league:'Premier League', reputation:88, finance:{ cash:20_000_000, obligations:[] } };

function player(id, teamId, age, appearances) {
  return { id, teamId, age, appearances };
}

describe('generateBoardObjective / evaluateBoardObjective (migrated from season.js)', () => {
  it('generates a sensible objective by reputation/league and evaluates position against it', () => {
    const objective = generateBoardObjective(bigClub, 'Premier League');
    expect(objective.kind).toBe('position');
    expect(evaluateBoardObjective(objective, 1, 20, false).met).toBe(true);
  });
});

describe('generateBoardContract', () => {
  it('produces three weighted objectives summing to 1', () => {
    const contract = generateBoardContract(bigClub, 'Premier League');
    expect(contract.version).toBe(BOARD_CONTRACT_VERSION);
    expect(contract.objectives.map(o => o.kind)).toEqual(['sporting', 'financial', 'youth']);
    const totalWeight = contract.objectives.reduce((sum, o) => sum + o.weight, 0);
    expect(totalWeight).toBeCloseTo(1, 5);
  });

  it('scales the youth target with the club\'s own youthPathway philosophy trait', () => {
    const youthClub = { ...bigClub, philosophy:{ version:1, traits:{ youthPathway:100 } } };
    const cautiousClub = { ...bigClub, philosophy:{ version:1, traits:{ youthPathway:0 } } };
    const youthTarget = generateBoardContract(youthClub, 'Premier League').objectives.find(o => o.kind === 'youth').target;
    const cautiousTarget = generateBoardContract(cautiousClub, 'Premier League').objectives.find(o => o.kind === 'youth').target;
    expect(youthTarget).toBeGreaterThan(cautiousTarget);
  });
});

describe('youthAppearancesFor', () => {
  it('sums appearances only for this club\'s U21 players', () => {
    const players = [
      player('u21_a', 'club_big', 20, 15),
      player('u21_b', 'club_big', 21, 10),
      player('over21', 'club_big', 25, 30),
      player('other_club_u21', 'club_other', 19, 20),
    ];
    expect(youthAppearancesFor(bigClub, players)).toBe(25);
  });
});

describe('evaluateBoardContractSeasonClose', () => {
  it('marks every objective ok when sporting/financial/youth targets are all met', () => {
    const contract = generateBoardContract(bigClub, 'Premier League'); // rep 88 -> title objective, target:1
    const players = [player('kid', 'club_big', 20, 20)];
    const result = evaluateBoardContractSeasonClose(contract, {
      team:bigClub, players, finalPosition:1, totalTeams:20, wasRelegated:false,
    });
    expect(result.objectives.every(o => o.status === OBJECTIVE_STATUS.OK)).toBe(true);
    expect(result.weightedScore).toBeCloseTo(1, 5);
    expect(result.dismissalRecommended).toBe(false);
  });

  it('recommends dismissal only when the sporting objective itself is in review AND the overall score is poor', () => {
    const contract = generateBoardContract(bigClub, 'Premier League'); // target:1 (title)
    const brokeBigClub = { ...bigClub, finance:{ cash:-5_000_000, obligations:[] } };
    const players = []; // no youth minutes at all
    const result = evaluateBoardContractSeasonClose(contract, {
      team:brokeBigClub, players, finalPosition:18, totalTeams:20, wasRelegated:false,
    });
    const sporting = result.objectives.find(o => o.kind === 'sporting');
    expect(sporting.status).toBe(OBJECTIVE_STATUS.REVIEW);
    expect(result.dismissalRecommended).toBe(true);
  });

  it('grades avoid_relegation severity by how badly relegated, not a flat fixed margin', () => {
    const smallClub = { id:'club_small', name:'Small FC', league:'Premier League', reputation:40, finance:{ cash:5_000_000, obligations:[] } };
    const contract = generateBoardContract(smallClub, 'Premier League');
    expect(contract.objectives.find(o => o.kind === 'sporting').target.kind).toBe('avoid_relegation');

    const barelyRelegated = evaluateBoardContractSeasonClose(contract, {
      team:smallClub, players:[], finalPosition:18, totalTeams:20, wasRelegated:true,
    });
    expect(barelyRelegated.objectives.find(o => o.kind === 'sporting').status).toBe(OBJECTIVE_STATUS.WARNING);

    const badlyRelegated = evaluateBoardContractSeasonClose(contract, {
      team:smallClub, players:[], finalPosition:20, totalTeams:20, wasRelegated:true,
    });
    expect(badlyRelegated.objectives.find(o => o.kind === 'sporting').status).toBe(OBJECTIVE_STATUS.REVIEW);
  });

  it('does not recommend dismissal for a merely soft miss on one minor objective', () => {
    const contract = generateBoardContract(bigClub, 'Premier League');
    const players = [player('kid', 'club_big', 20, 3)]; // some but not enough youth minutes
    const result = evaluateBoardContractSeasonClose(contract, {
      team:bigClub, players, finalPosition:1, totalTeams:20, wasRelegated:false, // sporting still met
    });
    expect(result.dismissalRecommended).toBe(false);
  });

  it('is a pure function — calling it twice with the same inputs gives the same result (no hidden persisted state)', () => {
    const contract = generateBoardContract(bigClub, 'Premier League');
    const players = [player('kid', 'club_big', 20, 20)];
    const args = { team:bigClub, players, finalPosition:5, totalTeams:20, wasRelegated:false };
    expect(evaluateBoardContractSeasonClose(contract, args)).toEqual(evaluateBoardContractSeasonClose(contract, args));
  });
});

describe('liveBoardContractConfidence', () => {
  it('reflects current position/finance/youth without persisting anything', () => {
    const contract = generateBoardContract(bigClub, 'Premier League');
    const result = liveBoardContractConfidence(contract, { team:bigClub, players:[], position:1, totalTeams:20, form:['W','W','W'], played:3 });
    expect(result.hasLeagueEvidence).toBe(true);
    expect(result.objectives.find(o => o.kind === 'sporting').status).toBe(OBJECTIVE_STATUS.OK);
  });

  it('reads no league evidence before any match has been played', () => {
    const contract = generateBoardContract(bigClub, 'Premier League');
    const result = liveBoardContractConfidence(contract, { team:bigClub, players:[], position:null, totalTeams:20, form:[], played:0 });
    expect(result.hasLeagueEvidence).toBe(false);
  });
});

describe('boardContractNeedsBackfill / buildBoardContractBackfill', () => {
  it('needs backfill for a missing save or stale version', () => {
    expect(boardContractNeedsBackfill(null)).toBe(true);
    expect(boardContractNeedsBackfill({})).toBe(true);
    expect(boardContractNeedsBackfill({ boardContractVersion:BOARD_CONTRACT_VERSION })).toBe(false);
  });

  it('builds a fresh contract for the user\'s club', () => {
    const migration = buildBoardContractBackfill({ userTeamId:'club_big' }, bigClub, 'Premier League');
    expect(migration.save.boardContractVersion).toBe(BOARD_CONTRACT_VERSION);
    expect(migration.save.boardContract.objectives).toHaveLength(3);
  });

  it('returns the save unchanged for a null save', () => {
    expect(buildBoardContractBackfill(null, bigClub, 'Premier League')).toEqual({ save:null });
  });
});
