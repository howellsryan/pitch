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
    expect(source).toContain("budget:(team.budget ?? 0) - bill");
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
