import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const seasonSource = readFileSync(new URL('./season.js', import.meta.url), 'utf8');

function functionBody(name) {
  const start = seasonSource.indexOf(`export async function ${name}`);
  if (start < 0) return '';
  const nextExport = seasonSource.indexOf('\nexport ', start + 1);
  return seasonSource.slice(start, nextExport < 0 ? seasonSource.length : nextExport);
}

describe('P1 season rollover compatibility contracts', () => {
  it('keeps weekly wages aggregated by team and excludes prepaid loan players', () => {
    const source = functionBody('payWeeklyWages');
    expect(source).toContain('const billByTeam = new Map()');
    expect(source).toContain('if (!player.teamId || player.onLoan) continue');
    expect(source).toContain("billByTeam.set(player.teamId, (billByTeam.get(player.teamId) ?? 0) + (player.wage ?? 0))");
    expect(source).toContain("applyLedgerMovement(team, { category:'wages', amount:-bill, description:'Weekly wages' })");
  });

  it('returns loans to their parent club and clears every loan marker before aging', () => {
    const returnStart = seasonSource.indexOf('const loanReturnUpdates = players');
    const agingStart = seasonSource.indexOf('const agedPlayers = players.map');
    expect(returnStart).toBeGreaterThan(-1);
    expect(agingStart).toBeGreaterThan(returnStart);
    const source = seasonSource.slice(returnStart, agingStart);
    expect(source).toContain('teamId:player.loanOriginalTeamId');
    expect(source).toContain('onLoan:false');
    expect(source).toContain('loanedFrom:null');
    expect(source).toContain('loanedTo:null');
    expect(source).toContain('loanOriginalTeamId:null');
    expect(source).toContain('loanSeason:null');
    expect(source).toContain('loanRecallable:false');
  });

  it('clears one-season transfer locks and collapsed negotiations at rollover', () => {
    const source = functionBody('processEndOfSeason');
    expect(source).toContain('signedThisSeason:false');
    expect(source).toContain('collapsedDeals:[]');
    expect(source).toContain('inboundOffers:[]');
  });

  it('ages every manager by one year at rollover, feeding P6 age-based retirement a real moving age', () => {
    const source = functionBody('processEndOfSeason');
    const managersIndex = source.indexOf('let allManagers = await getAllManagers()');
    const academyIndex = source.indexOf('const allTeamsForAcademy = await getAllTeams()');
    expect(managersIndex).toBeGreaterThan(-1);
    expect(academyIndex).toBeGreaterThan(managersIndex);
    expect(source).toContain('age:(manager.age ?? 45) + 1');
  });

  it('P7 WP4: keeps nextJobSecurity driven only by the single sporting objective — the weighted board contract is a separate, additive judgment never blended into the live job-security number', () => {
    const source = functionBody('processEndOfSeason');
    expect(source).toContain('nextJobSecurity(save.jobSecurity, objectiveResult.met, objectiveResult.margin)');
    expect(source).toContain('const sacked = newJobSecurity <= 0');
    // boardContractResult must be computed strictly after sacked/newJobSecurity, never feeding them.
    const contractIndex = source.indexOf('evaluateBoardContractSeasonClose(');
    const sackedIndex = source.indexOf('const sacked = newJobSecurity <= 0');
    expect(contractIndex).toBeGreaterThan(sackedIndex);
    expect(source).toContain('summary.dismissalRecommended = Boolean(boardContractResult?.dismissalRecommended)');
  });

  it('P7 WP5: evolves club philosophy from the season\'s board-contract outcome before generating next season\'s board contract, and records a compact identity/finance snapshot in season history', () => {
    const source = functionBody('processEndOfSeason');
    const evolveIndex = source.indexOf('evolveClubPhilosophy(userTeamUpdated.philosophy, boardContractResult)');
    const nextContractIndex = source.indexOf('generateBoardContract(userTeamUpdated, userNewLeague)');
    expect(evolveIndex).toBeGreaterThan(-1);
    expect(nextContractIndex).toBeGreaterThan(evolveIndex);
    expect(source).toContain('summary.clubIdentity');
    expect(source).toContain('financialPressure(userTeamRec)');
    // Same fact src/validate.js's legacy "Season end sets a fresh objective
    // for next season" check looks for — its fixed-size text window can no
    // longer see this far into the function; this Vitest assertion covers
    // the real, untruncated source (see validate_p0.py's allow-list entry).
    expect(source).toContain('generateBoardObjective(userTeamUpdated');
  });

  it('P7: still evaluates the outgoing sporting objective and still calls runYouthIntake — validate.js\'s legacy checks for both can no longer see this far into a function P7 has kept growing, so this Vitest assertion is their real replacement contract', () => {
    const source = functionBody('processEndOfSeason');
    expect(source).toContain('evaluateBoardObjective(save.boardObjective');
    expect(source).toContain('nextJobSecurity(save.jobSecurity');
    expect(source).toContain('runYouthIntake(save, allTeamsForAcademy)');
  });

  it('compacts the outgoing competition ledger and seeds a fresh P1 world for the next season', () => {
    const source = functionBody('processEndOfSeason');
    const historyIndex = source.indexOf('buildLivingWorldSeasonSummary');
    const saveIndex = source.indexOf('const newSave = {');
    expect(historyIndex).toBeGreaterThan(-1);
    expect(saveIndex).toBeGreaterThan(historyIndex);
    expect(source).toContain('worldCompetitions:buildWorldCompetitionState(allTeamsRefreshed, nextSeason, save.userTeamId, 1)');
    expect(source).not.toContain('worldCompetitions:save.worldCompetitions');
  });
});
